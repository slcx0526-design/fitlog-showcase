import { scoreRecoveryCheckIn } from "./recovery";
import { evaluateProgressionOutcome } from "./trainingExecution";
import { summarizeWorkoutWork } from "./trainingMetrics";
import type { AppData, TrainingCyclePhase } from "./types";

export type AdaptiveResponseConfidence = "low" | "building" | "ready";
export type AdaptiveVolumeTolerance = "unknown" | "low" | "balanced" | "high";
export type AdaptiveTransitionOutcome = "positive" | "neutral" | "negative";

export interface AdaptiveCycleResponse {
  microcycleId: string;
  startedAt: string;
  endedAt: string;
  phase: TrainingCyclePhase;
  sessions: number;
  plannedSets: number;
  completedSets: number;
  completionPct: number;
  hardRatio: number | null;
  progressionPct: number | null;
  recoveryAverage: number | null;
  averageAdaptiveScale: number;
  prescribedSetsPerSession: number;
  normalSetsPerSession: number;
}

export interface AdaptiveCycleTransition {
  fromMicrocycleId: string;
  toMicrocycleId: string;
  loadRatio: number;
  score: number;
  outcome: AdaptiveTransitionOutcome;
  reasons: string[];
}

export interface AdaptiveResponseModel {
  version: 1;
  generatedAt: string;
  confidence: AdaptiveResponseConfidence;
  tolerance: AdaptiveVolumeTolerance;
  evaluatedCycles: number;
  comparableTransitions: number;
  volumeBias: number;
  trainingDayDelta: -1 | 0 | 1;
  summary: string;
  reasons: string[];
  cycles: AdaptiveCycleResponse[];
  transitions: AdaptiveCycleTransition[];
}

interface MutableCycle {
  microcycleId: string;
  dates: string[];
  phases: TrainingCyclePhase[];
  sessions: number;
  plannedSets: number;
  completedSets: number;
  difficultySamples: number;
  hardSessions: number;
  progressionTotal: number;
  progressionCredits: number;
  recoveryScores: number[];
  adaptiveScales: number[];
  normalSets: number;
}

const round = (value: number, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function cycleGroups(data: AppData, today: string) {
  const groups = new Map<string, MutableCycle>();
  for (const [date, day] of Object.entries(data.days)) {
    const workout = day.workout;
    if (date > today || !workout?.microcycleId || workout.type === "rest" || workout.done !== true) continue;
    const work = summarizeWorkoutWork(workout);
    if (work.plannedSets <= 0) continue;
    const current = groups.get(workout.microcycleId) ?? {
      microcycleId: workout.microcycleId,
      dates: [],
      phases: [],
      sessions: 0,
      plannedSets: 0,
      completedSets: 0,
      difficultySamples: 0,
      hardSessions: 0,
      progressionTotal: 0,
      progressionCredits: 0,
      recoveryScores: [],
      adaptiveScales: [],
      normalSets: 0,
    };
    current.dates.push(date);
    current.phases.push(workout.cyclePhase ?? "build");
    current.sessions += 1;
    current.plannedSets += work.plannedSets;
    current.completedSets += work.completionCredits;
    if (workout.difficulty) {
      current.difficultySamples += 1;
      if (workout.difficulty === "hard") current.hardSessions += 1;
    }
    for (const exercise of workout.exercises) {
      const outcome = evaluateProgressionOutcome(exercise, workout);
      if (outcome.status === "unassessable") continue;
      current.progressionTotal += 1;
      current.progressionCredits += outcome.status === "achieved" ? 1 : outcome.status === "partial" ? 0.5 : 0;
    }
    const recovery = scoreRecoveryCheckIn(day.recovery, date);
    if (recovery && recovery.signalCount >= 2) current.recoveryScores.push(recovery.score);
    current.adaptiveScales.push(workout.adaptiveSnapshot?.volumeScale ?? 1);
    current.normalSets += workout.adaptiveSnapshot?.normalWorkingSets ?? work.plannedSets;
    groups.set(workout.microcycleId, current);
  }
  return groups;
}

function finalizedCycles(data: AppData, today: string): AdaptiveCycleResponse[] {
  return [...cycleGroups(data, today).values()]
    .filter((cycle) => cycle.sessions >= 2 && cycle.plannedSets > 0)
    .map((cycle) => {
      const dates = [...cycle.dates].sort();
      const phase: TrainingCyclePhase = cycle.phases.filter((value) => value === "deload").length > cycle.phases.length / 2
        ? "deload"
        : "build";
      return {
        microcycleId: cycle.microcycleId,
        startedAt: dates[0],
        endedAt: dates[dates.length - 1],
        phase,
        sessions: cycle.sessions,
        plannedSets: Math.round(cycle.plannedSets),
        completedSets: round(cycle.completedSets),
        completionPct: Math.round(Math.min(100, cycle.completedSets / cycle.plannedSets * 100)),
        hardRatio: cycle.difficultySamples ? round(cycle.hardSessions / cycle.difficultySamples, 2) : null,
        progressionPct: cycle.progressionTotal ? Math.round(cycle.progressionCredits / cycle.progressionTotal * 100) : null,
        recoveryAverage: average(cycle.recoveryScores) == null ? null : Math.round(average(cycle.recoveryScores)!),
        averageAdaptiveScale: round(average(cycle.adaptiveScales) ?? 1, 2),
        prescribedSetsPerSession: round(cycle.plannedSets / cycle.sessions),
        normalSetsPerSession: round(cycle.normalSets / cycle.sessions),
      };
    })
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
}

function compareCycles(previous: AdaptiveCycleResponse, next: AdaptiveCycleResponse): AdaptiveCycleTransition {
  let score = 0;
  const reasons: string[] = [];
  const completionDelta = next.completionPct - previous.completionPct;
  if (completionDelta >= 5) {
    score += 1;
    reasons.push(`完成率提高 ${completionDelta} 个百分点`);
  } else if (completionDelta <= -8) {
    score -= 1;
    reasons.push(`完成率下降 ${Math.abs(completionDelta)} 个百分点`);
  }
  if (previous.hardRatio != null && next.hardRatio != null) {
    const delta = next.hardRatio - previous.hardRatio;
    if (delta <= -0.15) {
      score += 1;
      reasons.push("高难度训练占比下降");
    } else if (delta >= 0.2) {
      score -= 1;
      reasons.push("高难度训练占比上升");
    }
  }
  if (previous.progressionPct != null && next.progressionPct != null) {
    const delta = next.progressionPct - previous.progressionPct;
    if (delta >= 10) {
      score += 1;
      reasons.push("进阶目标兑现率提高");
    } else if (delta <= -15) {
      score -= 1;
      reasons.push("进阶目标兑现率下降");
    }
  }
  if (previous.recoveryAverage != null && next.recoveryAverage != null) {
    const delta = next.recoveryAverage - previous.recoveryAverage;
    if (delta >= 7) {
      score += 1;
      reasons.push("恢复评分改善");
    } else if (delta <= -8) {
      score -= 1;
      reasons.push("恢复评分下降");
    }
  }
  const loadRatio = previous.prescribedSetsPerSession > 0
    ? round(next.prescribedSetsPerSession / previous.prescribedSetsPerSession, 2)
    : 1;
  return {
    fromMicrocycleId: previous.microcycleId,
    toMicrocycleId: next.microcycleId,
    loadRatio,
    score,
    outcome: score >= 2 ? "positive" : score <= -2 ? "negative" : "neutral",
    reasons: reasons.length ? reasons : ["主要结果指标保持稳定"],
  };
}

export function buildAdaptiveResponseModel(data: AppData, today: string): AdaptiveResponseModel {
  const generatedAt = new Date().toISOString();
  const cycles = finalizedCycles(data, today);
  const buildCycles = cycles.filter((cycle) => cycle.phase === "build");
  const transitions = buildCycles.slice(1).map((cycle, index) => compareCycles(buildCycles[index], cycle));
  const confidence: AdaptiveResponseConfidence = buildCycles.length >= 4 && transitions.length >= 3
    ? "ready"
    : buildCycles.length >= 2 && transitions.length >= 1
      ? "building"
      : "low";

  const higherPositive = transitions.filter((item) => item.loadRatio >= 1.04 && item.outcome === "positive").length;
  const higherNegative = transitions.filter((item) => item.loadRatio >= 1.04 && item.outcome === "negative").length;
  const lowerPositive = transitions.filter((item) => item.loadRatio <= 0.94 && item.outcome === "positive").length;
  const stableNegative = transitions.filter((item) => item.loadRatio > 0.94 && item.loadRatio < 1.04 && item.outcome === "negative").length;

  let tolerance: AdaptiveVolumeTolerance = "unknown";
  if (confidence !== "low") {
    if (higherNegative + stableNegative >= 2 || lowerPositive >= 2) tolerance = "low";
    else if (higherPositive >= 2 && higherNegative === 0) tolerance = "high";
    else tolerance = "balanced";
  }
  const volumeBias = tolerance === "low" ? -0.1 : tolerance === "high" ? 0.05 : 0;
  const trainingDayDelta: -1 | 0 | 1 = tolerance === "low" ? -1 : tolerance === "high" && confidence === "ready" ? 1 : 0;
  const summary = tolerance === "low"
    ? "跨周期结果显示，当前对更高训练剂量的耐受偏低。"
    : tolerance === "high"
      ? "跨周期结果显示，增加训练剂量后表现和恢复仍能改善。"
      : tolerance === "balanced"
        ? "跨周期结果支持维持当前训练剂量，再用更多周期确认。"
        : "至少需要两个可比较的完整构建周期才能建立个人反应模型。";
  const reasons = [
    `已分析 ${buildCycles.length} 个构建周期和 ${transitions.length} 次相邻周期比较`,
    ...(higherPositive ? [`加量后改善 ${higherPositive} 次`] : []),
    ...(higherNegative ? [`加量后恶化 ${higherNegative} 次`] : []),
    ...(lowerPositive ? [`减量后改善 ${lowerPositive} 次`] : []),
    ...(stableNegative ? [`同等剂量下恶化 ${stableNegative} 次`] : []),
  ];

  return {
    version: 1,
    generatedAt,
    confidence,
    tolerance,
    evaluatedCycles: buildCycles.length,
    comparableTransitions: transitions.length,
    volumeBias,
    trainingDayDelta,
    summary,
    reasons,
    cycles: cycles.slice(-8).reverse(),
    transitions: transitions.slice(-8).reverse(),
  };
}
