const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export function toCsv(rows: string[][]) { return rows.map((row) => row.map(escape).join(",")).join("\r\n"); }

/** RFC4180-style CSV parser sufficient for client-side imports. It keeps quoted
 * commas/newlines intact and reports malformed quotes instead of guessing. */
export function parseCsv(input: string) {
  const rows: string[][] = []; let row: string[] = []; let value = ""; let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]; const next = input[index + 1];
    if (quoted) { if (char === '"' && next === '"') { value += '"'; index += 1; } else if (char === '"') quoted = false; else value += char; continue; }
    if (char === '"') { if (value) throw new Error("CSV 的引號格式不正確"); quoted = true; }
    else if (char === ",") { row.push(value); value = ""; }
    else if (char === "\n") { row.push(value.replace(/\r$/, "")); rows.push(row); row = []; value = ""; }
    else value += char;
  }
  if (quoted) throw new Error("CSV 缺少結尾引號"); if (value || row.length) { row.push(value); rows.push(row); }
  return rows.filter((item) => item.some((value) => value.trim()));
}
