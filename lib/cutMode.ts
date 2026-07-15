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

export type CutSetPlanInput = { id: string; sets: number; isMain?: boolean };
export type CutSetPlanRow = {
  id: string;
  normalSets: number;
  cutSets: number;
  isMain: boolean;
};

type PendingTemplateAllocation = { queue: Array<number | null> };
let pendingTemplateAllocation: PendingTemplateAllocation | null = null;

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

/** Projection only: assumes lean mass remains unchanged. */
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
 * 80% is the standard cut overlay. Recovery can be adjusted manually, but the
 * system never auto-reduces load or tonnage from body-fat estimates.
 */
export function suggestedCutVolumeScale(
  _bodyFatPercent?: number,
  _weeklyLossPct?: number
): number {
  return DEFAULT_CUT_VOLUME_SCALE;
}

/** One-item fallback for callers without a template allocation context. */
export function cutAdjustedSets(sets: number, scale: number | undefined): number {
  const queued = pendingTemplateAllocation?.queue.shift();
  if (pendingTemplateAllocation && pendingTemplateAllocation.queue.length === 0) pendingTemplateAllocation = null;
  if (typeof queued === "number") return queued;

  const base = Math.max(1, Math.round(sets));
  const normalized = scale && scale > 0 && scale <= 1 ? scale : DEFAULT_CUT_VOLUME_SCALE;
  return Math.max(1, Math.round(base * normalized));
}

/**
 * Allocate a volume reduction across a complete template rather than rounding
 * every movement separately. Accessories lose sets first; primary lifts retain
 * at least two working sets whenever their original plan has two or more.
 */
export function cutSetPlan(items: CutSetPlanInput[], scale: number | undefined): CutSetPlanRow[] {
  const normalized = scale && scale > 0 && scale <= 1 ? scale : DEFAULT_CUT_VOLUME_SCALE;
  const rows = items.map((item) => {
    const normalSets = Math.max(1, Math.round(item.sets));
    const isMain = item.isMain === true;
    return {
      id: item.id,
      normalSets,
      cutSets: normalSets,
      isMain,
      minSets: isMain ? Math.min(2, normalSets) : 1,
    };
  });
  const normalTotal = rows.reduce((sum, row) => sum + row.normalSets, 0);
  const minimumTotal = rows.reduce((sum, row) => sum + row.minSets, 0);
  const targetTotal = Math.max(minimumTotal, Math.round(normalTotal * normalized));
  let toRemove = Math.max(0, normalTotal - targetTotal);

  const candidates = [...rows].sort((a, b) => {
    if (a.isMain !== b.isMain) return a.isMain ? 1 : -1;
    const aSpare = a.normalSets - a.minSets;
    const bSpare = b.normalSets - b.minSets;
    if (aSpare !== bSpare) return bSpare - aSpare;
    return b.normalSets - a.normalSets;
  });

  while (toRemove > 0) {
    let changed = false;
    for (const row of candidates) {
      if (toRemove <= 0) break;
      if (row.cutSets > row.minSets) {
        row.cutSets -= 1;
        toRemove -= 1;
        changed = true;
      }
    }
    if (!changed) break;
  }

  return rows.map(({ id, normalSets, cutSets, isMain }) => ({ id, normalSets, cutSets, isMain }));
}

/**
 * Prime the two cut-adjustment calls performed for every template exercise
 * (planned sets and progression working sets). Call immediately before the
 * store applies a template; recorded exercises must be excluded by the caller.
 */
export function primeCutTemplateAllocation(items: CutSetPlanInput[], scale: number | undefined): void {
  const rows = cutSetPlan(items, scale);
  pendingTemplateAllocation = rows.length
    ? { queue: rows.flatMap((row) => [row.cutSets, row.cutSets]) }
    : null;
}

export function clearCutTemplateAllocation(): void {
  pendingTemplateAllocation = null;
}

export function isCutModeActive(plan: CutPlan | undefined): boolean {
  return plan?.enabled === true;
}