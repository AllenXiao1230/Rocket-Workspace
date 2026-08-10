import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, databaseAccess } from "@/lib/permissions";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const access = await databaseAccess(session.user.id, id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await prisma.database.findUnique({ where: { id }, include: { properties: { where: { deletedAt: null }, orderBy: { position: "asc" } }, views: { orderBy: { position: "asc" } }, templates: { orderBy: { name: "asc" } }, automations: { orderBy: { createdAt: "desc" } } } }));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const access = await databaseAccess(session.user.id, id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 }); if (!canWrite(access.membership.role)) return NextResponse.json({ error: "Read-only role" }, { status: 403 });
  const parsed = z.object({ name: z.string().trim().min(1).max(120).optional() }).safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid database" }, { status: 400 });
  const database = await prisma.database.update({ where: { id }, data: parsed.data });
  await prisma.auditEvent.create({ data: { userId: session.user.id, action: "database.updated", entity: "database", entityId: id, workspaceId: access.database.project.workspaceId, projectId: access.database.projectId, metadata: { changes: parsed.data } } });
  return NextResponse.json(database);
}
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const access = await databaseAccess(session.user.id, id);
  if (!access || !["OWNER", "ADMIN"].includes(access.membership.role)) return NextResponse.json({ error: "只有擁有者或管理員可永久刪除資料庫" }, { status: 403 });
  await prisma.database.delete({ where: { id } });
  await prisma.auditEvent.create({ data: { userId: session.user.id, action: "database.deleted", entity: "database", entityId: id, workspaceId: access.database.project.workspaceId, projectId: access.database.projectId, metadata: { irreversible: true } } });
  return NextResponse.json({ ok: true });
}
