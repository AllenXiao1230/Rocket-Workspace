import path from "node:path";

type ContentNode = { type: string; attrs?: Record<string, unknown>; content?: Array<{ type: string; text: string }> };

export function externalMarkdownTitle(filename: string, markdown: string) {
  const frontmatterTitle = markdown.match(/^---\r?\n[\s\S]*?^title:\s*(.+?)\s*$[\s\S]*?^---\r?\n?/m)?.[1];
  if (frontmatterTitle) {
    try { const value = JSON.parse(frontmatterTitle); if (typeof value === "string" && value.trim()) return value.trim().slice(0, 180); } catch { /* fall back to filename */ }
  }
  const heading = markdown.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim();
  return (heading || path.basename(filename, ".md").replace(/[-_]+/g, " ") || "未命名文件").slice(0, 180);
}

export function markdownBody(markdown: string) { return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim(); }

export function markdownToDocumentContent(markdown: string) {
  const nodes: ContentNode[] = markdownBody(markdown).split(/\r?\n\s*\r?\n/).map((block) => block.trim()).filter(Boolean).map((block) => {
    const heading = block.match(/^(#{1,6})\s+(.+)$/);
    if (heading) return { type: "heading", attrs: { level: heading[1].length }, content: [{ type: "text", text: heading[2] }] };
    return { type: "paragraph", content: [{ type: "text", text: block.replace(/\r?\n/g, " ") }] };
  });
  return { type: "doc", content: nodes.length ? nodes : [{ type: "paragraph" }] };
}

export function isExternalMarkdownFilename(filename: string) {
  return filename.endsWith(".md") && !filename.startsWith(".") && filename === path.basename(filename) && filename.length <= 255;
}
