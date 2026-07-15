import type { BaselineActivity, BodyWeightEntry, CardioEntry, CutPlan, DayLog, Profile, Zone } from "./types";
import { shiftDate } from "./weight";

export const KCAL_PER_KG_WEIGHT_CHANGE = 7700;
export const BASELINE_ACTIVITY: Record<BaselineActivity, { factor: number; label: string; note: string }> = {
  low: { factor: 1.2, label: "久坐 · <2,000 步", note: "约 <1.5 km / 天；通勤、工作和散步都很少" },
  light: { factor: 1.3, label: "轻活动 · 2,000–5,000 步", note: "约 1.5–4 km / 天；每天走 2 km 选这里" },
  moderate: { factor: 1.4, label: "中等活动 · 5,000–8,000 步", note: "约 4–6 km / 天；日常走动明显较多" },
  high: { factor: 1.5, label: "高活动 · 8,000+ 步", note: "约 6+ km / 天，或多数时间久站、走动的工作" },
};
export const DEFAULT_BASELINE_ACTIVITY: BaselineActivity = "light";
export const DEFAULT_WEEKLY_LOSS_PCT = 0.5;
export const ROUTINE_CARDIO_NET_MET: Record<Zone, number> = { 1: 1.5, 2: 3.5, 3: 5.5, 4: 7, 5: 8.5 };
const safeZone = (zone: unknown): Zone => zone === 1 || zone === 2 || zone === 3 || zone === 4 || zone === 5 ? zone : 2;
const finitePositive = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;

function mondayOf(date: string) { const [year, month, day] = date.split("-").map(Number); const value = new Date(year, month - 1, day); const weekday = value.getDay() || 7; value.setDate(value.getDate() - weekday + 1); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
function elapsedWeekDays(today: string, startDate: string) { const [ty, tm, td] = today.split("-").map(Number); const [sy, sm, sd] = startDate.split("-").map(Number); return Math.max(1, Math.min(7, Math.round((new Date(ty, tm - 1, td).getTime() - new Date(sy, sm - 1, sd).getTime()) / 86400000) + 1)); }

export function cardioEntryNetExpenditure(entry: Pick<CardioEntry, "minutes" | "zone">, weightKg: number | undefined): number {
  const minutes = finitePositive(entry.minutes);
  if (!weightKg || weightKg <= 0 || !minutes) return 0;
  return Math.round((Math.min(240, minutes) / 60) * weightKg * ROUTINE_CARDIO_NET_MET[safeZone(entry.zone)]);
}
export function routineCardioDailyExpenditure(weightKg: number | undefined, minutesPerSession: number | undefined, sessionsPerWeek: number | undefined, zone: Zone | undefined): number {
  if (!weightKg || weightKg <= 0) return 0;
  const minutes = finitePositive(minutesPerSession), sessions = finitePositive(sessionsPerWeek);
  if (!minutes || !sessions) return 0;
  const weeklyMinutes = Math.min(840, minutes * Math.min(7, sessions));
  return Math.round((weeklyMinutes / 60) * weightKg * ROUTINE_CARDIO_NET_MET[safeZone(zone)] / 7);
}

export interface CutCardioWeekImpact { startDate: string; endDate: string; elapsedDays: number; loggedMinutes: number; sessions: number; loggedNetKcal: number; baselineNetKcal: number; adjustmentKcal: number; }
export function cutCardioWeekImpact(plan: CutPlan | undefined, days: Record<string, DayLog>, weightKg: number | undefined, today: string): CutCardioWeekImpact {
  const startDate = mondayOf(today), endDate = shiftDate(startDate, 6), elapsedDays = elapsedWeekDays(today, startDate);
  const entries = Array.from({ length: elapsedDays }, (_, index) => shiftDate(startDate, index)).flatMap((date) => days[date]?.cardio ?? []);
  const loggedMinutes = entries.reduce((sum, entry) => sum + finitePositive(entry.minutes), 0);
  const loggedNetKcal = entries.reduce((sum, entry) => sum + cardioEntryNetExpenditure(entry, weightKg), 0);
  const baselineNetKcal = routineCardioDailyExpenditure(weightKg, plan?.routineCardioMinutesPerSession, plan?.routineCardioSessionsPerWeek, plan?.routineCardioZone) * elapsedDays;
  return { startDate, endDate, elapsedDays, loggedMinutes, sessions: entries.length, loggedNetKcal, baselineNetKcal, adjustmentKcal: loggedNetKcal - baselineNetKcal };
}

export function ageFromBirthYear(birthYear: number | undefined, now = new Date()): number | null { if (!birthYear || !Number.isFinite(birthYear)) return null; const age = now.getFullYear() - birthYear; return age >= 18 && age <= 100 ? age : null; }
export function estimateBmr(profile: Profile | undefined, weightKg: number | undefined, now = new Date()): number | null { const age = ageFromBirthYear(profile?.birthYear, now), height = profile?.heightCm, sex = profile?.sex; if (!age || !height || !sex || !weightKg || weightKg < 30 || weightKg > 300 || height < 120 || height > 230) return null; return Math.round(10 * weightKg + 6.25 * height - 5 * age + (sex === "male" ? 5 : -161)); }
export function baselineDailyExpenditure(bmr: number | null, activity: BaselineActivity | undefined): number | null { return bmr ? Math.round(bmr * BASELINE_ACTIVITY[activity ?? DEFAULT_BASELINE_ACTIVITY].factor) : null; }
export function targetDailyDeficit(weightKg: number | undefined, weeklyLossPct: number | undefined): number | null { if (!weightKg || weightKg <= 0) return null; const pct = weeklyLossPct ?? DEFAULT_WEEKLY_LOSS_PCT; return !Number.isFinite(pct) || pct <= 0 ? null : Math.round((weightKg * (pct / 100) * KCAL_PER_KG_WEIGHT_CHANGE) / 7); }

export interface MacroTargets { calories: number; protein: number; fat: number; carbs: number; fiber: number; minCaloriesForProteinAndFat: number; caloriesTooLow: boolean; }
export function macroTargets(calories: number | null, weightKg: number | undefined): MacroTargets | null { if (!calories || !weightKg || calories <= 0 || weightKg <= 0) return null; const protein = Math.round(weightKg * 2), fat = Math.ceil(Math.max(weightKg * .6, calories * .2 / 9)), minCaloriesForProteinAndFat = protein * 4 + fat * 9; return { calories: Math.round(calories), protein, fat, carbs: Math.max(0, Math.round((calories - minCaloriesForProteinAndFat) / 4)), fiber: 0, minCaloriesForProteinAndFat, caloriesTooLow: calories < minCaloriesForProteinAndFat }; }
function dateRange(endDate: string, days: number): string[] { return Array.from({ length: days }, (_, index) => shiftDate(endDate, -(days - 1 - index))); }
function avg(values: number[]): number | null { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
export interface TrendCalibration { ready: boolean; periodDays: number; intakeDays: number; weightDays: number; startAverage: number | null; endAverage: number | null; avgIntake: number | null; maintenance: number | null; weeklyTrendKg: number | null; }
export function estimateTrendMaintenance(days: Record<string, DayLog>, weights: BodyWeightEntry[], endDate: string, _legacyWeightKg?: number | undefined, periodDays = 21): TrendCalibration {
  const dates = dateRange(endDate, periodDays), start = dates[0], end = dates.at(-1)!;
  const intakeValues = dates.map((date) => finitePositive(days[date]?.nutrition?.calories)).filter((kcal) => kcal > 0);
  const weightPeriod = weights.filter((entry) => entry.date >= start && entry.date <= end && finitePositive(entry.weight) > 0);
  const startValues = weightPeriod.filter((entry) => entry.date >= start && entry.date <= shiftDate(start, 6)).map((entry) => entry.weight);
  const endValues = weightPeriod.filter((entry) => entry.date >= shiftDate(end, -6) && entry.date <= end).map((entry) => entry.weight);
  const startAverage = avg(startValues), endAverage = avg(endValues), avgIntake = avg(intakeValues);
  const ready = intakeValues.length >= 14 && weightPeriod.length >= 8 && startValues.length >= 3 && endValues.length >= 3 && startAverage != null && endAverage != null && avgIntake != null;
  if (!ready) return { ready: false, periodDays, intakeDays: intakeValues.length, weightDays: weightPeriod.length, startAverage, endAverage, avgIntake, maintenance: null, weeklyTrendKg: null };
  const trendPerDay = (endAverage - startAverage) / (periodDays - 7);
  const maintenance = Math.round(avgIntake - trendPerDay * KCAL_PER_KG_WEIGHT_CHANGE);
  const plausible = maintenance >= 1000 && maintenance <= 6000;
  return { ready: plausible, periodDays, intakeDays: intakeValues.length, weightDays: weightPeriod.length, startAverage, endAverage, avgIntake, maintenance: plausible ? maintenance : null, weeklyTrendKg: Math.round(trendPerDay * 7 * 100) / 100 };
}
/** Latest valid body weight, optionally constrained to a historical date. */
export function latestBodyWeight(entries: BodyWeightEntry[], onOrBefore?: string): BodyWeightEntry | null { return entries.filter((entry) => (!onOrBefore || entry.date <= onOrBefore) && finitePositive(entry.weight) > 0).sort((a, b) => a.date.localeCompare(b.date)).at(-1) ?? null; }
export type MaintenanceSource = "trend" | "formula" | null;
export interface CutEnergyPlan { weightKg: number | undefined; bmr: number | null; formulaBaseMaintenance: number | null; routineCardioDailyKcal: number; formulaMaintenance: number | null; maintenance: number | null; maintenanceSource: MaintenanceSource; dailyDeficit: number | null; calorieTarget: number | null; macros: MacroTargets | null; calibration: TrendCalibration; }
export function resolveCutEnergyPlan(profile: Profile | undefined, plan: CutPlan | undefined, days: Record<string, DayLog>, weights: BodyWeightEntry[], endDate: string): CutEnergyPlan {
  const weightKg = latestBodyWeight(weights, endDate)?.weight;
  const bmr = estimateBmr(profile, weightKg), formulaBaseMaintenance = baselineDailyExpenditure(bmr, plan?.baselineActivity ?? DEFAULT_BASELINE_ACTIVITY), routineCardioDailyKcal = routineCardioDailyExpenditure(weightKg, plan?.routineCardioMinutesPerSession, plan?.routineCardioSessionsPerWeek, plan?.routineCardioZone), formulaMaintenance = formulaBaseMaintenance == null ? null : formulaBaseMaintenance + routineCardioDailyKcal, calibration = estimateTrendMaintenance(days, weights, endDate, weightKg), maintenance = calibration.maintenance ?? formulaMaintenance, maintenanceSource: MaintenanceSource = calibration.maintenance ? "trend" : formulaMaintenance ? "formula" : null, dailyDeficit = targetDailyDeficit(weightKg, plan?.weeklyLossPct), calorieTarget = maintenance != null && dailyDeficit != null ? Math.max(0, maintenance - dailyDeficit) : null;
  return { weightKg, bmr, formulaBaseMaintenance, routineCardioDailyKcal, formulaMaintenance, maintenance, maintenanceSource, dailyDeficit, calorieTarget, macros: macroTargets(calorieTarget, weightKg), calibration };
}