"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import NumberField from "./NumberField";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { haptic, pulseFeedback } from "@/lib/feedback";
import { useUIMode } from "@/lib/uiMode";
import { useI18n } from "@/lib/i18n";

export default function MorningCheckIn({ date }: { date: string }) {
  const { data, setBodyWeight, setWaist } = useStore();
  const toast = useToast();
  const { mode } = useUIMode();
  const { tr } = useI18n();
  const [open, setOpen] = useState(false);
  const [waistOpen, setWaistOpen] = useState(false);
  const currentWeight = useMemo(() => data.bodyWeights.find((entry) => entry.date === date)?.weight, [data.bodyWeights, date]);
  const currentWaist = useMemo(() => data.waistEntries.find((entry) => entry.date === date)?.waist, [data.waistEntries, date]);
  const [weight, setWeight] = useState(0);
  const [waist, setWaistValue] = useState(0);

  function save() {
    let saved = 0;
    if (weight >= 30 && weight <= 300) { setBodyWeight(date, weight); saved += 1; setWeight(0); }
    if (waist >= 30 && waist <= 200) { setWaist(date, waist); saved += 1; setWaistValue(0); }
    if (!saved) return;
    if (mode !== "pulse") haptic([8, 30, 8]);
    pulseFeedback("finish");
    toast.show(saved === 2 ? tr("晨重和腰围已记录") : saved === 1 && waist >= 30 ? tr("腰围已记录") : tr("晨重已记录"));
    setOpen(false);
  }

  return (
    <section className="control-card mb-4 p-3.5">
      <button type="button" onClick={() => setOpen((value) => !value)} className="press flex w-full items-center gap-3 text-left" aria-expanded={open}>
        <span className={"grid h-10 w-10 place-items-center rounded-xl " + (currentWeight != null ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted")}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 17.5C7.2 15.2 9.8 15.2 13 17.5C15.4 19.2 18 19.1 20 17.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M6 6.5H18M8.5 10H15.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></span>
        <span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold text-fg">{tr("晨重")}</span><span className="mt-0.5 block text-[11px] text-faint">{currentWeight != null ? tr("{n} kg · 已进入趋势", { n: currentWeight }) : tr("起床后、如厕后、进食前记录一次")}</span></span>
        <span className={"text-[12px] font-semibold " + (currentWeight != null ? "text-accent" : "text-muted")}>{currentWeight != null ? tr("已记录") : tr("记录")}</span>
        <svg className={"text-faint transition-transform " + (open ? "rotate-180" : "")} width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && <div className="soft-divider animate-slidedown mt-3 border-t pt-3"><label className="block"><span className="mb-1 block text-[11px] font-medium text-faint">{tr("体重 · kg")}</span><NumberField value={weight} onChange={setWeight} placeholder={currentWeight != null ? String(currentWeight) : "0.0"} ariaLabel={tr("今日体重")} allowDecimal className="number-cell tnum h-14 w-full rounded-xl border border-border bg-surface-2 px-3 text-center text-[19px] font-semibold text-fg outline-none focus:border-accent" /></label><button type="button" onClick={() => setWaistOpen((value) => !value)} className="press mt-3 flex w-full items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-left"><span><span className="block text-[11px] font-semibold text-fg">{tr("腰围（可选）")}</span><span className="mt-0.5 block text-[10px] text-faint">{tr("建议每周 1–2 次；不作为每日完成项。")}</span></span><span className="text-[16px] text-faint">{waistOpen ? "−" : "+"}</span></button>{waistOpen && <label className="mt-2 block"><span className="mb-1 block text-[11px] font-medium text-faint">{tr("腰围 · cm")}</span><NumberField value={waist} onChange={setWaistValue} placeholder={currentWaist != null ? String(currentWaist) : "0.0"} ariaLabel={tr("今日腰围")} allowDecimal className="number-cell tnum h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-center text-[17px] font-semibold text-fg outline-none focus:border-accent" /></label>}<div className="mt-3 flex items-center gap-2"><button type="button" onClick={save} disabled={!((weight >= 30 && weight <= 300) || (waist >= 30 && waist <= 200))} className="press h-11 flex-1 rounded-xl bg-fg text-[14px] font-semibold text-bg disabled:opacity-30">{tr("保存")}</button><Link href="/progress?tab=body" className="press grid h-11 w-11 place-items-center rounded-xl border border-border text-faint" aria-label={tr("查看身体趋势")}><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 16L9 10.5L13 14L20 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 20H20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg></Link></div></div>}
    </section>
  );
}