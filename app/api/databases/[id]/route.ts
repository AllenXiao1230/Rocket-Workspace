import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, databaseAccess } from "@/lib/permissions";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const access = await databaseAccess(session.user.id, id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 }); if (!canWrite(access.membership.role)) return NextResponse.json({ error: "Read-only role" }, { status: 403 });
  const parsed = z.object({ name: z.string().trim().min(1).max(120).optional() }).safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid database" }, { status: 400 });
  return NextResponse.json(await prisma.database.update({ where: { id }, data: parsed.data }));
}
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const access = await databaseAccess(session.user.id, id);
  if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await prisma.database.delete({ where: { id } }); return NextResponse.json({ ok: true });
}
