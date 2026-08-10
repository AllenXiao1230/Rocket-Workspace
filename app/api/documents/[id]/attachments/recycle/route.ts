import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canWrite, documentAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { enqueueAttachmentDelete } from "@/lib/attachment-sync";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const access = await documentAccess(session.user.id, id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await prisma.attachment.findMany({ where: { documentId: id, deletedAt: { not: null } }, select: { id: true, filename: true, mimeType: true, size: true, createdAt: true, deletedAt: true, deletionBatchId: true }, orderBy: { deletedAt: "desc" } }));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const access = await documentAccess(session.user.id, id);
  if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null); const attachmentId = typeof body?.attachmentId === "string" ? body.attachmentId : "";
  if (!attachmentId) return NextResponse.json({ error: "attachmentId required" }, { status: 400 });
  const restored = await prisma.attachment.updateMany({ where: { id: attachmentId, documentId: id, deletedAt: { not: null } }, data: { deletedAt: null, deletionBatchId: null } });
  if (!restored.count) return NextResponse.json({ error: "找不到可還原的附件" }, { status: 404 });
  await prisma.auditEvent.create({ data: { action: "attachment.restored", entity: "attachment", entityId: attachmentId, userId: session.user.id, workspaceId: access.document.project.workspaceId, projectId: access.document.projectId, metadata: { documentId: id } } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const access = await documentAccess(session.user.id, id);
  if (!access || !["OWNER", "ADMIN"].includes(access.membership.role)) return NextResponse.json({ error: "只有擁有者或管理員可永久刪除附件" }, { status: 403 });
  const attachmentId = new URL(request.url).searchParams.get("attachmentId") || "";
  const attachment = await prisma.attachment.findFirst({ where: { id: attachmentId, documentId: id, deletedAt: { not: null } } });
  if (!attachment) return NextResponse.json({ error: "找不到可永久刪除的附件" }, { status: 404 });
  await prisma.$transaction(async (tx) => {
    await enqueueAttachmentDelete(tx, attachment.id);
    await tx.auditEvent.create({ data: { action: "attachment.purge_queued", entity: "attachment", entityId: attachment.id, userId: session.user.id, workspaceId: access.document.project.workspaceId, projectId: access.document.projectId, metadata: { documentId: id, filename: attachment.filename, irreversible: true } } });
  });
  return NextResponse.json({ ok: true, pending: true }, { status: 202 });
}
