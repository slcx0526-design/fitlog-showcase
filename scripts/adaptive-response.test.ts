import assert from "node:assert/strict";
import { buildAdaptiveResponseModel } from "../lib/adaptiveResponse";
import type { AppData, RecoveryRating, SessionDifficulty } from "../lib/types";

function baseData(): AppData {
  return {
    days: {},
    bodyWeights: [],
    waistEntries: [],
    customExercises: [],
    schedule: { split: ["push", "pull", "legs", "rest", "push", "pull", "rest"] },
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
) {
  for (let index = 0; index < 2; index += 1) {
    const day = String(startDay + index).padStart(2, "0");
    const date = `2026-07-${day}`;
    data.days[date] = {
      date,
      recovery: {
        sleepQuality: recoveryRating,
        energy: recoveryRating,
        soreness: (6 - recoveryRating) as RecoveryRating,
        stress: (6 - recoveryRating) as RecoveryRating,
      },
      workout: {
        type: "push",
        done: true,
        completedAt: `${date}T12:00:00.000Z`,
        microcycleId: id,
        cyclePhase: "build",
        difficulty: difficulties[index] ?? difficulties[0],
        exercises: [{
          id: "bench",
          name: "卧推",
          isMain: true,
          sets: Array.from({ length: completedSets }, () => ({
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
            workingSets: plannedSets,
            loadIncrementKg: 2.5,
            progressionRule: "doubleProgression",
          },
        }],
      },
    };
  }
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
}

console.log("adaptive-response tests passed");
