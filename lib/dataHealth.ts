import type { AppData, Exercise, TemplateItem } from "./types";
import { exerciseTrackId } from "./prescription";
import { hasRecordedTrainingWork, summarizeWorkoutWork } from "./trainingMetrics";

export type DataHealthIssueCode =
  | "duplicateCustomExerciseIds"
  | "duplicateTemplateIds"
  | "danglingTemplateBindings"
  | "nonCanonicalExercisePrescriptions"
  | "nonCanonicalTemplatePrescriptions"
  | "invalidSetValues"
  | "duplicateBodyDates";

export interface DataHealthIssue {
  code: DataHealthIssueCode;
  count: number;
  label: string;
}

export interface DataHealthReport {
  status: "healthy" | "attention";
  issueCount: number;
  issues: DataHealthIssue[];
  totals: {
    trainingSessions: number;
    workingSets: number;
    draftSets: number;
    unfinishedSessions: number;
    legacyTrackExercises: number;
  };
}

const LEGACY_EXERCISE_FIELDS: (keyof Exercise)[] = [
  "planned",
  "basePlannedSets",
  "progressionTrackId",
  "progressionTrackLabel",
  "trainingIntent",
  "targetRepMin",
  "targetRepMax",
  "targetRirMin",
  "targetRirMax",
  "workingSets",
  "loadIncrementKg",
  "progressionRule",
];

const LEGACY_TEMPLATE_FIELDS: (keyof TemplateItem)[] = [
  "progressionTrackId",
  "progressionTrackLabel",
  "trainingIntent",
  "targetRirMin",
  "targetRirMax",
  "loadIncrementKg",
  "progressionRule",
];

function duplicateCount(values: string[]) {
  return values.length - new Set(values).size;
}

function hasLegacyValue<T extends object>(value: T, keys: (keyof T)[]) {
  return keys.some((key) => value[key] !== undefined);
}

function invalidSetCount(data: AppData) {
  let count = 0;
  for (const day of Object.values(data.days)) {
    for (const exercise of day.workout?.exercises ?? []) {
      for (const set of exercise.sets) {
        const values = [set.weight, set.reps, set.durationSeconds, set.distanceMeters].filter(
          (item): item is number => item !== undefined
        );
        if (values.some((item) => !Number.isFinite(item) || item < 0)) count += 1;
      }
    }
  }
  return count;
}

export function inspectDataHealth(data: AppData): DataHealthReport {
  const issues: DataHealthIssue[] = [];
  const customDuplicates = duplicateCount(data.customExercises.map((exercise) => exercise.id));
  const templateDuplicates = duplicateCount((data.templates ?? []).map((template) => template.id));
  const templateIds = new Set((data.templates ?? []).map((template) => template.id));
  const bindings = [
    ...(data.schedule.microcycle ?? []).flatMap((step) => step.templateId ? [step.templateId] : []),
    ...(data.microcycle?.steps ?? []).flatMap((step) => step.templateId ? [step.templateId] : []),
    ...Object.values(data.cutPlan?.trainingTemplateIds ?? {}),
  ];
  const danglingBindings = bindings.filter((id) => !templateIds.has(id)).length;
  const weightDuplicates = duplicateCount(data.bodyWeights.map((entry) => entry.date));
  const waistDuplicates = duplicateCount(data.waistEntries.map((entry) => entry.date));

  let nonCanonicalExercises = 0;
  let nonCanonicalTemplates = 0;
  let trainingSessions = 0;
  let workingSetCount = 0;
  let draftSets = 0;
  let unfinishedSessions = 0;
  let legacyTrackExercises = 0;

  for (const day of Object.values(data.days)) {
    const workout = day.workout;
    if (!workout) continue;
    const summary = summarizeWorkoutWork(workout);
    if (hasRecordedTrainingWork(workout)) trainingSessions += 1;
    if (workout.done === false && summary.workingSets > 0) unfinishedSessions += 1;
    workingSetCount += summary.workingSets;
    draftSets += summary.draftSets;
    for (const exercise of workout.exercises) {
      if (!exercise.prescription || hasLegacyValue(exercise, LEGACY_EXERCISE_FIELDS)) {
        nonCanonicalExercises += 1;
      }
      if (exerciseTrackId(exercise).startsWith("legacy:")) legacyTrackExercises += 1;
    }
  }

  for (const template of data.templates ?? []) {
    for (const item of template.items) {
      const prescription = item.prescription;
      if (
        !prescription ||
        hasLegacyValue(item, LEGACY_TEMPLATE_FIELDS) ||
        prescription.workingSets !== item.sets ||
        prescription.targetRepMin !== item.repsLow ||
        prescription.targetRepMax !== item.repsHigh
      ) {
        nonCanonicalTemplates += 1;
      }
    }
  }

  const invalidSets = invalidSetCount(data);
  const add = (code: DataHealthIssueCode, count: number, label: string) => {
    if (count > 0) issues.push({ code, count, label });
  };
  add("duplicateCustomExerciseIds", customDuplicates, "重复的自定义动作标识");
  add("duplicateTemplateIds", templateDuplicates, "重复的模板标识");
  add("danglingTemplateBindings", danglingBindings, "失效的周期模板绑定");
  add("nonCanonicalExercisePrescriptions", nonCanonicalExercises, "待统一的训练处方快照");
  add("nonCanonicalTemplatePrescriptions", nonCanonicalTemplates, "待统一的模板处方");
  add("invalidSetValues", invalidSets, "异常的训练组数值");
  add("duplicateBodyDates", weightDuplicates + waistDuplicates, "重复日期的身体记录");

  const issueCount = issues.reduce((sum, issue) => sum + issue.count, 0);
  return {
    status: issueCount > 0 ? "attention" : "healthy",
    issueCount,
    issues,
    totals: {
      trainingSessions,
      workingSets: workingSetCount,
      draftSets,
      unfinishedSessions,
      legacyTrackExercises,
    },
  };
}
