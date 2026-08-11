"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    if (newPassword !== confirmPassword) return setNotice("兩次輸入的新密碼不相同");
    setSaving(true);
    const response = await fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) return setNotice(result.error || "無法更新密碼");
    router.push("/");
    router.refresh();
  }
  return (
    <form onSubmit={submit}>
      <label className="field">
        目前密碼
        <input
          type="password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      <label className="field">
        新密碼（至少 12 個字元）
        <input
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          minLength={12}
          autoComplete="new-password"
          required
        />
      </label>
      <label className="field">
        再次輸入新密碼
        <input
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          minLength={12}
          autoComplete="new-password"
          required
        />
      </label>
      <button className="primary" disabled={saving}>
        {saving ? "更新中…" : "設定新密碼"}
      </button>
      {notice && <p className="error">{notice}</p>}
    </form>
  );
}
