"use client";

// ============================================================
// 三语言（简中 / 日 / 英）
// 机制：以简体中文原文为 key —— tr("还未记录") 在 ja/en 查字典，
// zh 直接返回原文；查不到的（如用户自定义动作名）原样返回。
// 插值：tr("已完成 {n} 组", { n: 5 })
// ============================================================

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { DICT_EN, DICT_JA } from "./dict";

export type Locale = "zh" | "ja" | "en";

const LS_KEY = "fitlog:locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  zh: "简体中文",
  ja: "日本語",
  en: "English",
};

type Params = Record<string, string | number>;

interface I18nApi {
  locale: Locale;
  setLocale: (l: Locale) => void;
  /** 翻译：中文原文为 key；支持 {x} 插值 */
  tr: (zh: string, params?: Params) => string;
}

const Ctx = createContext<I18nApi | null>(null);

function readStored(): Locale {
  if (typeof window === "undefined") return "zh";
  try {
    const v = window.localStorage.getItem(LS_KEY);
    if (v === "zh" || v === "ja" || v === "en") return v;
  } catch {
    /* ignore */
  }
  return "zh";
}

function interpolate(s: string, params?: Params): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) =>
    k in params ? String(params[k]) : m
  );
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // 两段式：SSG 输出中文，挂载后切到所选语言（避免 hydration 不一致）
  const [locale, setLocaleState] = useState<Locale>("zh");

  useEffect(() => {
    const l = readStored();
    if (l !== "zh") setLocaleState(l);
  }, []);

  useEffect(() => {
    try {
      document.documentElement.lang =
        locale === "zh" ? "zh-CN" : locale === "ja" ? "ja" : "en";
    } catch {
      /* ignore */
    }
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      window.localStorage.setItem(LS_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const tr = useCallback(
    (zh: string, params?: Params) => {
      if (locale === "zh") return interpolate(zh, params);
      const dict = locale === "ja" ? DICT_JA : DICT_EN;
      return interpolate(dict[zh] ?? zh, params);
    },
    [locale]
  );

  const api = useMemo(() => ({ locale, setLocale, tr }), [locale, setLocale, tr]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n must be used within I18nProvider");
  return v;
}
