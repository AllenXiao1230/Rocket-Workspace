type Mark = { type: string; attrs?: Record<string, unknown> };
type Node = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Mark[];
  content?: Node[];
};

function escapeCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
function inline(nodes: Node[] = []) {
  return nodes
    .map((node) => {
      if (node.type === "hardBreak") return "  \n";
      let value = node.text || "";
      for (const mark of node.marks || []) {
        if (mark.type === "bold") value = `**${value}**`;
        if (mark.type === "italic") value = `*${value}*`;
        if (mark.type === "underline") value = `<u>${value}</u>`;
        if (mark.type === "code") value = `\`${value}\``;
        if (mark.type === "strike") value = `~~${value}~~`;
        if (mark.type === "link") value = `[${value}](${String(mark.attrs?.href || "")})`;
      }
      return value;
    })
    .join("");
}
function render(node: Node, depth = 0): string {
  const children = node.content || [];
  if (node.type === "paragraph") return `${inline(children)}\n\n`;
  if (node.type === "heading")
    return `${"#".repeat(Number(node.attrs?.level || 1))} ${inline(children)}\n\n`;
  if (node.type === "blockquote")
    return (
      children
        .map((child) =>
          render(child, depth)
            .trimEnd()
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n"),
        )
        .join("\n") + "\n\n"
    );
  if (node.type === "codeBlock")
    return `\`\`\`${String(node.attrs?.language || "")}\n${inline(children)}\n\`\`\`\n\n`;
  if (node.type === "horizontalRule") return "---\n\n";
  if (
    node.type === "bulletList" ||
    node.type === "orderedList" ||
    node.type === "taskList"
  )
    return (
      children
        .map((child, index) => renderListItem(child, node.type, index, depth))
        .join("") + "\n"
    );
  if (node.type === "table") {
    const rows = children.map((row) =>
      (row.content || []).map((cell) =>
        inline((cell.content || []).flatMap((block) => block.content || [])),
      ),
    );
    if (!rows.length) return "";
    const head = `| ${rows[0].map(escapeCell).join(" | ")} |\n`;
    const divider = `| ${rows[0].map(() => "---").join(" | ")} |\n`;
    const body = rows
      .slice(1)
      .map((row) => `| ${row.map(escapeCell).join(" | ")} |\n`)
      .join("");
    return `${head}${divider}${body}\n`;
  }
  return children.map((child) => render(child, depth)).join("");
}
function renderListItem(
  node: Node,
  kind: string | undefined,
  index: number,
  depth: number,
) {
  const prefix =
    kind === "orderedList"
      ? `${index + 1}. `
      : kind === "taskList"
        ? `${node.attrs?.checked ? "- [x]" : "- [ ]"} `
        : "- ";
  const body = (node.content || [])
    .map((child) =>
      child.type === "paragraph"
        ? inline(child.content)
        : render(child, depth + 1).trim(),
    )
    .filter(Boolean)
    .join("\n");
  return `${"  ".repeat(depth)}${prefix}${body}\n`;
}

export function tiptapToMarkdown(content: unknown) {
  const doc = content as Node;
  return (
    (doc.content || [])
      .map((node) => render(node))
      .join("")
      .trimEnd() + "\n"
  );
}
