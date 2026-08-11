import { describe, expect, it } from "vitest";
import { calculateRollupValue } from "@/lib/database-rollup-cache";

describe("database rollup cache", () => {
  it("calculates a rollup snapshot from its related rows", () => {
    const source = {
      id: "orders",
      properties: [],
      rows: [{ id: "order-a", values: { relation: ["part-a", "part-b"] } }],
    };
    const target = {
      id: "parts",
      properties: [],
      rows: [
        { id: "part-a", values: { cost: 12 } },
        { id: "part-b", values: { cost: 8 } },
      ],
    };
    expect(
      calculateRollupValue(
        source.rows[0],
        {
          options: {
            databaseId: "parts",
            relationPropertyId: "relation",
            targetPropertyId: "cost",
            operation: "SUM",
          },
        },
        [source, target],
      ),
    ).toBe("20");
  });
});
