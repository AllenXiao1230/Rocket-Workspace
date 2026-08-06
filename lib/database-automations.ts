import { AutomationAction, AutomationTrigger, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Values = Record<string, unknown>;
type AutomationConfig = { propertyId?: string; value?: unknown; title?: string; body?: string; values?: Values };

export async function applyRowAutomations(databaseId: string, trigger: AutomationTrigger, input: Values, userId: string) {
  const automations = await prisma.databaseAutomation.findMany({ where: { databaseId, trigger, enabled: true } });
  const values = { ...input };
  const createdRows: Values[] = [];
  for (const automation of automations) {
    const config = (automation.config || {}) as AutomationConfig;
    if (automation.action === AutomationAction.SET_PROPERTY && config.propertyId) values[config.propertyId] = config.value ?? "";
    if (automation.action === AutomationAction.NOTIFY) await prisma.notification.create({ data: { userId, title: config.title || automation.name, body: config.body || "Database automation ran." } });
    // Rows created here go directly through Prisma, so this action cannot recursively
    // trigger itself. Keep a small cap to protect a database from a misconfigured rule set.
    if (automation.action === AutomationAction.CREATE_ROW && config.values && Object.keys(config.values).length && createdRows.length < 10) createdRows.push({ ...config.values });
  }
  return { values: values as Prisma.InputJsonValue, createdRows: createdRows.map((row) => row as Prisma.InputJsonValue) };
}
