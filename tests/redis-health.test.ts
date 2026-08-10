import { describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({
  connect: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  ping: vi.fn().mockResolvedValue("PONG"),
}));

vi.mock("redis", () => ({ createClient: vi.fn(() => redis) }));

import { checkRedis } from "@/lib/redis-health";

describe("Redis readiness", () => {
  it("connects once and verifies Redis with PING", async () => {
    await expect(checkRedis()).resolves.toBeUndefined();
    expect(redis.connect).toHaveBeenCalledOnce();
    expect(redis.ping).toHaveBeenCalledOnce();
  });
});
