"use client";

import { useMemo } from "react";
import { useAppleHealthSync } from "@/lib/appleHealthSync";
import { formatDisplay } from "@/lib/date";
import { buildHealthReadiness, type HealthReadinessSummary } from "@/lib/healthInsights";
import { useToday } from "@/lib/hooks";
import { localeText, useI18n, type Locale } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";

const tx = (locale: Locale, zh: string, en: string, ja: string) => localeText(locale, zh, en, ja);

export default function AppleHealthSyncCard() {
  const { data } = useStore();
  const { available, syncing, lastError, startSync } = useAppleHealthSync();
  const { locale } = useI18n();
  const { show } = useToast();
  const today = useToday();

  const latest = useMemo(() => Object.values(data.days)
    .filter((day) => Boolean(day.health))
    .sort((left, right) => right.date.localeCompare(left.date))[0], [data.days]);
  const readiness = useMemo(() => buildHealthReadiness(data, today), [data, today]);

  if (!available) return null;

  const handleSync = () => {
    if (!startSync(90)) {
      show(tx(locale, "原生 HealthKit 桥不可用", "The native HealthKit bridge is unavailable", "ネイティブ HealthKit ブリッジを利用できません"));
    }
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
              {tx(locale, "首次读取 90 天数据，之后打开原生 App 时自动更新；个人基线只提供建议，不会修改训练处方。", "Reads 90 days first, then refreshes while the native app is open. Personal baselines only inform advice and never alter prescriptions.", "初回は90日分を読み込み、その後はネイティブ App の利用中に自動更新します。個人基準は提案だけに使い、処方を変更しません。")}
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

        {latest?.health && <ReadinessStrip locale={locale} readiness={readiness} />}

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
            {lastError && <p className="mt-0.5 line-clamp-2 text-[10px] text-warn">{lastError}</p>}
          </div>
          <button
            type="button"
            onClick={handleSync}
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

function ReadinessStrip({ locale, readiness }: { locale: Locale; readiness: HealthReadinessSummary }) {
  const status = readiness.status === "low"
    ? tx(locale, "多项偏离", "Multiple deviations", "複数項目が乖離")
    : readiness.status === "caution"
      ? tx(locale, "单项偏离", "One deviation", "単項目が乖離")
      : readiness.status === "stable"
        ? tx(locale, "基线附近", "Near baseline", "基準範囲内")
        : tx(locale, "建立中", "Building", "構築中");
  const tone = readiness.status === "low" || readiness.status === "caution"
    ? "text-warn"
    : readiness.status === "stable"
      ? "text-accent"
      : "text-muted";
  return <div className="control-strip mt-2 flex items-center gap-3 rounded-xl px-3 py-2">
    <div className="min-w-0 flex-1">
      <p className="text-[10px] font-semibold text-fg">{tx(locale, "个人恢复基线", "Personal recovery baseline", "個人回復基準")}</p>
      <p className="mt-0.5 text-[9px] text-faint">
        {tx(
          locale,
          `${readiness.baselineDays} 天样本 · ${readiness.qualifiedSignals}/3 项可判断`,
          `${readiness.baselineDays} days · ${readiness.qualifiedSignals}/3 signals qualified`,
          `${readiness.baselineDays} 日分・${readiness.qualifiedSignals}/3 項目`,
        )}
      </p>
    </div>
    <span className={"shrink-0 text-[10px] font-semibold " + tone}>{status}</span>
  </div>;
}

function HealthMetric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="truncate text-[9px] font-medium text-faint">{label}</p><p className="tnum mt-0.5 truncate text-[12px] font-semibold text-fg">{value}</p></div>;
}
