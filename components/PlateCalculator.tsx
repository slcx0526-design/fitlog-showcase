"use client";

import { useState } from "react";
import type { Exercise } from "@/lib/types";
import { calculatePlateLoad, DEFAULT_PLATE_SIZES_KG, supportsPlateCalculator } from "@/lib/plateCalculator";
import { useStore } from "@/lib/store";
import { useI18n, type Locale } from "@/lib/i18n";

const tx = (locale: Locale, zh: string, en: string, ja: string) => locale === "en" ? en : locale === "ja" ? ja : zh;

export default function PlateCalculator({ exercise, targetKg }: { exercise: Exercise; targetKg: number | null }) {
  const { locale } = useI18n();
  const { data, setTrainingPreferences } = useStore();
  const [open, setOpen] = useState(false);
  if (!supportsPlateCalculator(exercise) || !targetKg || targetKg <= 0) return null;

  const barbellKg = data.trainingPreferences?.barbellWeightKg ?? 20;
  const plateSizes = data.trainingPreferences?.plateSizesKg ?? DEFAULT_PLATE_SIZES_KG;
  const result = calculatePlateLoad(targetKg, barbellKg, plateSizes);

  function togglePlate(plate: number) {
    const active = plateSizes.includes(plate);
    const next = active ? plateSizes.filter((value) => value !== plate) : [...plateSizes, plate];
    if (!next.length) return;
    setTrainingPreferences({ plateSizesKg: next });
  }

  return (
    <div className="mt-2 rounded-lg border border-border bg-surface px-2.5 py-2">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="press flex w-full items-center justify-between gap-2 text-left">
        <span className="text-[10px] font-semibold text-muted">{tx(locale, "杠铃片计算", "Plate calculator", "プレート計算")}</span>
        <span className="tnum min-w-0 truncate text-right text-[10px] font-semibold text-fg">
          {result.valid
            ? result.platesPerSide.length
              ? `${tx(locale, "每侧", "Each side", "片側")} ${formatPlates(result.platesPerSide)}`
              : tx(locale, "空杆", "Empty bar", "バーのみ")
            : tx(locale, `目标低于 ${barbellKg}kg 杠铃`, `Below the ${barbellKg}kg bar`, `${barbellKg}kg バー未満`)}
        </span>
      </button>

      {open && (
        <div className="mt-2 border-t border-border pt-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold text-faint">{tx(locale, "杠铃重量", "Bar weight", "バー重量")}</span>
            <div className="control-strip grid grid-cols-3 gap-1 rounded-lg p-1">
              {[15, 20, 25].map((weight) => (
                <button
                  key={weight}
                  type="button"
                  onClick={() => setTrainingPreferences({ barbellWeightKg: weight })}
                  aria-pressed={barbellKg === weight}
                  className={"choice-chip press h-7 px-2 text-[10px] font-semibold " + (barbellKg === weight ? "bg-fg text-bg" : "text-muted")}
                >
                  {weight}
                </button>
              ))}
            </div>
          </div>

          {result.valid && (
            <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
              <Metric label={tx(locale, "目标", "Target", "目標")} value={`${targetKg}kg`} />
              <Metric label={tx(locale, "装载", "Loaded", "装着")} value={`${result.achievedKg}kg`} />
              <Metric
                label={tx(locale, "差值", "Difference", "差")}
                value={result.exact
                  ? tx(locale, "准确", "Exact", "一致")
                  : result.remainderKg > 0
                    ? tx(locale, `还差 ${result.remainderKg}kg`, `${result.remainderKg}kg under`, `${result.remainderKg}kg不足`)
                    : tx(locale, `超出 ${Math.abs(result.remainderKg)}kg`, `${Math.abs(result.remainderKg)}kg over`, `${Math.abs(result.remainderKg)}kg超過`)}
                accent={result.exact}
              />
            </div>
          )}

          <p className="mt-2 text-[9px] font-semibold text-faint">{tx(locale, "可用单片重量", "Available plate sizes", "使用可能プレート")}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {DEFAULT_PLATE_SIZES_KG.map((plate) => {
              const active = plateSizes.includes(plate);
              return (
                <button
                  key={plate}
                  type="button"
                  onClick={() => togglePlate(plate)}
                  aria-pressed={active}
                  className={"choice-chip press h-7 rounded-md border px-2 text-[10px] font-semibold " + (active ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface-2 text-faint")}
                >
                  {plate}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function formatPlates(plates: number[]) {
  const counts = new Map<number, number>();
  for (const plate of plates) counts.set(plate, (counts.get(plate) ?? 0) + 1);
  return [...counts.entries()].map(([plate, count]) => count > 1 ? `${plate}×${count}` : `${plate}`).join(" + ");
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className="rounded-lg bg-surface-2 px-1.5 py-1.5"><p className="text-[8px] font-semibold text-faint">{label}</p><p className={"tnum mt-0.5 text-[10px] font-bold " + (accent ? "text-accent" : "text-fg")}>{value}</p></div>;
}
