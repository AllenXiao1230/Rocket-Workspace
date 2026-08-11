import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { documentAccess } from "@/lib/permissions";
import { readDocumentMarkdown } from "@/lib/document-storage";
import { lineDiff } from "@/lib/text-diff";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string; revisionId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, revisionId } = await params;
  const access = await documentAccess(session.user.id, id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const revision = await prisma.documentRevision.findFirst({
    where: { id: revisionId, documentId: id },
  });
  if (!revision) return NextResponse.json({ error: "版本不存在" }, { status: 404 });
  const current = await readDocumentMarkdown(access.document);
  return NextResponse.json({
    revisionId,
    lines: lineDiff(revision.markdown || "", current || ""),
  });
}
