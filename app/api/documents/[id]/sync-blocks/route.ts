import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, documentAccess } from "@/lib/permissions";

const createSchema = z.object({
  targetDocumentId: z.string().cuid(),
  content: z.string().max(50_000).default(""),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const access = await documentAccess(session.user.id, id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const blocks = await prisma.documentSyncBlock.findMany({
    where: { projectId: access.document.projectId, links: { some: { documentId: id } } },
    include: { links: { include: { document: { select: { id: true, title: true } } } } },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ blocks });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const access = await documentAccess(session.user.id, id);
  if (!access || !canWrite(access.membership.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const input = createSchema.safeParse(await request.json().catch(() => null));
  if (!input.success || input.data.targetDocumentId === id)
    return NextResponse.json({ error: "同步區塊資料不正確" }, { status: 400 });
  const target = await prisma.document.findFirst({
    where: {
      id: input.data.targetDocumentId,
      projectId: access.document.projectId,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!target) return NextResponse.json({ error: "目標文件不存在" }, { status: 404 });
  const block = await prisma.documentSyncBlock.create({
    data: {
      projectId: access.document.projectId,
      content: input.data.content,
      links: { create: [{ documentId: id }, { documentId: target.id }] },
    },
    include: { links: { include: { document: { select: { id: true, title: true } } } } },
  });
  return NextResponse.json(block, { status: 201 });
}
