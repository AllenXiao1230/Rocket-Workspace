import path from "node:path";
import { mkdir, stat, writeFile } from "node:fs/promises";

const root = process.env.WORKSPACE_CONTENT_DIR || path.join(process.cwd(), "workspace-data");
const heartbeatPath = path.join(root, ".rocket-workspace", "scheduler-heartbeat");
const maxAgeMs = Math.max(60_000, Number(process.env.SCHEDULER_HEARTBEAT_MAX_AGE_MS || 900_000));

export async function recordSchedulerHeartbeat() {
  await mkdir(path.dirname(heartbeatPath), { recursive: true });
  await writeFile(heartbeatPath, new Date().toISOString(), "utf8");
}

export async function checkSchedulerHeartbeat() {
  const heartbeat = await stat(heartbeatPath);
  if (Date.now() - heartbeat.mtimeMs > maxAgeMs) throw new Error("Scheduler heartbeat is stale");
}
