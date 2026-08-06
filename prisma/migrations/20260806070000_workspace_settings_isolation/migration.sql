ALTER TABLE "User" ADD COLUMN "isSystemAdmin" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "WorkspaceSettings" (
  "workspaceId" TEXT NOT NULL,
  "security" JSONB NOT NULL DEFAULT '{}',
  "ai" JSONB NOT NULL DEFAULT '{}',
  "integrations" JSONB NOT NULL DEFAULT '{}',
  "encryptedSecrets" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceSettings_pkey" PRIMARY KEY ("workspaceId")
);

ALTER TABLE "WorkspaceSettings" ADD CONSTRAINT "WorkspaceSettings_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
