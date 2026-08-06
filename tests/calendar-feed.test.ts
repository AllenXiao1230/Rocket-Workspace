import { describe, expect, it } from "vitest";
import { buildProjectCalendarIcs, hashCalendarFeedToken } from "@/lib/calendar-feed";

describe("iCalendar project feed", () => {
  it("uses a stable non-reversible token digest", () => {
    expect(hashCalendarFeedToken("calendar-token")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashCalendarFeedToken("calendar-token")).toBe(hashCalendarFeedToken("calendar-token"));
  });

  it("exports dated tasks and test records as escaped all-day events", () => {
    const ics = buildProjectCalendarIcs({ projectId: "project-a", projectName: "飛行, 測試", tasks: [{ id: "task-a", title: "整合;驗證", status: "IN_PROGRESS", startDate: new Date("2026-08-10T00:00:00.000Z"), dueDate: new Date("2026-08-12T00:00:00.000Z"), updatedAt: new Date("2026-08-01T01:02:03.000Z") }], testRecords: [{ id: "test-a", title: "發射台測試", outcome: "PASS", testDate: new Date("2026-08-13T00:00:00.000Z"), notes: "確認\n完成", updatedAt: new Date("2026-08-02T01:02:03.000Z") }] });
    expect(ics).toContain("BEGIN:VCALENDAR\r\nVERSION:2.0");
    expect(ics).toContain("X-WR-CALNAME:飛行\\, 測試");
    expect(ics).toContain("UID:task-task-a@rocket-workspace-project-a");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260810");
    expect(ics).toContain("DTEND;VALUE=DATE:20260813");
    expect(ics).toContain("SUMMARY:整合\\;驗證");
    expect(ics).toContain("UID:test-test-a@rocket-workspace-project-a");
    expect(ics).toContain("DESCRIPTION:Rocket Workspace 測試紀錄\\n結果：PASS\\n確認\\n完成");
  });

  it("omits records without a calendar date", () => {
    const ics = buildProjectCalendarIcs({ projectId: "project-a", projectName: "測試", tasks: [{ id: "task-a", title: "未排程", status: "TODO", startDate: null, dueDate: null, updatedAt: new Date() }], testRecords: [] });
    expect(ics).not.toContain("BEGIN:VEVENT");
  });
});
