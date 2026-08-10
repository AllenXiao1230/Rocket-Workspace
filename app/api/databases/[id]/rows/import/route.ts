import { NextResponse } from "next/server";
import { AutomationTrigger, Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, databaseAccess } from "@/lib/permissions";
import { applyAutomations } from "@/lib/database-automations";
import { validateRowValues } from "@/lib/database-validation";

const schema = z.object({ rows: z.array(z.record(z.string(), z.unknown())).min(1).max(2_000) });

/** CSV import boundary: validate the complete batch before one atomic write. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const access = await databaseAccess(session.user.id, id);
  if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "匯入資料必須為 1 至 2,000 列" }, { status: 400 });
  const [properties, automations] = await Promise.all([
    prisma.databaseProperty.findMany({ where: { databaseId: id, deletedAt: null }, select: { id: true, name: true, type: true, options: true } }),
    prisma.databaseAutomation.findMany({ where: { databaseId: id, trigger: AutomationTrigger.ROW_CREATED, enabled: true }, select: { name: true, action: true, config: true } }),
  ]);

  const rows: Prisma.InputJsonValue[] = [];
  const notifications: Array<{ title: string; body: string }> = [];
  for (const [index, rawValues] of input.data.rows.entries()) {
    const initial = validateRowValues(properties, rawValues);
    if (initial.issues.length) return NextResponse.json({ error: `第 ${index + 2} 列：${initial.issues[0].message}`, issues: initial.issues }, { status: 400 });
    const automated = applyAutomations(automations, initial.values);
    const final = validateRowValues(properties, automated.values);
    const generated = automated.createdRows.map((values) => validateRowValues(properties, values));
    const issues = [...final.issues, ...generated.flatMap((result) => result.issues)];
    if (issues.length) return NextResponse.json({ error: `第 ${index + 2} 列：${issues[0].message}`, issues }, { status: 400 });
    rows.push(final.values as Prisma.InputJsonValue, ...generated.map((result) => result.values as Prisma.InputJsonValue));
    notifications.push(...automated.notifications);
  }
  if (rows.length > 5_000) return NextResponse.json({ error: "自動化產生的列數過多，請縮小匯入批次" }, { status: 400 });

  const created = await prisma.$transaction(async (tx) => {
    const max = await tx.databaseRow.aggregate({ where: { databaseId: id, deletedAt: null }, _max: { position: true } });
    const position = (max._max.position ?? -1) + 1;
    await tx.databaseRow.createMany({ data: rows.map((values, index) => ({ databaseId: id, values, position: position + index })) });
    if (notifications.length) await tx.notification.createMany({ data: notifications.map((notification) => ({ userId: session.user.id, ...notification })) });
    return tx.databaseRow.findMany({ where: { databaseId: id, position: { gte: position, lt: position + rows.length } }, orderBy: { position: "asc" } });
  });
  await prisma.auditEvent.create({ data: { userId: session.user.id, action: "database_row.imported", entity: "database", entityId: id, workspaceId: access.database.project.workspaceId, projectId: access.database.projectId, metadata: { requestedRows: input.data.rows.length, createdRows: created.length } } });
  return NextResponse.json({ rows: created, imported: input.data.rows.length, created: created.length }, { status: 201 });
}
