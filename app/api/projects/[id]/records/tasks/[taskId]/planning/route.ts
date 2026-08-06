import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, projectAccess } from "@/lib/permissions";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();
const schema = z.object({ startDate: date, dueDate: date, baselineStartDate: date, baselineDueDate: date, estimatedHours: z.number().min(0).max(100_000).nullable().optional() });
const toDate = (value: string | null | undefined) => value ? new Date(`${value}T00:00:00.000Z`) : null;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId, taskId } = await params; const access = await projectAccess(session.user.id, projectId);
  if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "排程資料不正確" }, { status: 400 });
  const task = await prisma.task.findFirst({ where: { id: taskId, projectId, deletedAt: null } }); if (!task) return NextResponse.json({ error: "找不到任務" }, { status: 404 });
  const startDate = parsed.data.startDate === undefined ? task.startDate : toDate(parsed.data.startDate);
  const dueDate = parsed.data.dueDate === undefined ? task.dueDate : toDate(parsed.data.dueDate);
  const baselineStartDate = parsed.data.baselineStartDate === undefined ? task.baselineStartDate : toDate(parsed.data.baselineStartDate);
  const baselineDueDate = parsed.data.baselineDueDate === undefined ? task.baselineDueDate : toDate(parsed.data.baselineDueDate);
  if (startDate && dueDate && startDate > dueDate) return NextResponse.json({ error: "開始日期不可晚於結束日期" }, { status: 400 });
  if (baselineStartDate && baselineDueDate && baselineStartDate > baselineDueDate) return NextResponse.json({ error: "基線開始日期不可晚於結束日期" }, { status: 400 });
  const updated = await prisma.task.update({ where: { id: taskId }, data: { startDate, dueDate, baselineStartDate, baselineDueDate, estimatedHours: parsed.data.estimatedHours === undefined ? undefined : parsed.data.estimatedHours }, include: { assignee: { select: { id: true, name: true, email: true } }, dependencies: { where: { dependsOn: { deletedAt: null } }, include: { dependsOn: { select: { id: true, title: true, status: true } } } } } });
  await prisma.auditEvent.create({ data: { userId: session.user.id, action: "task.planning.updated", entity: "task", entityId: taskId, metadata: parsed.data } });
  return NextResponse.json(updated);
}
