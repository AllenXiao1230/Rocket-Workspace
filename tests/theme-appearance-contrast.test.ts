import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.resolve(import.meta.dirname, "../components/theme-toggle.tsx"),
  "utf8",
);

describe("自訂配色安全性", () => {
  it("在套用自訂配色前檢查文字與非文字 UI 的最低對比", () => {
    expect(source).toContain("const minimumTextContrast = 4.5;");
    expect(source).toContain("const minimumUiContrast = 3;");
    expect(source).toContain(
      "contrastRatio(customAppearance.deep, customAppearance.highlight) < minimumTextContrast",
    );
    expect(source).toContain(
      "contrastRatio(customAppearance.deep, customAppearance.primary) < minimumUiContrast",
    );
  });

  it("讓衍生的 hover 與選取表面使用明暗模式專屬的安全前景色", () => {
    const theme = fs.readFileSync(
      path.resolve(import.meta.dirname, "../app/theme.css"),
      "utf8",
    );

    expect(theme).toContain("--accent-ink: #18221f;");
    expect(theme).toContain('html[data-theme="dark"] {');
    expect(theme).toContain("--accent-ink: #edf1ed;");
    expect(theme).toContain("--theme-on-sidebar: #f6f8f5;");
    expect(theme).toContain("--theme-sidebar-muted: #c6d0c8;");
    expect(theme).toContain(".sidebar .project-code");
    expect(theme).toContain(".app .avatar");
    expect(theme).toContain("--focus-ring: #18221f;");
    expect(theme).toContain("--focus-ring: #f6f8f5;");
    expect(theme).toContain(".skip-link,");
  });

  it("為主色與提示色區塊選擇可讀的文字前景色", () => {
    const themeToggle = source;
    const theme = fs.readFileSync(
      path.resolve(import.meta.dirname, "../app/theme.css"),
      "utf8",
    );

    expect(themeToggle).toContain("function readableForeground");
    expect(themeToggle).toContain('"--theme-on-primary"');
    expect(themeToggle).toContain('"--theme-on-warning"');
    expect(theme).toContain("color: var(--theme-on-primary) !important;");
    expect(theme).toContain("color: var(--theme-on-warning) !important;");
  });

  it("保留不安全草稿供使用者完成調整，但不會直接套用它", () => {
    const settings = fs.readFileSync(
      path.resolve(import.meta.dirname, "../components/settings-panel.tsx"),
      "utf8",
    );

    expect(settings).toContain("const validation = validateAppearance(next);");
    expect(settings).toContain("setAppearance(next);");
    expect(settings).toContain("目前仍使用前一組安全配色");
  });
});
