import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { projectAccess } from "@/lib/permissions";
import {
  readBackupStatus,
  readBackupSettings,
  writeBackupSettings,
} from "@/lib/runtime-settings";
import {
  publicWorkspaceSettings,
  readWorkspaceSettings,
  workspaceSettingsData,
} from "@/lib/workspace-settings";
import { validateExternalUrl } from "@/lib/external-url";

const settingsSchema = z.object({
  workspaceName: z.string().trim().min(1).max(100),
  projectName: z.string().trim().min(1).max(120),
  projectCode: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/, "專案代碼只能使用英文字母、數字、底線或連字號"),
  projectDescription: z.string().trim().max(1_000).nullable().optional(),
  backupIntervalHours: z.number().int().min(1).max(720).optional(),
  backupRetentionDays: z.number().int().min(1).max(3650).optional(),
  security: z
    .object({
      collaborationEnabled: z.boolean(),
      attachmentsEnabled: z.boolean(),
      markdownDownloadEnabled: z.boolean(),
      accountProvisioningEnabled: z.boolean(),
      forcePasswordChangeOnNewAccount: z.boolean(),
      minimumPasswordLength: z.number().int().min(8).max(128),
      loginRateLimitEnabled: z.boolean(),
      loginMaxAttempts: z.number().int().min(1).max(30),
      loginWindowMinutes: z.number().int().min(1).max(1440),
    })
    .optional(),
  ai: z
    .object({
      enabled: z.boolean(),
      provider: z.enum(["OPENAI_COMPATIBLE", "OLLAMA"]),
      baseUrl: z.string().trim().max(2_000),
      model: z.string().trim().max(200),
      apiKey: z.string().max(10_000).optional(),
    })
    .optional(),
  integrations: z
    .object({
      githubEnabled: z.boolean(),
      githubRepository: z.string().trim().max(200),
      githubToken: z.string().max(10_000).optional(),
      webhookEnabled: z.boolean(),
      webhookUrl: z.string().trim().max(2_000),
      webhookSecret: z.string().max(10_000).optional(),
    })
    .optional(),
});

const formFieldBySchemaPath: Record<string, string> = {
  workspaceName: "workspaceName",
  projectName: "projectName",
  projectCode: "projectCode",
  projectDescription: "projectDescription",
  backupIntervalHours: "backupIntervalHours",
  backupRetentionDays: "backupRetentionDays",
  "security.minimumPasswordLength": "minimumPasswordLength",
  "security.loginMaxAttempts": "loginMaxAttempts",
  "security.loginWindowMinutes": "loginWindowMinutes",
  "ai.baseUrl": "aiBaseUrl",
  "ai.model": "aiModel",
  "ai.apiKey": "aiApiKey",
  "integrations.githubRepository": "githubRepository",
  "integrations.webhookUrl": "webhookUrl",
  "integrations.githubToken": "githubToken",
  "integrations.webhookSecret": "webhookSecret",
};

function schemaFieldErrors(issues: z.ZodIssue[]) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const field = formFieldBySchemaPath[issue.path.join(".")];
    if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return fieldErrors;
}

async function accessFor(projectId: string) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const access = await projectAccess(session.user.id, projectId);
  return access ? { session, access } : null;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await accessFor(id);
  if (!result)
    return NextResponse.json({ error: "找不到專案或尚未登入" }, { status: 404 });
  const workspace = await prisma.workspace.findUnique({
    where: { id: result.access.project.workspaceId },
    select: { id: true, name: true, slug: true },
  });
  const [settings, backup, account] = await Promise.all([
    readWorkspaceSettings(result.access.project.workspaceId),
    readBackupSettings(),
    prisma.user.findUnique({
      where: { id: result.session.user.id },
      select: { isSystemAdmin: true },
    }),
  ]);
  const publicSettings = publicWorkspaceSettings(settings);
  return NextResponse.json({
    workspace,
    project: {
      id: result.access.project.id,
      name: result.access.project.name,
      code: result.access.project.code,
      description: result.access.project.description,
    },
    backup: { ...backup, ...(await readBackupStatus()) },
    security: publicSettings.security,
    ai: publicSettings.ai,
    integrations: publicSettings.integrations,
    canManage: ["OWNER", "ADMIN"].includes(result.access.membership.role),
    canManageHost: Boolean(account?.isSystemAdmin),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await accessFor(id);
  if (!result)
    return NextResponse.json({ error: "找不到專案或尚未登入" }, { status: 404 });
  if (!(["OWNER", "ADMIN"] as string[]).includes(result.access.membership.role))
    return NextResponse.json({ error: "只有擁有者或管理員能修改設定" }, { status: 403 });
  const input = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    const fieldErrors = schemaFieldErrors(input.error.issues);
    return NextResponse.json(
      {
        error: input.error.issues[0]?.message || "設定格式不正確",
        ...(Object.keys(fieldErrors).length ? { fieldErrors } : {}),
      },
      { status: 400 },
    );
  }
  try {
    const [current, account] = await Promise.all([
      readWorkspaceSettings(result.access.project.workspaceId),
      prisma.user.findUnique({
        where: { id: result.session.user.id },
        select: { isSystemAdmin: true },
      }),
    ]);
    const next = {
      security: input.data.security || current.security,
      ai: input.data.ai
        ? { ...input.data.ai, apiKey: input.data.ai.apiKey?.trim() || current.ai.apiKey }
        : current.ai,
      integrations: input.data.integrations
        ? {
            ...input.data.integrations,
            githubToken:
              input.data.integrations.githubToken?.trim() ||
              current.integrations.githubToken,
            webhookSecret:
              input.data.integrations.webhookSecret?.trim() ||
              current.integrations.webhookSecret,
          }
        : current.integrations,
    };
    if (next.ai.enabled) {
      const fieldErrors: Record<string, string> = {};
      if (!next.ai.baseUrl) fieldErrors.aiBaseUrl = "啟用 AI 前請填入服務網址。";
      if (!next.ai.model) fieldErrors.aiModel = "啟用 AI 前請填入模型名稱。";
      if (next.ai.provider === "OPENAI_COMPATIBLE" && !next.ai.apiKey)
        fieldErrors.aiApiKey = "啟用此服務前請填入 API 金鑰。";
      if (Object.keys(fieldErrors).length)
        return NextResponse.json(
          { error: "啟用 AI 前必須填入必要設定", fieldErrors },
          { status: 422 },
        );
      try {
        await validateExternalUrl(next.ai.baseUrl, "AI", next.ai.provider);
      } catch {
        return NextResponse.json(
          {
            error: "AI 服務網址無法使用，請確認網址與連線限制。",
            fieldErrors: { aiBaseUrl: "請使用可連線的允許網址。" },
          },
          { status: 422 },
        );
      }
    }
    if (next.integrations.webhookEnabled) {
      if (!next.integrations.webhookUrl)
        return NextResponse.json(
          {
            error: "啟用 Webhook 前必須填入 HTTPS 網址",
            fieldErrors: { webhookUrl: "啟用 Webhook 前請填入 HTTPS 網址。" },
          },
          { status: 422 },
        );
      try {
        await validateExternalUrl(next.integrations.webhookUrl, "WEBHOOK");
      } catch {
        return NextResponse.json(
          {
            error: "Webhook 網址無法使用，請確認它是可連線的 HTTPS 網址。",
            fieldErrors: { webhookUrl: "請使用可連線的 HTTPS 網址。" },
          },
          { status: 422 },
        );
      }
    }
    if (
      input.data.backupIntervalHours !== undefined ||
      input.data.backupRetentionDays !== undefined
    ) {
      if (!account?.isSystemAdmin)
        return NextResponse.json(
          { error: "只有系統管理員可調整主機備份排程" },
          { status: 403 },
        );
    }
    const settingsData = workspaceSettingsData(next);
    const [workspace, project] = await prisma.$transaction([
      prisma.workspace.update({
        where: { id: result.access.project.workspaceId },
        data: { name: input.data.workspaceName },
      }),
      prisma.project.update({
        where: { id },
        data: {
          name: input.data.projectName,
          code: input.data.projectCode,
          description:
            input.data.projectDescription === undefined
              ? undefined
              : input.data.projectDescription || null,
        },
      }),
      prisma.workspaceSettings.upsert({
        where: { workspaceId: result.access.project.workspaceId },
        update: settingsData,
        create: { workspaceId: result.access.project.workspaceId, ...settingsData },
      }),
    ]);
    if (
      input.data.backupIntervalHours !== undefined ||
      input.data.backupRetentionDays !== undefined
    ) {
      const backup = await readBackupSettings();
      await writeBackupSettings({
        intervalHours: input.data.backupIntervalHours ?? backup.intervalHours,
        retentionDays: input.data.backupRetentionDays ?? backup.retentionDays,
      });
    }
    await prisma.auditEvent.create({
      data: {
        userId: result.session.user.id,
        action: "workspace.settings_updated",
        entity: "project",
        entityId: id,
        workspaceId: result.access.project.workspaceId,
        projectId: id,
      },
    });
    const [saved, backup] = await Promise.all([
      readWorkspaceSettings(result.access.project.workspaceId),
      readBackupSettings(),
    ]);
    const publicSettings = publicWorkspaceSettings(saved);
    return NextResponse.json({
      workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
      project: {
        id: project.id,
        name: project.name,
        code: project.code,
        description: project.description,
      },
      backup: { ...backup, ...(await readBackupStatus()) },
      security: publicSettings.security,
      ai: publicSettings.ai,
      integrations: publicSettings.integrations,
      canManage: true,
      canManageHost: Boolean(account?.isSystemAdmin),
    });
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error ? String(error.code) : "";
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json(
      {
        error:
          code === "P2002"
            ? "此專案代碼已被使用"
            : message.includes("WORKSPACE_SETTINGS_ENCRYPTION_KEY")
              ? "儲存整合密鑰前，請在 .env 設定至少 32 字元的 WORKSPACE_SETTINGS_ENCRYPTION_KEY 或 AUTH_SECRET，然後重啟服務"
              : "無法儲存設定",
        ...(code === "P2002"
          ? { fieldErrors: { projectCode: "此專案代碼已被使用。" } }
          : {}),
      },
      { status: code === "P2002" ? 409 : 500 },
    );
  }
}
