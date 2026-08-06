CREATE TYPE "DocumentReviewState" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'CHANGES_REQUESTED');

ALTER TABLE "Document"
  ADD COLUMN "properties" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "reviewState" "DocumentReviewState" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "reviewRequestedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "lockedAt" TIMESTAMP(3),
  ADD COLUMN "lockedById" TEXT,
  ADD COLUMN "reviewerId" TEXT;

CREATE INDEX "Document_projectId_reviewState_idx" ON "Document"("projectId", "reviewState");
CREATE INDEX "Document_lockedById_idx" ON "Document"("lockedById");
ALTER TABLE "Document" ADD CONSTRAINT "Document_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DocumentTemplate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "icon" TEXT NOT NULL DEFAULT '📄',
  "content" JSONB NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}',
  "markdown" TEXT,
  "properties" JSONB NOT NULL DEFAULT '{}',
  "projectId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DocumentTemplate_projectId_name_key" ON "DocumentTemplate"("projectId", "name");
ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
