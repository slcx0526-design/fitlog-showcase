"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { pulseFeedback } from "./feedback";

interface RestTimerControls {
  start: (seconds: number) => void;
  adjust: (seconds: number) => void;
  stop: (silent?: boolean) => void;
}

interface RestTimerState {
  isRunning: boolean;
  secondsLeft: number;
}

const RestTimerControlsContext = createContext<RestTimerControls | null>(null);
const RestTimerStateContext = createContext<RestTimerState | null>(null);

export function formatRestTime(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function RestTimerProvider({ children }: { children: React.ReactNode }) {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const endsAtRef = useRef<number | null>(null);

  const updateEndsAt = useCallback((value: number | null) => {
    endsAtRef.current = value;
    setEndsAt(value);
  }, []);

  useEffect(() => {
    if (endsAt == null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [endsAt]);

  const secondsLeft = endsAt == null ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000));

  useEffect(() => {
    if (endsAt == null || secondsLeft > 0) return;
    updateEndsAt(null);
    pulseFeedback("finish");
  }, [endsAt, secondsLeft, updateEndsAt]);

  const start = useCallback((seconds: number) => {
    const stamp = Date.now();
    setNow(stamp);
    updateEndsAt(stamp + Math.max(1, Math.round(seconds)) * 1000);
    pulseFeedback("start");
  }, [updateEndsAt]);

  const adjust = useCallback((seconds: number) => {
    const stamp = Date.now();
    const adjusted = Math.max(stamp, (endsAtRef.current ?? stamp) + Math.round(seconds) * 1000);
    setNow(stamp);
    updateEndsAt(adjusted > stamp ? adjusted : null);
    pulseFeedback(adjusted > stamp ? "tap" : "finish");
  }, [updateEndsAt]);

  const stop = useCallback((silent = false) => {
    if (endsAtRef.current == null) return;
    updateEndsAt(null);
    if (!silent) pulseFeedback("confirm");
  }, [updateEndsAt]);

  const controls = useMemo<RestTimerControls>(() => ({ start, adjust, stop }), [adjust, start, stop]);
  const state = useMemo<RestTimerState>(() => ({
    isRunning: endsAt != null && secondsLeft > 0,
    secondsLeft,
  }), [endsAt, secondsLeft]);

  return <RestTimerControlsContext.Provider value={controls}><RestTimerStateContext.Provider value={state}>{children}</RestTimerStateContext.Provider></RestTimerControlsContext.Provider>;
}

export function useRestTimerControls() {
  const controls = useContext(RestTimerControlsContext);
  if (!controls) throw new Error("useRestTimerControls must be used inside RestTimerProvider");
  return controls;
}

export function useRestTimer() {
  const controls = useRestTimerControls();
  const state = useContext(RestTimerStateContext);
  if (!state) throw new Error("useRestTimer must be used inside RestTimerProvider");
  return { ...controls, ...state };
}
