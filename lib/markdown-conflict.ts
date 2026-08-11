export type MarkdownMergeResult = { merged: string; conflict: boolean; summary: string };

/**
 * A conservative three-way merge for the two storage surfaces.  Automatic
 * replacement is deliberately limited to the safe cases; concurrent changes
 * are retained as standard conflict blocks so no Markdown text is discarded.
 */
export function mergeMarkdown(
  base: string,
  local: string,
  remote: string,
): MarkdownMergeResult {
  if (local === remote)
    return { merged: local, conflict: false, summary: "兩個版本內容相同。" };
  if (local === base)
    return {
      merged: remote,
      conflict: false,
      summary: "僅專案資料夾版本有變更，已安全套用。",
    };
  if (remote === base)
    return { merged: local, conflict: false, summary: "僅線上版本有變更，已安全保留。" };
  return {
    merged: [
      "<<<<<<< 線上協作版本",
      local,
      "=======",
      remote,
      ">>>>>>> 專案資料夾版本",
    ].join("\n"),
    conflict: true,
    summary: "兩邊都修改過同一份基線；已保留兩個版本，請手動整理衝突區塊後再套用。",
  };
}
