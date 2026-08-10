import { prisma } from "../lib/prisma";
import { readDocumentMarkdown, writeDocumentMarkdown } from "../lib/document-storage";
import { processDocumentSyncJobs } from "../lib/document-sync";

async function main() {
  const outbox = await processDocumentSyncJobs();
  const documents = await prisma.document.findMany({ orderBy: { createdAt: "asc" } });
  const results = await Promise.all(documents.map(async (document) => {
    if (await readDocumentMarkdown(document)) return false;
    await writeDocumentMarkdown(document); return true;
  }));
  console.log(`Processed ${outbox.completed} document sync jobs (${outbox.failed} failed); created ${results.filter(Boolean).length} missing Markdown documents; preserved ${results.filter((result) => !result).length} existing files.`);
}
main().finally(() => prisma.$disconnect());
