import { NextResponse } from "next/server";
import { DocumentSyncAction, Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, projectAccess } from "@/lib/permissions";
import { enqueueDocumentSync } from "@/lib/document-sync";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const access = await projectAccess(session.user.id, id);
  if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = z.object({ title: z.string().trim().min(1).max(180), icon: z.string().trim().min(1).max(16).optional(), parentId: z.string().optional().nullable(), templateId: z.string().cuid().nullable().optional() }).safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid document" }, { status: 400 });
  if (parsed.data.parentId) {
    const parent = await prisma.document.findFirst({ where: { id: parsed.data.parentId, projectId: id, deletedAt: null } });
    if (!parent) return NextResponse.json({ error: "Invalid parent document" }, { status: 400 });
  }
  const template = parsed.data.templateId ? await prisma.documentTemplate.findFirst({ where: { id: parsed.data.templateId, projectId: id } }) : null;
  if (parsed.data.templateId && !template) return NextResponse.json({ error: "文件模板不存在" }, { status: 400 });
  const max = await prisma.document.aggregate({ where: { projectId: id, parentId: parsed.data.parentId ?? null, deletedAt: null }, _max: { position: true } });
  const document = await prisma.$transaction(async (tx) => { const created = await tx.document.create({ data: { projectId: id, parentId: parsed.data.parentId ?? null, title: parsed.data.title, icon: parsed.data.icon || template?.icon || "📄", content: template?.content as Prisma.InputJsonValue || undefined, properties: template?.properties as Prisma.InputJsonValue || undefined, position: (max._max.position ?? -1) + 1 } }); await enqueueDocumentSync(tx, created.id, DocumentSyncAction.WRITE); return created; });
  return NextResponse.json(document, { status: 201 });
}
