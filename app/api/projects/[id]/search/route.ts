import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { projectAccess } from "@/lib/permissions";
import { readDocumentMarkdown } from "@/lib/document-storage";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const access = await projectAccess(session.user.id, id); if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const q = new URL(request.url).searchParams.get("q")?.trim(); if (!q) return NextResponse.json([]);
  const candidates = await prisma.document.findMany({ where: { projectId: id, deletedAt: null }, select: { id: true, title: true, updatedAt: true }, take: 200, orderBy: { updatedAt: "desc" } });
  const lower = q.toLowerCase(); const matched = await Promise.all(candidates.map(async (document) => ({ document, markdown: await readDocumentMarkdown(document) })));
  const documents = matched.filter(({ document, markdown }) => document.title.toLowerCase().includes(lower) || markdown?.toLowerCase().includes(lower)).slice(0, 20).map(({ document }) => document);
  const databases = await prisma.database.findMany({ where: { projectId: id, name: { contains: q, mode: "insensitive" } }, select: { id: true, name: true, updatedAt: true }, take: 20, orderBy: { updatedAt: "desc" } });
  return NextResponse.json([...documents.map((item) => ({ ...item, type: "document" })), ...databases.map((item) => ({ id: item.id, title: item.name, updatedAt: item.updatedAt, type: "database" }))]);
}
