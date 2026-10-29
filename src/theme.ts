import { useSyncExternalStore } from "react";

// Keep the key, colours and resolution rule in step with public/theme-init.js,
// which applies the theme before React loads.
export type ThemePreference = "system" | "light" | "dark";
export type Theme = "light" | "dark";

export const THEME_KEY = "leeds-theme";
export const THEME_ORDER: ThemePreference[] = ["system", "light", "dark"];
export const THEME_LABELS: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};
const THEME_COLORS: Record<Theme, string> = { light: "#f5f6f3", dark: "#171819" };

export function parsePreference(value: unknown): ThemePreference {
  return THEME_ORDER.includes(value as ThemePreference)
    ? (value as ThemePreference)
    : "system";
}

export function resolveTheme(pref: ThemePreference, systemPrefersLight: boolean): Theme {
  if (pref === "system") return systemPrefersLight ? "light" : "dark";
  return pref;
}

export function nextPreference(pref: ThemePreference): ThemePreference {
  return THEME_ORDER[(THEME_ORDER.indexOf(pref) + 1) % THEME_ORDER.length];
}

const lightQuery = () => window.matchMedia("(prefers-color-scheme: light)");

function readPreference(): ThemePreference {
  try {
    return parsePreference(localStorage.getItem(THEME_KEY));
  } catch {
    return "system";
  }
}

let preference: ThemePreference = "system";
const listeners = new Set<() => void>();

function apply() {
  const theme = resolveTheme(preference, lightQuery().matches);
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLORS[theme]);
  listeners.forEach((listener) => listener());
}

export function setThemePreference(pref: ThemePreference) {
  preference = pref;
  try {
    if (pref === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    // Storage can be blocked; the choice then lasts for this page only.
  }
  apply();
}

if (typeof window !== "undefined") {
  preference = readPreference();
  apply();
  lightQuery().addEventListener("change", () => {
    if (preference === "system") apply();
  });
  // Keep other open tabs in step.
  window.addEventListener("storage", (e) => {
    if (e.key === THEME_KEY || e.key === null) {
      preference = readPreference();
      apply();
    }
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme() {
  const pref = useSyncExternalStore(subscribe, () => preference);
  const theme = useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.theme as Theme,
  );
  return { preference: pref, theme, setPreference: setThemePreference };
}
