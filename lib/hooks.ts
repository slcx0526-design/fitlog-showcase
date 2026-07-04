"use client";

import { useEffect, useRef, useState } from "react";
import { todayKey } from "./date";

/**
 * 返回今天的 YYYY-MM-DD。
 * 当用户跨午夜后再回到 app（visibilitychange 或 定时检测）
 * 会自动刷新为新的日期，触发引用该 hook 的页面重新渲染。
 * 可选 onRollover 回调，在日期跳变时触发一次（用于 toast）。
 */
export function useToday(onRollover?: (next: string) => void): string {
  const [today, setToday] = useState<string>(() => todayKey());
  const lastSeen = useRef<string>(today);
  const cbRef = useRef(onRollover);
  cbRef.current = onRollover;

  useEffect(() => {
    const check = () => {
      const next = todayKey();
      if (next !== lastSeen.current) {
        lastSeen.current = next;
        setToday(next);
        cbRef.current?.(next);
      }
    };
    const onVis = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVis);
    // 兜底：每分钟检查一次，覆盖 app 在前台跨越午夜的场景
    const id = window.setInterval(check, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(id);
    };
  }, []);

  return today;
}

/**
 * 返回一个每 intervalMs 更新一次的时间戳（ms）。
 * 只在 enabled 时 tick。供"X 秒前"这类相对时间显示用。
 */
export function useNow(enabled: boolean, intervalMs: number = 20_000): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    const onVis = () => {
      if (document.visibilityState === "visible") setNow(Date.now());
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, intervalMs]);
  return now;
}
