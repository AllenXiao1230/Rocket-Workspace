import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { documentAccess } from "@/lib/permissions";
import { readDocumentMarkdownSnapshot, writeDocumentMarkdown } from "@/lib/document-storage";
import { prisma } from "@/lib/prisma";
import { readSecuritySettings } from "@/lib/runtime-settings";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const access = await documentAccess(session.user.id, id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let snapshot = await readDocumentMarkdownSnapshot(access.document);
  if (!snapshot) { await writeDocumentMarkdown(access.document); snapshot = await readDocumentMarkdownSnapshot(access.document); }
  if (!snapshot) return NextResponse.json({ error: "Markdown unavailable" }, { status: 500 });
  const trackingInitialized = !access.document.markdownHash;
  if (trackingInitialized) await prisma.document.update({ where: { id: access.document.id }, data: { markdownHash: snapshot.contentHash, markdownBase: snapshot.markdown } });
  const externalChanged = !trackingInitialized && access.document.markdownHash !== snapshot.contentHash;
  if (request.nextUrl.searchParams.get("download") === "1") {
    if (!(await readSecuritySettings()).markdownDownloadEnabled) return NextResponse.json({ error: "管理者已停用 Markdown 下載" }, { status: 403 });
    return new NextResponse(snapshot.raw, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${access.document.id}.md"`, ETag: `\"${snapshot.hash}\"` } });
  }
  return NextResponse.json({ markdown: snapshot.markdown, baseMarkdown: externalChanged ? access.document.markdownBase || "" : undefined, hash: snapshot.hash, modifiedAt: snapshot.modifiedAt, externalChanged, trackingInitialized }, { headers: { ETag: `\"${snapshot.hash}\"` } });
}
