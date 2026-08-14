import { describe, expect, it } from "vitest";
import {
  externalMarkdownTitle,
  isExternalMarkdownFilename,
  markdownToDocumentContent,
} from "@/lib/external-markdown";

describe("外部 Markdown 文件", () => {
  it("以檔案中繼資料或標題建立安全的文件標題與內容", () => {
    const markdown = '---\ntitle: "飛行測試"\n---\n# 摘要\n\n測試完成';
    expect(externalMarkdownTitle("ignored.md", markdown)).toBe("飛行測試");
    expect(markdownToDocumentContent(markdown)).toMatchObject({
      type: "doc",
      content: [{ type: "heading", attrs: { level: 1 } }, { type: "paragraph" }],
    });
  });

  it("只接受文件根目錄中的 Markdown 檔案", () => {
    expect(isExternalMarkdownFilename("notes.md")).toBe(true);
    expect(isExternalMarkdownFilename("../notes.md")).toBe(false);
    expect(isExternalMarkdownFilename("notes.txt")).toBe(false);
  });

  it("將安全的圖片與嵌入指令還原為文件節點", () => {
    expect(
      markdownToDocumentContent(
        '![流程圖](https://cdn.example.com/flow.png "版本 A")\n\n:::embed {"url":"https://www.youtube.com/embed/example","label":"示範影片"} :::',
      ).content,
    ).toEqual([
      {
        type: "image",
        attrs: {
          src: "https://cdn.example.com/flow.png",
          alt: "流程圖",
          title: "版本 A",
        },
      },
      {
        type: "secureEmbed",
        attrs: { url: "https://www.youtube.com/embed/example", label: "示範影片" },
      },
    ]);
  });

  it("不將不安全的媒體網址建立為可執行節點", () => {
    expect(markdownToDocumentContent("![危險](javascript:alert(1))").content).toEqual([
      {
        type: "paragraph",
        content: [{ type: "text", text: "![危險](javascript:alert(1))" }],
      },
    ]);
    expect(
      markdownToDocumentContent(
        ':::embed {"url":"http://example.com/embed","label":"不安全"} :::',
      ).content,
    ).toEqual([
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: ':::embed {"url":"http://example.com/embed","label":"不安全"} :::',
          },
        ],
      },
    ]);
  });
});
