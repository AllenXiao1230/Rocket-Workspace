"use client";

import { useCallback, useEffect, useState } from "react";

type TrashedDocument = { id: string; title: string; icon: string; deletedAt: string; deletionBatchId: string | null; descendantCount: number };

export function DocumentRecycleBin({ projectId, canWrite, onRestored }: { projectId: string; canWrite: boolean; onRestored: () => void }) {
  const [documents, setDocuments] = useState<TrashedDocument[]>([]);
  const [status, setStatus] = useState("");
  const load = useCallback(async () => { const response = await fetch(`/api/projects/${projectId}/recycle`, { cache: "no-store" }); if (response.ok) setDocuments(await response.json() as TrashedDocument[]); else setStatus("無法讀取回收桶"); }, [projectId]);
  useEffect(() => { void load(); }, [load]);
  async function restore(document: TrashedDocument) {
    if (!document.deletionBatchId) return setStatus("此舊文件無法自動還原");
    const response = await fetch(`/api/projects/${projectId}/recycle/${encodeURIComponent(document.deletionBatchId)}`, { method: "PATCH" });
    const result = await response.json() as { error?: string; restoredCount?: number };
    if (!response.ok) return setStatus(result.error || "還原失敗");
    setStatus(`已還原 ${result.restoredCount || 1} 份文件`); onRestored();
  }
  return <section className="document recycle-bin"><div className="module-hero"><div><p className="eyebrow">文件庫</p><h1>回收桶</h1><p>刪除的文件與其子頁面會留在這裡，附件、評論與修訂紀錄也會一併保留。</p></div><button type="button" onClick={() => void load()}>重新整理</button></div><div className="recycle-list">{documents.length === 0 ? <p className="empty">回收桶是空的。</p> : documents.map((document) => <article key={document.id}><div><strong>{document.icon || "📄"} {document.title}</strong><span>刪除於 {new Date(document.deletedAt).toLocaleString("zh-TW")}{document.descendantCount ? ` · 包含 ${document.descendantCount} 個子頁面` : ""}</span></div>{canWrite && <button type="button" className="collab-primary" onClick={() => void restore(document)}>還原</button>}</article>)}</div>{status && <p className="attachment-status" role="status">{status}</p>}</section>;
}
