import { describe, expect, it } from "vitest";
import { evaluateFormula } from "@/lib/formula";

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
});
