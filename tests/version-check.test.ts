import { describe, expect, it } from "vitest";
import { comparisonFromBehind, isValidBranch, isValidCommit, isValidRepository, shortCommit } from "@/lib/version-check";

describe("version comparison validation", () => {
  it("accepts only safe repository, branch, and commit identifiers", () => {
    expect(isValidRepository("owner/repository-name")).toBe(true);
    expect(isValidRepository("owner/repo/extra")).toBe(false);
    expect(isValidBranch("release/2026.08")).toBe(true);
    expect(isValidBranch("/main")).toBe(false);
    expect(isValidCommit("a".repeat(40))).toBe(true);
    expect(isValidCommit("unknown")).toBe(false);
  });

  it("distinguishes available, current, and malformed comparisons", () => {
    expect(comparisonFromBehind(2)).toBe("UPDATE_AVAILABLE");
    expect(comparisonFromBehind(0)).toBe("UP_TO_DATE");
    expect(comparisonFromBehind(-1)).toBe("UNAVAILABLE");
    expect(shortCommit("a".repeat(40))).toHaveLength(12);
    expect(shortCommit("unknown")).toBe("unknown");
  });
});
