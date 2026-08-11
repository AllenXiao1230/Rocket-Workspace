import { readFile } from "node:fs/promises";
import {
  Prisma,
  PrismaClient,
  DatabasePropertyType,
  DatabaseViewLayout,
} from "@prisma/client";
import { writeDocumentMarkdown } from "../lib/document-storage";

type SourcePage = { id: string; title: string; text: string };
type SourceRow = Record<string, unknown> & { id: string; url?: string };
type Manifest = {
  root: SourcePage;
  pages: SourcePage[];
  taskDatabase: { id: string; rows: SourceRow[] };
};
const prisma = new PrismaClient();
const compact = (value: string) => value.replace(/[^a-zA-Z0-9]/g, "");
const docId = (sourceId: string) => `notion-${compact(sourceId).toLowerCase()}`;
const sourceUrl = (sourceId: string) => `https://app.notion.com/p/${compact(sourceId)}`;

function notionContent(raw: string) {
  try {
    const parsed = JSON.parse(raw) as { text?: unknown };
    if (typeof parsed.text === "string") return parsed.text;
  } catch {
    // Older manifests may already contain enhanced Markdown directly.
  }
  return raw;
}

function linkLabel(value: string, fallback: string) {
  const label = value
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return label || fallback;
}

function markdownFromEnhanced(raw: string, url: string) {
  const text = notionContent(raw).replace(/\r\n?/g, "\n");
  const content = text.match(/<content>\s*([\s\S]*?)\s*<\/content>/)?.[1] || text;
  const cleaned = content
    .replace(/<callout[^>]*>([\s\S]*?)<\/callout>/g, (_match, body: string) =>
      body
        .trim()
        .split("\n")
        .map((line) => `> ${line.trim()}`)
        .join("\n"),
    )
    .replace(
      /<page url="([^"]+)"[^>]*>([\s\S]*?)<\/page>/g,
      (_match, href: string, label: string) =>
        `- [${linkLabel(label, "Notion page")}](${href})`,
    )
    .replace(/<mention-page url="([^"]+)"\s*\/>/g, "[Referenced Notion page]($1)")
    .replace(
      /<database url="([^"]+)"[^>]*>([\s\S]*?)<\/database>/g,
      (_match, href: string, label: string) =>
        `- [${linkLabel(label, "Notion database")}](${href})`,
    )
    .replace(/<database url="([^"]+)"[^>]*\/>/g, "- [Notion database]($1)")
    .replace(
      /<file url="([^"]+)"[^>]*>([\s\S]*?)<\/file>/g,
      (_match, href: string, label: string) =>
        `[${linkLabel(label, "Attachment")}](${href})`,
    )
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+\n/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return `> 匯入來源：[Notion 原始頁面](${url})\n> 匯入時間：${new Date().toISOString()}\n\n${cleaned}\n`;
}
function documentTitle(title: string) {
  return title.replace(/^(?:[^\p{L}\p{N}]+)\s*/u, "").trim() || title;
}
function docContent(markdown: string): Prisma.InputJsonValue {
  return {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: markdown.slice(0, 2000) }] },
    ],
  };
}
function optionNames(schema: string, property: string) {
  const propertyChunk =
    schema.match(
      new RegExp(
        `"${property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[\\s\\S]{0,1800}?"type"`,
        "m",
      ),
    )?.[0] || "";
  return [...propertyChunk.matchAll(/"name":"([^"]+)"/g)]
    .map((match) => match[1])
    .filter((item) => item !== property);
}
function propertyType(name: string): DatabasePropertyType {
  if (name === "任務名稱" || name === "說明") return "TEXT";
  if (name === "任務類型") return "MULTI_SELECT";
  if (name === "優先順序" || name === "難度") return "SELECT";
  if (name === "到期日") return "DATE";
  if (name === "更新時間") return "UPDATED_TIME";
  if (name === "狀態") return "STATUS";
  if (name === "負責人") return "PERSON";
  if (name === "逾期") return "FORMULA";
  return "TEXT";
}
async function importPage(
  page: SourcePage,
  projectId: string,
  parentId: string | null,
  position: number,
) {
  const markdown = markdownFromEnhanced(page.text, sourceUrl(page.id));
  const id = docId(page.id);
  const document = await prisma.document.upsert({
    where: { id },
    update: {
      title: documentTitle(page.title),
      parentId,
      position,
      content: docContent(markdown),
    },
    create: {
      id,
      projectId,
      parentId,
      title: documentTitle(page.title),
      position,
      content: docContent(markdown),
    },
  });
  await writeDocumentMarkdown(document, markdown);
  return document;
}

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error("Pass a Notion manifest path.");
  const manifest = JSON.parse(await readFile(input, "utf8")) as Manifest;
  const project = await prisma.project.findFirst({ orderBy: { createdAt: "asc" } });
  if (!project) throw new Error("No project exists. Seed the workspace first.");
  const root = await importPage(manifest.root, project.id, null, 50);
  for (const [position, page] of manifest.pages.entries())
    await importPage(page, project.id, root.id, position);
  const databaseId = `notion-db-${compact(manifest.taskDatabase.id).toLowerCase()}`;
  const database = await prisma.database.upsert({
    where: { id: databaseId },
    update: { name: "任務追蹤工具（Notion 匯入）" },
    create: {
      id: databaseId,
      projectId: project.id,
      name: "任務追蹤工具（Notion 匯入）",
      icon: "✓",
    },
  });
  const schemaText = manifest.root.text;
  const names = [
    "任務名稱",
    "任務類型",
    "優先順序",
    "到期日",
    "更新時間",
    "狀態",
    "說明",
    "負責人",
    "逾期",
    "難度",
    "Notion 來源",
  ];
  const properties = await Promise.all(
    names.map(async (name, position) => {
      const id = `notion-prop-${compact(manifest.taskDatabase.id).toLowerCase()}-${position}`;
      const type = name === "Notion 來源" ? "URL" : propertyType(name);
      const options = ["任務類型", "優先順序", "難度", "狀態"].includes(name)
        ? optionNames(schemaText, name)
        : name === "逾期"
          ? { expression: "" }
          : undefined;
      return prisma.databaseProperty.upsert({
        where: { id },
        update: {
          name,
          type,
          options: options as Prisma.InputJsonValue | undefined,
          position,
        },
        create: {
          id,
          databaseId: database.id,
          name,
          type,
          options: options as Prisma.InputJsonValue | undefined,
          position,
        },
      });
    }),
  );
  const propertyByName = new Map(
    properties.map((property) => [property.name, property.id]),
  );
  for (const [position, row] of manifest.taskDatabase.rows.entries()) {
    const values: Record<string, unknown> = {};
    for (const name of names) {
      const propertyId = propertyByName.get(name)!;
      if (name === "Notion 來源") values[propertyId] = row.url || "";
      else if (name === "到期日") values[propertyId] = row["date:到期日:start"] || "";
      else if (name === "任務類型") {
        try {
          values[propertyId] = JSON.parse(String(row[name] || "[]"));
        } catch {
          values[propertyId] = [];
        }
      } else values[propertyId] = row[name] ?? "";
    }
    const id = `notion-row-${compact(String(row.id)).toLowerCase()}`;
    await prisma.databaseRow.upsert({
      where: { id },
      update: { values: values as Prisma.InputJsonValue, position },
      create: {
        id,
        databaseId: database.id,
        values: values as Prisma.InputJsonValue,
        position,
      },
    });
  }
  const viewSeed: Array<[string, DatabaseViewLayout]> = [
    ["所有任務", "TABLE"],
    ["依狀態", "BOARD"],
    ["我的任務", "TABLE"],
  ];
  for (const [position, [name, layout]] of viewSeed.entries())
    await prisma.databaseView.upsert({
      where: {
        id: `notion-view-${compact(manifest.taskDatabase.id).toLowerCase()}-${position}`,
      },
      update: { name, layout },
      create: {
        id: `notion-view-${compact(manifest.taskDatabase.id).toLowerCase()}-${position}`,
        databaseId: database.id,
        name,
        layout,
        position,
      },
    });
  await prisma.auditEvent.create({
    data: {
      action: "notion.import.completed",
      entity: "project",
      entityId: project.id,
      metadata: {
        rootPage: manifest.root.id,
        pages: manifest.pages.length + 1,
        databaseRows: manifest.taskDatabase.rows.length,
      },
    },
  });
  console.log(
    JSON.stringify({
      importedRoot: root.title,
      pages: manifest.pages.length + 1,
      database: database.name,
      rows: manifest.taskDatabase.rows.length,
    }),
  );
}
main().finally(() => prisma.$disconnect());
