import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, databaseAccess } from "@/lib/permissions";
import { applyRowAutomations } from "@/lib/database-automations";
import { AutomationTrigger } from "@prisma/client";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; rowId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, rowId } = await params; const access = await databaseAccess(session.user.id, id);
  if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const row = await prisma.databaseRow.findFirst({ where: { id: rowId, databaseId: id, deletedAt: null } }); if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => ({})); if (!body.values || typeof body.values !== "object" || Array.isArray(body.values)) return NextResponse.json({ error: "Invalid values" }, { status: 400 });
  const automated = await applyRowAutomations(id, AutomationTrigger.ROW_UPDATED, body.values, session.user.id);
  const max = await prisma.databaseRow.aggregate({ where: { databaseId: id, deletedAt: null }, _max: { position: true } });
  const [updated, ...createdRows] = await prisma.$transaction([prisma.databaseRow.update({ where: { id: rowId }, data: { values: automated.values } }), ...automated.createdRows.map((rowValues, index) => prisma.databaseRow.create({ data: { databaseId: id, values: rowValues, position: (max._max.position ?? -1) + index + 1 } }))]);
  return NextResponse.json({ ...updated, createdRows });
}
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; rowId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, rowId } = await params; const access = await databaseAccess(session.user.id, id);
  if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const deletionBatchId = crypto.randomUUID(); const deleted = await prisma.databaseRow.updateMany({ where: { id: rowId, databaseId: id, deletedAt: null }, data: { deletedAt: new Date(), deletionBatchId } }); if (!deleted.count) return NextResponse.json({ error: "Not found" }, { status: 404 }); await prisma.auditEvent.create({ data: { userId: session.user.id, action: "database_row.trashed", entity: "database_row", entityId: rowId, workspaceId: access.database.project.workspaceId, projectId: access.database.projectId, metadata: { databaseId: id, deletionBatchId } } }); return NextResponse.json({ ok: true, deletionBatchId });
}
