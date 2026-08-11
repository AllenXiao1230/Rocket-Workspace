export type CpmTask = {
  id: string;
  startDate?: Date | string | null;
  dueDate?: Date | string | null;
  dependencies?: string[];
};
export type CpmResult = {
  id: string;
  durationDays: number;
  earlyStart: number;
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  slackDays: number;
  critical: boolean;
};
import {
  defaultWorkCalendar,
  type WorkCalendar,
  workingDaySpan,
} from "@/lib/work-calendar";

const day = (value: Date | string | null | undefined) =>
  value ? new Date(value).getTime() : null;
const duration = (task: CpmTask, calendar: WorkCalendar) => {
  const start = day(task.startDate);
  const end = day(task.dueDate);
  return start !== null && end !== null
    ? workingDaySpan(new Date(start), new Date(end), calendar)
    : 1;
};

/** Forward/backward pass over finish-to-start dependencies. Dates only provide durations;
 * the result is a relative CPM network and deliberately does not mutate task dates. */
export function calculateCriticalPath(tasks: CpmTask[], calendar = defaultWorkCalendar) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const predecessors = new Map(
    tasks.map((task) => [
      task.id,
      (task.dependencies || []).filter((id) => byId.has(id)),
    ]),
  );
  const successors = new Map(tasks.map((task) => [task.id, [] as string[]]));
  predecessors.forEach((ids, id) =>
    ids.forEach((dependency) => successors.get(dependency)!.push(id)),
  );
  const remaining = new Map(
    tasks.map((task) => [task.id, predecessors.get(task.id)!.length]),
  );
  const order: string[] = [];
  const ready = tasks
    .filter((task) => remaining.get(task.id) === 0)
    .map((task) => task.id);
  while (ready.length) {
    const id = ready.shift()!;
    order.push(id);
    for (const next of successors.get(id) || []) {
      const value = (remaining.get(next) || 0) - 1;
      remaining.set(next, value);
      if (value === 0) ready.push(next);
    }
  }
  const cycles = tasks.filter((task) => !order.includes(task.id)).map((task) => task.id);
  if (cycles.length)
    return { results: [] as CpmResult[], projectDurationDays: 0, cycles };
  const earlyStart = new Map<string, number>();
  const earlyFinish = new Map<string, number>();
  for (const id of order) {
    const es = Math.max(
      0,
      ...(predecessors.get(id) || []).map(
        (dependency) => earlyFinish.get(dependency) || 0,
      ),
    );
    earlyStart.set(id, es);
    earlyFinish.set(id, es + duration(byId.get(id)!, calendar));
  }
  const projectDurationDays = Math.max(0, ...earlyFinish.values());
  const lateFinish = new Map<string, number>();
  const lateStart = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const next = successors.get(id) || [];
    const lf = next.length
      ? Math.min(
          ...next.map((successor) => lateStart.get(successor) ?? projectDurationDays),
        )
      : projectDurationDays;
    lateFinish.set(id, lf);
    lateStart.set(id, lf - duration(byId.get(id)!, calendar));
  }
  return {
    projectDurationDays,
    cycles,
    results: order.map((id) => {
      const es = earlyStart.get(id)!;
      const ls = lateStart.get(id)!;
      return {
        id,
        durationDays: duration(byId.get(id)!, calendar),
        earlyStart: es,
        earlyFinish: earlyFinish.get(id)!,
        lateStart: ls,
        lateFinish: lateFinish.get(id)!,
        slackDays: ls - es,
        critical: ls === es,
      };
    }),
  };
}
