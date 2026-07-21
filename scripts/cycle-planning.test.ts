import assert from "node:assert/strict";
import {
  applyCycleReviewToData,
  buildCycleReview,
  requiresCycleReviewBeforeWorkout,
} from "../lib/cyclePlanning";
import {
  advanceTrainingCycle,
  templateForCyclePhase,
} from "../lib/microcycle";
import { normalizeData, toBackup } from "../lib/storage";
import type { AppData, Exercise, Template } from "../lib/types";

const template: Template = {
  id: "tpl_push_strength",
  name: "推力量",
  type: "push",
  items: [{
    exerciseId: "bench",
    name: "卧推",
    sets: 4,
    repsLow: 4,
    repsHigh: 6,
    isMain: true,
    primaryMuscle: "chest",
    volumeContributions: [{ muscle: "chest", weight: 1, direct: true }],
    prescription: {
      progressionTrackId: "bench-strength",
      progressionTrackLabel: "力量 · 4–6 次",
      trainingIntent: "strength",
      targetRepMin: 4,
      targetRepMax: 6,
      workingSets: 4,
      loadIncrementKg: 2.5,
      progressionRule: "doubleProgression",
    },
  }],
};

const exercise: Exercise = {
  id: "bench",
  name: "卧推",
  isMain: true,
  primaryMuscle: "chest",
  volumeContributions: [{ muscle: "chest", weight: 1, direct: true }],
  prescription: { ...template.items[0].prescription! },
  sets: [
    { weight: 100, reps: 6 },
    { weight: 100, reps: 6 },
    { weight: 100, reps: 6 },
    { weight: 100, reps: 6 },
  ],
};

const data: AppData = {
  days: {
    "2026-07-20": {
      date: "2026-07-20",
      workout: {
        type: "push",
        done: true,
        completedAt: "2026-07-20T10:30:00.000Z",
        templateId: template.id,
        templateSnapshot: template,
        microcycleId: "mc_review",
        microcycleStepId: "push_step",
        mesocycleId: "meso_review",
        mesocycleCycleNumber: 1,
        cyclePhase: "build",
        exercises: [exercise],
      },
    },
  },
  bodyWeights: [],
  waistEntries: [],
  customExercises: [],
  schedule: {
    split: ["push", "pull", "legs", "rest", "push", "pull", "rest"],
    microcycle: [{ id: "push_step", type: "push", label: "推力量", templateId: template.id }],
  },
  templates: [template],
  muscleTargets: { chest: { low: 0, high: 2 } },
  microcycle: {
    currentId: "mc_review",
    startedAt: "2026-07-20",
    index: 3,
    phase: "build",
    mesocycleId: "meso_review",
    mesocycleCycleNumber: 1,
    steps: [{ id: "push_step", type: "push", label: "推力量", templateId: template.id, templateSnapshot: template }],
  },
  mesocycle: {
    currentId: "meso_review",
    startedAt: "2026-07-01",
    index: 1,
    targetBuildCycles: 2,
    currentBuildCycle: 1,
  },
};

const review = buildCycleReview(data, "2026-07-20");
assert.equal(review.status, "ready");
assert.equal(review.sourceMicrocycleId, "mc_review");
assert.equal(review.recommendedPhase, "build");
assert.equal(requiresCycleReviewBeforeWorkout(data, "2026-07-20"), true);
assert.equal(review.changes.length, 1, "Cycle review should bundle the strongest exact-template change once");
assert.equal(review.changes[0].templateId, template.id);
assert.equal(review.changes[0].exerciseId, "bench");
assert.equal(review.changes[0].fromSets, 4);
assert.ok(review.changes[0].toSets < 4);

const alreadyQueuedData: AppData = {
  ...data,
  templates: [{
    ...template,
    items: [{ ...template.items[0], sets: 3, prescription: { ...template.items[0].prescription!, workingSets: 3 } }],
  }],
};
assert.equal(buildCycleReview(alreadyQueuedData, "2026-07-20").changes.length, 0, "A template change already queued beyond the frozen cycle snapshot must not be stacked again");

const blockedReview = buildCycleReview({
  ...data,
  days: {
    "2026-07-19": {
      date: "2026-07-19",
      workout: {
        type: "pull",
        done: false,
        microcycleId: "mc_review",
        exercises: [{ ...exercise, id: "row", name: "划船" }],
      },
    },
    ...data.days,
  },
}, "2026-07-20");
assert.equal(blockedReview.status, "notReady");
assert.equal(blockedReview.blockingWorkoutDate, "2026-07-19");

const applied = applyCycleReviewToData(data, review, "2026-07-21", "build", "2026-07-21T08:00:00.000Z");
assert.equal(applied.applied, true);
assert.notEqual(applied.data.microcycle?.currentId, "mc_review");
assert.equal(applied.data.mesocycle?.currentId, "meso_review");
assert.equal(applied.data.mesocycle?.currentBuildCycle, 2);
assert.equal(applied.data.lastCycleReview?.id, review.id);
assert.equal(applied.data.templates?.[0].items[0].sets, review.changes[0].toSets);
assert.equal(applied.data.templates?.[0].items[0].prescription?.progressionTrackId, "bench-strength", "Changing set count must not fork the strength progression track");
assert.equal(applied.data.microcycle?.steps?.[0].templateSnapshot?.items[0].sets, review.changes[0].toSets, "The next active cycle must snapshot the adjusted template");
const appliedRoundTrip = normalizeData(toBackup(applied.data));
assert.equal(appliedRoundTrip.lastCycleReview?.id, review.id);
assert.equal(appliedRoundTrip.mesocycle?.currentBuildCycle, 2);
assert.equal(appliedRoundTrip.microcycle?.sourceReviewId, review.id);
assert.equal(requiresCycleReviewBeforeWorkout(applied.data, "2026-07-21"), false);

const duplicate = applyCycleReviewToData(applied.data, review, "2026-07-21", "build");
assert.equal(duplicate.applied, false, "The same review must never apply twice");
assert.ok(duplicate.reason === "alreadyApplied" || duplicate.reason === "staleCycle");

const deloadTemplate = templateForCyclePhase(template, "deload");
assert.equal(deloadTemplate.items[0].sets, 3);
assert.equal(deloadTemplate.items[0].prescription?.progressionTrackId, "bench-strength:deload");
assert.equal(deloadTemplate.items[0].prescription?.progressionRule, "custom");

const deloadApplied = applyCycleReviewToData(data, review, "2026-07-21", "deload", "2026-07-21T08:00:00.000Z");
assert.equal(deloadApplied.applied, true);
assert.equal(deloadApplied.data.microcycle?.phase, "deload");
assert.equal(deloadApplied.data.mesocycle?.currentBuildCycle, 1, "A recovery cycle must not consume another build-cycle slot");
assert.ok(deloadApplied.data.microcycle?.steps?.[0].templateSnapshot?.items[0].prescription?.progressionTrackId.endsWith(":deload"));

const afterDeload = advanceTrainingCycle(deloadApplied.data, "2026-07-28", "build");
assert.notEqual(afterDeload.mesocycle.currentId, "meso_review", "A completed recovery phase must begin a fresh mesocycle");
assert.equal(afterDeload.mesocycle.currentBuildCycle, 1);

const atTarget: AppData = {
  ...data,
  mesocycle: { ...data.mesocycle!, currentBuildCycle: 2, targetBuildCycles: 2 },
  microcycle: { ...data.microcycle!, phase: "build", mesocycleCycleNumber: 2 },
};
const nextMeso = advanceTrainingCycle(atTarget, "2026-08-01", "build");
assert.notEqual(nextMeso.mesocycle.currentId, "meso_review");
assert.equal(nextMeso.mesocycle.currentBuildCycle, 1);

const incompleteReset = advanceTrainingCycle({ ...data, days: {} }, "2026-07-21", "build");
assert.equal(incompleteReset.mesocycle.currentId, "meso_review");
assert.equal(incompleteReset.mesocycle.currentBuildCycle, 1, "Resetting an incomplete cycle must not consume a completed build-cycle slot");

console.log("cycle planning tests passed");
