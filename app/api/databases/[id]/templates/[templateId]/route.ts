import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, databaseAccess } from "@/lib/permissions";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; templateId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, templateId } = await params; const access = await databaseAccess(session.user.id, id);
  if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const deleted = await prisma.databaseTemplate.deleteMany({ where: { id: templateId, databaseId: id } }); if (!deleted.count) return NextResponse.json({ error: "Not found" }, { status: 404 }); await prisma.auditEvent.create({ data: { userId: session.user.id, action: "database_template.deleted", entity: "database_template", entityId: templateId, metadata: { databaseId: id } } }); return NextResponse.json({ ok: true });
}
