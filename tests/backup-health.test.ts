import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkBackupFreshness } from "@/lib/backup-health";

const directories: string[] = [];

async function statusDirectory(backupId: string) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "rocket-backup-health-"));
  directories.push(directory);
  await writeFile(path.join(directory, "last-success.txt"), `${backupId}\n`);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("backup readiness", () => {
  it("accepts a recent backup and exposes its age", async () => {
    const result = await checkBackupFreshness({
      statusDirectory: await statusDirectory("20260811T000000Z"),
      now: new Date("2026-08-11T01:30:00.000Z"),
      maxAgeHours: 2,
    });

    expect(result).toMatchObject({ backupId: "20260811T000000Z", ageMinutes: 90 });
  });

  it("rejects stale and malformed backup status", async () => {
    await expect(
      checkBackupFreshness({
        statusDirectory: await statusDirectory("20260810T000000Z"),
        now: new Date("2026-08-11T01:00:00.000Z"),
        maxAgeHours: 2,
      }),
    ).rejects.toThrow("stale");
    await expect(
      checkBackupFreshness({
        statusDirectory: await statusDirectory("not-a-backup"),
      }),
    ).rejects.toThrow("invalid");
  });
});
