import assert from "node:assert/strict";
import { inspectDataHealth } from "../lib/dataHealth";
import { exerciseTrackId, progressionSuggestion } from "../lib/prescription";
import { normalizeData, SCHEMA_VERSION, toBackup, type AppData } from "../lib/storage";
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
assert.equal(normalized.bodyWeights.length, 1);
assert.equal(new Set(normalized.customExercises.map((item) => item.id)).size, 2);
assert.equal(new Set((normalized.templates ?? []).map((item) => item.id)).size, 2);
assert.equal(normalized.schedule.microcycle?.[0].templateId, undefined);
assert.equal(inspectDataHealth(normalized).status, "healthy");

const backup = toBackup(normalized);
assert.equal(backup.version, SCHEMA_VERSION);
assert.equal(backup.version, 11);
assert.equal(backup.days["2026-07-01"].workout?.exercises[0].progressionTrackId, undefined);
assert.equal(backup.days["2026-07-01"].workout?.exercises[0].prescription?.progressionTrackId, "incline-strength");

console.log("data foundation tests passed");
