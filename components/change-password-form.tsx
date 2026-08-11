"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("兩次輸入的新密碼不相同，請再次確認。");
      window.requestAnimationFrame(() => confirmPasswordRef.current?.focus());
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const result = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        setError(result?.error || "無法更新密碼，請稍後再試。");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("目前無法連線，請檢查網路後再試。");
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} aria-busy={saving}>
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
          ref={confirmPasswordRef}
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          minLength={12}
          autoComplete="new-password"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "password-confirmation-error" : undefined}
          required
        />
        {error && (
          <p id="password-confirmation-error" className="error" role="alert">
            {error}
          </p>
        )}
      </label>
      <button className="primary" disabled={saving} aria-busy={saving}>
        {saving && <span className="button-spinner" aria-hidden="true" />}
        <span>設定新密碼</span>
      </button>
    </form>
  );
}
