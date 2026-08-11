import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "@/lib/csv";

describe("CSV", () => {
  it("round trips quoted commas, quotes and newlines", () => {
    const rows = [
      ["名稱", "備註"],
      ["A, B", 'line 1\nline "2"'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
  it("rejects unclosed quoted fields", () =>
    expect(() => parseCsv('"unclosed')).toThrow());
});
