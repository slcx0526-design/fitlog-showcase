import { workingSets } from "./trainingMetrics";
import {
  mergeTrainingPolicy,
  type ExercisePreference,
  type TrainingPolicy,
} from "./trainingPolicy";
import type { AppData, Exercise, TemplateItem, WorkoutSession } from "./types";

export type AdaptiveLearningSignalKind =
  | "avoidExercise"
  | "preferReplacement"
  | "shortenTemplate"
  | "reduceSessionLoad";

export interface AdaptiveLearningSignal {
  id: string;
  kind: AdaptiveLearningSignalKind;
  confidence: "medium" | "high";
  summary: string;
  evidence: string[];
  exerciseId?: string;
  replacementExerciseId?: string;
  templateId?: string;
  suggestedPatch: Partial<TrainingPolicy>;
}

interface CompletedSession {
  date: string;
  workout: WorkoutSession;
}

interface ExerciseExposure {
  exerciseId: string;
  name: string;
  exposures: number;
  completions: number;
  replacementCounts: Map<string, { count: number; name: string }>;
}

interface TemplateAdherence {
  templateId: string;
  templateName: string;
  sessions: number;
  completionRatios: number[];
  completedExerciseCounts: number[];
}

function completedSessions(data: AppData, limit = 18): CompletedSession[] {
  return Object.entries(data.days)
    .filter((entry): entry is [string, AppData["days"][string] & { workout: WorkoutSession }] => {
      const workout = entry[1].workout;
      return Boolean(workout?.done === true && workout.templateSnapshot?.items.length);
    })
    .sort(([left], [right]) => right.localeCompare(left))
    .slice(0, limit)
    .map(([date, day]) => ({ date, workout: day.workout }));
}

function performedExercise(exercise: Exercise | undefined) {
  return Boolean(exercise && workingSets(exercise.sets).length > 0);
}

function sameMovement(left: TemplateItem, right: Exercise) {
  if (left.movementPattern && right.movementPattern && left.movementPattern === right.movementPattern) return true;
  if (left.primaryMuscle && right.primaryMuscle && left.primaryMuscle === right.primaryMuscle) return true;
  return false;
}

function gatherEvidence(data: AppData) {
  const exposures = new Map<string, ExerciseExposure>();
  const templates = new Map<string, TemplateAdherence>();
  const sessions = completedSessions(data);

  for (const session of sessions) {
    const snapshot = session.workout.templateSnapshot;
    if (!snapshot) continue;
    const performed = session.workout.exercises.filter(performedExercise);
    const performedIds = new Set(performed.map((exercise) => exercise.id));
    const snapshotIds = new Set(snapshot.items.map((item) => item.exerciseId));
    const completedCount = snapshot.items.filter((item) => performedIds.has(item.exerciseId)).length;
    const ratio = snapshot.items.length ? completedCount / snapshot.items.length : 1;
    const template = templates.get(snapshot.id) ?? {
      templateId: snapshot.id,
      templateName: snapshot.name,
      sessions: 0,
      completionRatios: [],
      completedExerciseCounts: [],
    };
    template.sessions += 1;
    template.completionRatios.push(ratio);
    template.completedExerciseCounts.push(completedCount);
    templates.set(snapshot.id, template);

    for (const item of snapshot.items) {
      const current = exposures.get(item.exerciseId) ?? {
        exerciseId: item.exerciseId,
        name: item.name,
        exposures: 0,
        completions: 0,
        replacementCounts: new Map<string, { count: number; name: string }>(),
      };
      current.exposures += 1;
      if (performedIds.has(item.exerciseId)) {
        current.completions += 1;
      } else {
        const replacement = performed.find((exercise) => !snapshotIds.has(exercise.id) && sameMovement(item, exercise));
        if (replacement) {
          const count = current.replacementCounts.get(replacement.id) ?? { count: 0, name: replacement.name };
          count.count += 1;
          current.replacementCounts.set(replacement.id, count);
        }
      }
      exposures.set(item.exerciseId, current);
    }
  }

  return { exposures, templates, sessions };
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function exercisePreferencePatch(
  policy: TrainingPolicy,
  values: Record<string, ExercisePreference>,
): Partial<TrainingPolicy> {
  return { exercisePreferences: { ...policy.exercisePreferences, ...values } };
}

export function deriveAdaptiveLearningSignals(
  data: AppData,
  policy: TrainingPolicy,
): AdaptiveLearningSignal[] {
  const evidence = gatherEvidence(data);
  const signals: AdaptiveLearningSignal[] = [];
  const hidden = new Set([...policy.confirmedLearningSignalIds, ...policy.dismissedLearningSignalIds]);

  for (const exposure of evidence.exposures.values()) {
    const completionRate = exposure.exposures ? exposure.completions / exposure.exposures : 1;
    const replacement = [...exposure.replacementCounts.entries()]
      .sort((left, right) => right[1].count - left[1].count)[0];

    if (replacement && replacement[1].count >= 2 && exposure.exposures >= 3) {
      const id = `replacement:${exposure.exerciseId}:${replacement[0]}`;
      if (!hidden.has(id)) {
        signals.push({
          id,
          kind: "preferReplacement",
          confidence: replacement[1].count >= 3 ? "high" : "medium",
          summary: `你经常用${replacement[1].name}替代${exposure.name}`,
          evidence: [
            `最近 ${exposure.exposures} 次计划出现 ${exposure.name}`,
            `其中 ${replacement[1].count} 次改为 ${replacement[1].name}`,
          ],
          exerciseId: exposure.exerciseId,
          replacementExerciseId: replacement[0],
          suggestedPatch: exercisePreferencePatch(policy, {
            [exposure.exerciseId]: "avoid",
            [replacement[0]]: "prefer",
          }),
        });
      }
      continue;
    }

    if (exposure.exposures >= 3 && completionRate <= 0.34) {
      const id = `avoid:${exposure.exerciseId}`;
      if (!hidden.has(id) && policy.exercisePreferences[exposure.exerciseId] !== "exclude") {
        signals.push({
          id,
          kind: "avoidExercise",
          confidence: exposure.exposures >= 5 ? "high" : "medium",
          summary: `${exposure.name}在计划中经常未执行`,
          evidence: [
            `计划出现 ${exposure.exposures} 次`,
            `实际完成 ${exposure.completions} 次`,
          ],
          exerciseId: exposure.exerciseId,
          suggestedPatch: exercisePreferencePatch(policy, { [exposure.exerciseId]: "avoid" }),
        });
      }
    }
  }

  for (const template of evidence.templates.values()) {
    const adherence = average(template.completionRatios);
    if (template.sessions < 3 || adherence >= 0.7) continue;
    const id = `shorten:${template.templateId}`;
    if (hidden.has(id)) continue;
    const completedExercises = Math.max(3, Math.round(median(template.completedExerciseCounts)));
    signals.push({
      id,
      kind: "shortenTemplate",
      confidence: template.sessions >= 5 ? "high" : "medium",
      summary: `${template.templateName}经常无法完整执行`,
      evidence: [
        `最近 ${template.sessions} 次平均完成 ${Math.round(adherence * 100)}% 的计划动作`,
        `通常完成约 ${completedExercises} 个动作`,
      ],
      templateId: template.templateId,
      suggestedPatch: {
        maxExercisesPerSession: Math.min(policy.maxExercisesPerSession, completedExercises + 1),
      },
    });
  }

  const recentSessions = evidence.sessions.slice(0, 5);
  const recentHard = recentSessions.filter((session) => session.workout.difficulty === "hard").length;
  if (recentSessions.length >= 5 && recentHard >= 3) {
    const id = "load:repeated-hard-sessions";
    if (!hidden.has(id)) {
      signals.push({
        id,
        kind: "reduceSessionLoad",
        confidence: recentHard >= 4 ? "high" : "medium",
        summary: "近期多数训练被标记为偏难",
        evidence: [`最近 5 次训练中有 ${recentHard} 次偏难`],
        suggestedPatch: {
          maxWorkingSetsPerSession: Math.max(6, policy.maxWorkingSetsPerSession - 2),
        },
      });
    }
  }

  return signals.sort((left, right) => {
    const confidence = Number(right.confidence === "high") - Number(left.confidence === "high");
    return confidence || left.summary.localeCompare(right.summary);
  });
}

export function acceptAdaptiveLearningSignal(
  policy: TrainingPolicy,
  signal: AdaptiveLearningSignal,
  now = new Date().toISOString(),
) {
  return mergeTrainingPolicy(policy, {
    ...signal.suggestedPatch,
    confirmedLearningSignalIds: [...policy.confirmedLearningSignalIds, signal.id],
    decisionEvents: [
      ...policy.decisionEvents,
      {
        id: `decision_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        at: now,
        proposalId: signal.id,
        outcome: "learningAccepted",
        summary: signal.summary,
      },
    ],
  }, now);
}

export function dismissAdaptiveLearningSignal(
  policy: TrainingPolicy,
  signal: AdaptiveLearningSignal,
  now = new Date().toISOString(),
) {
  return mergeTrainingPolicy(policy, {
    dismissedLearningSignalIds: [...policy.dismissedLearningSignalIds, signal.id],
    decisionEvents: [
      ...policy.decisionEvents,
      {
        id: `decision_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        at: now,
        proposalId: signal.id,
        outcome: "learningDismissed",
        summary: signal.summary,
      },
    ],
  }, now);
}
