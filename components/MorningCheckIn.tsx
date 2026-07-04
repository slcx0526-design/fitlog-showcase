"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import NumberField from "./NumberField";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { haptic, pulseFeedback } from "@/lib/feedback";
import { useUIMode } from "@/lib/uiMode";

export default function MorningCheckIn({ date }: { date: string }) {
  const { data, setBodyWeight, setWaist } = useStore();
  const toast = useToast();
  const { mode } = useUIMode();
  const [open, setOpen] = useState(false);
  const currentWeight = useMemo(
    () => data.bodyWeights.find((entry) => entry.date === date)?.weight,
    [data.bodyWeights, date]
  );
  const currentWaist = useMemo(
    () => data.waistEntries.find((entry) => entry.date === date)?.waist,
    [data.waistEntries, date]
  );
  const [weight, setWeight] = useState(0);
  const [waist, setWaistValue] = useState(0);
  const complete = currentWeight != null && currentWaist != null;

  function save() {
    let saved = 0;
    if (weight >= 30 && weight <= 300) {
      setBodyWeight(date, weight);
      saved += 1;
      setWeight(0);
    }
    if (waist >= 30 && waist <= 200) {
      setWaist(date, waist);
      saved += 1;
      setWaistValue(0);
    }
    if (saved) {
      if (mode !== "pulse") haptic([8, 30, 8]);
      pulseFeedback("finish");
      toast.show(saved === 2 ? "晨间数据已记录" : "身体数据已记录");
      setOpen(false);
    }
  }

  return (
    <section className="control-card mb-4 p-3.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="press flex w-full items-center gap-3 text-left"
        aria-expanded={open}
      >
        <span className={"grid h-10 w-10 place-items-center rounded-xl " + (complete ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 17.5C7.2 15.2 9.8 15.2 13 17.5C15.4 19.2 18 19.1 20 17.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M6 6.5H18M8.5 10H15.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-fg">晨间检查</span>
          <span className="mt-0.5 block text-[11px] text-faint">
            {complete ? `体重 ${currentWeight} kg · 腰围 ${currentWaist} cm` : currentWeight != null ? "还差腰围" : currentWaist != null ? "还差体重" : "体重与腰围会驱动趋势判断"}
          </span>
        </span>
        <span className={"text-[12px] font-semibold " + (complete ? "text-accent" : "text-muted")}>
          {complete ? "已完成" : "记录"}
        </span>
        <svg className={"text-faint transition-transform " + (open ? "rotate-180" : "")} width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="soft-divider animate-slidedown mt-3 border-t pt-3">
          <div className="grid grid-cols-2 gap-2.5">
            <label>
              <span className="mb-1 block text-[11px] font-medium text-faint">体重 · kg</span>
              <NumberField
                value={weight}
                onChange={setWeight}
                placeholder={currentWeight != null ? String(currentWeight) : "0.0"}
                ariaLabel="今日体重"
                allowDecimal
                className="number-cell tnum h-12 w-full rounded-xl border border-border bg-surface-2 px-3 text-center text-[17px] font-semibold text-fg outline-none focus:border-accent"
              />
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-medium text-faint">腰围 · cm</span>
              <NumberField
                value={waist}
                onChange={setWaistValue}
                placeholder={currentWaist != null ? String(currentWaist) : "0.0"}
                ariaLabel="今日腰围"
                allowDecimal
                className="number-cell tnum h-12 w-full rounded-xl border border-border bg-surface-2 px-3 text-center text-[17px] font-semibold text-fg outline-none focus:border-accent"
              />
            </label>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={!((weight >= 30 && weight <= 300) || (waist >= 30 && waist <= 200))}
              className="press h-11 flex-1 rounded-xl bg-fg text-[14px] font-semibold text-bg disabled:opacity-30"
            >
              保存检查
            </button>
            <Link href="/progress?tab=body" className="press grid h-11 w-11 place-items-center rounded-xl border border-border text-faint" aria-label="查看身体趋势">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 16L9 10.5L13 14L20 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 20H20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
