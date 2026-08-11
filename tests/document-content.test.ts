import { describe, expect, it } from "vitest";
import { hasOnlySafeDocumentMedia } from "@/lib/document-content";

describe("文件媒體內容驗證", () => {
  it("允許 HTTPS 圖片、嵌入與受保護附件圖片", () => {
    expect(
      hasOnlySafeDocumentMedia({
        type: "doc",
        content: [
          { type: "image", attrs: { src: "https://cdn.example.com/image.png" } },
          {
            type: "secureEmbed",
            attrs: { url: "https://www.youtube.com/embed/example" },
          },
          { type: "image", attrs: { src: "/api/attachments?id=cmabcdef123" } },
        ],
      }),
    ).toBe(true);
  });

  it("拒絕 script、data 與非 HTTPS 的媒體來源", () => {
    expect(
      hasOnlySafeDocumentMedia({
        type: "doc",
        content: [{ type: "image", attrs: { src: "javascript:alert(1)" } }],
      }),
    ).toBe(false);
    expect(
      hasOnlySafeDocumentMedia({
        type: "doc",
        content: [{ type: "image", attrs: { src: "data:image/png;base64,abc" } }],
      }),
    ).toBe(false);
    expect(
      hasOnlySafeDocumentMedia({
        type: "doc",
        content: [{ type: "secureEmbed", attrs: { url: "http://example.com/embed" } }],
      }),
    ).toBe(false);
  });
});
