import type { BiologicalSex, BodyWeightEntry, WaistEntry } from "./types";

/** Relative Fat Mass (RFM); height and waist are both centimetres. */
export function estimateRfmBodyFat(sex: BiologicalSex | undefined, heightCm: number | undefined, waistCm: number | undefined): number | null {
  if (!sex || !heightCm || !waistCm || !Number.isFinite(heightCm) || !Number.isFinite(waistCm) || heightCm < 120 || heightCm > 230 || waistCm < 30 || waistCm > 200) return null;
  const estimate = (sex === "female" ? 76 : 64) - 20 * (heightCm / waistCm);
  return Number.isFinite(estimate) ? Math.round(estimate * 10) / 10 : null;
}

export function waistToHeightRatio(heightCm: number | undefined, waistCm: number | undefined): number | null {
  if (!heightCm || !waistCm || heightCm <= 0 || waistCm <= 0) return null;
  return Math.round((waistCm / heightCm) * 1000) / 1000;
}

export function latestEntry<T extends { date: string }>(entries: T[]): T | null {
  return entries.length ? [...entries].sort((a, b) => a.date.localeCompare(b.date)).at(-1) ?? null : null;
}

/** Use same-day or nearest earlier weight only; future observations must not alter a past snapshot. */
export function weightForWaistDate(weights: BodyWeightEntry[], waistDate: string): BodyWeightEntry | null {
  return weights.filter((entry) => entry.date <= waistDate).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
}

export function estimatedFatMassKg(weightKg: number, bodyFatPercent: number): number { return Math.round(weightKg * (bodyFatPercent / 100) * 10) / 10; }
export function estimatedLeanMassKg(weightKg: number, bodyFatPercent: number): number { return Math.round((weightKg - estimatedFatMassKg(weightKg, bodyFatPercent)) * 10) / 10; }
export function rfmFormulaLabel(sex: BiologicalSex): string { return sex === "female" ? "76 − 20 × (身高 ÷ 腰围)" : "64 − 20 × (身高 ÷ 腰围)"; }

export type BodyFatSnapshot = { waist: WaistEntry; bodyFatPercent: number; weight: BodyWeightEntry | null; };