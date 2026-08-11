import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { DocumentSyncAction, Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, documentAccess } from "@/lib/permissions";
import { readDocumentMarkdown } from "@/lib/document-storage";
import { enqueueDocumentSync } from "@/lib/document-sync";
import { hasOnlySafeDocumentMedia } from "@/lib/document-content";

const updateSchema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  icon: z.string().trim().min(1).max(16).optional(),
  parentId: z.string().cuid().nullable().optional(),
  position: z.number().int().min(0).max(100_000).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
  markdown: z.string().max(2_000_000).optional(),
});
export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const access = await documentAccess(session.user.id, id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    id: access.document.id,
    title: access.document.title,
    icon: access.document.icon,
    content: access.document.content,
    markdown: await readDocumentMarkdown(access.document),
  });
}
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const access = await documentAccess(session.user.id, id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canWrite(access.membership.role))
    return NextResponse.json({ error: "Read-only role" }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid document" }, { status: 400 });
  if (parsed.data.content && !hasOnlySafeDocumentMedia(parsed.data.content))
    return NextResponse.json(
      { error: "圖片與嵌入內容僅接受有效的 HTTPS 網址" },
      { status: 400 },
    );
  const prior = access.document;
  const priorMarkdown = await readDocumentMarkdown(prior);
  if (
    prior.lockedById &&
    prior.lockedById !== session.user.id &&
    !["OWNER", "ADMIN"].includes(access.membership.role)
  )
    return NextResponse.json({ error: "文件已被其他成員鎖定" }, { status: 423 });
  if (parsed.data.parentId === id)
    return NextResponse.json({ error: "頁面不能成為自己的子頁面" }, { status: 400 });
  if (parsed.data.parentId) {
    const parent = await prisma.document.findFirst({
      where: { id: parsed.data.parentId, projectId: prior.projectId, deletedAt: null },
    });
    if (!parent) return NextResponse.json({ error: "無效的父頁面" }, { status: 400 });
    let cursor: typeof parent | null = parent;
    while (cursor?.parentId) {
      if (cursor.parentId === id)
        return NextResponse.json({ error: "不能移動到自己的子頁面下" }, { status: 400 });
      cursor = await prisma.document.findUnique({ where: { id: cursor.parentId } });
    }
  }
  const document = await prisma.$transaction(async (tx) => {
    if (parsed.data.parentId !== undefined || parsed.data.position !== undefined) {
      const nextParentId =
        parsed.data.parentId === undefined ? prior.parentId : parsed.data.parentId;
      const siblings = await tx.document.findMany({
        where: {
          projectId: prior.projectId,
          parentId: nextParentId,
          id: { not: id },
          deletedAt: null,
        },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      });
      const index = Math.min(parsed.data.position ?? siblings.length, siblings.length);
      const ordered = [...siblings];
      ordered.splice(index, 0, prior);
      await Promise.all(
        ordered.map((item, position) =>
          tx.document.update({
            where: { id: item.id },
            data: { parentId: item.id === id ? nextParentId : undefined, position },
          }),
        ),
      );
    }
    const latest = await tx.documentRevision.findFirst({
      where: { documentId: id },
      orderBy: { createdAt: "desc" },
    });
    if (
      (parsed.data.title !== undefined || parsed.data.content !== undefined) &&
      (!latest || latest.createdAt.getTime() < Date.now() - 5 * 60_000)
    )
      await tx.documentRevision.create({
        data: {
          documentId: id,
          authorId: session.user.id,
          title: prior.title,
          content: prior.content as Prisma.InputJsonValue,
          markdown: priorMarkdown,
        },
      });
    const updated = await tx.document.update({
      where: { id },
      data: {
        title: parsed.data.title,
        icon: parsed.data.icon,
        content: parsed.data.content as Prisma.InputJsonValue | undefined,
      },
    });
    await enqueueDocumentSync(
      tx,
      id,
      DocumentSyncAction.WRITE,
      parsed.data.markdown ?? null,
    );
    return updated;
  });
  await prisma.auditEvent.create({
    data: {
      userId: session.user.id,
      action: "document.updated",
      entity: "document",
      entityId: id,
      workspaceId: access.document.project.workspaceId,
      projectId: prior.projectId,
    },
  });
  const documents = await prisma.document.findMany({
    where: { projectId: prior.projectId, deletedAt: null },
    select: { id: true, parentId: true, position: true },
  });
  return NextResponse.json({
    id: document.id,
    icon: document.icon,
    parentId: document.parentId,
    position: document.position,
    updatedAt: document.updatedAt,
    documents,
  });
}
export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const access = await documentAccess(session.user.id, id);
  if (!access || !canWrite(access.membership.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const documents = await prisma.document.findMany({
    where: { projectId: access.document.projectId, deletedAt: null },
    select: { id: true, parentId: true },
  });
  const childMap = documents.reduce<Record<string, string[]>>((map, document) => {
    if (document.parentId) (map[document.parentId] ||= []).push(document.id);
    return map;
  }, {});
  const removedIds: string[] = [];
  const pending = [id];
  while (pending.length) {
    const current = pending.pop();
    if (!current) continue;
    removedIds.push(current);
    pending.push(...(childMap[current] || []));
  }
  const locked = await prisma.document.findFirst({
    where: {
      id: { in: removedIds },
      lockedById: { not: null },
      NOT: { lockedById: session.user.id },
    },
  });
  if (locked && !["OWNER", "ADMIN"].includes(access.membership.role))
    return NextResponse.json(
      { error: "此頁面或子頁面已被其他成員鎖定" },
      { status: 423 },
    );
  const deletionBatchId = crypto.randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.document.updateMany({
      where: { id: { in: removedIds } },
      data: { deletedAt: new Date(), deletionBatchId },
    });
    await Promise.all(
      removedIds.map((documentId) =>
        enqueueDocumentSync(tx, documentId, DocumentSyncAction.DELETE),
      ),
    );
  });
  await prisma.auditEvent.create({
    data: {
      userId: session.user.id,
      action: "document.trashed",
      entity: "document",
      entityId: id,
      workspaceId: access.document.project.workspaceId,
      projectId: access.document.projectId,
      metadata: { deletionBatchId, descendantCount: Math.max(0, removedIds.length - 1) },
    },
  });
  return NextResponse.json({ ok: true, removedIds, deletionBatchId });
}
