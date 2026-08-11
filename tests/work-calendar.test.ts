import { describe, expect, it } from "vitest";
import { addWorkingDays, nextWorkingDate, workingDaySpan } from "@/lib/work-calendar";

const calendar = { workingDays: [1, 2, 3, 4, 5], holidayDates: ["2026-01-01"] };

describe("work calendar", () => {
  it("moves a non-working date to the next configured workday", () => {
    expect(nextWorkingDate("2026-01-01", calendar)).toBe("2026-01-02");
    expect(nextWorkingDate("2026-01-03", calendar)).toBe("2026-01-05");
  });

  it("preserves workday duration while skipping holidays and weekends", () => {
    expect(addWorkingDays("2025-12-31", 2, calendar)).toBe("2026-01-05");
    expect(workingDaySpan("2025-12-31", "2026-01-05", calendar)).toBe(3);
  });
});
