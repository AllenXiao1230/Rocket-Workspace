"use client";

import { useState } from "react";

type Message = { role: "user" | "assistant"; content: string };
type Issue = { id: number; number: number; title: string; url: string; state: string };

export function AiAssistant({ projectId }: { projectId: string }) {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);
  const [issues, setIssues] = useState<Issue[]>([]);
  async function ask(event: React.FormEvent) {
    event.preventDefault();
    const question = prompt.trim();
    if (!question || sending) return;
    setSending(true);
    setNotice("");
    setMessages((current) => [...current, { role: "user", content: question }]);
    setPrompt("");
    const response = await fetch(`/api/projects/${projectId}/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: question }),
    });
    const result = (await response.json()) as { answer?: string; error?: string };
    setSending(false);
    if (!response.ok || !result.answer)
      return setNotice(result.error || "AI 助手暫時無法使用");
    setMessages((current) => [
      ...current,
      { role: "assistant", content: result.answer! },
    ]);
  }
  async function loadIssues() {
    setNotice("");
    const response = await fetch(
      `/api/projects/${projectId}/integrations/github/issues`,
      { cache: "no-store" },
    );
    const result = (await response.json()) as Issue[] | { error?: string };
    if (!response.ok || !Array.isArray(result))
      return setNotice(
        !Array.isArray(result)
          ? result.error || "無法讀取 GitHub Issue"
          : "無法讀取 GitHub Issue",
      );
    setIssues(result);
  }
  async function webhookTest() {
    setNotice("");
    const response = await fetch(`/api/projects/${projectId}/integrations/webhook/test`, {
      method: "POST",
    });
    const result = (await response.json()) as {
      ok?: boolean;
      status?: number;
      error?: string;
    };
    setNotice(
      response.ok && result.ok
        ? `Webhook 測試已送出（HTTP ${result.status}）`
        : result.error || `Webhook 回應失敗（HTTP ${result.status || "?"}）`,
    );
  }
  return (
    <section className="ai-page">
      <div className="settings-hero">
        <p className="eyebrow">AI 與外部整合</p>
        <h1>協作助手</h1>
        <p>使用前請由管理員在設定中心明確啟用服務；未設定時不會對外傳送內容。</p>
      </div>
      <div className="ai-grid">
        <section className="settings-card ai-chat">
          <h2>AI 助手</h2>
          <div className="ai-messages">
            {messages.length ? (
              messages.map((message, index) => (
                <article key={index} className={message.role}>
                  <strong>{message.role === "user" ? "你" : "AI"}</strong>
                  <p>{message.content}</p>
                </article>
              ))
            ) : (
              <p className="hint">
                可協助整理任務、草擬文件、分析 Issue 或產生測試清單。
              </p>
            )}
          </div>
          <form onSubmit={ask}>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="輸入問題…"
              maxLength={20_000}
              required
            />
            <button className="primary" disabled={sending}>
              {sending ? "處理中…" : "送出"}
            </button>
          </form>
        </section>
        <section className="settings-card">
          <h2>GitHub Issue</h2>
          <p className="hint">
            讀取設定中心指定儲存庫的未結案 Issue；不會建立、修改或關閉 GitHub 資料。
          </p>
          <button onClick={() => void loadIssues()}>重新整理 Issue</button>
          {issues.length ? (
            <ul className="integration-list">
              {issues.map((issue) => (
                <li key={issue.id}>
                  <a href={issue.url} target="_blank" rel="noreferrer">
                    #{issue.number} {issue.title}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">尚未載入 Issue。</p>
          )}
        </section>
        <section className="settings-card">
          <h2>Webhook</h2>
          <p className="hint">
            將傳送測試事件 `rocket_workspace.webhook_test`；若設定密鑰，會帶入 HMAC
            SHA-256 簽章。
          </p>
          <button onClick={() => void webhookTest()}>送出測試事件</button>
        </section>
      </div>
      {notice && <p className="collab-notice">{notice}</p>}
    </section>
  );
}
