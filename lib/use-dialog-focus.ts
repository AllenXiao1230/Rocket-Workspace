"use client";

import { useEffect, useRef } from "react";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function getFocusable(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>(focusableSelector)].filter(
    (element) => !element.hasAttribute("hidden") && element.getClientRects().length > 0,
  );
}

/** Keeps a modal dialog keyboard-contained and returns focus to its trigger on close. */
export function useDialogFocus<T extends HTMLElement>(
  isOpen: boolean,
  onClose: () => void,
) {
  const dialogRef = useRef<T | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen || !dialogRef.current) return;
    const dialog = dialogRef.current;
    triggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusInitial = window.requestAnimationFrame(() => {
      const initial =
        dialog.querySelector<HTMLElement>("[data-dialog-initial-focus]") ||
        getFocusable(dialog)[0] ||
        dialog;
      initial.focus({ preventScroll: true });
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = getFocusable(dialog);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1)!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusInitial);
      document.removeEventListener("keydown", onKeyDown);
      triggerRef.current?.focus({ preventScroll: true });
    };
  }, [isOpen]);

  return dialogRef;
}
