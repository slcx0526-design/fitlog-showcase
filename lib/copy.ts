"use client";

import { useMemo } from "react";
import { isPersonaMode, type UIMode } from "./uiMode";
import { useI18n } from "./i18n";

// 只对动作类、状态类的关键短语做模式映射。
// Lite 模式：英文大写"训练房语感"，三种语言下保持英文（设计风格）。
// 默认模式：跟随所选语言（简中 / 日 / 英）。

function build(tr: (zh: string) => string) {
  const t = (mode: UIMode, lite: string, zh: string) =>
    isPersonaMode(mode) ? lite : tr(zh);

  const persona = {
    setComplete: (m: UIMode) => t(m, "SET COMPLETE", "已记录"),
    setAdded: (m: UIMode) => t(m, "SET ADDED", "已加一组"),
    addSet: (m: UIMode) => t(m, "FORGE SET", "加一组"),
    useLast: (m: UIMode) => t(m, "USE LAST", "沿用上次"),
    activeSession: (m: UIMode) => t(m, "ACTIVE SESSION", "进行中"),
    startSession: (m: UIMode) => t(m, "START SESSION", "开始训练"),
    resumeSession: (m: UIMode) => t(m, "RESUME", "继续"),
    trainingCompleted: (m: UIMode) => t(m, "TRAINING COMPLETED", "训练已完成"),
    allDone: (m: UIMode) => t(m, "ALL DONE", "今日已完成"),
    startLogging: (m: UIMode) => t(m, "START LOGGING", "开始记录"),
    edit: (m: UIMode) => t(m, "EDIT", "编辑"),
    streak: (m: UIMode) => t(m, "STREAK", "连续"),
    days: (m: UIMode) => t(m, "DAYS", "天"),
    restDay: (m: UIMode) => t(m, "REST DAY", "休息日"),
    nutritionLogged: (m: UIMode) => t(m, "LOGGED", "已记录"),
    noNutrition: (m: UIMode) => t(m, "NO NUTRITION YET", "还未记录"),
    cardio: (m: UIMode) => t(m, "CARDIO", "有氧"),
    cardioLogged: (m: UIMode) => t(m, "LOGGED", "已记录"),
    noCardio: (m: UIMode) => t(m, "NO CARDIO YET", "还未记录"),
    logCardio: (m: UIMode) => t(m, "LOG CARDIO", "记录有氧"),
    minutesUnit: (m: UIMode) => t(m, "MIN", "分钟"),
  };

  const typeName = {
    push: (m: UIMode) => t(m, "PUSH DAY", "推日"),
    pull: (m: UIMode) => t(m, "PULL DAY", "拉日"),
    legs: (m: UIMode) => t(m, "LEG DAY", "腿日"),
    rest: (m: UIMode) => t(m, "REST DAY", "休息日"),
    custom: (m: UIMode) => t(m, "CUSTOM", "自定义"),
  };

  return { persona, typeName };
}

/** 在组件内取本地化的 persona / typeName 文案 */
export function usePersona() {
  const { tr } = useI18n();
  return useMemo(() => build(tr), [tr]);
}
