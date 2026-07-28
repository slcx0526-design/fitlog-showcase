import assert from "node:assert/strict";
import { buildAdaptiveEvidenceProfile, buildAdaptiveRuntimePlan } from "../lib/adaptiveEvidence";
import { buildScheduleAdaptation } from "../lib/scheduleAdaptation";
import { defaultTrainingPolicy, mergeTrainingPolicy } from "../lib/trainingPolicy";
import type { AppData, DayLog, Template, TemplateItem } from "../lib/types";

const TODAY = "2026-07-28";

const pushItems: TemplateItem[] = [
  {
    exerciseId: "px_barbell_bench",
    name: "平板杠铃卧推",
    sets: 4,
    repsLow: 6,
    repsHigh: 8,
    isMain: true,
    primaryMuscle: "chest",
    equipment: "free",
  },
  {
    exerciseId: "px_lateral_raise",
    name: "侧平举",
    sets: 6,
    repsLow: 12,
    repsHigh: 15,
    isMain: false,
    primaryMuscle: "sideDelt",
    equipment: "machine",
  },
  {
    exerciseId: "px_triceps_pushdown",
    name: "绳索下压",
    sets: 6,
    repsLow: 10,
    repsHigh: 15,
    isMain: false,
    primaryMuscle: "triceps",
    equipment: "cable",
  },
];

const templates: Template[] = [
  { id: "tpl_push", name: "推", type: "push", items: pushItems },
  {
    id: "tpl_pull",
    name: "拉",
    type: "pull",
    items: [{ exerciseId: "pl_lat_pulldown", name: "下拉", sets: 4, repsLow: 8, repsHigh: 12, isMain: true, primaryMuscle: "lats" }],
  },
  {
    id: "tpl_legs",
    name: "腿",
    type: "legs",
    items: [{ exerciseId: "lg_hack_squat", name: "哈克深蹲", sets: 4, repsLow: 6, repsHigh: 10, isMain: true, primaryMuscle: "quads" }],
  },
];

function completedDay(date: string): DayLog {
  return {
    date,
    workout: {
      type: "push",
      done: true,
      completedAt: `${date}T12:00:00.000Z`,
      difficulty: "hard",
      exercises: [{
        id: "px_barbell_bench",
        name: "平板杠铃卧推",
        isMain: true,
        primaryMuscle: "chest",
        sets: [{ weight: 60, reps: 8, type: "working", completion: "completed" }],
      }],
    },
  };
}

function data(): AppData {
  const days: AppData["days"] = {};
  for (const date of ["2026-07-23", "2026-07-24", "2026-07-25", "2026-07-26", "2026-07-27", TODAY]) {
    days[date] = completedDay(date);
  }
  days[TODAY] = {
    ...days[TODAY],
    recovery: { sleepHours: 4, energy: 1, soreness: 4, at: `${TODAY}T08:00:00.000Z` },
    cardio: [{ id: "cardio_pressure", mode: "单车", minutes: 50, zone: 4 }],
  };
  return {
    days,
    bodyWeights: [],
    waistEntries: [],
    customExercises: [],
    templates,
    schedule: {
      split: ["push", "pull", "legs", "rest", "push", "pull", "rest"],
      microcycle: [
        { id: "step_1", type: "push", label: "推", templateId: "tpl_push" },
        { id: "step_2", type: "pull", label: "拉", templateId: "tpl_pull" },
        { id: "step_3", type: "legs", label: "腿", templateId: "tpl_legs" },
        { id: "step_4", type: "rest", label: "休息" },
        { id: "step_5", type: "push", label: "推", templateId: "tpl_push" },
        { id: "step_6", type: "pull", label: "拉", templateId: "tpl_pull" },
        { id: "step_7", type: "rest", label: "休息" },
      ],
    },
  };
}

const automaticPolicy = mergeTrainingPolicy(defaultTrainingPolicy(), {
  evidenceMode: "automatic",
  evidenceMinimumConfidence: "building",
  weeklyTrainingDays: { minimum: 3, target: 5, maximum: 6 },
});

{
  const profile = buildAdaptiveEvidenceProfile(data(), automaticPolicy, TODAY);
  assert.equal(profile.state, "recovery");
  assert.equal(profile.confidence, "building");
  assert.equal(profile.volumeScale, 0.7);
  assert.equal(profile.maxSessionMinutes, 60);
  assert.equal(profile.maxWorkingSets, 18);
  assert.equal(profile.recommendedTrainingDays, 4);
  assert.ok(profile.reasons.some((reason) => reason.includes("有氧")));
}

{
  const runtime = buildAdaptiveRuntimePlan(data(), automaticPolicy, TODAY, pushItems);
  assert.equal(runtime.evidenceApplied, true);
  assert.equal(runtime.mode, "evidence");
  assert.ok(runtime.prescribedWorkingSets < runtime.normalWorkingSets);
  assert.ok(runtime.rows.find((row) => row.exerciseId === "px_barbell_bench")!.prescribedSets >= 2);
  assert.equal(runtime.snapshot?.state, "recovery");
}

{
  const previewPolicy = mergeTrainingPolicy(automaticPolicy, { evidenceMode: "preview" });
  const runtime = buildAdaptiveRuntimePlan(data(), previewPolicy, TODAY, pushItems);
  assert.equal(runtime.evidenceApplied, false);
  assert.equal(runtime.prescribedWorkingSets, runtime.normalWorkingSets);
  assert.equal(runtime.snapshot, undefined);
}

{
  const proposal = buildScheduleAdaptation(data(), automaticPolicy, TODAY);
  assert.equal(proposal.evidenceAdjusted, true);
  assert.equal(proposal.targetTrainingDays, 4);
  assert.equal(proposal.trainingDaysAfter, 4);
  assert.equal(proposal.evidenceState, "recovery");
}

console.log("adaptive-evidence tests passed");
