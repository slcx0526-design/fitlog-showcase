import assert from "node:assert/strict";
import { selectSafeAutomaticChanges } from "../lib/adaptiveAutomation";
import { deriveAdaptiveLearningSignals } from "../lib/adaptiveLearning";
import { buildPlanAdaptation } from "../lib/planAdaptation";
import { buildScheduleAdaptation } from "../lib/scheduleAdaptation";
import {
  defaultTrainingPolicy,
  exportTrainingPolicyBackup,
  importTrainingPolicyBackup,
  mergeTrainingPolicy,
  parseTrainingPolicyText,
} from "../lib/trainingPolicy";
import type { AppData, ExercisePreset, Template } from "../lib/types";

const TODAY = "2026-07-28";

const squat: ExercisePreset = {
  id: "cx_barbell_squat",
  name: "杠铃深蹲",
  isMain: true,
  type: "custom",
  primaryMuscle: "quads",
  volumeContributions: [{ muscle: "quads", weight: 1, direct: true }],
  equipment: "free",
  movementPattern: "squat",
  alternatives: ["cx_hack_squat"],
  custom: true,
};

const hack: ExercisePreset = {
  id: "cx_hack_squat",
  name: "哈克深蹲",
  isMain: true,
  type: "custom",
  primaryMuscle: "quads",
  volumeContributions: [{ muscle: "quads", weight: 1, direct: true }],
  equipment: "machine",
  movementPattern: "squat",
  alternatives: ["cx_barbell_squat"],
  custom: true,
};

const lateralRaise: ExercisePreset = {
  id: "cx_lateral_raise",
  name: "器械侧平举",
  isMain: false,
  type: "custom",
  primaryMuscle: "sideDelt",
  volumeContributions: [{ muscle: "sideDelt", weight: 1, direct: true }],
  equipment: "machine",
  movementPattern: "lateralRaise",
  custom: true,
};

const row: ExercisePreset = {
  id: "cx_row",
  name: "坐姿划船",
  isMain: true,
  type: "custom",
  primaryMuscle: "upperBack",
  volumeContributions: [{ muscle: "upperBack", weight: 1, direct: true }],
  equipment: "cable",
  movementPattern: "horizontalPull",
  custom: true,
};

const legTemplate: Template = {
  id: "tpl_legs",
  name: "腿部",
  type: "legs",
  items: [
    {
      exerciseId: squat.id,
      name: squat.name,
      sets: 5,
      repsLow: 6,
      repsHigh: 8,
      isMain: true,
      primaryMuscle: "quads",
      volumeContributions: squat.volumeContributions,
      equipment: squat.equipment,
      movementPattern: squat.movementPattern,
      alternatives: squat.alternatives,
    },
  ],
};

const pushTemplate: Template = {
  id: "tpl_push",
  name: "肩部推日",
  type: "push",
  items: [{
    exerciseId: lateralRaise.id,
    name: lateralRaise.name,
    sets: 4,
    repsLow: 12,
    repsHigh: 15,
    primaryMuscle: "sideDelt",
    volumeContributions: lateralRaise.volumeContributions,
    equipment: lateralRaise.equipment,
    movementPattern: lateralRaise.movementPattern,
  }],
};

const pullTemplate: Template = {
  id: "tpl_pull",
  name: "背部拉日",
  type: "pull",
  items: [{
    exerciseId: row.id,
    name: row.name,
    sets: 4,
    repsLow: 8,
    repsHigh: 12,
    isMain: true,
    primaryMuscle: "upperBack",
    volumeContributions: row.volumeContributions,
    equipment: row.equipment,
    movementPattern: row.movementPattern,
  }],
};

function data(): AppData {
  return {
    days: {},
    bodyWeights: [],
    waistEntries: [],
    customExercises: [squat, hack, lateralRaise, row],
    templates: [pushTemplate, pullTemplate, legTemplate],
    schedule: {
      split: ["push", "pull", "legs", "rest", "rest", "rest", "rest"],
      microcycle: [
        { id: "step_1", type: "push", label: "推", templateId: pushTemplate.id },
        { id: "step_2", type: "pull", label: "拉", templateId: pullTemplate.id },
        { id: "step_3", type: "legs", label: "腿", templateId: legTemplate.id },
        { id: "step_4", type: "rest", label: "休息" },
      ],
    },
  };
}

{
  const policy = mergeTrainingPolicy(defaultTrainingPolicy(), {
    exercisePreferences: { [squat.id]: "exclude" },
  });
  const proposal = buildPlanAdaptation(data(), policy, TODAY);
  const legChange = proposal.changes.find((change) => change.templateId === legTemplate.id);
  assert.ok(legChange);
  assert.equal(legChange.nextItems[0].exerciseId, hack.id);
  assert.equal(proposal.impact.replacedExercises, 1);
}

{
  const policy = mergeTrainingPolicy(defaultTrainingPolicy(), {
    maxSessionMinutes: 10,
    maxWorkingSetsPerSession: 3,
  });
  const proposal = buildPlanAdaptation(data(), policy, TODAY);
  assert.ok(proposal.changes.length >= 1);
  for (const change of proposal.changes) {
    const nextSets = change.nextItems.reduce((sum, item) => sum + item.sets, 0);
    assert.ok(nextSets <= 6);
  }
}

{
  const result = parseTrainingPolicyText(
    "肩中束优先，腿维持，每周5练，每次最多70分钟，不做杠铃深蹲",
    data(),
    defaultTrainingPolicy(),
  );
  assert.equal(result.policy.maxSessionMinutes, 70);
  assert.equal(result.policy.weeklyTrainingDays.target, 5);
  assert.equal(result.policy.musclePriorities.sideDelt, "specialize");
  assert.equal(result.policy.exercisePreferences[squat.id], "exclude");
  assert.ok(result.recognized.length >= 4);
}

{
  const policy = mergeTrainingPolicy(defaultTrainingPolicy(), {
    weeklyTrainingDays: { minimum: 4, target: 5, maximum: 6 },
    musclePriorities: { sideDelt: "specialize", quads: "maintain" },
  });
  const proposal = buildScheduleAdaptation(data(), policy, TODAY);
  assert.equal(proposal.trainingDaysAfter, 5);
  assert.equal(proposal.nextSchedule.split.filter((type) => type && type !== "rest").length, 5);
  const pushFrequency = proposal.frequencyChanges.find((change) => change.type === "push")?.after ?? 0;
  const legFrequency = proposal.frequencyChanges.find((change) => change.type === "legs")?.after ?? 0;
  assert.ok(pushFrequency >= legFrequency);
}

{
  const learned = data();
  for (let index = 0; index < 3; index += 1) {
    const date = `2026-07-${20 + index}`;
    learned.days[date] = {
      date,
      workout: {
        type: "legs",
        done: true,
        completedAt: `${date}T12:00:00.000Z`,
        templateId: legTemplate.id,
        templateSnapshot: legTemplate,
        exercises: [{
          id: hack.id,
          name: hack.name,
          isMain: true,
          primaryMuscle: hack.primaryMuscle,
          movementPattern: hack.movementPattern,
          volumeContributions: hack.volumeContributions,
          sets: [{ weight: 100, reps: 8, type: "working" }],
        }],
      },
    };
  }
  const signals = deriveAdaptiveLearningSignals(learned, defaultTrainingPolicy());
  const replacement = signals.find((signal) => signal.kind === "preferReplacement");
  assert.ok(replacement);
  assert.equal(replacement.exerciseId, squat.id);
  assert.equal(replacement.replacementExerciseId, hack.id);
}

{
  const policy = mergeTrainingPolicy(defaultTrainingPolicy(), {
    adaptationMode: "safeAuto",
    exercisePreferences: { [squat.id]: "exclude" },
    autoApply: {
      loadChanges: false,
      repChanges: false,
      setChanges: false,
      exerciseReplacement: true,
      scheduleChanges: false,
    },
  });
  const templateProposal = buildPlanAdaptation(data(), policy, TODAY);
  const scheduleProposal = buildScheduleAdaptation(data(), policy, TODAY);
  const automatic = selectSafeAutomaticChanges(data(), policy, TODAY, templateProposal, scheduleProposal);
  assert.ok(automatic.templateChanges.some((change) => change.templateId === legTemplate.id));
  assert.equal(automatic.applySchedule, false);
}

{
  const policy = mergeTrainingPolicy(defaultTrainingPolicy(), {
    decisionEvents: [{
      id: "decision_1",
      at: "2026-07-28T00:00:00.000Z",
      proposalId: "proposal_1",
      outcome: "accepted",
      summary: "测试",
    }],
  });
  const restored = importTrainingPolicyBackup(exportTrainingPolicyBackup(policy));
  assert.equal(restored.version, 3);
  assert.equal(restored.decisionEvents.length, 1);
  assert.equal(restored.evidenceMode, "preview");
  assert.equal(restored.evidenceMinimumConfidence, "building");
}

console.log("training-policy tests passed");
