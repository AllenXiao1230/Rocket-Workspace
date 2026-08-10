import { prisma } from "@/lib/prisma";

const dayKey = (value = new Date()) => value.toISOString().slice(0, 10);
const nextOccurrence = (rule: string, from: Date) => { const match = /^FREQ=(DAILY|WEEKLY|MONTHLY);INTERVAL=(\d{1,3})$/.exec(rule.trim().toUpperCase()); if (!match) return null; const next = new Date(from); const interval = Number(match[2]); if (match[1] === "DAILY") next.setUTCDate(next.getUTCDate() + interval); else if (match[1] === "WEEKLY") next.setUTCDate(next.getUTCDate() + interval * 7); else next.setUTCMonth(next.getUTCMonth() + interval); return next; };

/** Idempotent background task runner. Safe to execute from multiple scheduler
 * ticks: generated occurrences and daily SLA notices are de-duplicated. */
export async function runTaskAutomation(now = new Date()) {
  const sources = await prisma.task.findMany({ where: { deletedAt: null, status: "DONE", recurrenceRule: { not: null } } }); let recurrences = 0;
  for (const task of sources) {
    const anchor = task.recurrenceAnchor || task.dueDate || task.updatedAt; const occurrence = task.recurrenceRule ? nextOccurrence(task.recurrenceRule, anchor) : null;
    if (!occurrence || occurrence > now) continue;
    const recurrenceSourceId = task.recurrenceSourceId || task.id;
    const offset = occurrence.getTime() - anchor.getTime();
    try {
      await prisma.task.create({ data: { projectId: task.projectId, title: task.title, status: "TODO", priority: task.priority, assigneeId: task.assigneeId, parentId: task.parentId, milestone: task.milestone, estimatedHours: task.estimatedHours, recurrenceRule: task.recurrenceRule, recurrenceAnchor: occurrence, recurrenceSourceId, startDate: task.startDate ? new Date(task.startDate.getTime() + offset) : occurrence, dueDate: task.dueDate ? new Date(task.dueDate.getTime() + offset) : occurrence, slaDueAt: task.slaDueAt ? new Date(task.slaDueAt.getTime() + offset) : null } });
      recurrences += 1;
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      if (code !== "P2002") throw error;
    }
  }
  const start = new Date(`${dayKey(now)}T00:00:00.000Z`); const end = new Date(start.getTime() + 2 * 86_400_000); const urgent = await prisma.task.findMany({ where: { deletedAt: null, status: { not: "DONE" }, slaDueAt: { gte: start, lt: end }, assigneeId: { not: null } }, include: { project: { select: { workspaceId: true, name: true } } } }); let alerts = 0;
  for (const task of urgent) {
    const title = `SLA 提醒：${task.title}`;
    try {
      await prisma.notification.create({ data: { userId: task.assigneeId!, title, body: `任務 SLA 到期日：${task.slaDueAt?.toLocaleDateString("zh-TW")} · ${task.project.name}`, href: `/?project=${task.projectId}`, deduplicationKey: `sla:${task.id}:${dayKey(now)}` } });
      alerts += 1;
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      if (code !== "P2002") throw error;
    }
  }
  return { recurrences, alerts, runDate: dayKey(now) };
}
