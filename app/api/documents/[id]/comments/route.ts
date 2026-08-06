import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, documentAccess } from "@/lib/permissions";

const createSchema = z.object({ body: z.string().trim().min(1).max(10_000), parentId: z.string().optional().nullable() });
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const access = await documentAccess(session.user.id, id); if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const comments = await prisma.documentComment.findMany({
    where: { documentId: id, parentId: null },
    include: {
      author: { select: { id: true, name: true } },
      replies: { include: { author: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(comments.map((comment) => ({
    ...comment,
    isAuthor: comment.authorId === session.user.id,
    canManage: comment.authorId === session.user.id || access.membership.role === "OWNER" || access.membership.role === "ADMIN",
    replies: comment.replies.map((reply) => ({ ...reply, isAuthor: reply.authorId === session.user.id, canManage: reply.authorId === session.user.id || access.membership.role === "OWNER" || access.membership.role === "ADMIN" })),
  })));
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const access = await documentAccess(session.user.id, id); if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "Invalid comment" }, { status: 400 });
  const parent = parsed.data.parentId ? await prisma.documentComment.findFirst({ where: { id: parsed.data.parentId, documentId: id } }) : null;
  if (parsed.data.parentId && !parent) return NextResponse.json({ error: "Invalid parent comment" }, { status: 400 });
  const comment = await prisma.documentComment.create({ data: { documentId: id, authorId: session.user.id, body: parsed.data.body, parentId: parent ? (parent.parentId || parent.id) : null }, include: { author: { select: { id: true, name: true } } } });
  if (parent && parent.authorId !== session.user.id) {
    await prisma.notification.create({ data: { userId: parent.authorId, title: "文件留言有新回覆", body: parsed.data.body.slice(0, 140), href: `/?document=${id}` } });
  }
  return NextResponse.json({ ...comment, isAuthor: true, canManage: true }, { status: 201 });
}
