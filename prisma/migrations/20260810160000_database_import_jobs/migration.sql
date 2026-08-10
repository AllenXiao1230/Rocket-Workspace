CREATE TYPE "DatabaseImportStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'ROLLED_BACK');
CREATE TABLE "DatabaseImportJob" (
  "id" TEXT NOT NULL,
  "status" "DatabaseImportStatus" NOT NULL DEFAULT 'PENDING',
  "inputRows" JSONB NOT NULL,
  "errorRows" JSONB,
  "totalRows" INTEGER NOT NULL,
  "processedRows" INTEGER NOT NULL DEFAULT 0,
  "createdRows" INTEGER NOT NULL DEFAULT 0,
  "databaseId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DatabaseImportJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DatabaseImportJob_databaseId_status_createdAt_idx" ON "DatabaseImportJob"("databaseId", "status", "createdAt");
CREATE INDEX "DatabaseImportJob_userId_createdAt_idx" ON "DatabaseImportJob"("userId", "createdAt");
ALTER TABLE "DatabaseRow" ADD COLUMN "importJobId" TEXT;
CREATE INDEX "DatabaseRow_importJobId_idx" ON "DatabaseRow"("importJobId");
ALTER TABLE "DatabaseImportJob" ADD CONSTRAINT "DatabaseImportJob_databaseId_fkey" FOREIGN KEY ("databaseId") REFERENCES "Database"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DatabaseImportJob" ADD CONSTRAINT "DatabaseImportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
