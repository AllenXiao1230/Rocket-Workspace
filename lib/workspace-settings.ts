import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  AiSettings,
  IntegrationSettings,
  SecuritySettings,
} from "@/lib/runtime-settings";

type StoredSecrets = Pick<AiSettings, "apiKey"> &
  Pick<IntegrationSettings, "githubToken" | "webhookSecret">;
export type WorkspaceSettings = {
  security: SecuritySettings;
  ai: AiSettings;
  integrations: IntegrationSettings;
};
export type PublicWorkspaceSettings = Omit<WorkspaceSettings, "ai" | "integrations"> & {
  ai: Omit<AiSettings, "apiKey"> & { apiKeyConfigured: boolean };
  integrations: Omit<IntegrationSettings, "githubToken" | "webhookSecret"> & {
    githubTokenConfigured: boolean;
    webhookSecretConfigured: boolean;
  };
};

const defaults = (): WorkspaceSettings => ({
  security: {
    collaborationEnabled: process.env.COLLABORATION_ENABLED !== "false",
    attachmentsEnabled: process.env.ATTACHMENTS_ENABLED !== "false",
    markdownDownloadEnabled: process.env.MARKDOWN_DOWNLOAD_ENABLED !== "false",
    accountProvisioningEnabled: false,
    forcePasswordChangeOnNewAccount: false,
    minimumPasswordLength: 12,
    loginRateLimitEnabled: false,
    loginMaxAttempts: 10,
    loginWindowMinutes: 15,
  },
  ai: {
    enabled: false,
    provider: "OPENAI_COMPATIBLE",
    baseUrl: "",
    model: "",
    apiKey: "",
  },
  integrations: {
    githubEnabled: false,
    githubRepository: "",
    githubToken: "",
    webhookEnabled: false,
    webhookUrl: "",
    webhookSecret: "",
  },
});

function asObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}
function boundedNumber(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
    ? value
    : fallback;
}
function string(value: unknown, fallback: string, max = 2_000) {
  return typeof value === "string" && value.length <= max && !/[\r\n]/.test(value)
    ? value
    : fallback;
}

function key() {
  const source = process.env.WORKSPACE_SETTINGS_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!source || source.length < 32)
    throw new Error(
      "WORKSPACE_SETTINGS_ENCRYPTION_KEY 或 AUTH_SECRET 必須設定至少 32 個字元，才能儲存整合密鑰",
    );
  return createHash("sha256").update(source).digest();
}

function encrypt(secrets: StoredSecrets) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(secrets), "utf8"),
    cipher.final(),
  ]);
  return JSON.stringify({
    v: 1,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  });
}

function decrypt(value: string | null): StoredSecrets {
  if (!value) return { apiKey: "", githubToken: "", webhookSecret: "" };
  try {
    const payload = JSON.parse(value) as {
      v: number;
      iv: string;
      tag: string;
      ciphertext: string;
    };
    if (payload.v !== 1) throw new Error("Unknown encrypted settings version");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(),
      Buffer.from(payload.iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(payload.tag, "base64url"));
    const parsed = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(payload.ciphertext, "base64url")),
        decipher.final(),
      ]).toString("utf8"),
    ) as Record<string, unknown>;
    return {
      apiKey: string(parsed.apiKey, "", 10_000),
      githubToken: string(parsed.githubToken, "", 10_000),
      webhookSecret: string(parsed.webhookSecret, "", 10_000),
    };
  } catch (error) {
    // Never silently replace an encrypted secret with an empty value.
    throw new Error(
      error instanceof Error &&
      error.message.includes("WORKSPACE_SETTINGS_ENCRYPTION_KEY")
        ? error.message
        : "工作空間整合密鑰無法解密；請確認 WORKSPACE_SETTINGS_ENCRYPTION_KEY 或 AUTH_SECRET 未被變更",
    );
  }
}

function normalize(
  record: {
    security: Prisma.JsonValue;
    ai: Prisma.JsonValue;
    integrations: Prisma.JsonValue;
    encryptedSecrets: string | null;
  } | null,
): WorkspaceSettings {
  const fallback = defaults();
  if (!record) return fallback;
  const security = asObject(record.security);
  const ai = asObject(record.ai);
  const integrations = asObject(record.integrations);
  const secrets = decrypt(record.encryptedSecrets);
  return {
    security: {
      collaborationEnabled: bool(
        security.collaborationEnabled,
        fallback.security.collaborationEnabled,
      ),
      attachmentsEnabled: bool(
        security.attachmentsEnabled,
        fallback.security.attachmentsEnabled,
      ),
      markdownDownloadEnabled: bool(
        security.markdownDownloadEnabled,
        fallback.security.markdownDownloadEnabled,
      ),
      accountProvisioningEnabled: bool(
        security.accountProvisioningEnabled,
        fallback.security.accountProvisioningEnabled,
      ),
      forcePasswordChangeOnNewAccount: bool(
        security.forcePasswordChangeOnNewAccount,
        fallback.security.forcePasswordChangeOnNewAccount,
      ),
      minimumPasswordLength: boundedNumber(
        security.minimumPasswordLength,
        fallback.security.minimumPasswordLength,
        8,
        128,
      ),
      loginRateLimitEnabled: bool(
        security.loginRateLimitEnabled,
        fallback.security.loginRateLimitEnabled,
      ),
      loginMaxAttempts: boundedNumber(
        security.loginMaxAttempts,
        fallback.security.loginMaxAttempts,
        1,
        30,
      ),
      loginWindowMinutes: boundedNumber(
        security.loginWindowMinutes,
        fallback.security.loginWindowMinutes,
        1,
        1440,
      ),
    },
    ai: {
      enabled: bool(ai.enabled, false),
      provider: ai.provider === "OLLAMA" ? "OLLAMA" : "OPENAI_COMPATIBLE",
      baseUrl: string(ai.baseUrl, ""),
      model: string(ai.model, "", 200),
      apiKey: secrets.apiKey,
    },
    integrations: {
      githubEnabled: bool(integrations.githubEnabled, false),
      githubRepository: string(integrations.githubRepository, "", 200),
      githubToken: secrets.githubToken,
      webhookEnabled: bool(integrations.webhookEnabled, false),
      webhookUrl: string(integrations.webhookUrl, ""),
      webhookSecret: secrets.webhookSecret,
    },
  };
}

export async function readWorkspaceSettings(workspaceId: string) {
  return normalize(
    await prisma.workspaceSettings.findUnique({
      where: { workspaceId },
      select: { security: true, ai: true, integrations: true, encryptedSecrets: true },
    }),
  );
}

/**
 * Login and password changes happen before the request has a workspace. For a
 * member of several workspaces, use the strictest applicable account policy.
 */
export async function readEffectiveSecuritySettings(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    select: { workspaceId: true },
  });
  const settings = await Promise.all(
    memberships.map((membership) => readWorkspaceSettings(membership.workspaceId)),
  );
  if (!settings.length) return defaults().security;
  return settings.slice(1).reduce(
    (effective, next) => ({
      ...effective,
      minimumPasswordLength: Math.max(
        effective.minimumPasswordLength,
        next.security.minimumPasswordLength,
      ),
      loginRateLimitEnabled:
        effective.loginRateLimitEnabled || next.security.loginRateLimitEnabled,
      loginMaxAttempts: Math.min(
        effective.loginMaxAttempts,
        next.security.loginMaxAttempts,
      ),
      loginWindowMinutes: Math.max(
        effective.loginWindowMinutes,
        next.security.loginWindowMinutes,
      ),
    }),
    settings[0].security,
  );
}

export function workspaceSettingsData(next: WorkspaceSettings) {
  const secrets = {
    apiKey: next.ai.apiKey,
    githubToken: next.integrations.githubToken,
    webhookSecret: next.integrations.webhookSecret,
  };
  const encryptedSecrets = Object.values(secrets).some(Boolean) ? encrypt(secrets) : null;
  return {
    security: next.security,
    ai: {
      enabled: next.ai.enabled,
      provider: next.ai.provider,
      baseUrl: next.ai.baseUrl,
      model: next.ai.model,
    },
    integrations: {
      githubEnabled: next.integrations.githubEnabled,
      githubRepository: next.integrations.githubRepository,
      webhookEnabled: next.integrations.webhookEnabled,
      webhookUrl: next.integrations.webhookUrl,
    },
    encryptedSecrets,
  };
}

export async function writeWorkspaceSettings(
  workspaceId: string,
  next: WorkspaceSettings,
) {
  const data = workspaceSettingsData(next);
  return prisma.workspaceSettings.upsert({
    where: { workspaceId },
    update: data,
    create: { workspaceId, ...data },
  });
}

export function publicWorkspaceSettings(
  settings: WorkspaceSettings,
): PublicWorkspaceSettings {
  return {
    security: settings.security,
    ai: {
      enabled: settings.ai.enabled,
      provider: settings.ai.provider,
      baseUrl: settings.ai.baseUrl,
      model: settings.ai.model,
      apiKeyConfigured: Boolean(settings.ai.apiKey),
    },
    integrations: {
      githubEnabled: settings.integrations.githubEnabled,
      githubRepository: settings.integrations.githubRepository,
      webhookEnabled: settings.integrations.webhookEnabled,
      webhookUrl: settings.integrations.webhookUrl,
      githubTokenConfigured: Boolean(settings.integrations.githubToken),
      webhookSecretConfigured: Boolean(settings.integrations.webhookSecret),
    },
  };
}
