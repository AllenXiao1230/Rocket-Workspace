CREATE TABLE "DocumentSyncBlock" (
  "id" TEXT NOT NULL,
  "content" TEXT NOT NULL DEFAULT '',
  "projectId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentSyncBlock_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DocumentSyncBlockLink" (
  "id" TEXT NOT NULL,
  "blockId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentSyncBlockLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DocumentSyncBlockLink_blockId_documentId_key"
  ON "DocumentSyncBlockLink"("blockId", "documentId");
CREATE INDEX "DocumentSyncBlock_projectId_updatedAt_idx"
  ON "DocumentSyncBlock"("projectId", "updatedAt");
CREATE INDEX "DocumentSyncBlockLink_documentId_createdAt_idx"
  ON "DocumentSyncBlockLink"("documentId", "createdAt");
ALTER TABLE "DocumentSyncBlock"
  ADD CONSTRAINT "DocumentSyncBlock_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentSyncBlockLink"
  ADD CONSTRAINT "DocumentSyncBlockLink_blockId_fkey"
  FOREIGN KEY ("blockId") REFERENCES "DocumentSyncBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentSyncBlockLink"
  ADD CONSTRAINT "DocumentSyncBlockLink_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
