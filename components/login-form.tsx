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
    const result = await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirect: false,
    });
    setPending(false);
    if (result?.error) return setError("帳號或密碼不正確。");
    router.push(params.get("callbackUrl") || "/");
    router.refresh();
  }
  return (
    <form action={submit}>
      <label className="field">
        電子郵件
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <label className="field">
        密碼
        <input name="password" type="password" required autoComplete="current-password" />
      </label>
      <button className="primary" disabled={pending}>
        {pending ? "登入中…" : "登入"}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
