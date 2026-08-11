CREATE TABLE "DatabaseComputedValue" (
  "id" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "databaseId" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "rowId" TEXT NOT NULL,
  "computedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DatabaseComputedValue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DatabaseComputedValue_rowId_propertyId_key"
  ON "DatabaseComputedValue"("rowId", "propertyId");
CREATE INDEX "DatabaseComputedValue_databaseId_computedAt_idx"
  ON "DatabaseComputedValue"("databaseId", "computedAt");
CREATE INDEX "DatabaseComputedValue_propertyId_computedAt_idx"
  ON "DatabaseComputedValue"("propertyId", "computedAt");

ALTER TABLE "DatabaseComputedValue"
  ADD CONSTRAINT "DatabaseComputedValue_databaseId_fkey"
  FOREIGN KEY ("databaseId") REFERENCES "Database"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DatabaseComputedValue"
  ADD CONSTRAINT "DatabaseComputedValue_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "DatabaseProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DatabaseComputedValue"
  ADD CONSTRAINT "DatabaseComputedValue_rowId_fkey"
  FOREIGN KEY ("rowId") REFERENCES "DatabaseRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
