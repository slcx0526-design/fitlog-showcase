"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useUIMode, type UIMode } from "@/lib/uiMode";
import styles from "./AppMotionLayer.module.css";
import fixStyles from "./AppMotionLayerFix.module.css";

type RouteMotion = { id: number; mode: UIMode; label: string };
type PulseImpact = { id: number; x: number; y: number; label: string };
type TapRipple = { id: number; x: number; y: number };
type FieldMark = TapRipple & { label: string };

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

function fieldMarkLabel(target: HTMLElement) {
  const control = target.closest<HTMLElement>("button,a,[role='button']");
  const label = `${control?.getAttribute("aria-label") ?? ""} ${control?.textContent ?? ""}`;
  if (/保存|完成|结束训练|确认|記録|完了|終了|確認|save|confirm|finish/i.test(label)) return "LOGGED";
  if (/开始|训练|记录|套用|继续|開始|トレーニング|続ける|start|train|log|apply|continue/i.test(label)) return "ROUTE SET";
  if (/删除|移除|清除|削除|クリア|delete|remove|clear/i.test(label)) return "CROSSED OUT";
  return null;
}

export default function AppMotionLayer() {
  const pathname = usePathname();
  const { mode, loaded } = useUIMode();
  const previousPath = useRef<string | null>(null);
  const impactTimer = useRef<number | null>(null);
  const rippleTimer = useRef<number | null>(null);
  const markTimer = useRef<number | null>(null);
  const [routeMotion, setRouteMotion] = useState<RouteMotion | null>(null);
  const [pulseImpact, setPulseImpact] = useState<PulseImpact | null>(null);
  const [midnightRipple, setMidnightRipple] = useState<TapRipple | null>(null);
  const [survivalMark, setSurvivalMark] = useState<FieldMark | null>(null);

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
    if (!loaded || mode === "lite") return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const control = target.closest<HTMLElement>("button,a,[role='button']");
      if (!control || control.matches("[disabled],[aria-disabled='true']")) return;

      if (mode === "midnight") {
        if (control.closest("[data-no-midnight]")) return;
        const next: TapRipple = { id: Date.now(), x: event.clientX, y: event.clientY };
        setMidnightRipple(next);
        if (rippleTimer.current != null) window.clearTimeout(rippleTimer.current);
        rippleTimer.current = window.setTimeout(() => setMidnightRipple((current) => current?.id === next.id ? null : current), 420);
        return;
      }

      if (mode === "survival") {
        if (control.closest("[data-no-survival-mark]")) return;
        const label = fieldMarkLabel(target);
        if (!label) return;
        const next: FieldMark = { id: Date.now(), x: event.clientX, y: event.clientY, label };
        setSurvivalMark(next);
        if (markTimer.current != null) window.clearTimeout(markTimer.current);
        markTimer.current = window.setTimeout(() => setSurvivalMark((current) => current?.id === next.id ? null : current), 360);
        return;
      }

      if (control.closest("[data-no-pulse-impact]")) return;

      const next: PulseImpact = { id: Date.now(), x: event.clientX, y: event.clientY, label: impactLabel(target) };
      setPulseImpact(next);
      if (impactTimer.current != null) window.clearTimeout(impactTimer.current);
      impactTimer.current = window.setTimeout(() => setPulseImpact((current) => current?.id === next.id ? null : current), 320);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [loaded, mode]);

  useEffect(() => {
    return () => {
      if (impactTimer.current != null) window.clearTimeout(impactTimer.current);
      if (rippleTimer.current != null) window.clearTimeout(rippleTimer.current);
      if (markTimer.current != null) window.clearTimeout(markTimer.current);
      impactTimer.current = null;
      rippleTimer.current = null;
      markTimer.current = null;
    };
  }, []);

  return <>
    {routeMotion?.mode === "lite" && <span key={routeMotion.id} className="lite-route-cue" aria-hidden="true" />}
    {routeMotion?.mode === "pulse" && <div key={routeMotion.id} className={`${styles.pulseRouteWipe} pulse-route-wipe`} aria-hidden="true"><span className="pulse-route-wipe__shadow" /><span className="pulse-route-wipe__paper" /><span className="pulse-route-wipe__red" /><span className="pulse-route-wipe__label">{routeMotion.label}</span></div>}
    {routeMotion?.mode === "midnight" && <div key={routeMotion.id} className="midnight-route-scan" aria-hidden="true"><span className="midnight-route-scan__line" /><span className="midnight-route-scan__label">{routeMotion.label}</span></div>}
    {routeMotion?.mode === "survival" && <div key={routeMotion.id} className={`${styles.survivalRoute} survival-route-note`} aria-hidden="true"><span className="survival-route-note__line" /><span className="survival-route-note__label">{routeMotion.label}</span></div>}
    {mode === "pulse" && pulseImpact && <span key={pulseImpact.id} className={`${styles.pulseImpact} ${fixStyles.pulseImpactFix} pulse-impact`} aria-hidden="true" style={{ left: pulseImpact.x, top: pulseImpact.y }}><span>{pulseImpact.label}</span></span>}
    {mode === "midnight" && midnightRipple && <span key={midnightRipple.id} className="midnight-tap-ripple" aria-hidden="true" style={{ left: midnightRipple.x, top: midnightRipple.y }} />}
    {mode === "survival" && survivalMark && <span key={survivalMark.id} className="survival-field-mark" aria-hidden="true" style={{ left: survivalMark.x, top: survivalMark.y }}>{survivalMark.label}</span>}
  </>;
}
