import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const profileSchema = z.object({ name: z.string().trim().min(1).max(80).optional(), avatarEmoji: z.string().trim().min(1).max(16).nullable().optional() });

export async function GET() {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, name: true, email: true, avatarEmoji: true } });
  return NextResponse.json(user);
}

export async function PATCH(request: Request) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = profileSchema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "個人資料格式不正確" }, { status: 400 });
  const user = await prisma.user.update({ where: { id: session.user.id }, data: parsed.data, select: { id: true, name: true, email: true, avatarEmoji: true } });
  return NextResponse.json(user);
}
