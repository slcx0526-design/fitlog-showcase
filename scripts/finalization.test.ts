import { strict as assert } from "node:assert";
import { mergeAppData, estimateDataFootprint } from "../lib/dataMerge";
import { calculatePlateLoad } from "../lib/plateCalculator";
import { buildPersonalCalibration } from "../lib/personalization";
import { defaultTrackId } from "../lib/prescription";
import { needsStarterSetup, STARTER_PLANS } from "../lib/starterPlans";
import { emptyData, parseBackup, SCHEMA_VERSION, toBackup } from "../lib/storage";
import type { AppData, DayLog, Exercise, Template } from "../lib/types";

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
function bench(weight: number): Exercise {
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
      workingSets: 8,
      loadIncrementKg: 2.5,
      progressionRule: "doubleProgression",
      performanceMode: "reps",
    },
    sets: Array.from({ length: 8 }, (_, index) => ({
      weight,
      reps: 10,
      type: "working" as const,
      at: `2026-07-0${index + 1}T00:00:00.000Z`,
    })),
  };
}

function cycleDay(date: string, microcycleId: string, weight: number, includeBench: boolean): DayLog {
  return {
    date,
    workout: {
      type: includeBench ? "push" : "pull",
      microcycleId,
      done: true,
      cyclePhase: "build",
      difficulty: "onTarget",
      exercises: includeBench
        ? [bench(weight)]
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

const calibrationData: AppData = {
  ...emptyData(),
  profile: { trainingLevel: "beginner" },
  days: {
    "2026-07-01": cycleDay("2026-07-01", "mc_1", 60, true),
    "2026-07-02": cycleDay("2026-07-02", "mc_1", 60, false),
    "2026-07-08": cycleDay("2026-07-08", "mc_2", 62.5, true),
    "2026-07-09": cycleDay("2026-07-09", "mc_2", 62.5, false),
    "2026-07-15": cycleDay("2026-07-15", "mc_3", 65, true),
    "2026-07-16": cycleDay("2026-07-16", "mc_3", 65, false),
  },
  microcycle: { currentId: "mc_current", startedAt: "2026-07-20", index: 4 },
};
const chestCalibration = buildPersonalCalibration(calibrationData, "2026-07-26").find((row) => row.muscle === "chest");
assert.equal(chestCalibration?.sampledCycles, 3);
assert.equal(chestCalibration?.typicalDirectSets, 8);
assert.equal(chestCalibration?.improvingTracks, 1);
assert.equal(chestCalibration?.action, "personalize");

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

const schema15 = parseBackup(JSON.stringify(toBackup({
  ...calibrationData,
  onboarding: { completedAt: "2026-07-26T00:00:00.000Z", starterPlan: "balanced5" },
  trainingPreferences: { barbellWeightKg: 15, plateSizesKg: [20, 10, 2.5, 1.25] },
})));
assert.equal(SCHEMA_VERSION, 15);
assert.equal(schema15.onboarding?.starterPlan, "balanced5");
assert.equal(schema15.trainingPreferences?.barbellWeightKg, 15);
assert.deepEqual(schema15.trainingPreferences?.plateSizesKg, [20, 10, 2.5, 1.25]);
assert.equal(schema15.days["2026-07-01"].workout?.exercises[0].supersetGroup, "A");
assert.equal(schema15.days["2026-07-01"].workout?.exercises[0].equipment, "free");
assert.ok(estimateDataFootprint(schema15).bytes > 0);

console.log("finalization tests passed");
