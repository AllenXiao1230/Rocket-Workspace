"use client";

import { useCallback, useEffect, useState } from "react";
import { StatusMessage } from "@/components/status-message";

type SyncBlock = {
  id: string;
  content: string;
  updatedAt: string;
  links: Array<{ document: { id: string; title: string } }>;
};

export function DocumentSyncBlocks({
  documentId,
  editable,
  documents,
}: {
  documentId: string;
  editable: boolean;
  documents: Array<{ id: string; title: string }>;
}) {
  const [blocks, setBlocks] = useState<SyncBlock[]>([]);
  const [targetDocumentId, setTargetDocumentId] = useState("");
  const [content, setContent] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(`/api/documents/${documentId}/sync-blocks`, {
      cache: "no-store",
    });
    if (!response.ok) return setNotice("無法讀取同步區塊");
    const result = (await response.json()) as { blocks: SyncBlock[] };
    setBlocks(result.blocks);
  }, [documentId]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5_000);
    return () => window.clearInterval(timer);
  }, [load]);
  async function create() {
    const response = await fetch(`/api/documents/${documentId}/sync-blocks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetDocumentId, content }),
    });
    const result = (await response.json()) as SyncBlock & { error?: string };
    if (!response.ok) return setNotice(result.error || "無法建立同步區塊");
    setBlocks((current) => [result, ...current]);
    setTargetDocumentId("");
    setContent("");
    setNotice("已建立雙向同步區塊");
  }
  async function update(blockId: string, nextContent: string) {
    const response = await fetch(`/api/documents/${documentId}/sync-blocks/${blockId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: nextContent }),
    });
    if (!response.ok) return setNotice("同步區塊尚未儲存");
    setBlocks((current) =>
      current.map((block) =>
        block.id === blockId
          ? { ...block, content: nextContent, updatedAt: new Date().toISOString() }
          : block,
      ),
    );
  }
  return (
    <section className="document-sync-blocks">
      <h2>雙向同步區塊</h2>
      <p className="hint">任一連結文件修改內容後，其他連結文件會顯示同一份內容。</p>
      {blocks.map((block) => (
        <article key={block.id}>
          <textarea
            aria-label={`同步區塊內容；連結文件：${
              block.links.map((link) => link.document.title).join("、") || "未命名文件"
            }`}
            value={block.content}
            readOnly={!editable}
            onChange={(event) =>
              setBlocks((current) =>
                current.map((item) =>
                  item.id === block.id ? { ...item, content: event.target.value } : item,
                ),
              )
            }
            onBlur={(event) => void update(block.id, event.target.value)}
          />
          <small>
            連結：{block.links.map((link) => link.document.title).join("、")} · 更新於{" "}
            {new Date(block.updatedAt).toLocaleString("zh-TW")}
          </small>
        </article>
      ))}
      {editable && (
        <div className="document-sync-block-create">
          <select
            aria-label="選擇要連結的文件"
            value={targetDocumentId}
            onChange={(event) => setTargetDocumentId(event.target.value)}
          >
            <option value="">選擇要連結的文件</option>
            {documents
              .filter((document) => document.id !== documentId)
              .map((document) => (
                <option key={document.id} value={document.id}>
                  {document.title}
                </option>
              ))}
          </select>
          <textarea
            aria-label="新同步區塊內容"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="輸入要在兩份文件間同步的文字"
          />
          <button disabled={!targetDocumentId} onClick={() => void create()}>
            ＋ 建立同步區塊
          </button>
        </div>
      )}
      {notice && <StatusMessage className="hint">{notice}</StatusMessage>}
    </section>
  );
}
