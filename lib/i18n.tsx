"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DICT_EN, DICT_JA } from "./dict";
import { DICT_EN_SUPPLEMENT, DICT_JA_SUPPLEMENT } from "./dictSupplement";
import { DEFAULT_EXERCISES } from "./exercises";

export type Locale = "zh" | "ja" | "en";
const LS_KEY = "fitlog:locale";

type Params = Record<string, string | number>;
type ForeignLocale = Exclude<Locale, "zh">;

const BUILT_IN_EXERCISE_EN = new Map(
  DEFAULT_EXERCISES.flatMap((exercise) => exercise.englishName ? [[exercise.name, exercise.englishName] as const] : [])
);

/** Default action names and legacy template aliases. Custom exercise names remain user-authored. */
const BUILT_IN_EXERCISE_JA = new Map<string, string>([
  ["平板杠铃卧推", "バーベルベンチプレス"], ["平板哑铃卧推", "ダンベルベンチプレス"], ["史密斯卧推", "スミスマシンベンチプレス"], ["悍马推胸", "ハンマーストレングス・チェストプレス"], ["器械推胸", "シーテッド・チェストプレス"],
  ["上斜杠铃卧推", "インクライン・バーベルベンチプレス"], ["上斜哑铃卧推", "インクライン・ダンベルプレス"], ["上斜史密斯推", "インクライン・スミスプレス"], ["上斜器械推", "インクライン・マシンプレス"],
  ["双杠臂屈伸", "ディップス"], ["蝴蝶机夹胸", "ペックデックフライ"], ["绳索夹胸", "ケーブルフライ"], ["下胸推", "デクラインチェストプレス"],
  ["哑铃侧平举", "ダンベルサイドレイズ"], ["绳索侧平举", "ケーブルサイドレイズ"], ["器械侧平举", "マシンサイドレイズ"], ["推肩", "マシンショルダープレス"],
  ["哑铃推举", "ダンベルショルダープレス"], ["杠铃推举", "バーベルオーバーヘッドプレス"], ["史密斯推举", "スミスショルダープレス"],
  ["引体向上", "プルアップ"], ["辅助引体", "アシストプルアップ"], ["宽握下拉", "ワイドグリップラットプルダウン"], ["窄握下拉", "クローズグリップラットプルダウン"], ["反握下拉", "リバースグリップラットプルダウン"],
  ["单臂下拉", "ワンアームラットプルダウン"], ["杠铃划船", "バーベルロウ"], ["哑铃划船", "ダンベルロウ"], ["坐姿划船", "シーテッドケーブルロウ"],
  ["单臂器械划船", "ワンアームマシンロウ"], ["悍马划船", "ハンマーストレングスロウ"], ["高位划船", "ハイロウ"], ["直臂下拉", "ストレートアームプルダウン"],
  ["山羊挺身", "バックエクステンション"], ["反向飞鸟", "リアデルトフライ"], ["反向蝴蝶机", "リバースペックデック"], ["面拉", "フェイスプル"], ["后束划船", "リアデルトロウ"],
  ["杠铃弯举", "バーベルカール"], ["哑铃弯举", "ダンベルカール"], ["锤式弯举", "ハンマーカール"], ["绳索弯举", "ケーブルカール"], ["牧师凳弯举", "プリーチャーカール"],
  ["绳索下压", "ケーブルトライセプスプレスダウン"], ["臂屈伸", "スカルクラッシャー"], ["窄距卧推", "クローズグリップベンチプレス"], ["过顶臂屈伸", "オーバーヘッドトライセプスエクステンション"],
  ["深蹲", "バックスクワット"], ["前蹲", "フロントスクワット"], ["腿举", "レッグプレス"], ["哈克深蹲", "ハックスクワット"], ["海豹深蹲", "ペンデュラムスクワット"],
  ["腿屈伸", "レッグエクステンション"], ["腿弯举", "レッグカール"], ["坐姿腿弯举", "シーテッドレッグカール"], ["罗马尼亚硬拉", "ルーマニアンデッドリフト"],
  ["臀推", "ヒップスラスト"], ["硬拉", "デッドリフト"], ["髋外展", "ヒップアブダクション"], ["髋内收", "ヒップアダクション"], ["提踵", "スタンディングカーフレイズ"], ["坐姿提踵", "シーテッドカーフレイズ"],
  ["卷腹", "クランチ"], ["绳索卷腹", "ケーブルクランチ"], ["悬垂举腿", "ハンギングレッグレイズ"], ["死虫", "デッドバグ"], ["平板支撑", "プランク"],
  ["耸肩", "シュラッグ"], ["器械耸肩", "マシンシュラッグ"], ["腕弯举", "リストカール"], ["反向腕弯举", "リバースリストカール"], ["绳索髋外展", "ケーブルヒップアブダクション"], ["哥本哈根侧桥", "コペンハーゲンプランク"],
  ["单臂划船", "ワンアームロウ"], ["器械飞鸟", "マシンフライ"], ["器械飞鸟（固定）", "マシンフライ（固定）"], ["坐姿飞鸟", "シーテッドフライ"], ["俯卧腿弯举", "ライイングレッグカール"], ["坐姿腿屈伸", "シーテッドレッグエクステンション"],
]);

const CORE_FALLBACK: Record<ForeignLocale, Record<string, string>> = {
  en: {
    "查看": "View", "周": "wk", "身高": "height", "腰围": "waist",
    "64 − 20 × (身高 ÷ 腰围)": "64 − 20 × (height ÷ waist)",
    "76 − 20 × (身高 ÷ 腰围)": "76 − 20 × (height ÷ waist)",
  },
  ja: {
    "查看": "見る", "周": "週", "身高": "身長", "腰围": "ウエスト",
    "64 − 20 × (身高 ÷ 腰围)": "64 − 20 ×（身長 ÷ ウエスト）",
    "76 − 20 × (身高 ÷ 腰围)": "76 − 20 ×（身長 ÷ ウエスト）",
  },
};

export const LOCALE_LABELS: Record<Locale, string> = { zh: "简体中文", ja: "日本語", en: "English" };

export function localeText(locale: Locale, zh: string, en: string, ja: string): string {
  return locale === "en" ? en : locale === "ja" ? ja : zh;
}

interface I18nApi {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  tr: (zh: string, params?: Params) => string;
}

const Ctx = createContext<I18nApi | null>(null);

function readStored(): Locale {
  if (typeof window === "undefined") return "zh";
  try {
    const value = window.localStorage.getItem(LS_KEY);
    if (value === "zh" || value === "ja" || value === "en") return value;
  } catch { /* ignore */ }
  return "zh";
}

function interpolate(text: string, params: Params | undefined, locale: Locale): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, key) => {
    if (!(key in params)) return whole;
    const value = String(params[key]);
    return locale === "zh" ? value : CORE_FALLBACK[locale][value] ?? value;
  });
}

function translatedBuiltInName(locale: Locale, source: string): string | undefined {
  if (locale === "en") return BUILT_IN_EXERCISE_EN.get(source);
  if (locale === "ja") return BUILT_IN_EXERCISE_JA.get(source);
  return undefined;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("zh");

  useEffect(() => {
    const stored = readStored();
    if (stored !== "zh") setLocaleState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try { window.localStorage.setItem(LS_KEY, next); } catch { /* ignore */ }
  }, []);

  const tr = useCallback((zh: string, params?: Params) => {
    if (locale === "zh") return interpolate(zh, params, locale);
    const builtInName = translatedBuiltInName(locale, zh);
    const base = locale === "ja" ? DICT_JA : DICT_EN;
    const supplement = locale === "ja" ? DICT_JA_SUPPLEMENT : DICT_EN_SUPPLEMENT;
    const translated = builtInName ?? base[zh] ?? supplement[zh] ?? CORE_FALLBACK[locale][zh] ?? zh;
    return interpolate(translated, params, locale);
  }, [locale]);

  const api = useMemo(() => ({ locale, setLocale, tr }), [locale, setLocale, tr]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nApi {
  const value = useContext(Ctx);
  if (!value) throw new Error("useI18n must be used within I18nProvider");
  return value;
}
