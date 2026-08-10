import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { attachmentBucket, GetObjectCommand, objectStorage } from "@/lib/object-storage";
import { enqueueAttachmentUpload, processAttachmentSyncJob } from "@/lib/attachment-sync";
import { prisma } from "@/lib/prisma";
import { canWrite, documentAccess } from "@/lib/permissions";
import { readWorkspaceSettings } from "@/lib/workspace-settings";
import { inspectUploadedFile } from "@/lib/file-signature";

const maxAttachmentBytes = Number(process.env.MAX_ATTACHMENT_BYTES || 10 * 1024 * 1024);
const allowedMimeTypes = new Set((process.env.ALLOWED_ATTACHMENT_MIME_TYPES || "").split(",").map((type) => type.trim()).filter(Boolean));

function safeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "attachment";
}

async function currentUser() {
  const session = await auth();
  return session?.user?.id || null;
}

export async function GET(request: Request) {
  const userId = await currentUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const documentId = url.searchParams.get("documentId");
  const attachmentId = url.searchParams.get("id");

  if (documentId) {
    const access = await documentAccess(userId, documentId);
    if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const attachments = await prisma.attachment.findMany({
      where: { documentId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, filename: true, mimeType: true, size: true, createdAt: true, syncStatus: true },
    });
    return NextResponse.json(attachments);
  }

  if (!attachmentId) return NextResponse.json({ error: "documentId or id required" }, { status: 400 });
  const attachment = await prisma.attachment.findFirst({ where: { id: attachmentId, deletedAt: null } });
  if (!attachment?.documentId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await documentAccess(userId, attachment.documentId);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (attachment.syncStatus !== "READY") return NextResponse.json({ error: "Attachment is still synchronizing" }, { status: 409 });

  try {
    const object = await objectStorage.send(new GetObjectCommand({ Bucket: attachmentBucket, Key: attachment.storageKey }));
    if (!object.Body) return NextResponse.json({ error: "Attachment data unavailable" }, { status: 404 });
    const stream = object.Body.transformToWebStream();
    return new NextResponse(stream, {
      headers: {
        "Content-Type": attachment.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Attachment data unavailable" }, { status: 404 });
  }
}

export async function POST(request: Request) {
  const userId = await currentUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await request.formData();
  const file = data.get("file");
  const documentId = data.get("documentId");
  if (!(file instanceof File) || typeof documentId !== "string") return NextResponse.json({ error: "file and documentId required" }, { status: 400 });
  if (!file.size) return NextResponse.json({ error: "Cannot upload an empty file" }, { status: 400 });
  if (!Number.isFinite(maxAttachmentBytes) || file.size > maxAttachmentBytes) return NextResponse.json({ error: `File exceeds the ${Math.floor(maxAttachmentBytes / 1024 / 1024)} MB upload limit` }, { status: 413 });
  const access = await documentAccess(userId, documentId);
  if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await readWorkspaceSettings(access.document.project.workspaceId)).security.attachmentsEnabled) return NextResponse.json({ error: "管理者已停用附件上傳" }, { status: 403 });

  const storageKey = `${access.document.projectId}/${documentId}/${crypto.randomUUID()}-${safeFilename(file.name)}`;
  const payload = Buffer.from(await file.arrayBuffer());
  let upload;
  try { upload = inspectUploadedFile(payload, file.type); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "無法驗證檔案內容" }, { status: 415 }); }
  if (allowedMimeTypes.size && !allowedMimeTypes.has(upload.mimeType)) return NextResponse.json({ error: "This file type is not allowed" }, { status: 415 });
  const attachment = await prisma.$transaction(async (tx) => {
    const created = await tx.attachment.create({ data: { documentId, filename: file.name, mimeType: upload.mimeType, size: file.size, storageKey } });
    await enqueueAttachmentUpload(tx, created.id, payload);
    await tx.auditEvent.create({ data: { action: "attachment.upload_queued", entity: "attachment", entityId: created.id, userId, workspaceId: access.document.project.workspaceId, projectId: access.document.projectId, metadata: { documentId, filename: created.filename, size: created.size } } });
    return created;
  });
  await processAttachmentSyncJob(attachment.id);
  const synced = await prisma.attachment.findUnique({ where: { id: attachment.id } });
  return NextResponse.json(synced || attachment, { status: synced?.syncStatus === "READY" ? 201 : 202 });
}

export async function DELETE(request: Request) {
  const userId = await currentUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const attachmentId = new URL(request.url).searchParams.get("id");
  if (!attachmentId) return NextResponse.json({ error: "id required" }, { status: 400 });
  const attachment = await prisma.attachment.findFirst({ where: { id: attachmentId, deletedAt: null } });
  if (!attachment?.documentId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await documentAccess(userId, attachment.documentId);
  if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const deletionBatchId = crypto.randomUUID();
    await prisma.attachment.update({ where: { id: attachment.id }, data: { deletedAt: new Date(), deletionBatchId } });
    await prisma.auditEvent.create({ data: { action: "attachment.trashed", entity: "attachment", entityId: attachment.id, userId, workspaceId: access.document.project.workspaceId, projectId: access.document.projectId, metadata: { documentId: attachment.documentId, filename: attachment.filename, deletionBatchId } } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not remove attachment. Please try again." }, { status: 502 });
  }
}
