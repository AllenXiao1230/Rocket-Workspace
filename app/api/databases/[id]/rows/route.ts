import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, databaseAccess } from "@/lib/permissions";
import { applyRowAutomations } from "@/lib/database-automations";
import { AutomationTrigger } from "@prisma/client";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const access = await databaseAccess(session.user.id, id);
  if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({})); const values = body.values && typeof body.values === "object" && !Array.isArray(body.values) ? body.values : {};
  const max = await prisma.databaseRow.aggregate({ where: { databaseId: id }, _max: { position: true } }); const automated = await applyRowAutomations(id, AutomationTrigger.ROW_CREATED, values, session.user.id);
  const [row, ...createdRows] = await prisma.$transaction([prisma.databaseRow.create({ data: { databaseId: id, values: automated.values, position: (max._max.position ?? -1) + 1 } }), ...automated.createdRows.map((rowValues, index) => prisma.databaseRow.create({ data: { databaseId: id, values: rowValues, position: (max._max.position ?? -1) + index + 2 } }))]);
  return NextResponse.json({ ...row, createdRows }, { status: 201 });
}
