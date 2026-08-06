import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, projectAccess } from "@/lib/permissions";

const dateOnly = (value: Date) => value.toISOString().slice(0, 10);
function nextOccurrence(rule: string, from: Date) {
  const match = /^FREQ=(DAILY|WEEKLY|MONTHLY);INTERVAL=(\d{1,3})$/.exec(rule.trim().toUpperCase());
  if (!match) return null; const next = new Date(from); const interval = Number(match[2]);
  if (match[1] === "DAILY") next.setUTCDate(next.getUTCDate() + interval);
  else if (match[1] === "WEEKLY") next.setUTCDate(next.getUTCDate() + interval * 7);
  else next.setUTCMonth(next.getUTCMonth() + interval);
  return next;
}

// Safe idempotent runner. Invoke from a host scheduler after completing recurring tasks.
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const access = await projectAccess(session.user.id, id); if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const source = await prisma.task.findMany({ where: { projectId: id, deletedAt: null, status: "DONE", recurrenceRule: { not: null } } }); const created = [];
  for (const task of source) {
    const anchor = task.recurrenceAnchor || task.dueDate || task.updatedAt; const next = task.recurrenceRule ? nextOccurrence(task.recurrenceRule, anchor) : null; if (!next) continue;
    const start = task.startDate && task.dueDate ? new Date(task.startDate.getTime() + (next.getTime() - anchor.getTime())) : next;
    const existing = await prisma.task.findFirst({ where: { projectId: id, title: task.title, recurrenceAnchor: next, deletedAt: null } }); if (existing) continue;
    created.push(await prisma.task.create({ data: { projectId: id, title: task.title, status: "TODO", priority: task.priority, assigneeId: task.assigneeId, parentId: task.parentId, milestone: task.milestone, estimatedHours: task.estimatedHours, recurrenceRule: task.recurrenceRule, recurrenceAnchor: next, startDate: start, dueDate: task.dueDate ? new Date(task.dueDate.getTime() + (next.getTime() - anchor.getTime())) : next, slaDueAt: task.slaDueAt ? new Date(task.slaDueAt.getTime() + (next.getTime() - anchor.getTime())) : null } }));
  }
  await prisma.auditEvent.create({ data: { userId: session.user.id, action: "task.recurrence_run", entity: "project", entityId: id, workspaceId: access.project.workspaceId, projectId: id, metadata: { created: created.length, date: dateOnly(new Date()) } } });
  return NextResponse.json({ created });
}
