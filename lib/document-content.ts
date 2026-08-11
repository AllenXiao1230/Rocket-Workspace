import { isSafeDocumentEmbedUrl } from "@/lib/editor-extensions";

type NodeLike = { type?: unknown; attrs?: Record<string, unknown>; content?: unknown[] };

/** Reject URL-bearing editor nodes that could otherwise carry script/data URLs. */
export function hasOnlySafeDocumentMedia(content: Record<string, unknown>) {
  const visit = (node: unknown): boolean => {
    if (!node || typeof node !== "object") return true;
    const value = node as NodeLike;
    if (value.type === "image" || value.type === "secureEmbed") {
      const url = value.attrs?.src ?? value.attrs?.url;
      const localAttachment =
        value.type === "image" &&
        typeof url === "string" &&
        /^\/api\/attachments\?id=[A-Za-z0-9_-]+$/.test(url);
      if (typeof url !== "string" || (!localAttachment && !isSafeDocumentEmbedUrl(url)))
        return false;
    }
    return !Array.isArray(value.content) || value.content.every(visit);
  };
  return visit(content);
}
