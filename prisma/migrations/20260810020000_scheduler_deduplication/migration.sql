-- Give recurring tasks a stable lineage so two same-named task series do not
-- suppress each other, and make concurrent scheduler runs conflict safely.
ALTER TABLE "Task" ADD COLUMN "recurrenceSourceId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "deduplicationKey" TEXT;

CREATE UNIQUE INDEX "Task_recurrenceSourceId_recurrenceAnchor_key"
  ON "Task"("recurrenceSourceId", "recurrenceAnchor");
CREATE INDEX "Task_recurrenceSourceId_idx" ON "Task"("recurrenceSourceId");
CREATE UNIQUE INDEX "Notification_deduplicationKey_key"
  ON "Notification"("deduplicationKey");
