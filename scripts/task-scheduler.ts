import { runTaskAutomation } from "@/lib/task-automation";
import { processDocumentSyncJobs } from "@/lib/document-sync";
import { processDatabaseImportJobs } from "@/lib/database-import";

const intervalMs = Math.max(60_000, Number(process.env.TASK_SCHEDULER_INTERVAL_MS || 300_000));
async function tick() { try { const [result, documentSync, databaseImports] = await Promise.all([runTaskAutomation(), processDocumentSyncJobs(), processDatabaseImportJobs()]); console.log(JSON.stringify({ service: "task-scheduler", ...result, documentSync, databaseImports })); } catch (error) { console.error("task-scheduler failed", error); } }
void tick(); setInterval(() => void tick(), intervalMs);
