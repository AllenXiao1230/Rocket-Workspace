ALTER TABLE "DatabaseRow" ADD COLUMN "deletedAt" TIMESTAMP(3), ADD COLUMN "deletionBatchId" TEXT;
ALTER TABLE "Task" ADD COLUMN "deletedAt" TIMESTAMP(3), ADD COLUMN "deletionBatchId" TEXT;
ALTER TABLE "Issue" ADD COLUMN "deletedAt" TIMESTAMP(3), ADD COLUMN "deletionBatchId" TEXT;
ALTER TABLE "BomItem" ADD COLUMN "deletedAt" TIMESTAMP(3), ADD COLUMN "deletionBatchId" TEXT;
ALTER TABLE "TestRecord" ADD COLUMN "deletedAt" TIMESTAMP(3), ADD COLUMN "deletionBatchId" TEXT;

CREATE INDEX "DatabaseRow_databaseId_deletedAt_idx" ON "DatabaseRow"("databaseId", "deletedAt");
CREATE INDEX "DatabaseRow_deletionBatchId_idx" ON "DatabaseRow"("deletionBatchId");
CREATE INDEX "Task_projectId_deletedAt_idx" ON "Task"("projectId", "deletedAt");
CREATE INDEX "Task_deletionBatchId_idx" ON "Task"("deletionBatchId");
CREATE INDEX "Issue_projectId_deletedAt_idx" ON "Issue"("projectId", "deletedAt");
CREATE INDEX "Issue_deletionBatchId_idx" ON "Issue"("deletionBatchId");
CREATE INDEX "BomItem_projectId_deletedAt_idx" ON "BomItem"("projectId", "deletedAt");
CREATE INDEX "BomItem_deletionBatchId_idx" ON "BomItem"("deletionBatchId");
CREATE INDEX "TestRecord_projectId_deletedAt_idx" ON "TestRecord"("projectId", "deletedAt");
CREATE INDEX "TestRecord_deletionBatchId_idx" ON "TestRecord"("deletionBatchId");
