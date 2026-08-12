import assert from "node:assert/strict";
import { inspectDataHealth } from "../lib/dataHealth";
import { mergeAppleHealthSnapshot, normalizeAppleHealthSnapshot } from "../lib/appleHealth";
import { DEFAULT_EXERCISES, searchExercisePreset } from "../lib/exercises";
import {
  defaultTrackId,
  exerciseTrackId,
  progressionTrackIdsMatch,
  progressionSuggestion,
  retargetTemplateScopedTrackId,
  templateScopedIndependentTrackId,
} from "../lib/prescription";
import { progressionPresentation } from "../lib/progressionPresentation";
import { normalizeData, parseBackupWithMeta, SCHEMA_VERSION, toBackup, type AppData } from "../lib/storage";
import { canonicalizeLibraryTemplate, moveTemplateWithinType, templateItemsFromCompletedWork, updateCustomExerciseTemplateReferences } from "../lib/templates";
import {
  isWorkoutEditingLocked,
  isWorkoutSessionClosed,
  setCompletionCredit,
  setStimulusFactor,
  progressionSets,
  summarizeExerciseWork,
  summarizeWorkoutWork,
  workingSets,
} from "../lib/trainingMetrics";
import type { Exercise, ExercisePreset, Schedule, SetRecord, Template, WorkoutSession } from "../lib/types";
import { defaultTrainingPolicy, exportTrainingPolicyBackup } from "../lib/trainingPolicy";
import { localizeSystemText } from "../lib/systemText";

assert.equal(localizeSystemText("zh", "Push Strength"), "推 · 力量");
assert.equal(localizeSystemText("en", "推 · 力量"), "Push · Strength");
assert.equal(localizeSystemText("ja", "腿 · 综合"), "脚・総合");
assert.equal(localizeSystemText("en", "增肌 · 8–12 次"), "Hypertrophy · 8–12 reps");
assert.equal(localizeSystemText("ja", "恢复 · 力量 · 4–6 次"), "回復 · 筋力 · 4–6 回");
assert.equal(localizeSystemText("en", "用户自定义模板"), undefined, "User-authored labels must remain untouched");

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

const legacyClosedWorkout: WorkoutSession = {
  type: "push",
  exercises: [{ id: "legacy_press", name: "旧卧推", isMain: true, sets: [{ weight: 80, reps: 8 }] }],
};
assert.equal(isWorkoutSessionClosed(legacyClosedWorkout), true, "Legacy work without a done flag is closed for editing");
assert.equal(isWorkoutEditingLocked(legacyClosedWorkout), true);
assert.equal(isWorkoutSessionClosed({ ...legacyClosedWorkout, done: false }), false, "An explicit open state wins over legacy inference");
assert.equal(isWorkoutSessionClosed({ ...legacyClosedWorkout, done: true, exercises: [] }), true);
assert.equal(isWorkoutSessionClosed({ type: "push", exercises: [{ id: "draft", name: "草稿", isMain: false, sets: [{ weight: 80, reps: 0 }] }] }), false);
const legacyRest: WorkoutSession = { type: "rest", exercises: [] };
assert.equal(isWorkoutSessionClosed(legacyRest), true);
assert.equal(isWorkoutEditingLocked(legacyRest), false, "Rest days stay type-editable instead of trapping the user");

const reusableItems = templateItemsFromCompletedWork([{
  id: "px_barbell_bench",
  name: "平板杠铃卧推",
  isMain: true,
  planned: { sets: 6, repsLow: 6, repsHigh: 12, rpe: 8 },
  sets: [
    { weight: 80, reps: 8, completion: "completed" },
    { weight: 80, reps: 10 },
    { weight: 80, reps: 9, completion: "partial" },
    { weight: 70, reps: 12, technique: "dropSet" },
    { weight: 20, reps: 15, technique: "rehab" },
    { weight: 60, reps: 10, completion: "skipped" },
    { weight: 80, reps: 0 },
    { weight: 40, reps: 12, type: "warmup" },
  ],
}]);
assert.equal(reusableItems.length, 1);
assert.deepEqual(
  { sets: reusableItems[0].sets, low: reusableItems[0].repsLow, high: reusableItems[0].repsHigh, rpe: reusableItems[0].rpe },
  { sets: 2, low: 8, high: 10, rpe: 8 },
  "Only complete standard work becomes a reusable template prescription",
);
assert.deepEqual(templateItemsFromCompletedWork([{
  id: "partial_only",
  name: "只有半组",
  isMain: false,
  sets: [{ weight: 50, reps: 10, completion: "partial" }, { weight: 40, reps: 12, technique: "technique" }],
}]), []);

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

const customPreset: ExercisePreset = {
  id: "cx_custom_press",
  name: "自定义推举",
  type: "custom",
  isMain: false,
  primaryMuscle: "frontDelt",
  secondaryMuscles: ["triceps"],
  volumeContributions: [
    { muscle: "frontDelt", weight: 1, direct: true },
    { muscle: "triceps", weight: 0.3, direct: false },
  ],
  equipment: "cable",
  recordModes: ["weight", "reps"],
  custom: true,
};
const customReferenceTemplate: Template = {
  id: "tpl_custom",
  name: "自定义模板",
  type: "push",
  items: [{
    exerciseId: customPreset.id,
    name: "旧名称",
    sets: 3,
    repsLow: 8,
    repsHigh: 12,
    primaryMuscle: "chest",
    equipment: "free",
    recordModes: ["weight", "reps"],
  }],
};
const syncedCustomTemplate = updateCustomExerciseTemplateReferences([customReferenceTemplate], customPreset)![0].items[0];
assert.equal(syncedCustomTemplate.name, customPreset.name);
assert.equal(syncedCustomTemplate.primaryMuscle, "frontDelt");
assert.equal(syncedCustomTemplate.equipment, "cable");
assert.equal(syncedCustomTemplate.volumeContributions?.find((item) => item.muscle === "triceps")?.weight, 0.3);
const durationCustomTemplate = updateCustomExerciseTemplateReferences([customReferenceTemplate], {
  ...customPreset,
  recordModes: ["duration"],
})![0].items[0];
assert.deepEqual([durationCustomTemplate.repsLow, durationCustomTemplate.repsHigh], [30, 60]);
assert.equal(durationCustomTemplate.prescription?.performanceMode, "duration");

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
assert.deepEqual(normalized.favoriteExerciseIds, ["px_incline_barbell", "cx_same", "cx_same_2"]);
assert.equal(new Set(normalized.customExercises.map((item) => item.id)).size, 2);
assert.equal(new Set((normalized.templates ?? []).map((item) => item.id)).size, 2);
assert.equal(normalized.schedule.microcycle?.[0].templateId, undefined);
assert.equal(inspectDataHealth(normalized).status, "healthy");

const identityCollisionBackup = parseBackupWithMeta(JSON.stringify({
  app: "fitlog",
  version: 18,
  days: {
    "2026-07-02": {
      date: "2026-07-02",
      workout: {
        type: "push",
        done: true,
        exercises: [
          { id: "px_barbell_bench", name: "平板杠铃卧推", isMain: true, sets: [{ weight: 80, reps: 8 }] },
          { id: "px_barbell_bench", name: "自定义腿推", isMain: false, sets: [{ weight: 120, reps: 10 }] },
          { id: "cx_duplicate", name: "自定义动作 B", isMain: false, sets: [{ weight: 20, reps: 12 }] },
        ],
      },
    },
  },
  bodyWeights: [],
  waistEntries: [],
  customExercises: [
    {
      id: "px_barbell_bench",
      name: "自定义腿推",
      aliases: ["Custom Leg Press"],
      isMain: false,
      type: "custom",
      primaryMuscle: "quads",
      alternatives: ["px_barbell_bench"],
    },
    { id: "cx_duplicate", name: "自定义动作 A", isMain: false, type: "custom", primaryMuscle: "chest" },
    { id: "cx_duplicate", name: "自定义动作 B", isMain: false, type: "custom", primaryMuscle: "sideDelt" },
  ],
  favoriteExerciseIds: ["px_barbell_bench", "cx_duplicate"],
  templates: [{
    id: "tpl_identity_collision",
    name: "身份迁移",
    type: "push",
    items: [
      { exerciseId: "px_barbell_bench", name: "自定义腿推", sets: 3, repsLow: 8, repsHigh: 12 },
      { exerciseId: "cx_duplicate", name: "自定义动作 B", sets: 3, repsLow: 10, repsHigh: 15 },
    ],
  }],
  schedule: { split: ["push", "pull", "legs", "rest", "push", "pull", "rest"] },
  adaptiveTraining: exportTrainingPolicyBackup({
    ...defaultTrainingPolicy("2026-07-02T00:00:00.000Z"),
    exercisePreferences: { px_barbell_bench: "exclude", cx_duplicate: "prefer" },
    restrictions: [{ id: "restriction_collision", exerciseId: "px_barbell_bench", level: "exclude" }],
    overrides: [{
      id: "override_collision",
      scope: "microcycle",
      effectiveFrom: "2026-07-02",
      excludedExerciseIds: ["px_barbell_bench", "cx_duplicate"],
    }],
    rollbackSnapshot: {
      id: "rollback_collision",
      createdAt: "2026-07-02T00:00:00.000Z",
      proposalId: "proposal_collision",
      reason: "测试身份迁移",
      templates: [{
        templateId: "tpl_identity_collision",
        items: [{ exerciseId: "px_barbell_bench", name: "自定义腿推", sets: 3, repsLow: 8, repsHigh: 12 }],
      }],
    },
  }),
}));
const collisionData = identityCollisionBackup.data;
assert.deepEqual(collisionData.customExercises.map((item) => item.id), ["px_barbell_bench_2", "cx_duplicate", "cx_duplicate_2"]);
assert.deepEqual(collisionData.favoriteExerciseIds, ["px_barbell_bench", "px_barbell_bench_2", "cx_duplicate", "cx_duplicate_2"]);
assert.deepEqual(
  collisionData.days["2026-07-02"].workout?.exercises.map((item) => item.id),
  ["px_barbell_bench", "px_barbell_bench_2", "cx_duplicate_2"],
  "Snapshot names must keep built-in, colliding custom, and duplicate custom histories isolated",
);
assert.deepEqual(collisionData.templates?.[0].items.map((item) => item.exerciseId), ["px_barbell_bench_2", "cx_duplicate_2"]);
assert.deepEqual(
  collisionData.customExercises[0].alternatives,
  ["px_barbell_bench", "px_barbell_bench_2"],
  "Nameless alternative references retain every valid collision candidate",
);
assert.deepEqual(normalizeData(collisionData), collisionData, "Exercise identity migration must be idempotent");
assert.equal(identityCollisionBackup.adaptiveTraining?.exercisePreferences.px_barbell_bench, "exclude");
assert.equal(identityCollisionBackup.adaptiveTraining?.exercisePreferences.px_barbell_bench_2, "exclude");
assert.equal(identityCollisionBackup.adaptiveTraining?.exercisePreferences.cx_duplicate_2, "prefer");
assert.deepEqual(
  identityCollisionBackup.adaptiveTraining?.restrictions.map((item) => item.exerciseId),
  ["px_barbell_bench", "px_barbell_bench_2"],
);
assert.deepEqual(
  identityCollisionBackup.adaptiveTraining?.overrides[0].excludedExerciseIds,
  ["px_barbell_bench", "px_barbell_bench_2", "cx_duplicate", "cx_duplicate_2"],
);
assert.equal(
  identityCollisionBackup.adaptiveTraining?.rollbackSnapshot?.templates[0].items[0].exerciseId,
  "px_barbell_bench_2",
);
assert.ok(inspectDataHealth({
  ...collisionData,
  customExercises: [{ ...collisionData.customExercises[0], id: "px_barbell_bench" }],
}).issues.some((issue) => issue.code === "customExerciseIdCollisions"));

const sharedTemplateTrack = defaultTrackId("px_barbell_bench", "hypertrophy", 8, 12, 4, "reps");
assert.equal(sharedTemplateTrack, "px_barbell_bench-hypertrophy-4x8-12", "Existing safe track ids must stay byte-for-byte stable");
assert.notEqual(
  defaultTrackId("动作甲", "hypertrophy", 8, 12, 4, "reps"),
  defaultTrackId("动作乙", "hypertrophy", 8, 12, 4, "reps"),
  "Imported non-ASCII exercise ids must not collapse into one generated track",
);
assert.equal(
  progressionTrackIdsMatch(
    "-hypertrophy-3x8-12",
    defaultTrackId("动作甲", "hypertrophy", 8, 12, 4, "reps"),
    "动作甲",
  ),
  true,
  "Legacy generated tracks for non-ASCII exercises remain in the same history family",
);
assert.notEqual(
  templateScopedIndependentTrackId(sharedTemplateTrack, "模板甲"),
  templateScopedIndependentTrackId(sharedTemplateTrack, "模板乙"),
  "Imported non-ASCII template ids must keep independent histories isolated",
);
const legacyUnicodeTemplateTrack = `${sharedTemplateTrack}-ind-${"模板甲".replace(/[^a-zA-Z0-9_-]/g, "-")}`;
assert.equal(
  retargetTemplateScopedTrackId(legacyUnicodeTemplateTrack, "px_barbell_bench", "hypertrophy", 8, 12, "模板甲"),
  legacyUnicodeTemplateTrack,
  "Existing unsafe template tracks remain intact instead of silently losing history",
);
const sourceTemplateTrack = templateScopedIndependentTrackId(sharedTemplateTrack, "tpl_source");
const copiedTemplate = canonicalizeLibraryTemplate({
  id: "tpl_copy",
  name: "复制模板",
  type: "push",
  items: [{
    exerciseId: "px_barbell_bench",
    name: "平板杠铃卧推",
    sets: 4,
    repsLow: 8,
    repsHigh: 12,
    prescription: {
      progressionTrackId: sourceTemplateTrack,
      progressionTrackLabel: "增肌 · 8–12 次 · 独立",
      trainingIntent: "hypertrophy",
      targetRepMin: 8,
      targetRepMax: 12,
      workingSets: 4,
      loadIncrementKg: 2.5,
      progressionRule: "doubleProgression",
    },
  }],
});
assert.equal(copiedTemplate.items[0].prescription?.progressionTrackId, templateScopedIndependentTrackId(sharedTemplateTrack, "tpl_copy"), "A copied template must own a fresh independent history track");

const rawRecoveryTemplate: Template = {
  id: "tpl_recovery_copy",
  name: "误存恢复模板",
  type: "push",
  items: [{
    exerciseId: "px_barbell_bench",
    name: "平板杠铃卧推",
    sets: 2,
    repsLow: 8,
    repsHigh: 12,
    prescription: {
      progressionTrackId: `${sourceTemplateTrack}:deload`,
      progressionTrackLabel: "恢复 · 增肌 · 8–12 次 · 独立",
      trainingIntent: "hypertrophy",
      targetRepMin: 8,
      targetRepMax: 12,
      workingSets: 2,
      loadIncrementKg: 2.5,
      progressionRule: "custom",
    },
  }],
};
const recoveredLibraryTemplate = canonicalizeLibraryTemplate(rawRecoveryTemplate);
assert.equal(recoveredLibraryTemplate.items[0].sets, 4, "A generated recovery prescription restores its original build set count in the library");
assert.equal(recoveredLibraryTemplate.items[0].prescription?.progressionTrackId, templateScopedIndependentTrackId(sharedTemplateTrack, rawRecoveryTemplate.id));
assert.equal(recoveredLibraryTemplate.items[0].prescription?.progressionRule, "doubleProgression");

const normalizedTemplateLifecycle = normalizeData({
  templates: [rawRecoveryTemplate],
  days: {
    "2026-07-25": {
      date: "2026-07-25",
      workout: {
        type: "push",
        done: true,
        cyclePhase: "deload",
        templateId: rawRecoveryTemplate.id,
        templateSnapshot: rawRecoveryTemplate,
        exercises: [],
      },
    },
  },
  bodyWeights: [],
  waistEntries: [],
  customExercises: [],
  schedule: { split: ["push", "pull", "legs", "rest", "push", "pull", "rest"] },
});
assert.equal(normalizedTemplateLifecycle.templates?.[0].items[0].prescription?.progressionTrackId.endsWith(":deload"), false, "Only reusable library prescriptions are repaired during normalization");
assert.equal(normalizedTemplateLifecycle.days["2026-07-25"].workout?.templateSnapshot?.items[0].prescription?.progressionTrackId.endsWith(":deload"), true, "Historical recovery snapshots remain immutable");

const strengthTemplateItem = {
  exerciseId: "px_barbell_bench",
  name: "平板杠铃卧推",
  sets: 4,
  repsLow: 4,
  repsHigh: 6,
  progressionTrackId: "bench-strength",
};
const hypertrophyTemplateItem = {
  exerciseId: "px_incline_barbell",
  name: "上斜杠铃卧推",
  sets: 3,
  repsLow: 8,
  repsHigh: 12,
  progressionTrackId: "incline-hypertrophy",
};
const duplicateTemplateSchedule = {
  split: ["push", "pull", "legs", "rest", "push", "pull", "rest"],
  microcycle: [
    { id: "duplicate_step", type: "push", label: "胸力量", templateId: "tpl_duplicate" },
    { id: "duplicate_step", type: "push", label: "胸次数", templateId: "tpl_duplicate" },
  ],
} satisfies Schedule;
const templateIdentityBackup = parseBackupWithMeta(JSON.stringify({
  app: "fitlog",
  version: 18,
  days: {
    "2026-07-03": {
      date: "2026-07-03",
      workout: {
        type: "push",
        templateId: "tpl_duplicate",
        templateSnapshot: { id: "tpl_duplicate", name: "胸力量", type: "push", items: [strengthTemplateItem] },
        microcycleId: "mc_template_identity",
        microcycleStepId: "duplicate_step",
        done: true,
        exercises: [{ id: "px_barbell_bench", name: "平板杠铃卧推", isMain: true, sets: [{ weight: 90, reps: 5 }] }],
      },
    },
    "2026-07-04": {
      date: "2026-07-04",
      workout: {
        type: "push",
        templateId: "tpl_duplicate",
        templateSnapshot: { id: "tpl_duplicate", name: "胸次数", type: "push", items: [hypertrophyTemplateItem] },
        microcycleId: "mc_template_identity",
        microcycleStepId: "duplicate_step",
        done: true,
        exercises: [{ id: "px_incline_barbell", name: "上斜杠铃卧推", isMain: true, sets: [{ weight: 70, reps: 10 }] }],
      },
    },
  },
  bodyWeights: [],
  waistEntries: [],
  customExercises: [],
  templates: [
    { id: "tpl_duplicate", name: "胸力量", type: "push", items: [strengthTemplateItem] },
    { id: "tpl_duplicate", name: "胸次数", type: "push", items: [hypertrophyTemplateItem] },
  ],
  schedule: duplicateTemplateSchedule,
  cutPlan: { trainingTemplateIds: { push: "tpl_duplicate" } },
  microcycle: {
    currentId: "mc_template_identity",
    startedAt: "2026-07-03",
    index: 1,
    steps: [
      {
        id: "duplicate_step",
        type: "push",
        label: "胸力量",
        templateId: "tpl_duplicate",
        templateSnapshot: { id: "tpl_duplicate", name: "胸力量", type: "push", items: [strengthTemplateItem] },
      },
      {
        id: "duplicate_step",
        type: "push",
        label: "胸次数",
        templateId: "tpl_duplicate",
        templateSnapshot: { id: "tpl_duplicate", name: "胸次数", type: "push", items: [hypertrophyTemplateItem] },
      },
    ],
  },
  lastCycleReview: {
    id: "review_template_identity",
    sourceMicrocycleId: "mc_previous",
    appliedAt: "2026-07-03T00:00:00.000Z",
    nextPhase: "build",
    changes: [{ templateId: "tpl_duplicate", exerciseId: "px_barbell_bench", fromSets: 3, toSets: 4 }],
  },
  adaptiveTraining: exportTrainingPolicyBackup({
    ...defaultTrainingPolicy("2026-07-03T00:00:00.000Z"),
    decisionEvents: [{
      id: "decision_template_identity",
      at: "2026-07-03T00:00:00.000Z",
      proposalId: "proposal_template_identity",
      outcome: "accepted",
      summary: "测试模板身份迁移",
      templateIds: ["tpl_duplicate"],
    }],
    rollbackSnapshot: {
      id: "rollback_template_identity",
      createdAt: "2026-07-03T00:00:00.000Z",
      proposalId: "proposal_template_identity",
      reason: "测试模板身份迁移",
      templates: [{ templateId: "tpl_duplicate", items: [hypertrophyTemplateItem] }],
      schedule: duplicateTemplateSchedule,
    },
  }),
}));
const templateCollisionData = templateIdentityBackup.data;
assert.deepEqual(templateCollisionData.templates?.map((template) => template.id), ["tpl_duplicate", "tpl_duplicate_2"]);
assert.deepEqual(templateCollisionData.schedule.microcycle?.map((step) => step.templateId), ["tpl_duplicate", "tpl_duplicate_2"]);
assert.deepEqual(templateCollisionData.schedule.microcycle?.map((step) => step.id), ["duplicate_step", "duplicate_step_2"]);
assert.deepEqual(templateCollisionData.microcycle?.steps?.map((step) => step.templateId), ["tpl_duplicate", "tpl_duplicate_2"]);
assert.deepEqual(templateCollisionData.microcycle?.steps?.map((step) => step.id), ["duplicate_step", "duplicate_step_2"]);
assert.equal(templateCollisionData.microcycle?.steps?.[1].templateSnapshot?.id, "tpl_duplicate_2");
assert.equal(templateCollisionData.days["2026-07-03"].workout?.templateId, "tpl_duplicate");
assert.equal(templateCollisionData.days["2026-07-03"].workout?.microcycleStepId, "duplicate_step");
assert.equal(templateCollisionData.days["2026-07-04"].workout?.templateId, "tpl_duplicate_2");
assert.equal(templateCollisionData.days["2026-07-04"].workout?.templateSnapshot?.id, "tpl_duplicate_2");
assert.equal(templateCollisionData.days["2026-07-04"].workout?.microcycleStepId, "duplicate_step_2");
assert.equal(templateCollisionData.cutPlan?.trainingTemplateIds?.push, "tpl_duplicate", "A nameless single-value binding keeps the deterministic first candidate");
assert.deepEqual(templateCollisionData.lastCycleReview?.changes.map((change) => change.templateId), ["tpl_duplicate", "tpl_duplicate_2"]);
assert.deepEqual(templateIdentityBackup.adaptiveTraining?.decisionEvents[0].templateIds, ["tpl_duplicate", "tpl_duplicate_2"]);
assert.equal(templateIdentityBackup.adaptiveTraining?.rollbackSnapshot?.templates[0].templateId, "tpl_duplicate_2");
assert.deepEqual(
  templateIdentityBackup.adaptiveTraining?.rollbackSnapshot?.schedule?.microcycle?.map((step) => step.templateId),
  ["tpl_duplicate", "tpl_duplicate_2"],
);
assert.deepEqual(
  templateIdentityBackup.adaptiveTraining?.rollbackSnapshot?.schedule?.microcycle?.map((step) => step.id),
  ["duplicate_step", "duplicate_step_2"],
);
assert.ok(inspectDataHealth({
  ...templateCollisionData,
  schedule: {
    ...templateCollisionData.schedule,
    microcycle: templateCollisionData.schedule.microcycle?.map((step) => ({ ...step, id: "duplicate_step" })),
  },
}).issues.some((issue) => issue.code === "duplicateMicrocycleStepIds"));
assert.deepEqual(normalizeData(templateCollisionData), templateCollisionData, "Template identity migration must be idempotent");

const isolatedCorruption = normalizeData({
  days: {
    "2026-07-30": {
      workout: {
        type: "push",
        done: true,
        exercises: [
          null,
          7,
          {},
          {
            id: "px_barbell_bench",
            name: "",
            isMain: true,
            sets: [
              { weight: 80, reps: 8, type: "working" },
              { weight: 1e100, reps: 1e100, durationSeconds: 1e100, distanceMeters: 1e100, type: "working" },
            ],
            prescription: {
              progressionTrackId: " malformed-track ",
              progressionTrackLabel: " ",
              trainingIntent: "hypertrophy",
              targetRepMin: Number.NaN,
              targetRepMax: Number.POSITIVE_INFINITY,
              targetRirMin: Number.NaN,
              targetRirMax: Number.POSITIVE_INFINITY,
              workingSets: Number.POSITIVE_INFINITY,
              loadIncrementKg: Number.POSITIVE_INFINITY,
              progressionRule: "doubleProgression",
            },
            plannedLoadKg: 80,
            progressionPlan: {
              origin: "suggestion",
              acceptedAt: "2026-07-30T08:00:00.000Z",
              progressionTrackId: "another-track",
              plannedLoadKg: 80,
            },
            alternatives: "invalid",
          },
          {
            id: " px_lateral_raise ",
            name: "",
            isMain: false,
            sets: [{ weight: 10, reps: 12, type: "working" }],
            progressionTrackId: "   ",
            targetRepMin: Number.NaN,
            targetRepMax: Number.POSITIVE_INFINITY,
            workingSets: Number.POSITIVE_INFINITY,
            plannedLoadKg: 1e100,
          },
        ],
      },
    },
  },
  customExercises: [{
    id: " malformed_custom ",
    name: " 自定义动作 ",
    primaryMuscle: "chest",
    secondaryMuscles: "invalid",
    volumeContributions: "invalid",
    aliases: "invalid",
    alternatives: "invalid",
    equipment: "spaceship",
    defaultLoadIncrementKg: Number.POSITIVE_INFINITY,
  }],
  muscleTargets: { chest: { low: Number.NaN, high: Number.POSITIVE_INFINITY } },
  microcycle: { currentId: "mc_invalid_numeric", startedAt: "2026-07-30", index: Number.NaN },
} as unknown as AppData);
assert.equal(isolatedCorruption.days["2026-07-30"].workout?.exercises.length, 2, "Malformed exercise entries must be isolated instead of aborting the whole backup");
assert.equal(isolatedCorruption.days["2026-07-30"].workout?.exercises[0].name, "平板杠铃卧推", "A valid built-in id can recover a missing display name");
assert.equal(isolatedCorruption.days["2026-07-30"].workout?.exercises[0].sets[0].weight, 80);
assert.deepEqual(isolatedCorruption.days["2026-07-30"].workout?.exercises[0].sets[1], {
  weight: 5_000,
  reps: 100_000,
  durationSeconds: 604_800,
  distanceMeters: 10_000_000,
  type: "working",
});
assert.equal(isolatedCorruption.days["2026-07-30"].workout?.exercises[0].prescription?.progressionTrackId, "malformed-track");
assert.equal(isolatedCorruption.days["2026-07-30"].workout?.exercises[0].prescription?.progressionTrackLabel, "训练轨道");
assert.equal(isolatedCorruption.days["2026-07-30"].workout?.exercises[0].progressionPlan, undefined, "A planned-load snapshot from another track must not survive normalization");
assert.deepEqual(isolatedCorruption.days["2026-07-30"].workout?.exercises[0].prescription && {
  targetRepMin: isolatedCorruption.days["2026-07-30"].workout?.exercises[0].prescription?.targetRepMin,
  targetRepMax: isolatedCorruption.days["2026-07-30"].workout?.exercises[0].prescription?.targetRepMax,
  workingSets: isolatedCorruption.days["2026-07-30"].workout?.exercises[0].prescription?.workingSets,
  loadIncrementKg: isolatedCorruption.days["2026-07-30"].workout?.exercises[0].prescription?.loadIncrementKg,
}, { targetRepMin: 8, targetRepMax: 12, workingSets: 3, loadIncrementKg: 2.5 });
assert.equal(isolatedCorruption.days["2026-07-30"].workout?.exercises[1].id, "px_lateral_raise");
assert.equal(isolatedCorruption.days["2026-07-30"].workout?.exercises[1].prescription?.progressionTrackId, "legacy:px_lateral_raise", "A blank legacy track must fall back to an isolated legacy track");
assert.equal(isolatedCorruption.days["2026-07-30"].workout?.exercises[1].plannedLoadKg, undefined);
assert.equal(isolatedCorruption.muscleTargets, undefined);
assert.equal(isolatedCorruption.microcycle?.index, 1);
assert.equal(isolatedCorruption.customExercises[0].id, "malformed_custom");
assert.equal(isolatedCorruption.customExercises[0].aliases, undefined);
assert.equal(isolatedCorruption.customExercises[0].alternatives, undefined);
assert.equal(isolatedCorruption.customExercises[0].equipment, undefined);
assert.deepEqual(isolatedCorruption.customExercises[0].volumeContributions, [{ muscle: "chest", weight: 1, direct: true }]);

const backup = toBackup(normalized);
assert.equal(backup.version, SCHEMA_VERSION);
assert.equal(backup.version, 18);
assert.equal(backup.adaptiveTraining?.version, 3);
assert.deepEqual(backup.favoriteExerciseIds, ["px_incline_barbell", "cx_same", "cx_same_2"]);
assert.equal(backup.days["2026-07-01"].workout?.exercises[0].progressionTrackId, undefined);
assert.equal(backup.days["2026-07-01"].workout?.exercises[0].prescription?.progressionTrackId, "incline-strength");
assert.ok(backup.mesocycle, "Schema 14 backups include mesocycle state");
assert.equal(backup.days["2026-07-01"].recovery?.energy, 4, "Schema 18 backups preserve recovery and adaptive training state");

{
  const writes: string[] = [];
  const runtime = globalThis as typeof globalThis & { window?: Window };
  const previousWindow = runtime.window;
  Object.defineProperty(runtime, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: () => null,
        setItem: (key: string) => writes.push(key),
        removeItem: (key: string) => writes.push(key),
      },
      dispatchEvent: () => true,
    } as unknown as Window,
  });
  const preview = parseBackupWithMeta(JSON.stringify({
    ...backup,
    adaptiveTraining: exportTrainingPolicyBackup(defaultTrainingPolicy("2026-07-01T00:00:00.000Z")),
  }));
  assert.equal(preview.adaptiveTraining?.version, 3);
  assert.deepEqual(writes, [], "Previewing a backup must not mutate training policy storage");
  if (previousWindow) {
    Object.defineProperty(runtime, "window", { configurable: true, value: previousWindow });
  } else {
    Reflect.deleteProperty(runtime, "window");
  }
}

const adaptiveSnapshotRoundTrip = normalizeData(toBackup({
  ...normalized,
  days: {
    ...normalized.days,
    "2026-07-02": {
      date: "2026-07-02",
      workout: {
        type: "push",
        done: false,
        exercises: [],
        adaptiveSnapshot: {
          version: 1,
          createdAt: "2026-07-02T08:00:00.000Z",
          sourceDate: "2026-07-02",
          evidenceRevision: "evidence-test",
          state: "conservative",
          confidence: "building",
          mode: "evidence",
          volumeScale: 0.85,
          normalWorkingSets: 20,
          prescribedWorkingSets: 17,
          maxSessionMinutes: 75,
          reasons: ["恢复证据建议保守训练"],
        },
      },
    },
  },
}));
assert.equal(adaptiveSnapshotRoundTrip.days["2026-07-02"].workout?.adaptiveSnapshot?.volumeScale, 0.85);
assert.equal(adaptiveSnapshotRoundTrip.days["2026-07-02"].workout?.adaptiveSnapshot?.prescribedWorkingSets, 17);

const healthBase = normalizeData({
  days: {
    "2026-07-25": {
      date: "2026-07-25",
      recovery: { sleepHours: 7, energy: 4 },
    },
  },
  bodyWeights: [{ date: "2026-07-25", weight: 78 }],
  waistEntries: [],
  customExercises: [],
  schedule: { split: ["push", "pull", "legs", "rest", "push", "pull", "rest"] },
});
const healthPayload = {
  schemaVersion: 1,
  generatedAt: "2026-07-26T09:00:00.000Z",
  rangeStart: "2026-04-28",
  rangeEnd: "2026-07-26",
  days: [
    { date: "2026-07-25", steps: 9500, activeEnergyKcal: 620, exerciseMinutes: 58, restingHeartRate: 54, heartRateVariabilityMs: 71, sleepMinutes: 462 },
    { date: "2026-07-26", steps: 1200, sleepMinutes: 430 },
    { date: "2026-02-31", steps: 9999 },
    { date: "2026-07-24", steps: -1 },
  ],
  bodyWeights: [
    { date: "2026-07-25", weightKg: 77.6 },
    { date: "2026-07-26", weightKg: 77.4 },
  ],
};
const parsedHealth = normalizeAppleHealthSnapshot(healthPayload);
assert.equal(parsedHealth.days.length, 2, "Invalid dates and empty metric rows must be rejected");
const healthMerged = mergeAppleHealthSnapshot(healthBase, healthPayload);
assert.equal(healthMerged.data.bodyWeights.find((entry) => entry.date === "2026-07-25")?.weight, 78, "Manual same-day weight must win");
assert.deepEqual(healthMerged.data.bodyWeights.find((entry) => entry.date === "2026-07-26"), { date: "2026-07-26", weight: 77.4, source: "appleHealth" });
assert.equal(healthMerged.data.days["2026-07-25"].recovery?.sleepHours, 7, "Objective sleep must not overwrite subjective recovery input");
assert.equal(healthMerged.data.days["2026-07-25"].health?.sleepMinutes, 462);
assert.equal(healthMerged.summary.preservedManualWeights, 1);
assert.equal(healthMerged.summary.importedWeights, 1);
assert.equal(healthMerged.data.healthSync?.importedDays, 2);
const healthRoundTrip = normalizeData(toBackup(healthMerged.data));
assert.equal(healthRoundTrip.days["2026-07-25"].health?.heartRateVariabilityMs, 71);
assert.equal(healthRoundTrip.bodyWeights.find((entry) => entry.date === "2026-07-26")?.source, "appleHealth");
assert.equal(healthRoundTrip.healthSync?.provider, "appleHealth");

const healthResync = mergeAppleHealthSnapshot(healthMerged.data, {
  ...healthPayload,
  generatedAt: "2026-07-26T10:00:00.000Z",
  days: [{ date: "2026-07-26", steps: 2200, sleepMinutes: 430 }],
  bodyWeights: [{ date: "2026-07-26", weightKg: 77.2 }],
});
assert.equal(healthResync.data.days["2026-07-26"].health?.steps, 2200);
assert.equal(healthResync.data.bodyWeights.find((entry) => entry.date === "2026-07-26")?.weight, 77.2);
assert.equal(healthResync.summary.updatedWeights, 1);

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

const sharedPlanTrack3 = defaultTrackId("px_barbell_bench", "hypertrophy", 8, 12, 3, "reps");
const sharedPlanTrack4 = defaultTrackId("px_barbell_bench", "hypertrophy", 8, 12, 4, "reps");
const sharedPlanRoundTripInput = {
  days: {
    "2026-07-11": {
      date: "2026-07-11",
      workout: {
        type: "push",
        done: true,
        exercises: [{
          id: "px_barbell_bench",
          name: "平板杠铃卧推",
          isMain: true,
          sets: [{ weight: 82.5, reps: 8 }, { weight: 82.5, reps: 8 }, { weight: 82.5, reps: 8 }, { weight: 82.5, reps: 8 }],
          plannedLoadKg: 82.5,
          prescription: {
            progressionTrackId: sharedPlanTrack4,
            progressionTrackLabel: "增肌 · 8–12 次",
            trainingIntent: "hypertrophy",
            targetRepMin: 8,
            targetRepMax: 12,
            workingSets: 4,
            loadIncrementKg: 2.5,
            progressionRule: "doubleProgression",
          },
          progressionPlan: {
            origin: "suggestion",
            acceptedAt: "2026-07-11T09:00:00.000Z",
            progressionTrackId: sharedPlanTrack3,
            plannedLoadKg: 82.5,
            suggestionStatus: "addWeight",
          },
        }],
      },
    },
  },
};
const sharedPlanRoundTrip = normalizeData(sharedPlanRoundTripInput);
assert.equal(sharedPlanRoundTrip.days["2026-07-11"].workout?.exercises[0].progressionPlan?.progressionTrackId, sharedPlanTrack3, "Normalization preserves an accepted plan from the same generated track family");
const changedPlanRoundTrip = normalizeData({
  ...sharedPlanRoundTripInput,
  days: {
    "2026-07-11": {
      ...sharedPlanRoundTripInput.days["2026-07-11"],
      workout: {
        ...sharedPlanRoundTripInput.days["2026-07-11"].workout,
        exercises: [{
          ...sharedPlanRoundTripInput.days["2026-07-11"].workout.exercises[0],
          progressionPlan: {
            ...sharedPlanRoundTripInput.days["2026-07-11"].workout.exercises[0].progressionPlan,
            progressionTrackId: defaultTrackId("px_barbell_bench", "strength", 4, 6, 4, "reps"),
          },
        }],
      },
    },
  },
});
assert.equal(changedPlanRoundTrip.days["2026-07-11"].workout?.exercises[0].progressionPlan, undefined, "Normalization still drops an accepted plan from a different intent track");

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
