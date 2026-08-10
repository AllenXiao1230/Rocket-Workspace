-- Markdown mirrors are indexed for project-scoped full-text-like substring
-- search without reading every document from the filesystem per query.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "Document_markdownBase_trgm_idx" ON "Document" USING GIN ("markdownBase" gin_trgm_ops) WHERE "deletedAt" IS NULL;
