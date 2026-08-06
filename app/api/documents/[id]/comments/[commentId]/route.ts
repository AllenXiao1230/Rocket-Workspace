import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, documentAccess } from "@/lib/permissions";

const updateSchema = z.object({ resolved: z.boolean() });

async function commentForUser(userId: string, documentId: string, commentId: string) {
  const access = await documentAccess(userId, documentId);
  if (!access) return { access: null, comment: null };
  const comment = await prisma.documentComment.findFirst({ where: { id: commentId, documentId } });
  return { access, comment };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, commentId } = await params;
  const { access, comment } = await commentForUser(session.user.id, id, commentId);
  if (!access || !comment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  const updated = await prisma.documentComment.update({ where: { id: comment.id }, data: { resolvedAt: parsed.data.resolved ? new Date() : null } });
  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, commentId } = await params;
  const { access, comment } = await commentForUser(session.user.id, id, commentId);
  if (!access || !comment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const canManage = comment.authorId === session.user.id || access.membership.role === "OWNER" || access.membership.role === "ADMIN";
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await prisma.documentComment.delete({ where: { id: comment.id } });
  return NextResponse.json({ ok: true });
}
