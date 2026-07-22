"use client";

import { useEffect, useMemo, useState } from "react";
import { localeText, useI18n, type Locale } from "@/lib/i18n";
import { scoreRecoveryCheckIn } from "@/lib/recovery";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import type { RecoveryCheckIn, RecoveryRating } from "@/lib/types";
import NumberField from "./NumberField";

const tx = (locale: Locale, zh: string, en: string, ja: string) => localeText(locale, zh, en, ja);
const RATINGS: RecoveryRating[] = [1, 2, 3, 4, 5];

export default function RecoveryCheckInCard({ date }: { date: string }) {
  const { data, setRecovery } = useStore();
  const { locale } = useI18n();
  const toast = useToast();
  const current = data.days[date]?.recovery;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<RecoveryCheckIn>(current ?? {});

  useEffect(() => setDraft(current ?? {}), [current]);

  const score = useMemo(() => scoreRecoveryCheckIn(current, date), [current, date]);
  const signalCount = recoverySignalCount(draft);

  function patch<K extends keyof RecoveryCheckIn>(key: K, value: RecoveryCheckIn[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }

  function save() {
    if (!signalCount) return;
    setRecovery(date, { ...draft, at: new Date().toISOString() });
    setOpen(false);
    toast.show(tx(locale, "今日状态已记录", "Today's recovery check-in is saved", "今日の状態を記録しました"));
  }

  function clear() {
    setRecovery(date, undefined);
    setDraft({});
    setOpen(true);
    toast.show(tx(locale, "状态记录已清除", "Recovery check-in cleared", "状態記録を削除しました"));
  }

  return <section id="recovery-check-in" className="control-card mb-3 scroll-mt-4 overflow-hidden">
    <button type="button" onClick={() => setOpen((value) => !value)} className="press flex w-full items-center gap-3 px-3.5 py-3 text-left" aria-expanded={open}>
      <span className={"grid h-10 w-10 shrink-0 place-items-center rounded-xl " + (score ? score.state === "low" ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent" : "bg-surface-2 text-muted")}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 20C16.4 20 20 16.4 20 12C20 7.6 16.4 4 12 4C7.6 4 4 7.6 4 12C4 16.4 7.6 20 12 20Z" stroke="currentColor" strokeWidth="1.7"/><path d="M8 13.5C9 15 10.3 15.7 12 15.7C13.7 15.7 15 15 16 13.5M9 9.5H9.01M15 9.5H15.01" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
      </span>
      <span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold text-fg">{tx(locale, "恢复状态", "Recovery check-in", "回復状態")}</span><span className="mt-0.5 block text-[11px] text-faint">{score ? tx(locale, `状态指数 ${score.score} · ${score.signalCount} 项信号`, `Score ${score.score} · ${score.signalCount} signals`, `状態指数 ${score.score}・${score.signalCount} 項目`) : tx(locale, "睡眠、精力、酸痛和压力", "Sleep, energy, soreness, and stress", "睡眠・活力・筋肉痛・ストレス")}</span></span>
      <span className={"text-[11px] font-semibold " + (score ? "text-accent" : "text-muted")}>{score ? tx(locale, "已记录", "Logged", "記録済み") : tx(locale, "记录", "Log", "記録")}</span>
      <svg className={"shrink-0 text-faint transition-transform " + (open ? "rotate-180" : "")} width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    {open && <div className="soft-divider animate-slidedown border-t px-3.5 py-3">
      <label className="block"><span className="mb-1 block text-[11px] font-medium text-faint">{tx(locale, "睡眠时长 · 小时（可选）", "Sleep duration · hours (optional)", "睡眠時間・時間（任意）")}</span><NumberField value={draft.sleepHours ?? 0} onChange={(value) => patch("sleepHours", value > 0 ? value : undefined)} allowDecimal ariaLabel={tx(locale, "睡眠时长", "Sleep duration", "睡眠時間")} placeholder="0.0" className="number-cell tnum h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-center text-[15px] font-semibold text-fg outline-none focus:border-accent" /></label>
      <div className="mt-3 space-y-3">
        <RatingRow locale={locale} label={tx(locale, "睡眠质量", "Sleep quality", "睡眠の質")} low={tx(locale, "差", "Poor", "低い")} high={tx(locale, "好", "Good", "良い")} value={draft.sleepQuality} onChange={(value) => patch("sleepQuality", value)} />
        <RatingRow locale={locale} label={tx(locale, "精力", "Energy", "活力")} low={tx(locale, "低", "Low", "低い")} high={tx(locale, "充足", "High", "高い")} value={draft.energy} onChange={(value) => patch("energy", value)} />
        <RatingRow locale={locale} label={tx(locale, "肌肉酸痛", "Soreness", "筋肉痛")} low={tx(locale, "轻", "Low", "軽い")} high={tx(locale, "重", "High", "強い")} value={draft.soreness} onChange={(value) => patch("soreness", value)} />
        <RatingRow locale={locale} label={tx(locale, "压力", "Stress", "ストレス")} low={tx(locale, "低", "Low", "低い")} high={tx(locale, "高", "High", "高い")} value={draft.stress} onChange={(value) => patch("stress", value)} />
      </div>
      <div className="mt-3 flex gap-2">{current && <button type="button" onClick={clear} className="press h-10 rounded-xl border border-border px-3 text-[12px] font-semibold text-muted">{tx(locale, "清除", "Clear", "削除")}</button>}<button type="button" onClick={save} disabled={!signalCount} className="press h-10 flex-1 rounded-xl bg-fg text-[13px] font-semibold text-bg disabled:opacity-30">{tx(locale, "保存状态", "Save check-in", "状態を保存")}</button></div>
    </div>}
  </section>;
}

function RatingRow({ locale, label, low, high, value, onChange }: { locale: Locale; label: string; low: string; high: string; value?: RecoveryRating; onChange: (value: RecoveryRating) => void }) {
  return <div><div className="mb-1 flex items-center justify-between gap-2"><p className="text-[11px] font-semibold text-fg">{label}</p><p className="text-[9px] text-faint">{low} 1 · 5 {high}</p></div><div className="control-strip grid grid-cols-5 gap-1 rounded-xl p-1">{RATINGS.map((rating) => <button key={rating} type="button" onClick={() => onChange(rating)} aria-label={tx(locale, `${label} ${rating} 分`, `${label} ${rating} of 5`, `${label} ${rating}/5`)} aria-pressed={value === rating} className={"choice-chip press h-8 text-[12px] font-semibold " + (value === rating ? "bg-fg text-bg" : "text-muted")}>{rating}</button>)}</div></div>;
}

function recoverySignalCount(value: RecoveryCheckIn) {
  return [value.sleepHours, value.sleepQuality, value.energy, value.soreness, value.stress].filter((item) => item != null).length;
}
