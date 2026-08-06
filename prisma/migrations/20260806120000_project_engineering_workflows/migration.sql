CREATE TYPE "ApprovalStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "PurchaseStatus" AS ENUM ('NOT_REQUIRED', 'PLANNED', 'REQUESTED', 'ORDERED', 'RECEIVED', 'CANCELLED');
CREATE TYPE "TestStepStatus" AS ENUM ('PENDING', 'PASS', 'FAIL', 'BLOCKED');

ALTER TABLE "Task"
  ADD COLUMN "parentId" TEXT,
  ADD COLUMN "milestone" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "recurrenceRule" TEXT,
  ADD COLUMN "recurrenceAnchor" TIMESTAMP(3),
  ADD COLUMN "slaDueAt" TIMESTAMP(3);
CREATE INDEX "Task_projectId_parentId_idx" ON "Task"("projectId", "parentId");
CREATE INDEX "Task_projectId_slaDueAt_idx" ON "Task"("projectId", "slaDueAt");
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "TaskWorkLog" (
  "id" TEXT NOT NULL,
  "minutes" INTEGER NOT NULL,
  "note" TEXT,
  "workDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "taskId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskWorkLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TaskWorkLog_taskId_workDate_idx" ON "TaskWorkLog"("taskId", "workDate");
CREATE INDEX "TaskWorkLog_userId_workDate_idx" ON "TaskWorkLog"("userId", "workDate");
ALTER TABLE "TaskWorkLog" ADD CONSTRAINT "TaskWorkLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskWorkLog" ADD CONSTRAINT "TaskWorkLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TaskTemplate" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "values" JSONB NOT NULL DEFAULT '{}', "projectId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaskTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TaskTemplate_projectId_name_key" ON "TaskTemplate"("projectId", "name");
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BomItem"
  ADD COLUMN "supplierPartNumber" TEXT,
  ADD COLUMN "alternatives" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "inventoryQuantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reorderPoint" INTEGER,
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'TWD',
  ADD COLUMN "version" TEXT,
  ADD COLUMN "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "purchaseStatus" "PurchaseStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "leadTimeDays" INTEGER,
  ADD COLUMN "riskLevel" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "notes" TEXT;
CREATE INDEX "BomItem_projectId_purchaseStatus_idx" ON "BomItem"("projectId", "purchaseStatus");

CREATE TABLE "TestPlan" (
  "id" TEXT NOT NULL, "title" TEXT NOT NULL, "objective" TEXT, "version" TEXT,
  "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'DRAFT', "projectId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TestPlan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TestPlan_projectId_approvalStatus_idx" ON "TestPlan"("projectId", "approvalStatus");
ALTER TABLE "TestPlan" ADD CONSTRAINT "TestPlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TestRecord" ADD COLUMN "planId" TEXT;
CREATE INDEX "TestRecord_planId_idx" ON "TestRecord"("planId");
ALTER TABLE "TestRecord" ADD CONSTRAINT "TestRecord_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TestPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "TestStep" (
  "id" TEXT NOT NULL, "position" INTEGER NOT NULL DEFAULT 0, "instruction" TEXT NOT NULL, "expected" TEXT, "actual" TEXT,
  "status" "TestStepStatus" NOT NULL DEFAULT 'PENDING', "testRecordId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TestStep_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TestStep_testRecordId_position_idx" ON "TestStep"("testRecordId", "position");
ALTER TABLE "TestStep" ADD CONSTRAINT "TestStep_testRecordId_fkey" FOREIGN KEY ("testRecordId") REFERENCES "TestRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TestMeasurement" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "value" DOUBLE PRECISION NOT NULL, "unit" TEXT, "minimum" DOUBLE PRECISION, "maximum" DOUBLE PRECISION, "testRecordId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TestMeasurement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TestMeasurement_testRecordId_idx" ON "TestMeasurement"("testRecordId");
ALTER TABLE "TestMeasurement" ADD CONSTRAINT "TestMeasurement_testRecordId_fkey" FOREIGN KEY ("testRecordId") REFERENCES "TestRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TestApproval" (
  "id" TEXT NOT NULL, "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING', "note" TEXT, "testRecordId" TEXT NOT NULL, "reviewerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TestApproval_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TestApproval_testRecordId_status_idx" ON "TestApproval"("testRecordId", "status");
ALTER TABLE "TestApproval" ADD CONSTRAINT "TestApproval_testRecordId_fkey" FOREIGN KEY ("testRecordId") REFERENCES "TestRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TestApproval" ADD CONSTRAINT "TestApproval_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Requirement" (
  "id" TEXT NOT NULL, "key" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT, "projectId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Requirement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Requirement_projectId_key_key" ON "Requirement"("projectId", "key");
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RequirementVerification" (
  "id" TEXT NOT NULL, "requirementId" TEXT NOT NULL, "testRecordId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RequirementVerification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RequirementVerification_requirementId_testRecordId_key" ON "RequirementVerification"("requirementId", "testRecordId");
CREATE INDEX "RequirementVerification_testRecordId_idx" ON "RequirementVerification"("testRecordId");
ALTER TABLE "RequirementVerification" ADD CONSTRAINT "RequirementVerification_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RequirementVerification" ADD CONSTRAINT "RequirementVerification_testRecordId_fkey" FOREIGN KEY ("testRecordId") REFERENCES "TestRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Attachment" ADD COLUMN "bomItemId" TEXT, ADD COLUMN "testRecordId" TEXT;
CREATE INDEX "Attachment_bomItemId_deletedAt_idx" ON "Attachment"("bomItemId", "deletedAt");
CREATE INDEX "Attachment_testRecordId_deletedAt_idx" ON "Attachment"("testRecordId", "deletedAt");
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_bomItemId_fkey" FOREIGN KEY ("bomItemId") REFERENCES "BomItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_testRecordId_fkey" FOREIGN KEY ("testRecordId") REFERENCES "TestRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
