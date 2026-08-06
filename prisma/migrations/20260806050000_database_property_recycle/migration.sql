ALTER TABLE "DatabaseProperty" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "DatabaseProperty" ADD COLUMN "deletionBatchId" TEXT;
CREATE INDEX "DatabaseProperty_databaseId_deletedAt_idx" ON "DatabaseProperty"("databaseId", "deletedAt");
CREATE INDEX "DatabaseProperty_deletionBatchId_idx" ON "DatabaseProperty"("deletionBatchId");
