"use client";

import { useMemo } from "react";
import type { UIMode } from "./uiMode";
import { useI18n, type Locale } from "./i18n";

type CopyKey =
  | "setComplete" | "setAdded" | "addSet" | "useLast" | "activeSession"
  | "startSession" | "resumeSession" | "trainingCompleted" | "allDone"
  | "startLogging" | "edit" | "streak" | "days" | "restDay"
  | "nutritionLogged" | "noNutrition" | "cardio" | "cardioLogged"
  | "noCardio" | "logCardio" | "minutesUnit";

const THEME_COPY: Record<Exclude<UIMode, "lite">, Record<CopyKey, string>> = {
  pulse: {
    setComplete: "本组拿下", setAdded: "追加一组", addSet: "新增工作组", useLast: "沿用上次记录", activeSession: "行动进行中",
    startSession: "进入行动", resumeSession: "继续推进", trainingCompleted: "本次行动完成", allDone: "今日目标完成",
    startLogging: "写入行动记录", edit: "调整安排", streak: "连续推进", days: "天", restDay: "恢复间隔",
    nutritionLogged: "补给已确认", noNutrition: "补给尚未记录", cardio: "移动任务", cardioLogged: "移动已记录",
    noCardio: "尚无移动记录", logCardio: "记录移动", minutesUnit: "分钟",
  },
  midnight: {
    setComplete: "本组已归档", setAdded: "追加一组记录", addSet: "登记工作组", useLast: "沿用上一笔", activeSession: "本次记录进行中",
    startSession: "开始本次安排", resumeSession: "继续本次安排", trainingCompleted: "本次安排已归档", allDone: "今日事项已完成",
    startLogging: "写入今日记录", edit: "调整安排", streak: "连续记录", days: "天", restDay: "恢复时段",
    nutritionLogged: "补给已归档", noNutrition: "补给尚未记录", cardio: "安静移动", cardioLogged: "移动已归档",
    noCardio: "还没有移动记录", logCardio: "记录移动", minutesUnit: "分钟",
  },
  survival: {
    setComplete: "本组已记入日志", setAdded: "补上一组", addSet: "追加训练记录", useLast: "沿用上次路线", activeSession: "路线进行中",
    startSession: "启程训练", resumeSession: "继续路线", trainingCompleted: "今日路线已收束", allDone: "今日检查完成",
    startLogging: "登记今日记录", edit: "修订日志", streak: "连续行程", days: "天", restDay: "补给与恢复日",
    nutritionLogged: "补给已清点", noNutrition: "补给尚未清点", cardio: "行程", cardioLogged: "行程已登记",
    noCardio: "尚无行程记录", logCardio: "登记行程", minutesUnit: "分钟",
  },
};

const TYPE_COPY: Record<Exclude<UIMode, "lite">, Record<string, string>> = {
  pulse: { push: "推力推进", pull: "背部推进", legs: "下肢推进", rest: "恢复间隔", custom: "自定义行动" },
  midnight: { push: "上肢推安排", pull: "上肢拉安排", legs: "下肢安排", rest: "恢复时段", custom: "自定义安排" },
  survival: { push: "上肢路线", pull: "背部路线", legs: "下肢路线", rest: "营地恢复", custom: "自定义路线" },
};

function build(tr: (zh: string) => string, locale: Locale) {
  // Persona language is Chinese-only. Other locales use the neutral translated copy
  // instead of leaking Chinese themed labels into English/Japanese screens.
  const phrase = (mode: UIMode, key: CopyKey, fallback: string) => mode === "lite" || locale !== "zh" ? tr(fallback) : THEME_COPY[mode][key];
  const persona = {
    setComplete: (m: UIMode) => phrase(m, "setComplete", "已记录"), setAdded: (m: UIMode) => phrase(m, "setAdded", "已加一组"), addSet: (m: UIMode) => phrase(m, "addSet", "加一组"), useLast: (m: UIMode) => phrase(m, "useLast", "沿用上次"), activeSession: (m: UIMode) => phrase(m, "activeSession", "进行中"), startSession: (m: UIMode) => phrase(m, "startSession", "开始训练"), resumeSession: (m: UIMode) => phrase(m, "resumeSession", "继续"), trainingCompleted: (m: UIMode) => phrase(m, "trainingCompleted", "训练已完成"), allDone: (m: UIMode) => phrase(m, "allDone", "今日已完成"), startLogging: (m: UIMode) => phrase(m, "startLogging", "开始记录"), edit: (m: UIMode) => phrase(m, "edit", "编辑"), streak: (m: UIMode) => phrase(m, "streak", "连续"), days: (m: UIMode) => phrase(m, "days", "天"), restDay: (m: UIMode) => phrase(m, "restDay", "休息日"), nutritionLogged: (m: UIMode) => phrase(m, "nutritionLogged", "已记录"), noNutrition: (m: UIMode) => phrase(m, "noNutrition", "还未记录"), cardio: (m: UIMode) => phrase(m, "cardio", "有氧"), cardioLogged: (m: UIMode) => phrase(m, "cardioLogged", "已记录"), noCardio: (m: UIMode) => phrase(m, "noCardio", "还未记录"), logCardio: (m: UIMode) => phrase(m, "logCardio", "记录有氧"), minutesUnit: (m: UIMode) => phrase(m, "minutesUnit", "分钟"),
  };
  const themedType = (mode: UIMode, fallback: string, type: string) => mode === "lite" || locale !== "zh" ? tr(fallback) : TYPE_COPY[mode][type];
  const typeName = {
    push: (m: UIMode) => themedType(m, "推日", "push"),
    pull: (m: UIMode) => themedType(m, "拉日", "pull"),
    legs: (m: UIMode) => themedType(m, "腿日", "legs"),
    rest: (m: UIMode) => themedType(m, "休息日", "rest"),
    custom: (m: UIMode) => themedType(m, "自定义", "custom"),
  };
  return { persona, typeName };
}

export function usePersona() {
  const { tr, locale } = useI18n();
  return useMemo(() => build(tr, locale), [tr, locale]);
}
