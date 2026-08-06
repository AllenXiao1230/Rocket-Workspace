import { NextResponse } from "next/server";
import { WorkspaceRole } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function ownerAccess(userId: string, workspaceId: string) {
  return prisma.membership.findFirst({ where: { userId, workspaceId, role: { in: ["OWNER", "ADMIN"] } } });
}
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const membership = await prisma.membership.findFirst({ where: { userId: session.user.id, workspaceId: id } });
  if (!membership) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const members = await prisma.membership.findMany({ where: { workspaceId: id }, include: { user: { select: { id: true, email: true, name: true, avatarEmoji: true } } }, orderBy: { nickname: "asc" } });
  return NextResponse.json(members);
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; if (!await ownerAccess(session.user.id, id)) return NextResponse.json({ error: "Owner or admin role required" }, { status: 403 });
  const input = z.object({ email: z.string().email(), nickname: z.string().trim().min(1).max(40).optional(), teamGroup: z.string().trim().min(1).max(60).optional(), jobTitle: z.string().trim().min(1).max(80).optional(), role: z.nativeEnum(WorkspaceRole).default(WorkspaceRole.VIEWER) }).safeParse(await request.json());
  if (!input.success) return NextResponse.json({ error: "Invalid member" }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { email: input.data.email.toLowerCase() } });
  if (!user) return NextResponse.json({ error: "Create the user account before adding a membership" }, { status: 404 });
  const member = await prisma.membership.upsert({ where: { userId_workspaceId: { userId: user.id, workspaceId: id } }, update: { role: input.data.role, nickname: input.data.nickname, teamGroup: input.data.teamGroup, jobTitle: input.data.jobTitle }, create: { userId: user.id, workspaceId: id, role: input.data.role, nickname: input.data.nickname, teamGroup: input.data.teamGroup, jobTitle: input.data.jobTitle }, include: { user: { select: { id: true, email: true, name: true, avatarEmoji: true } } } });
  return NextResponse.json(member, { status: 201 });
}
