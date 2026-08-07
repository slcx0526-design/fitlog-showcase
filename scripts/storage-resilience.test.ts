import assert from "node:assert/strict";
import { estimateDataFootprint, reconcileStorageEvent } from "../lib/dataMerge";
import { emptyData, normalizeData, parseBackup, serializeBackup, type AppData } from "../lib/storage";
import {
  COMPRESSED_STORAGE_PREFIX,
  decodeStorageValue,
  encodeStorageValue,
} from "../lib/storageCodec";
import type { DayLog, Exercise, TrainingType } from "../lib/types";

const EXERCISES = [
  ["px_barbell_bench", "平板杠铃卧推", "chest"],
  ["px_incline_dumbbell", "上斜哑铃卧推", "upperChest"],
  ["pl_lat_pulldown", "宽握下拉", "lats"],
  ["pl_seated_row", "坐姿划船", "upperBack"],
  ["lg_squat", "深蹲", "quads"],
  ["lg_romanian_deadlift", "罗马尼亚硬拉", "hamstrings"],
] as const;

function dateKey(dayIndex: number) {
  const date = new Date(Date.UTC(2021, 0, 1 + dayIndex));
  return date.toISOString().slice(0, 10);
}

function longTermExercise(
  definition: (typeof EXERCISES)[number],
  dayIndex: number,
  exerciseIndex: number,
): Exercise {
  const [id, name, muscle] = definition;
  const strength = exerciseIndex % 2 === 0;
  const repsLow = strength ? 4 : 8;
  const repsHigh = strength ? 6 : 12;
  const progressionTrackId = `${id}:${strength ? "strength" : "hypertrophy"}:${repsLow}-${repsHigh}`;
  return {
    id,
    name,
    isMain: exerciseIndex < 2,
    equipment: exerciseIndex % 3 === 0 ? "free" : "machine",
    primaryMuscle: muscle,
    volumeContributions: [
      { muscle, weight: 1, direct: true },
      { muscle: "abs", weight: 0.25, direct: false },
    ],
    movementPattern: ([
      "horizontalPush",
      "inclinePush",
      "verticalPull",
      "horizontalPull",
      "squat",
      "hipHinge",
    ] as const)[exerciseIndex],
    prescription: {
      progressionTrackId,
      progressionTrackLabel: strength ? "力量 · 4–6 次" : "增肌 · 8–12 次",
      trainingIntent: strength ? "strength" : "hypertrophy",
      targetRepMin: repsLow,
      targetRepMax: repsHigh,
      targetRirMin: 1,
      targetRirMax: 2,
      workingSets: 4,
      loadIncrementKg: 2.5,
      progressionRule: "doubleProgression",
      performanceMode: "reps",
    },
    sets: Array.from({ length: 4 }, (_, setIndex) => ({
      weight: 40 + exerciseIndex * 10 + (dayIndex % 20) * 2.5,
      reps: repsLow + ((dayIndex + setIndex) % (repsHigh - repsLow + 1)),
      type: "working" as const,
      completion: "completed" as const,
      at: `${dateKey(dayIndex)}T${String(9 + setIndex).padStart(2, "0")}:00:00.000Z`,
    })),
  };
}

function fiveYearFixture(): AppData {
  const days: Record<string, DayLog> = {};
  for (let dayIndex = 0; dayIndex < 1_826; dayIndex += 1) {
    const date = dateKey(dayIndex);
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    if (weekday === 0 || weekday === 6) {
      days[date] = { date, recovery: { sleepHours: 7.5, energy: 4, soreness: 2 } };
      continue;
    }
    const type: TrainingType = weekday % 3 === 1 ? "push" : weekday % 3 === 2 ? "pull" : "legs";
    days[date] = {
      date,
      recovery: { sleepHours: 7.5, sleepQuality: 4, energy: 4, soreness: 2, stress: 2 },
      workout: {
        type,
        done: true,
        completedAt: `${date}T11:00:00.000Z`,
        microcycleId: `mc_${Math.floor(dayIndex / 7) + 1}`,
        mesocycleId: `meso_${Math.floor(dayIndex / 42) + 1}`,
        mesocycleCycleNumber: Math.floor((dayIndex % 42) / 7) + 1,
        cyclePhase: dayIndex % 42 >= 35 ? "deload" : "build",
        difficulty: "onTarget",
        exercises: EXERCISES.map((definition, exerciseIndex) => (
          longTermExercise(definition, dayIndex, exerciseIndex)
        )),
      },
    };
  }
  return normalizeData({
    ...emptyData(),
    days,
    profile: { heightCm: 178, biologicalSex: "male", birthYear: 1993, trainingLevel: "intermediate" },
    microcycle: { currentId: "mc_261", startedAt: "2025-12-26", index: 261 },
  });
}

const longTerm = fiveYearFixture();
const raw = JSON.stringify(longTerm);
assert.ok(new TextEncoder().encode(raw).length > 5 * 1024 * 1024, "Fixture must exceed a typical raw localStorage quota");

const encoded = encodeStorageValue(longTerm);
assert.equal(encoded.compressed, true);
assert.ok(encoded.value.startsWith(COMPRESSED_STORAGE_PREFIX));
assert.ok(encoded.storedBytes < 1.5 * 1024 * 1024, "Five years of realistic records should retain ample quota headroom");
const decoded = normalizeData(decodeStorageValue(encoded.value));
assert.equal(Object.keys(decoded.days).length, 1_826);
assert.equal(decoded.days["2025-12-31"].workout?.exercises[5].sets.length, 4);
assert.equal(decoded.days["2025-12-31"].workout?.exercises[0].prescription?.progressionTrackId, "px_barbell_bench:strength:4-6");

const footprint = estimateDataFootprint(longTerm);
assert.equal(footprint.compressed, true);
assert.ok(footprint.storedMegabytes < footprint.megabytes);
assert.equal(footprint.status, "normal");

const portable = serializeBackup(longTerm);
const restoredBackup = parseBackup(portable);
assert.equal(Object.keys(restoredBackup.days).length, 1_826);
assert.equal(restoredBackup.days["2025-12-31"].workout?.exercises[0].sets[0].weight, decoded.days["2025-12-31"].workout?.exercises[0].sets[0].weight);

const legacyRaw = JSON.stringify({
  days: { "2020-01-01": { date: "2020-01-01", recovery: { energy: 4 } } },
  bodyWeights: [],
  waistEntries: [],
  customExercises: [],
  schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
});
const legacyDecoded = normalizeData(decodeStorageValue(legacyRaw));
assert.equal(legacyDecoded.days["2020-01-01"].recovery?.energy, 4, "Legacy plain JSON remains readable");
assert.throws(() => decodeStorageValue(`${COMPRESSED_STORAGE_PREFIX}not-valid`));

const base: AppData = {
  ...emptyData(),
  days: { "2026-08-01": { date: "2026-08-01", recovery: { energy: 3 } } },
};
const remoteOnly: AppData = {
  ...base,
  days: { ...base.days, "2026-08-02": { date: "2026-08-02", recovery: { sleepHours: 8 } } },
};
const accepted = reconcileStorageEvent(base, base, remoteOnly);
assert.equal(accepted.source, "incoming");
assert.equal(accepted.shouldPersist, false);
assert.equal(accepted.data.days["2026-08-02"].recovery?.sleepHours, 8);

const localEdit: AppData = {
  ...base,
  days: { ...base.days, "2026-08-03": { date: "2026-08-03", recovery: { stress: 2 } } },
};
const merged = reconcileStorageEvent(localEdit, base, remoteOnly);
assert.equal(merged.source, "merged");
assert.equal(merged.shouldPersist, true);
assert.equal(merged.data.days["2026-08-02"].recovery?.sleepHours, 8);
assert.equal(merged.data.days["2026-08-03"].recovery?.stress, 2);

const localConflict: AppData = {
  ...base,
  days: { "2026-08-01": { date: "2026-08-01", recovery: { energy: 4 } } },
};
const incomingConflict: AppData = {
  ...base,
  days: { "2026-08-01": { date: "2026-08-01", recovery: { energy: 5 } } },
};
const conflicted = reconcileStorageEvent(localConflict, base, incomingConflict);
assert.equal(conflicted.data.days["2026-08-01"].recovery?.energy, 5, "Latest persisted value wins true conflicts");

console.log("storage resilience tests passed", {
  rawMegabytes: Math.round((encoded.rawBytes / 1024 / 1024) * 100) / 100,
  storedMegabytes: Math.round((encoded.storedBytes / 1024 / 1024) * 100) / 100,
  days: Object.keys(longTerm.days).length,
});
