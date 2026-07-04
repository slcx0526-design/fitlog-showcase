"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

/**
 * Lite is the stable default. Pulse is an original high-energy comic/JRPG
 * presentation layer; it does not change any training, nutrition, or body data.
 */
export type UIMode = "lite" | "pulse";
const KEY = "fitlog:uiMode";

export function isPersonaMode(mode: UIMode) {
  return mode === "lite" || mode === "pulse";
}

interface UIModeApi {
  mode: UIMode;
  setMode: (m: UIMode) => void;
  loaded: boolean;
}

const UIModeContext = createContext<UIModeApi | null>(null);

export function UIModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<UIMode>("lite");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KEY);
      // Migrate the old "default" choice to Lite instead of leaving a dead mode.
      const initial: UIMode = saved === "pulse" ? "pulse" : "lite";
      setModeState(initial);
      document.documentElement.setAttribute("data-mode", initial);
      if (saved !== initial) window.localStorage.setItem(KEY, initial);
    } catch {
      document.documentElement.setAttribute("data-mode", "lite");
    }
    setLoaded(true);
  }, []);

  const setMode = useCallback((next: UIMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(KEY, next);
      document.documentElement.setAttribute("data-mode", next);
    } catch {
      /* Storage failure must never block the app. */
    }
  }, []);

  return (
    <UIModeContext.Provider value={{ mode, setMode, loaded }}>
      {children}
    </UIModeContext.Provider>
  );
}

export function useUIMode(): UIModeApi {
  const ctx = useContext(UIModeContext);
  if (!ctx) throw new Error("useUIMode 必须在 UIModeProvider 内使用");
  return ctx;
}
