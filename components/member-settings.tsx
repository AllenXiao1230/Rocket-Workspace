"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { StatusMessage } from "@/components/status-message";
import type { TeamMember } from "@/components/team-management";

const roles = { OWNER: "擁有者", ADMIN: "管理員", EDITOR: "編輯者", VIEWER: "檢視者" };
const nameOf = (member: TeamMember) => member.nickname || member.user.name;

type MemberForm = {
  email: string;
  nickname: string;
  teamGroup: string;
  jobTitle: string;
  role: TeamMember["role"];
};
type AccountForm = MemberForm & { name: string; password: string };

const emptyMemberForm = (): MemberForm => ({
  email: "",
  nickname: "",
  teamGroup: "",
  jobTitle: "",
  role: "VIEWER",
});
const emptyAccountForm = (): AccountForm => ({
  name: "",
  password: "",
  ...emptyMemberForm(),
});
const optional = (value: string) => value.trim() || undefined;

async function messageFor(response: Response, fallback: string) {
  const result = (await response.json().catch(() => null)) as { error?: string } | null;
  return result?.error || fallback;
}

export function MemberSettings({
  workspaceId,
  canManage,
  accountProvisioningEnabled,
  minimumPasswordLength,
  onMembersChange,
}: {
  workspaceId: string;
  canManage: boolean;
  accountProvisioningEnabled: boolean;
  minimumPasswordLength: number;
  onMembersChange: (members: TeamMember[]) => void;
}) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [notice, setNotice] = useState("");
  const [addingExisting, setAddingExisting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [existingAccountError, setExistingAccountError] = useState("");
  const [newAccountError, setNewAccountError] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState<TeamMember | null>(null);
  const [existingForm, setExistingForm] = useState<MemberForm>(emptyMemberForm);
  const [form, setForm] = useState<AccountForm>(emptyAccountForm);
  const existingEmailRef = useRef<HTMLInputElement>(null);
  const accountNameRef = useRef<HTMLInputElement>(null);
  const accountEmailRef = useRef<HTMLInputElement>(null);
  const accountPasswordRef = useRef<HTMLInputElement>(null);
  const reload = useCallback(async () => {
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members`);
      if (!response.ok) {
        setNotice("無法重新載入成員名單，請重新整理後再試。");
        return;
      }
      const next = (await response.json()) as TeamMember[];
      setMembers(next);
      onMembersChange(next);
    } catch {
      setNotice("無法重新載入成員名單，請確認網路連線後再試。");
    }
  }, [workspaceId, onMembersChange]);
  useEffect(() => {
    void reload();
  }, [reload]);
  function focusNewAccountError(message: string) {
    if (message.includes("密碼")) return accountPasswordRef.current?.focus();
    if (message.includes("電子郵件") || message.includes("帳號"))
      return accountEmailRef.current?.focus();
    accountNameRef.current?.focus();
  }
  async function addExisting(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAddingExisting(true);
    setExistingAccountError("");
    setNotice("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: existingForm.email.trim(),
          nickname: optional(existingForm.nickname),
          teamGroup: optional(existingForm.teamGroup),
          jobTitle: optional(existingForm.jobTitle),
          role: existingForm.role,
        }),
      });
      if (!response.ok) {
        const error = await messageFor(response, "無法將帳號加入工作空間");
        setExistingAccountError(error);
        existingEmailRef.current?.focus();
        return;
      }
      setExistingForm(emptyMemberForm());
      setNotice("既有帳號已加入工作空間。");
      await reload();
    } catch {
      setExistingAccountError("無法將帳號加入工作空間，請確認網路連線後再試。");
      existingEmailRef.current?.focus();
    } finally {
      setAddingExisting(false);
    }
  }
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setNewAccountError("");
    setNotice("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          nickname: optional(form.nickname),
          teamGroup: optional(form.teamGroup),
          jobTitle: optional(form.jobTitle),
          role: form.role,
        }),
      });
      if (!response.ok) {
        const error = await messageFor(response, "無法建立帳號");
        setNewAccountError(error);
        focusNewAccountError(error);
        return;
      }
      setForm(emptyAccountForm());
      setNotice("登入帳號已建立；請安全地將初始密碼交給該成員。");
      await reload();
    } catch {
      const error = "無法建立帳號，請確認網路連線後再試。";
      setNewAccountError(error);
      focusNewAccountError(error);
    } finally {
      setCreating(false);
    }
  }
  async function update(
    member: TeamMember,
    fields: Partial<Pick<TeamMember, "nickname" | "teamGroup" | "jobTitle" | "role">>,
  ) {
    const response = await fetch(`/api/workspaces/${workspaceId}/members/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    const result = await response.json();
    if (!response.ok) return setNotice(result.error || "無法更新成員");
    setMembers((current) => {
      const next = current.map((item) => (item.id === member.id ? result : item));
      onMembersChange(next);
      return next;
    });
    setNotice("成員資料已儲存");
  }
  async function remove(member: TeamMember) {
    const response = await fetch(`/api/workspaces/${workspaceId}/members/${member.id}`, {
      method: "DELETE",
    });
    if (!response.ok) return setNotice("無法移除成員");
    const next = members.filter((item) => item.id !== member.id);
    setMembers(next);
    onMembersChange(next);
  }
  const options = Object.entries(roles).map(([value, label]) => (
    <option key={value} value={value}>
      {label}
    </option>
  ));
  const avatar = (member: TeamMember) => (
    <div className="member-avatar">
      {member.user.avatarUrl ? (
        <img src={member.user.avatarUrl} alt={`${nameOf(member)} 的頭像`} />
      ) : (
        member.user.avatarEmoji || nameOf(member).slice(0, 1).toUpperCase()
      )}
    </div>
  );
  const edit = (member: TeamMember, key: "nickname" | "teamGroup" | "jobTitle") => (
    <input
      defaultValue={member[key] || ""}
      placeholder={
        key === "nickname" ? "暱稱" : key === "teamGroup" ? "所屬分組" : "職位"
      }
      disabled={!canManage}
      onBlur={(event) => {
        const value = event.currentTarget.value.trim() || null;
        if (value !== member[key]) void update(member, { [key]: value });
      }}
    />
  );
  return (
    <section className="settings-members member-settings">
      <div>
        <p className="eyebrow">團隊設定</p>
        <h2>成員帳號、分組與職位</h2>
      </div>
      {canManage && (
        <section className="member-create-card">
          <div className="member-create-heading">
            <div>
              <h3>新增使用者</h3>
              <p>把已有帳號加入這個工作空間，或建立新的登入帳號並立即設定角色。</p>
            </div>
            <span>僅限管理員</span>
          </div>
          <form
            className="member-create-form member-existing-form"
            aria-busy={addingExisting}
            onSubmit={addExisting}
          >
            <fieldset>
              <legend>加入既有帳號</legend>
              <p>輸入對方已用於登入 Rocket Workspace 的電子郵件。</p>
              <div className="member-form-fields">
                <label className="member-email-field">
                  電子郵件
                  <input
                    ref={existingEmailRef}
                    name="existing-member-email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    spellCheck={false}
                    value={existingForm.email}
                    onChange={(event) =>
                      setExistingForm((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                    placeholder="例如 ada@example.com…"
                    aria-describedby={
                      existingAccountError ? "existing-member-error" : undefined
                    }
                    required
                  />
                </label>
                <label>
                  工作空間角色
                  <select
                    name="existing-member-role"
                    value={existingForm.role}
                    onChange={(event) =>
                      setExistingForm((current) => ({
                        ...current,
                        role: event.target.value as TeamMember["role"],
                      }))
                    }
                  >
                    {options}
                  </select>
                </label>
                <label>
                  暱稱（選填）
                  <input
                    name="existing-member-nickname"
                    autoComplete="nickname"
                    maxLength={40}
                    value={existingForm.nickname}
                    onChange={(event) =>
                      setExistingForm((current) => ({
                        ...current,
                        nickname: event.target.value,
                      }))
                    }
                    placeholder="例如 Ada…"
                  />
                </label>
                <label>
                  所屬分組（選填）
                  <input
                    name="existing-member-team-group"
                    maxLength={60}
                    value={existingForm.teamGroup}
                    onChange={(event) =>
                      setExistingForm((current) => ({
                        ...current,
                        teamGroup: event.target.value,
                      }))
                    }
                    placeholder="例如 研發部…"
                  />
                </label>
                <label>
                  職位（選填）
                  <input
                    name="existing-member-job-title"
                    autoComplete="organization-title"
                    maxLength={80}
                    value={existingForm.jobTitle}
                    onChange={(event) =>
                      setExistingForm((current) => ({
                        ...current,
                        jobTitle: event.target.value,
                      }))
                    }
                    placeholder="例如 軟體工程師…"
                  />
                </label>
              </div>
              {existingAccountError && (
                <StatusMessage
                  id="existing-member-error"
                  className="member-form-error"
                  tone="alert"
                >
                  {existingAccountError}
                </StatusMessage>
              )}
              <div className="member-form-actions">
                <button type="submit" disabled={addingExisting}>
                  {addingExisting && (
                    <span className="button-spinner" aria-hidden="true" />
                  )}
                  <span>加入工作空間</span>
                </button>
              </div>
            </fieldset>
          </form>
          {accountProvisioningEnabled ? (
            <form className="member-create-form" aria-busy={creating} onSubmit={create}>
              <fieldset>
                <legend>建立新的登入帳號</legend>
                <p>建立後會立即加入此工作空間。請以安全方式交付初始密碼。</p>
                <div className="member-form-fields">
                  <label>
                    姓名
                    <input
                      ref={accountNameRef}
                      name="new-member-name"
                      autoComplete="name"
                      maxLength={80}
                      value={form.name}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, name: event.target.value }))
                      }
                      placeholder="例如 Ada Lovelace…"
                      aria-describedby={newAccountError ? "new-member-error" : undefined}
                      required
                    />
                  </label>
                  <label className="member-email-field">
                    電子郵件
                    <input
                      ref={accountEmailRef}
                      name="new-member-email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      spellCheck={false}
                      value={form.email}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, email: event.target.value }))
                      }
                      placeholder="例如 ada@example.com…"
                      aria-describedby={newAccountError ? "new-member-error" : undefined}
                      required
                    />
                  </label>
                  <label>
                    初始密碼
                    <input
                      ref={accountPasswordRef}
                      name="new-member-password"
                      type="password"
                      autoComplete="new-password"
                      minLength={minimumPasswordLength}
                      maxLength={128}
                      value={form.password}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          password: event.target.value,
                        }))
                      }
                      placeholder={`至少 ${minimumPasswordLength} 個字元…`}
                      aria-describedby={newAccountError ? "new-member-error" : undefined}
                      required
                    />
                  </label>
                  <label>
                    工作空間角色
                    <select
                      name="new-member-role"
                      value={form.role}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          role: event.target.value as TeamMember["role"],
                        }))
                      }
                    >
                      {options}
                    </select>
                  </label>
                  <label>
                    暱稱（選填）
                    <input
                      name="new-member-nickname"
                      autoComplete="nickname"
                      maxLength={40}
                      value={form.nickname}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          nickname: event.target.value,
                        }))
                      }
                      placeholder="例如 Ada…"
                    />
                  </label>
                  <label>
                    所屬分組（選填）
                    <input
                      name="new-member-team-group"
                      maxLength={60}
                      value={form.teamGroup}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          teamGroup: event.target.value,
                        }))
                      }
                      placeholder="例如 研發部…"
                    />
                  </label>
                  <label>
                    職位（選填）
                    <input
                      name="new-member-job-title"
                      autoComplete="organization-title"
                      maxLength={80}
                      value={form.jobTitle}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          jobTitle: event.target.value,
                        }))
                      }
                      placeholder="例如 軟體工程師…"
                    />
                  </label>
                </div>
                {newAccountError && (
                  <StatusMessage
                    id="new-member-error"
                    className="member-form-error"
                    tone="alert"
                  >
                    {newAccountError}
                  </StatusMessage>
                )}
                <div className="member-form-actions">
                  <button type="submit" disabled={creating}>
                    {creating && <span className="button-spinner" aria-hidden="true" />}
                    <span>建立並加入</span>
                  </button>
                </div>
              </fieldset>
            </form>
          ) : (
            <p className="member-provisioning-hint">
              若此人尚未有登入帳號，請先在「安全與功能開關」啟用「網頁建立帳號」。
            </p>
          )}
        </section>
      )}
      <div className="member-settings-list">
        {members.map((member) => (
          <article key={member.id}>
            {avatar(member)}
            <div className="member-identity">
              <strong>{nameOf(member)}</strong>
              <span>
                {member.user.name} · {member.user.email}
              </span>
            </div>
            {edit(member, "nickname")}
            {edit(member, "teamGroup")}
            {edit(member, "jobTitle")}
            <select
              value={member.role}
              disabled={!canManage}
              onChange={(event) =>
                void update(member, { role: event.target.value as TeamMember["role"] })
              }
            >
              {options}
            </select>
            {canManage && (
              <button className="team-remove" onClick={() => setPendingRemoval(member)}>
                移除
              </button>
            )}
          </article>
        ))}
      </div>
      {notice && <StatusMessage>{notice}</StatusMessage>}
      {pendingRemoval && (
        <ConfirmDialog
          title="移除團隊成員？"
          description={`「${nameOf(pendingRemoval)}」將失去此工作空間的存取權。`}
          confirmLabel="移除成員"
          destructive
          onCancel={() => setPendingRemoval(null)}
          onConfirm={() => {
            const member = pendingRemoval;
            setPendingRemoval(null);
            void remove(member);
          }}
        />
      )}
    </section>
  );
}
