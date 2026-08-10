import path from "node:path";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { tiptapToMarkdown } from "@/lib/markdown";

type StoredDocument = { id: string; title: string; projectId: string; parentId: string | null; updatedAt?: Date; content: unknown; properties?: unknown };
const root = process.env.WORKSPACE_CONTENT_DIR || path.join(process.cwd(), "workspace-data");
function externalFilename(properties: unknown) {
  if (!properties || typeof properties !== "object" || !("externalMarkdownFilename" in properties)) return null;
  const filename = String((properties as Record<string, unknown>).externalMarkdownFilename || "");
  return filename.endsWith(".md") && filename === path.basename(filename) ? filename : null;
}
export function documentMarkdownPath(document: Pick<StoredDocument, "id" | "title" | "properties">) { return path.join(root, "documents", externalFilename(document.properties) || `${document.id}.md`); }
function frontmatter(document: StoredDocument) {
  return ["---", `id: ${document.id}`, `projectId: ${document.projectId}`, `parentId: ${document.parentId || ""}`, `title: ${JSON.stringify(document.title)}`, `updatedAt: ${(document.updatedAt || new Date()).toISOString()}`, "---", ""].join("\n");
}
export async function writeDocumentMarkdown(document: StoredDocument, markdown?: string) {
  await mkdir(path.join(root, "documents"), { recursive: true });
  const body = markdown ?? tiptapToMarkdown(document.content);
  const rendered = `${frontmatter(document)}${body.endsWith("\n") ? body : `${body}\n`}`;
  const target = documentMarkdownPath(document); const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, rendered, "utf8");
  await rename(temporary, target);
}
export async function deleteDocumentMarkdown(document: Pick<StoredDocument, "id" | "title" | "properties">) { try { await unlink(documentMarkdownPath(document)); } catch (error: unknown) { if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error; } }

export type MarkdownSnapshot = { markdown: string; raw: string; hash: string; contentHash: string; modifiedAt: string };
export async function readDocumentMarkdownSnapshot(document: Pick<StoredDocument, "id" | "title" | "properties">): Promise<MarkdownSnapshot | null> {
  try {
    const target = documentMarkdownPath(document); const [raw, metadata] = await Promise.all([readFile(target, "utf8"), stat(target)]);
    const markdown = raw.replace(/^---[\s\S]*?---\r?\n?/, "");
    return { markdown, raw, hash: createHash("sha256").update(raw).digest("hex"), contentHash: createHash("sha256").update(markdown).digest("hex"), modifiedAt: metadata.mtime.toISOString() };
  } catch { return null; }
}
export async function readDocumentMarkdown(document: Pick<StoredDocument, "id" | "title" | "properties">) {
  const snapshot = await readDocumentMarkdownSnapshot(document);
  return snapshot?.markdown.trim() || null;
}
