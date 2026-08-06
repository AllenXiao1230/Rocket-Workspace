import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, projectAccess } from "@/lib/permissions";
import { readDocumentMarkdownSnapshot, writeDocumentMarkdown } from "@/lib/document-storage";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const access = await projectAccess(session.user.id, id);
  if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = z.object({ title: z.string().trim().min(1).max(180), icon: z.string().trim().min(1).max(16).optional(), parentId: z.string().optional().nullable() }).safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid document" }, { status: 400 });
  if (parsed.data.parentId) {
    const parent = await prisma.document.findFirst({ where: { id: parsed.data.parentId, projectId: id, deletedAt: null } });
    if (!parent) return NextResponse.json({ error: "Invalid parent document" }, { status: 400 });
  }
  const max = await prisma.document.aggregate({ where: { projectId: id, parentId: parsed.data.parentId ?? null, deletedAt: null }, _max: { position: true } });
  const document = await prisma.document.create({ data: { projectId: id, parentId: parsed.data.parentId ?? null, title: parsed.data.title, icon: parsed.data.icon || "📄", position: (max._max.position ?? -1) + 1 } });
  await writeDocumentMarkdown(document);
  const snapshot = await readDocumentMarkdownSnapshot(document);
  const saved = snapshot ? await prisma.document.update({ where: { id: document.id }, data: { markdownHash: snapshot.contentHash } }) : document;
  return NextResponse.json(saved, { status: 201 });
}
