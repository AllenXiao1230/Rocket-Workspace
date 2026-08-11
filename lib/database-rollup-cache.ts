import { DatabasePropertyType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type CachedDatabase = {
  id: string;
  properties: Array<{ id: string; type: DatabasePropertyType; options: unknown }>;
  rows: Array<{ id: string; values: unknown }>;
};

const optionsFor = (options: unknown) =>
  options && typeof options === "object" && !Array.isArray(options)
    ? (options as Record<string, unknown>)
    : {};

const valuesFor = (values: unknown) =>
  values && typeof values === "object" && !Array.isArray(values)
    ? (values as Record<string, unknown>)
    : {};

const idsFor = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

export function calculateRollupValue(
  row: { values: unknown },
  property: { options: unknown },
  databases: CachedDatabase[],
) {
  const config = optionsFor(property.options);
  const related = databases.find((database) => database.id === config.databaseId);
  const relatedRows = idsFor(valuesFor(row.values)[String(config.relationPropertyId)])
    .map((id) => related?.rows.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is { id: string; values: unknown } =>
      Boolean(candidate),
    );
  const values = relatedRows
    .map((candidate) => valuesFor(candidate.values)[String(config.targetPropertyId)])
    .filter((value) => value !== undefined);
  if (config.operation === "COUNT") return String(values.length);
  if (config.operation === "SUM")
    return String(values.reduce<number>((sum, value) => sum + (Number(value) || 0), 0));
  return values.map((value) => String(value ?? "")).join(", ");
}

export async function refreshDatabaseRollupCache(databaseId?: string) {
  const databases = (await prisma.database.findMany({
    where: databaseId ? { id: databaseId } : undefined,
    select: {
      id: true,
      properties: {
        where: { deletedAt: null },
        select: { id: true, type: true, options: true },
      },
      rows: { where: { deletedAt: null }, select: { id: true, values: true } },
    },
  })) as CachedDatabase[];
  if (databaseId && databases.length) {
    const rollupTargets = databases[0].properties
      .filter((property) => property.type === DatabasePropertyType.ROLLUP)
      .map((property) => String(optionsFor(property.options).databaseId || ""))
      .filter(Boolean);
    if (rollupTargets.length) {
      const targets = (await prisma.database.findMany({
        where: { id: { in: rollupTargets } },
        select: {
          id: true,
          properties: {
            where: { deletedAt: null },
            select: { id: true, type: true, options: true },
          },
          rows: { where: { deletedAt: null }, select: { id: true, values: true } },
        },
      })) as CachedDatabase[];
      databases.push(...targets);
    }
  }
  const entries = databases.flatMap((database) =>
    database.properties
      .filter((property) => property.type === DatabasePropertyType.ROLLUP)
      .flatMap((property) =>
        database.rows.map((row) => ({
          databaseId: database.id,
          propertyId: property.id,
          rowId: row.id,
          value: calculateRollupValue(row, property, databases),
        })),
      ),
  );
  if (!entries.length) return { refreshed: 0 };
  await prisma.$transaction(
    entries.map((entry) =>
      prisma.databaseComputedValue.upsert({
        where: { rowId_propertyId: { rowId: entry.rowId, propertyId: entry.propertyId } },
        create: entry,
        update: { value: entry.value, databaseId: entry.databaseId },
      }),
    ),
  );
  return { refreshed: entries.length };
}
