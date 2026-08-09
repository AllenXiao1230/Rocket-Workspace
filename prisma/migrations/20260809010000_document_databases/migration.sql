-- Databases can be placed beneath a document, alongside its child pages.
ALTER TABLE "Database" ADD COLUMN "parentDocumentId" TEXT;

CREATE INDEX "Database_parentDocumentId_idx" ON "Database"("parentDocumentId");

ALTER TABLE "Database"
  ADD CONSTRAINT "Database_parentDocumentId_fkey"
  FOREIGN KEY ("parentDocumentId") REFERENCES "Document"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
