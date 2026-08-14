import { isSafeDocumentImageUrl, isSafeDocumentEmbedUrl } from "@/lib/document-media";

type NodeLike = { type?: unknown; attrs?: Record<string, unknown>; content?: unknown[] };

/** Reject URL-bearing editor nodes that could otherwise carry script/data URLs. */
export function hasOnlySafeDocumentMedia(content: Record<string, unknown>) {
  const visit = (node: unknown): boolean => {
    if (!node || typeof node !== "object") return true;
    const value = node as NodeLike;
    if (value.type === "image" || value.type === "secureEmbed") {
      const url = value.attrs?.src ?? value.attrs?.url;
      const safe =
        value.type === "image"
          ? typeof url === "string" && isSafeDocumentImageUrl(url)
          : typeof url === "string" && isSafeDocumentEmbedUrl(url);
      if (!safe) return false;
    }
    return !Array.isArray(value.content) || value.content.every(visit);
  };
  return visit(content);
}
