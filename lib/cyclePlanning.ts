import type { AppData } from "./storage";
import type {
  AppliedCycleTemplateChange,
  TemplateItem,
  TrainingCyclePhase,
} from "./types";
import { DEFAULT_EXERCISES } from "./exercises";
import {
  advanceTrainingCycle,
  currentMicrocycleProgress,
  shouldAdvanceMicrocycle,
} from "./microcycle";
import { normalizeTemplateItemPrescription } from "./prescription";
import { evaluateProgressionOutcome } from "./trainingExecution";
import { summarizeRecovery } from "./recovery";
import { buildTrainingAnalysis } from "./trainingAnalysis";
import {
  buildTrainingDecision,
  type TrainingDecisionAction,
} from "./trainingDecision";
import {
  buildTemplateAdjustmentProposal,
  type AdjustableAction,
} from "./templateAdjustment";

export type CycleReviewStatus = "notReady" | "ready" | "applied";
export type CycleReviewChangeReason = "simplifyPlan" | "reduceVolume" | "addVolume";

export interface CycleReviewTemplateChange extends AppliedCycleTemplateChange {
  templateName: string;
  exerciseName: string;
  reason: CycleReviewChangeReason;
}

export interface CycleReviewEvidence {
  completedSteps: number;
  totalSteps: number;
  confirmedSessions: number;
  hardSessions: number;
  difficultySamples: number;
  regressingExercises: number;
  overTargetMuscles: number;
  suggestionOutcomes: number;
  achievedSuggestions: number;
  partialSuggestions: number;
  missedSuggestions: number;
  queuedTemplateChanges: number;
  recoveryCheckIns: number;
  recoveryScore: number | null;
}

export interface CycleReview {
  id: string;
  sourceMicrocycleId: string;
  sourcePhase: TrainingCyclePhase;
  status: CycleReviewStatus;
  recommendedPhase: TrainingCyclePhase;
  recommendationReason: "recoveryEvidence" | "deloadComplete" | "continueBuild";
  blockingWorkoutDate?: string;
  changes: CycleReviewTemplateChange[];
  evidence: CycleReviewEvidence;
}

export interface ApplyCycleReviewResult {
  data: AppData;
  applied: boolean;
  reason?: "notReady" | "alreadyApplied" | "staleCycle" | "staleTemplates" | "invalidPhase";
}

/** A completed cycle must be reviewed before another current-cycle workout is created. */
export function requiresCycleReviewBeforeWorkout(data: AppData, today: string) {
  const currentId = data.microcycle?.currentId;
  if (!currentId || !shouldAdvanceMicrocycle(data, today)) return false;
  return data.lastCycleReview?.sourceMicrocycleId !== currentId;
}

function adjustableAction(action: TrainingDecisionAction): action is AdjustableAction {
  return action.kind === "simplifyPlan" || action.kind === "reduceVolume" || action.kind === "addVolume";
}

function cycleSuggestionOutcomes(data: AppData, microcycleId: string) {
  const totals = { total: 0, achieved: 0, partial: 0, missed: 0 };
  for (const day of Object.values(data.days)) {
    const workout = day.workout;
    if (!workout || workout.microcycleId !== microcycleId || workout.done !== true) continue;
    for (const exercise of workout.exercises) {
      if (!exercise.progressionPlan || exercise.progressionPlan.origin === "manual") continue;
      const outcome = evaluateProgressionOutcome(exercise, workout);
      if (outcome.status === "unassessable") continue;
      totals.total += 1;
      totals[outcome.status] += 1;
    }
  }
  return totals;
}

function queuedTemplateChangeCount(data: AppData) {
  const editable = new Map((data.templates ?? []).map((template) => [template.id, template]));
  const changed = new Set<string>();
  for (const step of data.microcycle?.steps ?? []) {
    if (!step.templateId || !step.templateSnapshot) continue;
    const current = editable.get(step.templateId);
    if (!current) continue;
    for (const item of step.templateSnapshot.items) {
      const next = current.items.find((candidate) => candidate.exerciseId === item.exerciseId);
      if (next && next.sets !== item.sets) changed.add(`${step.templateId}::${item.exerciseId}`);
    }
  }
  return changed.size;
}

function collectChanges(data: AppData, actions: AdjustableAction[]) {
  const changes: CycleReviewTemplateChange[] = [];
  const seen = new Set<string>();
  for (const action of actions) {
    const proposal = buildTemplateAdjustmentProposal(data, action);
    if (!proposal) continue;
    for (const change of proposal.changes) {
      const key = `${proposal.templateId}::${change.exerciseId}`;
      if (seen.has(key)) continue;
      const activeSnapshotItem = data.microcycle?.steps
        ?.find((step) => step.templateId === proposal.templateId)
        ?.templateSnapshot?.items.find((item) => item.exerciseId === change.exerciseId);
      const editableItem = data.templates
        ?.find((template) => template.id === proposal.templateId)
        ?.items.find((item) => item.exerciseId === change.exerciseId);
      // A difference from the frozen active-cycle snapshot is already queued
      // for the next cycle, whether it came from an accepted suggestion or a
      // manual template edit. Do not stack another automatic change on it.
      if (activeSnapshotItem && editableItem && activeSnapshotItem.sets !== editableItem.sets) continue;
      seen.add(key);
      changes.push({
        templateId: proposal.templateId,
        templateName: proposal.templateName,
        exerciseId: change.exerciseId,
        exerciseName: change.exerciseName,
        fromSets: change.fromSets,
        toSets: change.toSets,
        reason: action.kind,
      });
      if (changes.length >= 3) return changes;
    }
  }
  return changes;
}

export function buildCycleReview(data: AppData, today: string): CycleReview {
  const sourceMicrocycleId = data.microcycle?.currentId ?? "unassigned";
  const sourcePhase = data.microcycle?.phase ?? "build";
  const id = `cycle-review:${sourceMicrocycleId}`;
  const progress = currentMicrocycleProgress(data, today);
  const analysis = buildTrainingAnalysis(data, today);
  const recovery = summarizeRecovery(data.days, today);
  const outcomes = cycleSuggestionOutcomes(data, sourceMicrocycleId);
  const alreadyApplied = data.lastCycleReview?.id === id;
  const ready = Boolean(
    data.microcycle
      && shouldAdvanceMicrocycle(data, today)
      && !analysis.unclosed
      && !alreadyApplied,
  );
  const subjectiveRecoverySupport = recovery.sustainedLow && (
    analysis.load.hardSessions >= 2
    || analysis.recovery.regressingExercises > 0
    || analysis.recovery.overTargetMuscles > 0
  );
  const recoveryActive = analysis.recovery.active || subjectiveRecoverySupport;
  const recommendedPhase: TrainingCyclePhase = sourcePhase === "deload"
    ? "build"
    : recoveryActive ? "deload" : "build";
  const recommendationReason = sourcePhase === "deload"
    ? "deloadComplete"
    : recoveryActive ? "recoveryEvidence" : "continueBuild";

  let changes: CycleReviewTemplateChange[] = [];
  if (ready && sourcePhase !== "deload") {
    const decision = buildTrainingDecision(data, today, "review");
    const suppressAdditions = recoveryActive
      || Boolean(analysis.weakTemplate)
      || (outcomes.missed >= 2 && outcomes.missed > outcomes.achieved);
    const actions = decision.actions
      .filter(adjustableAction)
      .filter((action) => !suppressAdditions || action.kind !== "addVolume");
    changes = collectChanges(data, actions);
  }

  return {
    id,
    sourceMicrocycleId,
    sourcePhase,
    status: alreadyApplied ? "applied" : ready ? "ready" : "notReady",
    recommendedPhase,
    recommendationReason,
    ...(analysis.unclosed?.date ? { blockingWorkoutDate: analysis.unclosed.date } : {}),
    changes,
    evidence: {
      completedSteps: progress.completed,
      totalSteps: progress.pattern.length,
      confirmedSessions: analysis.load.sessions28d,
      hardSessions: analysis.load.hardSessions,
      difficultySamples: analysis.load.difficultySamples,
      regressingExercises: analysis.recovery.regressingExercises,
      overTargetMuscles: analysis.recovery.overTargetMuscles,
      suggestionOutcomes: outcomes.total,
      achievedSuggestions: outcomes.achieved,
      partialSuggestions: outcomes.partial,
      missedSuggestions: outcomes.missed,
      queuedTemplateChanges: queuedTemplateChangeCount(data),
      recoveryCheckIns: recovery.scoredDays7d,
      recoveryScore: recovery.average7d,
    },
  };
}

function changeSignature(change: AppliedCycleTemplateChange) {
  return `${change.templateId}::${change.exerciseId}:${change.fromSets}>${change.toSets}`;
}

function sameChanges(left: CycleReviewTemplateChange[], right: CycleReviewTemplateChange[]) {
  return left.length === right.length
    && left.map(changeSignature).sort().join("|") === right.map(changeSignature).sort().join("|");
}

function updateItemSets(item: TemplateItem, toSets: number, preset: (typeof DEFAULT_EXERCISES)[number] | AppData["customExercises"][number] | undefined) {
  return normalizeTemplateItemPrescription({
    ...item,
    sets: toSets,
    ...(item.prescription ? { prescription: { ...item.prescription, workingSets: toSets } } : {}),
  }, preset);
}

export function applyCycleReviewToData(
  data: AppData,
  review: CycleReview,
  date: string,
  phase: TrainingCyclePhase = review.recommendedPhase,
  appliedAt = new Date().toISOString(),
): ApplyCycleReviewResult {
  if (review.status !== "ready") return { data, applied: false, reason: review.status === "applied" ? "alreadyApplied" : "notReady" };
  if (data.lastCycleReview?.id === review.id) return { data, applied: false, reason: "alreadyApplied" };
  if (!data.microcycle || data.microcycle.currentId !== review.sourceMicrocycleId) return { data, applied: false, reason: "staleCycle" };
  if (data.microcycle.phase === "deload" && phase === "deload") return { data, applied: false, reason: "invalidPhase" };

  const current = buildCycleReview(data, date);
  if (current.status !== "ready" || current.id !== review.id) return { data, applied: false, reason: "staleCycle" };
  if (!sameChanges(current.changes, review.changes)) return { data, applied: false, reason: "staleTemplates" };

  const byKey = new Map(review.changes.map((change) => [`${change.templateId}::${change.exerciseId}`, change]));
  for (const change of review.changes) {
    const item = data.templates?.find((template) => template.id === change.templateId)?.items.find((entry) => entry.exerciseId === change.exerciseId);
    if (!item || item.sets !== change.fromSets) return { data, applied: false, reason: "staleTemplates" };
  }

  const presets = new Map([...DEFAULT_EXERCISES, ...data.customExercises].map((preset) => [preset.id, preset]));
  const templates = data.templates?.map((template) => ({
    ...template,
    items: template.items.map((item) => {
      const change = byKey.get(`${template.id}::${item.exerciseId}`);
      return change ? updateItemSets(item, change.toSets, presets.get(item.exerciseId)) : item;
    }),
  }));
  const withTemplates: AppData = { ...data, templates };
  const advanced = advanceTrainingCycle(withTemplates, date, phase, review.id);
  return {
    applied: true,
    data: {
      ...withTemplates,
      microcycle: advanced.microcycle,
      mesocycle: advanced.mesocycle,
      lastCycleReview: {
        id: review.id,
        sourceMicrocycleId: review.sourceMicrocycleId,
        appliedAt,
        nextPhase: phase,
        changes: review.changes.map(({ templateId, exerciseId, fromSets, toSets }) => ({ templateId, exerciseId, fromSets, toSets })),
      },
    },
  };
}
