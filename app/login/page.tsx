import { rawAuth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  if (await rawAuth()) redirect("/");
  return <main className="login"><section className="login-card"><p className="brand">Rocket Workspace · 任務控制台</p><h1>進入任務控制台</h1><p className="hint">以你的工作空間帳號登入，所有文件與紀錄將依角色權限顯示。</p><LoginForm /></section></main>;
}
