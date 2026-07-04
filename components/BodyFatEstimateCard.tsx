"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useI18n } from "@/lib/i18n";
import { formatDisplay } from "@/lib/date";
import {
  estimateRfmBodyFat,
  estimatedFatMassKg,
  estimatedLeanMassKg,
  latestEntry,
  rfmFormulaLabel,
  waistToHeightRatio,
  weightForWaistDate,
} from "@/lib/bodyfat";
import type { BodyWeightEntry, Profile, WaistEntry } from "@/lib/types";

export default function BodyFatEstimateCard({
  profile,
  waistEntries,
  bodyWeights,
}: {
  profile?: Profile;
  waistEntries: WaistEntry[];
  bodyWeights: BodyWeightEntry[];
}) {
  const { tr, locale } = useI18n();

  const latestWaist = useMemo(() => latestEntry(waistEntries), [waistEntries]);
  const bodyFat = estimateRfmBodyFat(profile?.sex, profile?.heightCm, latestWaist?.waist);
  const linkedWeight = latestWaist ? weightForWaistDate(bodyWeights, latestWaist.date) : null;
  const waistHeight = waistToHeightRatio(profile?.heightCm, latestWaist?.waist);

  const hasProfile = Boolean(profile?.sex && profile?.heightCm);
  const ready = Boolean(hasProfile && latestWaist && bodyFat != null);
  // The values below are only rendered when `ready` is true. Fallbacks keep
  // TypeScript's control flow explicit without changing the incomplete-state UI.
  const waistEntry = latestWaist ?? { date: "", waist: 0 };
  const bodyFatValue = bodyFat ?? 0;
  const formulaSex = profile?.sex ?? "male";

  return (
    <div className="control-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-fg">{tr("估算体脂率")}</p>
          <p className="mt-0.5 text-[11px] text-faint">RFM · Relative Fat Mass</p>
        </div>
        <span className="rounded bg-surface-2 px-2 py-1 text-[10px] font-semibold text-muted">
          {tr("仅作估算")}
        </span>
      </div>

      {!ready ? (
        <div className="control-strip mt-3 rounded-xl px-3 py-3">
          <p className="text-[13px] text-muted">
            {!hasProfile
              ? tr("先在设置填写生理性别和身高")
              : tr("记录一条腰围后即可估算")}
          </p>
          {!hasProfile && (
            <Link
              href="/settings"
              className="choice-chip press mt-2 inline-flex border border-border bg-surface px-2.5 py-1.5 text-[12px] font-medium text-accent"
            >
              {tr("前往设置")}
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-end gap-1.5">
            <span className="tnum text-[34px] font-bold leading-none text-fg">
              {bodyFatValue.toFixed(1)}
            </span>
            <span className="mb-0.5 text-[15px] text-faint">%</span>
            <span className="mb-1 ml-auto text-right text-[11px] text-faint">
              {formatDisplay(waistEntry.date, locale)}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Metric
              label={tr("腰围")}
              value={`${waistEntry.waist.toFixed(1)} cm`}
              hint={tr("用于 RFM")}
            />
            <Metric
              label={tr("腰高比")}
              value={waistHeight ? waistHeight.toFixed(3) : "—"}
              hint={`${profile!.heightCm} cm`}
            />
            {linkedWeight ? (
              <>
                <Metric
                  label={tr("估算脂肪量")}
                  value={`${estimatedFatMassKg(linkedWeight.weight, bodyFatValue).toFixed(1)} kg`}
                  hint={tr("由体重换算")}
                />
                <Metric
                  label={tr("估算去脂体重")}
                  value={`${estimatedLeanMassKg(linkedWeight.weight, bodyFatValue).toFixed(1)} kg`}
                  hint={`${formatDisplay(linkedWeight.date, locale)} · ${linkedWeight.weight.toFixed(1)} kg`}
                />
              </>
            ) : (
              <div className="control-strip col-span-2 rounded-xl px-2.5 py-2 text-[11px] leading-relaxed text-faint">
                {tr("再记录体重后，可换算估算脂肪量与去脂体重")}
              </div>
            )}
          </div>

          <p className="mt-3 text-[10px] leading-relaxed text-faint">
            {tr("公式：{formula}。体重仅用于换算脂肪量，不参与体脂公式。", {
              formula: rfmFormulaLabel(formulaSex),
            })}
          </p>
        </>
      )}

      <div className="soft-divider mt-3 border-t pt-2.5">
        <p className="text-[11px] font-medium text-muted">{tr("腰围测量标准")}</p>
        <p className="mt-1 text-[10px] leading-relaxed text-faint">
          {tr("站立、自然呼气末、皮尺水平贴在裸露腰部右侧髂嵴最高外缘；不勒紧。每次尽量同一时间和位置。")}
        </p>
        <p className="mt-1 text-[10px] leading-relaxed text-faint">
          {tr("RFM 适用于成人群体估算；肌肉量极高、特殊疾病或测量位置变化时偏差会更大。优先看同一测量方法下的长期趋势。")}
        </p>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="control-strip rounded-xl px-2.5 py-2">
      <p className="text-[10px] text-faint">{label}</p>
      <p className="tnum mt-0.5 text-[15px] font-semibold text-fg">{value}</p>
      <p className="mt-0.5 truncate text-[9px] text-faint">{hint}</p>
    </div>
  );
}
