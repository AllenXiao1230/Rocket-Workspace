import { prisma } from "@/lib/prisma";

export const dayKey = (value = new Date()) => value.toISOString().slice(0, 10);

export function nextRecurrenceOccurrence(rule: string, from: Date) {
  const match = /^FREQ=(DAILY|WEEKLY|MONTHLY);INTERVAL=(\d{1,3})$/.exec(rule.trim().toUpperCase());
  if (!match) return null;

  const next = new Date(from);
  const interval = Number(match[2]);
  if (match[1] === "DAILY") next.setUTCDate(next.getUTCDate() + interval);
  else if (match[1] === "WEEKLY") next.setUTCDate(next.getUTCDate() + interval * 7);
  else next.setUTCMonth(next.getUTCMonth() + interval);
  return next;
}

export const isRecurrenceRule = (rule: string | null | undefined) => Boolean(rule && nextRecurrenceOccurrence(rule, new Date("2026-01-01T00:00:00.000Z")));

type AutomationOptions = { now?: Date; projectId?: string; dueOnly?: boolean; includeSlaAlerts?: boolean };

/**
 * Processes each completed recurring task once. A unique lineage/anchor index
 * makes the create idempotent; recurrenceProcessedAt prevents old completed
 * tasks from being re-scanned on every scheduler tick.
 */
export async function runTaskAutomation({ now = new Date(), projectId, dueOnly = true, includeSlaAlerts = !projectId }: AutomationOptions = {}) {
  const sources = await prisma.task.findMany({
    where: { projectId, deletedAt: null, status: "DONE", recurrenceRule: { not: null }, recurrenceProcessedAt: null },
    orderBy: { updatedAt: "asc" },
    take: 200,
  });
  let recurrences = 0;

  for (const task of sources) {
    const anchor = task.recurrenceAnchor || task.dueDate || task.updatedAt;
    const occurrence = task.recurrenceRule ? nextRecurrenceOccurrence(task.recurrenceRule, anchor) : null;
    if (!occurrence || (dueOnly && occurrence > now)) continue;

    const recurrenceSourceId = task.recurrenceSourceId || task.id;
    const offset = occurrence.getTime() - anchor.getTime();
    try {
      await prisma.task.create({
        data: {
          projectId: task.projectId, title: task.title, status: "TODO", priority: task.priority,
          assigneeId: task.assigneeId, parentId: task.parentId, milestone: task.milestone,
          estimatedHours: task.estimatedHours, recurrenceRule: task.recurrenceRule,
          recurrenceAnchor: occurrence, recurrenceSourceId,
          startDate: task.startDate ? new Date(task.startDate.getTime() + offset) : occurrence,
          dueDate: task.dueDate ? new Date(task.dueDate.getTime() + offset) : occurrence,
          slaDueAt: task.slaDueAt ? new Date(task.slaDueAt.getTime() + offset) : null,
        },
      });
      recurrences += 1;
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      if (code !== "P2002") throw error;
    }
    await prisma.task.updateMany({ where: { id: task.id, recurrenceProcessedAt: null }, data: { recurrenceProcessedAt: now } });
  }

  let alerts = 0;
  if (includeSlaAlerts) {
    const start = new Date(`${dayKey(now)}T00:00:00.000Z`);
    const end = new Date(start.getTime() + 2 * 86_400_000);
    const urgent = await prisma.task.findMany({ where: { deletedAt: null, status: { not: "DONE" }, slaDueAt: { gte: start, lt: end }, assigneeId: { not: null } }, include: { project: { select: { workspaceId: true, name: true } } } });
    for (const task of urgent) {
      try {
        await prisma.notification.create({ data: { userId: task.assigneeId!, title: `SLA 提醒：${task.title}`, body: `任務 SLA 到期日：${task.slaDueAt?.toLocaleDateString("zh-TW")} · ${task.project.name}`, href: `/?project=${task.projectId}`, deduplicationKey: `sla:${task.id}:${dayKey(now)}` } });
        alerts += 1;
      } catch (error) {
        const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
        if (code !== "P2002") throw error;
      }
    }
  }

  return { recurrences, alerts, runDate: dayKey(now) };
}
