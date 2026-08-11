import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { rawAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ChangePasswordForm } from "@/components/change-password-form";

export const metadata: Metadata = { title: "設定新密碼" };

export default async function ChangePasswordPage() {
  const session = await rawAuth();
  if (!session?.user?.id) redirect("/login");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { mustChangePassword: true },
  });
  if (!user?.mustChangePassword) redirect("/");
  return (
    <main id="main-content" className="login" tabIndex={-1}>
      <section className="login-card">
        <p className="brand">Rocket Workspace · 安全設定</p>
        <h1>請先設定新密碼</h1>
        <p className="hint">
          這是管理員為你建立的初始帳號。設定自己的密碼後才能使用工作空間。
        </p>
        <ChangePasswordForm />
      </section>
    </main>
  );
}
