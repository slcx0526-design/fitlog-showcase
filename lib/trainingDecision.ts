import type { AppData } from "./storage";
import type { TrainingType } from "./types";
import type { MuscleGroup } from "./muscles";
import { DEFAULT_CUT_VOLUME_SCALE, isCutModeActive } from "./cutMode";
import { currentMicrocycleProgress, microcycleStepHref, shouldAdvanceMicrocycle } from "./microcycle";
import { summarizeExerciseTrackTrends } from "./prescription";
import { isHistoryEligibleWorkout, summarizeWorkoutWork } from "./trainingMetrics";
import { shiftDate } from "./weight";
import { computeVolumeSummary, microcycleDays, volumeTargetScale } from "./volume";

export type TrainingDecisionConfidence = "starter" | "building" | "ready";

type DecisionBase = { priority: number; href: string };

export type TrainingDecisionAction =
  | (DecisionBase & { kind: "continueSession"; setCount: number })
  | (DecisionBase & { kind: "cycleComplete"; completed: number; total: number })
  | (DecisionBase & { kind: "nextStep"; type: TrainingType; label: string; completed: number; total: number })
  | (DecisionBase & { kind: "recoveryStep"; label: string; completed: number; total: number })
  | (DecisionBase & { kind: "simplifyPlan"; completionPct: number; sessions: number; averageMissingSets: number })
  | (DecisionBase & { kind: "reduceVolume"; muscle: MuscleGroup; current: number; targetHigh: number; suggestedSets: number; source?: string; sourceExerciseId?: string })
  | (DecisionBase & { kind: "addVolume"; muscle: MuscleGroup; current: number; targetLow: number; suggestedSets: number; source?: string; sourceExerciseId?: string })
  | (DecisionBase & { kind: "trackRegression" | "trackPlateau"; exerciseName: string; trackLabel: string; changePct: number | null; sessions: number })
  | (DecisionBase & { kind: "buildHistory"; sessions: number })
  | (DecisionBase & { kind: "maintain"; sessions: number; completed: number; total: number });

export interface PlanAdherenceSummary {
  sessions: number;
  plannedSets: number;
  completedSets: number;
  completionPct: number | null;
  averageMissingSets: number;
}

export interface TrainingDecision {
  confidence: TrainingDecisionConfidence;
  evidence: {
    sessions28d: number;
    plannedSessions: number;
    trendTracks: number;
    cycleCompleted: number;
    cycleTotal: number;
  };
  actions: TrainingDecisionAction[];
}

export function recentPlanAdherence(data: AppData, today: string, limit = 4): PlanAdherenceSummary {
  const start = shiftDate(today, -27);
  const sessions = Object.entries(data.days)
    .filter(([date, day]) => date >= start && date <= today && isHistoryEligibleWorkout(day.workout))
    .sort(([a], [b]) => b.localeCompare(a))
    .flatMap(([, day]) => {
      const summary = summarizeWorkoutWork(day.workout);
      return summary.plannedSets
        ? [{ planned: summary.plannedSets, completed: summary.completionCredits }]
        : [];
    })
    .slice(0, limit);
  const totalPlanned = sessions.reduce((sum, session) => sum + session.planned, 0);
  const totalCompleted = sessions.reduce((sum, session) => sum + session.completed, 0);
  return {
    sessions: sessions.length,
    plannedSets: totalPlanned,
    completedSets: Math.round(totalCompleted * 10) / 10,
    completionPct: totalPlanned ? Math.round((totalCompleted / totalPlanned) * 100) : null,
    averageMissingSets: sessions.length ? Math.max(0, Math.round((totalPlanned - totalCompleted) / sessions.length)) : 0,
  };
}

function recentTrainingSessions(data: AppData, today: string) {
  const start = shiftDate(today, -27);
  return Object.entries(data.days).filter(([date, day]) =>
    date >= start && date <= today && isHistoryEligibleWorkout(day.workout)
  ).length;
}

function targetScale(data: AppData) {
  const cutScale = isCutModeActive(data.cutPlan)
    ? data.cutPlan?.trainingVolumeScale ?? DEFAULT_CUT_VOLUME_SCALE
    : 1;
  return volumeTargetScale("microcycle", data) * cutScale;
}

function correctionActions(data: AppData, cycleRatio: number, cycleComplete: boolean): TrainingDecisionAction[] {
  const volume = computeVolumeSummary(
    microcycleDays(data),
    data.profile?.trainingLevel,
    data.muscleTargets,
    targetScale(data),
  );
  const over = volume.rows
    .filter((row) => row.directEffectiveSets > row.target.high && row.directEffectiveSets > 0)
    .sort((a, b) => (b.directEffectiveSets - b.target.high) / Math.max(b.target.high, 1) - (a.directEffectiveSets - a.target.high) / Math.max(a.target.high, 1))[0];
  const under = (cycleComplete || cycleRatio >= 0.7)
    ? volume.rows
      .filter((row) => row.directEffectiveSets > 0 && row.directEffectiveSets < row.target.low)
      .sort((a, b) => (b.target.low - b.directEffectiveSets) / Math.max(b.target.low, 1) - (a.target.low - a.directEffectiveSets) / Math.max(a.target.low, 1))[0]
    : undefined;
  const actions: TrainingDecisionAction[] = [];
  if (over) {
    const excess = Math.max(1, Math.ceil(over.directEffectiveSets - over.target.high));
    actions.push({
      kind: "reduceVolume",
      priority: 92,
      href: "/progress?tab=training",
      muscle: over.muscle,
      current: over.directEffectiveSets,
      targetHigh: over.target.high,
      suggestedSets: Math.min(4, excess),
      source: over.sources.find((source) => source.directEffectiveSets > 0)?.name,
      sourceExerciseId: over.sources.find((source) => source.directEffectiveSets > 0)?.exerciseId,
    });
  }
  if (under) {
    const gap = Math.max(1, Math.ceil(under.target.low - under.directEffectiveSets));
    actions.push({
      kind: "addVolume",
      priority: 58,
      href: "/schedule",
      muscle: under.muscle,
      current: under.directEffectiveSets,
      targetLow: under.target.low,
      suggestedSets: Math.min(4, gap),
      source: under.sources.find((source) => source.directEffectiveSets > 0)?.name,
      sourceExerciseId: under.sources.find((source) => source.directEffectiveSets > 0)?.exerciseId,
    });
  }
  return actions;
}

export function buildTrainingDecision(data: AppData, today: string, context: "home" | "review" = "review"): TrainingDecision {
  const sessions28d = recentTrainingSessions(data, today);
  const adherence = recentPlanAdherence(data, today);
  const trendStart = shiftDate(today, -27);
  const trends = summarizeExerciseTrackTrends(data.days, shiftDate(today, 1), 12).filter((item) => item.latestDate >= trendStart);
  const cycle = currentMicrocycleProgress(data, today);
  const cycleTotal = cycle.pattern.length;
  const cycleRatio = cycleTotal ? cycle.completed / cycleTotal : 0;
  const cycleComplete = shouldAdvanceMicrocycle(data, today);
  const confidence: TrainingDecisionConfidence = sessions28d < 2 ? "starter" : sessions28d < 6 || trends.length === 0 ? "building" : "ready";
  const actions: TrainingDecisionAction[] = [];
  const todayWorkout = data.days[today]?.workout;
  const todaySets = summarizeWorkoutWork(todayWorkout).workingSets;
  const activeSession = Boolean(todayWorkout?.type !== "rest" && todaySets > 0 && todayWorkout?.done === false);

  if (context === "review" && activeSession) {
    actions.push({ kind: "continueSession", priority: 120, href: "/train", setCount: todaySets });
  }

  // Do not issue plan-changing advice from a volume snapshot while today's
  // session is still being recorded. Finish it first, then reassess.
  if (!activeSession) {
    if (adherence.sessions >= 3 && adherence.completionPct != null && adherence.completionPct < 75) {
      actions.push({
        kind: "simplifyPlan",
        priority: 100,
        href: "/templates",
        completionPct: adherence.completionPct,
        sessions: adherence.sessions,
        averageMissingSets: Math.max(1, adherence.averageMissingSets),
      });
    }

    if (sessions28d > 0) actions.push(...correctionActions(data, cycleRatio, cycleComplete));

    const regressing = trends.find((item) => item.trend.status === "regressing");
    const plateau = trends.find((item) => item.trend.status === "plateau");
    if (regressing) {
      actions.push({
        kind: "trackRegression",
        priority: 86,
        href: "/progress?tab=training",
        exerciseName: regressing.exerciseName,
        trackLabel: regressing.trackLabel,
        changePct: regressing.trend.changePct,
        sessions: regressing.trend.sessionCount,
      });
    } else if (plateau) {
      actions.push({
        kind: "trackPlateau",
        priority: 62,
        href: "/progress?tab=training",
        exerciseName: plateau.exerciseName,
        trackLabel: plateau.trackLabel,
        changePct: plateau.trend.changePct,
        sessions: plateau.trend.sessionCount,
      });
    }

    if (cycleComplete) {
      actions.push({ kind: "cycleComplete", priority: 76, href: "/train", completed: cycle.completed, total: cycleTotal });
    } else if (!todayWorkout && cycle.next) {
      actions.push(cycle.next.type === "rest"
        ? { kind: "recoveryStep", priority: 44, href: "/train?start=rest", label: cycle.next.label, completed: cycle.completed, total: cycleTotal }
        : { kind: "nextStep", priority: 46, href: microcycleStepHref(cycle.next), type: cycle.next.type, label: cycle.next.label, completed: cycle.completed, total: cycleTotal });
    }

    const corrective = actions.some((action) => ["simplifyPlan", "reduceVolume", "addVolume", "trackRegression", "trackPlateau"].includes(action.kind));
    if (!corrective && sessions28d < 2) {
      actions.push({ kind: "buildHistory", priority: 52, href: "/train", sessions: sessions28d });
    } else if (!corrective && sessions28d >= 2) {
      actions.push({ kind: "maintain", priority: 38, href: "/progress?tab=training", sessions: sessions28d, completed: cycle.completed, total: cycleTotal });
    }
  }

  return {
    confidence,
    evidence: {
      sessions28d,
      plannedSessions: adherence.sessions,
      trendTracks: trends.length,
      cycleCompleted: cycle.completed,
      cycleTotal,
    },
    actions: actions.sort((a, b) => b.priority - a.priority).slice(0, context === "home" ? 2 : 4),
  };
}
