-- A completed occurrence is processed once. This turns recurrence generation
-- from an unbounded scan/retry loop into an explicit, retry-safe work queue.
ALTER TABLE "Task" ADD COLUMN "recurrenceProcessedAt" TIMESTAMP(3);
CREATE INDEX "Task_projectId_status_recurrenceProcessedAt_idx"
  ON "Task"("projectId", "status", "recurrenceProcessedAt");
