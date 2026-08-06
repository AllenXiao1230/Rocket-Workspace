import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, documentAccess } from "@/lib/permissions";
import { readDocumentMarkdown, writeDocumentMarkdown } from "@/lib/document-storage";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const access = await documentAccess(session.user.id, id);
  if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const source = access.document;
  const markdown = await readDocumentMarkdown(source);
  const max = await prisma.document.aggregate({ where: { projectId: source.projectId, parentId: source.parentId, deletedAt: null }, _max: { position: true } });
  const document = await prisma.document.create({ data: { projectId: source.projectId, parentId: source.parentId, title: `${source.title} 副本`, icon: source.icon, content: source.content as never, position: (max._max.position ?? -1) + 1 } });
  await writeDocumentMarkdown(document, markdown ?? undefined);
  await prisma.auditEvent.create({ data: { userId: session.user.id, action: "document.duplicated", entity: "document", entityId: document.id } });
  return NextResponse.json(document, { status: 201 });
}
