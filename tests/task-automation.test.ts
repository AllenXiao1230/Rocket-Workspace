import { describe, expect, it } from "vitest";
import { isRecurrenceRule, nextRecurrenceOccurrence } from "@/lib/task-automation";

describe("task recurrence rules", () => {
  it("uses one canonical parser for daily, weekly, and monthly schedules", () => {
    const anchor = new Date("2026-01-31T00:00:00.000Z");
    expect(nextRecurrenceOccurrence("FREQ=DAILY;INTERVAL=2", anchor)?.toISOString()).toBe(
      "2026-02-02T00:00:00.000Z",
    );
    expect(
      nextRecurrenceOccurrence("FREQ=WEEKLY;INTERVAL=2", anchor)?.toISOString(),
    ).toBe("2026-02-14T00:00:00.000Z");
    expect(isRecurrenceRule("FREQ=MONTHLY;INTERVAL=1")).toBe(true);
  });

  it("rejects malformed schedules before they reach the worker", () => {
    expect(nextRecurrenceOccurrence("every week", new Date())).toBeNull();
    expect(isRecurrenceRule("FREQ=HOURLY;INTERVAL=1")).toBe(false);
  });
});
