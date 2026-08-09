import type { DatabasePropertyType } from "@prisma/client";

export type ValidationProperty = { id: string; name: string; type: DatabasePropertyType; options: unknown; deletedAt?: Date | null };
export type ValidationIssue = { propertyId?: string; message: string };

const readonlyTypes = new Set<DatabasePropertyType>(["FORMULA", "ROLLUP", "UNIQUE_ID", "CREATED_TIME", "UPDATED_TIME"]);
const stringTypes = new Set<DatabasePropertyType>(["TEXT", "URL", "EMAIL", "PHONE"]);
const optionTypes = new Set<DatabasePropertyType>(["SELECT", "STATUS", "MULTI_SELECT"]);
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const optionObject = (options: unknown) => options && typeof options === "object" && !Array.isArray(options) ? options as Record<string, unknown> : null;
const optionList = (options: unknown): string[] => { const choices = optionObject(options)?.choices; return Array.isArray(options) ? options.filter((value): value is string => typeof value === "string") : Array.isArray(choices) ? choices.filter((value): value is string => typeof value === "string") : []; };
const isIssue = (value: unknown): value is ValidationIssue => Boolean(value && typeof value === "object" && "message" in value && typeof (value as { message?: unknown }).message === "string");

function hasOnly(options: Record<string, unknown>, keys: string[]) { return Object.keys(options).every((key) => keys.includes(key)); }
function validTextConfig(options: Record<string, unknown>) { return hasOnly(options, ["description", "placeholder", "maxLength"]) && (options.description === undefined || text(options.description).length <= 300) && (options.placeholder === undefined || text(options.placeholder).length <= 120) && (options.maxLength === undefined || Number.isInteger(options.maxLength) && Number(options.maxLength) >= 1 && Number(options.maxLength) <= 10_000); }

export function validatePropertyOptions(type: DatabasePropertyType, options: unknown): ValidationIssue[] {
  if (optionTypes.has(type)) {
    const values = optionList(options);
    const config = optionObject(options);
    if (config && (!hasOnly(config, ["choices", "description", "allowCustom"]) || (config.description !== undefined && text(config.description).length > 300) || (config.allowCustom !== undefined && typeof config.allowCustom !== "boolean"))) return [{ message: "選項欄位設定不正確" }];
    if (values.length > 40 || values.some((value) => !value.trim() || value.length > 50) || new Set(values.map((value) => value.trim().toLowerCase())).size !== values.length) return [{ message: "選項必須是最多 40 個不重複、每個 50 字元以內的文字" }];
    return [];
  }
  if (type === "FORMULA") return typeof options === "object" && options !== null && !Array.isArray(options) && text((options as Record<string, unknown>).expression).length <= 500 ? [] : [{ message: "公式設定不正確" }];
  if (type === "RELATION") return typeof options === "object" && options !== null && typeof (options as Record<string, unknown>).databaseId === "string" ? [] : [{ message: "關聯欄位必須指定目標資料庫" }];
  if (type === "ROLLUP") {
    const config = options && typeof options === "object" && !Array.isArray(options) ? options as Record<string, unknown> : null;
    return config && ["databaseId", "relationPropertyId", "targetPropertyId"].every((key) => typeof config[key] === "string") && ["SHOW_ORIGINAL", "COUNT", "SUM"].includes(String(config.operation || "SHOW_ORIGINAL")) ? [] : [{ message: "Rollup 設定不正確" }];
  }
  const config = optionObject(options);
  if (!config) return options === undefined || options === null ? [] : [{ message: "此欄位不接受選項設定" }];
  if (type === "TEXT" || type === "URL" || type === "EMAIL" || type === "PHONE") return validTextConfig(config) ? [] : [{ message: "文字欄位設定不正確" }];
  if (type === "NUMBER") return hasOnly(config, ["description", "format", "precision", "currency"]) && (config.description === undefined || text(config.description).length <= 300) && (config.format === undefined || ["number", "percent", "currency"].includes(String(config.format))) && (config.precision === undefined || Number.isInteger(config.precision) && Number(config.precision) >= 0 && Number(config.precision) <= 8) && (config.currency === undefined || /^[A-Z]{3}$/.test(String(config.currency))) ? [] : [{ message: "數字欄位設定不正確" }];
  if (type === "DATE") return hasOnly(config, ["description", "includeTime"]) && (config.description === undefined || text(config.description).length <= 300) && (config.includeTime === undefined || typeof config.includeTime === "boolean") ? [] : [{ message: "日期欄位設定不正確" }];
  if (type === "CHECKBOX") return hasOnly(config, ["description", "label"]) && (config.description === undefined || text(config.description).length <= 300) && (config.label === undefined || text(config.label).length <= 120) ? [] : [{ message: "核取方塊設定不正確" }];
  if (type === "PERSON") return hasOnly(config, ["description", "multiple"]) && (config.description === undefined || text(config.description).length <= 300) && (config.multiple === undefined || typeof config.multiple === "boolean") ? [] : [{ message: "人員欄位設定不正確" }];
  if (type === "FILES") return hasOnly(config, ["description", "maxFiles"]) && (config.description === undefined || text(config.description).length <= 300) && (config.maxFiles === undefined || Number.isInteger(config.maxFiles) && Number(config.maxFiles) >= 1 && Number(config.maxFiles) <= 500) ? [] : [{ message: "檔案欄位設定不正確" }];
  return options === undefined || options === null || (typeof options === "object" && !Array.isArray(options)) ? [] : [{ message: "此欄位不接受選項設定" }];
}

function validateValue(property: ValidationProperty, value: unknown): unknown | ValidationIssue {
  if (value === null || value === undefined || value === "") return null;
  if (readonlyTypes.has(property.type)) return { propertyId: property.id, message: `「${property.name}」由系統計算，不能直接修改` };
  if (property.type === "NUMBER") return typeof value === "number" && Number.isFinite(value) ? value : { propertyId: property.id, message: `「${property.name}」必須是有效數字` };
  if (property.type === "CHECKBOX") return typeof value === "boolean" ? value : { propertyId: property.id, message: `「${property.name}」必須是核取方塊值` };
  if (property.type === "DATE") return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : { propertyId: property.id, message: `「${property.name}」必須是有效日期` };
  if (property.type === "RELATION" || property.type === "FILES") { const maxFiles = property.type === "FILES" ? Number(optionObject(property.options)?.maxFiles || 500) : 500; return Array.isArray(value) && value.length <= maxFiles && value.every((item) => typeof item === "string" && item.length <= 200) ? value : { propertyId: property.id, message: `「${property.name}」必須是項目清單` }; }
  if (property.type === "PERSON") return typeof value === "string" && value.length <= 100 ? value : { propertyId: property.id, message: `「${property.name}」必須是一位成員` };
  if (property.type === "MULTI_SELECT") {
    const options = optionList(property.options); const allowCustom = optionObject(property.options)?.allowCustom === true; return Array.isArray(value) && value.length <= 40 && value.every((item) => typeof item === "string" && (allowCustom || !options.length || options.includes(item))) ? value : { propertyId: property.id, message: `「${property.name}」包含無效選項` };
  }
  if (property.type === "SELECT" || property.type === "STATUS") {
    const item = text(value); const options = optionList(property.options); const allowCustom = optionObject(property.options)?.allowCustom === true; return item && item.length <= 50 && (allowCustom || !options.length || options.includes(item)) ? item : { propertyId: property.id, message: `「${property.name}」包含無效選項` };
  }
  if (stringTypes.has(property.type)) {
    const item = text(value); const maxLength = Number(optionObject(property.options)?.maxLength || 10_000); if (!item || item.length > maxLength) return { propertyId: property.id, message: `「${property.name}」文字不正確或過長` };
    if (property.type === "EMAIL" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)) return { propertyId: property.id, message: `「${property.name}」必須是電子郵件地址` };
    if (property.type === "URL") { try { const url = new URL(item); if (!/^https?:$/.test(url.protocol)) throw new Error(); } catch { return { propertyId: property.id, message: `「${property.name}」必須是 HTTP(S) 網址` }; } }
    if (property.type === "PHONE" && !/^[+()\-\s\d]{3,40}$/.test(item)) return { propertyId: property.id, message: `「${property.name}」電話格式不正確` };
    return item;
  }
  return { propertyId: property.id, message: `不支援「${property.name}」的直接寫入` };
}

export function validateRowValues(properties: ValidationProperty[], input: unknown): { values: Record<string, unknown>; issues: ValidationIssue[] } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { values: {}, issues: [{ message: "列資料必須是物件" }] };
  const allowed = new Map(properties.filter((property) => !property.deletedAt).map((property) => [property.id, property])); const values: Record<string, unknown> = {}; const issues: ValidationIssue[] = [];
  for (const [propertyId, value] of Object.entries(input as Record<string, unknown>)) {
    const property = allowed.get(propertyId); if (!property) { issues.push({ propertyId, message: "欄位不存在或已刪除" }); continue; }
    const result = validateValue(property, value); if (isIssue(result)) issues.push(result); else values[propertyId] = result;
  }
  return { values, issues };
}
