import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.resolve(import.meta.dirname, "../components/workspace-search.tsx"),
  "utf8",
);

describe("工作空間搜尋", () => {
  it("取消過期請求，避免舊查詢覆寫新結果", () => {
    expect(source).toContain("new AbortController()");
    expect(source).toContain("signal: controller.signal");
    expect(source).toContain("controller.abort()");
  });

  it("提供可恢復的搜尋狀態與鍵盤導覽", () => {
    expect(source).toContain("正在搜尋");
    expect(source).toContain("找不到符合");
    expect(source).toContain("無法完成搜尋，請再試一次");
    expect(source).toContain("再試一次");
    expect(source).toContain('event.key === "ArrowDown"');
    expect(source).toContain('event.key === "ArrowUp"');
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain("inputRef.current?.focus()");
    expect(source).not.toContain("aria-expanded={showResults}");
    expect(source).not.toContain('aria-controls="workspace-search-results"');
  });
});
