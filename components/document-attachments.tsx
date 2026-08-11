"use client";

import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";

type Attachment = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  deletedAt?: string | null;
};

function displaySize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function DocumentAttachments({
  documentId,
  canWrite,
  canPurge,
  onInsertImage,
}: {
  documentId: string;
  canWrite: boolean;
  canPurge: boolean;
  onInsertImage?: (attachment: Attachment) => void;
}) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [trashed, setTrashed] = useState<Attachment[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState("");
  const [pendingAction, setPendingAction] = useState<{
    type: "trash" | "purge";
    attachment: Attachment;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    const response = await fetch(
      `/api/attachments?documentId=${encodeURIComponent(documentId)}`,
      { cache: "no-store" },
    );
    if (response.ok) setAttachments((await response.json()) as Attachment[]);
    else setStatus("無法讀取附件清單");
  }, [documentId]);
  useEffect(() => {
    void load();
  }, [load]);
  const loadTrash = useCallback(async () => {
    const response = await fetch(
      `/api/documents/${encodeURIComponent(documentId)}/attachments/recycle`,
      { cache: "no-store" },
    );
    if (response.ok) setTrashed((await response.json()) as Attachment[]);
    else setStatus("無法讀取附件回收桶");
  }, [documentId]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setStatus(`正在上傳 ${file.name}…`);
    const data = new FormData();
    data.append("documentId", documentId);
    data.append("file", file);
    const response = await fetch("/api/attachments", { method: "POST", body: data });
    const result = (await response.json()) as Attachment & { error?: string };
    if (!response.ok) return setStatus(result.error || "上傳失敗");
    setAttachments((current) => [result, ...current]);
    setStatus("附件已上傳");
    setExpanded(true);
  }
  async function remove(attachment: Attachment) {
    setStatus("正在刪除附件…");
    const response = await fetch(
      `/api/attachments?id=${encodeURIComponent(attachment.id)}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      return setStatus(result.error || "刪除失敗");
    }
    setAttachments((current) => current.filter((item) => item.id !== attachment.id));
    setStatus("附件已移至回收桶");
    void loadTrash();
  }
  async function restore(attachment: Attachment) {
    const response = await fetch(
      `/api/documents/${encodeURIComponent(documentId)}/attachments/recycle`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachmentId: attachment.id }),
      },
    );
    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      return setStatus(result.error || "還原失敗");
    }
    setTrashed((current) => current.filter((item) => item.id !== attachment.id));
    await load();
    setStatus("附件已還原");
  }
  async function purge(attachment: Attachment) {
    const response = await fetch(
      `/api/documents/${encodeURIComponent(documentId)}/attachments/recycle?attachmentId=${encodeURIComponent(attachment.id)}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      return setStatus(result.error || "永久刪除失敗");
    }
    setTrashed((current) => current.filter((item) => item.id !== attachment.id));
    setStatus("附件已永久刪除");
  }

  return (
    <section className="document-attachments" aria-label="文件附件">
      <header>
        <div>
          <strong>附件</strong>
          <span>{attachments.length ? `${attachments.length} 個檔案` : "尚無附件"}</span>
        </div>
        <div>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
          >
            {expanded ? "收起" : "查看"}
          </button>
          {canWrite && (
            <>
              <button
                className="button-secondary"
                type="button"
                onClick={() => void loadTrash()}
              >
                附件回收桶
              </button>
              <button
                type="button"
                className="collab-primary"
                onClick={() => inputRef.current?.click()}
              >
                上傳檔案
              </button>
            </>
          )}
          <input ref={inputRef} type="file" hidden onChange={upload} />
        </div>
      </header>
      {expanded && (
        <div className="attachment-list">
          {attachments.length === 0 ? (
            <p>尚未附加檔案。</p>
          ) : (
            attachments.map((attachment) => (
              <article key={attachment.id}>
                <div>
                  <a
                    href={`/api/attachments?id=${encodeURIComponent(attachment.id)}`}
                    title={`下載 ${attachment.filename}`}
                  >
                    📎 {attachment.filename}
                  </a>
                  <small>
                    {displaySize(attachment.size)} ·{" "}
                    {new Date(attachment.createdAt).toLocaleString("zh-TW")}
                  </small>
                </div>
                {canWrite && (
                  <span>
                    {onInsertImage && attachment.mimeType.startsWith("image/") && (
                      <button
                        type="button"
                        className="collab-primary"
                        onClick={() => {
                          onInsertImage(attachment);
                          setStatus("圖片已插入文件，正在儲存");
                        }}
                      >
                        插入圖片
                      </button>
                    )}
                    <button
                      type="button"
                      className="attachment-remove"
                      aria-label={`刪除 ${attachment.filename}`}
                      onClick={() => setPendingAction({ type: "trash", attachment })}
                    >
                      刪除
                    </button>
                  </span>
                )}
              </article>
            ))
          )}
        </div>
      )}
      {trashed.length > 0 && (
        <div className="attachment-list">
          <p>附件回收桶</p>
          {trashed.map((attachment) => (
            <article key={attachment.id}>
              <div>
                <strong>🗑️ {attachment.filename}</strong>
                <small>
                  刪除於{" "}
                  {attachment.deletedAt
                    ? new Date(attachment.deletedAt).toLocaleString("zh-TW")
                    : "未知時間"}
                </small>
              </div>
              {canWrite && (
                <span>
                  <button
                    type="button"
                    className="collab-primary"
                    onClick={() => void restore(attachment)}
                  >
                    還原
                  </button>
                  {canPurge && (
                    <button
                      type="button"
                      className="attachment-remove"
                      onClick={() => setPendingAction({ type: "purge", attachment })}
                    >
                      永久刪除
                    </button>
                  )}
                </span>
              )}
            </article>
          ))}
        </div>
      )}
      {status && (
        <p className="attachment-status" role="status">
          {status}
        </p>
      )}
      {pendingAction && (
        <ConfirmDialog
          title={pendingAction.type === "purge" ? "永久刪除附件？" : "移至附件回收桶？"}
          description={
            pendingAction.type === "purge"
              ? `「${pendingAction.attachment.filename}」將無法還原。`
              : `「${pendingAction.attachment.filename}」之後仍可從附件回收桶還原。`
          }
          confirmLabel={pendingAction.type === "purge" ? "永久刪除" : "移至回收桶"}
          destructive
          onCancel={() => setPendingAction(null)}
          onConfirm={() => {
            const action = pendingAction;
            setPendingAction(null);
            if (action.type === "purge") void purge(action.attachment);
            else void remove(action.attachment);
          }}
        />
      )}
    </section>
  );
}
