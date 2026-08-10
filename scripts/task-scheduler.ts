import { runTaskAutomation } from "@/lib/task-automation";
import { processDocumentSyncJobs } from "@/lib/document-sync";

const intervalMs = Math.max(60_000, Number(process.env.TASK_SCHEDULER_INTERVAL_MS || 300_000));
async function tick() { try { const [result, documentSync] = await Promise.all([runTaskAutomation(), processDocumentSyncJobs()]); console.log(JSON.stringify({ service: "task-scheduler", ...result, documentSync })); } catch (error) { console.error("task-scheduler failed", error); } }
void tick(); setInterval(() => void tick(), intervalMs);
