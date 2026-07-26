import assert from "node:assert/strict";
import { buildHealthReadiness } from "../lib/healthInsights";
import { buildIntegratedCoachAnalysis } from "../lib/integratedCoach";
import { emptyData } from "../lib/storage";
import type { AppData, HealthDailySummary, RecoveryCheckIn } from "../lib/types";
import { shiftDate } from "../lib/weight";

const TODAY = "2026-07-26";
const updatedAt = "2026-07-26T08:00:00.000Z";

function health(
  sleepMinutes?: number,
  heartRateVariabilityMs?: number,
  restingHeartRate?: number,
): HealthDailySummary {
  return {
    source: "appleHealth",
    sleepMinutes,
    heartRateVariabilityMs,
    restingHeartRate,
    updatedAt,
  };
}

function withBaseline(current: HealthDailySummary): AppData {
  const data = emptyData();
  for (let offset = 1; offset <= 20; offset += 1) {
    const date = shiftDate(TODAY, -offset);
    data.days[date] = { date, health: health(450, 60, 55) };
  }
  data.days[TODAY] = { date: TODAY, health: current };
  return data;
}

const empty = buildHealthReadiness(emptyData(), TODAY);
assert.equal(empty.status, "insufficient");
assert.equal(empty.suggestedAdjustment, "collect");
assert.equal(empty.observationDate, null);

const stable = buildHealthReadiness(withBaseline(health(455, 62, 54)), TODAY);
assert.equal(stable.status, "stable");
assert.equal(stable.confidence, "ready");
assert.equal(stable.qualifiedSignals, 3);
assert.equal(stable.metrics.find((metric) => metric.metric === "sleep")?.baseline, 450);

const low = buildHealthReadiness(withBaseline(health(300, 38, 67)), TODAY);
assert.equal(low.status, "low");
assert.equal(low.adverseSignals, 3);
assert.equal(low.suggestedAdjustment, "recovery");
assert.equal(low.metrics.find((metric) => metric.metric === "heartRateVariability")?.state, "low");

const singleMetric = emptyData();
for (let offset = 1; offset <= 10; offset += 1) {
  const date = shiftDate(TODAY, -offset);
  singleMetric.days[date] = { date, health: health(450) };
}
singleMetric.days[TODAY] = { date: TODAY, health: health(300) };
const singleSignal = buildHealthReadiness(singleMetric, TODAY);
assert.equal(singleSignal.status, "caution", "One objective anomaly may warn but must not order recovery");
assert.equal(singleSignal.confidence, "low");
assert.equal(singleSignal.suggestedAdjustment, "conservative");

const readinessPlusSteps = emptyData();
for (let offset = 1; offset <= 14; offset += 1) {
  const date = shiftDate(TODAY, -offset);
  readinessPlusSteps.days[date] = {
    date,
    health: offset <= 7
      ? health(450, 60, 55)
      : { source: "appleHealth", steps: 8000, updatedAt },
  };
}
readinessPlusSteps.days[TODAY] = { date: TODAY, health: health(455, 62, 54) };
const building = buildHealthReadiness(readinessPlusSteps, TODAY);
assert.equal(building.baselineDays, 7, "Steps-only days must not inflate the readiness baseline");
assert.equal(building.confidence, "building", "Seven readiness samples are not enough for ready confidence");

const stale = emptyData();
const staleDate = shiftDate(TODAY, -2);
stale.days[staleDate] = { date: staleDate, health: health(300, 30, 70) };
assert.equal(buildHealthReadiness(stale, TODAY).status, "insufficient", "Old health facts must not be treated as today's readiness");

const richerYesterday = withBaseline(health());
const yesterday = shiftDate(TODAY, -1);
richerYesterday.days[TODAY].health = {
  source: "appleHealth",
  steps: 9000,
  updatedAt,
};
richerYesterday.days[yesterday].health = health(300, 38, 67);
assert.equal(
  buildHealthReadiness(richerYesterday, TODAY).observationDate,
  yesterday,
  "A steps-only current day must not hide a complete prior-day readiness sample",
);

const objectiveOnly = withBaseline(health(300, 38, 67));
const objectiveOnlyCoach = buildIntegratedCoachAnalysis(objectiveOnly, TODAY);
assert.equal(objectiveOnlyCoach.status, "caution", "Objective pressure alone stays advisory");
assert.equal(objectiveOnlyCoach.triggers.includes("healthLow"), true);

const subjectiveLow: RecoveryCheckIn = {
  sleepHours: 5,
  sleepQuality: 1,
  energy: 1,
  soreness: 5,
  stress: 5,
};
const corroborated = withBaseline(health(300, 38, 67));
corroborated.days[TODAY].recovery = subjectiveLow;
const corroboratedCoach = buildIntegratedCoachAnalysis(corroborated, TODAY);
assert.equal(corroboratedCoach.status, "recover", "Objective and subjective pressure may corroborate recovery advice");

console.log("health insight tests passed");
