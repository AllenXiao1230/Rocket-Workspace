import { DocumentSyncAction, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deleteDocumentMarkdown, readDocumentMarkdownSnapshot, writeDocumentMarkdown } from "@/lib/document-storage";

export async function enqueueDocumentSync(client: Prisma.TransactionClient, documentId: string, action: DocumentSyncAction, markdown?: string | null) {
  await client.documentSyncJob.upsert({
    where: { documentId },
    create: { documentId, action, markdown: markdown ?? null },
    update: { action, markdown: markdown ?? null, attempts: 0, lastError: null },
  });
}

export async function processDocumentSyncJobs(limit = 100) {
  const jobs = await prisma.documentSyncJob.findMany({ include: { document: true }, orderBy: { createdAt: "asc" }, take: limit });
  let completed = 0; let failed = 0;
  for (const job of jobs) {
    try {
      if (job.action === DocumentSyncAction.DELETE || job.document.deletedAt) await deleteDocumentMarkdown(job.document);
      else {
        await writeDocumentMarkdown(job.document, job.markdown ?? undefined);
        const snapshot = await readDocumentMarkdownSnapshot(job.document);
        if (snapshot) await prisma.document.update({ where: { id: job.documentId }, data: { markdownHash: snapshot.contentHash, markdownBase: snapshot.markdown } });
      }
      await prisma.documentSyncJob.delete({ where: { id: job.id } });
      completed += 1;
    } catch (error) {
      await prisma.documentSyncJob.update({ where: { id: job.id }, data: { attempts: { increment: 1 }, lastError: error instanceof Error ? error.message.slice(0, 1_000) : "Unknown sync error" } });
      failed += 1;
    }
  }
  return { completed, failed, pending: Math.max(0, jobs.length - completed) };
}
