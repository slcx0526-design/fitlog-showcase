"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useUIMode, type UIMode } from "@/lib/uiMode";
import styles from "./AppMotionLayer.module.css";
import fixStyles from "./AppMotionLayerFix.module.css";

type RouteMotion = { id: number; mode: UIMode; label: string };
type PulseImpact = { id: number; x: number; y: number; label: string };

const ROUTE_LABELS: Record<UIMode, Record<string, string>> = {
  lite: { home: "今日", train: "训练", nutrition: "饮食", cut: "减脂", progress: "进度", cardio: "有氧", settings: "设置" },
  pulse: { home: "目标锁定", train: "行动开始", nutrition: "补给归档", cut: "节奏控制", progress: "战果读取", cardio: "移动任务", settings: "行动设定" },
  midnight: { home: "今日时段", train: "训练安排", nutrition: "夜间补给", cut: "时间窗口", progress: "长期回看", cardio: "安静移动", settings: "个人设定" },
  survival: { home: "野外日志", train: "训练路线", nutrition: "补给清点", cut: "状态评估", progress: "地图回顾", cardio: "行程记录", settings: "装备整理" },
};

const MOTION_DURATION: Record<UIMode, number> = { lite: 380, pulse: 620, midnight: 640, survival: 680 };

function routeKey(pathname: string) {
  if (pathname.startsWith("/train")) return "train";
  if (pathname.startsWith("/nutrition")) return "nutrition";
  if (pathname.startsWith("/cut")) return "cut";
  if (pathname.startsWith("/progress") || pathname.startsWith("/history") || pathname.startsWith("/data")) return "progress";
  if (pathname.startsWith("/cardio")) return "cardio";
  if (pathname.startsWith("/settings")) return "settings";
  return "home";
}

function impactLabel(target: HTMLElement) {
  const label = target.closest<HTMLElement>("button,a,[role='button']")?.textContent ?? "";
  if (/结束训练|完成|保存|确认|finish/i.test(label)) return "SECURED";
  if (/开始|训练|记录|套用|继续|start/i.test(label)) return "EXECUTE";
  if (/删除|移除|clear/i.test(label)) return "CLEAR";
  return "MARK";
}

export default function AppMotionLayer() {
  const pathname = usePathname();
  const { mode, loaded } = useUIMode();
  const previousPath = useRef<string | null>(null);
  const impactTimer = useRef<number | null>(null);
  const [routeMotion, setRouteMotion] = useState<RouteMotion | null>(null);
  const [pulseImpact, setPulseImpact] = useState<PulseImpact | null>(null);

  useEffect(() => {
    if (!loaded) return;
    if (previousPath.current === null) {
      previousPath.current = pathname;
      return;
    }
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;

    const key = routeKey(pathname);
    const next: RouteMotion = { id: Date.now(), mode, label: ROUTE_LABELS[mode][key] };
    setRouteMotion(next);
    const timer = window.setTimeout(() => setRouteMotion((current) => current?.id === next.id ? null : current), MOTION_DURATION[mode]);
    return () => window.clearTimeout(timer);
  }, [loaded, mode, pathname]);

  useEffect(() => {
    if (!loaded || mode !== "pulse") return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const control = target.closest<HTMLElement>("button,a,[role='button']");
      if (!control || control.matches("[disabled],[aria-disabled='true']") || control.closest("[data-no-pulse-impact]")) return;

      const next: PulseImpact = { id: Date.now(), x: event.clientX, y: event.clientY, label: impactLabel(target) };
      setPulseImpact(next);
      if (impactTimer.current != null) window.clearTimeout(impactTimer.current);
      impactTimer.current = window.setTimeout(() => setPulseImpact((current) => current?.id === next.id ? null : current), 320);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      if (impactTimer.current != null) window.clearTimeout(impactTimer.current);
      impactTimer.current = null;
    };
  }, [loaded, mode]);

  return <>
    {routeMotion?.mode === "lite" && <span key={routeMotion.id} className="lite-route-cue" aria-hidden="true" />}
    {routeMotion?.mode === "pulse" && <div key={routeMotion.id} className={`${styles.pulseRouteWipe} pulse-route-wipe`} aria-hidden="true"><span className="pulse-route-wipe__shadow" /><span className="pulse-route-wipe__paper" /><span className="pulse-route-wipe__red" /><span className="pulse-route-wipe__label">{routeMotion.label}</span></div>}
    {routeMotion?.mode === "midnight" && <div key={routeMotion.id} className="midnight-route-scan" aria-hidden="true"><span className="midnight-route-scan__line" /><span className="midnight-route-scan__label">{routeMotion.label}</span></div>}
    {routeMotion?.mode === "survival" && <div key={routeMotion.id} className={`${styles.survivalRoute} survival-route-note`} aria-hidden="true"><span className="survival-route-note__line" /><span className="survival-route-note__label">{routeMotion.label}</span></div>}
    {pulseImpact && <span key={pulseImpact.id} className={`${styles.pulseImpact} ${fixStyles.pulseImpactFix} pulse-impact`} aria-hidden="true" style={{ left: pulseImpact.x, top: pulseImpact.y }}><span>{pulseImpact.label}</span></span>}
  </>;
}
