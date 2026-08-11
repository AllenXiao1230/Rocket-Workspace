import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("可自訂外觀的主題權杖", () => {
  it("讓所有回收桶入口使用共用次要按鈕樣式", () => {
    const secondaryButtons = [
      ["components/project-module-board.tsx", "♻ 回收桶", "module-trash-toggle"],
      ["components/document-recycle-bin.tsx", "重新整理", "button-secondary"],
      ["components/document-attachments.tsx", "附件回收桶", "button-secondary"],
      ["components/database-view.tsx", "♻ 欄位回收桶", "button-secondary"],
      ["components/database-view.tsx", "♻ 已刪除列", "button-secondary"],
    ];

    for (const [file, label, className] of secondaryButtons) {
      const source = read(file);
      expect(source).toMatch(
        new RegExp(`<button[^>]*className=[^>]*${className}[^>]*>[^<]*${label}`),
      );
    }

    const theme = read("app/theme.css");
    expect(theme).toContain(".button-secondary");
    expect(theme).toContain("background: var(--panel) !important");
    expect(theme).toContain(".sidebar .database-nav button.active");
    expect(theme).toContain(".app .module-edit-toggle");
  });

  it("將所有可自訂的色彩種子輸出成語意 CSS 變數", () => {
    const source = read("components/theme-toggle.tsx");

    for (const token of [
      "--theme-primary",
      "--theme-primary-deep",
      "--theme-highlight",
      "--theme-warning",
    ]) {
      expect(source).toContain(`setProperty(\"${token}\"`);
    }
  });

  it("固定灰黑背景，並讓框線由主題主色衍生", () => {
    const css = read("app/globals.css");
    const root = css.match(/:root\s*\{([^}]*)\}/)?.[1] || "";

    expect(root).toMatch(/--app-background:\s*#25272b/);
    expect(root).toMatch(/--theme-primary:\s*#8dbd45/);
    expect(root).toMatch(/--theme-primary-deep:\s*#315a3e/);
    expect(root).toMatch(/--line:\s*color-mix\(in srgb,\s*var\(--theme-primary\)/);
    expect(root).not.toMatch(
      /--theme-(?:primary|primary-deep|highlight|warning):var\(--theme-/,
    );
    expect(read("app/theme.css")).toMatch(
      /\.app\s+\*\s*\{\s*border-color:\s*var\(--line\)\s*!important/,
    );
  });

  it("不讓既有預設配色直接寫死在元件樣式中", () => {
    const css = ["app/globals.css", "app/table-editor.css", "app/theme.css"]
      .map(read)
      .join("\n");
    const stylesWithoutDefaults = css.replace(/:root\s*\{[^}]*\}/, "");

    for (const color of ["#8dbd45", "#315a3e", "#d7f45a", "#f19156"]) {
      expect(stylesWithoutDefaults.toLowerCase()).not.toContain(color);
    }
  });
});
