import { describe, expect, it } from "vitest";
import { lineDiff } from "@/lib/text-diff";

describe("Markdown revision diff", () => {
  it("reports added and removed lines without losing unchanged context", () => {
    expect(lineDiff("alpha\nbeta", "alpha\ngamma")).toEqual([{ type: "same", text: "alpha" }, { type: "removed", text: "beta" }, { type: "added", text: "gamma" }]);
  });
});
