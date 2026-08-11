"use client";

import { useCallback, useEffect, useState } from "react";
import { useDialogFocus } from "@/lib/use-dialog-focus";

type Backlink = { id: string; title: string; icon: string; updatedAt: string };
type Workflow = {
  properties: Record<string, string>;
  reviewState: "DRAFT" | "IN_REVIEW" | "APPROVED" | "CHANGES_REQUESTED";
  reviewRequestedAt: string | null;
  reviewedAt: string | null;
  lockedAt: string | null;
  lockedById: string | null;
  lockedBy: { name: string } | null;
  reviewer: { name: string } | null;
  canManage: boolean;
  canWrite: boolean;
  isLockedByMe: boolean;
};

const reviewLabels = {
  DRAFT: "草稿",
  IN_REVIEW: "審核中",
  APPROVED: "已核准",
  CHANGES_REQUESTED: "要求修改",
};

export function DocumentWorkflowPanel({
  documentId,
  projectId,
  canWrite,
}: {
  documentId: string;
  projectId: string;
  canWrite: boolean;
}) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [backlinks, setBacklinks] = useState<Backlink[]>([]);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [propertyDraft, setPropertyDraft] = useState<{
    key: string;
    value: string;
  } | null>(null);
  const propertyDialogRef = useDialogFocus<HTMLElement>(Boolean(propertyDraft), () =>
    setPropertyDraft(null),
  );

  const load = useCallback(async () => {
    const [workflowResponse, linksResponse] = await Promise.all([
      fetch(`/api/documents/${documentId}/workflow`, { cache: "no-store" }),
      fetch(`/api/documents/${documentId}/backlinks`, { cache: "no-store" }),
    ]);
    if (workflowResponse.ok) setWorkflow(await workflowResponse.json());
    if (linksResponse.ok) setBacklinks(await linksResponse.json());
  }, [documentId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);
  async function action(
    actionName:
      | "lock"
      | "unlock"
      | "request_review"
      | "approve"
      | "changes_requested"
      | "update_properties",
    properties?: Record<string, string>,
  ) {
    const response = await fetch(`/api/documents/${documentId}/workflow`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: actionName, properties }),
    });
    const result = await response.json();
    if (!response.ok) {
      setNotice(result.error || "無法更新文件工作流程");
      return false;
    }
    setWorkflow(result);
    setNotice(
      actionName === "update_properties" ? "頁面屬性已儲存" : "文件工作流程已更新",
    );
    return true;
  }

  async function saveProperty(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!propertyDraft?.key.trim()) return;
    const next = {
      ...(workflow?.properties || {}),
      [propertyDraft.key.trim()]: propertyDraft.value,
    };
    if (await action("update_properties", next)) setPropertyDraft(null);
  }

  function removeProperty(key: string) {
    const next = { ...(workflow?.properties || {}) };
    delete next[key];
    void action("update_properties", next);
  }

  return (
    <section className="document-workflow">
      <div>
        <button
          type="button"
          className={open ? "active" : ""}
          onClick={() => setOpen((value) => !value)}
        >
          ◇ 屬性與審核
        </button>
      </div>
      {open && (
        <div className="collab-panel">
          <div className="workflow-head">
            <span
              className={`workflow-state ${workflow?.reviewState?.toLowerCase() || "draft"}`}
            >
              {workflow ? reviewLabels[workflow.reviewState] : "載入中"}
            </span>
            {workflow?.lockedAt && (
              <span className="workflow-lock">
                🔒 {workflow.lockedBy?.name || "成員"} 鎖定中
              </span>
            )}
          </div>
          {workflow && (
            <>
              <div className="workflow-properties">
                {Object.keys(workflow.properties).length ? (
                  Object.entries(workflow.properties).map(([key, value]) => (
                    <div key={key}>
                      <strong>{key}</strong>
                      <span>{value}</span>
                      {canWrite && (
                        <button
                          type="button"
                          onClick={() => removeProperty(key)}
                          aria-label={`移除 ${key}`}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="hint">尚未設定頁面屬性。</p>
                )}
              </div>
              {canWrite && (
                <button
                  type="button"
                  onClick={() => setPropertyDraft({ key: "", value: "" })}
                >
                  ＋ 新增／更新屬性
                </button>
              )}
              <div className="workflow-actions">
                {canWrite &&
                  (!workflow.lockedAt || workflow.isLockedByMe || workflow.canManage) && (
                    <button
                      type="button"
                      onClick={() => void action(workflow.lockedAt ? "unlock" : "lock")}
                    >
                      {workflow.lockedAt ? "解除鎖定" : "鎖定文件"}
                    </button>
                  )}
                {canWrite && workflow.reviewState !== "IN_REVIEW" && (
                  <button type="button" onClick={() => void action("request_review")}>
                    送交審核
                  </button>
                )}
                {workflow.canManage && workflow.reviewState === "IN_REVIEW" && (
                  <>
                    <button
                      type="button"
                      className="collab-primary"
                      onClick={() => void action("approve")}
                    >
                      核准
                    </button>
                    <button
                      type="button"
                      onClick={() => void action("changes_requested")}
                    >
                      要求修改
                    </button>
                  </>
                )}
              </div>
              <div className="backlink-list">
                <strong>反向連結</strong>
                {backlinks.length ? (
                  backlinks.map((link) => (
                    <a
                      key={link.id}
                      href={`/?project=${encodeURIComponent(projectId)}&document=${encodeURIComponent(link.id)}`}
                    >
                      ↩ {link.icon} {link.title}
                    </a>
                  ))
                ) : (
                  <p className="hint">
                    尚無反向連結。於 Markdown 使用 [[目前頁面標題]] 即可建立可追蹤連結。
                  </p>
                )}
              </div>
            </>
          )}
          {notice && <p className="collab-notice">{notice}</p>}
        </div>
      )}
      {propertyDraft && (
        <div
          className="app-dialog-backdrop"
          role="presentation"
          onMouseDown={() => setPropertyDraft(null)}
        >
          <section
            ref={propertyDialogRef}
            className="app-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="property-dialog-title"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">頁面屬性</p>
            <h2 id="property-dialog-title">新增／更新屬性</h2>
            <form onSubmit={saveProperty}>
              <label>
                屬性名稱
                <input
                  data-dialog-initial-focus
                  autoFocus
                  value={propertyDraft.key}
                  onChange={(event) =>
                    setPropertyDraft({ ...propertyDraft, key: event.target.value })
                  }
                  placeholder="例如：文件狀態"
                  required
                />
              </label>
              <label>
                屬性值
                <input
                  value={propertyDraft.value}
                  onChange={(event) =>
                    setPropertyDraft({ ...propertyDraft, value: event.target.value })
                  }
                  placeholder="輸入屬性值"
                />
              </label>
              <footer>
                <button
                  type="button"
                  className="dialog-secondary"
                  onClick={() => setPropertyDraft(null)}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="dialog-primary"
                  disabled={!propertyDraft.key.trim()}
                >
                  儲存屬性
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
