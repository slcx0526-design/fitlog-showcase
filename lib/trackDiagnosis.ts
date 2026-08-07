import {
  exercisePrescription,
  progressionSuggestion,
  type ExerciseTrackTrendSummary,
  type ProgressionSuggestion,
} from "./prescription";

export type TrackConstraint = "onTrack" | "prescription" | "readiness" | "sessionEffort" | "exerciseOrder" | "muscleVolume" | "unresolved";
export type TrackIntervention = "addLoad" | "addReps" | "finishSets" | "stabilize" | "holdLoad" | "restoreOrder" | "reduceVolume" | "observe";
export type TrackDiagnosisConfidence = "building" | "ready";

export interface TrackDiagnosisContext {
  recoveryPressure?: boolean;
  readinessStatus?: "caution" | "recover";
  volume?: {
    current: number;
    targetHigh: number;
    overTarget: boolean;
  };
}

export interface TrackDiagnosis {
  constraint: TrackConstraint;
  intervention: TrackIntervention;
  confidence: TrackDiagnosisConfidence;
  progressionStatus: ProgressionSuggestion["status"];
  difficultySamples: number;
  hardSessions: number;
  latestPosition: number | null;
  priorTypicalPosition: number | null;
  readinessStatus: TrackDiagnosisContext["readinessStatus"] | null;
  volume?: TrackDiagnosisContext["volume"];
  recheckSessions: 1 | 2;
}

function interventionFor(status: ProgressionSuggestion["status"]): TrackIntervention {
  if (status === "addWeight") return "addLoad";
  if (status === "addReps") return "addReps";
  if (status === "finishSets") return "finishSets";
  if (status === "stabilize" || status === "effortCheck") return "stabilize";
  return "observe";
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/**
 * Selects one evidenced constraint for a track. It does not claim causation or
 * mutate a prescription; the user validates the intervention in later sessions.
 */
export function diagnoseTrackTrend(
  summary: ExerciseTrackTrendSummary,
  context: TrackDiagnosisContext = {},
): TrackDiagnosis {
  const latest = summary.histories[0];
  const suggestion = progressionSuggestion(latest ? exercisePrescription(latest.exercise) : undefined, latest ?? null);
  const recent = summary.histories.slice(0, 3);
  const difficulty = recent.filter((history) => history.sessionDifficulty != null);
  const hardSessions = difficulty.filter((history) => history.sessionDifficulty === "hard").length;
  const latestPosition = latest?.exercisePosition ?? null;
  const priorTypicalPosition = median(
    recent.slice(1).flatMap((history) => history.exercisePosition == null ? [] : [history.exercisePosition]),
  );
  const movedLater = latestPosition != null
    && priorTypicalPosition != null
    && latestPosition - priorTypicalPosition >= 2;
  const declining = summary.trend.status === "regressing";
  const stalled = summary.trend.status === "plateau";
  const recoverySupported = declining && (
    (difficulty.length >= 2 && hardSessions >= 2)
    || (context.recoveryPressure === true && hardSessions >= 1)
  );

  let constraint: TrackConstraint = "unresolved";
  let intervention: TrackIntervention = "observe";
  let recheckSessions: 1 | 2 = 2;

  if (context.readinessStatus) {
    constraint = "readiness";
    intervention = "holdLoad";
    recheckSessions = 1;
  } else if (summary.trend.status === "improving" || summary.trend.status === "stable") {
    constraint = "onTrack";
    intervention = interventionFor(suggestion.status);
    recheckSessions = 1;
  } else if (recoverySupported) {
    constraint = "sessionEffort";
    intervention = "holdLoad";
    recheckSessions = 1;
  } else if (declining && context.volume?.overTarget) {
    constraint = "muscleVolume";
    intervention = "reduceVolume";
    recheckSessions = 1;
  } else if ((declining || stalled) && movedLater) {
    constraint = "exerciseOrder";
    intervention = "restoreOrder";
    recheckSessions = 1;
  } else if (declining || stalled) {
    const prescribed = interventionFor(suggestion.status);
    if (prescribed !== "observe") {
      constraint = suggestion.status === "addWeight" ? "onTrack" : "prescription";
      intervention = prescribed;
      recheckSessions = 1;
    }
  }

  const confidence: TrackDiagnosisConfidence = summary.trend.sessionCount >= 3 && (
    constraint === "onTrack"
    || constraint === "prescription"
    || recoverySupported
    || movedLater
    || context.volume?.overTarget === true
  ) ? "ready" : "building";

  return {
    constraint,
    intervention,
    confidence,
    progressionStatus: suggestion.status,
    difficultySamples: difficulty.length,
    hardSessions,
    latestPosition,
    priorTypicalPosition,
    readinessStatus: context.readinessStatus ?? null,
    ...(context.volume ? { volume: context.volume } : {}),
    recheckSessions,
  };
}
