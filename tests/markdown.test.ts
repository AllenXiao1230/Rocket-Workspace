import { describe, expect, it } from "vitest";
import Image from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";
import { MarkdownManager } from "@tiptap/markdown";
import { SecureEmbed } from "@/lib/editor-extensions";
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

  it("以可逆的 Markdown 保留圖片與安全嵌入內容", () => {
    const markdown = tiptapToMarkdown({
      type: "doc",
      content: [
        {
          type: "image",
          attrs: {
            src: "https://cdn.example.com/diagram.png",
            alt: "系統架構圖",
            title: "架構版本 1",
          },
        },
        {
          type: "secureEmbed",
          attrs: {
            url: "https://www.youtube.com/embed/example",
            label: '示範 "影片"',
          },
        },
      ],
    });

    expect(markdown).toContain(
      '![系統架構圖](https://cdn.example.com/diagram.png "架構版本 1")',
    );
    expect(markdown).toContain(
      ':::embed {"url":"https://www.youtube.com/embed/example","label":"示範 \\"影片\\""} :::',
    );
  });

  it("編輯器會還原並重新輸出安全嵌入指令", () => {
    const manager = new MarkdownManager({ extensions: [StarterKit, Image, SecureEmbed] });
    const markdown =
      ':::embed {"url":"https://www.youtube.com/embed/example","label":"示範影片"} :::\n';

    expect(manager.parse(markdown)).toMatchObject({
      type: "doc",
      content: [
        {
          type: "secureEmbed",
          attrs: { url: "https://www.youtube.com/embed/example", label: "示範影片" },
        },
      ],
    });
    expect(
      manager.serialize({
        type: "doc",
        content: [
          {
            type: "secureEmbed",
            attrs: { url: "https://www.youtube.com/embed/example", label: "示範影片" },
          },
        ],
      }),
    ).toBe(markdown.trim());
  });
});
