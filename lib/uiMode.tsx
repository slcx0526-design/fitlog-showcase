"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { CharacterId, CharacterMode, CharacterPack } from "./characterPacks";

/** Interface modes never alter training, nutrition, body, or cut data. */
export type UIMode = "lite" | "pulse" | "midnight" | "survival";
const KEY = "fitlog:uiMode";

type CharacterSelections = Record<CharacterMode, CharacterId>;

export function isPersonaMode(mode: UIMode) {
  return mode !== "lite";
}

interface UIModeApi {
  mode: UIMode;
  setMode: (m: UIMode) => void;
  characters: CharacterSelections;
  activeCharacter: CharacterPack | null;
  setCharacter: (character: CharacterId) => void;
  loaded: boolean;
}

const UIModeContext = createContext<UIModeApi | null>(null);

function readMode(value: string | null): UIMode {
  return value === "pulse" || value === "midnight" || value === "survival" ? value : "lite";
}

function emptySelections(): CharacterSelections {
  return { pulse: "joker", midnight: "makoto", survival: "joel" };
}

function syncDocument(mode: UIMode) {
  document.documentElement.setAttribute("data-mode", mode);
  document.documentElement.removeAttribute("data-character");
}

export function UIModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<UIMode>("lite");
  const [loaded, setLoaded] = useState(false);
  const characters = useMemo<CharacterSelections>(emptySelections, []);

  useEffect(() => {
    try {
      const initial = readMode(window.localStorage.getItem(KEY));
      setModeState(initial);
      syncDocument(initial);
      window.localStorage.setItem(KEY, initial);
    } catch {
      syncDocument("lite");
    }
    setLoaded(true);
  }, []);

  const setMode = useCallback((next: UIMode) => {
    syncDocument(next);
    setModeState(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* Storage failure must never block the app. */
    }
  }, []);

  const setCharacter = useCallback((_character: CharacterId) => {
    /* Character packs are retired from the active UI. */
  }, []);

  const activeCharacter = useMemo<CharacterPack | null>(() => null, []);

  return <UIModeContext.Provider value={{ mode, setMode, characters, activeCharacter, setCharacter, loaded }}>{children}</UIModeContext.Provider>;
}

export function useUIMode(): UIModeApi {
  const ctx = useContext(UIModeContext);
  if (!ctx) throw new Error("useUIMode 必须在 UIModeProvider 内使用");
  return ctx;
}
