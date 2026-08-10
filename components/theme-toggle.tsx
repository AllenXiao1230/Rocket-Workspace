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
const themeEvent = "rocket-workspace-theme-change";
const appearanceEvent = "rocket-workspace-appearance-change";
const colorPattern = /^#[0-9a-f]{6}$/i;

export function getStoredAppearance(): Appearance {
  if (typeof window === "undefined") return fallbackAppearance;
  try {
    const stored = JSON.parse(window.localStorage.getItem(appearanceKey) || "") as Partial<Appearance>;
    if (![stored.primary, stored.deep, stored.highlight, stored.warning].every((value) => typeof value === "string" && colorPattern.test(value))) return fallbackAppearance;
    return { preset: stored.preset || "custom", primary: stored.primary!, deep: stored.deep!, highlight: stored.highlight!, warning: stored.warning! };
  } catch { return fallbackAppearance; }
}

export function applyAppearance(appearance: Appearance) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  // Keep colour meaning separate from the legacy aliases.  New components use
  // the semantic tokens; aliases keep every pre-existing component in sync.
  root.style.setProperty("--theme-primary", appearance.primary);
  root.style.setProperty("--theme-primary-deep", appearance.deep);
  root.style.setProperty("--theme-highlight", appearance.highlight);
  root.style.setProperty("--theme-warning", appearance.warning);
  root.style.setProperty("--green", appearance.primary);
  root.style.setProperty("--green-deep", appearance.deep);
  root.style.setProperty("--acid", appearance.highlight);
  root.style.setProperty("--orange", appearance.warning);
  window.localStorage.setItem(appearanceKey, JSON.stringify(appearance));
  window.dispatchEvent(new CustomEvent(appearanceEvent, { detail: appearance }));
}

export function applyTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem(storageKey, theme);
  window.dispatchEvent(new CustomEvent(themeEvent, { detail: theme }));
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey) as Theme | null;
    const next = saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
    setTheme(next); applyTheme(next); applyAppearance(getStoredAppearance());
    const onTheme = (event: Event) => setTheme((event as CustomEvent<Theme>).detail);
    window.addEventListener(themeEvent, onTheme);
    return () => window.removeEventListener(themeEvent, onTheme);
  }, []);
  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next); applyTheme(next);
  }
  return <button className="theme-toggle" type="button" onClick={toggle} aria-label={theme === "dark" ? "切換為淺色模式" : "切換為暗色模式"} title={theme === "dark" ? "淺色模式" : "暗色模式"}>{theme === "dark" ? "☀ 淺色" : "◐ 暗色"}</button>;
}
