import { describe, expect, it } from "vitest";
import { validateRowValues } from "@/lib/database-validation";

const properties = [
  { id: "name", name: "名稱", type: "TEXT" as const, options: null },
  { id: "count", name: "數量", type: "NUMBER" as const, options: null },
  { id: "status", name: "狀態", type: "STATUS" as const, options: ["待處理", "完成"] },
  { id: "formula", name: "合計", type: "FORMULA" as const, options: { expression: "{數量}" } },
];

describe("database row server validation", () => {
  it("accepts typed values and rejects unknown or computed fields", () => {
    expect(validateRowValues(properties, { name: "馬達", count: 2, status: "待處理" })).toMatchObject({ issues: [], values: { name: "馬達", count: 2, status: "待處理" } });
    expect(validateRowValues(properties, { formula: "9", unknown: "x" }).issues.map((item) => item.message)).toEqual(expect.arrayContaining([expect.stringContaining("由系統計算"), expect.stringContaining("欄位不存在")]));
  });

  it("rejects invalid typed values", () => {
    expect(validateRowValues(properties, { count: "2", status: "錯誤" }).issues).toHaveLength(2);
  });
});
