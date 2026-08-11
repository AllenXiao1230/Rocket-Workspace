import { describe, expect, it } from "vitest";
import { calculateCriticalPath } from "@/lib/cpm";

describe("calculateCriticalPath", () => {
  it("calculates forward and backward pass slack", () => {
    const result = calculateCriticalPath([
      { id: "a", startDate: "2026-01-01", dueDate: "2026-01-02" },
      { id: "b", startDate: "2026-01-01", dueDate: "2026-01-03", dependencies: ["a"] },
      { id: "c", startDate: "2026-01-01", dueDate: "2026-01-01" },
    ]);
    expect(result.projectDurationDays).toBe(4);
    expect(result.results.find((item) => item.id === "a")?.critical).toBe(true);
    expect(result.results.find((item) => item.id === "c")?.slackDays).toBe(3);
  });
  it("rejects cyclic networks instead of publishing a false critical path", () =>
    expect(
      calculateCriticalPath([
        { id: "a", dependencies: ["b"] },
        { id: "b", dependencies: ["a"] },
      ]).cycles,
    ).toEqual(["a", "b"]));
  it("uses the project work calendar when calculating durations", () => {
    const result = calculateCriticalPath(
      [{ id: "a", startDate: "2025-12-31", dueDate: "2026-01-05" }],
      { workingDays: [1, 2, 3, 4, 5], holidayDates: ["2026-01-01"] },
    );
    expect(result.projectDurationDays).toBe(3);
  });
});
