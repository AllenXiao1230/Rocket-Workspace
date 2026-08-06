import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { projectAccess } from "@/lib/permissions";
import { readBackupStatus, readRuntimeSettings, writeRuntimeSettings } from "@/lib/runtime-settings";

const settingsSchema = z.object({
  workspaceName: z.string().trim().min(1).max(100),
  projectName: z.string().trim().min(1).max(120),
  projectCode: z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9_-]+$/, "專案代碼只能使用英文字母、數字、底線或連字號"),
  projectDescription: z.string().trim().max(1_000).nullable().optional(),
  backupIntervalHours: z.number().int().min(1).max(720),
  backupRetentionDays: z.number().int().min(1).max(3650),
  security: z.object({
    collaborationEnabled: z.boolean(),
    attachmentsEnabled: z.boolean(),
    markdownDownloadEnabled: z.boolean(),
    accountProvisioningEnabled: z.boolean(),
    forcePasswordChangeOnNewAccount: z.boolean(),
    minimumPasswordLength: z.number().int().min(8).max(128),
    loginRateLimitEnabled: z.boolean(),
    loginMaxAttempts: z.number().int().min(1).max(30),
    loginWindowMinutes: z.number().int().min(1).max(1440),
  }).optional(),
  ai: z.object({ enabled: z.boolean(), provider: z.enum(["OPENAI_COMPATIBLE", "OLLAMA"]), baseUrl: z.string().trim().max(2_000), model: z.string().trim().max(200), apiKey: z.string().max(10_000).optional() }).optional(),
  integrations: z.object({ githubEnabled: z.boolean(), githubRepository: z.string().trim().max(200), githubToken: z.string().max(10_000).optional(), webhookEnabled: z.boolean(), webhookUrl: z.string().trim().max(2_000), webhookSecret: z.string().max(10_000).optional() }).optional(),
});

function publicRuntime(runtime: Awaited<ReturnType<typeof readRuntimeSettings>>) {
  return { backup: runtime.backup, security: runtime.security, ai: { enabled: runtime.ai.enabled, provider: runtime.ai.provider, baseUrl: runtime.ai.baseUrl, model: runtime.ai.model, apiKeyConfigured: Boolean(runtime.ai.apiKey) }, integrations: { githubEnabled: runtime.integrations.githubEnabled, githubRepository: runtime.integrations.githubRepository, githubTokenConfigured: Boolean(runtime.integrations.githubToken), webhookEnabled: runtime.integrations.webhookEnabled, webhookUrl: runtime.integrations.webhookUrl, webhookSecretConfigured: Boolean(runtime.integrations.webhookSecret) } };
}

async function accessFor(projectId: string) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const access = await projectAccess(session.user.id, projectId);
  return access ? { session, access } : null;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const result = await accessFor(id);
  if (!result) return NextResponse.json({ error: "找不到專案或尚未登入" }, { status: 404 });
  const workspace = await prisma.workspace.findUnique({ where: { id: result.access.project.workspaceId }, select: { id: true, name: true, slug: true } });
  const runtime = await readRuntimeSettings();
  const publicSettings = publicRuntime(runtime);
  return NextResponse.json({ workspace, project: { id: result.access.project.id, name: result.access.project.name, code: result.access.project.code, description: result.access.project.description }, backup: { ...publicSettings.backup, ...(await readBackupStatus()) }, security: publicSettings.security, ai: publicSettings.ai, integrations: publicSettings.integrations, canManage: ["OWNER", "ADMIN"].includes(result.access.membership.role) });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const result = await accessFor(id);
  if (!result) return NextResponse.json({ error: "找不到專案或尚未登入" }, { status: 404 });
  if (!(["OWNER", "ADMIN"] as string[]).includes(result.access.membership.role)) return NextResponse.json({ error: "只有擁有者或管理員能修改設定" }, { status: 403 });
  const input = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message || "設定格式不正確" }, { status: 400 });
  try {
    const [workspace, project] = await prisma.$transaction([
      prisma.workspace.update({ where: { id: result.access.project.workspaceId }, data: { name: input.data.workspaceName } }),
      prisma.project.update({ where: { id }, data: { name: input.data.projectName, code: input.data.projectCode, description: input.data.projectDescription === undefined ? undefined : input.data.projectDescription || null } }),
    ]);
    const runtime = await readRuntimeSettings();
    await writeRuntimeSettings({ backup: { intervalHours: input.data.backupIntervalHours, retentionDays: input.data.backupRetentionDays }, security: input.data.security || runtime.security, ai: input.data.ai ? { ...input.data.ai, apiKey: input.data.ai.apiKey?.trim() || runtime.ai.apiKey } : runtime.ai, integrations: input.data.integrations ? { ...input.data.integrations, githubToken: input.data.integrations.githubToken?.trim() || runtime.integrations.githubToken, webhookSecret: input.data.integrations.webhookSecret?.trim() || runtime.integrations.webhookSecret } : runtime.integrations });
    await prisma.auditEvent.create({ data: { userId: result.session.user.id, action: "workspace.settings_updated", entity: "project", entityId: id } });
    const savedRuntime = await readRuntimeSettings();
    const publicSettings = publicRuntime(savedRuntime);
    return NextResponse.json({ workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug }, project: { id: project.id, name: project.name, code: project.code, description: project.description }, backup: { ...publicSettings.backup, ...(await readBackupStatus()) }, security: publicSettings.security, ai: publicSettings.ai, integrations: publicSettings.integrations, canManage: true });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    return NextResponse.json({ error: code === "P2002" ? "此專案代碼已被使用" : "無法儲存設定" }, { status: code === "P2002" ? 409 : 500 });
  }
}
