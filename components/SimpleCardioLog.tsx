"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { cardioWeekSummary } from "@/lib/cardio";
import { buildCutCoachReview } from "@/lib/cutCoach";
import { isCutModeActive } from "@/lib/cutMode";
import { localeText, useI18n, type Locale } from "@/lib/i18n";
import type { Zone } from "@/lib/types";
import NumberField from "./NumberField";

const QUICK: Array<{ mode: string; minutes: number; zone: Zone }> = [
  { mode: "走路", minutes: 30, zone: 2 },
  { mode: "单车", minutes: 40, zone: 2 },
  { mode: "跑步", minutes: 30, zone: 2 },
  { mode: "有氧", minutes: 60, zone: 2 },
];

const CARDIO_MODES = ["走路", "跑步", "单车", "椭圆机", "划船", "爬楼梯", "有氧"];

function modeLabel(locale: Locale, mode: string) {
  const labels: Record<string, [string, string]> = {
    走路: ["Walk", "ウォーキング"], 跑步: ["Run", "ランニング"], 单车: ["Bike", "バイク"],
    椭圆机: ["Elliptical", "エリプティカル"], 划船: ["Row", "ローイング"], 爬楼梯: ["Stairs", "階段"], 坡走: ["Incline walk", "傾斜ウォーク"], 有氧: ["Cardio", "有酸素"],
  };
  const translated = labels[mode];
  return translated ? localeText(locale, mode, translated[0], translated[1]) : mode;
}

export default function SimpleCardioLog({ date }: { date: string }) {
  const { locale } = useI18n();
  const t = (zh: string, en: string, ja: string) => localeText(locale, zh, en, ja);
  const { data, getDay, addCardio, removeCardio } = useStore();
  const toast = useToast();
  const [customOpen, setCustomOpen] = useState(false);
  const [mode, setMode] = useState("有氧");
  const [minutes, setMinutes] = useState(30);
  const [zone, setZone] = useState<Zone>(2);
  const entries = getDay(date)?.cardio ?? [];
  const week = useMemo(() => cardioWeekSummary(data.days, data.cutPlan, date), [data.days, data.cutPlan, date]);
  const review = useMemo(() => buildCutCoachReview(data.profile, data.cutPlan, data.days, data.bodyWeights, data.waistEntries, date), [data.profile, data.cutPlan, data.days, data.bodyWeights, data.waistEntries, date]);
  const cutActive = isCutModeActive(data.cutPlan);

  function save(next: { mode: string; minutes: number; zone: Zone }) {
    if (!next.minutes || next.minutes <= 0) return;
    if (!addCardio(date, next)) {
      toast.show(t("有氧记录未能保存，请重试", "The cardio log could not be saved. Try again.", "有酸素記録を保存できませんでした。もう一度お試しください。"), { tone: "error" });
      return;
    }
    toast.show(t(`已记录 ${next.mode} ${next.minutes} 分`, `${modeLabel(locale, next.mode)} ${next.minutes} min logged`, `${modeLabel(locale, next.mode)} ${next.minutes}分を記録しました`));
  }

  function remove(id: string) {
    if (removeCardio(date, id)) return;
    toast.show(t("有氧记录未能删除，请重试", "The cardio log could not be deleted. Try again.", "有酸素記録を削除できませんでした。もう一度お試しください。"), { tone: "error" });
  }

  return (
    <section className="space-y-4">
      <section className="control-card p-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold text-faint">{t("本周", "This week", "今週")}</p>
            <p className="tnum mt-1 text-[24px] font-bold text-fg">{week.totalMinutes}<span className="ml-1 text-[12px] font-medium text-faint">{t("分钟", "min", "分")}</span></p>
          </div>
          {cutActive && <p className="tnum text-right text-[13px] font-semibold text-accent">{t("预计", "Projected", "予測")} {review.weeklyBudget.projectedWeeklyLossPct == null ? "—" : `${review.weeklyBudget.projectedWeeklyLossPct}% / ${t("周", "wk", "週")}`}<span className="mt-0.5 block text-[10px] font-normal text-faint">{t("有氧已计入", "Cardio included", "有酸素を反映済み")}</span></p>}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">{t("记录一次即可更新这一周的减脂速度；不需要自己算消耗。", "Each log updates this week's cut pace; no manual calorie calculation is needed.", "記録すると今週の減量ペースが更新され、消費量を自分で計算する必要はありません。")}</p>
      </section>

      <section className="control-card p-3.5">
        <p className="text-[14px] font-semibold text-fg">{t("快速记录", "Quick log", "クイック記録")}</p>
        <p className="mt-0.5 text-[11px] text-faint">{t("默认按 Z2；适合大多数稳定有氧。", "Defaults to Z2 for most steady cardio.", "基本はZ2で、安定した有酸素運動に適しています。")}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {QUICK.map((item) => <button key={`${item.mode}-${item.minutes}`} type="button" onClick={() => save(item)} className="choice-chip press h-12 border border-border bg-surface-2 px-3 text-left"><p className="text-[12px] font-semibold text-fg">{item.mode === "有氧" ? `Z2 ${item.minutes} ${t("分", "min", "分")}` : `${modeLabel(locale, item.mode)} ${item.minutes} ${t("分", "min", "分")}`}</p><p className="mt-0.5 text-[10px] text-faint">{t("点一下直接记录", "Tap to log", "タップして記録")}</p></button>)}
        </div>
        <button type="button" onClick={() => setCustomOpen((value) => !value)} className="press mt-3 flex w-full items-center justify-between rounded-xl bg-surface-2 px-3 py-2.5 text-left" aria-expanded={customOpen}><span className="text-[12px] font-semibold text-fg">{t("其他记录", "Custom log", "その他の記録")}</span><span className="text-[16px] text-faint">{customOpen ? "−" : "+"}</span></button>
        {customOpen && (
          <div className="animate-slidedown mt-2 space-y-3 rounded-xl border border-border bg-surface-2 p-3">
            <label className="block text-[10px] font-medium text-faint">{t("方式", "Mode", "種目")}<select value={mode} onChange={(event) => setMode(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-2.5 text-[16px] font-semibold text-fg outline-none focus:border-accent sm:text-[13px]">{CARDIO_MODES.map((item) => <option key={item} value={item}>{modeLabel(locale, item)}</option>)}</select></label>
            <div className="grid grid-cols-2 gap-2"><label className="text-[10px] font-medium text-faint">{t("时长", "Duration", "時間")}<NumberField value={minutes} onChange={setMinutes} ariaLabel={t("有氧时长", "Cardio duration", "有酸素の時間")} placeholder="30" allowDecimal={false} className="number-cell tnum mt-1 h-10 w-full rounded-lg border border-border bg-surface px-2.5 text-[16px] font-semibold text-fg outline-none focus:border-accent" /></label><label className="text-[10px] font-medium text-faint">{t("强度", "Intensity", "強度")}<select value={zone} onChange={(event) => setZone(Number(event.target.value) as Zone)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-2.5 text-[16px] font-semibold text-fg outline-none focus:border-accent sm:text-[13px]"><option value={1}>{t("Z1 恢复", "Z1 Recovery", "Z1 回復")}</option><option value={2}>{t("Z2 稳定", "Z2 Steady", "Z2 安定")}</option><option value={3}>{t("Z3 节奏", "Z3 Tempo", "Z3 テンポ")}</option><option value={4}>{t("Z4 间歇", "Z4 Intervals", "Z4 インターバル")}</option><option value={5}>{t("Z5 冲刺", "Z5 Sprint", "Z5 スプリント")}</option></select></label></div>
            <button type="button" onClick={() => save({ mode, minutes, zone })} className="press h-10 w-full rounded-lg bg-fg text-[12px] font-semibold text-bg">{t("记录这次有氧", "Log cardio", "有酸素を記録")}</button>
          </div>
        )}
      </section>

      {entries.length > 0 && <section className="control-card overflow-hidden"><div className="px-3.5 py-3"><p className="text-[14px] font-semibold text-fg">{t("当天已记录", "Logged today", "本日の記録")}</p></div>{entries.map((entry) => <div key={entry.id} className="soft-divider flex items-center gap-3 border-t px-3.5 py-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-[11px] font-bold text-accent">{entry.zone ? `Z${entry.zone}` : "—"}</span><div className="min-w-0 flex-1"><p className="text-[13px] font-semibold text-fg">{modeLabel(locale, entry.mode)} · {entry.minutes} {t("分", "min", "分")}</p><p className="mt-0.5 text-[10px] text-faint">{t("已计入这一周的减脂速度", "Included in this week's cut pace", "今週の減量ペースに反映済み")}</p></div><button type="button" onClick={() => remove(entry.id)} aria-label={t(`删除${entry.mode}记录`, `Delete ${modeLabel(locale, entry.mode)} log`, `${modeLabel(locale, entry.mode)}の記録を削除`)} className="press h-10 w-10 rounded-lg text-[18px] text-faint">×</button></div>)}</section>}
    </section>
  );
}
