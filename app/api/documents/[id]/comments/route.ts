import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, documentAccess } from "@/lib/permissions";

const createSchema = z.object({ body: z.string().trim().min(1).max(10_000), parentId: z.string().optional().nullable() });
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const access = await documentAccess(session.user.id, id); if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const comments = await prisma.documentComment.findMany({ where: { documentId: id }, include: { author: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } });
  return NextResponse.json(comments);
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const access = await documentAccess(session.user.id, id); if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "Invalid comment" }, { status: 400 });
  if (parsed.data.parentId) { const parent = await prisma.documentComment.findFirst({ where: { id: parsed.data.parentId, documentId: id } }); if (!parent) return NextResponse.json({ error: "Invalid parent comment" }, { status: 400 }); }
  const comment = await prisma.documentComment.create({ data: { documentId: id, authorId: session.user.id, body: parsed.data.body, parentId: parsed.data.parentId }, include: { author: { select: { id: true, name: true } } } });
  await prisma.notification.create({ data: { userId: session.user.id, title: "Comment added", body: parsed.data.body.slice(0, 140), href: `/?document=${id}` } });
  return NextResponse.json(comment, { status: 201 });
}
