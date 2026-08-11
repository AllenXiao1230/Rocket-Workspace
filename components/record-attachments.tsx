"use client";

import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";

type Attachment = {
  id: string;
  filename: string;
  size: number;
  createdAt: string;
  deletedAt?: string | null;
};

function displaySize(size: number) {
  if (size < 1024) return size + " B";
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + " KB";
  return (size / 1024 / 1024).toFixed(1) + " MB";
}

export function RecordAttachments({
  projectId,
  module,
  recordId,
  canWrite,
  canPurge,
}: {
  projectId: string;
  module: "bom" | "tests";
  recordId: string;
  canWrite: boolean;
  canPurge: boolean;
}) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [trashed, setTrashed] = useState<Attachment[]>([]);
  const [recycleOpen, setRecycleOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [pendingAction, setPendingAction] = useState<{
    type: "trash" | "purge";
    attachment: Attachment;
  } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const path =
    "/api/projects/" + projectId + "/records/" + module + "/" + recordId + "/attachments";
  const recyclePath = path + "/recycle";

  const load = useCallback(async () => {
    const response = await fetch(path, { cache: "no-store" });
    if (response.ok) setItems((await response.json()) as Attachment[]);
    else setNotice("無法讀取附件清單");
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadTrash = useCallback(async () => {
    const response = await fetch(recyclePath, { cache: "no-store" });
    if (response.ok) setTrashed((await response.json()) as Attachment[]);
    else setNotice("無法讀取附件回收桶");
  }, [recyclePath]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const data = new FormData();
    data.set("file", file);
    const response = await fetch(path, { method: "POST", body: data });
    const result = (await response.json()) as Attachment & { error?: string };
    if (!response.ok) return setNotice(result.error || "上傳失敗");
    setItems((current) => [result, ...current]);
    setNotice("附件已上傳");
  }

  async function remove(attachment: Attachment) {
    const response = await fetch(
      path + "?attachmentId=" + encodeURIComponent(attachment.id),
      {
        method: "DELETE",
      },
    );
    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      return setNotice(result.error || "刪除失敗");
    }
    setItems((current) => current.filter((item) => item.id !== attachment.id));
    setNotice("附件已移至回收桶");
    void loadTrash();
  }

  async function restore(attachment: Attachment) {
    const response = await fetch(recyclePath, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attachmentId: attachment.id }),
    });
    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      return setNotice(result.error || "還原失敗");
    }
    setTrashed((current) => current.filter((item) => item.id !== attachment.id));
    await load();
    setNotice("附件已還原");
  }

  async function purge(attachment: Attachment) {
    const response = await fetch(
      recyclePath + "?attachmentId=" + encodeURIComponent(attachment.id),
      { method: "DELETE" },
    );
    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      return setNotice(result.error || "永久刪除失敗");
    }
    setTrashed((current) => current.filter((item) => item.id !== attachment.id));
    setNotice("附件已排入永久刪除");
  }

  return (
    <section className="record-attachments" aria-label="紀錄附件">
      <header>
        <div>
          <strong>附件</strong>
          <span>{items.length ? items.length + " 個檔案" : "尚無附件"}</span>
        </div>
        <div>
          {canWrite && (
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                setRecycleOpen((value) => !value);
                if (!recycleOpen) void loadTrash();
              }}
              aria-expanded={recycleOpen}
            >
              附件回收桶
            </button>
          )}
          {canWrite && (
            <>
              <button type="button" onClick={() => input.current?.click()}>
                上傳檔案
              </button>
              <input ref={input} hidden type="file" onChange={upload} />
            </>
          )}
        </div>
      </header>
      {items.length ? (
        <div className="attachment-list">
          {items.map((item) => (
            <article key={item.id}>
              <div>
                <a href={path + "?attachmentId=" + encodeURIComponent(item.id)}>
                  📎 {item.filename}
                </a>
                <small>
                  {displaySize(item.size)} ·{" "}
                  {new Date(item.createdAt).toLocaleString("zh-TW")}
                </small>
              </div>
              {canWrite && (
                <button
                  type="button"
                  className="attachment-remove"
                  aria-label={"刪除 " + item.filename}
                  onClick={() => setPendingAction({ type: "trash", attachment: item })}
                >
                  刪除
                </button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="hint">尚無附件。</p>
      )}
      {recycleOpen && (
        <div className="attachment-list" aria-label="附件回收桶">
          <p>附件回收桶</p>
          {trashed.length ? (
            trashed.map((attachment) => (
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
              </article>
            ))
          ) : (
            <p className="hint">回收桶沒有附件。</p>
          )}
        </div>
      )}
      {notice && (
        <p className="attachment-status" role="status">
          {notice}
        </p>
      )}
      {pendingAction && (
        <ConfirmDialog
          title={pendingAction.type === "purge" ? "永久刪除附件？" : "移至附件回收桶？"}
          description={
            pendingAction.type === "purge"
              ? "「" + pendingAction.attachment.filename + "」將無法還原。"
              : "「" + pendingAction.attachment.filename + "」之後仍可從附件回收桶還原。"
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
