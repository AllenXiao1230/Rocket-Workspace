import { runTaskAutomation } from "@/lib/task-automation";
import { processDocumentSyncJobs } from "@/lib/document-sync";
import { processDatabaseImportJobs } from "@/lib/database-import";
import { processAttachmentSyncJobs } from "@/lib/attachment-sync";
import { recordSchedulerHeartbeat } from "@/lib/scheduler-heartbeat";
import { refreshDatabaseRollupCache } from "@/lib/database-rollup-cache";

const intervalMs = Math.max(
  60_000,
  Number(process.env.TASK_SCHEDULER_INTERVAL_MS || 300_000),
);
const retryIntervalMs = Math.min(intervalMs, 15_000);

async function tick() {
  try {
    const [result, documentSync, databaseImports, attachmentSync, rollupCache] =
      await Promise.all([
        runTaskAutomation(),
        processDocumentSyncJobs(),
        processDatabaseImportJobs(),
        processAttachmentSyncJobs(),
        refreshDatabaseRollupCache(),
      ]);
    await recordSchedulerHeartbeat();
    console.log(
      JSON.stringify({
        service: "task-scheduler",
        ...result,
        documentSync,
        databaseImports,
        attachmentSync,
        rollupCache,
      }),
    );
    return true;
  } catch (error) {
    console.error("task-scheduler failed", error);
    return false;
  }
}

async function run() {
  const completed = await tick();
  setTimeout(() => void run(), completed ? intervalMs : retryIntervalMs);
}

void run();
