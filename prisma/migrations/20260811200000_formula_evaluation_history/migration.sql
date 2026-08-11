CREATE TABLE "FormulaEvaluationError" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "expressionHash" TEXT NOT NULL,
  "databaseId" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "rowId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FormulaEvaluationError_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FormulaEvaluationError_databaseId_propertyId_createdAt_idx"
  ON "FormulaEvaluationError"("databaseId", "propertyId", "createdAt");
CREATE INDEX "FormulaEvaluationError_databaseId_createdAt_idx"
  ON "FormulaEvaluationError"("databaseId", "createdAt");
CREATE INDEX "FormulaEvaluationError_projectId_createdAt_idx"
  ON "FormulaEvaluationError"("projectId", "createdAt");

ALTER TABLE "FormulaEvaluationError"
  ADD CONSTRAINT "FormulaEvaluationError_databaseId_fkey"
  FOREIGN KEY ("databaseId") REFERENCES "Database"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormulaEvaluationError"
  ADD CONSTRAINT "FormulaEvaluationError_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "DatabaseProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormulaEvaluationError"
  ADD CONSTRAINT "FormulaEvaluationError_rowId_fkey"
  FOREIGN KEY ("rowId") REFERENCES "DatabaseRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
