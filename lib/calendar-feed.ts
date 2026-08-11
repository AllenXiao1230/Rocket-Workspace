import { createHash, randomBytes } from "node:crypto";

type CalendarTask = {
  id: string;
  title: string;
  status: string;
  startDate: Date | null;
  dueDate: Date | null;
  updatedAt: Date;
};
type CalendarTestRecord = {
  id: string;
  title: string;
  outcome: string;
  testDate: Date | null;
  notes: string | null;
  updatedAt: Date;
};

export function createCalendarFeedToken() {
  return randomBytes(32).toString("base64url");
}
export function hashCalendarFeedToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function escapeIcs(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}
function utcStamp(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}
function dayStamp(date: Date) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}
function addDay(date: Date) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + 1);
  return copy;
}
function foldIcsLine(line: string) {
  return line.length <= 75 ? line : `${line.slice(0, 75)}\r\n ${line.slice(75)}`;
}

function taskEvent(task: CalendarTask, domain: string) {
  const date = task.startDate || task.dueDate;
  if (!date) return null;
  const end = task.dueDate ? addDay(task.dueDate) : addDay(date);
  return [
    "BEGIN:VEVENT",
    `UID:task-${task.id}@${domain}`,
    `DTSTAMP:${utcStamp(task.updatedAt)}`,
    `LAST-MODIFIED:${utcStamp(task.updatedAt)}`,
    `DTSTART;VALUE=DATE:${dayStamp(date)}`,
    `DTEND;VALUE=DATE:${dayStamp(end)}`,
    `SUMMARY:${escapeIcs(task.title)}`,
    `DESCRIPTION:${escapeIcs(`Rocket Workspace 任務\n狀態：${task.status}`)}`,
    "CATEGORIES:Task",
    "END:VEVENT",
  ];
}

function testEvent(record: CalendarTestRecord, domain: string) {
  if (!record.testDate) return null;
  return [
    "BEGIN:VEVENT",
    `UID:test-${record.id}@${domain}`,
    `DTSTAMP:${utcStamp(record.updatedAt)}`,
    `LAST-MODIFIED:${utcStamp(record.updatedAt)}`,
    `DTSTART;VALUE=DATE:${dayStamp(record.testDate)}`,
    `DTEND;VALUE=DATE:${dayStamp(addDay(record.testDate))}`,
    `SUMMARY:${escapeIcs(record.title)}`,
    `DESCRIPTION:${escapeIcs(`Rocket Workspace 測試紀錄\n結果：${record.outcome}${record.notes ? `\n${record.notes}` : ""}`)}`,
    "CATEGORIES:Test",
    "END:VEVENT",
  ];
}

/** Standards-compatible, read-only iCalendar feed for external subscriptions. */
export function buildProjectCalendarIcs(input: {
  projectName: string;
  projectId: string;
  tasks: CalendarTask[];
  testRecords: CalendarTestRecord[];
}) {
  const domain = `rocket-workspace-${input.projectId}`;
  const events = [
    ...input.tasks.map((task) => taskEvent(task, domain)),
    ...input.testRecords.map((record) => testEvent(record, domain)),
  ].filter((event): event is string[] => Boolean(event));
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Rocket Workspace//Calendar Feed//ZH-TW",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcs(input.projectName)}`,
    ...events.flat(),
    "END:VCALENDAR",
  ];
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}
