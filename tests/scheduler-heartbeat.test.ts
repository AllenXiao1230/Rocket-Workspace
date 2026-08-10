import { beforeEach, describe, expect, it, vi } from "vitest";

const fs = vi.hoisted(() => ({ mkdir: vi.fn(), stat: vi.fn(), writeFile: vi.fn() }));
vi.mock("node:fs/promises", () => fs);

import { checkSchedulerHeartbeat, recordSchedulerHeartbeat } from "@/lib/scheduler-heartbeat";

beforeEach(() => vi.clearAllMocks());

describe("scheduler heartbeat", () => {
  it("records a heartbeat in the shared workspace directory", async () => {
    await expect(recordSchedulerHeartbeat()).resolves.toBeUndefined();
    expect(fs.mkdir).toHaveBeenCalledOnce();
    expect(fs.writeFile).toHaveBeenCalledOnce();
  });

  it("accepts a fresh heartbeat and rejects a stale one", async () => {
    fs.stat.mockResolvedValueOnce({ mtimeMs: Date.now() - 1_000 });
    await expect(checkSchedulerHeartbeat()).resolves.toBeUndefined();

    fs.stat.mockResolvedValueOnce({ mtimeMs: Date.now() - 1_000_000 });
    await expect(checkSchedulerHeartbeat()).rejects.toThrow("Scheduler heartbeat is stale");
  });
});
