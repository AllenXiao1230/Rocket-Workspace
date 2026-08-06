import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, documentAccess } from "@/lib/permissions";
import { readDocumentMarkdownSnapshot, writeDocumentMarkdown } from "@/lib/document-storage";

export async function POST(_: Request, { params }: { params: Promise<{ id: string; revisionId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, revisionId } = await params; const access = await documentAccess(session.user.id, id); if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const revision = await prisma.documentRevision.findFirst({ where: { id: revisionId, documentId: id } }); if (!revision) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const document = await prisma.document.update({ where: { id }, data: { title: revision.title, content: revision.content as Prisma.InputJsonValue } });
  await writeDocumentMarkdown(document, revision.markdown || undefined); const snapshot = await readDocumentMarkdownSnapshot(document); if (snapshot) await prisma.document.update({ where: { id }, data: { markdownHash: snapshot.contentHash, markdownBase: snapshot.markdown } }); await prisma.auditEvent.create({ data: { userId: session.user.id, action: "document.revision_restored", entity: "document", entityId: id, workspaceId: access.document.project.workspaceId, projectId: access.document.projectId, metadata: { revisionId } } });
  return NextResponse.json({ id: document.id, title: document.title, content: document.content, markdown: revision.markdown });
}
