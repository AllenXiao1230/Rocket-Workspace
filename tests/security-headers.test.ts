import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("HTTP security headers", () => {
  it("does not expose the framework and protects every application route", async () => {
    expect(nextConfig.poweredByHeader).toBe(false);

    const rules = await nextConfig.headers?.();
    const rule = rules?.find((item) => item.source === "/:path*");
    const headers = new Map(rule?.headers.map((header) => [header.key, header.value]));

    expect(headers.get("Content-Security-Policy")).toContain("frame-ancestors 'self'");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
  });
});
