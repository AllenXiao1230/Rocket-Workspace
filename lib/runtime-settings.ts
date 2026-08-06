import path from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";

const contentRoot = process.env.WORKSPACE_CONTENT_DIR || path.join(process.cwd(), "workspace-data");
const settingsPath = path.join(contentRoot, ".rocket-workspace-settings.env");
const backupStatusRoot = process.env.BACKUP_STATUS_DIR || path.join(process.cwd(), "backups", "status");

export type BackupSettings = { intervalHours: number; retentionDays: number };
export type SecuritySettings = {
  collaborationEnabled: boolean;
  attachmentsEnabled: boolean;
  markdownDownloadEnabled: boolean;
  accountProvisioningEnabled: boolean;
  forcePasswordChangeOnNewAccount: boolean;
  minimumPasswordLength: number;
  loginRateLimitEnabled: boolean;
  loginMaxAttempts: number;
  loginWindowMinutes: number;
};
export type AiSettings = { enabled: boolean; provider: "OPENAI_COMPATIBLE" | "OLLAMA"; baseUrl: string; model: string; apiKey: string };
export type IntegrationSettings = { githubEnabled: boolean; githubRepository: string; githubToken: string; webhookEnabled: boolean; webhookUrl: string; webhookSecret: string };
export type RuntimeSettings = { backup: BackupSettings; security: SecuritySettings; ai: AiSettings; integrations: IntegrationSettings };

const defaultInterval = Number(process.env.BACKUP_INTERVAL_HOURS || 24);
const defaultRetention = Number(process.env.BACKUP_RETENTION_DAYS || 14);
function positive(value: number, fallback: number, max: number, min = 1) { return Number.isInteger(value) && value >= min && value <= max ? value : fallback; }
function enabled(value: string | undefined, fallback = true) { return value === undefined ? fallback : value !== "false"; }
function text(value: string | undefined, fallback: string, max = 2_000) { return value && value.length <= max && !/[\r\n]/.test(value) ? value : fallback; }

function defaults(): RuntimeSettings {
  return {
    backup: { intervalHours: positive(defaultInterval, 24, 720), retentionDays: positive(defaultRetention, 14, 3650) },
    security: {
      collaborationEnabled: enabled(process.env.COLLABORATION_ENABLED),
      attachmentsEnabled: enabled(process.env.ATTACHMENTS_ENABLED),
      markdownDownloadEnabled: enabled(process.env.MARKDOWN_DOWNLOAD_ENABLED),
      accountProvisioningEnabled: enabled(process.env.ACCOUNT_PROVISIONING_ENABLED, false),
      forcePasswordChangeOnNewAccount: enabled(process.env.FORCE_PASSWORD_CHANGE_ON_NEW_ACCOUNT, false),
      minimumPasswordLength: positive(Number(process.env.MINIMUM_PASSWORD_LENGTH || 12), 12, 128, 8),
      loginRateLimitEnabled: enabled(process.env.LOGIN_RATE_LIMIT_ENABLED, false),
      loginMaxAttempts: positive(Number(process.env.LOGIN_MAX_ATTEMPTS || 10), 10, 30),
      loginWindowMinutes: positive(Number(process.env.LOGIN_WINDOW_MINUTES || 15), 15, 1440),
    },
    ai: { enabled: enabled(process.env.AI_ENABLED, false), provider: process.env.AI_PROVIDER === "OLLAMA" ? "OLLAMA" : "OPENAI_COMPATIBLE", baseUrl: text(process.env.AI_BASE_URL, ""), model: text(process.env.AI_MODEL, ""), apiKey: text(process.env.AI_API_KEY, "", 10_000) },
    integrations: { githubEnabled: enabled(process.env.GITHUB_INTEGRATION_ENABLED, false), githubRepository: text(process.env.GITHUB_REPOSITORY, "", 200), githubToken: text(process.env.GITHUB_TOKEN, "", 10_000), webhookEnabled: enabled(process.env.WEBHOOK_INTEGRATION_ENABLED, false), webhookUrl: text(process.env.WEBHOOK_URL, ""), webhookSecret: text(process.env.WEBHOOK_SECRET, "", 10_000) },
  };
}

async function readValues() {
  try { return Object.fromEntries((await readFile(settingsPath, "utf8")).split("\n").map((line) => { const index = line.indexOf("="); return index < 1 ? ["", ""] : [line.slice(0, index), line.slice(index + 1)]; }).filter(([key]) => key)); } catch { return {}; }
}

export async function readRuntimeSettings(): Promise<RuntimeSettings> {
  const fallback = defaults(); const values = await readValues();
  return {
    backup: { intervalHours: positive(Number(values.BACKUP_INTERVAL_HOURS), fallback.backup.intervalHours, 720), retentionDays: positive(Number(values.BACKUP_RETENTION_DAYS), fallback.backup.retentionDays, 3650) },
    security: {
      collaborationEnabled: enabled(values.COLLABORATION_ENABLED, fallback.security.collaborationEnabled),
      attachmentsEnabled: enabled(values.ATTACHMENTS_ENABLED, fallback.security.attachmentsEnabled),
      markdownDownloadEnabled: enabled(values.MARKDOWN_DOWNLOAD_ENABLED, fallback.security.markdownDownloadEnabled),
      accountProvisioningEnabled: enabled(values.ACCOUNT_PROVISIONING_ENABLED, fallback.security.accountProvisioningEnabled),
      forcePasswordChangeOnNewAccount: enabled(values.FORCE_PASSWORD_CHANGE_ON_NEW_ACCOUNT, fallback.security.forcePasswordChangeOnNewAccount),
      minimumPasswordLength: positive(Number(values.MINIMUM_PASSWORD_LENGTH), fallback.security.minimumPasswordLength, 128, 8),
      loginRateLimitEnabled: enabled(values.LOGIN_RATE_LIMIT_ENABLED, fallback.security.loginRateLimitEnabled),
      loginMaxAttempts: positive(Number(values.LOGIN_MAX_ATTEMPTS), fallback.security.loginMaxAttempts, 30),
      loginWindowMinutes: positive(Number(values.LOGIN_WINDOW_MINUTES), fallback.security.loginWindowMinutes, 1440),
    },
    ai: { enabled: enabled(values.AI_ENABLED, fallback.ai.enabled), provider: values.AI_PROVIDER === "OLLAMA" ? "OLLAMA" : values.AI_PROVIDER === "OPENAI_COMPATIBLE" ? "OPENAI_COMPATIBLE" : fallback.ai.provider, baseUrl: text(values.AI_BASE_URL, fallback.ai.baseUrl), model: text(values.AI_MODEL, fallback.ai.model, 200), apiKey: text(values.AI_API_KEY, fallback.ai.apiKey, 10_000) },
    integrations: { githubEnabled: enabled(values.GITHUB_INTEGRATION_ENABLED, fallback.integrations.githubEnabled), githubRepository: text(values.GITHUB_REPOSITORY, fallback.integrations.githubRepository, 200), githubToken: text(values.GITHUB_TOKEN, fallback.integrations.githubToken, 10_000), webhookEnabled: enabled(values.WEBHOOK_INTEGRATION_ENABLED, fallback.integrations.webhookEnabled), webhookUrl: text(values.WEBHOOK_URL, fallback.integrations.webhookUrl), webhookSecret: text(values.WEBHOOK_SECRET, fallback.integrations.webhookSecret, 10_000) },
  };
}

export async function writeRuntimeSettings(settings: RuntimeSettings) {
  await mkdir(contentRoot, { recursive: true });
  const temporary = `${settingsPath}.tmp`;
  await writeFile(temporary, `# Managed from Rocket Workspace settings\nBACKUP_INTERVAL_HOURS=${settings.backup.intervalHours}\nBACKUP_RETENTION_DAYS=${settings.backup.retentionDays}\nCOLLABORATION_ENABLED=${settings.security.collaborationEnabled}\nATTACHMENTS_ENABLED=${settings.security.attachmentsEnabled}\nMARKDOWN_DOWNLOAD_ENABLED=${settings.security.markdownDownloadEnabled}\nACCOUNT_PROVISIONING_ENABLED=${settings.security.accountProvisioningEnabled}\nFORCE_PASSWORD_CHANGE_ON_NEW_ACCOUNT=${settings.security.forcePasswordChangeOnNewAccount}\nMINIMUM_PASSWORD_LENGTH=${settings.security.minimumPasswordLength}\nLOGIN_RATE_LIMIT_ENABLED=${settings.security.loginRateLimitEnabled}\nLOGIN_MAX_ATTEMPTS=${settings.security.loginMaxAttempts}\nLOGIN_WINDOW_MINUTES=${settings.security.loginWindowMinutes}\nAI_ENABLED=${settings.ai.enabled}\nAI_PROVIDER=${settings.ai.provider}\nAI_BASE_URL=${settings.ai.baseUrl}\nAI_MODEL=${settings.ai.model}\nAI_API_KEY=${settings.ai.apiKey}\nGITHUB_INTEGRATION_ENABLED=${settings.integrations.githubEnabled}\nGITHUB_REPOSITORY=${settings.integrations.githubRepository}\nGITHUB_TOKEN=${settings.integrations.githubToken}\nWEBHOOK_INTEGRATION_ENABLED=${settings.integrations.webhookEnabled}\nWEBHOOK_URL=${settings.integrations.webhookUrl}\nWEBHOOK_SECRET=${settings.integrations.webhookSecret}\n`, "utf8");
  await rename(temporary, settingsPath);
}

export async function readBackupSettings() { return (await readRuntimeSettings()).backup; }
export async function readSecuritySettings() { return (await readRuntimeSettings()).security; }
export async function writeBackupSettings(backup: BackupSettings) { const settings = await readRuntimeSettings(); await writeRuntimeSettings({ ...settings, backup }); }

export async function readBackupStatus() {
  const read = async (name: string) => { try { return (await readFile(path.join(backupStatusRoot, name), "utf8")).trim() || null; } catch { return null; } };
  return { lastSuccess: await read("last-success.txt"), lastFailure: await read("last-failure.txt") };
}
