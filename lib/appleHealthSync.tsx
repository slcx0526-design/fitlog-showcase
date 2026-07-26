"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  APPLE_HEALTH_ERROR_EVENT,
  APPLE_HEALTH_NATIVE_READY_EVENT,
  APPLE_HEALTH_SNAPSHOT_EVENT,
  isAppleHealthBridgeAvailable,
  requestAppleHealthSync,
} from "./appleHealthBridge";
import { localeText, useI18n } from "./i18n";
import { useStore } from "./store";
import { useToast } from "./toast";

type SyncMode = "manual" | "automatic";

interface AppleHealthSyncContextValue {
  available: boolean;
  syncing: boolean;
  lastError: string | null;
  startSync: (days?: number) => boolean;
}

const AppleHealthSyncContext = createContext<AppleHealthSyncContextValue>({
  available: false,
  syncing: false,
  lastError: null,
  startSync: () => false,
});

const AUTO_SYNC_STALE_MS = 6 * 60 * 60 * 1000;
const AUTO_SYNC_LOOKBACK_DAYS = 14;
const SYNC_TIMEOUT_MS = 30_000;

export function AppleHealthSyncProvider({ children }: { children: ReactNode }) {
  const { data, importAppleHealthSnapshot } = useStore();
  const { locale } = useI18n();
  const { show } = useToast();
  const [available, setAvailable] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const syncingRef = useRef(false);
  const modeRef = useRef<SyncMode | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoAttemptRef = useRef<string | null>(null);

  const clearSyncTimeout = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const finishSync = useCallback(() => {
    clearSyncTimeout();
    syncingRef.current = false;
    modeRef.current = null;
    setSyncing(false);
  }, [clearSyncTimeout]);

  const requestSync = useCallback((days: number, mode: SyncMode) => {
    if (!isAppleHealthBridgeAvailable() || syncingRef.current) return false;
    if (!requestAppleHealthSync(days)) return false;
    syncingRef.current = true;
    modeRef.current = mode;
    setSyncing(true);
    setLastError(null);
    clearSyncTimeout();
    timeoutRef.current = setTimeout(() => {
      const message = localeText(
        locale,
        "Apple Health 响应超时，请重试",
        "Apple Health timed out. Try again.",
        "Apple Health がタイムアウトしました。再試行してください",
      );
      setLastError(message);
      if (modeRef.current === "manual") show(message);
      finishSync();
    }, SYNC_TIMEOUT_MS);
    return true;
  }, [clearSyncTimeout, finishSync, locale, show]);

  useEffect(() => {
    const detect = () => setAvailable(isAppleHealthBridgeAvailable());
    detect();
    window.addEventListener(APPLE_HEALTH_NATIVE_READY_EVENT, detect);
    return () => window.removeEventListener(APPLE_HEALTH_NATIVE_READY_EVENT, detect);
  }, []);

  useEffect(() => {
    const onSnapshot = (event: Event) => {
      try {
        const detail = (event as CustomEvent<unknown>).detail;
        const summary = importAppleHealthSnapshot(detail);
        const manual = modeRef.current === "manual";
        finishSync();
        if (!manual) return;
        const changed = summary.importedDays + summary.updatedDays + summary.importedWeights + summary.updatedWeights;
        show(changed
          ? localeText(
              locale,
              `Apple Health 同步完成 · 更新 ${changed} 项`,
              `Apple Health synced · ${changed} updates`,
              `Apple Health 同期完了・${changed}件更新`,
            )
          : localeText(
              locale,
              "Apple Health 同步完成 · 没有可读的新数据",
              "Apple Health synced · no new readable data",
              "Apple Health 同期完了・読み取れる新規データなし",
            ));
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : localeText(locale, "Apple Health 数据无法读取", "Apple Health data could not be read", "Apple Health データを読み込めません");
        const manual = modeRef.current === "manual";
        setLastError(message);
        finishSync();
        if (manual) show(message);
      }
    };
    const onError = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      const message = typeof detail === "string" && detail
        ? detail
        : localeText(locale, "Apple Health 同步失败", "Apple Health sync failed", "Apple Health の同期に失敗しました");
      const manual = modeRef.current === "manual";
      setLastError(message);
      finishSync();
      if (manual) show(message);
    };
    window.addEventListener(APPLE_HEALTH_SNAPSHOT_EVENT, onSnapshot);
    window.addEventListener(APPLE_HEALTH_ERROR_EVENT, onError);
    return () => {
      window.removeEventListener(APPLE_HEALTH_SNAPSHOT_EVENT, onSnapshot);
      window.removeEventListener(APPLE_HEALTH_ERROR_EVENT, onError);
    };
  }, [finishSync, importAppleHealthSnapshot, locale, show]);

  useEffect(() => () => clearSyncTimeout(), [clearSyncTimeout]);

  useEffect(() => {
    if (!available || syncing || !data.healthSync?.lastSyncedAt) return;
    const syncKey = data.healthSync.lastSyncedAt;
    const lastSyncedAt = Date.parse(syncKey);
    if (!Number.isFinite(lastSyncedAt)) return;
    const elapsed = Date.now() - lastSyncedAt;
    const delay = Math.max(500, AUTO_SYNC_STALE_MS - elapsed);
    const timer = window.setTimeout(() => {
      if (autoAttemptRef.current === syncKey) return;
      autoAttemptRef.current = syncKey;
      requestSync(AUTO_SYNC_LOOKBACK_DAYS, "automatic");
    }, delay);
    return () => window.clearTimeout(timer);
  }, [available, data.healthSync?.lastSyncedAt, requestSync, syncing]);

  const startSync = useCallback((days = 90) => requestSync(days, "manual"), [requestSync]);
  const value = useMemo(() => ({
    available,
    syncing,
    lastError,
    startSync,
  }), [available, lastError, startSync, syncing]);

  return <AppleHealthSyncContext.Provider value={value}>{children}</AppleHealthSyncContext.Provider>;
}

export function useAppleHealthSync() {
  return useContext(AppleHealthSyncContext);
}
