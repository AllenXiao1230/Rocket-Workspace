import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, documentAccess } from "@/lib/permissions";

const updateSchema = z.object({ content: z.string().max(50_000) });

async function accessFor(userId: string, documentId: string, blockId: string) {
  const access = await documentAccess(userId, documentId);
  if (!access) return null;
  const block = await prisma.documentSyncBlock.findFirst({
    where: {
      id: blockId,
      projectId: access.document.projectId,
      links: { some: { documentId } },
    },
  });
  return block ? { access, block } : null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; blockId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, blockId } = await params;
  const result = await accessFor(session.user.id, id, blockId);
  if (!result || !canWrite(result.access.membership.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const input = updateSchema.safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json({ error: "同步區塊內容不正確" }, { status: 400 });
  return NextResponse.json(
    await prisma.documentSyncBlock.update({
      where: { id: blockId },
      data: { content: input.data.content },
    }),
  );
}
