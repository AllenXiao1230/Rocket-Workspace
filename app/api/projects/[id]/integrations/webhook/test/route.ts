import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { projectAccess } from "@/lib/permissions";
import { readWorkspaceSettings } from "@/lib/workspace-settings";
import { fetchExternalUrl } from "@/lib/external-url";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const access = await projectAccess(session.user.id, id); if (!access || !["OWNER", "ADMIN"].includes(access.membership.role)) return NextResponse.json({ error: "只有管理員能送出 Webhook 測試" }, { status: 403 });
  const integration = (await readWorkspaceSettings(access.project.workspaceId)).integrations;
  if (!integration.webhookEnabled) return NextResponse.json({ error: "管理者尚未啟用 Webhook 整合" }, { status: 403 });
  try { const payload = JSON.stringify({ event: "rocket_workspace.webhook_test", projectId: id, sentAt: new Date().toISOString() }); const signature = integration.webhookSecret ? createHmac("sha256", integration.webhookSecret).update(payload).digest("hex") : ""; const response = await fetchExternalUrl(integration.webhookUrl, "WEBHOOK", undefined, { method: "POST", headers: { "Content-Type": "application/json", "X-Rocket-Workspace-Event": "webhook_test", ...(signature ? { "X-Rocket-Workspace-Signature": `sha256=${signature}` } : {}) }, body: payload, signal: AbortSignal.timeout(30_000) }); return NextResponse.json({ ok: response.ok, status: response.status }, { status: response.ok ? 200 : 502 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? `Webhook 測試失敗：${error.message}` : "Webhook 測試失敗" }, { status: 502 }); }
}
