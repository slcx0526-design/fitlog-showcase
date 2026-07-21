"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TrainingVolumeReview from "@/components/TrainingVolumeReview";
import LogReview from "@/components/LogReview";
import NumberField from "@/components/NumberField";
import WeightChart from "@/components/WeightChart";
import WaistChart from "@/components/WaistChart";
import WeeklyAverageCard from "@/components/WeeklyAverageCard";
import BodyFatEstimateCard from "@/components/BodyFatEstimateCard";
import BodyFatTrendChart from "@/components/BodyFatTrendChart";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { formatCompact, relativeLabel } from "@/lib/date";
import { haptic } from "@/lib/feedback";
import { useToast } from "@/lib/toast";
import { localeText, useI18n, type Locale } from "@/lib/i18n";

type Tab = "body" | "training" | "log";
type BodyTrendMetric = "weight" | "waist" | "bodyFat";
type Copy = [string, string, string];

const TAB_COPY: Record<Tab, { label: Copy; detail: Copy }> = {
  body: { label: ["身体", "Body", "身体"], detail: ["体重 · 腰围 · 体脂趋势", "Weight · waist · body-fat trends", "体重・ウエスト・体脂肪の推移"] },
  training: { label: ["训练", "Training", "トレーニング"], detail: ["容量 · 最近训练 · 有氧", "Volume · recent training · cardio", "ボリューム・最近のトレーニング・有酸素"] },
  log: { label: ["日志", "Log", "ログ"], detail: ["按日期回看与补记", "Review and backfill by date", "日付ごとの確認と追加入力"] },
};

export default function ProgressPageShell({ initialTab = "body" }: { initialTab?: Tab }) {
  const router = useRouter();
  const { loaded } = useStore();
  const { locale } = useI18n();
  const t = (zh: string, en: string, ja: string) => localeText(locale, zh, en, ja);
  const [tab, setTab] = useState<Tab>(initialTab);
  const selected = TAB_COPY[tab];

  useEffect(() => setTab(initialTab), [initialTab]);

  function change(next: Tab) {
    setTab(next);
    router.replace(`/progress?tab=${next}`, { scroll: false });
    haptic(8);
  }

  if (!loaded) return <div className="space-y-3"><div className="h-16 rounded-2xl bg-surface-2" /><div className="h-56 rounded-2xl bg-surface-2" /></div>;

  return <div className="progress-shell">
    <header className="control-card mb-4 flex items-end justify-between gap-4 p-3.5">
      <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">REVIEW</p><h1 className="mt-1 text-[25px] font-bold tracking-tight text-fg">{t("进度", "Progress", "進捗")}</h1><p className="mt-1 text-[12px] text-muted">{t(...selected.detail)}</p></div>
      <Link href="/settings" className="press rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12px] font-semibold text-muted">{t("备份与设置", "Backup & settings", "バックアップと設定")}</Link>
    </header>
    <div className="control-strip mb-5 grid grid-cols-3 gap-1 rounded-2xl p-1" role="tablist" aria-label={t("进度分类", "Progress categories", "進捗カテゴリ")}>
      {(Object.keys(TAB_COPY) as Tab[]).map((item) => <button type="button" key={item} role="tab" aria-selected={tab === item} onClick={() => change(item)} className={"choice-chip press h-10 text-[13px] font-semibold " + (tab === item ? "bg-fg text-bg shadow-sm" : "text-muted")}>{t(...TAB_COPY[item].label)}</button>)}
    </div>
    {tab === "body" && <EditableBodyReview locale={locale} />}
    {tab === "training" && <TrainingVolumeReview />}
    {tab === "log" && <LogReview />}
  </div>;
}

function EditableBodyReview({ locale }: { locale: Locale }) {
  const today = useToday();
  const { data, setBodyWeight, setWaist } = useStore();
  const toast = useToast();
  const t = (zh: string, en: string, ja: string) => localeText(locale, zh, en, ja);
  const [weight, setWeight] = useState(0);
  const [waist, setWaistValue] = useState(0);
  const [trendMetric, setTrendMetric] = useState<BodyTrendMetric>("weight");
  const todayWeight = data.bodyWeights.find((item) => item.date === today)?.weight;
  const todayWaist = data.waistEntries.find((item) => item.date === today)?.waist;
  const hasTodayRecord = todayWeight != null || todayWaist != null;

  useEffect(() => {
    setWeight(todayWeight ?? 0);
    setWaistValue(todayWaist ?? 0);
  }, [today, todayWeight, todayWaist]);

  const validWeight = weight >= 30 && weight <= 300;
  const validWaist = waist >= 30 && waist <= 200;
  const changedWeight = validWeight && weight !== todayWeight;
  const changedWaist = validWaist && waist !== todayWaist;
  const canSave = changedWeight || changedWaist;

  function save() {
    if (!canSave) {
      toast.show(hasTodayRecord ? t("数值没有变化；修改后再更新。", "No values changed. Edit a value to update.", "数値は変わっていません。変更してから更新してください。") : t("请输入至少一项有效测量。", "Enter at least one valid measurement.", "有効な測定値を少なくとも1つ入力してください。"));
      return;
    }
    let count = 0;
    if (changedWeight) { setBodyWeight(today, weight); count += 1; }
    if (changedWaist) { setWaist(today, waist); count += 1; }
    if (count) { haptic([8, 24, 8]); toast.show(hasTodayRecord ? t("同日测量已更新", "Today's measurements updated", "今日の測定値を更新しました") : t("身体数据已保存", "Body measurements saved", "身体測定値を保存しました")); }
  }

  const latestWeights = useMemo(() => [...data.bodyWeights].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5), [data.bodyWeights]);
  const latestWaists = useMemo(() => [...data.waistEntries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5), [data.waistEntries]);
  const actionLabel = canSave ? (hasTodayRecord ? t("更新今天的测量", "Update today's measurements", "今日の測定値を更新") : t("保存测量", "Save measurements", "測定値を保存")) : hasTodayRecord ? t("已保存 · 修改数值后更新", "Saved · edit a value to update", "保存済み · 数値を変更して更新") : t("请输入体重或腰围", "Enter weight or waist", "体重またはウエストを入力");

  return <div className="space-y-4">
    <section className="control-card p-3.5">
      <div className="flex items-center justify-between gap-2"><div><p className="text-[14px] font-semibold text-fg">{t("今天的测量", "Today's measurements", "今日の測定")}</p><p className="mt-0.5 text-[11px] text-faint">{t("同一天可以反复更新，最新数值会覆盖旧记录。", "You can update repeatedly on the same day; the latest value replaces the earlier one.", "同じ日に何度でも更新でき、最新の値が以前の記録を上書きします。")}</p></div><span className="tnum shrink-0 rounded-full bg-surface-2 px-2 py-1 text-[11px] text-muted">{todayWeight != null ? `${t("体重", "Weight", "体重")} ✓` : t("体重", "Weight", "体重")} · {todayWaist != null ? `${t("腰围", "Waist", "ウエスト")} ✓` : t("腰围", "Waist", "ウエスト")}</span></div>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <MetricInput label={t("体重", "Weight", "体重")} unit="kg" value={weight} onChange={setWeight} placeholder="0.0" />
        <MetricInput label={t("腰围", "Waist", "ウエスト")} unit="cm" value={waist} onChange={setWaistValue} placeholder="0.0" />
      </div>
      <button type="button" data-measure-save data-ready={canSave ? "true" : "false"} aria-disabled={!canSave} onClick={save} className={"progress-measure-save press mt-3 flex h-[44px] w-full items-center justify-center rounded-[14px] text-[14px] font-semibold " + (canSave ? "bg-fg text-bg" : "border border-border bg-surface-2 text-muted")}>{actionLabel}</button>
    </section>

    <section>
      <SectionTitle title={t("身体趋势", "Body trends", "身体の推移")} helper={t("一张图切换体重、腰围和 RFM 体脂估算", "Switch weight, waist, and RFM body-fat estimate in one chart", "1つのグラフで体重・ウエスト・RFM体脂肪推定を切り替え")}/>
      <div className="control-strip mb-2 grid grid-cols-3 gap-1 rounded-2xl p-1" aria-label={t("身体趋势指标", "Body trend metric", "身体推移の指標")}>
        {([{ id: "weight", label: t("体重", "Weight", "体重") }, { id: "waist", label: t("腰围", "Waist", "ウエスト") }, { id: "bodyFat", label: t("体脂估算", "Body-fat estimate", "体脂肪推定") }] as const).map((item) => <button key={item.id} type="button" onClick={() => setTrendMetric(item.id)} className={"choice-chip press h-9 text-[12px] font-semibold " + (trendMetric === item.id ? "bg-fg text-bg" : "text-muted")} aria-pressed={trendMetric === item.id}>{item.label}</button>)}
      </div>
      {trendMetric === "weight" && <><WeightChart entries={data.bodyWeights} /><div className="mt-2"><WeeklyAverageCard entries={data.bodyWeights} /></div>{latestWeights.length > 0 && <CompactMetricList locale={locale} title={t("最近体重", "Recent weight", "最近の体重")} rows={latestWeights.map((entry) => ({ date: entry.date, value: `${entry.weight} kg` }))} />}</>}
      {trendMetric === "waist" && <>{<WaistChart entries={data.waistEntries} />}{latestWaists.length > 0 && <CompactMetricList locale={locale} title={t("最近腰围", "Recent waist", "最近のウエスト")} rows={latestWaists.map((entry) => ({ date: entry.date, value: `${entry.waist} cm` }))} />}</>}
      {trendMetric === "bodyFat" && <BodyFatTrendChart profile={data.profile} waistEntries={data.waistEntries} />}
    </section>

    <section><SectionTitle title={t("体脂估算", "Body-fat estimate", "体脂肪推定")} helper={t("RFM 当前值和公式说明；趋势在上方切换查看", "Current RFM value and formula; switch the trend above", "現在のRFM値と式。推移は上で切り替え")}/><BodyFatEstimateCard profile={data.profile} waistEntries={data.waistEntries} bodyWeights={data.bodyWeights} /></section>
  </div>;
}

function MetricInput({ label, unit, value, onChange, placeholder }: { label: string; unit: string; value: number; onChange: (value: number) => void; placeholder: string }) {
  return <label><span className="mb-1 block text-[11px] font-medium text-faint">{label} · {unit}</span><NumberField value={value} onChange={onChange} placeholder={placeholder} ariaLabel={label} allowDecimal className="tnum h-[48px] w-full rounded-[14px] border border-border bg-surface-2 px-3 text-center text-[17px] font-semibold text-fg outline-none focus:border-accent" /></label>;
}

function CompactMetricList({ locale, title, rows }: { locale: Locale; title: string; rows: { date: string; value: string }[] }) {
  return <div className="control-card mt-2 overflow-hidden px-3.5"><p className="soft-divider border-b py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">{title}</p>{rows.map((row) => <div key={row.date} className="soft-divider flex items-center border-t py-2 first:border-t-0"><span className="text-[12px] text-muted">{relativeLabel(row.date, locale)}</span><span className="tnum ml-2 text-[11px] text-faint">{formatCompact(row.date, locale).md}</span><span className="tnum ml-auto text-[13px] font-semibold text-fg">{row.value}</span></div>)}</div>;
}

function SectionTitle({ title, helper }: { title: string; helper: string }) {
  return <div className="mb-2"><h2 className="text-[14px] font-semibold text-fg">{title}</h2><p className="mt-0.5 text-[11px] text-faint">{helper}</p></div>;
}
