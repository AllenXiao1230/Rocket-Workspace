import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, databaseAccess } from "@/lib/permissions";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; automationId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, automationId } = await params; const access = await databaseAccess(session.user.id, id);
  if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const deleted = await prisma.databaseAutomation.deleteMany({ where: { id: automationId, databaseId: id } }); if (!deleted.count) return NextResponse.json({ error: "Not found" }, { status: 404 }); return NextResponse.json({ ok: true });
}
