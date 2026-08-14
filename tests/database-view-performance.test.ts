import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("資料庫表格效能邊界", () => {
  it("只在超過 50 列的表格檢視中使用固定高度的視窗列與語意 spacer", () => {
    const source = read("components/database-view.tsx");
    const css = read("app/globals.css");

    expect(source).toContain("const TABLE_VIRTUALIZATION_THRESHOLD = 50;");
    expect(source).toContain("const TABLE_ROW_HEIGHT = 42;");
    expect(source).toContain('activeView?.layout === "TABLE"');
    expect(source).toContain("rows.length > TABLE_VIRTUALIZATION_THRESHOLD");
    expect(source).toContain('className="database-table-spacer"');
    expect(source).toContain("tableRowIndexes.flatMap");
    expect(css).toContain(".database-table-wrap-virtualized");
    expect(css).toContain(
      ".database-table-virtualized tbody tr:not(.database-table-spacer)",
    );
  });

  it("讓 CSV 輪詢可中止、逾時清理，且資料庫變更不會套用舊結果", () => {
    const source = read("components/database-view.tsx");

    expect(source).toContain("new AbortController()");
    expect(source).toContain("signal: controller.signal");
    expect(source).toContain("controller.abort()");
    expect(source).toContain("window.clearTimeout(pollTimer)");
    expect(source).toContain("databaseRef.current.id !== databaseId");
    expect(source).not.toContain("window.setInterval");
  });

  it("為列與欄位排序保留不需拖放的鍵盤操作", () => {
    const source = read("components/database-view.tsx");

    expect(source).toContain("function moveRelative");
    expect(source).toContain("將第 ${rowIndex + 1} 列上移");
    expect(source).toContain("將欄位 ${property.name} 向左移");
    expect(source).toContain('moveRelative("rows", row.id, -1)');
    expect(source).toContain('moveRelative("properties", property.id, 1)');
    expect(source).toContain("const isManualRowOrderAvailable");
    expect(source).toContain("請先清除篩選與排序，再調整資料列的固定順序。");
  });
});
