import type { DatabasePropertyType } from "@prisma/client";
import type { ValidationIssue, ValidationProperty } from "@/lib/database-validation";

type ReferenceDatabase = {
  id: string;
  workspaceId: string;
  properties: ValidationProperty[];
} | null;
type ReferenceContext = {
  workspaceId: string;
  sourceProperties: ValidationProperty[];
  targetDatabase: ReferenceDatabase;
};

const config = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const id = (value: unknown) => (typeof value === "string" ? value : "");

/** Validates that relation and rollup options refer to real, same-workspace data. */
export function validatePropertyReference(
  type: DatabasePropertyType,
  options: unknown,
  context: ReferenceContext,
): ValidationIssue[] {
  if (type !== "RELATION" && type !== "ROLLUP") return [];
  const value = config(options);
  const databaseId = id(value.databaseId);
  const target = context.targetDatabase;
  if (!target || target.id !== databaseId || target.workspaceId !== context.workspaceId)
    return [{ message: "關聯目標資料庫不存在或不屬於目前工作空間" }];
  if (type === "RELATION") return [];

  const relationProperty = context.sourceProperties.find(
    (property) => property.id === id(value.relationPropertyId) && !property.deletedAt,
  );
  if (
    !relationProperty ||
    relationProperty.type !== "RELATION" ||
    id(config(relationProperty.options).databaseId) !== databaseId
  )
    return [{ message: "Rollup 必須指定連向目標資料庫的關聯欄位" }];
  const targetProperty = target.properties.find(
    (property) => property.id === id(value.targetPropertyId) && !property.deletedAt,
  );
  if (!targetProperty) return [{ message: "Rollup 目標欄位不存在或已刪除" }];
  if (value.operation === "SUM" && targetProperty.type !== "NUMBER")
    return [{ message: "SUM Rollup 的目標欄位必須是數字" }];
  return [];
}
