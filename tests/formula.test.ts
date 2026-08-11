import { describe, expect, it } from "vitest";
import { evaluateFormula, evaluateFormulaResult } from "@/lib/formula";

describe("database formula evaluator", () => {
  it("evaluates values with ordinary arithmetic precedence", () => {
    expect(
      evaluateFormula("({數量} * {單價}) + 5", (name) => ({ 數量: 3, 單價: 12 })[name]),
    ).toBe("41");
  });
  it("rejects executable text and invalid arithmetic", () => {
    expect(evaluateFormula("process.exit()", () => 0)).toBeNull();
    expect(evaluateFormula("10 / 0", () => 0)).toBeNull();
  });
  it("returns a stable, non-sensitive failure code for history recording", () => {
    expect(evaluateFormulaResult("10 / {除數}", () => 0)).toEqual({
      value: null,
      code: "DIVISION_BY_ZERO",
    });
    expect(evaluateFormulaResult("process.exit()", () => 0)).toMatchObject({
      value: null,
      code: "INVALID_EXPRESSION",
    });
  });
});
