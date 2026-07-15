"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useUIMode } from "@/lib/uiMode";

type Route = "home" | "train" | "nutrition" | "cut" | "progress" | "cardio" | "data" | "settings";
type ThemedMode = "pulse" | "midnight" | "survival";
type ThemeCopy = { stamp: string; title: string; sub: string; meta: string };
type Transition = { id: number; mode: ThemedMode; label: string };

function routeFor(pathname: string): Route {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/train")) return "train";
  if (pathname.startsWith("/nutrition")) return "nutrition";
  if (pathname.startsWith("/cut")) return "cut";
  if (pathname.startsWith("/progress") || pathname.startsWith("/history")) return "progress";
  if (pathname.startsWith("/cardio")) return "cardio";
  if (pathname.startsWith("/data")) return "data";
  return "settings";
}

const COPY: Record<ThemedMode, Record<Route, ThemeCopy>> = {
  pulse: {
    home: { stamp: "ACTION / 01", title: "今天的目标", sub: "只处理下一件最重要的事。", meta: "TARGET" },
    train: { stamp: "ACTION / 02", title: "训练推进", sub: "下一组、下一项、把记录完成。", meta: "EXECUTE" },
    nutrition: { stamp: "ACTION / 03", title: "补给确认", sub: "把燃料写进今天的计划。", meta: "FUEL" },
    cut: { stamp: "ACTION / 04", title: "节奏控制", sub: "只根据趋势调整，不跟随情绪。", meta: "CONTROL" },
    progress: { stamp: "ACTION / 05", title: "结果回看", sub: "让累计结果说明推进。", meta: "PROOF" },
    cardio: { stamp: "ACTION / 06", title: "移动任务", sub: "保持节奏，不让链条中断。", meta: "MOVE" },
    data: { stamp: "ACTION / 07", title: "状态读数", sub: "记录今天的基线。", meta: "STATUS" },
    settings: { stamp: "ACTION / 00", title: "界面设定", sub: "调整到最利于执行的状态。", meta: "CONFIG" },
  },
  midnight: {
    home: { stamp: "MIDNIGHT LOG · 00:00", title: "今日时段", sub: "把今天过好，时间会留下答案。", meta: "MOON" },
    train: { stamp: "MIDNIGHT LOG · 01", title: "训练安排", sub: "按自己的节奏完成这一段记录。", meta: "SESSION" },
    nutrition: { stamp: "MIDNIGHT LOG · 02", title: "补给记录", sub: "今天的补给，会成为明天状态的一部分。", meta: "FUEL" },
    cut: { stamp: "MIDNIGHT LOG · 03", title: "时间窗口", sub: "把判断交给趋势，而不是某一次波动。", meta: "PHASE" },
    progress: { stamp: "MIDNIGHT LOG · 04", title: "长期回看", sub: "慢一点也没关系，只要方向没有停。", meta: "ARCHIVE" },
    cardio: { stamp: "MIDNIGHT LOG · 05", title: "安静移动", sub: "留出一段呼吸和移动的时间。", meta: "MOTION" },
    data: { stamp: "MIDNIGHT LOG · 06", title: "身体坐标", sub: "留下一条今天的身体记录。", meta: "CHECK-IN" },
    settings: { stamp: "MIDNIGHT LOG · 07", title: "个人设定", sub: "让记录保持安静、清晰和可持续。", meta: "ROOM" },
  },
  survival: {
    home: { stamp: "FIELD / DAY", title: "状态检查", sub: "先确认体征与补给，再决定今天的路线。", meta: "FIELD" },
    train: { stamp: "FIELD / ROUTE", title: "训练路线", sub: "记录工作组，走完今天这一段。", meta: "ROUTE" },
    nutrition: { stamp: "FIELD / RATIONS", title: "补给清点", sub: "让恢复不断在路上。", meta: "RATIONS" },
    cut: { stamp: "FIELD / CONDITION", title: "状态评估", sub: "别把身体耗空，留出下一段余地。", meta: "VITALS" },
    progress: { stamp: "FIELD / MAP", title: "路线回顾", sub: "走过的路会留下可见痕迹。", meta: "MAP" },
    cardio: { stamp: "FIELD / DISTANCE", title: "行程记录", sub: "把今天的移动写进路线。", meta: "DISTANCE" },
    data: { stamp: "FIELD / CHECK", title: "身体检查", sub: "确认下一段路线前的基础状态。", meta: "CHECK" },
    settings: { stamp: "FIELD / PACK", title: "记录设定", sub: "整理工具，让它适合长期使用。", meta: "PACK" },
  },
};

function ThemeMark({ mode }: { mode: ThemedMode }) {
  if (mode === "pulse") {
    return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 25L15 6L18 14L27 9L18 27L15 19Z" fill="currentColor" /><path d="M4 27H28" stroke="currentColor" strokeWidth="2" /></svg>;
  }
  if (mode === "midnight") {
    return <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="15" cy="16" r="10.5" fill="currentColor" /><circle cx="20" cy="11.5" r="10.5" fill="var(--surface)" /><circle cx="24.8" cy="7.1" r="1.2" fill="currentColor" opacity=".88" /><circle cx="27" cy="12" r=".7" fill="currentColor" opacity=".6" /></svg>;
  }
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 7.5L14 5L20 8.5L26 6V24.5L19 27L13 23.5L6 26Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M6 17L13 14L19 19L26 13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /><circle cx="26" cy="13" r="2.1" fill="currentColor" /></svg>;
}

export default function ThemeSignature() {
  const pathname = usePathname();
  const { mode, loaded } = useUIMode();
  const previousPath = useRef<string | null>(null);
  const [transition, setTransition] = useState<Transition | null>(null);

  useEffect(() => {
    if (!loaded) return;
    if (previousPath.current === null) {
      previousPath.current = pathname;
      return;
    }
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    if (mode === "lite") return;
    const themedMode = mode as ThemedMode;
    const next = { id: Date.now(), mode: themedMode, label: COPY[themedMode][routeFor(pathname)].title };
    setTransition(next);
    const timer = window.setTimeout(() => setTransition((current) => current?.id === next.id ? null : current), 720);
    return () => window.clearTimeout(timer);
  }, [loaded, mode, pathname]);

  if (!loaded || mode === "lite") return null;
  const copy = COPY[mode][routeFor(pathname)];

  return <>
    {transition && <div key={transition.id} className={`theme-route-transition theme-route-transition--${transition.mode}`} aria-hidden="true"><span className="theme-route-transition__pulse-a" /><span className="theme-route-transition__pulse-b" /><span className="theme-route-transition__pulse-c" /><span className="theme-route-transition__moon" /><span className="theme-route-transition__horizon" /><span className="theme-route-transition__map" /><span className="theme-route-transition__route" /><strong>{transition.label}</strong></div>}
    <section className={`theme-signature theme-signature--${mode}`} aria-label={copy.title}>
      <div className="theme-signature__mark"><ThemeMark mode={mode} /></div>
      <div className="theme-signature__copy"><p>{copy.stamp}</p><h2>{copy.title}</h2><span>{copy.sub}</span></div>
      <span className="theme-signature__meta">{copy.meta}</span>
    </section>
  </>;
}
