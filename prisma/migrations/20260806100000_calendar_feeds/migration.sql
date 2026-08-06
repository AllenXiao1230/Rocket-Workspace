CREATE TABLE "CalendarFeed" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarFeed_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalendarFeed_tokenHash_key" ON "CalendarFeed"("tokenHash");
CREATE UNIQUE INDEX "CalendarFeed_projectId_key" ON "CalendarFeed"("projectId");

ALTER TABLE "CalendarFeed" ADD CONSTRAINT "CalendarFeed_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
