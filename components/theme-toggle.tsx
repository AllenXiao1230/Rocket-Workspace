"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const storageKey = "rocket-workspace-theme";
const appearanceKey = "rocket-workspace-appearance";

export type AccentPreset = "rocket" | "ocean" | "violet" | "ember" | "graphite" | "custom";
export type Appearance = { preset: AccentPreset; primary: string; deep: string; highlight: string; warning: string };
export const accentPresets: Record<Exclude<AccentPreset, "custom">, Omit<Appearance, "preset"> & { label: string }> = {
  rocket: { label: "發射綠", primary: "#8dbd45", deep: "#315a3e", highlight: "#d7f45a", warning: "#f19156" },
  ocean: { label: "深海藍", primary: "#4aa6c9", deep: "#174f6b", highlight: "#a9ecff", warning: "#f6ad55" },
  violet: { label: "星雲紫", primary: "#9b7ad1", deep: "#4d356f", highlight: "#eadbff", warning: "#f3a663" },
  ember: { label: "熾焰橘", primary: "#e8874c", deep: "#783a25", highlight: "#ffe0a8", warning: "#e75d50" },
  graphite: { label: "石墨灰", primary: "#8d9ba2", deep: "#384850", highlight: "#dfe8e6", warning: "#d9965d" },
};
const fallbackAppearance: Appearance = { preset: "rocket", ...accentPresets.rocket };

export function getStoredAppearance(): Appearance {
  if (typeof window === "undefined") return fallbackAppearance;
  try {
    const stored = JSON.parse(window.localStorage.getItem(appearanceKey) || "") as Partial<Appearance>;
    if (![stored.primary, stored.deep, stored.highlight, stored.warning].every((value) => typeof value === "string")) return fallbackAppearance;
    return { preset: stored.preset || "custom", primary: stored.primary!, deep: stored.deep!, highlight: stored.highlight!, warning: stored.warning! };
  } catch { return fallbackAppearance; }
}

export function applyAppearance(appearance: Appearance) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--green", appearance.primary);
  root.style.setProperty("--green-deep", appearance.deep);
  root.style.setProperty("--acid", appearance.highlight);
  root.style.setProperty("--orange", appearance.warning);
  window.localStorage.setItem(appearanceKey, JSON.stringify(appearance));
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey) as Theme | null;
    const next = saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
    setTheme(next); document.documentElement.dataset.theme = next; applyAppearance(getStoredAppearance());
  }, []);
  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next); document.documentElement.dataset.theme = next; window.localStorage.setItem(storageKey, next);
  }
  return <button className="theme-toggle" type="button" onClick={toggle} aria-label={theme === "dark" ? "切換為淺色模式" : "切換為暗色模式"} title={theme === "dark" ? "淺色模式" : "暗色模式"}>{theme === "dark" ? "☀ 淺色" : "◐ 暗色"}</button>;
}
