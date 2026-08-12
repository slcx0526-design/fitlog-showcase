import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { mergeAppData, estimateDataFootprint } from "../lib/dataMerge";
import { calculatePlateLoad } from "../lib/plateCalculator";
import { buildPersonalCalibration } from "../lib/personalization";
import { defaultTrackId } from "../lib/prescription";
import { needsStarterSetup, STARTER_PLANS } from "../lib/starterPlans";
import { emptyData, normalizeData, parseBackup, SCHEMA_VERSION, toBackup } from "../lib/storage";
import type { AppData, DayLog, Exercise, Schedule, Template } from "../lib/types";

const packageManifest = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8")) as { version?: string; packages?: Record<string, { version?: string }> };
const releaseVersion = packageManifest.version;
assert.equal(packageLock.version, releaseVersion, "package-lock root version must match package.json");
assert.equal(packageLock.packages?.[""].version, releaseVersion, "package-lock workspace version must match package.json");
const synchronizedReleaseMarkers = [
  ["app/layout.tsx", `FitLog ${releaseVersion}`],
  ["public/fitlog-build.txt", `FitLog ${releaseVersion}`],
  ["public/sw.js", `fitlog-runtime-v${releaseVersion.replaceAll(".", "-")}`],
  ["native/ios/project.yml", `MARKETING_VERSION: "${releaseVersion}"`],
  ["native/ios/FitLog.xcodeproj/project.pbxproj", `MARKETING_VERSION = ${releaseVersion};`],
] as const;
const repositoryOwnedReleaseMarkers = existsSync("scripts/publish-showcase.sh")
  ? ([
      ["CHANGELOG.md", `## [${releaseVersion}]`],
      ["README.md", `Current version: **${releaseVersion}**`],
    ] as const)
  : [];
for (const [path, marker] of [...synchronizedReleaseMarkers, ...repositoryOwnedReleaseMarkers]) {
  assert.ok(readFileSync(path, "utf8").includes(marker), `${path} must expose release ${releaseVersion}`);
}

assert.equal(STARTER_PLANS.length, 3);
assert.deepEqual(STARTER_PLANS.map((plan) => plan.trainingDays), [3, 5, 6]);
for (const plan of STARTER_PLANS) {
  const ids = new Set(plan.templates.map((template) => template.id));
  assert.ok(plan.templates.every((template) => template.items.length >= 4));
  assert.ok(plan.schedule.microcycle?.every((step) => !step.templateId || ids.has(step.templateId)));
}
assert.equal(needsStarterSetup(emptyData()), true);
assert.equal(needsStarterSetup({ ...emptyData(), onboarding: { dismissedAt: "2026-07-26T00:00:00.000Z" } }), false);
assert.equal(needsStarterSetup({ ...emptyData(), templates: STARTER_PLANS[0].templates }), false);

const plates = calculatePlateLoad(100, 20, [20, 10, 5, 2.5, 1.25]);
assert.equal(plates.exact, true);
assert.equal(plates.achievedKg, 100);
assert.deepEqual(plates.platesPerSide, [20, 20]);
const unavailablePlate = calculatePlateLoad(83, 20, [20, 10, 5, 2.5, 1.25]);
assert.equal(unavailablePlate.exact, false);
assert.equal(unavailablePlate.achievedKg, 82.5);
assert.equal(unavailablePlate.remainderKg, 0.5);
const nonCanonicalPlates = calculatePlateLoad(60, 20, [15, 10]);
assert.equal(nonCanonicalPlates.exact, true);
assert.deepEqual(nonCanonicalPlates.platesPerSide, [10, 10]);

const trackId = defaultTrackId("px_barbell_bench", "hypertrophy", 8, 12, 8, "reps");
function bench(weight: number, setCount = 8): Exercise {
  return {
    id: "px_barbell_bench",
    name: "平板杠铃卧推",
    isMain: true,
    equipment: "free",
    primaryMuscle: "chest",
    volumeContributions: [{ muscle: "chest", weight: 1, direct: true }],
    supersetGroup: "A",
    prescription: {
      progressionTrackId: trackId,
      progressionTrackLabel: "增肌 · 8–12 次",
      trainingIntent: "hypertrophy",
      targetRepMin: 8,
      targetRepMax: 12,
      targetRirMin: 1,
      targetRirMax: 2,
      workingSets: setCount,
      loadIncrementKg: 2.5,
      progressionRule: "doubleProgression",
      performanceMode: "reps",
    },
    sets: Array.from({ length: setCount }, (_, index) => ({
      weight,
      reps: 10,
      type: "working" as const,
      at: `2026-07-0${index + 1}T00:00:00.000Z`,
    })),
  };
}

function cycleDay(date: string, microcycleId: string, weight: number, includeBench: boolean, setCount = 8): DayLog {
  return {
    date,
    workout: {
      type: includeBench ? "push" : "pull",
      microcycleId,
      done: true,
      cyclePhase: "build",
      difficulty: "onTarget",
      exercises: includeBench
        ? [bench(weight, setCount)]
        : [{
            id: "pl_lat_pulldown",
            name: "宽握下拉",
            isMain: true,
            sets: [{ weight: 50, reps: 10, type: "working" }],
            primaryMuscle: "lats",
            volumeContributions: [{ muscle: "lats", weight: 1, direct: true }],
          }],
    },
  };
}

function restDay(date: string, microcycleId: string): DayLog {
  return {
    date,
    workout: {
      type: "rest",
      microcycleId,
      done: true,
      cyclePhase: "build",
      exercises: [],
    },
  };
}

const calibrationData: AppData = {
  ...emptyData(),
  profile: { trainingLevel: "beginner" },
  days: {
    "2026-07-01": withCycleContext(cycleDay("2026-07-01", "mc_1", 60, true), "meso_calibration", 1),
    "2026-07-02": withCycleContext(cycleDay("2026-07-02", "mc_1", 60, false), "meso_calibration", 1),
    "2026-07-03": withCycleContext(restDay("2026-07-03", "mc_1"), "meso_calibration", 1),
    "2026-07-04": withCycleContext(restDay("2026-07-04", "mc_1"), "meso_calibration", 1),
    "2026-07-05": withCycleContext(restDay("2026-07-05", "mc_1"), "meso_calibration", 1),
    "2026-07-06": withCycleContext(restDay("2026-07-06", "mc_1"), "meso_calibration", 1),
    "2026-07-07": withCycleContext(restDay("2026-07-07", "mc_1"), "meso_calibration", 1),
    "2026-07-08": withCycleContext(cycleDay("2026-07-08", "mc_2", 62.5, true), "meso_calibration", 2),
    "2026-07-09": withCycleContext(cycleDay("2026-07-09", "mc_2", 62.5, false), "meso_calibration", 2),
    "2026-07-10": withCycleContext(restDay("2026-07-10", "mc_2"), "meso_calibration", 2),
    "2026-07-11": withCycleContext(restDay("2026-07-11", "mc_2"), "meso_calibration", 2),
    "2026-07-12": withCycleContext(restDay("2026-07-12", "mc_2"), "meso_calibration", 2),
    "2026-07-13": withCycleContext(restDay("2026-07-13", "mc_2"), "meso_calibration", 2),
    "2026-07-14": withCycleContext(restDay("2026-07-14", "mc_2"), "meso_calibration", 2),
    "2026-07-15": withCycleContext(cycleDay("2026-07-15", "mc_3", 65, true), "meso_calibration", 3),
    "2026-07-16": withCycleContext(cycleDay("2026-07-16", "mc_3", 65, false), "meso_calibration", 3),
    "2026-07-17": withCycleContext(restDay("2026-07-17", "mc_3"), "meso_calibration", 3),
    "2026-07-18": withCycleContext(restDay("2026-07-18", "mc_3"), "meso_calibration", 3),
    "2026-07-19": withCycleContext(restDay("2026-07-19", "mc_3"), "meso_calibration", 3),
    "2026-07-20": withCycleContext(restDay("2026-07-20", "mc_3"), "meso_calibration", 3),
    "2026-07-21": withCycleContext(restDay("2026-07-21", "mc_3"), "meso_calibration", 3),
  },
  microcycle: { currentId: "mc_current", startedAt: "2026-07-22", index: 4, mesocycleId: "meso_calibration", mesocycleCycleNumber: 4 },
};
const chestCalibration = buildPersonalCalibration(calibrationData, "2026-07-26").find((row) => row.muscle === "chest");
assert.equal(chestCalibration?.sampledCycles, 3);
assert.equal(chestCalibration?.typicalDirectSets, 8);
assert.equal(chestCalibration?.improvingTracks, 1);
assert.equal(chestCalibration?.action, "personalize");

const activePressureData = structuredClone(calibrationData);
activePressureData.microcycle = {
  ...activePressureData.microcycle!,
  steps: [
    { id: "active_push_1", type: "push", label: "推 1" },
    { id: "active_push_2", type: "push", label: "推 2" },
    { id: "active_push_3", type: "push", label: "推 3" },
    { id: "active_rest", type: "rest", label: "休息" },
  ],
};
for (const [index, date] of ["2026-07-22", "2026-07-23", "2026-07-24"].entries()) {
  const day = withCycleContext(cycleDay(date, "mc_current", 50 - index * 2.5, true), "meso_calibration", 4);
  day.workout = { ...day.workout!, microcycleStepId: `active_push_${index + 1}`, difficulty: "hard" };
  activePressureData.days[date] = day;
}
const activePressureChest = buildPersonalCalibration(activePressureData, "2026-07-26").find((row) => row.muscle === "chest");
assert.equal(activePressureChest?.difficultySamples, 3, "An unfinished active cycle must not enter long-term calibration difficulty evidence");
assert.equal(activePressureChest?.improvingTracks, 1, "An unfinished active cycle must not alter finalized track trends");
assert.equal(activePressureChest?.action, "personalize");

const variableCycleCalibrationData: AppData = {
  ...emptyData(),
  profile: { trainingLevel: "beginner" },
  days: {
    "2026-07-01": withCycleContext(cycleDay("2026-07-01", "mc_short", 60, true, 4), "meso_variable", 1),
    "2026-07-02": withCycleContext(cycleDay("2026-07-02", "mc_short", 60, false), "meso_variable", 1),
    "2026-07-03": withCycleContext(restDay("2026-07-03", "mc_short"), "meso_variable", 1),
    "2026-07-04": withCycleContext(restDay("2026-07-04", "mc_short"), "meso_variable", 1),
    "2026-07-08": withCycleContext(cycleDay("2026-07-08", "mc_standard", 62.5, true, 7), "meso_variable", 2),
    "2026-07-09": withCycleContext(cycleDay("2026-07-09", "mc_standard", 62.5, false), "meso_variable", 2),
    "2026-07-10": withCycleContext(restDay("2026-07-10", "mc_standard"), "meso_variable", 2),
    "2026-07-11": withCycleContext(restDay("2026-07-11", "mc_standard"), "meso_variable", 2),
    "2026-07-12": withCycleContext(restDay("2026-07-12", "mc_standard"), "meso_variable", 2),
    "2026-07-13": withCycleContext(restDay("2026-07-13", "mc_standard"), "meso_variable", 2),
    "2026-07-14": withCycleContext(restDay("2026-07-14", "mc_standard"), "meso_variable", 2),
  },
  microcycle: { currentId: "mc_current", startedAt: "2026-07-15", index: 3, mesocycleId: "meso_variable", mesocycleCycleNumber: 3 },
};
const variableCycleChest = buildPersonalCalibration(variableCycleCalibrationData, "2026-07-21").find((row) => row.muscle === "chest");
assert.equal(variableCycleChest?.sampledCycles, 2);
assert.equal(variableCycleChest?.typicalDirectSets, 7, "Equivalent weekly dose must match across four-step and seven-step cycles");

function withCycleContext(day: DayLog, mesocycleId: string, cycleNumber: number): DayLog {
  return {
    ...day,
    workout: day.workout ? {
      ...day.workout,
      mesocycleId,
      mesocycleCycleNumber: cycleNumber,
    } : undefined,
  };
}
const resetAwareData: AppData = {
  ...emptyData(),
  days: {
    "2026-06-20": withCycleContext(cycleDay("2026-06-20", "mc_abandoned", 55, true), "meso_1", 1),
    "2026-06-21": withCycleContext(cycleDay("2026-06-21", "mc_abandoned", 55, false), "meso_1", 1),
    "2026-07-01": withCycleContext(cycleDay("2026-07-01", "mc_completed", 60, true), "meso_1", 1),
    "2026-07-02": withCycleContext(cycleDay("2026-07-02", "mc_completed", 60, false), "meso_1", 1),
  },
  microcycle: {
    currentId: "mc_current",
    startedAt: "2026-07-10",
    index: 3,
    mesocycleId: "meso_1",
    mesocycleCycleNumber: 2,
  },
};
const resetAwareChest = buildPersonalCalibration(resetAwareData, "2026-07-26").find((row) => row.muscle === "chest");
assert.equal(resetAwareChest?.sampledCycles, 1, "An abandoned reset at the same mesocycle position must not become calibration evidence");
assert.equal(resetAwareChest?.difficultySamples, 1, "Abandoned sessions must not enter finalized-cycle difficulty evidence");
assert.equal(resetAwareChest?.improvingTracks, 0, "Abandoned performance must not create a calibration trend");

const importedTemplate: Template = {
  id: "tpl_imported",
  name: "导入模板",
  type: "push",
  items: STARTER_PLANS[0].templates[0].items,
};
const currentData: AppData = {
  ...emptyData(),
  days: {
    "2026-07-20": { date: "2026-07-20", nutrition: { calories: 2000, protein: 150, carbs: 200, fat: 60 } },
  },
  bodyWeights: [{ date: "2026-07-20", weight: 80 }],
};
const incomingData: AppData = {
  ...emptyData(),
  days: {
    "2026-07-20": { date: "2026-07-20", nutrition: { calories: 1800, protein: 140, carbs: 180, fat: 55 } },
    "2026-07-21": { date: "2026-07-21", recovery: { sleepHours: 8, energy: 4 } },
  },
  bodyWeights: [{ date: "2026-07-20", weight: 79.5 }, { date: "2026-07-21", weight: 79.8 }],
  templates: [importedTemplate],
};
const merged = mergeAppData(currentData, incomingData);
assert.equal(merged.data.days["2026-07-20"].nutrition?.calories, 2000);
assert.equal(merged.data.days["2026-07-21"].recovery?.energy, 4);
assert.equal(merged.data.bodyWeights.find((entry) => entry.date === "2026-07-20")?.weight, 80);
assert.equal(merged.data.bodyWeights.find((entry) => entry.date === "2026-07-21")?.weight, 79.8);
assert.equal(merged.data.templates?.[0].id, "tpl_imported");
assert.equal(merged.summary.importedDays, 1);
assert.equal(merged.summary.importedBodyWeights, 1);
assert.ok(merged.summary.conflicts >= 2);

const partialDayMerge = mergeAppData({
  ...emptyData(),
  days: {
    "2026-07-23": {
      date: "2026-07-23",
      recovery: { energy: 3, at: "2026-07-23T08:00:00.000Z" },
      health: {
        source: "appleHealth",
        steps: 9000,
        updatedAt: "2026-07-23T08:00:00.000Z",
      },
    },
  },
}, {
  ...emptyData(),
  days: {
    "2026-07-23": {
      date: "2026-07-23",
      recovery: { sleepHours: 7.5, energy: 4, at: "2026-07-23T09:00:00.000Z" },
      health: {
        source: "appleHealth",
        steps: 8500,
        sleepMinutes: 450,
        heartRateVariabilityMs: 62,
        updatedAt: "2026-07-23T09:00:00.000Z",
      },
    },
  },
});
assert.equal(partialDayMerge.data.days["2026-07-23"].health?.steps, 9000, "Current metric wins a direct conflict");
assert.equal(partialDayMerge.data.days["2026-07-23"].health?.sleepMinutes, 450, "Missing Health fields merge independently");
assert.equal(partialDayMerge.data.days["2026-07-23"].health?.heartRateVariabilityMs, 62);
assert.equal(partialDayMerge.data.days["2026-07-23"].recovery?.energy, 3);
assert.equal(partialDayMerge.data.days["2026-07-23"].recovery?.sleepHours, 7.5, "Missing recovery fields merge independently");
assert.ok(partialDayMerge.summary.conflicts >= 2);

const profileOnlyCurrent: AppData = {
  ...emptyData(),
  profile: { heightCm: 180, trainingLevel: "intermediate" },
};
const profileConflictMerge = mergeAppData(profileOnlyCurrent, {
  ...incomingData,
  profile: { heightCm: 175, birthYear: 1995 },
});
assert.equal(profileConflictMerge.data.profile?.heightCm, 180);
assert.equal(profileConflictMerge.data.profile?.birthYear, 1995);
assert.ok(profileConflictMerge.summary.conflicts >= 1);

const mergeCollisionCurrent = normalizeData({
  ...emptyData(),
  days: { "2026-07-29": { date: "2026-07-29", recovery: { energy: 4 } } },
  customExercises: [{
    id: "cx_merge_collision",
    name: "当前自定义推胸",
    isMain: false,
    type: "custom",
    primaryMuscle: "chest",
  }],
  templates: [{
    id: "tpl_merge_collision",
    name: "当前胸训练",
    type: "push",
    items: [{ exerciseId: "cx_merge_collision", name: "当前自定义推胸", sets: 3, repsLow: 8, repsHigh: 12 }],
  }],
});
const mergeCollisionIncoming = normalizeData({
  ...emptyData(),
  days: {
    "2026-07-30": {
      date: "2026-07-30",
      workout: {
        type: "push",
        templateId: "tpl_merge_collision",
        templateSnapshot: {
          id: "tpl_merge_collision",
          name: "导入肩训练",
          type: "push",
          items: [{ exerciseId: "cx_merge_collision", name: "导入自定义侧平举", sets: 4, repsLow: 12, repsHigh: 15 }],
        },
        done: true,
        exercises: [{
          id: "cx_merge_collision",
          name: "导入自定义侧平举",
          isMain: false,
          primaryMuscle: "sideDelt",
          volumeContributions: [{ muscle: "sideDelt", weight: 1, direct: true }],
          sets: [{ weight: 12, reps: 15 }],
        }],
      },
    },
  },
  customExercises: [{
    id: "cx_merge_collision",
    name: "导入自定义侧平举",
    isMain: false,
    type: "custom",
    primaryMuscle: "sideDelt",
  }],
  favoriteExerciseIds: ["cx_merge_collision"],
  templates: [{
    id: "tpl_merge_collision",
    name: "导入肩训练",
    type: "push",
    items: [{ exerciseId: "cx_merge_collision", name: "导入自定义侧平举", sets: 4, repsLow: 12, repsHigh: 15 }],
  }],
  cutPlan: { trainingTemplateIds: { push: "tpl_merge_collision" } },
  lastCycleReview: {
    id: "review_merge_collision",
    sourceMicrocycleId: "mc_imported",
    appliedAt: "2026-07-30T00:00:00.000Z",
    nextPhase: "build",
    changes: [{ templateId: "tpl_merge_collision", exerciseId: "cx_merge_collision", fromSets: 3, toSets: 4 }],
  },
});
const collisionMerge = mergeAppData(mergeCollisionCurrent, mergeCollisionIncoming);
assert.deepEqual(collisionMerge.data.customExercises.map((exercise) => exercise.id), ["cx_merge_collision", "cx_merge_collision_2"]);
assert.deepEqual(collisionMerge.data.templates?.map((template) => template.id), ["tpl_merge_collision", "tpl_merge_collision_2"]);
assert.equal(collisionMerge.data.templates?.[1].items[0].exerciseId, "cx_merge_collision_2");
assert.equal(collisionMerge.data.days["2026-07-30"].workout?.exercises[0].id, "cx_merge_collision_2");
assert.equal(collisionMerge.data.days["2026-07-30"].workout?.templateId, "tpl_merge_collision_2");
assert.equal(collisionMerge.data.days["2026-07-30"].workout?.templateSnapshot?.items[0].exerciseId, "cx_merge_collision_2");
assert.deepEqual(collisionMerge.data.favoriteExerciseIds, ["cx_merge_collision_2"]);
assert.equal(collisionMerge.data.cutPlan?.trainingTemplateIds?.push, "tpl_merge_collision_2");
assert.equal(collisionMerge.data.lastCycleReview?.changes[0].templateId, "tpl_merge_collision_2");
assert.equal(collisionMerge.data.lastCycleReview?.changes[0].exerciseId, "cx_merge_collision_2");
assert.equal(collisionMerge.summary.importedCustomExercises, 1);
assert.equal(collisionMerge.summary.importedTemplates, 1);
const repeatedCollisionMerge = mergeAppData(collisionMerge.data, mergeCollisionIncoming);
assert.equal(repeatedCollisionMerge.data.customExercises.length, 2, "Repeating the same merge must not clone the renamed custom exercise again");
assert.equal(repeatedCollisionMerge.data.templates?.length, 2, "Repeating the same merge must not clone the renamed template again");
assert.equal(repeatedCollisionMerge.summary.importedCustomExercises, 0);
assert.equal(repeatedCollisionMerge.summary.importedTemplates, 0);

const draftCurrent: AppData = {
  ...emptyData(),
  days: {
    "2026-07-22": {
      date: "2026-07-22",
      workout: { type: "push", done: false, exercises: [] },
    },
  },
};
const draftMerge = mergeAppData(draftCurrent, {
  ...incomingData,
  days: {
    ...incomingData.days,
    "2026-07-22": {
      date: "2026-07-22",
      workout: { type: "pull", done: false, exercises: [] },
    },
  },
});
assert.equal(draftMerge.data.days["2026-07-22"].workout?.type, "push");
assert.ok(draftMerge.summary.conflicts >= 1);

const schema18 = parseBackup(JSON.stringify(toBackup({
  ...calibrationData,
  onboarding: { completedAt: "2026-07-26T00:00:00.000Z", starterPlan: "balanced5" },
  trainingPreferences: { barbellWeightKg: 15, plateSizesKg: [20, 10, 2.5, 1.25] },
})));
assert.equal(SCHEMA_VERSION, 18);
assert.equal(schema18.onboarding?.starterPlan, "balanced5");
assert.equal(schema18.trainingPreferences?.barbellWeightKg, 15);
assert.deepEqual(schema18.trainingPreferences?.plateSizesKg, [20, 10, 2.5, 1.25]);
assert.equal(schema18.days["2026-07-01"].workout?.exercises[0].supersetGroup, "A");
assert.equal(schema18.days["2026-07-01"].workout?.exercises[0].equipment, "free");
assert.ok(estimateDataFootprint(schema18).bytes > 0);

const healthOnlyMerge = mergeAppData(emptyData(), {
  ...emptyData(),
  days: {
    "2026-07-26": {
      date: "2026-07-26",
      health: {
        source: "appleHealth",
        steps: 12345,
        updatedAt: "2026-07-26T09:00:00.000Z",
      },
    },
  },
});
assert.equal(healthOnlyMerge.summary.importedDays, 1, "A HealthKit-only date must remain visible in merge accounting");
assert.equal(healthOnlyMerge.data.days["2026-07-26"].health?.steps, 12345);

const normalizedEmptyWorkspace = normalizeData(emptyData());
assert.ok(normalizedEmptyWorkspace.microcycle, "Normalization creates a default active microcycle");
assert.ok(normalizedEmptyWorkspace.mesocycle, "Normalization creates a default active mesocycle");
const importedSchedule: Schedule = {
  split: ["push", "rest", "legs", "pull", "rest", "", ""],
  microcycle: [
    { id: "import_push", type: "push" as const, label: "Push Strength", templateId: importedTemplate.id },
    { id: "import_rest", type: "rest" as const, label: "Rest" },
  ],
};
const emptyWorkspaceMerge = mergeAppData(normalizedEmptyWorkspace, {
  ...incomingData,
  schedule: importedSchedule,
});
assert.deepEqual(emptyWorkspaceMerge.data.schedule, importedSchedule, "Generated default cycle state must not block a backup from replacing a cleared workspace");
assert.equal(emptyWorkspaceMerge.data.templates?.[0].id, importedTemplate.id);

console.log("finalization tests passed");
