"use client";

import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";

type Attachment = { id: string; filename: string; mimeType: string; size: number; createdAt: string };

function displaySize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function DocumentAttachments({ documentId, canWrite }: { documentId: string; canWrite: boolean }) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    const response = await fetch(`/api/attachments?documentId=${encodeURIComponent(documentId)}`, { cache: "no-store" });
    if (response.ok) setAttachments(await response.json() as Attachment[]);
    else setStatus("無法讀取附件清單");
  }, [documentId]);
  useEffect(() => { void load(); }, [load]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setStatus(`正在上傳 ${file.name}…`);
    const data = new FormData(); data.append("documentId", documentId); data.append("file", file);
    const response = await fetch("/api/attachments", { method: "POST", body: data });
    const result = await response.json() as Attachment & { error?: string };
    if (!response.ok) return setStatus(result.error || "上傳失敗");
    setAttachments((current) => [result, ...current]); setStatus("附件已上傳"); setExpanded(true);
  }
  async function remove(attachment: Attachment) {
    if (!window.confirm(`確定要刪除附件「${attachment.filename}」嗎？`)) return;
    setStatus("正在刪除附件…");
    const response = await fetch(`/api/attachments?id=${encodeURIComponent(attachment.id)}`, { method: "DELETE" });
    if (!response.ok) { const result = await response.json() as { error?: string }; return setStatus(result.error || "刪除失敗"); }
    setAttachments((current) => current.filter((item) => item.id !== attachment.id)); setStatus("附件已刪除");
  }

  return <section className="document-attachments" aria-label="文件附件"><header><div><strong>附件</strong><span>{attachments.length ? `${attachments.length} 個檔案` : "尚無附件"}</span></div><div><button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>{expanded ? "收起" : "查看"}</button>{canWrite && <button type="button" className="collab-primary" onClick={() => inputRef.current?.click()}>上傳檔案</button>}<input ref={inputRef} type="file" hidden onChange={upload} /></div></header>{expanded && <div className="attachment-list">{attachments.length === 0 ? <p>尚未附加檔案。</p> : attachments.map((attachment) => <article key={attachment.id}><div><a href={`/api/attachments?id=${encodeURIComponent(attachment.id)}`} title={`下載 ${attachment.filename}`}>📎 {attachment.filename}</a><small>{displaySize(attachment.size)} · {new Date(attachment.createdAt).toLocaleString("zh-TW")}</small></div>{canWrite && <button type="button" className="attachment-remove" aria-label={`刪除 ${attachment.filename}`} onClick={() => void remove(attachment)}>刪除</button>}</article>)}</div>}{status && <p className="attachment-status" role="status">{status}</p>}</section>;
}
