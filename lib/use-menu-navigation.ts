"use client";

import { useCallback, useEffect, useRef, type KeyboardEvent } from "react";

const menuItemSelector = '[role="menuitem"]:not([disabled])';

/** Adds the roving focus behavior required by the WAI-ARIA menu pattern. */
export function useMenuNavigation(isOpen: boolean, onClose: () => void) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen || !menuRef.current) return;
    const menu = menuRef.current;
    const frame = window.requestAnimationFrame(() => {
      menu.querySelector<HTMLElement>(menuItemSelector)?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const menu = menuRef.current;
    if (!menu) return;
    const items = [...menu.querySelectorAll<HTMLElement>(menuItemSelector)];
    if (event.key === "Escape") {
      event.preventDefault();
      onCloseRef.current();
      return;
    }
    if (!items.length) return;

    const current = items.indexOf(document.activeElement as HTMLElement);
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown")
      nextIndex = current < 0 ? 0 : (current + 1) % items.length;
    if (event.key === "ArrowUp")
      nextIndex =
        current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = items.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    items[nextIndex].focus({ preventScroll: true });
  }, []);

  return { menuRef, onKeyDown };
}
