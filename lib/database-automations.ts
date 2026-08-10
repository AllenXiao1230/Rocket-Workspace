import { AutomationAction, AutomationTrigger, Prisma, type DatabaseAutomation } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { type ValidationIssue, type ValidationProperty, validateRowValues } from "@/lib/database-validation";

type Values = Record<string, unknown>;
type AutomationConfig = { propertyId?: string; value?: unknown; title?: string; body?: string; values?: Values };
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const only = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every((key) => keys.includes(key));

export function validateAutomationConfig(action: AutomationAction, input: unknown, properties: ValidationProperty[]): ValidationIssue[] {
  if (!object(input)) return [{ message: "自動化設定必須是物件" }];
  if (action === "SET_PROPERTY") {
    if (!only(input, ["propertyId", "value"]) || typeof input.propertyId !== "string" || !input.propertyId) return [{ message: "設定欄位自動化時必須指定欄位與值" }];
    return validateRowValues(properties, { [input.propertyId]: input.value ?? null }).issues;
  }
  if (action === "CREATE_ROW") {
    if (!only(input, ["values"]) || !object(input.values) || !Object.keys(input.values).length) return [{ message: "建立列自動化必須提供列資料" }];
    return validateRowValues(properties, input.values).issues;
  }
  if (!only(input, ["title", "body"]) || (input.title !== undefined && (typeof input.title !== "string" || !input.title.trim() || input.title.length > 160)) || (input.body !== undefined && (typeof input.body !== "string" || input.body.length > 2_000))) return [{ message: "通知自動化設定不正確" }];
  return [];
}

export function applyAutomations(automations: Pick<DatabaseAutomation, "name" | "action" | "config">[], input: Values) {
  const values = { ...input };
  const createdRows: Values[] = [];
  const notifications: Array<{ title: string; body: string }> = [];
  for (const automation of automations) {
    const config = (automation.config || {}) as AutomationConfig;
    if (automation.action === AutomationAction.SET_PROPERTY && config.propertyId) values[config.propertyId] = config.value ?? null;
    if (automation.action === AutomationAction.NOTIFY) notifications.push({ title: typeof config.title === "string" ? config.title : automation.name, body: typeof config.body === "string" ? config.body : "Database automation ran." });
    // Rows created here go directly through Prisma, so this action cannot recursively
    // trigger itself. Keep a small cap to protect a database from a misconfigured rule set.
    if (automation.action === AutomationAction.CREATE_ROW && config.values && Object.keys(config.values).length && createdRows.length < 10) createdRows.push({ ...config.values });
  }
  return { values: values as Prisma.InputJsonValue, createdRows: createdRows.map((row) => row as Prisma.InputJsonValue), notifications };
}

export async function applyRowAutomations(databaseId: string, trigger: AutomationTrigger, input: Values) {
  const automations = await prisma.databaseAutomation.findMany({ where: { databaseId, trigger, enabled: true } });
  return applyAutomations(automations, input);
}
