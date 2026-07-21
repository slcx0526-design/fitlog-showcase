import assert from "node:assert/strict";
import { inspectDataHealth } from "../lib/dataHealth";
import { DEFAULT_EXERCISES, searchExercisePreset } from "../lib/exercises";
import { exerciseTrackId, progressionSuggestion } from "../lib/prescription";
import { progressionPresentation } from "../lib/progressionPresentation";
import { normalizeData, SCHEMA_VERSION, toBackup, type AppData } from "../lib/storage";
import { moveTemplateWithinType } from "../lib/templates";
import {
  setCompletionCredit,
  setStimulusFactor,
  progressionSets,
  summarizeExerciseWork,
  summarizeWorkoutWork,
  workingSets,
} from "../lib/trainingMetrics";
import type { Exercise, SetRecord } from "../lib/types";

const sets: SetRecord[] = [
  { weight: 80, reps: 8, type: "working", completion: "completed" },
  { weight: 80, reps: 6, type: "working", completion: "partial" },
  { weight: 80, reps: 0, type: "working" },
  { weight: 40, reps: 10, type: "warmup" },
  { weight: 60, reps: 10, type: "working", completion: "skipped" },
  { weight: 20, reps: 15, type: "working", technique: "rehab" },
  { weight: 0, reps: 0, durationSeconds: 45, type: "working" },
];

assert.equal(workingSets(sets).length, 3);
assert.equal(progressionSets(sets).length, 2);
assert.equal(setCompletionCredit(sets[0]), 1);
assert.equal(setCompletionCredit(sets[1]), 0.5);
assert.equal(setCompletionCredit(sets[4]), 0);
assert.equal(setStimulusFactor({ ...sets[0], technique: "dropSet" }), 1.25);
assert.equal(setStimulusFactor({ ...sets[1], technique: "technique" }), 0.25);
assert.equal(progressionSets([{ weight: 80, reps: 8, completion: "partial" }, { weight: 70, reps: 12, technique: "dropSet" }]).length, 0);

const exercise: Exercise = {
  id: "px_incline_barbell",
  name: "上斜杠铃卧推",
  isMain: true,
  sets,
  planned: { sets: 3, repsLow: 4, repsHigh: 6 },
};
const partialProgression = progressionSuggestion({
  progressionTrackId: "bench-hypertrophy",
  progressionTrackLabel: "增肌 · 8–10 次",
  trainingIntent: "hypertrophy",
  targetRepMin: 8,
  targetRepMax: 10,
  workingSets: 2,
  loadIncrementKg: 2.5,
  progressionRule: "doubleProgression",
}, {
  date: "2026-07-01",
  kind: "same",
  exercise,
  sets: [
    { weight: 70, reps: 10, completion: "completed" },
    { weight: 70, reps: 10, completion: "partial" },
  ],
});
assert.equal(partialProgression.status, "finishSets");
const plannedSetProgression = progressionSuggestion({
  progressionTrackId: "bench-hypertrophy",
  progressionTrackLabel: "增肌 · 8–10 次",
  trainingIntent: "hypertrophy",
  targetRepMin: 8,
  targetRepMax: 10,
  workingSets: 2,
  loadIncrementKg: 2.5,
  progressionRule: "doubleProgression",
}, {
  date: "2026-07-02",
  kind: "same",
  exercise,
  sets: [
    { weight: 80, reps: 10 },
    { weight: 80, reps: 10 },
    { weight: 50, reps: 15 },
  ],
});
assert.equal(plannedSetProgression.status, "addWeight");
assert.equal(plannedSetProgression.nextWeight, 82.5, "Extra back-off sets must not become the load baseline");
const mixedLoadProgression = progressionSuggestion({
  progressionTrackId: "bench-hypertrophy",
  progressionTrackLabel: "增肌 · 8–10 次",
  trainingIntent: "hypertrophy",
  targetRepMin: 8,
  targetRepMax: 10,
  workingSets: 2,
  loadIncrementKg: 2.5,
  progressionRule: "doubleProgression",
}, {
  date: "2026-07-03",
  kind: "same",
  exercise,
  sets: [{ weight: 80, reps: 10 }, { weight: 77.5, reps: 10 }],
});
assert.equal(mixedLoadProgression.status, "mixedLoads");
assert.equal(mixedLoadProgression.nextWeight, null, "Mixed planned loads must not produce an arbitrary baseline");
const mixedLoadCopy = progressionPresentation(mixedLoadProgression, {
  progressionTrackId: "bench-hypertrophy",
  progressionTrackLabel: "增肌 · 8–10 次",
  trainingIntent: "hypertrophy",
  targetRepMin: 8,
  targetRepMax: 10,
  workingSets: 2,
  loadIncrementKg: 2.5,
  progressionRule: "doubleProgression",
}, "reps", "en");
assert.equal(mixedLoadCopy.value, "Choose baseline");
assert.match(mixedLoadCopy.summary, /mixed loads/i, "Presentation must explain why no baseline was chosen");
assert.equal(mixedLoadCopy.tone, "warn");
const missingLoadProgression = progressionSuggestion({
  progressionTrackId: "bench-hypertrophy",
  progressionTrackLabel: "增肌 · 8–10 次",
  trainingIntent: "hypertrophy",
  targetRepMin: 8,
  targetRepMax: 10,
  workingSets: 2,
  loadIncrementKg: 2.5,
  progressionRule: "doubleProgression",
}, {
  date: "2026-07-04",
  kind: "same",
  exercise,
  sets: [{ weight: 80, reps: 10 }, { weight: 0, reps: 10 }],
});
assert.equal(missingLoadProgression.status, "missingLoad");
assert.equal(missingLoadProgression.nextWeight, null, "Missing load data must never become a load recommendation");
const bodyweightProgression = progressionSuggestion({
  progressionTrackId: "pullup-reps",
  progressionTrackLabel: "增肌 · 8–10 次",
  trainingIntent: "hypertrophy",
  targetRepMin: 8,
  targetRepMax: 10,
  workingSets: 2,
  loadIncrementKg: 0,
  progressionRule: "repsFirst",
}, {
  date: "2026-07-04",
  kind: "same",
  exercise: { ...exercise, id: "pullup", name: "引体向上", recordModes: ["reps"] },
  sets: [{ weight: 0, reps: 10 }, { weight: 0, reps: 10 }],
});
assert.equal(bodyweightProgression.status, "manualProgression", "Zero-increment tracks should offer a manual next step at the ceiling");
const durationProgression = progressionSuggestion({
  progressionTrackId: "plank-duration",
  progressionTrackLabel: "时长 · 30–60 秒",
  trainingIntent: "custom",
  targetRepMin: 30,
  targetRepMax: 60,
  workingSets: 2,
  loadIncrementKg: 0,
  progressionRule: "doubleProgression",
  performanceMode: "duration",
}, {
  date: "2026-07-04",
  kind: "same",
  exercise: { ...exercise, id: "plank", name: "平板支撑", recordModes: ["duration"] },
  sets: [{ weight: 0, reps: 0, durationSeconds: 60 }, { weight: 0, reps: 0, durationSeconds: 60 }],
});
assert.equal(durationProgression.status, "manualProgression", "Duration tracks should recognize their own target ceiling");
const exerciseSummary = summarizeExerciseWork(exercise);
assert.equal(exerciseSummary.workingSets, 3);
assert.equal(exerciseSummary.completionCredits, 2.5);
assert.equal(exerciseSummary.rehabSets, 1);
assert.equal(exerciseSummary.draftSets, 1);

const workoutSummary = summarizeWorkoutWork({
  type: "push",
  exercises: [
    { ...exercise, sets: [sets[0]] },
    {
      id: "extra",
      name: "额外动作",
      isMain: false,
      sets: Array.from({ length: 5 }, () => ({ weight: 10, reps: 10 })),
    },
  ],
});
assert.equal(workoutSummary.plannedSets, 3);
assert.equal(workoutSummary.completionCredits, 1, "Unplanned work must not fill missing planned sets");
assert.equal(workoutSummary.completionPct, 33);

const raw = {
  app: "fitlog",
  version: 10,
  days: {
    "2026-07-01": {
      date: "2026-07-01",
      recovery: { sleepHours: 7.5, sleepQuality: 4, energy: 4, soreness: 2, stress: 2, at: "2026-07-01T08:00:00.000Z" },
      workout: {
        type: "push",
        done: true,
        exercises: [{
          id: "px_incline_barbell",
          name: "上斜杠铃卧推",
          isMain: true,
          sets: [{ weight: 80, reps: 5, type: "working" }],
          progressionTrackId: "incline-strength",
          progressionTrackLabel: "力量 · 4–6 次",
          trainingIntent: "strength",
          targetRepMin: 4,
          targetRepMax: 6,
          workingSets: 4,
          loadIncrementKg: 2.5,
          progressionRule: "doubleProgression",
        }],
      },
    },
  },
  bodyWeights: [
    { date: "2026-07-01", weight: 80 },
    { date: "2026-07-01", weight: 79.8 },
  ],
  waistEntries: [],
  favoriteExerciseIds: ["px_incline_barbell", "px_incline_barbell", "cx_same"],
  customExercises: [
    { id: "cx_same", name: "动作 A", isMain: false, type: "custom" },
    { id: "cx_same", name: "动作 B", isMain: false, type: "custom" },
  ],
  templates: [
    {
      id: "tpl_push",
      name: "胸重量日",
      type: "push",
      items: [{
        exerciseId: "px_incline_barbell",
        name: "上斜杠铃卧推",
        sets: 4,
        repsLow: 4,
        repsHigh: 6,
        progressionTrackId: "incline-strength",
        progressionTrackLabel: "力量 · 4–6 次",
        trainingIntent: "strength",
        loadIncrementKg: 2.5,
      }],
    },
    { id: "tpl_push", name: "重复模板", type: "push", items: [] },
  ],
  schedule: {
    split: ["push", "pull", "legs", "rest", "push", "pull", "rest"],
    microcycle: [{ id: "step_1", type: "push", label: "推", templateId: "missing_template" }],
  },
} as unknown as AppData;

const unhealthy = inspectDataHealth(raw);
assert.equal(unhealthy.status, "attention");
assert.ok(unhealthy.issueCount >= 5);

const normalized = normalizeData(raw);
assert.equal(normalized.days["2026-07-01"]?.workout?.exercises[0]?.planned, undefined);
const normalizedExercise = normalized.days["2026-07-01"].workout!.exercises[0];
assert.equal(exerciseTrackId(normalizedExercise), "incline-strength");
assert.equal(normalizedExercise.prescription?.trainingIntent, "strength");
assert.equal(normalizedExercise.prescription?.targetRepMin, 4);
assert.equal(normalizedExercise.progressionTrackId, undefined);
assert.equal(normalizedExercise.trainingIntent, undefined);
assert.equal(normalized.templates?.[0].items[0].prescription?.workingSets, 4);
assert.equal(normalized.templates?.[0].items[0].progressionTrackId, undefined);
assert.equal(normalized.templates?.[0].items[0].primaryMuscle, "upperChest");
assert.equal(normalized.templates?.[0].items[0].isMain, true);
assert.ok(normalized.templates?.[0].items[0].volumeContributions?.some((item) => item.muscle === "upperChest" && item.direct));
assert.equal(normalized.bodyWeights.length, 1);
assert.deepEqual(normalized.days["2026-07-01"].recovery, { sleepHours: 7.5, sleepQuality: 4, energy: 4, soreness: 2, stress: 2, at: "2026-07-01T08:00:00.000Z" });
assert.deepEqual(normalized.favoriteExerciseIds, ["px_incline_barbell", "cx_same"]);
assert.equal(new Set(normalized.customExercises.map((item) => item.id)).size, 2);
assert.equal(new Set((normalized.templates ?? []).map((item) => item.id)).size, 2);
assert.equal(normalized.schedule.microcycle?.[0].templateId, undefined);
assert.equal(inspectDataHealth(normalized).status, "healthy");

const backup = toBackup(normalized);
assert.equal(backup.version, SCHEMA_VERSION);
assert.equal(backup.version, 14);
assert.deepEqual(backup.favoriteExerciseIds, ["px_incline_barbell", "cx_same"]);
assert.equal(backup.days["2026-07-01"].workout?.exercises[0].progressionTrackId, undefined);
assert.equal(backup.days["2026-07-01"].workout?.exercises[0].prescription?.progressionTrackId, "incline-strength");
assert.ok(backup.mesocycle, "Schema 14 backups include mesocycle state");
assert.equal(backup.days["2026-07-01"].recovery?.energy, 4, "Schema 14 backups preserve recovery check-ins");

const legacyPlannedLoad = normalizeData({
  days: {
    "2026-07-10": {
      date: "2026-07-10",
      workout: {
        type: "push",
        done: true,
        exercises: [{ id: "px_barbell_bench", name: "卧推", isMain: true, plannedLoadKg: 80, sets: [{ weight: 80, reps: 8 }] }],
      },
    },
  },
  bodyWeights: [],
  waistEntries: [],
  customExercises: [],
  schedule: { split: ["push", "pull", "legs", "rest", "push", "pull", "rest"] },
});
assert.equal(legacyPlannedLoad.days["2026-07-10"].workout?.exercises[0].plannedLoadKg, 80);
assert.equal(legacyPlannedLoad.days["2026-07-10"].workout?.exercises[0].progressionPlan, undefined, "Old planned loads must not be relabeled as accepted system suggestions");

const acceptedPlanRoundTrip = normalizeData({
  ...legacyPlannedLoad,
  days: {
    "2026-07-10": {
      ...legacyPlannedLoad.days["2026-07-10"],
      workout: {
        ...legacyPlannedLoad.days["2026-07-10"].workout,
        completedAt: "2026-07-10T10:00:00.000Z",
        cyclePhase: "build",
        exercises: [{
          ...legacyPlannedLoad.days["2026-07-10"].workout!.exercises[0],
          progressionPlan: {
            origin: "suggestion",
            acceptedAt: "2026-07-10T09:00:00.000Z",
            progressionTrackId: "legacy:px_barbell_bench",
            plannedLoadKg: 80,
            sourceDate: "2026-07-03",
            suggestedLoadKg: 80,
            suggestionStatus: "addReps",
          },
        }],
      },
    },
  },
});
assert.equal(acceptedPlanRoundTrip.days["2026-07-10"].workout?.completedAt, "2026-07-10T10:00:00.000Z");
assert.equal(acceptedPlanRoundTrip.days["2026-07-10"].workout?.exercises[0].progressionPlan?.origin, "suggestion");
assert.equal(toBackup(acceptedPlanRoundTrip).days["2026-07-10"].workout?.exercises[0].progressionPlan?.suggestionStatus, "addReps");

assert.ok(DEFAULT_EXERCISES.length >= 70, "The built-in library should cover common gym movements");
const builtInIds = new Set(DEFAULT_EXERCISES.map((preset) => preset.id));
assert.equal(builtInIds.size, DEFAULT_EXERCISES.length, "Built-in ids must be unique");
for (const preset of DEFAULT_EXERCISES) {
  assert.ok(preset.name && preset.englishName, `${preset.id} needs Chinese and English names`);
  assert.ok(preset.primaryMuscle, `${preset.id} needs a primary muscle`);
  assert.ok(preset.volumeContributions?.length, `${preset.id} needs volume contributions`);
  assert.ok(preset.equipment && preset.movementPattern, `${preset.id} needs equipment and movement pattern`);
  assert.ok(preset.recordModes?.length, `${preset.id} needs record modes`);
  assert.equal(typeof preset.defaultLoadIncrementKg, "number", `${preset.id} needs a default load increment`);
  for (const alternativeId of preset.alternatives ?? []) assert.ok(builtInIds.has(alternativeId), `${preset.id} references missing alternative ${alternativeId}`);
}
assert.equal(searchExercisePreset(DEFAULT_EXERCISES.find((preset) => preset.id === "px_barbell_bench")!, "bench press"), true);
assert.equal(searchExercisePreset(DEFAULT_EXERCISES.find((preset) => preset.id === "px_barbell_bench")!, "杠铃 卧推"), true);
assert.equal(searchExercisePreset(DEFAULT_EXERCISES.find((preset) => preset.id === "px_chest_press")!, "hammer chest"), true);

const interleavedTemplates = [
  { id: "push_a", name: "A", type: "push" as const, items: [] },
  { id: "pull_a", name: "P", type: "pull" as const, items: [] },
  { id: "push_b", name: "B", type: "push" as const, items: [] },
];
assert.deepEqual(moveTemplateWithinType(interleavedTemplates, "push_b", -1).map((template) => template.id), ["push_b", "pull_a", "push_a"]);
assert.equal(moveTemplateWithinType(interleavedTemplates, "push_a", -1), interleavedTemplates, "A blocked move should keep referential equality");

const customTemplate = normalizeData({
  days: {}, bodyWeights: [], waistEntries: [],
  customExercises: [{ id: "legacy_custom_press", name: "自定义推胸", type: "custom", isMain: false, primaryMuscle: "chest", volumeContributions: [{ muscle: "chest", weight: 1, direct: true }] }],
  templates: [{ id: "custom_template", name: "自定义模板", type: "push", items: [{ exerciseId: "legacy_custom_press", name: "自定义推胸", sets: 3, repsLow: 8, repsHigh: 12 }] }],
  schedule: { split: ["push", "pull", "legs", "rest", "push", "pull", "rest"] },
});
assert.equal(customTemplate.customExercises[0].custom, true, "Imported custom exercises remain editable regardless of id convention");
const afterCustomDeletion = normalizeData({ ...customTemplate, customExercises: [] });
assert.equal(afterCustomDeletion.templates?.[0].items[0].primaryMuscle, "chest");
assert.equal(afterCustomDeletion.templates?.[0].items[0].volumeContributions?.[0].weight, 1, "Template snapshots survive custom-library deletion");

console.log("data foundation tests passed");
