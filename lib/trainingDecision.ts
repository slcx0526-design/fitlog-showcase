import type { AppData } from "./storage";
import type { TrainingType } from "./types";
import type { MuscleGroup } from "./muscles";
import { buildIntegratedCoachAnalysis, type IntegratedCoachStatus, type IntegratedCoachTrigger } from "./integratedCoach";
import { currentMicrocycleProgress, microcycleStepHref, shouldAdvanceMicrocycle } from "./microcycle";
import { exercisePrescription, progressionSuggestion, type ProgressionSuggestion } from "./prescription";
import { diagnoseTrackTrend, type TrackDiagnosis } from "./trackDiagnosis";
import { isWorkoutSessionClosed, summarizeWorkoutWork } from "./trainingMetrics";
import {
  recentPlanAdherence,
  type TrainingAnalysis,
  type TrainingAnalysisConfidence,
} from "./trainingAnalysis";

export type TrainingDecisionConfidence = TrainingAnalysisConfidence;
export { recentPlanAdherence };

type DecisionBase = { priority: number; href: string };

export type TrainingDecisionAction =
  | (DecisionBase & { kind: "continueSession"; setCount: number })
  | (DecisionBase & { kind: "reviewUnclosed"; date: string; setCount: number })
  | (DecisionBase & { kind: "recoveryPriority"; hardSessions: number; difficultySamples: number; regressingExercises: number; sessions7d: number; overTargetMuscles: number; triggers: IntegratedCoachTrigger[] })
  | (DecisionBase & { kind: "conservativeSession"; triggers: IntegratedCoachTrigger[] })
  | (DecisionBase & { kind: "cycleComplete"; completed: number; total: number })
  | (DecisionBase & { kind: "nextStep"; type: TrainingType; label: string; completed: number; total: number })
  | (DecisionBase & { kind: "recoveryStep"; label: string; completed: number; total: number })
  | (DecisionBase & { kind: "simplifyPlan"; templateId: string; templateName: string; completionPct: number; sessions: number; averageMissingSets: number })
  | (DecisionBase & { kind: "reduceVolume"; muscle: MuscleGroup; basis: "actual" | "projected"; current: number; projected: number; targetHigh: number; suggestedSets: number; source?: string; sourceExerciseId?: string; templateId?: string })
  | (DecisionBase & { kind: "addVolume"; muscle: MuscleGroup; current: number; projected: number; targetLow: number; suggestedSets: number; source?: string; sourceExerciseId?: string; templateId?: string })
  | (DecisionBase & { kind: "trackRegression" | "trackPlateau"; exerciseName: string; trackLabel: string; changePct: number | null; sessions: number; progressionStatus?: ProgressionSuggestion["status"]; diagnosis: TrackDiagnosis })
  | (DecisionBase & { kind: "buildHistory"; sessions: number })
  | (DecisionBase & { kind: "maintain"; sessions: number; completed: number; total: number; improvingTracks: number });

export interface TrainingDecision {
  confidence: TrainingDecisionConfidence;
  evidence: {
    sessions7d: number;
    sessions28d: number;
    plannedSessions: number;
    difficultySamples: number;
    hardSessions: number;
    trendTracks: number;
    improvingTracks: number;
    plateauTracks: number;
    regressingTracks: number;
    cycleCompleted: number;
    cycleTotal: number;
    projectionComplete: boolean;
    coveredRemainingSteps: number;
    remainingTrainingSteps: number;
    readinessStatus: IntegratedCoachStatus;
    readinessTriggers: IntegratedCoachTrigger[];
  };
  actions: TrainingDecisionAction[];
}

function strongestVolumeCorrection(
  analysis: TrainingAnalysis,
  allowAdd: boolean,
): TrainingDecisionAction | null {
  const over = analysis.cycle.rows
    .filter((row) => row.status === "over" || row.status === "projectedOver")
    .filter((row) => row.current > 0 || row.remaining > 0)
    .sort((a, b) => {
      const aExcess = (a.status === "over" ? a.current : a.projected) - a.target.high;
      const bExcess = (b.status === "over" ? b.current : b.projected) - b.target.high;
      return bExcess / Math.max(b.target.high, 1) - aExcess / Math.max(a.target.high, 1);
    })[0];
  if (over) {
    const basis = over.status === "over" ? "actual" : "projected";
    const measured = basis === "actual" ? over.current : over.projected;
    const excess = Math.max(1, Math.ceil(measured - over.target.high));
    const source = basis === "actual" ? over.actualSource : over.plannedSource ?? over.actualSource;
    return {
      kind: "reduceVolume",
      priority: basis === "actual" ? 92 : 72,
      href: "/progress?tab=training",
      muscle: over.muscle,
      basis,
      current: over.current,
      projected: over.projected,
      targetHigh: over.target.high,
      suggestedSets: Math.min(4, excess),
      source: source?.name,
      sourceExerciseId: source?.exerciseId,
      templateId: source?.templateId,
    };
  }

  if (!allowAdd || !analysis.cycle.projectionComplete || analysis.cycle.ratio < 0.7) return null;
  const under = analysis.cycle.rows
    .filter((row) => row.status === "under" && row.projected > 0)
    .sort((a, b) => (
      (b.target.low - b.projected) / Math.max(b.target.low, 1)
      - (a.target.low - a.projected) / Math.max(a.target.low, 1)
    ))[0];
  if (!under) return null;
  const gap = Math.max(1, Math.ceil(under.target.low - under.projected));
  const source = under.plannedSource ?? under.actualSource;
  return {
    kind: "addVolume",
    priority: 58,
    href: "/schedule",
    muscle: under.muscle,
    current: under.current,
    projected: under.projected,
    targetLow: under.target.low,
    suggestedSets: Math.min(4, gap),
    source: source?.name,
    sourceExerciseId: source?.exerciseId,
    templateId: source?.templateId,
  };
}

function trendDiagnosis(
  item: ReturnType<typeof buildIntegratedCoachAnalysis>["training"]["trends"][number],
  analysis: TrainingAnalysis,
  recoveryPressure: boolean,
) {
  const primaryMuscle = item.histories[0]?.exercise.primaryMuscle;
  const volume = primaryMuscle ? analysis.cycle.rows.find((row) => row.muscle === primaryMuscle) : undefined;
  return diagnoseTrackTrend(item, {
    recoveryPressure,
    ...(volume ? { volume: { current: volume.current, targetHigh: volume.target.high, overTarget: volume.status === "over" } } : {}),
  });
}

function trendAction(
  analysis: TrainingAnalysis,
  recoveryPressure: boolean,
): TrainingDecisionAction | null {
  const regressing = analysis.trends.find((item) => item.trend.status === "regressing");
  if (regressing) {
    const latest = regressing.histories[0];
    return {
      kind: "trackRegression",
      priority: 86,
      href: "/progress?tab=training",
      exerciseName: regressing.exerciseName,
      trackLabel: regressing.trackLabel,
      changePct: regressing.trend.changePct,
      sessions: regressing.trend.sessionCount,
      progressionStatus: latest
        ? progressionSuggestion(exercisePrescription(latest.exercise), latest).status
        : undefined,
      diagnosis: trendDiagnosis(regressing, analysis, recoveryPressure),
    };
  }
  const plateau = analysis.trends.find((item) => item.trend.status === "plateau");
  if (!plateau) return null;
  const latest = plateau.histories[0];
  return {
    kind: "trackPlateau",
    priority: 62,
    href: "/progress?tab=training",
    exerciseName: plateau.exerciseName,
    trackLabel: plateau.trackLabel,
    changePct: plateau.trend.changePct,
    sessions: plateau.trend.sessionCount,
    progressionStatus: latest
      ? progressionSuggestion(exercisePrescription(latest.exercise), latest).status
      : undefined,
    diagnosis: trendDiagnosis(plateau, analysis, recoveryPressure),
  };
}

function decisionConfidence(
  training: TrainingAnalysisConfidence,
  integrated: ReturnType<typeof buildIntegratedCoachAnalysis>["confidence"],
  status: IntegratedCoachStatus,
): TrainingAnalysisConfidence {
  if (status === "ready") return training;
  if (integrated === "low") return "starter";
  if (integrated === "building" || training === "building") return "building";
  return training;
}

export function buildTrainingDecision(
  data: AppData,
  today: string,
  context: "home" | "review" = "review",
  providedIntegrated?: ReturnType<typeof buildIntegratedCoachAnalysis>,
): TrainingDecision {
  const integrated = providedIntegrated ?? buildIntegratedCoachAnalysis(data, today);
  const analysis = integrated.training;
  const cycle = currentMicrocycleProgress(data, today);
  const cycleComplete = shouldAdvanceMicrocycle(data, today);
  const actions: TrainingDecisionAction[] = [];
  const todayWorkout = data.days[today]?.workout;
  const todaySets = summarizeWorkoutWork(todayWorkout).workingSets;
  const activeSession = Boolean(todayWorkout && todayWorkout.type !== "rest" && !isWorkoutSessionClosed(todayWorkout));
  const recoveryPriority = integrated.status === "recover" || analysis.recovery.active;
  const conservativeSession = integrated.status === "caution" && !analysis.recovery.active;

  if (context === "review" && activeSession) {
    actions.push({ kind: "continueSession", priority: 120, href: "/train", setCount: todaySets });
  }

  if (!activeSession && analysis.unclosed) {
    actions.push({
      kind: "reviewUnclosed",
      priority: 116,
      href: `/train?date=${analysis.unclosed.date}`,
      date: analysis.unclosed.date,
      setCount: analysis.unclosed.setCount,
    });
  }

  // Plan-changing advice waits until active or recently unclosed work has been
  // confirmed. Reference-only sessions remain visible elsewhere in the app.
  if (!activeSession && !analysis.unclosed) {
    if (recoveryPriority) {
      actions.push({
        kind: "recoveryPriority",
        priority: 108,
        href: "/schedule",
        hardSessions: analysis.load.hardSessions,
        difficultySamples: analysis.load.difficultySamples,
        regressingExercises: analysis.recovery.regressingExercises,
        sessions7d: analysis.load.sessions7d,
        overTargetMuscles: analysis.recovery.overTargetMuscles,
        triggers: integrated.triggers,
      });
    } else if (conservativeSession) {
      actions.push({
        kind: "conservativeSession",
        priority: 104,
        href: "/train",
        triggers: integrated.triggers,
      });
    }

    if (analysis.weakTemplate) {
      actions.push({
        kind: "simplifyPlan",
        priority: analysis.recovery.active ? 96 : 100,
        href: "/templates",
        templateId: analysis.weakTemplate.templateId,
        templateName: analysis.weakTemplate.templateName,
        completionPct: analysis.weakTemplate.completionPct!,
        sessions: analysis.weakTemplate.sessions,
        averageMissingSets: Math.max(1, Math.ceil(analysis.weakTemplate.averageMissingSets)),
      });
    }

    if (analysis.load.sessions28d > 0) {
      const volumeAction = strongestVolumeCorrection(
        analysis,
        !recoveryPriority && !conservativeSession && !analysis.weakTemplate && analysis.regressingTracks === 0,
      );
      if (volumeAction) actions.push(volumeAction);
    }

    if (!recoveryPriority && !conservativeSession) {
      const action = trendAction(analysis, false);
      if (action) actions.push(action);
    }

    if (cycleComplete) {
      actions.push({ kind: "cycleComplete", priority: 76, href: "/progress?tab=training", completed: cycle.completed, total: cycle.pattern.length });
    } else if (!todayWorkout && cycle.next) {
      actions.push(cycle.next.type === "rest"
        ? { kind: "recoveryStep", priority: 44, href: "/train?start=rest", label: cycle.next.label, completed: cycle.completed, total: cycle.pattern.length }
        : { kind: "nextStep", priority: 46, href: microcycleStepHref(cycle.next), type: cycle.next.type, label: cycle.next.label, completed: cycle.completed, total: cycle.pattern.length });
    }

    const corrective = actions.some((action) => [
      "recoveryPriority",
      "conservativeSession",
      "simplifyPlan",
      "reduceVolume",
      "addVolume",
      "trackRegression",
      "trackPlateau",
    ].includes(action.kind));
    if (!corrective && analysis.load.sessions28d < 2) {
      actions.push({ kind: "buildHistory", priority: 52, href: "/train", sessions: analysis.load.sessions28d });
    } else if (!corrective && analysis.load.sessions28d >= 2) {
      actions.push({
        kind: "maintain",
        priority: 38,
        href: "/progress?tab=training",
        sessions: analysis.load.sessions28d,
        completed: cycle.completed,
        total: cycle.pattern.length,
        improvingTracks: analysis.improvingTracks,
      });
    }
  }

  return {
    confidence: decisionConfidence(analysis.confidence, integrated.confidence, integrated.status),
    evidence: {
      sessions7d: analysis.load.sessions7d,
      sessions28d: analysis.load.sessions28d,
      plannedSessions: analysis.adherence.sessions,
      difficultySamples: analysis.load.difficultySamples,
      hardSessions: analysis.load.hardSessions,
      trendTracks: analysis.trends.length,
      improvingTracks: analysis.improvingTracks,
      plateauTracks: analysis.plateauTracks,
      regressingTracks: analysis.regressingTracks,
      cycleCompleted: analysis.cycle.completed,
      cycleTotal: analysis.cycle.total,
      projectionComplete: analysis.cycle.projectionComplete,
      coveredRemainingSteps: analysis.cycle.coveredTrainingSteps,
      remainingTrainingSteps: analysis.cycle.remainingTrainingSteps,
      readinessStatus: integrated.status,
      readinessTriggers: integrated.triggers,
    },
    actions: actions.sort((a, b) => b.priority - a.priority).slice(0, context === "home" ? 2 : 4),
  };
}
