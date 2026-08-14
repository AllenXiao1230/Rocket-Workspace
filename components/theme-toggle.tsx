"use client";

import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
const storageKey = "rocket-workspace-theme";
const appearanceKey = "rocket-workspace-appearance";

export type AccentPreset =
  | "rocket"
  | "ocean"
  | "violet"
  | "ember"
  | "graphite"
  | "custom";
export type Appearance = {
  preset: AccentPreset;
  primary: string;
  deep: string;
  highlight: string;
  warning: string;
};
export const accentPresets: Record<
  Exclude<AccentPreset, "custom">,
  Omit<Appearance, "preset"> & { label: string }
> = {
  rocket: {
    label: "發射綠",
    primary: "#8dbd45",
    deep: "#315a3e",
    highlight: "#d7f45a",
    warning: "#f19156",
  },
  ocean: {
    label: "深海藍",
    primary: "#4aa6c9",
    deep: "#174f6b",
    highlight: "#a9ecff",
    warning: "#f6ad55",
  },
  violet: {
    label: "星雲紫",
    primary: "#9b7ad1",
    deep: "#4d356f",
    highlight: "#eadbff",
    warning: "#f3a663",
  },
  ember: {
    label: "熾焰橘",
    primary: "#e8874c",
    deep: "#783a25",
    highlight: "#ffe0a8",
    warning: "#e75d50",
  },
  graphite: {
    label: "石墨灰",
    primary: "#8d9ba2",
    deep: "#384850",
    highlight: "#dfe8e6",
    warning: "#d9965d",
  },
};
const fallbackAppearance: Appearance = { preset: "rocket", ...accentPresets.rocket };
export const themeChangeEvent = "rocket-workspace-theme-change";
const appearanceEvent = "rocket-workspace-appearance-change";
const colorPattern = /^#[0-9a-f]{6}$/i;
const minimumTextContrast = 4.5;
const minimumUiContrast = 3;

type AppearanceValidation =
  | { valid: true; appearance: Appearance }
  | { valid: false; appearance: Appearance; message: string };

function isAccentPreset(value: unknown): value is AccentPreset {
  return (
    value === "rocket" ||
    value === "ocean" ||
    value === "violet" ||
    value === "ember" ||
    value === "graphite" ||
    value === "custom"
  );
}

function relativeLuminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/[\da-f]{2}/gi)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(first: string, second: string) {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

function readableForeground(background: string) {
  const dark = "#000000";
  const light = "#fffefa";
  return contrastRatio(background, dark) >= contrastRatio(background, light)
    ? dark
    : light;
}

function isBuiltInPreset(appearance: Appearance) {
  if (appearance.preset === "custom") return false;
  const preset = accentPresets[appearance.preset];
  return (
    appearance.primary.toLowerCase() === preset.primary &&
    appearance.deep.toLowerCase() === preset.deep &&
    appearance.highlight.toLowerCase() === preset.highlight &&
    appearance.warning.toLowerCase() === preset.warning
  );
}

export function validateAppearance(appearance: Appearance): AppearanceValidation {
  const normalized: Appearance = {
    ...appearance,
    preset: isAccentPreset(appearance.preset) ? appearance.preset : "custom",
  };
  const colors = [
    normalized.primary,
    normalized.deep,
    normalized.highlight,
    normalized.warning,
  ];
  if (!colors.every((value) => typeof value === "string" && colorPattern.test(value))) {
    return {
      valid: false,
      appearance: { ...fallbackAppearance },
      message: "自訂配色格式無效，請重新選擇顏色。",
    };
  }
  if (isBuiltInPreset(normalized)) return { valid: true, appearance: normalized };

  const customAppearance = { ...normalized, preset: "custom" as const };
  if (
    contrastRatio(customAppearance.deep, customAppearance.highlight) < minimumTextContrast
  ) {
    return {
      valid: false,
      appearance: { ...fallbackAppearance },
      message: "深色與強調色的對比不足，按鈕文字可能難以閱讀。",
    };
  }
  if (
    contrastRatio(customAppearance.deep, customAppearance.primary) < minimumUiContrast ||
    contrastRatio(customAppearance.deep, customAppearance.warning) < minimumUiContrast
  ) {
    return {
      valid: false,
      appearance: { ...fallbackAppearance },
      message: "主色或提示色與深色太接近，重要狀態會不易辨識。",
    };
  }
  return { valid: true, appearance: customAppearance };
}

export function getStoredAppearance(): Appearance {
  if (typeof window === "undefined") return fallbackAppearance;
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(appearanceKey) || "",
    ) as Partial<Appearance>;
    return validateAppearance({
      preset: isAccentPreset(stored.preset) ? stored.preset : "custom",
      primary: typeof stored.primary === "string" ? stored.primary : "",
      deep: typeof stored.deep === "string" ? stored.deep : "",
      highlight: typeof stored.highlight === "string" ? stored.highlight : "",
      warning: typeof stored.warning === "string" ? stored.warning : "",
    }).appearance;
  } catch {
    return fallbackAppearance;
  }
}

export function applyAppearance(
  appearance: Appearance,
  fallback: Appearance = fallbackAppearance,
): AppearanceValidation {
  const validation = validateAppearance(appearance);
  const safeAppearance = validation.valid
    ? validation.appearance
    : validateAppearance(fallback).appearance;
  if (typeof window === "undefined") {
    return validation.valid ? validation : { ...validation, appearance: safeAppearance };
  }
  const root = document.documentElement;
  // Keep colour meaning separate from the legacy aliases.  New components use
  // the semantic tokens; aliases keep every pre-existing component in sync.
  root.style.setProperty("--theme-primary", safeAppearance.primary);
  root.style.setProperty("--theme-primary-deep", safeAppearance.deep);
  root.style.setProperty("--theme-highlight", safeAppearance.highlight);
  root.style.setProperty("--theme-warning", safeAppearance.warning);
  root.style.setProperty(
    "--theme-on-primary",
    readableForeground(safeAppearance.primary),
  );
  root.style.setProperty(
    "--theme-on-warning",
    readableForeground(safeAppearance.warning),
  );
  root.style.setProperty("--green", safeAppearance.primary);
  root.style.setProperty("--green-deep", safeAppearance.deep);
  root.style.setProperty("--acid", safeAppearance.highlight);
  root.style.setProperty("--orange", safeAppearance.warning);
  try {
    window.localStorage.setItem(appearanceKey, JSON.stringify(safeAppearance));
  } catch {
    // Appearance still applies for this visit when browser storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(appearanceEvent, { detail: safeAppearance }));
  return validation.valid ? validation : { ...validation, appearance: safeAppearance };
}

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const saved = window.localStorage.getItem(storageKey) as Theme | null;
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Fall through to the browser preference when storage is unavailable.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(storageKey, theme);
  } catch {
    // Theme selection remains active for the current page when storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(themeChangeEvent, { detail: theme }));
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const next = getStoredTheme();
    setTheme(next);
    applyTheme(next);
    applyAppearance(getStoredAppearance());
    const onTheme = (event: Event) => setTheme((event as CustomEvent<Theme>).detail);
    window.addEventListener(themeChangeEvent, onTheme);
    return () => window.removeEventListener(themeChangeEvent, onTheme);
  }, []);
  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }
  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "切換為淺色模式" : "切換為暗色模式"}
      aria-pressed={theme === "dark"}
      title={theme === "dark" ? "已啟用暗色模式；切換為淺色模式" : "切換為暗色模式"}
    >
      {theme === "dark" ? "☀ 淺色" : "◐ 暗色"}
    </button>
  );
}
