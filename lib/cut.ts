import type {
  BaselineActivity,
  BodyWeightEntry,
  CutPlan,
  DayLog,
  Profile,
} from "./types";
import { shiftDate } from "./weight";

/**
 * Energy planning is intentionally separated from exercise logging.
 * FitLog uses recorded intake + smoothed bodyweight to calibrate maintenance.
 * Individual workouts, watch calories and steps are useful training/activity context,
 * but are not precise enough to change the food budget entry-by-entry.
 */

export const KCAL_PER_KG_WEIGHT_CHANGE = 7700;

export const BASELINE_ACTIVITY: Record<
  BaselineActivity,
  { factor: number; label: string; note: string }
> = {
  low: {
    factor: 1.2,
    label: "活动少",
    note: "久坐为主，日常步行不多",
  },
  light: {
    factor: 1.3,
    label: "轻活动",
    note: "日常有一些走动或步行",
  },
  moderate: {
    factor: 1.4,
    label: "中等活动",
    note: "日常走动较多，但不把专门运动算进这里",
  },
  high: {
    factor: 1.5,
    label: "高活动",
    note: "工作/生活中持续走动较多",
  },
};

export const DEFAULT_BASELINE_ACTIVITY: BaselineActivity = "light";
export const DEFAULT_WEEKLY_LOSS_PCT = 0.5;

export function ageFromBirthYear(
  birthYear: number | undefined,
  now = new Date()
): number | null {
  if (!birthYear || !Number.isFinite(birthYear)) return null;
  const age = now.getFullYear() - birthYear;
  return age >= 18 && age <= 100 ? age : null;
}

/** Mifflin–St Jeor, kcal/day. It is a starting estimate, not a measured TDEE. */
export function estimateBmr(
  profile: Profile | undefined,
  weightKg: number | undefined,
  now = new Date()
): number | null {
  const age = ageFromBirthYear(profile?.birthYear, now);
  const height = profile?.heightCm;
  const sex = profile?.sex;
  if (!age || !height || !sex || !weightKg) return null;
  if (weightKg < 30 || weightKg > 300 || height < 120 || height > 230) return null;
  const base = 10 * weightKg + 6.25 * height - 5 * age;
  return Math.round(base + (sex === "male" ? 5 : -161));
}

export function baselineDailyExpenditure(
  bmr: number | null,
  activity: BaselineActivity | undefined
): number | null {
  if (!bmr) return null;
  const factor = BASELINE_ACTIVITY[activity ?? DEFAULT_BASELINE_ACTIVITY].factor;
  return Math.round(bmr * factor);
}

export function targetDailyDeficit(
  weightKg: number | undefined,
  weeklyLossPct: number | undefined
): number | null {
  if (!weightKg || weightKg <= 0) return null;
  const pct = weeklyLossPct ?? DEFAULT_WEEKLY_LOSS_PCT;
  if (!Number.isFinite(pct) || pct <= 0) return null;
  return Math.round((weightKg * (pct / 100) * KCAL_PER_KG_WEIGHT_CHANGE) / 7);
}

export interface MacroTargets {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  minCaloriesForProteinAndFat: number;
  caloriesTooLow: boolean;
}

/**
 * Fixed protein/fat floors and remaining carbohydrate. This is a planning target;
 * only detailed food logging can represent what was actually eaten.
 */
export function macroTargets(
  calories: number | null,
  weightKg: number | undefined
): MacroTargets | null {
  if (!calories || !weightKg || calories <= 0 || weightKg <= 0) return null;
  const protein = Math.round(weightKg * 2.0);
  const fat = Math.ceil(Math.max(weightKg * 0.6, (calories * 0.2) / 9));
  const minCaloriesForProteinAndFat = protein * 4 + fat * 9;
  const carbs = Math.max(0, Math.round((calories - minCaloriesForProteinAndFat) / 4));
  return {
    calories: Math.round(calories),
    protein,
    fat,
    carbs,
    fiber: Math.max(25, Math.round((calories / 1000) * 14)),
    minCaloriesForProteinAndFat,
    caloriesTooLow: calories < minCaloriesForProteinAndFat,
  };
}

function dateRange(endDate: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) =>
    shiftDate(endDate, -(days - 1 - i))
  );
}

function avg(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export interface TrendCalibration {
  ready: boolean;
  periodDays: number;
  intakeDays: number;
  weightDays: number;
  startAverage: number | null;
  endAverage: number | null;
  avgIntake: number | null;
  maintenance: number | null;
  weeklyTrendKg: number | null;
}

/**
 * Estimate TDEE from 21 days of actual intake and smoothed weight change.
 * A workout log is intentionally not an input: it would make the same activity
 * affect the budget twice if it was already reflected in trend weight.
 */
export function estimateTrendMaintenance(
  days: Record<string, DayLog>,
  weights: BodyWeightEntry[],
  endDate: string,
  _legacyWeightKg?: number | undefined,
  periodDays = 21
): TrendCalibration {
  const dates = dateRange(endDate, periodDays);
  const start = dates[0];
  const end = dates.at(-1)!;
  const intakeValues = dates
    .map((date) => days[date]?.nutrition?.calories ?? 0)
    .filter((kcal) => kcal > 0);
  const weightPeriod = weights.filter(
    (entry) => entry.date >= start && entry.date <= end
  );
  const startWindowEnd = shiftDate(start, 6);
  const endWindowStart = shiftDate(end, -6);
  const startValues = weightPeriod
    .filter((entry) => entry.date >= start && entry.date <= startWindowEnd)
    .map((entry) => entry.weight);
  const endValues = weightPeriod
    .filter((entry) => entry.date >= endWindowStart && entry.date <= end)
    .map((entry) => entry.weight);
  const startAverage = avg(startValues);
  const endAverage = avg(endValues);
  const avgIntake = avg(intakeValues);
  const ready =
    intakeValues.length >= 14 &&
    weightPeriod.length >= 8 &&
    startValues.length >= 3 &&
    endValues.length >= 3 &&
    startAverage != null &&
    endAverage != null &&
    avgIntake != null;

  if (!ready) {
    return {
      ready: false,
      periodDays,
      intakeDays: intakeValues.length,
      weightDays: weightPeriod.length,
      startAverage,
      endAverage,
      avgIntake,
      maintenance: null,
      weeklyTrendKg: null,
    };
  }

  const trendPerDay = (endAverage - startAverage) / (periodDays - 7);
  const maintenance = Math.round(avgIntake - trendPerDay * KCAL_PER_KG_WEIGHT_CHANGE);
  const plausible = maintenance >= 1000 && maintenance <= 6000;
  return {
    ready: plausible,
    periodDays,
    intakeDays: intakeValues.length,
    weightDays: weightPeriod.length,
    startAverage,
    endAverage,
    avgIntake,
    maintenance: plausible ? maintenance : null,
    weeklyTrendKg: Math.round(trendPerDay * 7 * 100) / 100,
  };
}

export function latestBodyWeight(entries: BodyWeightEntry[]): BodyWeightEntry | null {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date)).at(-1) ?? null;
}

export type MaintenanceSource = "trend" | "formula" | null;

export interface CutEnergyPlan {
  weightKg: number | undefined;
  bmr: number | null;
  formulaMaintenance: number | null;
  maintenance: number | null;
  maintenanceSource: MaintenanceSource;
  dailyDeficit: number | null;
  calorieTarget: number | null;
  macros: MacroTargets | null;
  calibration: TrendCalibration;
}

/**
 * Single source of truth for Today, Nutrition and Cut pages. Formula starts the
 * plan immediately; once enough entries exist, trend calibration takes priority.
 */
export function resolveCutEnergyPlan(
  profile: Profile | undefined,
  plan: CutPlan | undefined,
  days: Record<string, DayLog>,
  weights: BodyWeightEntry[],
  endDate: string
): CutEnergyPlan {
  const weightKg = latestBodyWeight(weights)?.weight;
  const bmr = estimateBmr(profile, weightKg);
  const formulaMaintenance = baselineDailyExpenditure(
    bmr,
    plan?.baselineActivity ?? DEFAULT_BASELINE_ACTIVITY
  );
  const calibration = estimateTrendMaintenance(days, weights, endDate, weightKg);
  const maintenance = calibration.maintenance ?? formulaMaintenance;
  const maintenanceSource: MaintenanceSource = calibration.maintenance
    ? "trend"
    : formulaMaintenance
    ? "formula"
    : null;
  const dailyDeficit = targetDailyDeficit(weightKg, plan?.weeklyLossPct);
  const calorieTarget =
    maintenance != null && dailyDeficit != null
      ? Math.max(0, maintenance - dailyDeficit)
      : null;
  return {
    weightKg,
    bmr,
    formulaMaintenance,
    maintenance,
    maintenanceSource,
    dailyDeficit,
    calorieTarget,
    macros: macroTargets(calorieTarget, weightKg),
    calibration,
  };
}
