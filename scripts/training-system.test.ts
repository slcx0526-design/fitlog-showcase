import "./audit-regression.test";
import assert from "node:assert/strict";
import { analyzeTrackTrend, estimatedOneRepMax, findTrackHistories, findTrackHistory, legacyTrackId, prescriptionForPreset, prescriptionFromTemplateItem, progressionSuggestion, workingSets } from "../lib/prescription";
import { computeVolumeSummary, microcycleDays, volumeTargetScale } from "../lib/volume";
import { activeMicrocyclePattern, assignHistoricalMicrocycles, completedStep, currentMicrocycleProgress, defaultMicrocycle, microcycleAssignmentForNewWorkout, microcycleForNewWorkout, microcycleForScheduleEdit, microcyclePatternFor, microcycleStepHref, microcycleStepMatchesWorkout, nextMicrocycle, shouldAdvanceMicrocycle, templateForWorkout } from "../lib/microcycle";
import { parseBackup, toBackup, type AppData } from "../lib/storage";
import { weightForWaistDate } from "../lib/bodyfat";
import { shiftDate } from "../lib/weight";
import { isDayTrained, trainingDayCountInLast } from "../lib/schedule";
import { todayKey, weekKeysFor } from "../lib/date";
import { presetForHistoricalExercise } from "../lib/exercises";
import { buildTemplateAdjustmentProposal } from "../lib/templateAdjustment";
import type { DayLog, Exercise, ExercisePreset, ProgressionPrescription } from "../lib/types";

const strength: ProgressionPrescription = { progressionTrackId: "incline-strength", progressionTrackLabel: "力量 · 4–6 次", trainingIntent: "strength", targetRepMin: 4, targetRepMax: 6, targetRirMin: 1, targetRirMax: 2, workingSets: 2, loadIncrementKg: 2.5, progressionRule: "doubleProgression" };
const bench = (weight: number, reps: number) => ({ id: "incline", name: "上斜杠铃卧推", isMain: true, sets: [{ weight, reps, type: "working" as const }], prescription: strength, progressionTrackId: strength.progressionTrackId });
const days: Record<string, DayLog> = { "2026-07-01": { date: "2026-07-01", workout: { type: "push", done: true, exercises: [bench(80, 5)] } } };
assert.equal(findTrackHistory(days, "incline", "2026-07-02", strength.progressionTrackId).same?.sets[0].weight, 80);
const historyWithDraft: Record<string, DayLog> = { ...days, "2026-07-02": { date: "2026-07-02", workout: { type: "push", done: false, exercises: [bench(90, 6)] } } };
assert.equal(findTrackHistory(historyWithDraft, "incline", "2026-07-03", strength.progressionTrackId).same?.date, "2026-07-01");
const onlyUnclosedHistory: Record<string, DayLog> = { "2026-07-02": historyWithDraft["2026-07-02"] };
const unclosedFallback = findTrackHistory(onlyUnclosedHistory, "incline", "2026-07-03", strength.progressionTrackId).same;
assert.equal(unclosedFallback?.date, "2026-07-02", "Past valid work must remain available when the user forgot to finish the session");
assert.equal(unclosedFallback?.implicitCompletion, true);
assert.equal(progressionSuggestion(strength, unclosedFallback ?? null).status, "unconfirmedHistory", "Unclosed fallback history must never trigger automatic load progression");
assert.equal(findTrackHistory(onlyUnclosedHistory, "incline", "2026-07-02", strength.progressionTrackId).same, null, "The current in-progress date must not become its own history");
const completedHistory: Record<string, DayLog> = { ...historyWithDraft, "2026-07-02": { date: "2026-07-02", workout: { type: "push", done: true, exercises: [bench(82.5, 6)] } } };
const trackHistory = findTrackHistories(completedHistory, "incline", "2026-07-03", strength.progressionTrackId);
assert.deepEqual(trackHistory.same.map((item) => item.date), ["2026-07-02", "2026-07-01"]);
assert.equal(estimatedOneRepMax({ weight: 80, reps: 6 }), 96);
assert.equal(analyzeTrackTrend(trackHistory.same).status, "improving");
assert.equal(progressionSuggestion(strength, { date: "2026-07-01", kind: "same", exercise: bench(80, 6), sets: [{ weight: 80, reps: 6, type: "working" }, { weight: 80, reps: 6, type: "working" }] }).status, "addWeight");
assert.equal(progressionSuggestion(strength, { date: "2026-07-01", kind: "same", exercise: bench(80, 6), sets: [{ weight: 80, reps: 6, type: "working", rir: 0 }, { weight: 80, reps: 6, type: "working", rir: 1 }] }).status, "addWeight");
assert.equal(progressionSuggestion(strength, { date: "2026-07-01", kind: "same", exercise: bench(80, 6), sets: [{ weight: 80, reps: 6, type: "working" }, { weight: 80, reps: 6, type: "working" }], sessionDifficulty: "hard" }).status, "effortCheck");
assert.equal(workingSets([{ weight: 40, reps: 10, type: "warmup" }, { weight: 80, reps: 6, type: "working" }, { weight: 80, reps: 6, type: "working", completion: "skipped" }]).length, 1);
assert.equal(workingSets([{ weight: 82.5, reps: 0, type: "working" }]).length, 0);
assert.equal(workingSets([{ weight: 0, reps: 0, durationSeconds: 45, type: "working" }]).length, 1);
const draftOnlyDay: DayLog = { date: todayKey(), workout: { type: "push", done: false, exercises: [{ id: "draft", name: "草稿", isMain: false, sets: [{ weight: 82.5, reps: 0, type: "working" }] }] } };
const validTrainingDay: DayLog = { date: todayKey(), workout: { type: "push", done: true, exercises: [{ id: "valid", name: "有效组", isMain: false, sets: [{ weight: 82.5, reps: 6, type: "working" }] }] } };
assert.equal(isDayTrained(draftOnlyDay), false);
assert.equal(isDayTrained(validTrainingDay), true);
assert.equal(trainingDayCountInLast({ [todayKey()]: draftOnlyDay }, 1), 0);
assert.equal(trainingDayCountInLast({ [todayKey()]: validTrainingDay }, 1), 1);
assert.deepEqual(weekKeysFor("2026-07-12"), ["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10", "2026-07-11", "2026-07-12"]);
assert.equal(trainingDayCountInLast({ "2026-07-01": { ...validTrainingDay, date: "2026-07-01" } }, 1, "2026-07-01"), 1);

const volume = computeVolumeSummary([{ date: "2026-07-01", workout: { type: "push", exercises: [{ id: "bench", name: "卧推", isMain: true, sets: [{ weight: 100, reps: 5, type: "working" }, { weight: 100, reps: 5, type: "working" }], volumeContributions: [{ muscle: "chest", weight: 1, direct: true }, { muscle: "frontDelt", weight: 0.5, direct: false }] }] } }], "intermediate");
assert.equal(volume.rows.find((row) => row.muscle === "chest")?.directEffectiveSets, 2);
assert.equal(volume.rows.find((row) => row.muscle === "frontDelt")?.indirectEffectiveSets, 1);
assert.equal(volume.rows.find((row) => row.muscle === "frontDelt")?.effectiveSets, 0);
assert.equal(volume.rows.find((row) => row.muscle === "frontDelt")?.stimulusSets, 1);
assert.equal(volume.totalEffectiveSets, volume.totalDirectEffectiveSets);
assert.equal(computeVolumeSummary([{ date: "2026-07-01", workout: { type: "custom", exercises: [{ id: "plank", name: "平板支撑", isMain: false, sets: [{ weight: 0, reps: 0, durationSeconds: 45, type: "working" }], volumeContributions: [{ muscle: "abs", weight: 0.7, direct: true }] }] } }]).rows.find((row) => row.muscle === "abs")?.directEffectiveSets, 0.7);
assert.equal(computeVolumeSummary([], "intermediate", undefined, volumeTargetScale("28d")).rows.find((row) => row.muscle === "chest")?.target.low, 48);

const step = (type: "push" | "pull" | "legs" | "rest", date: string) => ({ date, workout: { type, done: true, microcycleId: "mc_1", exercises: type === "rest" ? [] : [{ id: `${type}_${date}`, name: type, isMain: true, sets: [{ weight: 1, reps: 1, type: "working" as const }] }] } });
const microData: AppData = { days: { "2026-07-01": step("push", "2026-07-01"), "2026-07-02": step("pull", "2026-07-02"), "2026-07-03": step("legs", "2026-07-03"), "2026-07-04": step("rest", "2026-07-04"), "2026-07-05": step("push", "2026-07-05"), "2026-07-06": step("pull", "2026-07-06"), "2026-07-07": step("rest", "2026-07-07") }, bodyWeights: [], waistEntries: [], customExercises: [], schedule: { split: ["push", "pull", "legs", "rest", "push", "pull", "rest"] }, microcycle: { currentId: "mc_1", startedAt: "2026-07-01", index: 1 } };
assert.equal(shouldAdvanceMicrocycle(microData, "2026-07-07"), true);
assert.equal(microData.microcycle?.currentId, "mc_1");
assert.equal(microcycleForNewWorkout(microData, "2026-07-08").index, 2);
const skippedData: AppData = { ...microData, days: { ...microData.days, "2026-07-01": { date: "2026-07-01", workout: { type: "push", done: true, microcycleId: "mc_1", exercises: [{ id: "push_skip", name: "push", isMain: true, sets: [{ weight: 80, reps: 8, type: "working", completion: "skipped" }] }] } } } };
assert.equal(shouldAdvanceMicrocycle(skippedData, "2026-07-07"), false);
assert.equal(nextMicrocycle(microData.microcycle, "2026-07-08").index, 2);
assert.equal(microcycleDays(microData).length, 7);
const unfinishedPast = { ...step("push", "2026-07-01"), workout: { ...step("push", "2026-07-01").workout, done: false } };
assert.equal(completedStep(unfinishedPast, "2026-07-02"), false);
assert.equal(currentMicrocycleProgress({ ...microData, days: { "2026-07-01": unfinishedPast } }, "2026-07-02").completed, 0);
const legacyUnfinishedDays = Object.fromEntries([
  ["2026-06-01", "push"], ["2026-06-02", "pull"], ["2026-06-03", "legs"], ["2026-06-04", "rest"],
  ["2026-06-05", "push"], ["2026-06-06", "pull"], ["2026-06-07", "rest"], ["2026-06-08", "push"],
].map(([date, type]) => {
  const day = step(type as "push" | "pull" | "legs" | "rest", date);
  return [date, { ...day, workout: { ...day.workout, done: false, microcycleId: undefined } }];
}));
const migratedLegacyUnfinished = assignHistoricalMicrocycles(legacyUnfinishedDays, microData.schedule, "2026-06-09");
assert.equal(migratedLegacyUnfinished.microcycle.index, 2);
assert.equal(migratedLegacyUnfinished.microcycle.startedAt, "2026-06-08");
assert.deepEqual(microcycleDays({ ...microData, days: migratedLegacyUnfinished.days, microcycle: migratedLegacyUnfinished.microcycle }).map((day) => day.date), ["2026-06-08"]);
const boundedCycle: AppData = {
  ...microData,
  microcycle: { ...microData.microcycle!, startedAt: "2026-07-05" },
  days: {
    "2026-07-01": step("push", "2026-07-01"),
    "2026-07-05": step("push", "2026-07-05"),
  },
};
assert.deepEqual(microcycleDays(boundedCycle).map((day) => day.date), ["2026-07-05"]);
assert.equal(currentMicrocycleProgress(boundedCycle, "2026-07-05").completed, 1);

const configuredSchedule = {
  split: microData.schedule.split,
  microcycle: [
    { id: "s1", type: "push" as const, label: "Push Strength" },
    { id: "s2", type: "pull" as const, label: "Pull Strength" },
    { id: "s3", type: "legs" as const, label: "Legs" },
    { id: "s4", type: "push" as const, label: "Push Hypertrophy" },
    { id: "s5", type: "rest" as const, label: "Rest" },
  ],
};
assert.deepEqual(microcyclePatternFor(configuredSchedule).map((item) => item.label), ["Push Strength", "Pull Strength", "Legs", "Push Hypertrophy", "Rest"]);
assert.equal(volumeTargetScale("microcycle", { ...microData, schedule: configuredSchedule }), 0.71);
const partialCycle: AppData = {
  ...microData,
  schedule: configuredSchedule,
  days: {
    "2026-07-01": step("push", "2026-07-01"),
    "2026-07-02": step("pull", "2026-07-02"),
  },
};
assert.equal(currentMicrocycleProgress(partialCycle, "2026-07-03").completed, 2);
assert.equal(currentMicrocycleProgress(partialCycle, "2026-07-03").next?.label, "Legs");
const boundSteps = [
  { id: "bound_strength", type: "push" as const, label: "Push Strength", templateId: "tpl_strength" },
  { id: "bound_hypertrophy", type: "push" as const, label: "Push Hypertrophy", templateId: "tpl_hypertrophy" },
];
const boundDay = (date: string, templateId?: string): DayLog => ({
  date,
  workout: { type: "push", templateId, done: true, microcycleId: "mc_bound", exercises: [{ id: `push_${date}`, name: "push", isMain: true, sets: [{ weight: 80, reps: 8, type: "working" }] }] },
});
const boundCycle: AppData = {
  ...microData,
  schedule: { ...microData.schedule, microcycle: boundSteps },
  microcycle: { currentId: "mc_bound", startedAt: "2026-07-01", index: 1, steps: boundSteps },
  days: {
    "2026-07-01": boundDay("2026-07-01", "tpl_hypertrophy"),
    "2026-07-02": boundDay("2026-07-02", "tpl_strength"),
    "2026-07-03": boundDay("2026-07-03", "tpl_strength"),
    "2026-07-04": boundDay("2026-07-04", "tpl_hypertrophy"),
  },
};
assert.equal(currentMicrocycleProgress({ ...boundCycle, days: { "2026-07-01": boundCycle.days["2026-07-01"] } }, "2026-07-01").completed, 0);
assert.equal(currentMicrocycleProgress({ ...boundCycle, days: Object.fromEntries(Object.entries(boundCycle.days).slice(0, 3)) }, "2026-07-03").completed, 1);
assert.equal(currentMicrocycleProgress(boundCycle, "2026-07-04").completed, 2);
assert.equal(shouldAdvanceMicrocycle(boundCycle, "2026-07-04"), true);
assert.equal(microcycleStepMatchesWorkout(boundSteps[0], boundDay("2026-07-01").workout), false);
assert.equal(microcycleStepMatchesWorkout(boundSteps[0], boundDay("2026-07-01").workout, true), true);
assert.equal(microcycleStepHref(boundSteps[1]), "/train?start=push&cycleStep=bound_hypertrophy&template=tpl_hypertrophy");
assert.equal(microcycleStepMatchesWorkout(boundSteps[0], { ...boundDay("2026-07-01", "tpl_strength").workout!, microcycleStepId: "bound_hypertrophy" }), false, "Exact step ids prevent two same-type steps from collapsing together");
const snapshottedCycle: AppData = {
  ...partialCycle,
  microcycle: { ...partialCycle.microcycle!, steps: microcyclePatternFor(partialCycle.schedule) },
  schedule: {
    ...partialCycle.schedule,
    microcycle: [
      { id: "future_1", type: "legs", label: "Future Legs" },
      { id: "future_2", type: "rest", label: "Future Rest" },
    ],
  },
};
assert.equal(activeMicrocyclePattern(snapshottedCycle).length, 5);
assert.equal(currentMicrocycleProgress(snapshottedCycle, "2026-07-03").next?.label, "Legs");
assert.equal(volumeTargetScale("microcycle", snapshottedCycle), 0.71);
const nextSnapshot = nextMicrocycle(snapshottedCycle.microcycle, "2026-07-08", snapshottedCycle.schedule);
assert.deepEqual(nextSnapshot.steps?.map((item) => item.label), ["Future Legs", "Future Rest"]);
assert.deepEqual(microcycleForScheduleEdit(snapshottedCycle, snapshottedCycle.schedule)?.steps?.map((item) => item.label), ["Push Strength", "Pull Strength", "Legs", "Push Hypertrophy", "Rest"]);
const emptySnapshottedCycle: AppData = { ...snapshottedCycle, days: {} };
assert.deepEqual(microcycleForScheduleEdit(emptySnapshottedCycle, emptySnapshottedCycle.schedule)?.steps?.map((item) => item.label), ["Future Legs", "Future Rest"]);

const strengthTemplate = { id: "tpl_strength", name: "力量模板", type: "push" as const, items: [{ exerciseId: "incline", name: "上斜卧推", sets: 4, repsLow: 4, repsHigh: 6 }] };
const boundSchedule = { ...microData.schedule, microcycle: [{ id: "strength_step", type: "push" as const, label: "Push Strength", templateId: strengthTemplate.id }] };
const frozenCycle = defaultMicrocycle("2026-07-01", boundSchedule, [strengthTemplate]);
strengthTemplate.items[0].sets = 2;
assert.equal(frozenCycle.steps?.[0].templateSnapshot?.items[0].sets, 4, "Active-cycle template content must be deeply frozen");
const refreshedCycle = nextMicrocycle(frozenCycle, "2026-07-08", boundSchedule, [strengthTemplate]);
assert.equal(refreshedCycle.steps?.[0].templateSnapshot?.items[0].sets, 2, "A new cycle snapshots the latest template");
const backfillAssignment = microcycleAssignmentForNewWorkout({ ...microData, microcycle: { currentId: "mc_current", startedAt: "2026-07-10", index: 4, steps: microcyclePatternFor(microData.schedule) } }, "2026-07-01");
assert.equal(backfillAssignment.microcycleId, "legacy_mc_20260701");
assert.equal(backfillAssignment.microcycle.currentId, "mc_current", "Backfill must not advance or rewrite the active cycle");
const cycleBackup = parseBackup(JSON.stringify(toBackup({ ...partialCycle, customExercises: [{ id: "cx_test", name: "自定义推举", isMain: false, type: "custom", primaryMuscle: "frontDelt", secondaryMuscles: ["triceps"], volumeContributions: [{ muscle: "frontDelt", weight: 1, direct: true }, { muscle: "triceps", weight: 0.5, direct: false }] }] })));
assert.equal(cycleBackup.schedule.microcycle?.[3].label, "Push Hypertrophy");
assert.equal(cycleBackup.microcycle?.steps?.[3].label, "Push Hypertrophy");
assert.equal(cycleBackup.customExercises[0].volumeContributions?.[1].weight, 0.5);

const deletedLiveTemplateCycle = parseBackup(JSON.stringify({
  app: "fitlog", version: 12, exportedAt: "2026-07-09T00:00:00.000Z",
  days: {}, bodyWeights: [], waistEntries: [], customExercises: [], templates: [], schedule: microData.schedule,
  microcycle: { currentId: "mc_snapshot", startedAt: "2026-07-09", index: 2, steps: [{ id: "frozen", type: "push", label: "Frozen", templateId: strengthTemplate.id, templateSnapshot: frozenCycle.steps?.[0].templateSnapshot }] },
}));
assert.equal(deletedLiveTemplateCycle.microcycle?.steps?.[0].templateSnapshot?.items[0].sets, 4, "Active snapshots survive deletion of the live template");
const customVolume = computeVolumeSummary([{ date: "2026-07-09", workout: { type: "custom", done: true, exercises: [{ id: "cx_test", name: "自定义推举", isMain: false, sets: [{ weight: 20, reps: 10, type: "working" }, { weight: 20, reps: 10, type: "working" }], volumeContributions: cycleBackup.customExercises[0].volumeContributions }] } }]);
assert.equal(customVolume.rows.find((row) => row.muscle === "frontDelt")?.directEffectiveSets, 2);
assert.equal(customVolume.rows.find((row) => row.muscle === "triceps")?.indirectEffectiveSets, 1);

const mixedCycleBackup = parseBackup(JSON.stringify({
  app: "fitlog",
  version: 8,
  days: {
    "2026-07-01": { ...step("push", "2026-07-01"), workout: { ...step("push", "2026-07-01").workout, microcycleId: "mc_current" } },
    "2026-07-02": { ...step("pull", "2026-07-02"), workout: { ...step("pull", "2026-07-02").workout, microcycleId: undefined } },
    "2026-07-03": { ...step("legs", "2026-07-03"), workout: { ...step("legs", "2026-07-03").workout, microcycleId: "mc_existing" } },
    "2026-07-10": { ...step("push", "2026-07-10"), workout: { ...step("push", "2026-07-10").workout, microcycleId: "mc_current" } },
  },
  bodyWeights: [],
  waistEntries: [],
  customExercises: [],
  schedule: microData.schedule,
  microcycle: { currentId: "mc_current", startedAt: "2026-07-10", index: 4, steps: microcyclePatternFor(microData.schedule) },
}));
assert.equal(mixedCycleBackup.days["2026-07-01"].workout?.microcycleId, "legacy_mc_20260701");
assert.equal(mixedCycleBackup.days["2026-07-02"].workout?.microcycleId, "legacy_mc_20260702");
assert.equal(mixedCycleBackup.days["2026-07-03"].workout?.microcycleId, "mc_existing");
assert.equal(mixedCycleBackup.days["2026-07-10"].workout?.microcycleId, "mc_current");
assert.deepEqual(microcycleDays(mixedCycleBackup).map((day) => day.date), ["2026-07-10"]);

const sanitizedBackup = parseBackup(JSON.stringify({
  app: "fitlog",
  version: 8,
  days: {
    invalid: { cardio: [{ mode: "走路", minutes: 30 }] },
    "2026-07-08": { date: "2026-07-08", cardio: "broken", nutrition: [] },
    "2026-07-09": { date: "2026-07-09", cardio: [{ mode: " 走路 ", minutes: 30, zone: 2 }], nutrition: { calories: 2000 } },
  },
  bodyWeights: [{ date: "2026-07-09", weight: 80 }, { date: "2026-07-09", weight: 81 }],
  waistEntries: [{ date: "2026-07-09", waist: 90 }, { date: "bad", waist: 89 }],
  customExercises: [],
}));
assert.equal(sanitizedBackup.days.invalid, undefined);
assert.equal(sanitizedBackup.days["2026-07-08"].cardio, undefined);
assert.equal(sanitizedBackup.days["2026-07-09"].cardio?.[0].id, "legacy_cardio_20260709_1");
assert.equal(sanitizedBackup.days["2026-07-09"].cardio?.[0].mode, "走路");
assert.deepEqual(sanitizedBackup.days["2026-07-09"].nutrition, { calories: 2000, protein: 0, carbs: 0, fat: 0 });
assert.deepEqual(sanitizedBackup.bodyWeights, [{ date: "2026-07-09", weight: 81 }]);
assert.deepEqual(sanitizedBackup.waistEntries, [{ date: "2026-07-09", waist: 90 }]);

const historicalExercise: Exercise = { id: "legacy_press", name: "旧推举", isMain: true, sets: [], primaryMuscle: "frontDelt", secondaryMuscles: ["triceps"], volumeContributions: [{ muscle: "frontDelt", weight: 1, direct: true }, { muscle: "triceps", weight: 0.5, direct: false }] };
assert.deepEqual(presetForHistoricalExercise(historicalExercise, "push").volumeContributions, historicalExercise.volumeContributions);
assert.equal(presetForHistoricalExercise({ ...historicalExercise, id: "px_barbell_bench" }, "push").primaryMuscle, "chest");

const oldTz = process.env.TZ;
process.env.TZ = "Asia/Shanghai";
assert.equal(shiftDate("2026-07-07", 0), "2026-07-07");
assert.equal(shiftDate("2026-01-01", -1), "2025-12-31");
if (oldTz == null) delete process.env.TZ; else process.env.TZ = oldTz;
assert.equal(weightForWaistDate([{ date: "2026-07-03", weight: 80 }], "2026-07-01"), null);

const restored = parseBackup(JSON.stringify({ app: "fitlog", version: 6, exportedAt: "2026-07-04T00:00:00.000Z", days: { "2026-07-01": { date: "2026-07-01", workout: { type: "push", exercises: [{ id: "set_state", name: "状态组", isMain: false, sets: [{ weight: 50, reps: 10, type: "working", rir: 4, completion: "partial", technique: "dropSet" }] }] } } }, bodyWeights: [], waistEntries: [], customExercises: [], cutPlan: { enabled: true, routineCardioMinutesPerSession: 40, routineCardioSessionsPerWeek: 3, routineCardioZone: 2, trainingTemplateIds: { push: "tpl_push" } } }));
const restoredSet = restored.days["2026-07-01"].workout?.exercises[0].sets[0];
assert.equal(restoredSet?.completion, "partial");
assert.equal(restoredSet?.technique, "dropSet");
assert.equal(restored.cutPlan?.routineCardioMinutesPerSession, 40);
assert.equal(restored.cutPlan?.routineCardioSessionsPerWeek, 3);
assert.equal(restored.cutPlan?.routineCardioZone, 2);
assert.equal(restored.cutPlan?.trainingTemplateIds?.push, "tpl_push");

const durationBackup = parseBackup(JSON.stringify({
  app: "fitlog",
  version: 10,
  exportedAt: "2026-07-15T00:00:00.000Z",
  days: {
    "2026-07-15": {
      date: "2026-07-15",
      workout: {
        type: "push",
        templateId: "tpl_duration",
        microcycleId: "mc_duration",
        difficulty: "hard",
        done: true,
        exercises: [{
          id: "plank",
          name: "平板支撑",
          isMain: false,
          recordModes: ["duration"],
          progressionTrackId: "plank-duration",
          prescription: { progressionTrackId: "plank-duration", progressionTrackLabel: "时长 · 30–60 秒", trainingIntent: "custom", targetRepMin: 30, targetRepMax: 60, workingSets: 3, loadIncrementKg: 0, progressionRule: "custom", performanceMode: "duration" },
          sets: [{ weight: 0, reps: 0, durationSeconds: 45, type: "working" }],
        }],
      },
    },
  },
  bodyWeights: [],
  waistEntries: [],
  customExercises: [],
  templates: [{ id: "tpl_duration", name: "核心时长", type: "push", items: [{ exerciseId: "plank", name: "平板支撑", sets: 3, repsLow: 30, repsHigh: 60, recordModes: ["duration"] }] }],
  schedule: { split: microData.schedule.split, microcycle: [{ id: "duration_step", type: "push", label: "核心时长", templateId: "tpl_duration" }] },
  microcycle: { currentId: "mc_duration", startedAt: "2026-07-15", index: 1, steps: [{ id: "duration_step", type: "push", label: "核心时长", templateId: "tpl_duration" }] },
}));
assert.equal(durationBackup.days["2026-07-15"].workout?.difficulty, "hard");
assert.equal(durationBackup.days["2026-07-15"].workout?.exercises[0].sets[0].durationSeconds, 45);
assert.equal(durationBackup.days["2026-07-15"].workout?.exercises[0].prescription?.performanceMode, "duration");
assert.equal(durationBackup.schedule.microcycle?.[0].templateId, "tpl_duration");
assert.equal(durationBackup.microcycle?.steps?.[0].templateId, "tpl_duration");

const sessionTemplateSnapshot = { ...strengthTemplate, items: [{ ...strengthTemplate.items[0], sets: 4 }] };
const sessionSnapshotBackup = parseBackup(JSON.stringify({
  app: "fitlog", version: 12, exportedAt: "2026-07-15T00:00:00.000Z",
  days: { "2026-07-15": { date: "2026-07-15", workout: { type: "push", templateId: sessionTemplateSnapshot.id, templateSnapshot: sessionTemplateSnapshot, microcycleId: "mc_session", microcycleStepId: "strength_step", done: true, exercises: [bench(80, 5)] } } },
  bodyWeights: [], waistEntries: [], customExercises: [], favoriteExerciseIds: ["incline"], templates: [{ ...strengthTemplate, items: [{ ...strengthTemplate.items[0], sets: 2 }] }], schedule: boundSchedule,
}));
assert.equal(sessionSnapshotBackup.days["2026-07-15"].workout?.microcycleStepId, "strength_step");
assert.equal(templateForWorkout(sessionSnapshotBackup, sessionSnapshotBackup.days["2026-07-15"].workout)?.items[0].sets, 4, "Historical sessions use their own template snapshot");
assert.deepEqual(sessionSnapshotBackup.favoriteExerciseIds, ["incline"]);

const preset: ExercisePreset = { id: "incline", name: "上斜杠铃卧推", isMain: true, type: "push" };
assert.notEqual(prescriptionForPreset(preset, "push", "strength").progressionTrackId, prescriptionForPreset(preset, "push", "hypertrophy").progressionTrackId);
const revisedTemplatePrescription = prescriptionFromTemplateItem({ exerciseId: "incline", name: "上斜杠铃卧推", sets: 3, repsLow: 8, repsHigh: 12, prescription: strength, progressionTrackId: strength.progressionTrackId }, preset);
assert.equal(revisedTemplatePrescription.targetRepMin, 8);
assert.notEqual(revisedTemplatePrescription.progressionTrackId, strength.progressionTrackId);
const adjustmentData: AppData = {
  ...microData,
  templates: [{ id: "tpl_push", name: "推力量", type: "push", items: [{ exerciseId: "incline", name: "上斜杠铃卧推", sets: 4, repsLow: 4, repsHigh: 6 }] }],
};
const adjustment = buildTemplateAdjustmentProposal(adjustmentData, { kind: "reduceVolume", priority: 1, href: "/templates", muscle: "chest", basis: "actual", current: 18, projected: 18, targetHigh: 16, suggestedSets: 2, source: "上斜杠铃卧推", sourceExerciseId: "incline" });
assert.equal(adjustment?.changes[0].fromSets, 4);
assert.equal(adjustment?.changes[0].toSets, 2);
assert.equal(adjustment?.nextItems[0].sets, 2);
assert.equal(parseBackup(JSON.stringify({ app: "fitlog", version: 1, exportedAt: "2026-07-04T00:00:00.000Z", days: {}, bodyWeights: [], waistEntries: [], customExercises: [] })).microcycle?.index, 1);
assert.equal(legacyTrackId("bench"), "legacy:bench");
console.log("training-system tests passed");
