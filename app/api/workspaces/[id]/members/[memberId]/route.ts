import { NextResponse } from "next/server";
import { WorkspaceRole } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({ nickname: z.string().trim().min(1).max(40).nullable().optional(), teamGroup: z.string().trim().min(1).max(60).nullable().optional(), jobTitle: z.string().trim().min(1).max(80).nullable().optional(), role: z.nativeEnum(WorkspaceRole).optional() });

async function managerAccess(userId: string, workspaceId: string) { return prisma.membership.findFirst({ where: { userId, workspaceId, role: { in: ["OWNER", "ADMIN"] } } }); }
async function targetAccess(workspaceId: string, memberId: string) { return prisma.membership.findFirst({ where: { id: memberId, workspaceId } }); }

function canChangeOwner(requester: WorkspaceRole, target: WorkspaceRole, next?: WorkspaceRole) { return requester === "OWNER" || (target !== "OWNER" && next !== "OWNER"); }

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; memberId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "尚未登入" }, { status: 401 });
  const { id, memberId } = await params; const requester = await managerAccess(session.user.id, id); const target = await targetAccess(id, memberId);
  if (!requester || !target) return NextResponse.json({ error: "找不到成員或沒有管理權限" }, { status: 404 });
  const input = updateSchema.safeParse(await request.json().catch(() => null)); if (!input.success) return NextResponse.json({ error: "成員資料不正確" }, { status: 400 });
  if (!canChangeOwner(requester.role, target.role, input.data.role)) return NextResponse.json({ error: "只有擁有者能變更擁有者角色" }, { status: 403 });
  if (target.role === "OWNER" && input.data.role && input.data.role !== "OWNER" && await prisma.membership.count({ where: { workspaceId: id, role: "OWNER" } }) <= 1) return NextResponse.json({ error: "工作空間至少要保留一位擁有者" }, { status: 400 });
  const member = await prisma.membership.update({ where: { id: memberId }, data: input.data, include: { user: { select: { id: true, email: true, name: true } } } });
  await prisma.auditEvent.create({ data: { userId: session.user.id, action: "workspace.member_updated", entity: "membership", entityId: memberId, workspaceId: id, metadata: { changes: input.data } } });
  return NextResponse.json(member);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; memberId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "尚未登入" }, { status: 401 });
  const { id, memberId } = await params; const requester = await managerAccess(session.user.id, id); const target = await targetAccess(id, memberId);
  if (!requester || !target) return NextResponse.json({ error: "找不到成員或沒有管理權限" }, { status: 404 });
  if (!canChangeOwner(requester.role, target.role)) return NextResponse.json({ error: "只有擁有者能移除擁有者" }, { status: 403 });
  if (target.role === "OWNER" && await prisma.membership.count({ where: { workspaceId: id, role: "OWNER" } }) <= 1) return NextResponse.json({ error: "工作空間至少要保留一位擁有者" }, { status: 400 });
  await prisma.membership.delete({ where: { id: memberId } });
  await prisma.auditEvent.create({ data: { userId: session.user.id, action: "workspace.member_removed", entity: "membership", entityId: memberId, workspaceId: id, metadata: { removedUserId: target.userId, role: target.role } } });
  return NextResponse.json({ ok: true });
}
