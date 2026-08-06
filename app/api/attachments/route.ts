import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { attachmentBucket, DeleteObjectCommand, GetObjectCommand, objectStorage, PutObjectCommand } from "@/lib/object-storage";
import { prisma } from "@/lib/prisma";
import { canWrite, documentAccess } from "@/lib/permissions";
import { readWorkspaceSettings } from "@/lib/workspace-settings";

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
      select: { id: true, filename: true, mimeType: true, size: true, createdAt: true },
    });
    return NextResponse.json(attachments);
  }

  if (!attachmentId) return NextResponse.json({ error: "documentId or id required" }, { status: 400 });
  const attachment = await prisma.attachment.findFirst({ where: { id: attachmentId, deletedAt: null } });
  if (!attachment?.documentId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await documentAccess(userId, attachment.documentId);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
  if (allowedMimeTypes.size && !allowedMimeTypes.has(file.type)) return NextResponse.json({ error: "This file type is not allowed" }, { status: 415 });
  const access = await documentAccess(userId, documentId);
  if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await readWorkspaceSettings(access.document.project.workspaceId)).security.attachmentsEnabled) return NextResponse.json({ error: "管理者已停用附件上傳" }, { status: 403 });

  const storageKey = `${access.document.projectId}/${documentId}/${crypto.randomUUID()}-${safeFilename(file.name)}`;
  try {
    await objectStorage.send(new PutObjectCommand({ Bucket: attachmentBucket, Key: storageKey, Body: Buffer.from(await file.arrayBuffer()), ContentType: file.type || "application/octet-stream" }));
    const attachment = await prisma.attachment.create({ data: { documentId, filename: file.name, mimeType: file.type || "application/octet-stream", size: file.size, storageKey } });
    await prisma.auditEvent.create({ data: { action: "attachment.uploaded", entity: "attachment", entityId: attachment.id, userId, metadata: { documentId, filename: attachment.filename, size: attachment.size } } });
    return NextResponse.json(attachment, { status: 201 });
  } catch {
    try { await objectStorage.send(new DeleteObjectCommand({ Bucket: attachmentBucket, Key: storageKey })); } catch { /* The cleanup job will handle an unreachable object store. */ }
    return NextResponse.json({ error: "Upload failed. The file was not attached." }, { status: 502 });
  }
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
    await prisma.auditEvent.create({ data: { action: "attachment.trashed", entity: "attachment", entityId: attachment.id, userId, metadata: { documentId: attachment.documentId, filename: attachment.filename, deletionBatchId } } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not remove attachment. Please try again." }, { status: 502 });
  }
}
