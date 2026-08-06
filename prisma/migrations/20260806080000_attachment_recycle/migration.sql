ALTER TABLE "Attachment" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Attachment" ADD COLUMN "deletionBatchId" TEXT;
CREATE INDEX "Attachment_documentId_deletedAt_idx" ON "Attachment"("documentId", "deletedAt");
CREATE INDEX "Attachment_deletionBatchId_idx" ON "Attachment"("deletionBatchId");
