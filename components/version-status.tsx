"use client";

import { useEffect, useState } from "react";

type VersionState = {
  version: string;
  commit: string;
  configured: boolean;
  comparison:
    | "UP_TO_DATE"
    | "UPDATE_AVAILABLE"
    | "NOT_CONFIGURED"
    | "NOT_COMPARABLE"
    | "UNAVAILABLE";
  updateAvailable: boolean;
  behindBy?: number;
  aheadBy?: number;
  remoteCommit?: string | null;
  updateUrl?: string;
  message?: string;
};

export function VersionStatus() {
  const [status, setStatus] = useState<VersionState | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void fetch("/api/version", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((result: VersionState | null) => {
        setStatus(result);
        if (result?.updateAvailable) setOpen(true);
      });
  }, []);
  if (!status) return null;
  const title =
    status.comparison === "UPDATE_AVAILABLE"
      ? "有可用更新"
      : status.comparison === "UP_TO_DATE"
        ? "目前部署版本"
        : "版本驗證尚未完成";
  const description =
    status.comparison === "UPDATE_AVAILABLE"
      ? `伺服器版本比儲存庫預設分支落後 ${status.behindBy || 1} 個提交。請依部署流程更新伺服器。`
      : status.comparison === "UP_TO_DATE"
        ? "目前版本已是儲存庫可比對的最新狀態。"
        : status.message || "目前無法完成版本比對。";
  return (
    <>
      <button
        type="button"
        className={`version-status ${status.updateAvailable ? "update" : ""}`}
        onClick={() => setOpen(true)}
      >
        {status.updateAvailable
          ? `可更新（落後 ${status.behindBy || 1} 個提交）`
          : `版本 ${status.version}`}
      </button>
      {open && (
        <div
          className="app-dialog-backdrop"
          role="presentation"
          onMouseDown={() => setOpen(false)}
        >
          <section
            className="app-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="version-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">系統版本</p>
            <h2 id="version-dialog-title">{title}</h2>
            <p>{description}</p>
            <dl>
              <div>
                <dt>應用程式版本</dt>
                <dd>{status.version}</dd>
              </div>
              <div>
                <dt>伺服器提交</dt>
                <dd>{status.commit}</dd>
              </div>
              {status.remoteCommit && (
                <div>
                  <dt>遠端提交</dt>
                  <dd>{status.remoteCommit}</dd>
                </div>
              )}
              {status.comparison === "UP_TO_DATE" && Boolean(status.aheadBy) && (
                <div>
                  <dt>本機領先提交</dt>
                  <dd>{status.aheadBy}</dd>
                </div>
              )}
            </dl>
            <footer>
              {status.updateAvailable && status.updateUrl && (
                <a
                  className="dialog-primary"
                  href={status.updateUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  查看更新
                </a>
              )}
              <button
                type="button"
                className="dialog-secondary"
                onClick={() => setOpen(false)}
              >
                關閉
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
