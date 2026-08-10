CREATE TYPE "DocumentSyncAction" AS ENUM ('WRITE', 'DELETE');

CREATE TABLE "DocumentSyncJob" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "action" "DocumentSyncAction" NOT NULL DEFAULT 'WRITE',
  "markdown" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentSyncJob_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DocumentSyncJob_documentId_key" ON "DocumentSyncJob"("documentId");
CREATE INDEX "DocumentSyncJob_createdAt_idx" ON "DocumentSyncJob"("createdAt");
ALTER TABLE "DocumentSyncJob" ADD CONSTRAINT "DocumentSyncJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
