"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";

export function LoginForm() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const params = useSearchParams();
  const router = useRouter();
  async function submit(formData: FormData) {
    setPending(true);
    setError("");
    try {
      const result = await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirect: false,
      });
      if (result?.error) return setError("帳號或密碼不正確。");
      router.push(params.get("callbackUrl") || "/");
      router.refresh();
    } catch {
      setError("目前無法登入，請稍後再試。");
    } finally {
      setPending(false);
    }
  }
  return (
    <form action={submit} aria-busy={pending}>
      <label className="field">
        電子郵件
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <label className="field">
        密碼
        <input name="password" type="password" required autoComplete="current-password" />
      </label>
      <button className="primary" type="submit" disabled={pending} aria-busy={pending}>
        {pending && <span className="button-spinner" aria-hidden="true" />}
        <span>登入</span>
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
