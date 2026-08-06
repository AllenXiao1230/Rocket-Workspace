import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(12).max(128) }).refine((value) => value.currentPassword !== value.newPassword, { message: "新密碼不可與目前密碼相同", path: ["newPassword"] });

export async function POST(request: Request) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "新密碼至少需要 12 個字元，且不可與目前密碼相同" }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !await bcrypt.compare(parsed.data.currentPassword, user.passwordHash)) return NextResponse.json({ error: "目前密碼不正確" }, { status: 400 });
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 12), mustChangePassword: false } });
  await prisma.auditEvent.create({ data: { userId: user.id, action: "account.password_changed", entity: "user", entityId: user.id } });
  return NextResponse.json({ ok: true });
}
