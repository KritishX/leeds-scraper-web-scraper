import { useId, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

export type ThemeChoice = "system" | "light" | "dark";
export const THEME_CHOICES: ThemeChoice[] = ["system", "light", "dark"];
const KEY = "leeds-theme";
const LABEL = { system: "System", light: "Light", dark: "Dark" };
// "System" follows the OS live; no OS preference means dark, as before themes.
const media =
  typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: light)")
    : null;
const listeners = new Set<() => void>();
let choice: ThemeChoice = read();

function read(): ThemeChoice {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}
// Mirrors public/theme-init.js, which runs before the bundle loads.
function apply() {
  const dark = choice === "dark" || (choice === "system" && !media?.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#171819" : "#f5f6f4");
}
media?.addEventListener("change", () => choice === "system" && apply());

export function setTheme(next: ThemeChoice) {
  choice = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Blocked storage: the choice lasts until the page is reloaded.
  }
  apply();
  listeners.forEach((listener) => listener());
}

export function useTheme() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => choice,
  );
}

// Cycles System → Light → Dark; the label names the current and next state.
export function ThemeToggle() {
  const current = useTheme();
  const next =
    THEME_CHOICES[(THEME_CHOICES.indexOf(current) + 1) % THEME_CHOICES.length];
  const Icon = { system: Monitor, light: Sun, dark: Moon }[current];
  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      aria-label={`Theme: ${LABEL[current]}. Switch to ${LABEL[next]}.`}
      title={`Theme: ${LABEL[current]}`}
      onClick={() => setTheme(next)}
    >
      <Icon size={17} />
    </button>
  );
}

export function ThemeRadios() {
  const current = useTheme();
  const name = useId();
  return (
    <fieldset className="theme-choice">
      <legend>Theme</legend>
      {THEME_CHOICES.map((value) => (
        <label className="check-field" key={value}>
          <input
            type="radio"
            name={name}
            value={value}
            checked={current === value}
            onChange={() => setTheme(value)}
          />
          <span>
            {LABEL[value]}
            {value === "system" && <small>Follows your device setting.</small>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
