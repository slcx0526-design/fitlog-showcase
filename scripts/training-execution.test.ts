import assert from "node:assert/strict";
import {
  createNextSetDraft,
  formatSetCredit,
  summarizeSessionExecution,
} from "../lib/trainingExecution";
import { workingSets } from "../lib/trainingMetrics";
import type { Exercise, WorkoutSession } from "../lib/types";

const exercise = (id: string, planned: number, sets: Exercise["sets"]): Exercise => ({
  id,
  name: id,
  isMain: false,
  sets,
  prescription: {
    progressionTrackId: `${id}-hypertrophy-${planned}x8-12`,
    progressionTrackLabel: "增肌 · 8–12 次",
    trainingIntent: "hypertrophy",
    targetRepMin: 8,
    targetRepMax: 12,
    workingSets: planned,
    loadIncrementKg: 2.5,
    progressionRule: "doubleProgression",
  },
});

const carried = createNextSetDraft({
  performanceMode: "reps",
  recordsWeight: true,
  carry: { weight: 80, reps: 10 },
});
assert.equal(carried.weight, 80);
assert.equal(carried.reps, 0, "Previous reps must never become completed work in a new row");
assert.equal(workingSets([carried]).length, 0, "A carried load remains a draft until performance is entered");

const suggested = createNextSetDraft({
  performanceMode: "reps",
  recordsWeight: true,
  carry: { weight: 80, reps: 10 },
  plannedLoadKg: 82.5,
});
assert.equal(suggested.weight, 82.5);
assert.equal(suggested.reps, 0);

const bodyweight = createNextSetDraft({
  performanceMode: "reps",
  recordsWeight: true,
  carry: { weight: 0, reps: 8 },
});
assert.equal(bodyweight.weight, 0, "A valid zero-load bodyweight set must remain zero-load");
assert.equal(bodyweight.reps, 0);

const duration = createNextSetDraft({
  performanceMode: "duration",
  recordsWeight: false,
  carry: { weight: 0, reps: 0, durationSeconds: 45 },
});
assert.equal(duration.durationSeconds, 0, "Previous duration is reference only, never a completed draft");
assert.equal(workingSets([duration]).length, 0);

const workout: WorkoutSession = {
  type: "push",
  exercises: [
    exercise("press", 3, [
      { weight: 80, reps: 10, completion: "completed" },
      { weight: 80, reps: 8, completion: "partial" },
    ]),
    exercise("fly", 2, [
      { weight: 20, reps: 12, completion: "completed" },
      { weight: 20, reps: 0 },
    ]),
  ],
};
const summary = summarizeSessionExecution(workout);
assert.equal(summary.workingSets, 3);
assert.equal(summary.completionCredits, 2.5);
assert.equal(summary.planCredits, 2.5);
assert.equal(summary.plannedSets, 5);
assert.equal(summary.remainingSets, 2.5);
assert.equal(summary.completionPct, 50);
assert.equal(summary.next?.exercise.id, "press");
assert.equal(summary.needsFinishConfirmation, true);
assert.equal(formatSetCredit(summary.completionCredits), "2.5");

const complete = summarizeSessionExecution({
  type: "pull",
  exercises: [exercise("row", 2, [
    { weight: 70, reps: 12 },
    { weight: 70, reps: 12 },
    { weight: 40, reps: 15 },
  ])],
});
assert.equal(complete.completionCredits, 3, "Actual work remains visible even above plan");
assert.equal(complete.planCredits, 2, "Extra work cannot exceed the planned completion denominator");
assert.equal(complete.completionPct, 100);
assert.equal(complete.needsFinishConfirmation, false);

const unplanned = summarizeSessionExecution({
  type: "custom",
  exercises: [{ ...exercise("carry", 0, [{ weight: 0, reps: 30, completion: "partial" }]) }],
});
assert.equal(unplanned.completionCredits, 0.5);
assert.equal(unplanned.completionPct, null);

console.log("training execution tests passed");
