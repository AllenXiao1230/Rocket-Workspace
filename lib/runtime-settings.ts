import path from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";

const contentRoot = process.env.WORKSPACE_CONTENT_DIR || path.join(process.cwd(), "workspace-data");
const settingsPath = path.join(contentRoot, ".rocket-workspace-settings.env");
const backupStatusRoot = process.env.BACKUP_STATUS_DIR || path.join(process.cwd(), "backups", "status");

type BackupSettings = { intervalHours: number; retentionDays: number };
const defaultInterval = Number(process.env.BACKUP_INTERVAL_HOURS || 24);
const defaultRetention = Number(process.env.BACKUP_RETENTION_DAYS || 14);

function positive(value: number, fallback: number, max: number) { return Number.isInteger(value) && value > 0 && value <= max ? value : fallback; }

export async function readBackupSettings(): Promise<BackupSettings> {
  const fallback = { intervalHours: positive(defaultInterval, 24, 720), retentionDays: positive(defaultRetention, 14, 3650) };
  try {
    const values = Object.fromEntries((await readFile(settingsPath, "utf8")).split("\n").map((line) => line.split("=", 2)).filter(([key, value]) => key && value));
    return { intervalHours: positive(Number(values.BACKUP_INTERVAL_HOURS), fallback.intervalHours, 720), retentionDays: positive(Number(values.BACKUP_RETENTION_DAYS), fallback.retentionDays, 3650) };
  } catch { return fallback; }
}

export async function writeBackupSettings(settings: BackupSettings) {
  await mkdir(contentRoot, { recursive: true });
  const temporary = `${settingsPath}.tmp`;
  await writeFile(temporary, `# Managed from Rocket Workspace settings\nBACKUP_INTERVAL_HOURS=${settings.intervalHours}\nBACKUP_RETENTION_DAYS=${settings.retentionDays}\n`, "utf8");
  await rename(temporary, settingsPath);
}

export async function readBackupStatus() {
  const read = async (name: string) => { try { return (await readFile(path.join(backupStatusRoot, name), "utf8")).trim() || null; } catch { return null; } };
  return { lastSuccess: await read("last-success.txt"), lastFailure: await read("last-failure.txt") };
}
