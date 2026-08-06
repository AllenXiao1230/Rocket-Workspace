import { NextResponse } from "next/server";
import { WorkspaceRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readWorkspaceSettings } from "@/lib/workspace-settings";

const schema = z.object({ name: z.string().trim().min(1).max(80), email: z.string().email(), password: z.string().min(1).max(128), nickname: z.string().trim().min(1).max(40).optional(), teamGroup: z.string().trim().min(1).max(60).optional(), jobTitle: z.string().trim().min(1).max(80).optional(), role: z.nativeEnum(WorkspaceRole).default(WorkspaceRole.VIEWER) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const requester = await prisma.membership.findFirst({ where: { userId: session.user.id, workspaceId: id, role: { in: ["OWNER", "ADMIN"] } } });
  if (!requester) return NextResponse.json({ error: "Owner or admin role required" }, { status: 403 });
  const security = (await readWorkspaceSettings(id)).security;
  if (!security.accountProvisioningEnabled) return NextResponse.json({ error: "管理者已停用網頁建立帳號" }, { status: 403 });
  const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "帳號資料不完整；初始密碼至少需要 12 個字元" }, { status: 400 });
  if (parsed.data.password.length < security.minimumPasswordLength) return NextResponse.json({ error: `初始密碼至少需要 ${security.minimumPasswordLength} 個字元` }, { status: 400 });
  if (requester.role !== "OWNER" && parsed.data.role === "OWNER") return NextResponse.json({ error: "只有擁有者可以建立其他擁有者帳號" }, { status: 403 });
  const email = parsed.data.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) return NextResponse.json({ error: "這個電子郵件已經有帳號，請使用『加入既有帳號』" }, { status: 409 });
  const member = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { name: parsed.data.name, email, passwordHash: await bcrypt.hash(parsed.data.password, 12), mustChangePassword: security.forcePasswordChangeOnNewAccount } });
    const membership = await tx.membership.create({ data: { userId: user.id, workspaceId: id, role: parsed.data.role, nickname: parsed.data.nickname, teamGroup: parsed.data.teamGroup, jobTitle: parsed.data.jobTitle }, include: { user: { select: { id: true, name: true, email: true } } } });
    await tx.auditEvent.create({ data: { userId: session.user.id, action: "workspace.account_created", entity: "membership", entityId: membership.id, workspaceId: id, metadata: { role: parsed.data.role } } });
    return membership;
  });
  return NextResponse.json(member, { status: 201 });
}
