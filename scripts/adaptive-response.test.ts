import assert from "node:assert/strict";
import { buildAdaptiveResponseModel } from "../lib/adaptiveResponse";
import type {
  AppData,
  MicrocycleStep,
  RecoveryRating,
  SessionDifficulty,
  TrainingType,
} from "../lib/types";

const DEFAULT_STEPS: MicrocycleStep[] = [
  { id: "push_a", type: "push", label: "推 A" },
  { id: "push_b", type: "push", label: "推 B" },
  { id: "rest", type: "rest", label: "休息" },
];

function baseData(): AppData {
  return {
    days: {},
    bodyWeights: [],
    waistEntries: [],
    customExercises: [],
    schedule: { split: DEFAULT_STEPS.map((step) => step.type), microcycle: DEFAULT_STEPS },
  };
}

function dayKey(day: number) {
  return `2026-07-${String(day).padStart(2, "0")}`;
}

function addTrainingDay(
  data: AppData,
  args: {
    date: string;
    id: string;
    stepId: string;
    plannedSets: number;
    completedSets: number;
    difficulty: SessionDifficulty;
    recoveryRating: RecoveryRating;
    mesocycleId?: string;
    mesocycleCycleNumber?: number;
  },
) {
  data.days[args.date] = {
    date: args.date,
    recovery: {
      sleepQuality: args.recoveryRating,
      energy: args.recoveryRating,
      soreness: (6 - args.recoveryRating) as RecoveryRating,
      stress: (6 - args.recoveryRating) as RecoveryRating,
    },
    workout: {
      type: "push",
      done: true,
      completedAt: `${args.date}T12:00:00.000Z`,
      microcycleId: args.id,
      microcycleStepId: args.stepId,
      cyclePhase: "build",
      difficulty: args.difficulty,
      ...(args.mesocycleId ? { mesocycleId: args.mesocycleId } : {}),
      ...(args.mesocycleCycleNumber ? { mesocycleCycleNumber: args.mesocycleCycleNumber } : {}),
      exercises: [{
        id: "bench",
        name: "卧推",
        isMain: true,
        sets: Array.from({ length: args.completedSets }, () => ({
          weight: 80,
          reps: 8,
          type: "working" as const,
          technique: "normal" as const,
          completion: "completed" as const,
        })),
        prescription: {
          progressionTrackId: "bench-hypertrophy",
          progressionTrackLabel: "卧推增肌",
          trainingIntent: "hypertrophy",
          targetRepMin: 6,
          targetRepMax: 10,
          workingSets: args.plannedSets,
          loadIncrementKg: 2.5,
          progressionRule: "doubleProgression",
        },
      }],
    },
  };
}

function addRestDay(
  data: AppData,
  args: {
    date: string;
    id: string;
    stepId: string;
    mesocycleId?: string;
    mesocycleCycleNumber?: number;
  },
) {
  data.days[args.date] = {
    date: args.date,
    workout: {
      type: "rest",
      done: true,
      completedAt: `${args.date}T12:00:00.000Z`,
      microcycleId: args.id,
      microcycleStepId: args.stepId,
      cyclePhase: "build",
      ...(args.mesocycleId ? { mesocycleId: args.mesocycleId } : {}),
      ...(args.mesocycleCycleNumber ? { mesocycleCycleNumber: args.mesocycleCycleNumber } : {}),
      exercises: [],
    },
  };
}

function addCycle(
  data: AppData,
  id: string,
  startDay: number,
  plannedSets: number,
  completedSets: number,
  difficulties: SessionDifficulty[],
  recoveryRating: RecoveryRating,
  complete = true,
) {
  for (let index = 0; index < 2; index += 1) {
    addTrainingDay(data, {
      date: dayKey(startDay + index),
      id,
      stepId: DEFAULT_STEPS[index].id,
      plannedSets,
      completedSets,
      difficulty: difficulties[index] ?? difficulties[0],
      recoveryRating,
    });
  }
  if (complete) addRestDay(data, { date: dayKey(startDay + 2), id, stepId: DEFAULT_STEPS[2].id });
}

function addPositionedCycle(
  data: AppData,
  args: {
    id: string;
    startDay: number;
    steps: TrainingType[];
    plannedSets: number;
    mesocycleCycleNumber: number;
    complete?: boolean;
  },
) {
  const complete = args.complete ?? true;
  args.steps.slice(0, complete ? args.steps.length : Math.max(0, args.steps.length - 1)).forEach((type, index) => {
    const common = {
      date: dayKey(args.startDay + index),
      id: args.id,
      stepId: `${args.id}_step_${index + 1}`,
      mesocycleId: "meso_compare",
      mesocycleCycleNumber: args.mesocycleCycleNumber,
    };
    if (type === "rest") addRestDay(data, common);
    else addTrainingDay(data, {
      ...common,
      plannedSets: args.plannedSets,
      completedSets: args.plannedSets,
      difficulty: "onTarget",
      recoveryRating: 4,
    });
  });
}

{
  const data = baseData();
  addCycle(data, "high_1", 1, 8, 6, ["hard", "hard"], 2);
  addCycle(data, "high_2", 5, 9, 8, ["hard", "onTarget"], 3);
  addCycle(data, "high_3", 9, 10, 10, ["onTarget", "onTarget"], 4);
  addCycle(data, "high_4", 13, 11, 11, ["easy", "onTarget"], 5);
  const model = buildAdaptiveResponseModel(data, "2026-07-20");
  assert.equal(model.confidence, "ready");
  assert.equal(model.tolerance, "high");
  assert.equal(model.volumeBias, 0.05);
  assert.equal(model.trainingDayDelta, 1);
  assert.ok(model.transitions.filter((transition) => transition.outcome === "positive").length >= 2);
}

{
  const data = baseData();
  addCycle(data, "low_1", 1, 8, 8, ["onTarget", "onTarget"], 5);
  addCycle(data, "low_2", 5, 9, 7, ["hard", "hard"], 3);
  addCycle(data, "low_3", 9, 10, 6, ["hard", "hard"], 2);
  addCycle(data, "low_4", 13, 11, 5, ["hard", "hard"], 1);
  const model = buildAdaptiveResponseModel(data, "2026-07-20");
  assert.equal(model.confidence, "ready");
  assert.equal(model.tolerance, "low");
  assert.equal(model.volumeBias, -0.1);
  assert.equal(model.trainingDayDelta, -1);
  assert.ok(model.transitions.filter((transition) => transition.outcome === "negative").length >= 2);
}

{
  const data = baseData();
  addCycle(data, "single", 1, 8, 8, ["onTarget", "onTarget"], 4);
  const model = buildAdaptiveResponseModel(data, "2026-07-10");
  assert.equal(model.confidence, "low");
  assert.equal(model.tolerance, "unknown");
  assert.equal(model.trainingDayDelta, 0);
  assert.equal(model.cycles[0]?.cycleSteps, 3);
}

{
  const data = baseData();
  data.microcycle = {
    currentId: "active_incomplete",
    startedAt: "2026-07-01",
    index: 1,
    steps: DEFAULT_STEPS,
    phase: "build",
  };
  addCycle(data, "active_incomplete", 1, 8, 8, ["onTarget", "onTarget"], 4, false);
  assert.equal(buildAdaptiveResponseModel(data, "2026-07-03").evaluatedCycles, 0, "Two sessions do not finalize a three-step active cycle");
  addRestDay(data, { date: dayKey(3), id: "active_incomplete", stepId: "rest" });
  assert.equal(buildAdaptiveResponseModel(data, "2026-07-03").evaluatedCycles, 1, "The active cycle qualifies only after its final step");
}

{
  const data = baseData();
  addPositionedCycle(data, { id: "four_day", startDay: 1, steps: ["push", "pull", "rest", "rest"], plannedSets: 8, mesocycleCycleNumber: 1 });
  addPositionedCycle(data, { id: "seven_day_equal", startDay: 7, steps: ["push", "pull", "push", "pull", "rest", "rest", "rest"], plannedSets: 7, mesocycleCycleNumber: 2 });
  data.microcycle = { currentId: "future", startedAt: "2026-07-20", index: 3, mesocycleId: "meso_compare", mesocycleCycleNumber: 3 };
  const model = buildAdaptiveResponseModel(data, "2026-07-20");
  assert.equal(model.transitions[0]?.loadRatio, 1, "Equivalent seven-day doses must compare as equal across different cycle lengths");
  assert.equal(model.cycles.find((cycle) => cycle.microcycleId === "four_day")?.prescribedSetsPer7Days, 28);
  assert.equal(model.cycles.find((cycle) => cycle.microcycleId === "seven_day_equal")?.prescribedSetsPer7Days, 28);
}

{
  const data = baseData();
  addPositionedCycle(data, { id: "four_day_base", startDay: 1, steps: ["push", "pull", "rest", "rest"], plannedSets: 8, mesocycleCycleNumber: 1 });
  addPositionedCycle(data, { id: "seven_day_higher", startDay: 7, steps: ["push", "pull", "push", "pull", "rest", "rest", "rest"], plannedSets: 8, mesocycleCycleNumber: 2 });
  data.microcycle = { currentId: "future", startedAt: "2026-07-20", index: 3, mesocycleId: "meso_compare", mesocycleCycleNumber: 3 };
  const model = buildAdaptiveResponseModel(data, "2026-07-20");
  assert.equal(model.transitions[0]?.loadRatio, 1.14, "More exposures must count as a dose increase even when sets per session stay unchanged");
}

{
  const data = baseData();
  addPositionedCycle(data, { id: "reset_incomplete", startDay: 1, steps: ["push", "push", "rest"], plannedSets: 8, mesocycleCycleNumber: 1, complete: false });
  addPositionedCycle(data, { id: "replacement_complete", startDay: 5, steps: ["push", "push", "rest"], plannedSets: 8, mesocycleCycleNumber: 1 });
  data.microcycle = { currentId: "future", startedAt: "2026-07-10", index: 3, mesocycleId: "meso_compare", mesocycleCycleNumber: 2 };
  const model = buildAdaptiveResponseModel(data, "2026-07-10");
  assert.deepEqual(model.cycles.map((cycle) => cycle.microcycleId), ["replacement_complete"], "A manual reset must not turn the abandoned half-cycle into a learning sample");
}

console.log("adaptive-response tests passed");
