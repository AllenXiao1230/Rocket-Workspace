import path from "node:path";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, projectAccess } from "@/lib/permissions";
import {
  markdownBody,
  markdownToDocumentContent,
  externalMarkdownTitle,
  isExternalMarkdownFilename,
} from "@/lib/external-markdown";
import {
  readDocumentMarkdownSnapshot,
  writeDocumentMarkdown,
} from "@/lib/document-storage";

const contentRoot =
  process.env.WORKSPACE_CONTENT_DIR || path.join(process.cwd(), "workspace-data");
const documentsRoot = path.join(contentRoot, "documents");

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId } = await params;
  const access = await projectAccess(session.user.id, projectId);
  if (!access || !canWrite(access.membership.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await mkdir(documentsRoot, { recursive: true });
  const [entries, documents] = await Promise.all([
    readdir(documentsRoot, { withFileTypes: true }),
    prisma.document.findMany({
      where: { projectId, deletedAt: null },
      select: { id: true, properties: true },
    }),
  ]);
  const knownIds = new Set(documents.map((document) => document.id));
  const trackedFiles = new Set(
    documents.map((document) =>
      typeof document.properties === "object" &&
      document.properties &&
      "externalMarkdownFilename" in document.properties
        ? String(
            (document.properties as Record<string, unknown>).externalMarkdownFilename,
          )
        : "",
    ),
  );
  const candidates = entries
    .filter((entry) => entry.isFile() && isExternalMarkdownFilename(entry.name))
    .slice(0, 100);
  let imported = 0;
  let skipped = 0;
  const importedDocuments: Array<{
    id: string;
    title: string;
    icon: string;
    parentId: string | null;
    position: number;
    updatedAt: Date;
  }> = [];
  for (const entry of candidates) {
    const filename = entry.name;
    const raw = await readFile(path.join(documentsRoot, filename), "utf8");
    const storedId = raw.match(
      /^---\r?\n[\s\S]*?^id:\s*(\S+)\s*$[\s\S]*?^---\r?\n?/m,
    )?.[1];
    if (
      storedId ||
      trackedFiles.has(filename) ||
      knownIds.has(path.basename(filename, ".md"))
    ) {
      skipped += 1;
      continue;
    }
    const document = await prisma.document.create({
      data: {
        projectId,
        title: externalMarkdownTitle(filename, raw),
        content: markdownToDocumentContent(raw) as Prisma.InputJsonValue,
        properties: { externalMarkdownFilename: filename },
        position: await prisma.document.count({
          where: { projectId, parentId: null, deletedAt: null },
        }),
      },
    });
    const body = markdownBody(raw);
    await writeDocumentMarkdown(document, body);
    const snapshot = await readDocumentMarkdownSnapshot(document);
    if (snapshot)
      await prisma.document.update({
        where: { id: document.id },
        data: { markdownHash: snapshot.contentHash, markdownBase: snapshot.markdown },
      });
    importedDocuments.push({
      id: document.id,
      title: document.title,
      icon: document.icon,
      parentId: document.parentId,
      position: document.position,
      updatedAt: document.updatedAt,
    });
    imported += 1;
  }
  await prisma.auditEvent.create({
    data: {
      userId: session.user.id,
      action: "document.external_markdown_scanned",
      entity: "project",
      entityId: projectId,
      workspaceId: access.project.workspaceId,
      projectId,
      metadata: { imported, skipped },
    },
  });
  return NextResponse.json({ documents: importedDocuments, imported, skipped });
}
