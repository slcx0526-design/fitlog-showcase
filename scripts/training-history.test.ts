import assert from "node:assert/strict";
import { inspectDataHealth } from "../lib/dataHealth";
import { analyzeTrackTrend, findTrackHistories, type TrackHistoryResult } from "../lib/prescription";
import {
  buildTrainingHistoryIndex,
  createTrainingHistoryIndexCache,
  findIndexedLastNutrition,
  findIndexedLastWorkoutByType,
  findIndexedTrackHistories,
} from "../lib/historyIndex";
import { normalizeData } from "../lib/storage";
import {
  buildExerciseTrackArchive,
  dayHasLogContent,
  daySearchText,
  filterExerciseTrackArchive,
  summarizeTrainingWindow,
  workoutLogState,
} from "../lib/trainingHistory";
import type { AppData, DayLog, Exercise, ProgressionPrescription, SetRecord } from "../lib/types";

const strength: ProgressionPrescription = {
  progressionTrackId: "incline-strength-2x4-6",
  progressionTrackLabel: "力量 · 4–6 次",
  trainingIntent: "strength",
  targetRepMin: 4,
  targetRepMax: 6,
  workingSets: 2,
  loadIncrementKg: 2.5,
  progressionRule: "doubleProgression",
};
const hypertrophy: ProgressionPrescription = {
  progressionTrackId: "incline-hypertrophy-3x8-12",
  progressionTrackLabel: "增肌 · 8–12 次",
  trainingIntent: "hypertrophy",
  targetRepMin: 8,
  targetRepMax: 12,
  workingSets: 3,
  loadIncrementKg: 2.5,
  progressionRule: "doubleProgression",
};

function incline(prescription: ProgressionPrescription, sets: SetRecord[]): Exercise {
  return {
    id: "px_incline_barbell",
    name: "上斜杠铃卧推",
    isMain: true,
    sets,
    prescription,
  };
}

function workout(date: string, prescription: ProgressionPrescription, sets: SetRecord[], done = true): DayLog {
  return {
    date,
    workout: {
      type: "push",
      done,
      exercises: [incline(prescription, sets)],
    },
  };
}

const days: Record<string, DayLog> = {
  "2026-07-01": workout("2026-07-01", strength, [
    { weight: 80, reps: 5, type: "working" },
    { weight: 80, reps: 5, type: "working" },
  ]),
  "2026-07-02": workout("2026-07-02", hypertrophy, [
    { weight: 65, reps: 10, type: "working" },
    { weight: 65, reps: 10, type: "working" },
    { weight: 65, reps: 10, type: "working" },
  ]),
  "2026-07-03": workout("2026-07-03", strength, [
    { weight: 82.5, reps: 6, type: "working" },
    { weight: 82.5, reps: 6, type: "working", completion: "partial" },
    { weight: 100, reps: 0, type: "working" },
    { weight: 90, reps: 6, type: "working", completion: "skipped" },
  ]),
  "2026-07-04": workout("2026-07-04", hypertrophy, [
    { weight: 70, reps: 12, type: "working" },
    { weight: 70, reps: 12, type: "working" },
    { weight: 70, reps: 12, type: "working" },
  ], false),
  "2026-07-05": {
    date: "2026-07-05",
    workout: {
      type: "push",
      done: true,
      exercises: [{ id: "px_incline_barbell", name: "上斜杠铃卧推", isMain: true, sets: [{ weight: 75, reps: 8, type: "working" }] }],
    },
  },
};

const historyIndex = buildTrainingHistoryIndex(days);
for (const trackId of [strength.progressionTrackId, hypertrophy.progressionTrackId, "missing-track"]) {
  assert.deepEqual(
    findIndexedTrackHistories(historyIndex, "px_incline_barbell", "2026-07-06", trackId, 6),
    findTrackHistories(days, "px_incline_barbell", "2026-07-06", trackId, 6),
    `Indexed history must preserve confirmed, fallback, alternate, and Legacy ordering for ${trackId}`,
  );
}
assert.equal(findIndexedTrackHistories(historyIndex, "px_incline_barbell", "2026-07-03", strength.progressionTrackId).same[0]?.date, "2026-07-01");
assert.equal(findIndexedLastWorkoutByType(historyIndex, "push", "2026-07-06")?.date, "2026-07-05");
const nutritionIndex = buildTrainingHistoryIndex({
  ...days,
  "2026-07-05": { ...days["2026-07-05"], nutrition: { calories: 2200, protein: 170, carbs: 250, fat: 65 } },
});
assert.equal(findIndexedLastNutrition(nutritionIndex, "2026-07-06")?.calories, 2200);

const cachedIndexFor = createTrainingHistoryIndexCache();
const cachedInitial = cachedIndexFor(days);
const daysWithNutrition = {
  ...days,
  "2026-07-06": { date: "2026-07-06", nutrition: { calories: 2100, protein: 160, carbs: 230, fat: 60 } },
};
const nutritionOnlyUpdate = cachedIndexFor(daysWithNutrition);
assert.equal(
  nutritionOnlyUpdate.byExercise.get("px_incline_barbell"),
  cachedInitial.byExercise.get("px_incline_barbell"),
  "A non-training day update must reuse unchanged exercise history rows",
);
assert.equal(findIndexedLastNutrition(nutritionOnlyUpdate, "2026-07-07")?.calories, 2100);

const editedDays = {
  ...daysWithNutrition,
  "2026-07-03": workout("2026-07-03", strength, [
    { weight: 85, reps: 6, type: "working" },
    { weight: 85, reps: 5, type: "working" },
  ]),
};
const editedIndex = cachedIndexFor(editedDays);
assert.equal(findIndexedTrackHistories(editedIndex, "px_incline_barbell", "2026-07-07", strength.progressionTrackId).same[0]?.sets[0]?.weight, 85);
assert.deepEqual(
  findIndexedTrackHistories(editedIndex, "px_incline_barbell", "2026-07-07", strength.progressionTrackId, 6),
  findTrackHistories(editedDays, "px_incline_barbell", "2026-07-07", strength.progressionTrackId, 6),
  "Incremental history edits must match a full scan",
);

const deletedDays: Record<string, DayLog> = { ...editedDays };
delete deletedDays["2026-07-03"];
const deletedIndex = cachedIndexFor(deletedDays);
assert.deepEqual(
  findIndexedTrackHistories(deletedIndex, "px_incline_barbell", "2026-07-07", strength.progressionTrackId, 6),
  findTrackHistories(deletedDays, "px_incline_barbell", "2026-07-07", strength.progressionTrackId, 6),
  "Deleting a day incrementally must remove its history rows",
);

const archive = buildExerciseTrackArchive(days, "2026-07-06");
assert.equal(archive.length, 3, "Strength, hypertrophy, and legacy tracks must remain separate");
const strengthArchive = archive.find((row) => row.trackId === strength.progressionTrackId);
const hypertrophyArchive = archive.find((row) => row.trackId === hypertrophy.progressionTrackId);
const legacyArchive = archive.find((row) => row.legacy);
assert.ok(strengthArchive);
assert.ok(hypertrophyArchive);
assert.ok(legacyArchive);
assert.equal(strengthArchive.sessionCount, 2);
assert.equal(strengthArchive.workingSetCount, 4);
assert.equal(strengthArchive.completionCredits, 3.5);
assert.equal(hypertrophyArchive.sessionCount, 2, "A past unclosed session with valid work must remain visible as reference history");
assert.equal(hypertrophyArchive.implicitSessionCount, 1);
assert.deepEqual(hypertrophyArchive.sessions.map((session) => session.date), ["2026-07-04", "2026-07-02"]);
assert.equal(hypertrophyArchive.sessions[0].history.implicitCompletion, true);
assert.equal(hypertrophyArchive.trend.sessionCount, 1, "Unclosed fallback records must not affect confirmed performance trends");
assert.equal(filterExerciseTrackArchive(archive, "力量")[0]?.trackId, strength.progressionTrackId);
assert.equal(filterExerciseTrackArchive(archive, "legacy")[0]?.legacy, true);

const window = summarizeTrainingWindow(days, "2026-07-01", "2026-07-05");
assert.equal(window.completedSessions, 4);
assert.equal(window.implicitSessions, 1);
assert.equal(window.workingSets, 11);
assert.equal(window.completionCredits, 10.5);
assert.equal(window.planCredits, 9.5);
assert.equal(window.plannedSets, 10);
assert.equal(window.completionPct, 95);
assert.equal(window.trackedExercises, 3);

assert.equal(workoutLogState(days["2026-07-03"].workout), "completed");
assert.equal(workoutLogState(days["2026-07-04"].workout), "inProgress");
assert.equal(workoutLogState(days["2026-07-04"].workout, "2026-07-04", "2026-07-05"), "unclosed");
assert.equal(workoutLogState({ type: "pull", exercises: [] }), "draft");
assert.equal(workoutLogState({ type: "rest", exercises: [] }), "rest");
assert.equal(workoutLogState({ type: "rest", done: false, exercises: [] }), "draft");
assert.equal(dayHasLogContent({ date: "2026-07-06", workout: { type: "pull", exercises: [] } }), false, "An empty workout shell is not a real log entry");
assert.equal(dayHasLogContent({ date: "2026-07-06", workout: { type: "rest", done: false, exercises: [] } }), false, "An unfinished rest shell is not a completed log");
assert.equal(dayHasLogContent({ date: "2026-07-06", recovery: { energy: 3, stress: 2 } }), true, "Recovery-only days remain visible in history");
assert.equal(daySearchText(days["2026-07-02"]).includes("增肌"), true);

function history(date: string, exercise: Exercise): TrackHistoryResult {
  return { date, exercise, sets: exercise.sets, kind: "same" };
}

const bodyweightPrescription: ProgressionPrescription = {
  progressionTrackId: "pullup-reps",
  progressionTrackLabel: "增肌 · 8–12 次",
  trainingIntent: "hypertrophy",
  targetRepMin: 8,
  targetRepMax: 12,
  workingSets: 1,
  loadIncrementKg: 0,
  progressionRule: "repsFirst",
};
const pullup = (reps: number): Exercise => ({
  id: "pl_pullup",
  name: "引体向上",
  isMain: true,
  sets: [{ weight: 0, reps, type: "working" }],
  recordModes: ["reps"],
  prescription: bodyweightPrescription,
});
const bodyweightTrend = analyzeTrackTrend([
  history("2026-07-03", pullup(12)),
  history("2026-07-01", pullup(10)),
]);
assert.equal(bodyweightTrend.metricKind, "reps");
assert.equal(bodyweightTrend.latestValue, 12);
assert.equal(bodyweightTrend.status, "improving");

const durationPrescription: ProgressionPrescription = {
  progressionTrackId: "plank-duration",
  progressionTrackLabel: "时长 · 30–60 秒",
  trainingIntent: "custom",
  targetRepMin: 30,
  targetRepMax: 60,
  workingSets: 1,
  loadIncrementKg: 0,
  progressionRule: "custom",
  performanceMode: "duration",
};
const plank = (seconds: number): Exercise => ({
  id: "ab_plank",
  name: "平板支撑",
  isMain: false,
  sets: [{ weight: 0, reps: 0, durationSeconds: seconds, type: "working" }],
  recordModes: ["duration"],
  prescription: durationPrescription,
});
const durationTrend = analyzeTrackTrend([
  history("2026-07-03", plank(60)),
  history("2026-07-01", plank(45)),
]);
assert.equal(durationTrend.metricKind, "duration");
assert.equal(durationTrend.latestValue, 60);
assert.equal(durationTrend.status, "improving");

const hiddenRestInput = {
  days: {
    "2026-07-01": {
      date: "2026-07-01",
      workout: {
        type: "rest",
        done: false,
        exercises: [{ id: "hidden", name: "不应隐藏", isMain: false, sets: [{ weight: 20, reps: 10, type: "working" }] }],
      },
    },
    "2026-07-02": {
      date: "2026-07-02",
      workout: {
        type: "rest",
        exercises: [{ id: "rehab", name: "康复记录", isMain: false, sets: [{ weight: 0, reps: 12, type: "working", technique: "rehab" }] }],
      },
    },
  },
  bodyWeights: [],
  waistEntries: [],
  customExercises: [],
  schedule: { split: ["push", "pull", "legs", "rest", "push", "pull", "rest"] },
} as AppData;
assert.equal(inspectDataHealth(hiddenRestInput).issues.some((issue) => issue.code === "workOnRestDays"), true);
const repairedRest = normalizeData(hiddenRestInput);
assert.equal(repairedRest.days["2026-07-01"].workout?.type, "custom");
assert.equal(repairedRest.days["2026-07-01"].workout?.exercises[0].sets[0].reps, 10);
assert.equal(repairedRest.days["2026-07-02"].workout?.type, "custom", "Rehab work must not stay hidden behind a rest day");

console.log("training history tests passed");
