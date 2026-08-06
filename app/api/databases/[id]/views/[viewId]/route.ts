import { NextResponse } from "next/server";
import { DatabaseViewLayout, Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, databaseAccess } from "@/lib/permissions";

const schema = z.object({ name: z.string().trim().min(1).max(80).optional(), layout: z.nativeEnum(DatabaseViewLayout).optional(), config: z.record(z.string(), z.unknown()).nullable().optional(), filter: z.record(z.string(), z.unknown()).nullable().optional(), sort: z.record(z.string(), z.unknown()).nullable().optional() });
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; viewId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, viewId } = await params; const access = await databaseAccess(session.user.id, id);
  if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const view = await prisma.databaseView.findFirst({ where: { id: viewId, databaseId: id } }); if (!view) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "Invalid view" }, { status: 400 });
  const updated = await prisma.databaseView.update({ where: { id: viewId }, data: { ...parsed.data, config: parsed.data.config === undefined ? undefined : parsed.data.config === null ? Prisma.JsonNull : parsed.data.config as Prisma.InputJsonValue, filter: parsed.data.filter === undefined ? undefined : parsed.data.filter === null ? Prisma.JsonNull : parsed.data.filter as Prisma.InputJsonValue, sort: parsed.data.sort === undefined ? undefined : parsed.data.sort === null ? Prisma.JsonNull : parsed.data.sort as Prisma.InputJsonValue } });
  await prisma.auditEvent.create({ data: { userId: session.user.id, action: "database_view.updated", entity: "database_view", entityId: viewId, metadata: { databaseId: id, changedFields: Object.keys(parsed.data) } } });
  return NextResponse.json(updated);
}
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; viewId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, viewId } = await params; const access = await databaseAccess(session.user.id, id);
  if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const count = await prisma.databaseView.count({ where: { databaseId: id } }); if (count <= 1) return NextResponse.json({ error: "資料庫至少要保留一個檢視" }, { status: 400 });
  const deleted = await prisma.databaseView.deleteMany({ where: { id: viewId, databaseId: id } }); if (!deleted.count) return NextResponse.json({ error: "Not found" }, { status: 404 }); await prisma.auditEvent.create({ data: { userId: session.user.id, action: "database_view.deleted", entity: "database_view", entityId: viewId, metadata: { databaseId: id } } }); return NextResponse.json({ ok: true });
}
