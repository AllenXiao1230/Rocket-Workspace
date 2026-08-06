ALTER TABLE "AuditEvent" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "AuditEvent" ADD COLUMN "projectId" TEXT;
CREATE INDEX "AuditEvent_workspaceId_createdAt_idx" ON "AuditEvent"("workspaceId", "createdAt");
CREATE INDEX "AuditEvent_projectId_createdAt_idx" ON "AuditEvent"("projectId", "createdAt");

-- Backfill only relations that can be proved from existing records. Events
-- whose original entity was permanently removed intentionally remain unscoped.
UPDATE "AuditEvent" event SET "projectId" = project."id", "workspaceId" = project."workspaceId"
FROM "Project" project WHERE event."entity" = 'project' AND event."entityId" = project."id";
UPDATE "AuditEvent" event SET "projectId" = document."projectId", "workspaceId" = project."workspaceId"
FROM "Document" document JOIN "Project" project ON project."id" = document."projectId"
WHERE event."entity" = 'document' AND event."entityId" = document."id";
UPDATE "AuditEvent" event SET "projectId" = document."projectId", "workspaceId" = project."workspaceId"
FROM "Attachment" attachment JOIN "Document" document ON document."id" = attachment."documentId" JOIN "Project" project ON project."id" = document."projectId"
WHERE event."entity" = 'attachment' AND event."entityId" = attachment."id";
UPDATE "AuditEvent" event SET "projectId" = database."projectId", "workspaceId" = project."workspaceId"
FROM "Database" database JOIN "Project" project ON project."id" = database."projectId"
WHERE event."entity" = 'database' AND event."entityId" = database."id";
UPDATE "AuditEvent" event SET "projectId" = task."projectId", "workspaceId" = project."workspaceId"
FROM "Task" task JOIN "Project" project ON project."id" = task."projectId"
WHERE event."entity" IN ('task', 'tasks') AND event."entityId" = task."id";
UPDATE "AuditEvent" event SET "projectId" = issue."projectId", "workspaceId" = project."workspaceId"
FROM "Issue" issue JOIN "Project" project ON project."id" = issue."projectId"
WHERE event."entity" = 'issues' AND event."entityId" = issue."id";
UPDATE "AuditEvent" event SET "projectId" = item."projectId", "workspaceId" = project."workspaceId"
FROM "BomItem" item JOIN "Project" project ON project."id" = item."projectId"
WHERE event."entity" = 'bom' AND event."entityId" = item."id";
UPDATE "AuditEvent" event SET "projectId" = record."projectId", "workspaceId" = project."workspaceId"
FROM "TestRecord" record JOIN "Project" project ON project."id" = record."projectId"
WHERE event."entity" = 'tests' AND event."entityId" = record."id";
UPDATE "AuditEvent" event SET "workspaceId" = membership."workspaceId"
FROM "Membership" membership WHERE event."entity" = 'membership' AND event."entityId" = membership."id";
