import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { projectAccess } from "@/lib/permissions";
import { readWorkspaceSettings } from "@/lib/workspace-settings";
import { validateExternalUrl } from "@/lib/external-url";

const schema = z.object({ prompt: z.string().trim().min(1).max(20_000), context: z.string().max(20_000).optional() });
async function endpoint(baseUrl: string, provider: "OPENAI_COMPATIBLE" | "OLLAMA") { const url = await validateExternalUrl(baseUrl, "AI", provider); url.pathname = `${url.pathname.replace(/\/$/, "")}${provider === "OLLAMA" ? "/api/chat" : "/chat/completions"}`; return url; }

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const access = await projectAccess(session.user.id, id); if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const input = schema.safeParse(await request.json().catch(() => null)); if (!input.success) return NextResponse.json({ error: "請輸入要詢問的內容" }, { status: 400 });
  const ai = (await readWorkspaceSettings(access.project.workspaceId)).ai;
  if (!ai.enabled) return NextResponse.json({ error: "管理者尚未啟用 AI 助手" }, { status: 403 });
  if (!ai.baseUrl || !ai.model || (ai.provider === "OPENAI_COMPATIBLE" && !ai.apiKey)) return NextResponse.json({ error: "AI 設定尚未完成；請由管理員填入服務網址、模型與必要金鑰" }, { status: 422 });
  try {
    const messages = [{ role: "system", content: "你是 Rocket Workspace 的繁體中文專案協作助手。回答務必精確、簡潔，並在不確定時清楚標註。" }, ...(input.data.context ? [{ role: "system", content: `目前文件內容：\n${input.data.context}` }] : []), { role: "user", content: input.data.prompt }];
    const response = await fetch(await endpoint(ai.baseUrl, ai.provider), { method: "POST", headers: { "Content-Type": "application/json", ...(ai.provider === "OPENAI_COMPATIBLE" ? { Authorization: `Bearer ${ai.apiKey}` } : {}) }, body: JSON.stringify(ai.provider === "OLLAMA" ? { model: ai.model, messages, stream: false } : { model: ai.model, messages, temperature: 0.2 }), signal: AbortSignal.timeout(60_000) });
    const body = await response.json().catch(() => null) as { choices?: Array<{ message?: { content?: string } }>; message?: { content?: string }; error?: { message?: string } } | null;
    if (!response.ok) return NextResponse.json({ error: body?.error?.message || `AI 服務回應失敗（${response.status}）` }, { status: 502 });
    const answer = ai.provider === "OLLAMA" ? body?.message?.content : body?.choices?.[0]?.message?.content;
    if (!answer) return NextResponse.json({ error: "AI 服務沒有回傳可顯示的內容" }, { status: 502 });
    return NextResponse.json({ answer });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? `無法連線 AI 服務：${error.message}` : "無法連線 AI 服務" }, { status: 502 }); }
}
