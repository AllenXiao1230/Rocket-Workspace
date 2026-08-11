const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export type WorkCalendar = { workingDays: number[]; holidayDates: string[] };

export const defaultWorkCalendar: WorkCalendar = {
  workingDays: [1, 2, 3, 4, 5],
  holidayDates: [],
};

export function readWorkCalendar(project: {
  workingDays: unknown;
  holidayDates?: unknown;
}): WorkCalendar {
  const workingDays = Array.isArray(project.workingDays)
    ? project.workingDays.filter(
        (day): day is number => Number.isInteger(day) && day >= 0 && day <= 6,
      )
    : defaultWorkCalendar.workingDays;
  const holidayDates = Array.isArray(project.holidayDates)
    ? project.holidayDates.filter(
        (date): date is string => typeof date === "string" && datePattern.test(date),
      )
    : [];
  return {
    workingDays: workingDays.length
      ? [...new Set(workingDays)].sort()
      : defaultWorkCalendar.workingDays,
    holidayDates: [...new Set(holidayDates)].sort(),
  };
}

const iso = (date: Date) => date.toISOString().slice(0, 10);
const fromIso = (value: string) => new Date(`${value}T00:00:00.000Z`);

export function isWorkingDate(value: Date | string, calendar: WorkCalendar) {
  const date = typeof value === "string" ? fromIso(value) : value;
  return (
    calendar.workingDays.includes(date.getUTCDay()) &&
    !calendar.holidayDates.includes(iso(date))
  );
}

export function nextWorkingDate(value: Date | string, calendar: WorkCalendar) {
  const date = typeof value === "string" ? fromIso(value) : new Date(value);
  while (!isWorkingDate(date, calendar)) date.setUTCDate(date.getUTCDate() + 1);
  return iso(date);
}

export function addWorkingDays(
  value: Date | string,
  days: number,
  calendar: WorkCalendar,
) {
  const date = fromIso(nextWorkingDate(value, calendar));
  for (let remaining = Math.max(0, days); remaining; ) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (isWorkingDate(date, calendar)) remaining -= 1;
  }
  return iso(date);
}

export function workingDaySpan(
  start: Date | string,
  end: Date | string,
  calendar: WorkCalendar,
) {
  const cursor = typeof start === "string" ? fromIso(start) : new Date(start);
  const last = typeof end === "string" ? fromIso(end) : new Date(end);
  let count = 0;
  while (cursor <= last) {
    if (isWorkingDate(cursor, calendar)) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return Math.max(1, count);
}
