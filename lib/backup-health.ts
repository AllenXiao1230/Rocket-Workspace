import path from "node:path";
import { readFile } from "node:fs/promises";

type BackupHealthOptions = {
  now?: Date;
  statusDirectory?: string;
  maxAgeHours?: number;
};

export type BackupHealth = {
  backupId: string;
  createdAt: Date;
  ageMinutes: number;
};

function parseBackupId(backupId: string) {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(backupId);
  if (!match) throw new Error("Latest backup ID is invalid");
  const [, year, month, day, hour, minute, second] = match;
  const createdAt = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`);
  if (Number.isNaN(createdAt.getTime()))
    throw new Error("Latest backup timestamp is invalid");
  return createdAt;
}

function configuredMaxAgeHours() {
  const value = Number(process.env.BACKUP_MAX_AGE_HOURS || 48);
  return Number.isFinite(value) && value > 0 ? value : 48;
}

export async function checkBackupFreshness({
  now = new Date(),
  statusDirectory = process.env.BACKUP_STATUS_DIR ||
    path.join(process.cwd(), "backups/status"),
  maxAgeHours = configuredMaxAgeHours(),
}: BackupHealthOptions = {}): Promise<BackupHealth> {
  const backupId = (
    await readFile(path.join(statusDirectory, "last-success.txt"), "utf8")
  ).trim();
  const createdAt = parseBackupId(backupId);
  const ageMilliseconds = now.getTime() - createdAt.getTime();
  const maxAgeMilliseconds = maxAgeHours * 60 * 60 * 1000;
  if (ageMilliseconds < 0 || ageMilliseconds > maxAgeMilliseconds)
    throw new Error("Latest backup is stale");
  return {
    backupId,
    createdAt,
    ageMinutes: Math.floor(ageMilliseconds / 60_000),
  };
}
