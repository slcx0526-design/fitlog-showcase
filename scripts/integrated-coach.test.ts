import assert from "node:assert/strict";
import { buildIntegratedCoachAnalysis } from "../lib/integratedCoach";
import { scoreRecoveryCheckIn, summarizeRecovery } from "../lib/recovery";
import { emptyData } from "../lib/storage";
import type { AppData, RecoveryCheckIn } from "../lib/types";

const TODAY = "2026-07-22";
const low: RecoveryCheckIn = { sleepHours: 5, sleepQuality: 1, energy: 1, soreness: 5, stress: 5 };

assert.equal(scoreRecoveryCheckIn(undefined, TODAY), null, "Missing recovery input stays unknown");
assert.equal(scoreRecoveryCheckIn({ energy: 1 }, TODAY)?.state, "partial", "One signal is explicitly partial");

const recoveryDays: AppData["days"] = {
  "2026-07-20": { date: "2026-07-20", recovery: low },
  "2026-07-21": { date: "2026-07-21", recovery: low },
  "2026-07-22": { date: "2026-07-22", recovery: low },
};
const recovery = summarizeRecovery(recoveryDays, TODAY);
assert.equal(recovery.scoredDays7d, 3);
assert.equal(recovery.lowDays7d, 3);
assert.equal(recovery.sustainedLow, true, "Repeated low check-ins are distinguished from a one-day dip");

const empty = emptyData();
const emptyAnalysis = buildIntegratedCoachAnalysis(empty, TODAY);
assert.equal(emptyAnalysis.status, "collect");
assert.deepEqual(emptyAnalysis.triggers, [], "Missing training, nutrition, and recovery data must not become pressure signals");

const singleLow: AppData = {
  ...emptyData(),
  days: { [TODAY]: { date: TODAY, recovery: low } },
};
const singleLowAnalysis = buildIntegratedCoachAnalysis(singleLow, TODAY);
assert.equal(singleLowAnalysis.status, "caution", "A single low check-in is conservative, not an automatic recovery-day order");
assert.equal(singleLowAnalysis.triggers.includes("fuelGap"), false, "Missing nutrition never counts as an energy deficit");

const corroborated: AppData = {
  ...emptyData(),
  profile: { sex: "male", heightCm: 180, birthYear: 1990, trainingLevel: "intermediate" },
  cutPlan: { enabled: true, baselineActivity: "moderate", weeklyLossPct: 0.5 },
  bodyWeights: [{ date: TODAY, weight: 80 }],
  days: {
    "2026-07-19": { date: "2026-07-19", nutrition: { calories: 500, protein: 30, carbs: 50, fat: 15 } },
    "2026-07-20": { date: "2026-07-20", nutrition: { calories: 500, protein: 30, carbs: 50, fat: 15 } },
    "2026-07-21": { date: "2026-07-21", nutrition: { calories: 500, protein: 30, carbs: 50, fat: 15 } },
    [TODAY]: { date: TODAY, recovery: low, nutrition: { calories: 100, protein: 0, carbs: 0, fat: 0 } },
  },
};
const corroboratedAnalysis = buildIntegratedCoachAnalysis(corroborated, TODAY);
assert.equal(corroboratedAnalysis.triggers.includes("subjectiveLow"), true);
assert.equal(corroboratedAnalysis.triggers.includes("fuelGap"), true);
assert.equal(corroboratedAnalysis.status, "recover", "Subjective and explicitly logged nutrition pressure can corroborate recovery advice");
assert.equal(corroboratedAnalysis.nutrition.loggedDays7d, 3, "An in-progress current-day intake must not be judged as a completed low-energy day");

console.log("integrated coach tests passed");
