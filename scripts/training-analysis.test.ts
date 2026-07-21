import assert from "node:assert/strict";
import { buildTrainingAnalysis, recentPlanAdherence } from "../lib/trainingAnalysis";
import { buildTrainingDecision } from "../lib/trainingDecision";
import { buildTemplateAdjustmentProposal } from "../lib/templateAdjustment";
import type { AppData } from "../lib/storage";
import type {
  DayLog,
  Exercise,
  MicrocycleStep,
  ProgressionPrescription,
  SessionDifficulty,
  Template,
  TrainingType,
} from "../lib/types";

const TODAY = "2026-07-22";

function prescription(exerciseId: string, sets: number): ProgressionPrescription {
  return {
    progressionTrackId: `${exerciseId}-hypertrophy-${sets}x8-12`,
    progressionTrackLabel: "增肌 · 8–12 次",
    trainingIntent: "hypertrophy",
    targetRepMin: 8,
    targetRepMax: 12,
    workingSets: sets,
    loadIncrementKg: 2.5,
    progressionRule: "doubleProgression",
  };
}

function template(id: string, sets: number, exerciseId = "bench", muscle: "chest" | "lats" = "chest"): Template {
  return {
    id,
    name: id === "tpl_short" ? "短推" : id === "tpl_long" ? "长推" : id,
    type: muscle === "chest" ? "push" : "pull",
    items: [{
      exerciseId,
      name: exerciseId === "bench" ? "平板杠铃卧推" : "宽握下拉",
      sets,
      repsLow: 8,
      repsHigh: 12,
      primaryMuscle: muscle,
      volumeContributions: [{ muscle, weight: 1, direct: true }],
      prescription: prescription(exerciseId, sets),
    }],
  };
}

function exerciseFromTemplate(source: Template, completedSets: number, weight = 80): Exercise {
  const item = source.items[0];
  return {
    id: item.exerciseId,
    name: item.name,
    isMain: true,
    primaryMuscle: item.primaryMuscle,
    volumeContributions: item.volumeContributions,
    prescription: prescription(item.exerciseId, item.sets),
    sets: Array.from({ length: completedSets }, () => ({ weight, reps: 8, type: "working" as const })),
  };
}

function workoutDay(args: {
  date: string;
  source: Template;
  completedSets: number;
  stepId?: string;
  done?: boolean;
  difficulty?: SessionDifficulty;
  weight?: number;
}): DayLog {
  return {
    date: args.date,
    workout: {
      type: args.source.type,
      done: args.done ?? true,
      difficulty: args.difficulty,
      templateId: args.source.id,
      templateSnapshot: args.source,
      microcycleId: "mc_test",
      microcycleStepId: args.stepId,
      exercises: [exerciseFromTemplate(args.source, args.completedSets, args.weight)],
    },
  };
}

function restDay(date: string, stepId: string): DayLog {
  return { date, workout: { type: "rest", done: true, microcycleId: "mc_test", microcycleStepId: stepId, exercises: [] } };
}

function app(days: Record<string, DayLog>, steps: MicrocycleStep[], templates: Template[] = []): AppData {
  return {
    days,
    bodyWeights: [],
    waistEntries: [],
    customExercises: [],
    templates,
    schedule: { split: ["push", "rest", "rest", "rest", "rest", "rest", "push"], microcycle: steps.map(({ templateSnapshot: _snapshot, ...step }) => step) },
    microcycle: { currentId: "mc_test", startedAt: "2026-07-01", index: 1, steps },
    muscleTargets: { chest: { low: 12, high: 16 }, lats: { low: 10, high: 16 } },
  };
}

function step(id: string, type: TrainingType, source?: Template): MicrocycleStep {
  return {
    id,
    type,
    label: type === "rest" ? "休息" : source?.name ?? type,
    templateId: source?.id,
    templateSnapshot: source,
  };
}

const long = template("tpl_long", 4);
const short = template("tpl_short", 3);
const adherenceSteps = [step("a1", "push", long), step("a2", "push", short)];
const adherenceDays = {
  "2026-07-10": workoutDay({ date: "2026-07-10", source: long, completedSets: 1, stepId: "a1" }),
  "2026-07-12": workoutDay({ date: "2026-07-12", source: short, completedSets: 3, stepId: "a2" }),
  "2026-07-15": workoutDay({ date: "2026-07-15", source: long, completedSets: 1 }),
  "2026-07-18": workoutDay({ date: "2026-07-18", source: short, completedSets: 3 }),
};
const adherenceAnalysis = buildTrainingAnalysis(app(adherenceDays, adherenceSteps, [long, short]), TODAY);
assert.equal(adherenceAnalysis.weakTemplate?.templateId, "tpl_long", "Only the repeatedly unfinished template should be diagnosed");
assert.equal(buildTrainingAnalysis(app(adherenceDays, adherenceSteps, [short]), TODAY).weakTemplate, null, "Deleted templates must not remain actionable");
const simplify = buildTrainingDecision(app(adherenceDays, adherenceSteps, [long, short]), TODAY).actions.find((action) => action.kind === "simplifyPlan");
assert.ok(simplify && simplify.kind === "simplifyPlan");
assert.equal(simplify.templateId, "tpl_long");

const unclosedDays = {
  ...adherenceDays,
  "2026-07-20": workoutDay({ date: "2026-07-20", source: long, completedSets: 1, done: false }),
};
const unclosedData = app(unclosedDays, adherenceSteps, [long, short]);
assert.equal(recentPlanAdherence(unclosedData, TODAY).sessions, 4, "Unclosed fallback must not enter plan adherence");
const unclosedDecision = buildTrainingDecision(unclosedData, TODAY);
assert.deepEqual(unclosedDecision.actions.map((action) => action.kind), ["reviewUnclosed"], "Unclosed work must be confirmed before plan-changing advice");

const first = template("tpl_first", 4);
const remaining = template("tpl_remaining", 8);
const projectionSteps = [
  step("p1", "push", first),
  step("p2", "push", remaining),
  step("p3", "rest"),
  step("p4", "rest"),
  step("p5", "rest"),
  step("p6", "rest"),
  step("p7", "rest"),
];
const projectionData = app({
  "2026-07-20": workoutDay({ date: "2026-07-20", source: first, completedSets: 4, stepId: "p1" }),
}, projectionSteps, [first, remaining]);
const chestProjection = buildTrainingAnalysis(projectionData, TODAY).cycle.rows.find((row) => row.muscle === "chest")!;
assert.equal(chestProjection.current, 4);
assert.equal(chestProjection.remaining, 8);
assert.equal(chestProjection.projected, 12);
assert.equal(chestProjection.status, "in", "Remaining bound templates must prevent a false low-volume diagnosis");

const lastSmall = template("tpl_last_small", 2);
const lateSteps = [
  step("l1", "push", first),
  step("l2", "rest"),
  step("l3", "rest"),
  step("l4", "rest"),
  step("l5", "rest"),
  step("l6", "rest"),
  step("l7", "push", lastSmall),
];
const lateDays: Record<string, DayLog> = {
  "2026-07-15": workoutDay({ date: "2026-07-15", source: first, completedSets: 4, stepId: "l1" }),
  "2026-07-16": restDay("2026-07-16", "l2"),
  "2026-07-17": restDay("2026-07-17", "l3"),
  "2026-07-18": restDay("2026-07-18", "l4"),
  "2026-07-19": restDay("2026-07-19", "l5"),
  "2026-07-20": restDay("2026-07-20", "l6"),
};
const lateDecision = buildTrainingDecision(app(lateDays, lateSteps, [first, lastSmall]), TODAY);
const add = lateDecision.actions.find((action) => action.kind === "addVolume");
assert.ok(add && add.kind === "addVolume");
assert.equal(add.current, 4);
assert.equal(add.projected, 6, "Low-volume advice must use end-of-cycle projection, not only current sets");

const projectedHigh = template("tpl_projected_high", 14);
const highProjectionData = app({
  "2026-07-20": workoutDay({ date: "2026-07-20", source: first, completedSets: 4, stepId: "h1" }),
}, [step("h1", "push", first), step("h2", "push", projectedHigh), ...[3, 4, 5, 6, 7].map((index) => step(`h${index}`, "rest"))], [first, projectedHigh]);
const projectedReduction = buildTrainingDecision(highProjectionData, TODAY).actions.find((action) => action.kind === "reduceVolume");
assert.ok(projectedReduction && projectedReduction.kind === "reduceVolume");
assert.equal(projectedReduction.basis, "projected");
assert.equal(projectedReduction.projected, 18);
assert.equal(projectedReduction.templateId, "tpl_projected_high", "A projected correction must retain the exact source template");
assert.equal(buildTemplateAdjustmentProposal(highProjectionData, projectedReduction)?.templateId, "tpl_projected_high");

const actualHigh = template("tpl_actual_high", 10);
const actualLow = template("tpl_actual_low", 2);
const actualSourceData = app({
  "2026-07-18": workoutDay({ date: "2026-07-18", source: actualHigh, completedSets: 10, stepId: "v1" }),
  "2026-07-20": workoutDay({ date: "2026-07-20", source: actualLow, completedSets: 2, stepId: "v2" }),
}, [step("v1", "push", actualHigh), step("v2", "push", actualLow)], [actualHigh, actualLow]);
const actualReduction = buildTrainingDecision(actualSourceData, TODAY).actions.find((action) => action.kind === "reduceVolume");
assert.ok(actualReduction && actualReduction.kind === "reduceVolume");
assert.equal(actualReduction.basis, "actual");
assert.equal(actualReduction.templateId, "tpl_actual_high", "Actual excess must target the template contributing the most volume, not the most recent template using that exercise");
assert.equal(buildTemplateAdjustmentProposal(actualSourceData, actualReduction)?.templateId, "tpl_actual_high");

function regressionDay(date: string, weight: number, difficulty: SessionDifficulty): DayLog {
  const chest = template("tpl_reg_chest", 1, "bench", "chest");
  const lats = template("tpl_reg_lats", 1, "pulldown", "lats");
  return {
    date,
    workout: {
      type: "custom",
      done: true,
      difficulty,
      microcycleId: "mc_test",
      exercises: [exerciseFromTemplate(chest, 1, weight), exerciseFromTemplate(lats, 1, weight)],
    },
  };
}

const regressionDays = {
  "2026-07-16": regressionDay("2026-07-16", 100, "hard"),
  "2026-07-18": regressionDay("2026-07-18", 95, "hard"),
  "2026-07-20": regressionDay("2026-07-20", 90, "hard"),
  "2026-07-22": regressionDay("2026-07-22", 85, "hard"),
};
const recoveryData = app(regressionDays, [step("r1", "rest")]);
recoveryData.muscleTargets = { chest: { low: 1, high: 20 }, lats: { low: 1, high: 20 } };
const recoveryAnalysis = buildTrainingAnalysis(recoveryData, TODAY);
assert.equal(recoveryAnalysis.recovery.active, true, "Multiple regressions plus repeated hard sessions should trigger recovery priority");
const recoveryDecision = buildTrainingDecision(recoveryData, TODAY);
assert.equal(recoveryDecision.actions.some((action) => action.kind === "recoveryPriority"), true);
assert.equal(recoveryDecision.actions.some((action) => action.kind === "addVolume" || action.kind === "trackRegression"), false, "Recovery constraint must suppress conflicting add-volume and isolated-regression advice");

const hardOnlyDays = {
  "2026-07-16": workoutDay({ date: "2026-07-16", source: first, completedSets: 1, difficulty: "hard", weight: 80 }),
  "2026-07-18": workoutDay({ date: "2026-07-18", source: first, completedSets: 1, difficulty: "hard", weight: 82.5 }),
  "2026-07-20": workoutDay({ date: "2026-07-20", source: first, completedSets: 1, difficulty: "hard", weight: 85 }),
  "2026-07-22": workoutDay({ date: "2026-07-22", source: first, completedSets: 1, difficulty: "hard", weight: 87.5 }),
};
const hardOnlyData = app(hardOnlyDays, [step("x1", "rest")], [first]);
hardOnlyData.muscleTargets = { chest: { low: 1, high: 20 } };
assert.equal(buildTrainingAnalysis(hardOnlyData, TODAY).recovery.active, false, "Hard sessions alone must not create a deload-style conclusion without performance or volume evidence");

console.log("training analysis tests passed");
