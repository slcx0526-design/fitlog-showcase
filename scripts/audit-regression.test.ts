import assert from "node:assert/strict";
import { cutSetPlan } from "../lib/cutMode";
import { weekKeysForDate } from "../lib/cardio";
import { workingSets } from "../lib/prescription";
import { computeVolumeSummary, setEffortFactor } from "../lib/volume";
import type { DayLog } from "../lib/types";

assert.equal(workingSets([{ weight: 0, reps: 0, type: "working" }, { weight: 40, reps: 10, type: "warmup" }, { weight: 60, reps: 8, type: "working" }]).length, 1);
assert.equal(setEffortFactor({ weight: 60, reps: 8, type: "working", rir: 4 }), 1);
assert.equal(cutSetPlan([{ id: "main", sets: 4, isMain: true }, { id: "a", sets: 3, isMain: false }, { id: "b", sets: 3, isMain: false }], 0.8).reduce((sum, row) => sum + row.cutSets, 0), 8);
assert.deepEqual(weekKeysForDate("2026-07-01"), ["2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05"]);

const days: DayLog[] = [{ date: "2026-07-01", workout: { type: "push", exercises: [{ id: "px", name: "推胸", isMain: true, sets: [{ weight: 50, reps: 10, type: "working" }, { weight: 50, reps: 10, type: "working", rir: 4 }, { weight: 20, reps: 12, type: "working", technique: "rehab" }], volumeContributions: [{ muscle: "chest", weight: 1, direct: true }] }] } }];
const chest = computeVolumeSummary(days, "intermediate").rows.find((row) => row.muscle === "chest");
assert.ok(chest);
assert.equal(chest.rawDirectSets, 2);
assert.equal(chest.directEffectiveSets, 2);
assert.equal(chest.rehabSets, 1);
console.log("audit regression tests passed");
