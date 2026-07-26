"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatDisplay } from "@/lib/date";
import {
  APPLE_HEALTH_ERROR_EVENT,
  APPLE_HEALTH_NATIVE_READY_EVENT,
  APPLE_HEALTH_SNAPSHOT_EVENT,
  isAppleHealthBridgeAvailable,
  requestAppleHealthSync,
} from "@/lib/appleHealthBridge";
import { localeText, useI18n, type Locale } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";

const tx = (locale: Locale, zh: string, en: string, ja: string) => localeText(locale, zh, en, ja);

export default function AppleHealthSyncCard() {
  const { data, importAppleHealthSnapshot } = useStore();
  const { locale } = useI18n();
  const { show } = useToast();
  const [available, setAvailable] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const latest = useMemo(() => Object.values(data.days)
    .filter((day) => Boolean(day.health))
    .sort((left, right) => right.date.localeCompare(left.date))[0], [data.days]);

  useEffect(() => {
    const detect = () => setAvailable(isAppleHealthBridgeAvailable());
    const clearSyncTimeout = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    };
    const onSnapshot = (event: Event) => {
      try {
        const detail = (event as CustomEvent<unknown>).detail;
        const summary = importAppleHealthSnapshot(detail);
        clearSyncTimeout();
        setSyncing(false);
        const changed = summary.importedDays + summary.updatedDays + summary.importedWeights + summary.updatedWeights;
        show(changed
          ? tx(
              locale,
              `Apple Health 同步完成 · 更新 ${changed} 项`,
              `Apple Health synced · ${changed} updates`,
              `Apple Health 同期完了・${changed}件更新`,
            )
          : tx(
              locale,
              "Apple Health 同步完成 · 没有可读的新数据",
              "Apple Health synced · no new readable data",
              "Apple Health 同期完了・読み取れる新規データなし",
            ));
      } catch (error) {
        clearSyncTimeout();
        setSyncing(false);
        show(error instanceof Error ? error.message : tx(locale, "Apple Health 数据无法读取", "Apple Health data could not be read", "Apple Health データを読み込めません"));
      }
    };
    const onError = (event: Event) => {
      clearSyncTimeout();
      setSyncing(false);
      const detail = (event as CustomEvent<unknown>).detail;
      show(typeof detail === "string" && detail
        ? detail
        : tx(locale, "Apple Health 同步失败", "Apple Health sync failed", "Apple Health の同期に失敗しました"));
    };
    detect();
    window.addEventListener(APPLE_HEALTH_NATIVE_READY_EVENT, detect);
    window.addEventListener(APPLE_HEALTH_SNAPSHOT_EVENT, onSnapshot);
    window.addEventListener(APPLE_HEALTH_ERROR_EVENT, onError);
    return () => {
      clearSyncTimeout();
      window.removeEventListener(APPLE_HEALTH_NATIVE_READY_EVENT, detect);
      window.removeEventListener(APPLE_HEALTH_SNAPSHOT_EVENT, onSnapshot);
      window.removeEventListener(APPLE_HEALTH_ERROR_EVENT, onError);
    };
  }, [importAppleHealthSnapshot, locale, show]);

  if (!available) return null;

  const startSync = () => {
    if (!requestAppleHealthSync(90)) {
      show(tx(locale, "原生 HealthKit 桥不可用", "The native HealthKit bridge is unavailable", "ネイティブ HealthKit ブリッジを利用できません"));
      return;
    }
    setSyncing(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setSyncing(false);
      show(tx(locale, "Apple Health 响应超时，请重试", "Apple Health timed out. Try again.", "Apple Health がタイムアウトしました。再試行してください"));
    }, 30_000);
  };

  return (
    <section className="mb-6" data-apple-health-sync>
      <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">APPLE HEALTH</h2>
      <div className="control-card p-3">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 20S4.5 15.8 4.5 9.6C4.5 6.8 6.2 5 8.7 5C10.2 5 11.3 5.8 12 7C12.7 5.8 13.8 5 15.3 5C17.8 5 19.5 6.8 19.5 9.6C19.5 15.8 12 20 12 20Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-fg">
              {data.healthSync
                ? tx(locale, "Apple Health 已同步", "Apple Health synced", "Apple Health 同期済み")
                : tx(locale, "同步 Apple Health", "Sync Apple Health", "Apple Health を同期")}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-faint">
              {tx(locale, "读取最近 90 天的活动、睡眠、心率与体重；只作事实参考，不会自动修改训练处方。", "Reads 90 days of activity, sleep, heart-rate, and weight facts. It never changes prescriptions automatically.", "直近90日の活動・睡眠・心拍・体重を読み込みます。処方は自動変更しません。")}
            </p>
          </div>
        </div>

        {latest?.health && (
          <div className="control-strip mt-3 grid grid-cols-3 gap-x-2 gap-y-2 rounded-xl px-3 py-2.5">
            <HealthMetric label={tx(locale, "步数", "Steps", "歩数")} value={latest.health.steps == null ? "—" : latest.health.steps.toLocaleString()} />
            <HealthMetric label={tx(locale, "活动", "Active", "活動")} value={latest.health.activeEnergyKcal == null ? "—" : `${Math.round(latest.health.activeEnergyKcal)} kcal`} />
            <HealthMetric label={tx(locale, "锻炼", "Exercise", "運動")} value={latest.health.exerciseMinutes == null ? "—" : `${Math.round(latest.health.exerciseMinutes)} min`} />
            <HealthMetric label={tx(locale, "睡眠", "Sleep", "睡眠")} value={latest.health.sleepMinutes == null ? "—" : `${(latest.health.sleepMinutes / 60).toFixed(1)} h`} />
            <HealthMetric label={tx(locale, "静息心率", "Resting HR", "安静時心拍")} value={latest.health.restingHeartRate == null ? "—" : `${Math.round(latest.health.restingHeartRate)} bpm`} />
            <HealthMetric label="HRV" value={latest.health.heartRateVariabilityMs == null ? "—" : `${Math.round(latest.health.heartRateVariabilityMs)} ms`} />
          </div>
        )}

        <div className="mt-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] text-faint">
              {data.healthSync
                ? tx(
                    locale,
                    `最近同步 ${new Date(data.healthSync.lastSyncedAt).toLocaleString("zh-CN")} · ${data.healthSync.importedDays} 天`,
                    `Last synced ${new Date(data.healthSync.lastSyncedAt).toLocaleString("en")} · ${data.healthSync.importedDays} days`,
                    `最終同期 ${new Date(data.healthSync.lastSyncedAt).toLocaleString("ja")}・${data.healthSync.importedDays}日`,
                  )
                : tx(locale, "首次同步时由系统请求逐项授权", "iOS requests permission for each data type on first sync", "初回同期時にデータ項目ごとの許可を求めます")}
            </p>
            {latest && <p className="mt-0.5 text-[10px] text-faint">{formatDisplay(latest.date, locale)}</p>}
          </div>
          <button
            type="button"
            onClick={startSync}
            disabled={syncing}
            className="choice-chip press h-10 shrink-0 border border-border bg-surface-2 px-3 text-[12px] font-semibold text-fg disabled:opacity-50"
          >
            {syncing
              ? tx(locale, "同步中…", "Syncing…", "同期中…")
              : data.healthSync
                ? tx(locale, "重新同步", "Sync again", "再同期")
                : tx(locale, "授权并同步", "Authorize & sync", "許可して同期")}
          </button>
        </div>
      </div>
    </section>
  );
}

function HealthMetric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="truncate text-[9px] font-medium text-faint">{label}</p><p className="tnum mt-0.5 truncate text-[12px] font-semibold text-fg">{value}</p></div>;
}
