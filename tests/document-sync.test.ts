import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

describe("document sync outbox", () => {
  it("keeps the durable worker API available to the scheduler", async () => {
    const source = await readFile(path.resolve("lib/document-sync.ts"), "utf8");
    expect(source).toContain("enqueueDocumentSync");
    expect(source).toContain("processDocumentSyncJobs");
    expect(source).toContain("attempts: { increment: 1 }");
  });
});
