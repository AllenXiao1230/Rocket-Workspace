export type DocumentEmbed = { url: string; label: string };

const localAttachmentPattern = /^\/api\/attachments\?id=[A-Za-z0-9_-]+$/;

export function isSafeDocumentEmbedUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function isSafeDocumentImageUrl(value: string) {
  return localAttachmentPattern.test(value) || isSafeDocumentEmbedUrl(value);
}

function embedLabel(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 180)
    : "外部嵌入內容";
}

/**
 * A JSON directive keeps secure embeds reversible without pretending iframe
 * content has a standard Markdown representation. JSON escaping also retains
 * quotes and newlines in labels without creating an ambiguous attribute format.
 */
export function renderDocumentEmbedMarkdown(url: unknown, label: unknown) {
  if (typeof url !== "string" || !isSafeDocumentEmbedUrl(url)) return "";
  return `:::embed ${JSON.stringify({ url, label: embedLabel(label) })} :::`;
}

export function parseDocumentEmbedMarkdown(value: string): DocumentEmbed | null {
  const match = value.trim().match(/^:::embed\s+(\{[^\r\n]*\})\s+:::\s*$/);
  if (!match) return null;
  try {
    const parsed: unknown = JSON.parse(match[1]);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const { url, label } = parsed as Record<string, unknown>;
    if (typeof url !== "string" || !isSafeDocumentEmbedUrl(url)) return null;
    return { url, label: embedLabel(label) };
  } catch {
    return null;
  }
}
