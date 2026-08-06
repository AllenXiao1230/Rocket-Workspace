import { describe, expect, it } from "vitest";
import { mergeMarkdown } from "@/lib/markdown-conflict";

describe("Markdown three-way merge", () => {
  it("safe-applies the only changed side", () => {
    expect(mergeMarkdown("base", "base", "file")).toMatchObject({ merged: "file", conflict: false });
    expect(mergeMarkdown("base", "online", "base")).toMatchObject({ merged: "online", conflict: false });
  });
  it("keeps both concurrent changes instead of overwriting either one", () => {
    const result = mergeMarkdown("base", "online", "file");
    expect(result.conflict).toBe(true);
    expect(result.merged).toContain("<<<<<<< 線上協作版本");
    expect(result.merged).toContain("online");
    expect(result.merged).toContain("file");
  });
});
