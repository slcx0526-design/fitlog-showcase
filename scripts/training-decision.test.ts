import assert from "node:assert/strict";
import { buildTrainingDecision, recentPlanAdherence } from "../lib/trainingDecision";
import { volumeTargetScale } from "../lib/volume";
import type { AppData } from "../lib/storage";
import type { DayLog, Exercise, ProgressionPrescription, TrainingType } from "../lib/types";

const TODAY = "2026-07-11";
const schedule = { split: ["push", "pull", "legs", "rest", "push", "pull", "rest"] as const };

function app(days: Record<string, DayLog>, targets?: AppData["muscleTargets"]): AppData {
  return {
    days,
    bodyWeights: [],
    waistEntries: [],
    customExercises: [],
    schedule: { split: [...schedule.split] },
    muscleTargets: targets,
    microcycle: { currentId: "mc_1", startedAt: "2026-07-01", index: 1 },
  };
}

const prescription: ProgressionPrescription = {
  progressionTrackId: "bench-hypertrophy-4x8-12",
  progressionTrackLabel: "增肌 · 8–12 次",
  trainingIntent: "hypertrophy",
  targetRepMin: 8,
  targetRepMax: 12,
  workingSets: 4,
  loadIncrementKg: 2.5,
  progressionRule: "doubleProgression",
};

function bench(date: string, sets: number, weight = 80, done = true): DayLog {
  const exercise: Exercise = {
    id: "bench",
    name: "平板杠铃卧推",
    isMain: true,
    sets: Array.from({ length: sets }, () => ({ weight, reps: 8, type: "working" as const })),
    prescription,
    progressionTrackId: prescription.progressionTrackId,
    progressionTrackLabel: prescription.progressionTrackLabel,
    planned: { sets: 4, repsLow: 8, repsHigh: 12 },
    volumeContributions: [{ muscle: "chest", weight: 1, direct: true }],
  };
  return { date, workout: { type: "push", done, microcycleId: "mc_1", exercises: [exercise] } };
}

const sparse = buildTrainingDecision(app({}), TODAY, "home");
assert.equal(sparse.confidence, "starter");
assert.equal(sparse.actions[0].kind, "buildHistory");

const unfinishedDays = {
  "2026-07-03": bench("2026-07-03", 1),
  "2026-07-06": bench("2026-07-06", 1),
  "2026-07-09": bench("2026-07-09", 1),
};
const adherence = recentPlanAdherence(app(unfinishedDays), TODAY);
assert.equal(adherence.sessions, 3);
assert.equal(adherence.completionPct, 25);
assert.equal(adherence.averageMissingSets, 3);
const simplify = buildTrainingDecision(app(unfinishedDays), TODAY, "review").actions[0];
assert.equal(simplify.kind, "simplifyPlan");

const active = bench(TODAY, 2, 80, false);
const activeDecision = buildTrainingDecision(app({ [TODAY]: active }), TODAY, "review");
assert.equal(activeDecision.actions[0].kind, "continueSession");
assert.equal(activeDecision.confidence, "starter");

const activeMustNotLowerAdherence = recentPlanAdherence(app({
  "2026-07-06": bench("2026-07-06", 4),
  "2026-07-09": bench("2026-07-09", 4),
  [TODAY]: bench(TODAY, 1, 80, false),
}), TODAY);
assert.equal(activeMustNotLowerAdherence.sessions, 2);
assert.equal(activeMustNotLowerAdherence.completionPct, 100);

const highVolume = bench("2026-07-10", 18);
highVolume.workout!.exercises[0].prescription = undefined;
highVolume.workout!.exercises[0].planned = undefined;
const highDecision = buildTrainingDecision(app({ "2026-07-10": highVolume }), TODAY, "review");
const reduction = highDecision.actions.find((action) => action.kind === "reduceVolume");
assert.ok(reduction && reduction.kind === "reduceVolume");
assert.equal(reduction.current, 18);
assert.equal(reduction.targetHigh, 16);

const staleHighVolume = bench("2026-04-10", 18);
staleHighVolume.workout!.exercises[0].prescription = undefined;
staleHighVolume.workout!.exercises[0].planned = undefined;
const staleHighDecision = buildTrainingDecision(app({ "2026-04-10": staleHighVolume }), TODAY, "review");
assert.equal(staleHighDecision.actions.some((action) => action.kind === "reduceVolume"), false);

const earlyLowVolume = bench("2026-07-01", 3);
earlyLowVolume.workout!.exercises[0].prescription = undefined;
earlyLowVolume.workout!.exercises[0].planned = undefined;
const earlyDecision = buildTrainingDecision(app({ "2026-07-01": earlyLowVolume }), "2026-07-02", "review");
assert.equal(earlyDecision.actions.some((action) => action.kind === "addVolume"), false);

function cycleDay(date: string, type: TrainingType): DayLog {
  return {
    date,
    workout: {
      type,
      done: true,
      microcycleId: "mc_1",
      exercises: type === "rest" ? [] : [{ id: `${type}-${date}`, name: type, isMain: false, sets: [{ weight: 20, reps: 10, type: "working" }] }],
    },
  };
}
const lateDays: Record<string, DayLog> = {
  "2026-07-01": earlyLowVolume,
  "2026-07-02": cycleDay("2026-07-02", "pull"),
  "2026-07-03": cycleDay("2026-07-03", "legs"),
  "2026-07-04": cycleDay("2026-07-04", "rest"),
  "2026-07-05": cycleDay("2026-07-05", "push"),
};
const lateDecision = buildTrainingDecision(app(lateDays), "2026-07-06", "review");
assert.equal(lateDecision.actions.some((action) => action.kind === "addVolume"), true);

const regressionDays: Record<string, DayLog> = {
  "2026-07-01": bench("2026-07-01", 4, 100),
  "2026-07-04": bench("2026-07-04", 4, 95),
  "2026-07-08": bench("2026-07-08", 4, 90),
};
const regression = buildTrainingDecision(app(regressionDays), TODAY, "review");
assert.equal(regression.actions.some((action) => action.kind === "trackRegression"), true);

const staleDays = {
  "2026-04-01": bench("2026-04-01", 1, 100),
  "2026-04-04": bench("2026-04-04", 1, 95),
  "2026-04-08": bench("2026-04-08", 1, 90),
};
const staleDecision = buildTrainingDecision(app(staleDays), TODAY, "review");
assert.equal(staleDecision.actions.some((action) => action.kind === "simplifyPlan" || action.kind === "trackRegression"), false);

assert.equal(volumeTargetScale("28d"), 4);
console.log("training decision tests passed");
