"use client";

import { useDialogFocus } from "@/lib/use-dialog-focus";

type ConfirmDialogProps = {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  destructive = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const dialogRef = useDialogFocus<HTMLElement>(true, onCancel);

  return (
    <div className="app-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        ref={dialogRef}
        className="app-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">請確認操作</p>
        <h2 id="confirm-dialog-title">{title}</h2>
        <p id="confirm-dialog-description">{description}</p>
        <footer>
          <button
            type="button"
            className="dialog-secondary"
            data-dialog-initial-focus
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            className={destructive ? "dialog-danger" : "dialog-primary"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
