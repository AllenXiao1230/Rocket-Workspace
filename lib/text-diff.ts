export type DiffLine = { type: "same" | "added" | "removed"; text: string };

/** Compact LCS line diff used to review Markdown snapshots without external dependencies. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split("\n"); const b = after.split("\n"); const matrix = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i -= 1) for (let j = b.length - 1; j >= 0; j -= 1) matrix[i][j] = a[i] === b[j] ? matrix[i + 1][j + 1] + 1 : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
  const lines: DiffLine[] = []; let i = 0; let j = 0;
  while (i < a.length && j < b.length) { if (a[i] === b[j]) { lines.push({ type: "same", text: a[i++] }); j += 1; } else if (matrix[i + 1][j] >= matrix[i][j + 1]) lines.push({ type: "removed", text: a[i++] }); else lines.push({ type: "added", text: b[j++] }); }
  while (i < a.length) lines.push({ type: "removed", text: a[i++] }); while (j < b.length) lines.push({ type: "added", text: b[j++] }); return lines;
}
