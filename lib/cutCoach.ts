import type { BodyWeightEntry, CutPlan, DayLog, Profile, WaistEntry } from "./types";
import { shiftDate } from "./weight";
import { cutCardioWeekImpact, KCAL_PER_KG_WEIGHT_CHANGE, resolveCutEnergyPlan, type CutEnergyPlan } from "./cut";
import { currentCutSnapshot } from "./cutMode";

export type CutCoachState = "setup" | "collect" | "hold" | "slowDown" | "speedUp" | "guardrail";

export interface CutSpeedGuardrail {
  low: number;
  high: number;
  preferred: number;
  note: string;
}

export interface CutWeeklyBudget {
  startDate: string;
  endDate: string;
  elapsedDays: number;
  loggedDays: number;
  plannedToDate: number | null;
  loggedCalories: number;
  /** Difference versus food target across days that actually have food records. */
  balanceToDate: number | null;
  weeklyTarget: number | null;
  weeklyRemaining: number | null;
  cardioLoggedNetKcal: number;
  cardioBaselineNetKcal: number;
  cardioAdjustmentKcal: number;
  projectedWeeklyDeficit: number | null;
  projectedWeeklyLossPct: number | null;
}

export interface CutCoachReview {
  state: CutCoachState;
  title: string;
  detail: string;
  actionLabel?: string;
  suggestedWeeklyLossPct?: number;
  guardrail: CutSpeedGuardrail;
  actualWeeklyLossPct: number | null;
  plannedWeeklyLossPct: number;
  dataQuality: "low" | "building" | "ready";
  dataDetail: string;
  weeklyBudget: CutWeeklyBudget;
  calorieTarget: number | null;
  maintenance: number | null;
  trendMaintenanceReady: boolean;
  targetBodyFatPct?: number;
  estimatedBodyFatPct?: number;
}

function asLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isoDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function mondayOf(date: string) {
  const value = asLocalDate(date);
  const day = value.getDay() || 7;
  value.setDate(value.getDate() - day + 1);
  return isoDate(value);
}

function clamp(value: number, low: number, high: number) {
  return Math.max(low, Math.min(high, value));
}

function roundToQuarter(value: number) {
  return Math.round(value * 4) / 4;
}

export function cutSpeedGuardrail(sex: Profile["sex"], estimatedBodyFatPct?: number): CutSpeedGuardrail {
  const female = sex === "female";
  const leanThreshold = female ? 20 : 12;
  const moderateThreshold = female ? 25 : 15;
  if (estimatedBodyFatPct != null && estimatedBodyFatPct <= leanThreshold) return { low: 0.2, high: 0.35, preferred: 0.25, note: "已接近较低体脂区间；优先保留训练表现和恢复，避免用更大赤字硬压体重。" };
  if (estimatedBodyFatPct != null && estimatedBodyFatPct <= moderateThreshold) return { low: 0.25, high: 0.5, preferred: 0.4, note: "中低体脂阶段建议使用保守速度，先保住力量和可执行性。" };
  return { low: 0.25, high: 0.75, preferred: 0.5, note: "默认采用中等速度；趋势稳定比单周体重波动更重要。" };
}

function weeklyBudget(
  days: Record<string, DayLog>,
  plan: CutPlan | undefined,
  today: string,
  energy: CutEnergyPlan,
): CutWeeklyBudget {
  const startDate = mondayOf(today);
  const endDate = shiftDate(startDate, 6);
  const elapsedDays = Math.max(1, Math.min(7, Math.round((asLocalDate(today).getTime() - asLocalDate(startDate).getTime()) / 86400000) + 1));
  const dates = Array.from({ length: 7 }, (_, index) => shiftDate(startDate, index));
  const logged = dates.map((date) => days[date]?.nutrition?.calories ?? 0).filter((calories) => calories > 0);
  const loggedCalories = logged.reduce((sum, calories) => sum + calories, 0);
  const plannedToDate = energy.calorieTarget != null ? energy.calorieTarget * elapsedDays : null;
  const weeklyTarget = energy.calorieTarget != null ? energy.calorieTarget * 7 : null;
  const foodAdjustmentKcal = energy.calorieTarget != null ? Math.round(energy.calorieTarget * logged.length - loggedCalories) : null;
  const cardio = cutCardioWeekImpact(plan, days, energy.weightKg, today);
  const projectedWeeklyDeficit = energy.dailyDeficit != null
    ? Math.round(energy.dailyDeficit * 7 + (foodAdjustmentKcal ?? 0) + cardio.adjustmentKcal)
    : null;
  const projectedWeeklyLossPct = projectedWeeklyDeficit != null && energy.weightKg
    ? Math.round((projectedWeeklyDeficit / KCAL_PER_KG_WEIGHT_CHANGE / energy.weightKg) * 10000) / 100
    : null;
  return {
    startDate,
    endDate,
    elapsedDays,
    loggedDays: logged.length,
    plannedToDate,
    loggedCalories,
    balanceToDate: foodAdjustmentKcal,
    weeklyTarget,
    weeklyRemaining: weeklyTarget != null ? Math.round(weeklyTarget - loggedCalories) : null,
    cardioLoggedNetKcal: cardio.loggedNetKcal,
    cardioBaselineNetKcal: cardio.baselineNetKcal,
    cardioAdjustmentKcal: cardio.adjustmentKcal,
    projectedWeeklyDeficit,
    projectedWeeklyLossPct,
  };
}

function calorieDataCoverage(days: Record<string, DayLog>, today: string, period = 21) {
  return Array.from({ length: period }, (_, index) => shiftDate(today, -index)).filter((date) => (days[date]?.nutrition?.calories ?? 0) > 0).length;
}

function weightCoverage(weights: BodyWeightEntry[], today: string, period = 21) {
  const start = shiftDate(today, -(period - 1));
  return weights.filter((entry) => entry.date >= start && entry.date <= today).length;
}

function cardioForecastText(budget: CutWeeklyBudget) {
  if (!budget.cardioLoggedNetKcal) return "本周尚未记录有氧；预计按基础计划速度推进。";
  if (budget.cardioAdjustmentKcal > 25) return `已记录有氧约 ${budget.cardioLoggedNetKcal} kcal，相对基线多形成约 ${budget.cardioAdjustmentKcal} kcal 赤字，预计本周速度会略快。`;
  if (budget.cardioAdjustmentKcal < -25) return `已记录有氧约 ${budget.cardioLoggedNetKcal} kcal，低于固定有氧基线约 ${Math.abs(budget.cardioAdjustmentKcal)} kcal，预计本周速度会略慢。`;
  return `已记录有氧约 ${budget.cardioLoggedNetKcal} kcal，与固定有氧基线接近。`;
}

/** One weekly decision engine shared by the Cut dashboard and contextual banners. */
export function buildCutCoachReview(
  profile: Profile | undefined,
  plan: CutPlan | undefined,
  days: Record<string, DayLog>,
  weights: BodyWeightEntry[],
  waists: WaistEntry[],
  today: string
): CutCoachReview {
  const energy = resolveCutEnergyPlan(profile, plan, days, weights, today);
  const snapshot = currentCutSnapshot(profile, weights, waists);
  const plannedWeeklyLossPct = plan?.weeklyLossPct ?? 0.5;
  const guardrail = cutSpeedGuardrail(profile?.sex, snapshot?.bodyFatPercent);
  const budget = weeklyBudget(days, plan, today, energy);
  const intakeDays = calorieDataCoverage(days, today);
  const weightDays = weightCoverage(weights, today);
  const actualWeeklyLossPct = energy.calibration.weeklyTrendKg != null && energy.weightKg
    ? Math.round((-energy.calibration.weeklyTrendKg / energy.weightKg) * 10000) / 100
    : null;
  const dataQuality: CutCoachReview["dataQuality"] = energy.calibration.ready ? "ready" : intakeDays >= 7 && weightDays >= 4 ? "building" : "low";
  const dataDetail = energy.calibration.ready
    ? `趋势校准已启用：近 ${energy.calibration.periodDays} 天 ${energy.calibration.intakeDays} 天饮食记录、${energy.calibration.weightDays} 条体重。有氧已包含在真实趋势中。`
    : `还在建立模型：近 21 天已有 ${intakeDays} 天饮食、${weightDays} 条体重；记录的有氧已计入本周速度预测。`;
  const base = {
    guardrail,
    actualWeeklyLossPct,
    plannedWeeklyLossPct,
    dataQuality,
    dataDetail,
    weeklyBudget: budget,
    calorieTarget: energy.calorieTarget,
    maintenance: energy.maintenance,
    trendMaintenanceReady: energy.calibration.ready,
    targetBodyFatPct: plan?.targetBodyFatPct,
    estimatedBodyFatPct: snapshot?.bodyFatPercent,
  };

  if (!energy.weightKg || !energy.calorieTarget) return { ...base, state: "setup", title: "先建立减脂起点", detail: "补齐体重、身高、生理性别和出生年份后生成热量预算；腰围用于体脂趋势，不是必须项。", actionLabel: "补齐计划参数" };
  if (plannedWeeklyLossPct > guardrail.high + 0.02) return { ...base, state: "guardrail", title: "当前目标速度偏激进", detail: `你设定 ${plannedWeeklyLossPct}% / 周；按当前体脂与训练保护规则，建议不高于 ${guardrail.high}% / 周。先降低饮食赤字或有氧总量，而不是继续硬压。`, actionLabel: `改为 ${guardrail.high}% / 周`, suggestedWeeklyLossPct: guardrail.high };
  if (!energy.calibration.ready || actualWeeklyLossPct == null) return { ...base, state: "collect", title: "本周速度会随有氧记录变化", detail: `${cardioForecastText(budget)} 连续记录晨重和真实总热量后，系统会用趋势确认真实速度。`, actionLabel: "完成今天记录" };

  const fastThreshold = Math.max(plannedWeeklyLossPct * 1.35, guardrail.high);
  const slowThreshold = Math.min(plannedWeeklyLossPct * 0.55, Math.max(0.15, guardrail.low));
  if (actualWeeklyLossPct > fastThreshold) {
    const suggested = roundToQuarter(clamp(plannedWeeklyLossPct - 0.15, guardrail.low, guardrail.high));
    return { ...base, state: "slowDown", title: "下降快于计划，先保护恢复", detail: `趋势约 ${actualWeeklyLossPct}% / 周，高于计划 ${plannedWeeklyLossPct}% / 周。优先减少有氧总量或把目标放慢到 ${suggested}% / 周；不要根据单次体重反复改热量。`, actionLabel: `改为 ${suggested}% / 周`, suggestedWeeklyLossPct: suggested };
  }
  if (actualWeeklyLossPct < slowThreshold && intakeDays >= 14) {
    const suggested = roundToQuarter(clamp(plannedWeeklyLossPct + 0.1, guardrail.low, guardrail.high));
    if (suggested > plannedWeeklyLossPct + 0.01) return { ...base, state: "speedUp", title: "执行充分但趋势偏慢", detail: `趋势约 ${actualWeeklyLossPct}% / 周，低于计划 ${plannedWeeklyLossPct}% / 周。可先增加每周 Z2 有氧或把目标调到 ${suggested}% / 周，随后至少观察 14 天。`, actionLabel: `改为 ${suggested}% / 周`, suggestedWeeklyLossPct: suggested };
  }
  return { ...base, state: "hold", title: "当前策略保持不动", detail: `趋势约 ${actualWeeklyLossPct}% / 周，计划 ${plannedWeeklyLossPct}% / 周。${cardioForecastText(budget)} 继续记录，连续偏离时再改一件事。`, actionLabel: "维持 14 天" };
}
