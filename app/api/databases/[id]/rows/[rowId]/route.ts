import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, databaseAccess } from "@/lib/permissions";
import { applyRowAutomations } from "@/lib/database-automations";
import { AutomationTrigger } from "@prisma/client";
import { validateRowValues } from "@/lib/database-validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; rowId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, rowId } = await params; const access = await databaseAccess(session.user.id, id);
  if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const row = await prisma.databaseRow.findFirst({ where: { id: rowId, databaseId: id, deletedAt: null } }); if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => ({})); const properties = await prisma.databaseProperty.findMany({ where: { databaseId: id, deletedAt: null }, select: { id: true, name: true, type: true, options: true } }); const validation = validateRowValues(properties, body.values); if (validation.issues.length) return NextResponse.json({ error: validation.issues[0].message, issues: validation.issues }, { status: 400 });
  const mergedValues = { ...(row.values as Record<string, unknown>), ...validation.values }; const automated = await applyRowAutomations(id, AutomationTrigger.ROW_UPDATED, mergedValues);
  const finalValidation = validateRowValues(properties, automated.values); const generatedValidations = automated.createdRows.map((values) => validateRowValues(properties, values));
  const issues = [...finalValidation.issues, ...generatedValidations.flatMap((result) => result.issues)]; if (issues.length) return NextResponse.json({ error: issues[0].message, issues }, { status: 400 });
  const { updated, createdRows } = await prisma.$transaction(async (tx) => {
    const max = await tx.databaseRow.aggregate({ where: { databaseId: id, deletedAt: null }, _max: { position: true } }); const position = (max._max.position ?? -1) + 1;
    const updated = await tx.databaseRow.update({ where: { id: rowId }, data: { values: finalValidation.values as Prisma.InputJsonValue } });
    const createdRows = [];
    for (const [index, generated] of generatedValidations.entries()) createdRows.push(await tx.databaseRow.create({ data: { databaseId: id, values: generated.values as Prisma.InputJsonValue, position: position + index } }));
    for (const notification of automated.notifications) await tx.notification.create({ data: { userId: session.user.id, ...notification } });
    return { updated, createdRows };
  });
  await prisma.auditEvent.create({ data: { userId: session.user.id, action: "database_row.updated", entity: "database_row", entityId: rowId, workspaceId: access.database.project.workspaceId, projectId: access.database.projectId, metadata: { databaseId: id, automationCreatedRows: createdRows.length } } });
  return NextResponse.json({ ...updated, createdRows });
}
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; rowId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, rowId } = await params; const access = await databaseAccess(session.user.id, id);
  if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const deletionBatchId = crypto.randomUUID(); const deleted = await prisma.databaseRow.updateMany({ where: { id: rowId, databaseId: id, deletedAt: null }, data: { deletedAt: new Date(), deletionBatchId } }); if (!deleted.count) return NextResponse.json({ error: "Not found" }, { status: 404 }); await prisma.auditEvent.create({ data: { userId: session.user.id, action: "database_row.trashed", entity: "database_row", entityId: rowId, workspaceId: access.database.project.workspaceId, projectId: access.database.projectId, metadata: { databaseId: id, deletionBatchId } } }); return NextResponse.json({ ok: true, deletionBatchId });
}
