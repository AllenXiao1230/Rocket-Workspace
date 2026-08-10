CREATE TYPE "AttachmentSyncAction" AS ENUM ('UPLOAD', 'DELETE');
CREATE TYPE "AttachmentSyncStatus" AS ENUM ('PENDING', 'READY', 'FAILED');
ALTER TABLE "Attachment" ADD COLUMN "syncStatus" "AttachmentSyncStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Attachment" ADD COLUMN "syncError" TEXT;
UPDATE "Attachment" SET "syncStatus" = 'READY';
CREATE TABLE "AttachmentSyncJob" (
  "id" TEXT NOT NULL,
  "action" "AttachmentSyncAction" NOT NULL,
  "payload" BYTEA,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "attachmentId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AttachmentSyncJob_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AttachmentSyncJob_attachmentId_key" ON "AttachmentSyncJob"("attachmentId");
CREATE INDEX "AttachmentSyncJob_createdAt_idx" ON "AttachmentSyncJob"("createdAt");
ALTER TABLE "AttachmentSyncJob" ADD CONSTRAINT "AttachmentSyncJob_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
