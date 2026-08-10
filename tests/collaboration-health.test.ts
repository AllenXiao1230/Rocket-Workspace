import { afterEach, describe, expect, it, vi } from "vitest";
import { checkCollaborationService } from "@/lib/collaboration-health";

afterEach(() => vi.unstubAllGlobals());

describe("collaboration readiness", () => {
  it("accepts a healthy collaboration response", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetch);

    await expect(checkCollaborationService()).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith("http://collab:1234/", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("rejects an unhealthy collaboration response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    await expect(checkCollaborationService()).rejects.toThrow("Collaboration service health check failed");
  });
});
