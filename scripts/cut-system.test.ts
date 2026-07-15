import assert from "node:assert/strict";
import { cardioWeekSummary } from "../lib/cardio";
import { cardioEntryNetExpenditure, resolveCutEnergyPlan } from "../lib/cut";
import { buildCutCoachReview, cutSpeedGuardrail } from "../lib/cutCoach";
import { cutAdjustedSets, cutSetPlan, primeCutTemplateAllocation } from "../lib/cutMode";
import { buildWeeklyCutTrainingPlan } from "../lib/cutTraining";
import type { BodyWeightEntry, DayLog, ExercisePreset, Template } from "../lib/types";

function dateAt(offset: number) {
  const value = new Date(2026, 6, 21);
  value.setDate(value.getDate() - offset);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

const days: Record<string, DayLog> = {};
const weights: BodyWeightEntry[] = [];
for (let offset = 20; offset >= 0; offset -= 1) {
  const date = dateAt(offset);
  days[date] = { date, nutrition: { calories: 2200, protein: 160, carbs: 220, fat: 70 } };
  weights.push({ date, weight: 80 - ((20 - offset) / 20) });
}

const stable = buildCutCoachReview({ sex: "male", heightCm: 183, birthYear: 2003 }, { enabled: true, baselineActivity: "moderate", weeklyLossPct: 0.5 }, days, weights, [], dateAt(0));
assert.equal(stable.dataQuality, "ready");
assert.equal(stable.state, "hold");
assert.equal(stable.weeklyBudget.loggedDays, 2);
assert.ok(stable.weeklyBudget.weeklyTarget && stable.weeklyBudget.weeklyTarget > 0);

const missingData = buildCutCoachReview({ sex: "male", heightCm: 183, birthYear: 2003 }, { enabled: true, weeklyLossPct: 0.5 }, {}, [{ date: dateAt(0), weight: 80 }], [], dateAt(0));
assert.equal(missingData.state, "collect");
assert.equal(missingData.dataQuality, "low");

const guardrail = cutSpeedGuardrail("male", 11.5);
assert.equal(guardrail.high, 0.35);
const aggressive = buildCutCoachReview({ sex: "male", heightCm: 183, birthYear: 2003 }, { enabled: true, weeklyLossPct: 0.75 }, days, weights, [{ date: dateAt(0), waist: 69 }], dateAt(0));
assert.equal(aggressive.state, "guardrail");
assert.equal(aggressive.suggestedWeeklyLossPct, 0.35);

const invalidZoneEntry = { id: "bad-zone", mode: "bike", minutes: 30, zone: 9 as never, at: "2026-07-21T00:00:00.000Z" };
assert.ok(Number.isFinite(cardioEntryNetExpenditure(invalidZoneEntry, 80)));
const invalidZoneSummary = cardioWeekSummary({ [dateAt(0)]: { date: dateAt(0), cardio: [invalidZoneEntry] } }, undefined, dateAt(0));
assert.equal(invalidZoneSummary.unclassifiedMinutes, 30);
assert.equal(invalidZoneSummary.zoneMinutes[2], 0);

const historicalPlan = resolveCutEnergyPlan(
  { sex: "male", heightCm: 183, birthYear: 2003 },
  { enabled: true, baselineActivity: "light", weeklyLossPct: 0.5 },
  {},
  [{ date: "2026-07-01", weight: 80 }, { date: "2026-07-10", weight: 95 }],
  "2026-07-01"
);
assert.equal(historicalPlan.weightKg, 80);
const invalidCalories = resolveCutEnergyPlan(
  { sex: "male", heightCm: 183, birthYear: 2003 },
  { enabled: true, baselineActivity: "light", weeklyLossPct: 0.5 },
  { "2026-07-01": { date: "2026-07-01", nutrition: { calories: "bad" as never, protein: 0, carbs: 0, fat: 0 } } },
  [{ date: "2026-07-01", weight: 80 }],
  "2026-07-01"
);
assert.equal(invalidCalories.calibration.intakeDays, 0);

const allocationInput = [{ id: "template_main", sets: 3, isMain: true }, { id: "template_accessory", sets: 2 }];
const canonical = cutSetPlan(allocationInput, 0.8);
assert.deepEqual(canonical.map((row) => row.cutSets), [3, 1]);
primeCutTemplateAllocation(allocationInput, 0.8);
assert.deepEqual([
  cutAdjustedSets(3, 0.8), cutAdjustedSets(3, 0.8),
  cutAdjustedSets(2, 0.8), cutAdjustedSets(2, 0.8),
], [3, 3, 1, 1]);
assert.equal(cutAdjustedSets(3, 0.8), 2);

const template: Template = {
  id: "tpl_push",
  name: "Push",
  type: "push",
  items: [
    { exerciseId: "template_main", name: "主项", sets: 3, repsLow: 6, repsHigh: 8 },
    { exerciseId: "template_accessory", name: "辅项", sets: 2, repsLow: 10, repsHigh: 12 },
  ],
};
const customExercises: ExercisePreset[] = [
  { id: "template_main", name: "主项", isMain: true, type: "push" },
  { id: "template_accessory", name: "辅项", isMain: false, type: "push" },
];
const weeklyTemplatePlan = buildWeeklyCutTrainingPlan({
  plan: { enabled: true, trainingVolumeScale: 0.8, trainingTemplateIds: { push: "tpl_push" } },
  templates: [template],
  customExercises,
  schedule: { split: ["push", "rest", "rest", "rest", "rest", "rest", "rest"] },
});
assert.deepEqual(weeklyTemplatePlan.templates[0].exercises.map((item) => item.cutSets), canonical.map((item) => item.cutSets));
assert.equal(weeklyTemplatePlan.cutWeeklySets, canonical.reduce((sum, item) => sum + item.cutSets, 0));
console.log("cut system tests passed");