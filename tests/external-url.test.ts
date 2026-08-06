import { describe, expect, it } from "vitest";
import { validateExternalUrl } from "@/lib/external-url";

describe("external service URL validation", () => {
  it("rejects loopback and private addresses before making a network request", async () => {
    await expect(validateExternalUrl("https://127.0.0.1/internal", "WEBHOOK")).rejects.toThrow("私有網路");
    await expect(validateExternalUrl("https://192.168.1.10/internal", "AI", "OPENAI_COMPATIBLE")).rejects.toThrow("私有網路");
    await expect(validateExternalUrl("https://localhost/internal", "WEBHOOK")).rejects.toThrow("私有網路");
  });

  it("requires HTTPS except for an explicitly allowed Ollama service", async () => {
    await expect(validateExternalUrl("http://example.com/v1", "AI", "OPENAI_COMPATIBLE")).rejects.toThrow("HTTPS");
    await expect(validateExternalUrl("http://ollama:11434", "AI", "OLLAMA")).resolves.toMatchObject({ protocol: "http:", hostname: "ollama" });
  });

  it("rejects embedded credentials and malformed URLs", async () => {
    await expect(validateExternalUrl("https://user:password@example.com/hook", "WEBHOOK")).rejects.toThrow("帳號、密碼");
    await expect(validateExternalUrl("not a URL", "WEBHOOK")).rejects.toThrow("格式不正確");
  });
});
