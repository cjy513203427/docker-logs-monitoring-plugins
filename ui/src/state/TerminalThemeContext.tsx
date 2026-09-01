import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { getThemePreset, loadStoredThemeId, storeThemeId, type TerminalThemePreset } from "../utils/terminalThemes";

interface TerminalThemeContextValue {
  preset: TerminalThemePreset;
  setThemeId: (id: string) => void;
}

const TerminalThemeContext = createContext<TerminalThemeContextValue | null>(null);

export function TerminalThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState(loadStoredThemeId);

  const value = useMemo<TerminalThemeContextValue>(
    () => ({
      preset: getThemePreset(themeId),
      setThemeId: (id: string) => {
        storeThemeId(id);
        setThemeIdState(id);
      },
    }),
    [themeId],
  );

  return <TerminalThemeContext.Provider value={value}>{children}</TerminalThemeContext.Provider>;
}

export function useTerminalTheme(): TerminalThemeContextValue {
  const ctx = useContext(TerminalThemeContext);
  if (!ctx) throw new Error("useTerminalTheme must be used within a TerminalThemeProvider");
  return ctx;
}
