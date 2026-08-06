import { describe, expect, it } from "vitest";
import { canWrite } from "@/lib/permissions";

describe("workspace write permissions", () => {
  it.each(["OWNER", "ADMIN", "EDITOR"] as const)("允許 %s 寫入", (role) => expect(canWrite(role)).toBe(true));
  it("禁止 VIEWER 寫入", () => expect(canWrite("VIEWER")).toBe(false));
});
