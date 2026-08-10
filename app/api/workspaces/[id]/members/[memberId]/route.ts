import { NextResponse } from "next/server";
import { WorkspaceRole } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canChangeMembershipRole } from "@/lib/membership-permissions";

const updateSchema = z.object({ nickname: z.string().trim().min(1).max(40).nullable().optional(), teamGroup: z.string().trim().min(1).max(60).nullable().optional(), jobTitle: z.string().trim().min(1).max(80).nullable().optional(), role: z.nativeEnum(WorkspaceRole).optional() });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; memberId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "尚未登入" }, { status: 401 });
  const { id, memberId } = await params;
  const input = updateSchema.safeParse(await request.json().catch(() => null)); if (!input.success) return NextResponse.json({ error: "成員資料不正確" }, { status: 400 });
  try {
    const member = await prisma.$transaction(async (tx) => {
      const [requester, target] = await Promise.all([tx.membership.findFirst({ where: { userId: session.user.id, workspaceId: id, role: { in: ["OWNER", "ADMIN"] } } }), tx.membership.findFirst({ where: { id: memberId, workspaceId: id } })]);
      if (!requester || !target) throw new Error("NOT_FOUND");
      const nextRole = input.data.role || target.role;
      const ownerCount = target.role === "OWNER" && nextRole !== "OWNER" ? await tx.membership.count({ where: { workspaceId: id, role: "OWNER" } }) : 2;
      if (!canChangeMembershipRole(requester.role, target.role, nextRole, ownerCount)) throw new Error("OWNER_PROTECTED");
      const member = await tx.membership.update({ where: { id: memberId }, data: input.data, include: { user: { select: { id: true, email: true, name: true } } } });
      await tx.auditEvent.create({ data: { userId: session.user.id, action: "workspace.member_updated", entity: "membership", entityId: memberId, workspaceId: id, metadata: { changes: input.data } } });
      return member;
    }, { isolationLevel: "Serializable" });
    return NextResponse.json(member);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return NextResponse.json({ error: "找不到成員或沒有管理權限" }, { status: 404 });
    if (message === "OWNER_PROTECTED") return NextResponse.json({ error: "只有擁有者能變更擁有者角色，且工作空間至少要保留一位擁有者" }, { status: 403 });
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    return NextResponse.json({ error: code === "P2034" ? "成員資料剛被其他管理者變更，請重新整理後再試" : "無法儲存成員" }, { status: code === "P2034" ? 409 : 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; memberId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "尚未登入" }, { status: 401 });
  const { id, memberId } = await params;
  try {
    await prisma.$transaction(async (tx) => {
      const [requester, target] = await Promise.all([tx.membership.findFirst({ where: { userId: session.user.id, workspaceId: id, role: { in: ["OWNER", "ADMIN"] } } }), tx.membership.findFirst({ where: { id: memberId, workspaceId: id } })]);
      if (!requester || !target) throw new Error("NOT_FOUND");
      const ownerCount = target.role === "OWNER" ? await tx.membership.count({ where: { workspaceId: id, role: "OWNER" } }) : 2;
      if (!canChangeMembershipRole(requester.role, target.role, "VIEWER", ownerCount)) throw new Error("OWNER_PROTECTED");
      await tx.membership.delete({ where: { id: memberId } });
      await tx.auditEvent.create({ data: { userId: session.user.id, action: "workspace.member_removed", entity: "membership", entityId: memberId, workspaceId: id, metadata: { removedUserId: target.userId, role: target.role } } });
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return NextResponse.json({ error: "找不到成員或沒有管理權限" }, { status: 404 });
    if (message === "OWNER_PROTECTED") return NextResponse.json({ error: "只有擁有者能移除擁有者，且工作空間至少要保留一位擁有者" }, { status: 403 });
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    return NextResponse.json({ error: code === "P2034" ? "成員資料剛被其他管理者變更，請重新整理後再試" : "無法移除成員" }, { status: code === "P2034" ? 409 : 500 });
  }
}
