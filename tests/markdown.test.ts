import { describe, expect, it } from "vitest";
import { tiptapToMarkdown } from "@/lib/markdown";

describe("tiptapToMarkdown", () => {
  it("保留常用格式與安全表格跳脫", () => {
    const markdown = tiptapToMarkdown({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "測試計畫" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "重要", marks: [{ type: "bold" }] },
            { type: "text", text: "資料" },
          ],
        },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  content: [
                    { type: "paragraph", content: [{ type: "text", text: "欄位" }] },
                  ],
                },
                {
                  type: "tableHeader",
                  content: [
                    { type: "paragraph", content: [{ type: "text", text: "值" }] },
                  ],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    { type: "paragraph", content: [{ type: "text", text: "A|B" }] },
                  ],
                },
                {
                  type: "tableCell",
                  content: [
                    { type: "paragraph", content: [{ type: "text", text: "✓" }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(markdown).toContain("## 測試計畫");
    expect(markdown).toContain("**重要**資料");
    expect(markdown).toContain("| A\\|B | ✓ |");
  });

  it("空白文件仍輸出穩定的換行", () => {
    expect(tiptapToMarkdown({ type: "doc", content: [] })).toBe("\n");
  });
});
