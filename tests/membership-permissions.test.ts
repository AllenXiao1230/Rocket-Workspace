import { describe, expect, it } from "vitest";
import { canChangeMembershipRole } from "@/lib/membership-permissions";

describe("workspace owner protection", () => {
  it("prevents an admin from creating or changing an owner", () => {
    expect(canChangeMembershipRole("ADMIN", null, "OWNER", 2)).toBe(false);
    expect(canChangeMembershipRole("ADMIN", "OWNER", "VIEWER", 2)).toBe(false);
  });

  it("keeps the final owner in place", () => {
    expect(canChangeMembershipRole("OWNER", "OWNER", "ADMIN", 1)).toBe(false);
    expect(canChangeMembershipRole("OWNER", "OWNER", "ADMIN", 2)).toBe(true);
  });
});
