import { scoreRecoveryCheckIn } from "./recovery";
import { collectFinalizedMicrocycleSamples } from "./cycleSamples";
import { evaluateProgressionOutcome } from "./trainingExecution";
import { summarizeExerciseWork, summarizeWorkoutWork } from "./trainingMetrics";
import { MUSCLE_ORDER, type MuscleGroup } from "./muscles";
import type { AppData, Exercise, TrainingCyclePhase, VolumeContribution } from "./types";

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
  planCredits: number;
  completionPct: number | null;
  hardRatio: number | null;
  progressionPct: number | null;
  recoveryAverage: number | null;
  averageAdaptiveScale: number;
  prescribedSetsPerSession: number;
  normalSetsPerSession: number;
  cycleSteps: number;
  prescribedSetsPer7Days: number;
  completedSetsPer7Days: number;
  normalSetsPer7Days: number;
  muscles: Partial<Record<MuscleGroup, AdaptiveMuscleCycleResponse>>;
}

export interface AdaptiveMuscleCycleResponse {
  plannedDirectSets: number;
  directSets: number;
  effectiveSets: number;
  completionPct: number | null;
  progressionPct: number | null;
}

export interface AdaptiveMuscleResponse {
  muscle: MuscleGroup;
  confidence: AdaptiveResponseConfidence;
  tolerance: AdaptiveVolumeTolerance;
  evaluatedCycles: number;
  comparableTransitions: number;
  volumeBias: number;
  latestDirectSets: number;
  summary: string;
  reasons: string[];
}

export interface AdaptiveCycleTransition {
  fromMicrocycleId: string;
  toMicrocycleId: string;
  loadRatio: number;
  evidenceSignals: number;
  score: number;
  outcome: AdaptiveTransitionOutcome;
  reasons: string[];
}

export interface AdaptiveResponseModel {
  version: 4;
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
  muscles: AdaptiveMuscleResponse[];
}

const round = (value: number, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function exerciseContributions(exercise: Exercise): VolumeContribution[] {
  if (exercise.volumeContributions?.length) return exercise.volumeContributions;
  return exercise.primaryMuscle ? [{ muscle: exercise.primaryMuscle, weight: 1, direct: true }] : [];
}

function finalizedCycles(data: AppData, today: string): AdaptiveCycleResponse[] {
  return collectFinalizedMicrocycleSamples(data, today)
    .map((sample) => {
      let sessions = 0;
      let plannedSets = 0;
      let planCredits = 0;
      let completedSets = 0;
      let difficultySamples = 0;
      let hardSessions = 0;
      let progressionTotal = 0;
      let progressionCredits = 0;
      let normalSets = 0;
      const muscleStats = new Map<MuscleGroup, {
        plannedDirectSets: number;
        directSets: number;
        effectiveSets: number;
        progressionTotal: number;
        progressionCredits: number;
      }>();
      const recoveryScores: number[] = [];
      const adaptiveScales: number[] = [];
      for (const day of sample.days) {
        const workout = day.workout;
        if (!workout || workout.type === "rest") continue;
        const work = summarizeWorkoutWork(workout);
        const actualCredits = workout.exercises.reduce(
          (sum, exercise) => sum + summarizeExerciseWork(exercise).completionCredits,
          0,
        );
        if (actualCredits <= 0) continue;
        sessions += 1;
        plannedSets += work.plannedSets;
        planCredits += work.completionCredits;
        completedSets += actualCredits;
        if (workout.difficulty) {
          difficultySamples += 1;
          if (workout.difficulty === "hard") hardSessions += 1;
        }
        for (const exercise of workout.exercises) {
          const exerciseWork = summarizeExerciseWork(exercise);
          const outcome = evaluateProgressionOutcome(exercise, workout);
          const progressionCredit = outcome.status === "achieved" ? 1 : outcome.status === "partial" ? 0.5 : 0;
          if (outcome.status !== "unassessable") {
            progressionTotal += 1;
            progressionCredits += progressionCredit;
          }
          for (const contribution of exerciseContributions(exercise)) {
            const current = muscleStats.get(contribution.muscle) ?? {
              plannedDirectSets: 0,
              directSets: 0,
              effectiveSets: 0,
              progressionTotal: 0,
              progressionCredits: 0,
            };
            current.effectiveSets += exerciseWork.completionCredits * contribution.weight;
            if (contribution.direct) {
              current.plannedDirectSets += exerciseWork.plannedSets * contribution.weight;
              current.directSets += exerciseWork.completionCredits * contribution.weight;
              if (outcome.status !== "unassessable") {
                current.progressionTotal += 1;
                current.progressionCredits += progressionCredit;
              }
            }
            muscleStats.set(contribution.muscle, current);
          }
        }
        const recovery = scoreRecoveryCheckIn(day.recovery, day.date);
        if (recovery && recovery.signalCount >= 2) recoveryScores.push(recovery.score);
        adaptiveScales.push(workout.adaptiveSnapshot?.volumeScale ?? 1);
        normalSets += workout.adaptiveSnapshot?.normalWorkingSets ?? (work.plannedSets || actualCredits);
      }
      const cycleSteps = Math.max(sample.completedSteps, sessions, 1);
      const sessionDivisor = Math.max(1, sessions);
      const muscles = Object.fromEntries([...muscleStats.entries()].map(([muscle, stats]) => [muscle, {
        plannedDirectSets: round(stats.plannedDirectSets),
        directSets: round(stats.directSets),
        effectiveSets: round(stats.effectiveSets),
        completionPct: stats.plannedDirectSets > 0
          ? Math.round(Math.min(100, stats.directSets / stats.plannedDirectSets * 100))
          : null,
        progressionPct: stats.progressionTotal > 0
          ? Math.round(stats.progressionCredits / stats.progressionTotal * 100)
          : null,
      }])) as Partial<Record<MuscleGroup, AdaptiveMuscleCycleResponse>>;
      return {
        microcycleId: sample.id,
        startedAt: sample.startedAt,
        endedAt: sample.endedAt,
        phase: sample.phase,
        sessions,
        plannedSets: Math.round(plannedSets),
        planCredits: round(planCredits),
        completedSets: round(completedSets),
        completionPct: plannedSets ? Math.round(Math.min(100, planCredits / plannedSets * 100)) : null,
        hardRatio: difficultySamples ? round(hardSessions / difficultySamples, 2) : null,
        progressionPct: progressionTotal ? Math.round(progressionCredits / progressionTotal * 100) : null,
        recoveryAverage: average(recoveryScores) == null ? null : Math.round(average(recoveryScores)!),
        averageAdaptiveScale: round(average(adaptiveScales) ?? 1, 2),
        prescribedSetsPerSession: round(plannedSets / sessionDivisor),
        normalSetsPerSession: round(normalSets / sessionDivisor),
        cycleSteps,
        prescribedSetsPer7Days: round(plannedSets * 7 / cycleSteps),
        completedSetsPer7Days: round(completedSets * 7 / cycleSteps),
        normalSetsPer7Days: round(normalSets * 7 / cycleSteps),
        muscles,
      };
    })
    .filter((cycle) => cycle.sessions >= 2 && cycle.completedSets > 0)
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
}

function compareCycles(previous: AdaptiveCycleResponse, next: AdaptiveCycleResponse): AdaptiveCycleTransition {
  let score = 0;
  let evidenceSignals = 0;
  const reasons: string[] = [];
  if (previous.completionPct != null && next.completionPct != null) {
    evidenceSignals += 1;
    const completionDelta = next.completionPct - previous.completionPct;
    if (completionDelta >= 5) {
      score += 1;
      reasons.push(`完成率提高 ${completionDelta} 个百分点`);
    } else if (completionDelta <= -8) {
      score -= 1;
      reasons.push(`完成率下降 ${Math.abs(completionDelta)} 个百分点`);
    }
  }
  if (previous.hardRatio != null && next.hardRatio != null) {
    evidenceSignals += 1;
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
    evidenceSignals += 1;
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
    evidenceSignals += 1;
    const delta = next.recoveryAverage - previous.recoveryAverage;
    if (delta >= 7) {
      score += 1;
      reasons.push("恢复评分改善");
    } else if (delta <= -8) {
      score -= 1;
      reasons.push("恢复评分下降");
    }
  }
  const loadRatio = previous.completedSetsPer7Days > 0
    ? round(next.completedSetsPer7Days / previous.completedSetsPer7Days, 2)
    : 1;
  return {
    fromMicrocycleId: previous.microcycleId,
    toMicrocycleId: next.microcycleId,
    loadRatio,
    evidenceSignals,
    score,
    outcome: score >= 2 ? "positive" : score <= -2 ? "negative" : "neutral",
    reasons: reasons.length ? reasons : ["主要结果指标保持稳定"],
  };
}

function buildMuscleResponses(cycles: AdaptiveCycleResponse[]): AdaptiveMuscleResponse[] {
  return MUSCLE_ORDER.flatMap((muscle): AdaptiveMuscleResponse[] => {
    const relevant = cycles.filter((cycle) => cycle.phase === "build" && (cycle.muscles[muscle]?.directSets ?? 0) > 0);
    const transitions = relevant.slice(1).flatMap((cycle, index) => {
      const previous = relevant[index];
      const before = previous.muscles[muscle];
      const after = cycle.muscles[muscle];
      if (!before || !after || before.directSets <= 0) return [];
      let score = 0;
      let evidenceSignals = 0;
      if (before.completionPct != null && after.completionPct != null) {
        evidenceSignals += 1;
        const delta = after.completionPct - before.completionPct;
        if (delta >= 5) score += 1;
        else if (delta <= -10) score -= 1;
      }
      if (before.progressionPct != null && after.progressionPct != null) {
        evidenceSignals += 1;
        const delta = after.progressionPct - before.progressionPct;
        if (delta >= 10) score += 1;
        else if (delta <= -15) score -= 1;
      }
      if (previous.hardRatio != null && cycle.hardRatio != null) {
        evidenceSignals += 1;
        const delta = cycle.hardRatio - previous.hardRatio;
        if (delta <= -0.15) score += 1;
        else if (delta >= 0.2) score -= 1;
      }
      if (previous.recoveryAverage != null && cycle.recoveryAverage != null) {
        evidenceSignals += 1;
        const delta = cycle.recoveryAverage - previous.recoveryAverage;
        if (delta >= 7) score += 1;
        else if (delta <= -8) score -= 1;
      }
      return [{
        loadRatio: round(after.directSets / before.directSets, 2),
        outcome: score >= 2 ? "positive" as const : score <= -2 ? "negative" as const : "neutral" as const,
        evidenceSignals,
      }];
    }).filter((transition) => transition.evidenceSignals >= 2);
    if (!relevant.length) return [];
    const confidence: AdaptiveResponseConfidence = relevant.length >= 4 && transitions.length >= 3
      ? "ready"
      : relevant.length >= 2 && transitions.length >= 1
        ? "building"
        : "low";
    const higherPositive = transitions.filter((item) => item.loadRatio >= 1.04 && item.outcome === "positive").length;
    const higherNegative = transitions.filter((item) => item.loadRatio >= 1.04 && item.outcome === "negative").length;
    const lowerPositive = transitions.filter((item) => item.loadRatio <= 0.94 && item.outcome === "positive").length;
    const stableNegative = transitions.filter((item) => item.loadRatio > 0.94 && item.loadRatio < 1.04 && item.outcome === "negative").length;
    let tolerance: AdaptiveVolumeTolerance = "unknown";
    if (confidence !== "low") {
      if (higherNegative + lowerPositive + stableNegative >= 1) tolerance = "low";
      else if (higherPositive >= 2 && higherNegative === 0) tolerance = "high";
      else tolerance = "balanced";
    }
    const volumeBias = tolerance === "low" ? -0.1 : tolerance === "high" ? 0.05 : 0;
    const summary = tolerance === "low"
      ? "该肌群在当前剂量下的完成、进阶或恢复反应偏弱。"
      : tolerance === "high"
        ? "该肌群加量后仍保持良好的完成、进阶与恢复反应。"
        : tolerance === "balanced"
          ? "该肌群目前更适合维持剂量并继续观察。"
          : "该肌群还没有足够的完整周期证据。";
    return [{
      muscle,
      confidence,
      tolerance,
      evaluatedCycles: relevant.length,
      comparableTransitions: transitions.length,
      volumeBias,
      latestDirectSets: relevant.at(-1)?.muscles[muscle]?.directSets ?? 0,
      summary,
      reasons: [
        `该肌群已分析 ${relevant.length} 个周期和 ${transitions.length} 次可比较变化`,
        ...(higherPositive ? [`该肌群加量后改善 ${higherPositive} 次`] : []),
        ...(higherNegative ? [`该肌群加量后恶化 ${higherNegative} 次`] : []),
        ...(lowerPositive ? [`该肌群减量后改善 ${lowerPositive} 次`] : []),
      ],
    }];
  });
}

export function buildAdaptiveResponseModel(data: AppData, today: string): AdaptiveResponseModel {
  const generatedAt = new Date().toISOString();
  const cycles = finalizedCycles(data, today);
  const buildCycles = cycles.filter((cycle) => cycle.phase === "build");
  const transitions = buildCycles
    .slice(1)
    .map((cycle, index) => compareCycles(buildCycles[index], cycle))
    .filter((transition) => transition.evidenceSignals >= 2);
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
    if (higherNegative + lowerPositive + stableNegative >= 2) tolerance = "low";
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
  const muscles = buildMuscleResponses(buildCycles);

  return {
    version: 4,
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
    muscles,
  };
}
