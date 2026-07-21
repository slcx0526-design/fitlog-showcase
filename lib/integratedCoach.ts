import type { AppData } from "./storage";
import { cardioMinutes } from "./cardio";
import { resolveCutEnergyPlan } from "./cut";
import { buildCutCoachReview, type CutCoachState } from "./cutCoach";
import { isCutModeActive } from "./cutMode";
import { summarizeRecovery, type RecoverySummary } from "./recovery";
import { buildTrainingAnalysis, type TrainingAnalysis } from "./trainingAnalysis";
import { shiftDate } from "./weight";

export type IntegratedCoachStatus = "collect" | "ready" | "caution" | "recover";
export type IntegratedCoachConfidence = "low" | "building" | "ready";
export type IntegratedCoachTrigger =
  | "subjectiveLow"
  | "sustainedLow"
  | "trainingPressure"
  | "fuelGap"
  | "cardioPressure"
  | "cutTooFast";

export interface IntegratedNutritionSummary {
  loggedDays7d: number;
  proteinTrackedDays7d: number;
  proteinOnTargetDays7d: number;
  lowEnergyDays7d: number;
  calorieTarget: number | null;
  proteinTarget: number | null;
}

export interface IntegratedCardioSummary {
  minutes7d: number;
  highIntensityMinutes3d: number;
  stressPoints7d: number;
}

export interface IntegratedCoachAnalysis {
  status: IntegratedCoachStatus;
  confidence: IntegratedCoachConfidence;
  primaryAction: "logRecovery" | "trainAsPlanned" | "trainConservatively" | "takeRecovery";
  triggers: IntegratedCoachTrigger[];
  recovery: RecoverySummary;
  training: TrainingAnalysis;
  nutrition: IntegratedNutritionSummary;
  cardio: IntegratedCardioSummary;
  cutState: CutCoachState | "off";
}

function datesEndingAt(today: string, count: number) {
  return Array.from({ length: count }, (_, index) => shiftDate(today, -index));
}

function nutritionSummary(data: AppData, today: string): IntegratedNutritionSummary {
  const cutActive = isCutModeActive(data.cutPlan);
  const energy = cutActive
    ? resolveCutEnergyPlan(data.profile, data.cutPlan, data.days, data.bodyWeights, today)
    : null;
  const logs = datesEndingAt(today, 7)
    .map((date) => data.days[date]?.nutrition)
    .filter((log): log is NonNullable<typeof log> => Boolean(log && log.calories > 0));
  const proteinTarget = energy?.macros?.protein ?? null;
  const proteinLogs = logs.filter((log) => log.protein > 0);
  const lowEnergyDays7d = energy?.calorieTarget
    ? logs.filter((log) => log.calories < energy.calorieTarget! * 0.8).length
    : 0;
  return {
    loggedDays7d: logs.length,
    proteinTrackedDays7d: proteinLogs.length,
    proteinOnTargetDays7d: proteinTarget == null ? 0 : proteinLogs.filter((log) => log.protein >= proteinTarget).length,
    lowEnergyDays7d,
    calorieTarget: energy?.calorieTarget ?? null,
    proteinTarget,
  };
}

function cardioSummary(data: AppData, today: string): IntegratedCardioSummary {
  const dates7 = datesEndingAt(today, 7);
  const dates3 = new Set(datesEndingAt(today, 3));
  let minutes7d = 0;
  let highIntensityMinutes3d = 0;
  let stressPoints7d = 0;
  const zoneWeight = { 1: 0.5, 2: 1, 3: 1.5, 4: 2, 5: 2.5 } as const;
  for (const date of dates7) {
    const entries = data.days[date]?.cardio ?? [];
    minutes7d += cardioMinutes(entries);
    for (const entry of entries) {
      const weight = entry.zone == null ? 1 : zoneWeight[entry.zone];
      stressPoints7d += entry.minutes * weight;
      if (dates3.has(date) && entry.zone != null && entry.zone >= 4) highIntensityMinutes3d += entry.minutes;
    }
  }
  return {
    minutes7d: Math.round(minutes7d),
    highIntensityMinutes3d: Math.round(highIntensityMinutes3d),
    stressPoints7d: Math.round(stressPoints7d),
  };
}

export function buildIntegratedCoachAnalysis(data: AppData, today: string): IntegratedCoachAnalysis {
  const recovery = summarizeRecovery(data.days, today);
  const training = buildTrainingAnalysis(data, today);
  const nutrition = nutritionSummary(data, today);
  const cardio = cardioSummary(data, today);
  const cutActive = isCutModeActive(data.cutPlan);
  const cutReview = cutActive
    ? buildCutCoachReview(data.profile, data.cutPlan, data.days, data.bodyWeights, data.waistEntries, today)
    : null;
  const cutState = cutReview?.state ?? "off";

  const subjectiveLow = Boolean(recovery.today && recovery.today.signalCount >= 2 && recovery.today.score < 50);
  const sustainedLow = recovery.sustainedLow;
  const trainingPressure = training.recovery.active;
  const fuelGap = nutrition.calorieTarget != null && nutrition.loggedDays7d >= 3 && nutrition.lowEnergyDays7d >= 2;
  const cardioPressure = cardio.highIntensityMinutes3d >= 45 && training.load.sessions7d >= 4;
  const cutTooFast = cutState === "slowDown" || cutState === "guardrail";
  const triggers: IntegratedCoachTrigger[] = [
    ...(subjectiveLow ? ["subjectiveLow" as const] : []),
    ...(sustainedLow ? ["sustainedLow" as const] : []),
    ...(trainingPressure ? ["trainingPressure" as const] : []),
    ...(fuelGap ? ["fuelGap" as const] : []),
    ...(cardioPressure ? ["cardioPressure" as const] : []),
    ...(cutTooFast ? ["cutTooFast" as const] : []),
  ];
  const corroboratingPressure = Number(trainingPressure) + Number(fuelGap) + Number(cardioPressure) + Number(cutTooFast);

  let status: IntegratedCoachStatus;
  if ((subjectiveLow || sustainedLow) && corroboratingPressure > 0) status = "recover";
  else if (trainingPressure && (fuelGap || cardioPressure || cutTooFast)) status = "recover";
  else if (triggers.length) status = "caution";
  else if (!recovery.today && training.confidence === "starter") status = "collect";
  else status = "ready";

  let evidencePoints = 0;
  if (recovery.today?.signalCount) evidencePoints += 1;
  if (recovery.scoredDays7d >= 3) evidencePoints += 1;
  if (training.load.sessions28d >= 2) evidencePoints += 1;
  if (training.load.sessions28d >= 6) evidencePoints += 1;
  if (cutActive && nutrition.loggedDays7d >= 3) evidencePoints += 1;
  if (cutReview?.trendMaintenanceReady) evidencePoints += 1;
  const confidence: IntegratedCoachConfidence = evidencePoints >= 4 ? "ready" : evidencePoints >= 2 ? "building" : "low";
  const primaryAction = status === "recover"
    ? "takeRecovery"
    : status === "caution"
      ? "trainConservatively"
      : status === "ready"
        ? "trainAsPlanned"
        : "logRecovery";

  return { status, confidence, primaryAction, triggers, recovery, training, nutrition, cardio, cutState };
}
