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
});
