import { describe, expect, it } from "vitest";
import { inspectUploadedFile } from "@/lib/file-signature";

describe("uploaded file signatures", () => {
  it("stores a recognized MIME type only when its bytes match the browser claim", () => {
    expect(
      inspectUploadedFile(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        "image/png",
      ),
    ).toEqual({ mimeType: "image/png" });
    expect(() =>
      inspectUploadedFile(new Uint8Array([0xff, 0xd8, 0xff]), "image/png"),
    ).toThrow("不符");
    expect(() =>
      inspectUploadedFile(new Uint8Array([0x00, 0x01]), "application/pdf"),
    ).toThrow("無法驗證");
  });

  it("rejects recognizable executable payloads regardless of a browser MIME claim", () => {
    expect(() =>
      inspectUploadedFile(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]), "text/plain"),
    ).toThrow("可執行");
    expect(() =>
      inspectUploadedFile(
        new Uint8Array([0x7f, 0x45, 0x4c, 0x46]),
        "application/octet-stream",
      ),
    ).toThrow("可執行");
  });
});
