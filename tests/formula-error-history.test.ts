import { createHash } from "node:crypto";
import { DatabasePropertyType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { findFormulaFailures } from "@/lib/formula-error-history";

describe("formula error history", () => {
  it("records only an opaque error code and expression fingerprint", () => {
    const failures = findFormulaFailures(
      [
        {
          id: "divisor",
          name: "除數",
          type: DatabasePropertyType.NUMBER,
          options: null,
        },
        {
          id: "formula",
          name: "結果",
          type: DatabasePropertyType.FORMULA,
          options: { expression: "10 / {除數}" },
        },
      ],
      { id: "row-a", values: { divisor: 0 } },
    );

    expect(failures).toEqual([
      {
        propertyId: "formula",
        code: "DIVISION_BY_ZERO",
        expressionHash: createHash("sha256").update("10 / {除數}").digest("hex"),
      },
    ]);
    expect(JSON.stringify(failures)).not.toContain("divisor");
    expect(JSON.stringify(failures)).not.toContain('"10 / {除數}"');
  });
});
