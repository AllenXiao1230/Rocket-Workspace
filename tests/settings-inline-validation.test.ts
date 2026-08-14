import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("設定表單的可修正驗證", () => {
  it("從 API 回傳欄位級錯誤，並保留對應的表單名稱", () => {
    const route = read("app/api/projects/[id]/settings/route.ts");

    expect(route).toContain("function schemaFieldErrors");
    expect(route).toContain("fieldErrors: { projectCode:");
    expect(route).toContain("fieldErrors: { aiBaseUrl:");
    expect(route).toContain("fieldErrors: { webhookUrl:");
  });

  it("在欄旁顯示錯誤並將焦點移到第一個需要修正的控制項", () => {
    const panel = read("components/settings-panel.tsx");

    expect(panel).toContain("const [fieldErrors, setFieldErrors]");
    expect(panel).toContain("function getFieldErrors");
    expect(panel).toContain("const showFieldErrors");
    expect(panel).toContain("elements.namedItem(firstField)");
    expect(panel).toContain('{...fieldA11y("projectCode")}');
    expect(panel).toContain('{fieldError("projectCode")}');
  });
});
