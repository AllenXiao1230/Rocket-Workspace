import { mergeAttributes, Node } from "@tiptap/core";

export function isSafeDocumentEmbedUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "inline*",
  defining: true,
  addAttributes() {
    return {
      tone: {
        default: "info",
        parseHTML: (element) => element.getAttribute("data-tone") || "info",
        renderHTML: (attributes) => ({ "data-tone": attributes.tone }),
      },
    };
  },
  parseHTML() { return [{ tag: "div[data-callout]" }]; },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-callout": "", class: "document-callout" }, HTMLAttributes), 0];
  },
});

export const SecureEmbed = Node.create({
  name: "secureEmbed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      url: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-embed-url") || "",
        renderHTML: (attributes) => ({ "data-embed-url": isSafeDocumentEmbedUrl(attributes.url) ? attributes.url : "" }),
      },
      label: {
        default: "外部嵌入內容",
        parseHTML: (element) => element.getAttribute("data-embed-label") || "外部嵌入內容",
        renderHTML: (attributes) => ({ "data-embed-label": String(attributes.label || "外部嵌入內容").slice(0, 180) }),
      },
    };
  },
  parseHTML() { return [{ tag: "figure[data-embed-url]" }]; },
  renderHTML({ HTMLAttributes }) {
    const url = String(HTMLAttributes["data-embed-url"] || "");
    const label = String(HTMLAttributes["data-embed-label"] || "外部嵌入內容");
    return [
      "figure",
      mergeAttributes({ class: "document-embed" }, HTMLAttributes),
      ["iframe", { src: url, title: label, loading: "lazy", sandbox: "allow-scripts allow-same-origin allow-popups", referrerpolicy: "strict-origin-when-cross-origin" }],
      ["figcaption", {}, label],
    ];
  },
});
