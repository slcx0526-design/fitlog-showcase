import { cutSetPlan, currentCutSnapshot, isCutModeActive, suggestedCutVolumeScale } from "./cutMode";
import { buildIntegratedCoachAnalysis, type IntegratedCoachTrigger } from "./integratedCoach";
import type {
  AdaptiveEvidenceConfidence,
  AdaptiveEvidenceState,
  AppData,
  TemplateItem,
  WorkoutAdaptiveSnapshot,
} from "./types";
import type { EvidenceAdaptationMode, EvidenceMinimumConfidence, TrainingPolicy } from "./trainingPolicy";

export interface AdaptiveEvidenceProfile {
  version: 1;
  revision: string;
  generatedAt: string;
  date: string;
  state: AdaptiveEvidenceState;
  confidence: AdaptiveEvidenceConfidence;
  triggers: IntegratedCoachTrigger[];
  volumeScale: number;
  maxSessionMinutes: number;
  maxWorkingSets: number;
  recommendedTrainingDays: number;
  reasons: string[];
  evidence: string[];
}

export interface AdaptiveRuntimeSetRow {
  exerciseId: string;
  normalSets: number;
  prescribedSets: number;
  isMain: boolean;
}

export interface AdaptiveRuntimePlan {
  profile: AdaptiveEvidenceProfile;
  mode: "none" | "cut" | "evidence" | "cut+evidence";
  evidenceEligible: boolean;
  evidenceApplied: boolean;
  cutApplied: boolean;
  volumeScale: number;
  normalWorkingSets: number;
  prescribedWorkingSets: number;
  estimatedMinutesBefore: number;
  estimatedMinutesAfter: number;
  rows: AdaptiveRuntimeSetRow[];
  reasons: string[];
  snapshot?: WorkoutAdaptiveSnapshot;
}

const confidenceRank: Record<AdaptiveEvidenceConfidence, number> = {
  low: 0,
  building: 1,
  ready: 2,
};

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function roundScale(value: number) {
  return Math.round(Math.min(1, Math.max(0.5, value)) * 100) / 100;
}

function estimateMinutes(items: Array<{ sets: number; isMain?: boolean; supersetGroup?: string }>) {
  return Math.round(items.reduce((minutes, item, index) => {
    const perSet = item.isMain ? 3.5 : item.supersetGroup ? 1.7 : 2.4;
    const transition = index === 0 ? 3 : 1.2;
    return minutes + transition + item.sets * perSet;
  }, 0));
}

export function evidenceConfidenceMeets(
  actual: AdaptiveEvidenceConfidence,
  minimum: EvidenceMinimumConfidence,
) {
  return confidenceRank[actual] >= confidenceRank[minimum];
}

function evidenceModeEnabled(mode: EvidenceAdaptationMode) {
  return mode === "preview" || mode === "automatic";
}

function stateFor(status: ReturnType<typeof buildIntegratedCoachAnalysis>["status"]): AdaptiveEvidenceState {
  if (status === "recover") return "recovery";
  if (status === "caution") return "conservative";
  if (status === "ready") return "normal";
  return "collect";
}

function confidenceFor(confidence: ReturnType<typeof buildIntegratedCoachAnalysis>["confidence"]): AdaptiveEvidenceConfidence {
  if (confidence === "ready") return "ready";
  if (confidence === "building") return "building";
  return "low";
}

function triggerLabel(trigger: IntegratedCoachTrigger) {
  if (trigger === "subjectiveLow") return "今日主观恢复偏低";
  if (trigger === "sustainedLow") return "近 7 天恢复持续偏低";
  if (trigger === "trainingPressure") return "训练压力与表现回退同时出现";
  if (trigger === "healthCaution") return "Apple Health 指标出现谨慎信号";
  if (trigger === "healthLow") return "Apple Health 指标出现低恢复信号";
  if (trigger === "fuelGap") return "近期供能多次低于减脂目标";
  if (trigger === "cardioPressure") return "高强度有氧与力量训练压力叠加";
  return "减脂速度超过当前保护范围";
}

export function buildAdaptiveEvidenceProfile(
  data: AppData,
  policy: TrainingPolicy,
  date: string,
): AdaptiveEvidenceProfile {
  const generatedAt = new Date().toISOString();
  const coach = buildIntegratedCoachAnalysis(data, date);
  const state = stateFor(coach.status);
  const confidence = confidenceFor(coach.confidence);
  const cutActive = isCutModeActive(data.cutPlan);
  const cutSnapshot = currentCutSnapshot(data.profile, data.bodyWeights, data.waistEntries);
  const cutScale = cutActive
    ? data.cutPlan?.trainingVolumeScale
      ?? suggestedCutVolumeScale(cutSnapshot?.bodyFatPercent, data.cutPlan?.weeklyLossPct)
    : 1;

  let evidenceScale = 1;
  if (state === "conservative") evidenceScale = 0.85;
  if (state === "recovery") evidenceScale = 0.7;
  if (coach.training.weakTemplate && coach.training.weakTemplate.sessions >= 3) {
    evidenceScale = Math.min(evidenceScale, 0.9);
  }
  if (coach.cutState === "slowDown" || coach.cutState === "guardrail") {
    evidenceScale = Math.min(evidenceScale, 0.75);
  }
  if (coach.nutrition.lowEnergyDays7d >= 2) evidenceScale = Math.min(evidenceScale, 0.8);
  const volumeScale = roundScale(Math.min(cutScale, evidenceScale));

  const maxSessionMinutes = state === "recovery"
    ? Math.min(policy.maxSessionMinutes, 60)
    : state === "conservative"
      ? Math.min(policy.maxSessionMinutes, 75)
      : policy.maxSessionMinutes;
  const maxWorkingSets = state === "recovery"
    ? Math.min(policy.maxWorkingSetsPerSession, 18)
    : state === "conservative"
      ? Math.min(policy.maxWorkingSetsPerSession, 24)
      : policy.maxWorkingSetsPerSession;
  const mayReduceFrequency = evidenceModeEnabled(policy.evidenceMode)
    && evidenceConfidenceMeets(confidence, policy.evidenceMinimumConfidence)
    && state === "recovery";
  const recommendedTrainingDays = mayReduceFrequency
    ? Math.max(policy.weeklyTrainingDays.minimum, policy.weeklyTrainingDays.target - 1)
    : policy.weeklyTrainingDays.target;

  const reasons = [...new Set([
    ...coach.triggers.map(triggerLabel),
    ...(cutActive ? [`减脂模式按 ${Math.round(cutScale * 100)}% 容量保护主项`] : []),
    ...(coach.training.weakTemplate
      ? [`${coach.training.weakTemplate.templateName} 最近完成率 ${coach.training.weakTemplate.completionPct ?? "未知"}%`]
      : []),
    ...(state === "normal" ? ["现有证据支持按原计划训练"] : []),
    ...(state === "collect" ? ["有效恢复与训练样本不足，暂不自动改变处方"] : []),
  ])];

  const evidence = [
    `训练样本：近 7 天 ${coach.training.load.sessions7d} 次，近 28 天 ${coach.training.load.sessions28d} 次`,
    `恢复样本：近 7 天 ${coach.recovery.scoredDays7d} 天${coach.recovery.average7d == null ? "" : `，平均 ${coach.recovery.average7d}`}`,
    `健康信号：${coach.health.qualifiedSignals} 项有效，${coach.health.adverseSignals} 项不利`,
    `近期计划完成率：${coach.training.adherence.completionPct == null ? "样本不足" : `${coach.training.adherence.completionPct}%`}`,
    `有氧压力：近 7 天 ${coach.cardio.minutes7d} 分钟，高强度近 3 天 ${coach.cardio.highIntensityMinutes3d} 分钟`,
    ...(cutActive ? [`减脂状态：${coach.cutState}`] : []),
  ];

  const revisionSource = JSON.stringify({
    date,
    state,
    confidence,
    triggers: coach.triggers,
    volumeScale,
    maxSessionMinutes,
    maxWorkingSets,
    recommendedTrainingDays,
    recovery: {
      average7d: coach.recovery.average7d,
      sustainedLow: coach.recovery.sustainedLow,
      today: coach.recovery.today?.score,
    },
    health: {
      status: coach.health.status,
      confidence: coach.health.confidence,
      adverseSignals: coach.health.adverseSignals,
    },
    training: {
      sessions7d: coach.training.load.sessions7d,
      completionPct: coach.training.adherence.completionPct,
      recoveryPressure: coach.training.recovery.score,
    },
    cutState: coach.cutState,
  });

  return {
    version: 1,
    revision: `evidence-${hash(revisionSource)}`,
    generatedAt,
    date,
    state,
    confidence,
    triggers: coach.triggers,
    volumeScale,
    maxSessionMinutes,
    maxWorkingSets,
    recommendedTrainingDays,
    reasons,
    evidence,
  };
}

export function buildAdaptiveRuntimePlan(
  data: AppData,
  policy: TrainingPolicy,
  date: string,
  items: TemplateItem[],
): AdaptiveRuntimePlan {
  const profile = buildAdaptiveEvidenceProfile(data, policy, date);
  const cutActive = isCutModeActive(data.cutPlan);
  const cutSnapshot = currentCutSnapshot(data.profile, data.bodyWeights, data.waistEntries);
  const cutScale = cutActive
    ? data.cutPlan?.trainingVolumeScale
      ?? suggestedCutVolumeScale(cutSnapshot?.bodyFatPercent, data.cutPlan?.weeklyLossPct)
    : 1;
  const evidenceEligible = evidenceConfidenceMeets(profile.confidence, policy.evidenceMinimumConfidence);
  const evidenceApplied = policy.evidenceMode === "automatic" && evidenceEligible && profile.state !== "collect";

  const normalWorkingSets = items.reduce((sum, item) => sum + Math.max(1, Math.round(item.sets)), 0);
  const estimatedMinutesBefore = estimateMinutes(items);
  let scale = cutScale;
  if (evidenceApplied) {
    const setCapScale = normalWorkingSets > 0 ? profile.maxWorkingSets / normalWorkingSets : 1;
    const timeCapScale = estimatedMinutesBefore > 0 ? profile.maxSessionMinutes / estimatedMinutesBefore : 1;
    scale = Math.min(scale, profile.volumeScale, setCapScale, timeCapScale);
  }
  scale = roundScale(scale);

  const rows = cutSetPlan(items.map((item) => ({
    id: item.exerciseId,
    sets: item.sets,
    isMain: item.isMain,
  })), scale).map((row) => ({
    exerciseId: row.id,
    normalSets: row.normalSets,
    prescribedSets: row.cutSets,
    isMain: row.isMain,
  }));
  const prescribedWorkingSets = rows.reduce((sum, row) => sum + row.prescribedSets, 0);
  const adjustedItems = items.map((item) => ({
    ...item,
    sets: rows.find((row) => row.exerciseId === item.exerciseId)?.prescribedSets ?? item.sets,
  }));
  const estimatedMinutesAfter = estimateMinutes(adjustedItems);
  const cutApplied = cutActive && cutScale < 1;
  const applied = prescribedWorkingSets < normalWorkingSets;
  const mode = cutApplied && evidenceApplied
    ? "cut+evidence"
    : evidenceApplied
      ? "evidence"
      : cutApplied
        ? "cut"
        : "none";
  const reasons = [
    ...(cutApplied ? [`减脂容量覆盖 ${Math.round(cutScale * 100)}%`] : []),
    ...(evidenceApplied ? profile.reasons : []),
  ];
  const snapshot: WorkoutAdaptiveSnapshot | undefined = applied || evidenceApplied
    ? {
        version: 1,
        createdAt: new Date().toISOString(),
        sourceDate: date,
        evidenceRevision: profile.revision,
        state: profile.state,
        confidence: profile.confidence,
        mode,
        volumeScale: scale,
        normalWorkingSets,
        prescribedWorkingSets,
        maxSessionMinutes: evidenceApplied ? profile.maxSessionMinutes : policy.maxSessionMinutes,
        reasons: reasons.slice(0, 12),
      }
    : undefined;

  return {
    profile,
    mode,
    evidenceEligible,
    evidenceApplied,
    cutApplied,
    volumeScale: scale,
    normalWorkingSets,
    prescribedWorkingSets,
    estimatedMinutesBefore,
    estimatedMinutesAfter,
    rows,
    reasons,
    ...(snapshot ? { snapshot } : {}),
  };
}
