import type { ITheme } from "@xterm/xterm";

export interface TerminalThemePreset {
  id: string;
  label: string;
  /** undefined = xterm.js's own built-in default (pure black) - not a copy
   * of it, the actual library default, so it can never drift out of sync. */
  theme: ITheme | undefined;
  /** Background swatch shown in the picker UI, and reused as MergedLogView's
   * background so it doesn't look jarring next to a themed terminal tab in
   * the same pane. */
  previewBg: string;
  previewFg: string;
}

// Solarized Dark: Ethan Schoonover's palette, values from the official spec
// (https://en.wikipedia.org/wiki/Solarized) - not invented here. It's
// specifically engineered for balanced, low-eye-strain contrast, which is
// exactly the complaint this is answering. Base/accent -> ANSI slot mapping
// follows the same convention used by the original Solarized terminal
// configs (Xresources, iTerm, etc.), reproduced widely enough to be a
// de facto standard.
const SOLARIZED_DARK: ITheme = {
  background: "#002b36", // base03
  foreground: "#839496", // base0
  cursor: "#93a1a1", // base1
  selectionBackground: "#073642", // base02
  black: "#073642", // base02
  red: "#dc322f",
  green: "#859900",
  yellow: "#b58900",
  blue: "#268bd2",
  magenta: "#d33682",
  cyan: "#2aa198",
  white: "#eee8d5", // base2
  brightBlack: "#002b36", // base03
  brightRed: "#cb4b16", // orange
  brightGreen: "#586e75", // base01
  brightYellow: "#657b83", // base00
  brightBlue: "#839496", // base0
  brightMagenta: "#6c71c4", // violet
  brightCyan: "#93a1a1", // base1
  brightWhite: "#fdf6e3", // base3
};

// Soft Dark: same idea as VS Code's/most modern terminals' default (dark
// gray, not pure black), just background/foreground/cursor/selection - the
// existing ANSI 16 colors (already tuned for a dark background) are left
// alone rather than reinvented, since that's the lower-risk change and this
// preset exists specifically to be a safe, minimal step down from pure black.
const SOFT_DARK: ITheme = {
  background: "#1e1e1e",
  foreground: "#d4d4d4",
  cursor: "#d4d4d4",
  selectionBackground: "#264f78",
};

export const TERMINAL_THEMES: TerminalThemePreset[] = [
  { id: "classic", label: "Classic (xterm default)", theme: undefined, previewBg: "#000000", previewFg: "#ffffff" },
  { id: "soft-dark", label: "Soft Dark", theme: SOFT_DARK, previewBg: "#1e1e1e", previewFg: "#d4d4d4" },
  { id: "solarized-dark", label: "Solarized Dark", theme: SOLARIZED_DARK, previewBg: "#002b36", previewFg: "#839496" },
];

const STORAGE_KEY = "logs-console:terminal-theme";
const DEFAULT_THEME_ID = "classic";

export function loadStoredThemeId(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && TERMINAL_THEMES.some((t) => t.id === stored) ? stored : DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export function storeThemeId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // best-effort only
  }
}

export function getThemePreset(id: string): TerminalThemePreset {
  return TERMINAL_THEMES.find((t) => t.id === id) ?? TERMINAL_THEMES[0];
}
