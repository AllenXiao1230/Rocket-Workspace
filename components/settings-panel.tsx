"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MemberSettings } from "@/components/member-settings";
import { StatusMessage } from "@/components/status-message";
import {
  accentPresets,
  applyAppearance,
  applyTheme,
  getStoredAppearance,
  type AccentPreset,
  type Appearance,
} from "@/components/theme-toggle";
import type { TeamMember } from "@/components/team-management";

type Security = {
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
type Ai = {
  enabled: boolean;
  provider: "OPENAI_COMPATIBLE" | "OLLAMA";
  baseUrl: string;
  model: string;
  apiKeyConfigured: boolean;
};
type Integrations = {
  githubEnabled: boolean;
  githubRepository: string;
  githubTokenConfigured: boolean;
  webhookEnabled: boolean;
  webhookUrl: string;
  webhookSecretConfigured: boolean;
};
type Settings = {
  workspace: { id: string; name: string; slug: string } | null;
  project: { id: string; name: string; code: string; description: string | null };
  backup: {
    intervalHours: number;
    retentionDays: number;
    lastSuccess: string | null;
    lastFailure: string | null;
  };
  security: Security;
  ai: Ai;
  integrations: Integrations;
  canManage: boolean;
  canManageHost: boolean;
};
type Profile = {
  name: string;
  email: string;
  avatarEmoji: string | null;
  avatarUrl: string | null;
};
type AuditEvent = {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  projectId: string | null;
  createdAt: string;
  user: { name: string; email: string } | null;
};
type CalendarFeed = {
  enabled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};
type ScannedDocument = {
  id: string;
  title: string;
  icon: string;
  parentId: string | null;
  position: number;
  updatedAt: string;
};

export function SettingsPanel({
  projectId,
  workspaceId,
  onIdentitySaved,
  onMembersChange,
  onProfileSaved,
  onProjectCreated,
  onDocumentsScanned,
}: {
  projectId: string;
  workspaceId: string;
  onIdentitySaved: (values: {
    workspaceName: string;
    projectName: string;
    projectCode: string;
  }) => void;
  onMembersChange: (members: TeamMember[]) => void;
  onProfileSaved: (profile: Pick<Profile, "name" | "avatarEmoji" | "avatarUrl">) => void;
  onProjectCreated: (projectId: string) => void;
  onDocumentsScanned: (documents: ScannedDocument[]) => void;
}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [notice, setNotice] = useState("");
  const [profileNotice, setProfileNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [appearance, setAppearance] = useState<Appearance>({
    preset: "rocket",
    ...accentPresets.rocket,
  });
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectCode, setNewProjectCode] = useState("");
  const [projectNotice, setProjectNotice] = useState("");
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditNotice, setAuditNotice] = useState("");
  const [calendarFeed, setCalendarFeed] = useState<CalendarFeed | null>(null);
  const [calendarUrl, setCalendarUrl] = useState("");
  const [calendarNotice, setCalendarNotice] = useState("");
  const [calendarWorking, setCalendarWorking] = useState(false);
  const [scanWorking, setScanWorking] = useState(false);
  const [scanNotice, setScanNotice] = useState("");
  const [confirmCalendarRevoke, setConfirmCalendarRevoke] = useState(false);

  useEffect(() => {
    void fetch(`/api/projects/${projectId}/settings`)
      .then((response) => (response.ok ? response.json() : null))
      .then(setSettings);
  }, [projectId]);
  useEffect(() => {
    void fetch("/api/account/profile")
      .then((response) => (response.ok ? response.json() : null))
      .then(setProfile);
  }, []);
  const loadAuditEvents = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/audit-events?limit=50`, {
      cache: "no-store",
    });
    if (!response.ok) return setAuditNotice("無法讀取操作紀錄");
    const result = (await response.json()) as { events: AuditEvent[] };
    setAuditEvents(result.events);
    setAuditNotice("");
  }, [projectId]);
  useEffect(() => {
    if (settings?.canManage) void loadAuditEvents();
    else setAuditEvents([]);
  }, [settings?.canManage, loadAuditEvents]);
  useEffect(() => {
    if (!settings?.canManage) return setCalendarFeed(null);
    void fetch(`/api/projects/${projectId}/calendar-feed`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then(setCalendarFeed);
  }, [projectId, settings?.canManage]);
  useEffect(() => {
    setAppearance(getStoredAppearance());
  }, []);
  const setTheme = (theme: "light" | "dark") => {
    applyTheme(theme);
    applyAppearance(appearance);
    setNotice(theme === "dark" ? "已切換為暗色模式" : "已切換為淺色模式");
  };
  const setAccent = (next: Appearance, message = "配色已套用並儲存在目前瀏覽器") => {
    setAppearance(next);
    applyAppearance(next);
    setNotice(message);
  };
  const selectPreset = (preset: Exclude<AccentPreset, "custom">) =>
    setAccent({ preset, ...accentPresets[preset] });

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings?.canManage) return;
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setNotice("");
    const security: Security = {
      collaborationEnabled: data.get("collaborationEnabled") === "on",
      attachmentsEnabled: data.get("attachmentsEnabled") === "on",
      markdownDownloadEnabled: data.get("markdownDownloadEnabled") === "on",
      accountProvisioningEnabled: data.get("accountProvisioningEnabled") === "on",
      forcePasswordChangeOnNewAccount:
        data.get("forcePasswordChangeOnNewAccount") === "on",
      minimumPasswordLength: Number(data.get("minimumPasswordLength")),
      loginRateLimitEnabled: data.get("loginRateLimitEnabled") === "on",
      loginMaxAttempts: Number(data.get("loginMaxAttempts")),
      loginWindowMinutes: Number(data.get("loginWindowMinutes")),
    };
    const ai = {
      enabled: data.get("aiEnabled") === "on",
      provider: String(data.get("aiProvider")) as Ai["provider"],
      baseUrl: String(data.get("aiBaseUrl") || "").trim(),
      model: String(data.get("aiModel") || "").trim(),
      apiKey: String(data.get("aiApiKey") || ""),
    };
    const integrations = {
      githubEnabled: data.get("githubEnabled") === "on",
      githubRepository: String(data.get("githubRepository") || "").trim(),
      githubToken: String(data.get("githubToken") || ""),
      webhookEnabled: data.get("webhookEnabled") === "on",
      webhookUrl: String(data.get("webhookUrl") || "").trim(),
      webhookSecret: String(data.get("webhookSecret") || ""),
    };
    const payload = {
      workspaceName: data.get("workspaceName"),
      projectName: data.get("projectName"),
      projectCode: data.get("projectCode"),
      projectDescription: String(data.get("projectDescription") || "").trim() || null,
      security,
      ai,
      integrations,
      ...(settings.canManageHost
        ? {
            backupIntervalHours: Number(data.get("backupIntervalHours")),
            backupRetentionDays: Number(data.get("backupRetentionDays")),
          }
        : {}),
    };
    const response = await fetch(`/api/projects/${projectId}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) return setNotice(result.error || "無法儲存設定");
    setSettings(result);
    onIdentitySaved({
      workspaceName: result.workspace.name,
      projectName: result.project.name,
      projectCode: result.project.code,
    });
    setNotice("設定已儲存；安全開關會立即套用於新的操作。 ");
  }
  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.get("profileName"),
        avatarEmoji: String(data.get("avatarEmoji") || "").trim() || null,
      }),
    });
    const result = await response.json();
    if (!response.ok) return setProfileNotice(result.error || "無法儲存個人資料");
    setProfile(result);
    onProfileSaved(result);
    setProfileNotice("個人頭像與名稱已更新。");
  }
  async function uploadAvatar(file: File | undefined) {
    if (!file) return;
    setProfileNotice("正在上傳頭像…");
    const data = new FormData();
    data.set("file", file);
    const response = await fetch("/api/account/avatar", { method: "POST", body: data });
    const result = await response.json();
    if (!response.ok) return setProfileNotice(result.error || "頭像上傳失敗");
    setProfile((current) =>
      current ? { ...current, avatarUrl: result.avatarUrl } : current,
    );
    onProfileSaved({
      name: profile?.name || "",
      avatarEmoji: profile?.avatarEmoji || null,
      avatarUrl: result.avatarUrl,
    });
    setProfileNotice("頭像已更新。");
  }
  async function removeAvatar() {
    const response = await fetch("/api/account/avatar", { method: "DELETE" });
    if (!response.ok) return setProfileNotice("無法移除頭像");
    setProfile((current) => (current ? { ...current, avatarUrl: null } : current));
    onProfileSaved({
      name: profile?.name || "",
      avatarEmoji: profile?.avatarEmoji || null,
      avatarUrl: null,
    });
    setProfileNotice("已移除自訂照片頭像。");
  }
  async function createProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings?.canManage) return;
    setProjectNotice("建立中…");
    const response = await fetch(`/api/workspaces/${workspaceId}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newProjectName, code: newProjectCode }),
    });
    const result = (await response.json()) as { id?: string; error?: string };
    if (!response.ok || !result.id)
      return setProjectNotice(result.error || "無法建立專案");
    setProjectNotice("專案已建立，正在切換…");
    onProjectCreated(result.id);
  }
  async function rotateCalendarFeed() {
    setCalendarWorking(true);
    setCalendarNotice("");
    const response = await fetch(`/api/projects/${projectId}/calendar-feed`, {
      method: "POST",
    });
    const result = (await response.json()) as {
      token?: string;
      relativeUrl?: string;
      error?: string;
    };
    setCalendarWorking(false);
    if (!response.ok || !result.relativeUrl)
      return setCalendarNotice(result.error || "無法建立日曆訂閱網址");
    setCalendarUrl(new URL(result.relativeUrl, window.location.origin).toString());
    setCalendarFeed({
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setCalendarNotice("已產生新訂閱網址；舊網址已立即失效，請複製並存入你的日曆服務。");
  }
  async function revokeCalendarFeed() {
    setCalendarWorking(true);
    setCalendarNotice("");
    const response = await fetch(`/api/projects/${projectId}/calendar-feed`, {
      method: "DELETE",
    });
    setCalendarWorking(false);
    if (!response.ok) return setCalendarNotice("無法停用日曆訂閱");
    setCalendarFeed({ enabled: false, createdAt: null, updatedAt: null });
    setCalendarUrl("");
    setCalendarNotice("日曆訂閱已停用。");
  }
  async function copyCalendarUrl() {
    if (!calendarUrl) return;
    try {
      await navigator.clipboard.writeText(calendarUrl);
      setCalendarNotice("日曆網址已複製。");
    } catch {
      setCalendarNotice("無法自動複製；請手動選取網址。 ");
    }
  }
  async function scanDocuments() {
    setScanWorking(true);
    setScanNotice("");
    const response = await fetch(`/api/projects/${projectId}/documents/scan`, {
      method: "POST",
    });
    const result = (await response.json()) as {
      documents?: ScannedDocument[];
      imported?: number;
      skipped?: number;
      error?: string;
    };
    setScanWorking(false);
    if (response.ok) onDocumentsScanned(result.documents || []);
    setScanNotice(
      response.ok
        ? `已加入 ${result.imported || 0} 份外部文件；略過 ${result.skipped || 0} 份既有文件。`
        : result.error || "掃描外部文件失敗",
    );
  }
  if (!settings)
    return (
      <section className="settings-page">
        <p className="hint">正在載入設定…</p>
      </section>
    );
  const toggle = (
    name:
      | "collaborationEnabled"
      | "attachmentsEnabled"
      | "markdownDownloadEnabled"
      | "accountProvisioningEnabled"
      | "forcePasswordChangeOnNewAccount"
      | "loginRateLimitEnabled",
    label: string,
    help: string,
  ) => (
    <label className="security-toggle">
      <input
        name={name}
        type="checkbox"
        defaultChecked={settings.security[name]}
        disabled={!settings.canManage}
      />
      <span>
        <strong>{label}</strong>
        <small>{help}</small>
      </span>
    </label>
  );
  return (
    <section className="settings-page">
      <div className="settings-hero">
        <p className="eyebrow">工作空間設定</p>
        <h1>設定中心</h1>
        <p>管理個人頭像、專案、團隊、外觀、資料保護與安全功能。</p>
      </div>
      {profile && (
        <form className="settings-card profile-settings" onSubmit={saveProfile}>
          <div className="profile-avatar-preview">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="目前頭像" />
            ) : (
              profile.avatarEmoji || profile.name.slice(0, 2).toUpperCase()
            )}
          </div>
          <div>
            <h2>我的帳號</h2>
            <p className="hint">{profile.email}</p>
          </div>
          <label>
            顯示名稱
            <input name="profileName" defaultValue={profile.name} />
          </label>
          <label>
            頭像 Emoji
            <input
              name="avatarEmoji"
              defaultValue={profile.avatarEmoji || ""}
              placeholder="例如 🚀"
              maxLength={16}
            />
          </label>
          <label className="avatar-upload">
            上傳照片
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(event) => void uploadAvatar(event.currentTarget.files?.[0])}
            />
            <small>JPG、PNG、WebP、GIF，最多 5 MB。</small>
          </label>
          <button className="primary">儲存個人資料</button>
          {profile.avatarUrl && (
            <button
              className="dialog-secondary avatar-remove"
              type="button"
              onClick={() => void removeAvatar()}
            >
              移除照片
            </button>
          )}
          {profileNotice && <StatusMessage>{profileNotice}</StatusMessage>}
        </form>
      )}
      <form className="settings-grid" onSubmit={save}>
        <section className="settings-card settings-workspace">
          <h2>工作空間與專案</h2>
          <label>
            工作空間名稱
            <input
              name="workspaceName"
              defaultValue={settings.workspace?.name || ""}
              disabled={!settings.canManage}
            />
          </label>
          <label>
            專案名稱
            <input
              name="projectName"
              defaultValue={settings.project.name}
              disabled={!settings.canManage}
            />
          </label>
          <label>
            專案代碼
            <input
              name="projectCode"
              defaultValue={settings.project.code}
              disabled={!settings.canManage}
            />
          </label>
          <label>
            專案說明
            <textarea
              name="projectDescription"
              defaultValue={settings.project.description || ""}
              disabled={!settings.canManage}
              placeholder="專案目標、範圍與協作原則"
              maxLength={1000}
            />
          </label>
        </section>
        <section className="settings-card settings-document-sync">
          <h2>文件庫同步</h2>
          <p className="hint">
            掃描 <code>workspace-data/documents</code> 內外部新增的 Markdown
            檔案，並加入目前專案。已識別的既有文件不會重複建立。
          </p>
          <button
            className="button-secondary"
            type="button"
            disabled={!settings.canManage || scanWorking}
            onClick={() => void scanDocuments()}
          >
            {scanWorking ? "掃描中…" : "掃描外部文件"}
          </button>
          {scanNotice && <StatusMessage>{scanNotice}</StatusMessage>}
        </section>
        <section className="settings-card appearance-settings">
          <h2>外觀與配色</h2>
          <p className="hint">主題與配色只儲存在目前瀏覽器。</p>
          <div className="theme-options">
            <button type="button" onClick={() => setTheme("light")}>
              ☀ 淺色模式
            </button>
            <button type="button" onClick={() => setTheme("dark")}>
              ◐ 暗色模式
            </button>
          </div>
          <p className="setting-label">預設配色</p>
          <div className="accent-presets">
            {(Object.keys(accentPresets) as Array<Exclude<AccentPreset, "custom">>).map(
              (preset) => (
                <button
                  type="button"
                  key={preset}
                  className={appearance.preset === preset ? "active" : ""}
                  onClick={() => selectPreset(preset)}
                >
                  <i style={{ background: accentPresets[preset].primary }} />
                  <span>{accentPresets[preset].label}</span>
                </button>
              ),
            )}
          </div>
          <p className="setting-label">自訂配色</p>
          <div className="accent-custom">
            <label>
              主色
              <input
                aria-label="主色"
                type="color"
                value={appearance.primary}
                onChange={(event) =>
                  setAccent(
                    { ...appearance, preset: "custom", primary: event.target.value },
                    "已更新主色",
                  )
                }
              />
            </label>
            <label>
              深色
              <input
                aria-label="深色"
                type="color"
                value={appearance.deep}
                onChange={(event) =>
                  setAccent(
                    { ...appearance, preset: "custom", deep: event.target.value },
                    "已更新深色",
                  )
                }
              />
            </label>
            <label>
              強調色
              <input
                aria-label="強調色"
                type="color"
                value={appearance.highlight}
                onChange={(event) =>
                  setAccent(
                    { ...appearance, preset: "custom", highlight: event.target.value },
                    "已更新強調色",
                  )
                }
              />
            </label>
            <label>
              提示色
              <input
                aria-label="提示色"
                type="color"
                value={appearance.warning}
                onChange={(event) =>
                  setAccent(
                    { ...appearance, preset: "custom", warning: event.target.value },
                    "已更新提示色",
                  )
                }
              />
            </label>
          </div>
        </section>
        <section className="settings-card">
          <h2>定時備份</h2>
          <p className="hint">備份屬於自架主機層級，僅系統管理員可調整排程。</p>
          <label>
            備份間隔（小時）
            <input
              name="backupIntervalHours"
              type="number"
              min="1"
              max="720"
              defaultValue={settings.backup.intervalHours}
              disabled={!settings.canManageHost}
            />
          </label>
          <label>
            保留天數
            <input
              name="backupRetentionDays"
              type="number"
              min="1"
              max="3650"
              defaultValue={settings.backup.retentionDays}
              disabled={!settings.canManageHost}
            />
          </label>
          <p className="hint">最近成功：{settings.backup.lastSuccess || "尚未完成"}</p>
          {settings.backup.lastFailure && (
            <p className="error">最近失敗：{settings.backup.lastFailure}</p>
          )}
        </section>
        <section className="settings-card settings-security">
          <h2>安全與功能開關</h2>
          <p className="hint">僅管理者可調整。關閉後會阻擋新的操作，不會刪除現有資料。</p>
          {toggle(
            "collaborationEnabled",
            "即時協作",
            "停止核發新的 Yjs 編輯權杖；文件仍可一般儲存。",
          )}{" "}
          {toggle(
            "attachmentsEnabled",
            "附件上傳",
            "禁止新增附件；既有附件仍可下載或刪除。",
          )}{" "}
          {toggle(
            "markdownDownloadEnabled",
            "Markdown 下載",
            "禁止下載文件的 .md 匯出檔。",
          )}{" "}
          {toggle(
            "accountProvisioningEnabled",
            "網頁建立帳號",
            "隱藏並封鎖管理者從網頁建立新登入帳號。",
          )}{" "}
          {toggle(
            "forcePasswordChangeOnNewAccount",
            "首次登入強制改密碼",
            "新建立帳號首次登入後必須更新初始密碼。",
          )}{" "}
          {toggle(
            "loginRateLimitEnabled",
            "登入嘗試限制",
            "同一帳號連續登入失敗時暫時拒絕更多嘗試；可避免暴力猜測。",
          )}
          <label>
            密碼最低長度
            <input
              name="minimumPasswordLength"
              type="number"
              min="8"
              max="128"
              defaultValue={settings.security.minimumPasswordLength}
              disabled={!settings.canManage}
            />
          </label>
          <label>
            登入失敗上限
            <input
              name="loginMaxAttempts"
              type="number"
              min="1"
              max="30"
              defaultValue={settings.security.loginMaxAttempts}
              disabled={!settings.canManage || !settings.security.loginRateLimitEnabled}
            />
          </label>
          <label>
            登入限制視窗（分鐘）
            <input
              name="loginWindowMinutes"
              type="number"
              min="1"
              max="1440"
              defaultValue={settings.security.loginWindowMinutes}
              disabled={!settings.canManage || !settings.security.loginRateLimitEnabled}
            />
          </label>
        </section>
        <section className="settings-card settings-security">
          <h2>AI 助手</h2>
          <p className="hint">
            預設關閉。每個工作空間獨立設定；金鑰以加密形式存於資料庫，畫面不會回顯。OpenAI-compatible
            必須使用 HTTPS；Ollama 僅允許受信任的內部主機。
          </p>
          <label className="security-toggle">
            <input
              name="aiEnabled"
              type="checkbox"
              defaultChecked={settings.ai.enabled}
              disabled={!settings.canManage}
            />
            <span>
              <strong>啟用 AI 助手</strong>
              <small>開啟後，使用者可從工作區送出提示給設定的服務。</small>
            </span>
          </label>
          <label>
            服務類型
            <select
              name="aiProvider"
              defaultValue={settings.ai.provider}
              disabled={!settings.canManage}
            >
              <option value="OPENAI_COMPATIBLE">OpenAI-compatible API</option>
              <option value="OLLAMA">Ollama</option>
            </select>
          </label>
          <label>
            服務網址
            <input
              name="aiBaseUrl"
              defaultValue={settings.ai.baseUrl}
              disabled={!settings.canManage}
              placeholder="例如 http://ollama:11434 或 https://api.openai.com/v1"
            />
          </label>
          <label>
            模型
            <input
              name="aiModel"
              defaultValue={settings.ai.model}
              disabled={!settings.canManage}
              placeholder="例如 gpt-4.1-mini 或 llama3.2"
            />
          </label>
          <label>
            API 金鑰
            <input
              name="aiApiKey"
              type="password"
              autoComplete="new-password"
              disabled={!settings.canManage}
              placeholder={
                settings.ai.apiKeyConfigured
                  ? "已設定；留白會保留原金鑰"
                  : "可留白（Ollama 通常不需要）"
              }
            />
          </label>
        </section>
        <section className="settings-card settings-security">
          <h2>外部整合</h2>
          <p className="hint">
            預設關閉。GitHub 可讀取已設定儲存庫的 Issue；Webhook
            可讓其他服務接收測試事件。
          </p>
          <label className="security-toggle">
            <input
              name="githubEnabled"
              type="checkbox"
              defaultChecked={settings.integrations.githubEnabled}
              disabled={!settings.canManage}
            />
            <span>
              <strong>GitHub Issue 整合</strong>
              <small>啟用後可於工作區讀取指定儲存庫的 Issue。</small>
            </span>
          </label>
          <label>
            GitHub 儲存庫
            <input
              name="githubRepository"
              defaultValue={settings.integrations.githubRepository}
              disabled={!settings.canManage}
              placeholder="owner/repository"
            />
          </label>
          <label>
            GitHub Token
            <input
              name="githubToken"
              type="password"
              autoComplete="new-password"
              disabled={!settings.canManage}
              placeholder={
                settings.integrations.githubTokenConfigured
                  ? "已設定；留白會保留 Token"
                  : "公開儲存庫可留白"
              }
            />
          </label>
          <label className="security-toggle">
            <input
              name="webhookEnabled"
              type="checkbox"
              defaultChecked={settings.integrations.webhookEnabled}
              disabled={!settings.canManage}
            />
            <span>
              <strong>Webhook 整合</strong>
              <small>允許管理者送出有簽章的測試事件至指定網址。</small>
            </span>
          </label>
          <label>
            Webhook 網址
            <input
              name="webhookUrl"
              type="url"
              defaultValue={settings.integrations.webhookUrl}
              disabled={!settings.canManage}
              placeholder="https://example.com/hooks/rocket"
            />
          </label>
          <label>
            Webhook 密鑰
            <input
              name="webhookSecret"
              type="password"
              autoComplete="new-password"
              disabled={!settings.canManage}
              placeholder={
                settings.integrations.webhookSecretConfigured
                  ? "已設定；留白會保留密鑰"
                  : "可留白"
              }
            />
          </label>
        </section>
        <div className="settings-save">
          {settings.canManage ? (
            <button className="primary" disabled={saving}>
              {saving ? "儲存中…" : "儲存全部設定"}
            </button>
          ) : (
            <p className="hint">你有檢視權限；請由工作空間管理員修改設定。</p>
          )}
          {notice && <StatusMessage>{notice}</StatusMessage>}
        </div>
      </form>
      {settings.canManage && (
        <section className="settings-card">
          <div className="team-directory-head">
            <div>
              <h2>操作紀錄</h2>
              <p className="hint">顯示此工作空間最近 50 筆可安全歸屬的管理與資料異動。</p>
            </div>
            <button type="button" onClick={() => void loadAuditEvents()}>
              重新整理
            </button>
          </div>
          <div className="attachment-list">
            {auditEvents.length ? (
              auditEvents.map((event) => (
                <article key={event.id}>
                  <div>
                    <strong>
                      {event.action.replaceAll("_", " ").replaceAll(".", " · ")}
                    </strong>
                    <small>
                      {event.user?.name || event.user?.email || "系統"} ·{" "}
                      {new Date(event.createdAt).toLocaleString("zh-TW")}
                      {event.projectId && event.projectId !== projectId
                        ? " · 其他專案"
                        : ""}
                    </small>
                  </div>
                  <span className="hint">{event.entity}</span>
                </article>
              ))
            ) : (
              <p className="hint">尚無可顯示的操作紀錄。</p>
            )}
          </div>
          {auditNotice && (
            <StatusMessage className="error" tone="alert">
              {auditNotice}
            </StatusMessage>
          )}
        </section>
      )}
      {settings.canManage && (
        <section className="settings-card calendar-feed-settings">
          <h2>專案日曆同步</h2>
          <p className="hint">
            建立唯讀 iCalendar（.ics）訂閱網址，Google Calendar、Apple Calendar、Outlook
            與支援 iCalendar 的服務都可訂閱。內容包含有日期的任務與測試紀錄；資料仍以
            Rocket Workspace 為唯一可編輯來源。
          </p>
          <p className="hint">
            目前狀態：
            {calendarFeed?.enabled
              ? `已啟用（最後輪替：${calendarFeed.updatedAt ? new Date(calendarFeed.updatedAt).toLocaleString("zh-TW") : "未知"}）`
              : "未啟用"}
          </p>
          {calendarUrl && (
            <label>
              本次產生的訂閱網址
              <input
                value={calendarUrl}
                readOnly
                aria-label="日曆訂閱網址"
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
          )}
          <div className="module-hero-actions">
            <button
              type="button"
              className="collab-primary"
              disabled={calendarWorking}
              onClick={() => void rotateCalendarFeed()}
            >
              {calendarWorking
                ? "處理中…"
                : calendarFeed?.enabled
                  ? "輪替訂閱網址"
                  : "建立訂閱網址"}
            </button>
            {calendarUrl && (
              <button type="button" onClick={() => void copyCalendarUrl()}>
                複製網址
              </button>
            )}
            {calendarFeed?.enabled && (
              <button
                type="button"
                className="attachment-remove"
                disabled={calendarWorking}
                onClick={() => setConfirmCalendarRevoke(true)}
              >
                停用訂閱
              </button>
            )}
          </div>
          <p className="hint">
            安全提醒：網址相當於唯讀存取權杖，只會在建立或輪替當下顯示一次。若外流，請立即輪替。
          </p>
          {calendarNotice && <StatusMessage>{calendarNotice}</StatusMessage>}
        </section>
      )}
      {settings.canManage && (
        <form className="settings-card project-settings" onSubmit={createProject}>
          <h2>新增專案</h2>
          <p className="hint">建立後會立即切換到新專案。</p>
          <label>
            專案名稱
            <input
              value={newProjectName}
              onChange={(event) => setNewProjectName(event.target.value)}
              required
              maxLength={120}
            />
          </label>
          <label>
            專案代碼
            <input
              value={newProjectCode}
              onChange={(event) => setNewProjectCode(event.target.value.toUpperCase())}
              required
              minLength={2}
              maxLength={32}
              pattern="[A-Za-z0-9_-]+"
              placeholder="例如 AVIONICS-2027"
            />
          </label>
          <button className="primary" type="submit">
            建立專案
          </button>
          {projectNotice && <StatusMessage>{projectNotice}</StatusMessage>}
        </form>
      )}
      <MemberSettings
        workspaceId={workspaceId}
        canManage={settings.canManage}
        accountProvisioningEnabled={settings.security.accountProvisioningEnabled}
        minimumPasswordLength={settings.security.minimumPasswordLength}
        onMembersChange={onMembersChange}
      />
      {confirmCalendarRevoke && (
        <ConfirmDialog
          title="停用日曆訂閱？"
          description="所有已訂閱此網址的外部日曆將無法再更新。"
          confirmLabel="停用訂閱"
          destructive
          onCancel={() => setConfirmCalendarRevoke(false)}
          onConfirm={() => {
            setConfirmCalendarRevoke(false);
            void revokeCalendarFeed();
          }}
        />
      )}
    </section>
  );
}
