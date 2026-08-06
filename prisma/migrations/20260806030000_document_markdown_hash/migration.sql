-- Track the Markdown body last written by Rocket Workspace. Existing files are
-- baselined on their first monitored read so no historical user edit is erased.
ALTER TABLE "Document" ADD COLUMN "markdownHash" TEXT;
