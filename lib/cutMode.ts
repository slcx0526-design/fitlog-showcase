import {
  estimateRfmBodyFat,
  estimatedLeanMassKg,
  latestEntry,
  weightForWaistDate,
} from "./bodyfat";
import type { BodyWeightEntry, CutPlan, Profile, WaistEntry } from "./types";

export const DEFAULT_CUT_VOLUME_SCALE = 0.8;

export type CutSnapshot = {
  weightKg: number;
  bodyFatPercent: number;
  leanMassKg: number;
  waistCm: number;
  date: string;
};

/**
 * Returns one coherent body-composition snapshot. RFM remains an estimate;
 * it is deliberately used for trend and goal projection only.
 */
export function currentCutSnapshot(
  profile: Profile | undefined,
  weights: BodyWeightEntry[],
  waists: WaistEntry[]
): CutSnapshot | null {
  const waist = latestEntry(waists);
  if (!waist) return null;
  const weight = weightForWaistDate(weights, waist.date);
  const bodyFat = estimateRfmBodyFat(profile?.sex, profile?.heightCm, waist.waist);
  if (!weight || bodyFat == null || bodyFat <= 3 || bodyFat >= 70) return null;
  return {
    weightKg: weight.weight,
    bodyFatPercent: bodyFat,
    leanMassKg: estimatedLeanMassKg(weight.weight, bodyFat),
    waistCm: waist.waist,
    date: waist.date,
  };
}

/**
 * Projection, not a target weight: assumes lean mass remains unchanged.
 * It is intentionally only shown as a reference range in the UI.
 */
export function projectedWeightAtBodyFat(
  leanMassKg: number | undefined,
  targetBodyFatPct: number | undefined
): number | null {
  if (!leanMassKg || !targetBodyFatPct || leanMassKg <= 0 || targetBodyFatPct <= 3 || targetBodyFatPct >= 60) return null;
  const projected = leanMassKg / (1 - targetBodyFatPct / 100);
  return Number.isFinite(projected) ? Math.round(projected * 10) / 10 : null;
}

export function projectedWeeksToBodyFat(
  currentWeightKg: number | undefined,
  projectedTargetWeightKg: number | null,
  weeklyLossPct: number | undefined
): number | null {
  if (!currentWeightKg || !projectedTargetWeightKg || projectedTargetWeightKg >= currentWeightKg) return null;
  const weeklyKg = currentWeightKg * ((weeklyLossPct ?? 0.5) / 100);
  if (!Number.isFinite(weeklyKg) || weeklyKg <= 0) return null;
  return Math.ceil((currentWeightKg - projectedTargetWeightKg) / weeklyKg);
}

/**
 * Cut training should retain movement practice and intensity, then trim volume.
 * A lower scale is used only for a fast cut or very low estimated body fat.
 */
export function suggestedCutVolumeScale(
  bodyFatPercent: number | undefined,
  weeklyLossPct: number | undefined
): number {
  if ((bodyFatPercent != null && bodyFatPercent < 15) || (weeklyLossPct ?? 0) >= 0.75) return 0.7;
  return DEFAULT_CUT_VOLUME_SCALE;
}

/** Apply the temporary cut overlay to a template's planned sets. */
export function cutAdjustedSets(sets: number, scale: number | undefined): number {
  const base = Math.max(1, Math.round(sets));
  const normalized = scale && scale > 0 && scale <= 1 ? scale : DEFAULT_CUT_VOLUME_SCALE;
  // 2-set prescriptions stay 2; 3 -> 2, 4 -> 3, 5 -> 4, etc.
  return Math.max(1, Math.round(base * normalized));
}

export function isCutModeActive(plan: CutPlan | undefined): boolean {
  return plan?.enabled === true;
}
