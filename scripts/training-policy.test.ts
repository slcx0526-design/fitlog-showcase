import assert from "node:assert/strict";
import { selectSafeAutomaticChanges } from "../lib/adaptiveAutomation";
import { applyAdaptivePlanPatch } from "../lib/adaptivePlanCommit";
import { adaptiveText } from "../lib/adaptiveText";
import { acceptAdaptiveLearningSignal, deriveAdaptiveLearningSignals } from "../lib/adaptiveLearning";
import { buildPlanAdaptation } from "../lib/planAdaptation";
import { buildScheduleAdaptation } from "../lib/scheduleAdaptation";
import { defaultMicrocycle } from "../lib/microcycle";
import { DEFAULT_EXERCISES } from "../lib/exercises";
import {
  defaultTrainingPolicy,
  exportTrainingPolicyBackup,
  importTrainingPolicyBackup,
  loadTrainingPolicy,
  mergeTrainingPolicy,
  parseTrainingPolicyText,
  PREVIOUS_TRAINING_POLICY_STORAGE_KEY,
  setExerciseLock,
  setMusclePriority,
  TRAINING_POLICY_STORAGE_KEY,
} from "../lib/trainingPolicy";
import type { AppData, ExercisePreset, Schedule, Template } from "../lib/types";

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

const chestAndSideDeltPress: ExercisePreset = {
  id: "cx_chest_side_delt_press",
  name: "胸肩复合推",
  isMain: true,
  type: "custom",
  primaryMuscle: "chest",
  secondaryMuscles: ["sideDelt"],
  volumeContributions: [
    { muscle: "chest", weight: 1, direct: true },
    { muscle: "sideDelt", weight: 1, direct: true },
  ],
  equipment: "machine",
  movementPattern: "horizontalPush",
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
  assert.equal(result.policy.musclePriorities.quads, "maintain");
  assert.equal(result.policy.musclePriorities.hamstrings, "maintain");
  assert.equal(result.policy.musclePriorities.glutes, "maintain");
  assert.equal(result.policy.exercisePreferences[squat.id], "exclude");
  assert.ok(result.recognized.length >= 4);
}

{
  const result = parseTrainingPolicyText(
    "胸为主，肩增长，背维持，腿少练，手臂增长",
    data(),
    defaultTrainingPolicy(),
  );
  assert.equal(result.policy.musclePriorities.chest, "specialize");
  assert.equal(result.policy.musclePriorities.upperChest, "specialize");
  assert.equal(result.policy.musclePriorities.frontDelt, "grow");
  assert.equal(result.policy.musclePriorities.sideDelt, "grow");
  assert.equal(result.policy.musclePriorities.rearDelt, "grow");
  assert.equal(result.policy.musclePriorities.lats, "maintain");
  assert.equal(result.policy.musclePriorities.upperBack, "maintain");
  assert.equal(result.policy.musclePriorities.quads, "deprioritize");
  assert.equal(result.policy.musclePriorities.hamstrings, "deprioritize");
  assert.equal(result.policy.musclePriorities.glutes, "deprioritize");
  assert.equal(result.policy.musclePriorities.biceps, "grow");
  assert.equal(result.policy.musclePriorities.triceps, "grow");
  assert.equal(result.unresolved.length, 0);
}

{
  const current = data();
  current.microcycle = defaultMicrocycle(TODAY, current.schedule, current.templates);
  const presets = new Map(DEFAULT_EXERCISES.map((exercise) => [exercise.id, exercise]));
  const ids = ["px_barbell_bench", "px_incline_press", "px_machine_lateral", "px_triceps_pushdown"];
  const sets = [4, 3, 4, 3];
  const priorityPush: Template = {
    id: "tpl_push_priority",
    name: "胸肩推日",
    type: "push",
    items: ids.map((id, index) => {
      const exercise = presets.get(id)!;
      return {
        exerciseId: exercise.id,
        name: exercise.name,
        sets: sets[index],
        repsLow: 8,
        repsHigh: 12,
        isMain: exercise.isMain,
        primaryMuscle: exercise.primaryMuscle,
        secondaryMuscles: exercise.secondaryMuscles,
        volumeContributions: exercise.volumeContributions,
        equipment: exercise.equipment,
        movementPattern: exercise.movementPattern,
      };
    }),
  };
  current.templates = [priorityPush, pullTemplate, legTemplate];
  current.schedule.microcycle = [
    { id: "priority_1", type: "push", label: "推", templateId: priorityPush.id },
    { id: "priority_2", type: "pull", label: "拉", templateId: pullTemplate.id },
    { id: "priority_3", type: "legs", label: "腿", templateId: legTemplate.id },
    { id: "priority_4", type: "rest", label: "休息" },
  ];

  const parsed = parseTrainingPolicyText("胸部为主，中束增长", current, defaultTrainingPolicy());
  assert.equal(parsed.policy.musclePriorities.chest, "specialize");
  assert.equal(parsed.policy.musclePriorities.sideDelt, "grow");

  const proposal = buildPlanAdaptation(current, parsed.policy, TODAY);
  const change = proposal.changes.find((item) => item.templateId === priorityPush.id);
  assert.ok(change, "Both stated priorities should produce a bounded push-day proposal");
  const nextById = new Map(change.nextItems.map((item) => [item.exerciseId, item]));
  assert.equal(nextById.get("px_barbell_bench")?.sets, 4, "A four-day PPL loop is already frequent enough that chest focus must not add another same-session set");
  assert.equal(nextById.get("px_incline_press")?.sets, 3);
  assert.equal(nextById.get("px_machine_lateral")?.sets, 5);
  assert.equal(nextById.get("px_triceps_pushdown")?.sets, 3, "Unrequested triceps work must not be stripped to fund chest volume");
  assert.ok(change.nextItems.every((item, index) => Math.abs(item.sets - priorityPush.items[index].sets) <= 1));
  const chestFamilySets = change.nextItems.reduce((total, item) => total + (item.volumeContributions ?? [])
    .filter((entry) => entry.direct && (entry.muscle === "chest" || entry.muscle === "upperChest"))
    .reduce((sum, entry) => sum + item.sets * entry.weight, 0), 0);
  assert.ok(chestFamilySets <= 7, `Chest-family work must respect the frequency-adjusted session cap, received ${chestFamilySets}`);
  assert.ok(proposal.warnings.some((warning) => warning.includes("不把剩余缺口集中堆到一天")));
}

{
  const result = parseTrainingPolicyText("上胸增长", data(), defaultTrainingPolicy());
  assert.equal(result.policy.musclePriorities.upperChest, "grow");
  assert.equal(result.policy.musclePriorities.chest, undefined, "A longer muscle alias must not leak into its parent muscle");
}

{
  const current = data();
  const presets = new Map(DEFAULT_EXERCISES.map((exercise) => [exercise.id, exercise]));
  const ids = ["px_barbell_bench", "px_incline_press", "px_machine_lateral", "px_triceps_pushdown"];
  const sets = [3, 2, 3, 3];
  const balancedPriorityPush: Template = {
    id: "tpl_balanced_priority",
    name: "胸肩均衡优先",
    type: "push",
    items: ids.map((id, index) => {
      const exercise = presets.get(id)!;
      return {
        exerciseId: exercise.id,
        name: exercise.name,
        sets: sets[index],
        repsLow: 8,
        repsHigh: 12,
        isMain: exercise.isMain,
        primaryMuscle: exercise.primaryMuscle,
        secondaryMuscles: exercise.secondaryMuscles,
        volumeContributions: exercise.volumeContributions,
        equipment: exercise.equipment,
        movementPattern: exercise.movementPattern,
      };
    }),
  };
  current.templates = [balancedPriorityPush, pullTemplate, legTemplate];
  current.schedule.microcycle = [
    { id: "balanced_1", type: "push", label: "推", templateId: balancedPriorityPush.id },
    { id: "balanced_2", type: "pull", label: "拉", templateId: pullTemplate.id },
    { id: "balanced_3", type: "legs", label: "腿", templateId: legTemplate.id },
    { id: "balanced_4", type: "rest", label: "休息" },
  ];
  const parsed = parseTrainingPolicyText("胸为主，中束增长", current, defaultTrainingPolicy());
  const proposal = buildPlanAdaptation(current, parsed.policy, TODAY);
  const change = proposal.changes.find((item) => item.templateId === balancedPriorityPush.id);
  assert.ok(change);
  const nextById = new Map(change.nextItems.map((item) => [item.exerciseId, item.sets]));
  assert.equal(nextById.get("px_barbell_bench"), 4);
  assert.equal(nextById.get("px_incline_press"), 2, "One broad chest intent must receive only one recovery-family addition per pass");
  assert.equal(nextById.get("px_machine_lateral"), 4, "A second requested muscle family must not be starved by a broad chest goal");
  assert.equal(nextById.get("px_triceps_pushdown"), 3);
}

{
  const current = data();
  current.microcycle = defaultMicrocycle(TODAY, current.schedule, current.templates);
  const presets = new Map(DEFAULT_EXERCISES.map((exercise) => [exercise.id, exercise]));
  const ids = ["px_barbell_bench", "px_incline_press", "px_machine_lateral", "px_triceps_pushdown"];
  const sets = [4, 4, 4, 3];
  const repeatedPush: Template = {
    id: "tpl_repeated_push",
    name: "六日三分化推日",
    type: "push",
    items: ids.map((id, index) => {
      const exercise = presets.get(id)!;
      return {
        exerciseId: exercise.id,
        name: exercise.name,
        sets: sets[index],
        repsLow: 8,
        repsHigh: 12,
        isMain: exercise.isMain,
        primaryMuscle: exercise.primaryMuscle,
        secondaryMuscles: exercise.secondaryMuscles,
        volumeContributions: exercise.volumeContributions,
        equipment: exercise.equipment,
        movementPattern: exercise.movementPattern,
      };
    }),
  };
  current.templates = [repeatedPush, pullTemplate, legTemplate];
  current.schedule.microcycle = [
    { id: "ppl_1", type: "push", label: "推 1" },
    { id: "ppl_2", type: "pull", label: "拉 1", templateId: pullTemplate.id },
    { id: "ppl_3", type: "legs", label: "腿 1", templateId: legTemplate.id },
    { id: "ppl_4", type: "push", label: "推 2" },
    { id: "ppl_5", type: "pull", label: "拉 2", templateId: pullTemplate.id },
    { id: "ppl_6", type: "legs", label: "腿 2", templateId: legTemplate.id },
    { id: "ppl_7", type: "rest", label: "休息" },
  ];

  const parsed = parseTrainingPolicyText("胸部为主，中束增长", current, defaultTrainingPolicy());
  const proposal = buildPlanAdaptation(current, parsed.policy, TODAY);
  const change = proposal.changes.find((item) => item.templateId === repeatedPush.id);
  assert.ok(change);
  const nextById = new Map(change.nextItems.map((item) => [item.exerciseId, item.sets]));
  const chestFamilySets = change.nextItems.reduce((total, item) => total + (item.volumeContributions ?? [])
    .filter((entry) => entry.direct && (entry.muscle === "chest" || entry.muscle === "upperChest"))
    .reduce((sum, entry) => sum + item.sets * entry.weight, 0), 0);
  assert.ok(chestFamilySets <= 7, `A twice-per-cycle PPL split must distribute chest work, received ${chestFamilySets} direct sets in one session`);
  assert.equal(nextById.get("px_machine_lateral"), 5, "The second stated priority must still receive a bounded increase");
  assert.equal(nextById.get("px_triceps_pushdown"), 3, "Frequency distribution must not strip unrelated arm work");
  assert.ok(change.reasons.some((reason) => reason.includes("7 天微周期 2 次刺激")), "The proposal must explain why the per-session cap was lowered");
}

{
  const result = parseTrainingPolicyText(
    "胸部是重点，中束也想加强",
    data(),
    defaultTrainingPolicy(),
  );
  assert.equal(result.policy.musclePriorities.chest, "specialize");
  assert.equal(result.policy.musclePriorities.sideDelt, "grow");
  assert.equal(result.unresolved.length, 0, "Natural connectors must not hide a missed muscle priority");
  const english = parseTrainingPolicyText("Focus on chest and grow side delts", data(), defaultTrainingPolicy());
  assert.equal(english.policy.musclePriorities.chest, "specialize");
  assert.equal(english.policy.musclePriorities.sideDelt, "grow");
}

{
  const current = data();
  const sharedTemplate: Template = {
    id: "tpl_shared_priority",
    name: "胸肩共同优先",
    type: "push",
    items: [chestAndSideDeltPress, lateralRaise].map((exercise) => ({
      exerciseId: exercise.id,
      name: exercise.name,
      sets: 3,
      repsLow: 8,
      repsHigh: 12,
      isMain: exercise.isMain,
      primaryMuscle: exercise.primaryMuscle,
      secondaryMuscles: exercise.secondaryMuscles,
      volumeContributions: exercise.volumeContributions,
      equipment: exercise.equipment,
      movementPattern: exercise.movementPattern,
    })),
  };
  current.customExercises = [...current.customExercises, chestAndSideDeltPress];
  current.templates = [sharedTemplate, pullTemplate, legTemplate];
  current.schedule.microcycle = [
    { id: "shared_1", type: "push", label: "推", templateId: sharedTemplate.id },
    { id: "shared_2", type: "pull", label: "拉", templateId: pullTemplate.id },
    { id: "shared_3", type: "legs", label: "腿", templateId: legTemplate.id },
    { id: "shared_4", type: "rest", label: "休息 1" },
    { id: "shared_5", type: "rest", label: "休息 2" },
    { id: "shared_6", type: "rest", label: "休息 3" },
    { id: "shared_7", type: "rest", label: "休息 4" },
  ];
  current.muscleTargets = {
    chest: { low: 20, high: 24 },
    sideDelt: { low: 20, high: 24 },
  };
  const policy = mergeTrainingPolicy(defaultTrainingPolicy(), {
    musclePriorities: { chest: "grow", sideDelt: "grow" },
  });
  const proposal = buildPlanAdaptation(current, policy, TODAY);
  const change = proposal.changes.find((item) => item.templateId === sharedTemplate.id);
  assert.ok(change);
  const nextById = new Map(change.nextItems.map((item) => [item.exerciseId, item.sets]));
  assert.equal(nextById.get(chestAndSideDeltPress.id), 4, "One shared exercise can receive at most one priority addition");
  assert.equal(nextById.get(lateralRaise.id), 4, "The second priority must use another eligible exercise");
}

{
  const current = data();
  const presets = new Map(DEFAULT_EXERCISES.map((exercise) => [exercise.id, exercise]));
  const ids = ["px_barbell_bench", "px_incline_press", "px_triceps_pushdown"];
  const overCapTemplate: Template = {
    id: "tpl_over_cap_push",
    name: "胸部超量推日",
    type: "push",
    items: ids.map((id, index) => {
      const exercise = presets.get(id)!;
      return {
        exerciseId: exercise.id,
        name: exercise.name,
        sets: index < 2 ? 5 : 3,
        repsLow: 8,
        repsHigh: 12,
        isMain: exercise.isMain,
        primaryMuscle: exercise.primaryMuscle,
        secondaryMuscles: exercise.secondaryMuscles,
        volumeContributions: exercise.volumeContributions,
        equipment: exercise.equipment,
        movementPattern: exercise.movementPattern,
      };
    }),
  };
  current.templates = [overCapTemplate, pullTemplate, legTemplate];
  current.schedule.microcycle = [
    { id: "cap_1", type: "push", label: "推", templateId: overCapTemplate.id },
    { id: "cap_2", type: "pull", label: "拉", templateId: pullTemplate.id },
    { id: "cap_3", type: "legs", label: "腿", templateId: legTemplate.id },
    { id: "cap_4", type: "rest", label: "休息" },
  ];
  const proposal = buildPlanAdaptation(current, defaultTrainingPolicy(), TODAY);
  const change = proposal.changes.find((item) => item.templateId === overCapTemplate.id);
  assert.ok(change, "An existing session above a recovery-family cap must produce a correction proposal");
  const chestFamilySets = change.nextItems.reduce((total, item) => total + (item.volumeContributions ?? [])
    .filter((entry) => entry.direct && (entry.muscle === "chest" || entry.muscle === "upperChest"))
    .reduce((sum, entry) => sum + item.sets * entry.weight, 0), 0);
  assert.ok(chestFamilySets <= 8, `Existing chest-family volume must be repaired to the 8-set cap, received ${chestFamilySets}`);
  assert.equal(change.nextItems.find((item) => item.exerciseId === "px_triceps_pushdown")?.sets, 3, "Recovery repair must not remove unrelated direct triceps work");
}

{
  const current = data();
  const oneSetTemplate: Template = {
    id: "tpl_one_set_cap",
    name: "单组动作超限",
    type: "push",
    items: Array.from({ length: 8 }, (_, index) => ({
      exerciseId: `cx_one_set_${index}`,
      name: `单组动作 ${index + 1}`,
      sets: 1,
      repsLow: 8,
      repsHigh: 12,
      isMain: false,
      primaryMuscle: "chest" as const,
      volumeContributions: [{ muscle: "chest" as const, weight: 1, direct: true }],
    })),
  };
  current.templates = [oneSetTemplate];
  current.schedule = {
    split: ["push", "rest", "rest", "rest", "rest", "rest", "rest"],
    microcycle: [{ id: "one_set_step", type: "push", label: "推", templateId: oneSetTemplate.id }],
  };
  const policy = mergeTrainingPolicy(defaultTrainingPolicy(), {
    weeklyTrainingDays: { minimum: 1, target: 1, maximum: 2 },
    maxExercisesPerSession: 8,
    maxWorkingSetsPerSession: 6,
    maxSessionMinutes: 240,
  });
  const proposal = buildPlanAdaptation(current, policy, TODAY);
  const change = proposal.changes.find((item) => item.templateId === oneSetTemplate.id);
  assert.ok(change, "A hard set cap must still be enforced when every movement is already at one set");
  assert.ok(change.nextItems.reduce((sum, item) => sum + item.sets, 0) <= 6);
  assert.equal(change.nextItems.length, 6);
  assert.equal(proposal.impact.removedExercises, 2);
  assert.ok(change.reasons.some((reason) => reason.includes("单次上限仍超出")));
  assert.match(adaptiveText("en", change.reasons.find((reason) => reason.includes("单次上限仍超出"))!), /within 240 minutes and 6 sets/);
}

{
  const current = data();
  const oneSetRecoveryTemplate: Template = {
    id: "tpl_one_set_recovery_cap",
    name: "单组胸部恢复超限",
    type: "push",
    items: Array.from({ length: 9 }, (_, index) => ({
      exerciseId: `cx_one_set_chest_${index}`,
      name: `胸部单组动作 ${index + 1}`,
      sets: 1,
      repsLow: 8,
      repsHigh: 12,
      isMain: index === 0,
      primaryMuscle: index === 0 ? "upperChest" as const : "chest" as const,
      volumeContributions: [{ muscle: index === 0 ? "upperChest" as const : "chest" as const, weight: 1, direct: true }],
    })),
  };
  current.templates = [oneSetRecoveryTemplate];
  current.schedule = {
    split: ["push", "rest", "rest", "rest", "rest", "rest", "rest"],
    microcycle: [{ id: "one_set_recovery_step", type: "push", label: "推", templateId: oneSetRecoveryTemplate.id }],
  };
  const policy = mergeTrainingPolicy(defaultTrainingPolicy(), {
    weeklyTrainingDays: { minimum: 1, target: 1, maximum: 2 },
    musclePriorities: { chest: "specialize" },
    maxExercisesPerSession: 12,
    maxWorkingSetsPerSession: 12,
    maxSessionMinutes: 240,
  });
  const proposal = buildPlanAdaptation(current, policy, TODAY);
  const change = proposal.changes.find((item) => item.templateId === oneSetRecoveryTemplate.id);
  assert.ok(change, "A recovery cap must still be enforced when every contributing movement is already at one set");
  const chestSets = change.nextItems.reduce((total, item) => total + (item.volumeContributions ?? [])
    .filter((entry) => entry.direct && (entry.muscle === "chest" || entry.muscle === "upperChest"))
    .reduce((sum, entry) => sum + item.sets * entry.weight, 0), 0);
  assert.ok(chestSets <= 8, `One-set chest movements must be repaired to the recovery cap, received ${chestSets}`);
  assert.ok(change.nextItems.some((item) => item.exerciseId === "cx_one_set_chest_0"), "The main movement should survive before lower-priority accessories");
  assert.ok(change.reasons.some((reason) => reason.includes("移除低优先级动作")));
  assert.match(adaptiveText("en", change.reasons.find((reason) => reason.includes("移除低优先级动作"))!), /direct-work cap/);
}

{
  const base = mergeTrainingPolicy(defaultTrainingPolicy(), {
    weeklyTrainingDays: { minimum: 2, target: 3, maximum: 4 },
  });
  const result = parseTrainingPolicyText(
    "Prioritize side delts, train 5 days per week, max 70 minutes, exclude squat",
    data(),
    base,
  );
  assert.equal(result.policy.maxSessionMinutes, 70);
  assert.equal(result.policy.weeklyTrainingDays.target, 5);
  assert.equal(result.policy.musclePriorities.sideDelt, "specialize");
  assert.equal(result.policy.exercisePreferences.lg_squat, "exclude");
}

{
  const result = parseTrainingPolicyText("每 7 天 4 练", data(), defaultTrainingPolicy());
  assert.equal(result.policy.weeklyTrainingDays.target, 4);
  assert.ok(result.recognized.includes("每 7 天训练目标：4 次"));
  assert.equal(adaptiveText("en", "每 7 天训练目标：4 次"), "Target: 4 training sessions per 7 days");
}

{
  const result = parseTrainingPolicyText(
    "三角筋中部を優先、週4日、1回60分まで",
    data(),
    defaultTrainingPolicy(),
  );
  assert.equal(result.policy.maxSessionMinutes, 60);
  assert.equal(result.policy.weeklyTrainingDays.target, 4);
  assert.equal(result.policy.musclePriorities.sideDelt, "specialize");
  assert.equal(adaptiveText("en", "高难度训练占比下降"), "The share of hard sessions decreased");
}

{
  const policy = mergeTrainingPolicy(defaultTrainingPolicy(), {
    weeklyTrainingDays: { minimum: 4, target: 5, maximum: 6 },
    musclePriorities: { sideDelt: "specialize", quads: "maintain" },
  });
  const proposal = buildScheduleAdaptation(data(), policy, TODAY);
  assert.equal(proposal.cycleDays, 4);
  assert.equal(proposal.targetWeeklyTrainingDays, 5);
  assert.equal(proposal.targetTrainingDays, 3);
  assert.equal(proposal.trainingDaysAfter, 3);
  assert.equal(proposal.nextSchedule.microcycle?.length, 4);
  assert.equal(proposal.nextSchedule.split.filter((type) => type && type !== "rest").length, 3);
  assert.equal(proposal.weeklyEquivalentAfter, 5.3);
  assert.equal(proposal.changed, false, "A compliant microcycle must not be reordered just to match a generated layout");
  assert.deepEqual(proposal.nextSchedule, data().schedule);
  assert.ok(proposal.reasons.some((reason) => reason.includes("折算到 4 天微周期为 3 个训练日")));
  const pushFrequency = proposal.frequencyChanges.find((change) => change.type === "push")?.after ?? 0;
  const legFrequency = proposal.frequencyChanges.find((change) => change.type === "legs")?.after ?? 0;
  assert.ok(pushFrequency >= legFrequency);
}

{
  const current = data();
  const base = current.schedule.microcycle!;
  current.schedule = {
    split: [...base, ...base].map((step) => step.type),
    microcycle: [...base, ...base.map((step, index) => ({ ...step, id: `${step.id}_repeat_${index}` }))],
  };
  const policy = mergeTrainingPolicy(defaultTrainingPolicy(), {
    weeklyTrainingDays: { minimum: 3, target: 4, maximum: 5 },
  });
  const proposal = buildScheduleAdaptation(current, policy, TODAY);
  assert.equal(proposal.cycleDays, 8);
  assert.equal(proposal.targetTrainingDays, 5);
  assert.equal(proposal.trainingDaysAfter, 5);
  assert.equal(proposal.changed, true);
  assert.equal(proposal.nextSchedule.microcycle?.length, 8, "Schedule adaptation must preserve a non-seven-day microcycle");
  assert.equal(proposal.nextSchedule.split.length, 8);
  assert.equal(proposal.weeklyEquivalentAfter, 4.4);
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
  const staleDifficulty = data();
  for (let index = 1; index <= 10; index += 1) {
    const date = `2026-07-${String(index).padStart(2, "0")}`;
    staleDifficulty.days[date] = {
      date,
      workout: {
        type: "legs",
        done: true,
        difficulty: index <= 5 ? "hard" : "onTarget",
        templateId: legTemplate.id,
        templateSnapshot: legTemplate,
        exercises: [{
          id: squat.id,
          name: squat.name,
          isMain: true,
          sets: [{ weight: 100, reps: 8, type: "working" }],
        }],
      },
    };
  }
  assert.equal(
    deriveAdaptiveLearningSignals(staleDifficulty, defaultTrainingPolicy()).some((signal) => signal.kind === "reduceSessionLoad"),
    false,
    "Older hard sessions must not be mistaken for three hard sessions in the latest five",
  );
  for (const date of ["2026-07-08", "2026-07-09", "2026-07-10"]) {
    staleDifficulty.days[date].workout!.difficulty = "hard";
  }
  assert.equal(
    deriveAdaptiveLearningSignals(staleDifficulty, defaultTrainingPolicy()).some((signal) => signal.kind === "reduceSessionLoad"),
    true,
  );
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
  const current = data();
  current.microcycle = defaultMicrocycle(TODAY, current.schedule, current.templates);
  const policy = mergeTrainingPolicy(defaultTrainingPolicy(), {
    adaptationMode: "safeAuto",
    musclePriorities: { sideDelt: "specialize" },
    autoApply: {
      loadChanges: false,
      repChanges: false,
      setChanges: true,
      exerciseReplacement: false,
      scheduleChanges: false,
    },
  });
  const firstPlan = buildPlanAdaptation(current, policy, TODAY);
  const firstSchedule = buildScheduleAdaptation(current, policy, TODAY);
  const firstAutomatic = selectSafeAutomaticChanges(current, policy, TODAY, firstPlan, firstSchedule);
  assert.ok(firstAutomatic.templateChanges.length > 0);
  const afterAutomatic = applyAdaptivePlanPatch(
    current,
    firstAutomatic.templateChanges.map((change) => ({ templateId: change.templateId, nextItems: change.nextItems })),
  );
  const secondPlan = buildPlanAdaptation(afterAutomatic, policy, TODAY);
  const secondSchedule = buildScheduleAdaptation(afterAutomatic, policy, TODAY);
  const secondAutomatic = selectSafeAutomaticChanges(afterAutomatic, policy, TODAY, secondPlan, secondSchedule);
  assert.equal(
    secondAutomatic.revision,
    firstAutomatic.revision,
    "An automatic set change must not create a new revision and repeatedly apply itself in the same cycle",
  );
  const changedShape = {
    ...afterAutomatic,
    templates: afterAutomatic.templates?.map((template, index) => index === 0
      ? { ...template, items: [...template.items, { ...template.items[0], exerciseId: "shape_change", name: "新增动作" }] }
      : template),
  };
  const shapeAutomatic = selectSafeAutomaticChanges(
    changedShape,
    policy,
    TODAY,
    buildPlanAdaptation(changedShape, policy, TODAY),
    buildScheduleAdaptation(changedShape, policy, TODAY),
  );
  assert.notEqual(shapeAutomatic.revision, firstAutomatic.revision, "A user-visible plan shape change must be evaluated once");
  const nextCycle = {
    ...afterAutomatic,
    microcycle: { ...afterAutomatic.microcycle!, currentId: "mc_next_policy_cycle", index: afterAutomatic.microcycle!.index + 1 },
  };
  const nextCycleAutomatic = selectSafeAutomaticChanges(
    nextCycle,
    policy,
    TODAY,
    buildPlanAdaptation(nextCycle, policy, TODAY),
    buildScheduleAdaptation(nextCycle, policy, TODAY),
  );
  assert.notEqual(nextCycleAutomatic.revision, firstAutomatic.revision, "A genuinely new microcycle may evaluate the same policy once again");
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
  assert.equal(restored.version, 4);
  assert.equal(restored.decisionEvents.length, 1);
  assert.equal(restored.evidenceMode, "preview");
  assert.equal(restored.evidenceMinimumConfidence, "building");
}

{
  const current = data();
  current.microcycle = defaultMicrocycle(TODAY, current.schedule, current.templates);
  const nextSchedule: Schedule = {
    split: ["legs", "rest", "push", "pull", "rest", "rest", "rest"],
    microcycle: [
      { id: "next_1", type: "legs" as const, label: "腿", templateId: legTemplate.id },
      { id: "next_2", type: "rest" as const, label: "休息" },
      { id: "next_3", type: "push" as const, label: "推", templateId: pushTemplate.id },
      { id: "next_4", type: "pull" as const, label: "拉", templateId: pullTemplate.id },
    ],
  };
  const next = applyAdaptivePlanPatch(current, [{
    templateId: legTemplate.id,
    nextItems: [{ ...legTemplate.items[0], sets: 4 }],
  }], nextSchedule);
  assert.equal(current.templates?.find((template) => template.id === legTemplate.id)?.items[0].sets, 5);
  assert.equal(next.templates?.find((template) => template.id === legTemplate.id)?.items[0].sets, 4);
  assert.equal(next.schedule.microcycle?.[0].templateId, legTemplate.id);
  assert.equal(next.microcycle?.steps?.[0].templateSnapshot?.items[0].sets, 4);
  assert.notEqual(next, current, "Adaptive plan commit must produce one immutable next state");
}

{
  const result = parseTrainingPolicyText(
    "胸部为主，中束增长，保持三分化，胸每次最多6组，保留杠铃深蹲，晚上跑步",
    data(),
    defaultTrainingPolicy(),
  );
  assert.equal(result.policy.musclePriorities.chest, "specialize");
  assert.equal(result.policy.musclePriorities.sideDelt, "grow");
  assert.equal(result.policy.scheduleAdaptation, "preserve");
  assert.equal(result.policy.exerciseLocks[squat.id], "keep");
  assert.equal(result.policy.planTargets.find((target) => target.muscles.includes("chest"))?.maxDirectSetsPerSession, 6);
  assert.deepEqual(result.unresolved, ["晚上跑步"]);
  assert.equal(result.clauses.at(-1)?.status, "unresolved");

  const partial = parseTrainingPolicyText("胸为主但每天都要练到力竭", data(), defaultTrainingPolicy());
  assert.equal(partial.clauses[0]?.status, "partial");
  assert.ok(partial.clauses[0]?.unresolved?.includes("每天都要练到力竭"));
}

{
  const selected = setMusclePriority(defaultTrainingPolicy(), "sideDelt", "grow");
  assert.equal(selected.musclePriorities.sideDelt, "grow");
  const cleared = setMusclePriority(selected, "sideDelt", undefined);
  assert.equal(cleared.musclePriorities.sideDelt, undefined, "Returning a muscle to default must remove the stored priority");
  const locked = setExerciseLock(cleared, squat.id, "freeze");
  assert.equal(setExerciseLock(locked, squat.id, undefined).exerciseLocks[squat.id], undefined, "Unlocking must remove the stored lock");
}

{
  const current = data();
  const parsed = parseTrainingPolicyText("中束本轮12-16组", current, defaultTrainingPolicy());
  assert.equal(parsed.policy.musclePriorities.sideDelt, undefined, "An explicit dose target does not need an invented growth label");
  const target = parsed.policy.planTargets.find((item) => item.muscles.includes("sideDelt"));
  assert.deepEqual(target?.cycleTarget, { low: 12, high: 16 });
  const proposal = buildPlanAdaptation(current, parsed.policy, TODAY);
  assert.equal(
    proposal.changes.find((change) => change.templateId === pushTemplate.id)?.nextItems[0]?.sets,
    5,
    "An explicit cycle target must create a bounded correction without a separate growth keyword",
  );
}

{
  const current = data();
  const parsed = parseTrainingPolicyText("胸增长", current, defaultTrainingPolicy());
  const proposal = buildPlanAdaptation(current, parsed.policy, TODAY);
  const change = proposal.changes.find((item) => item.templateId === pushTemplate.id);
  assert.ok(change, "A missing priority movement must produce a proposal");
  const added = change.nextItems.find((item) => !pushTemplate.items.some((source) => source.exerciseId === item.exerciseId));
  assert.ok(added, "The planner must add a compatible built-in movement instead of only changing existing exercises");
  assert.ok((added.volumeContributions ?? []).some((entry) => entry.direct && (entry.muscle === "chest" || entry.muscle === "upperChest")));
  assert.equal(proposal.impact.addedExercises, 1);
  assert.ok(change.itemDiffs.some((diff) => diff.kind === "added" && diff.exerciseId === added.exerciseId));
}

{
  const current = data();
  current.muscleTargets = { sideDelt: { low: 1, high: 2 } };
  const parsed = parseTrainingPolicyText("胸增长，保持总组数", current, defaultTrainingPolicy());
  const proposal = buildPlanAdaptation(current, parsed.policy, TODAY);
  const change = proposal.changes.find((item) => item.templateId === pushTemplate.id);
  assert.ok(change);
  assert.equal(
    change.nextItems.reduce((sum, item) => sum + item.sets, 0),
    pushTemplate.items.reduce((sum, item) => sum + item.sets, 0),
    "Preserve-total mode must fund a new target movement with an equal low-priority reduction",
  );
  assert.ok(change.reasons.includes("保持总工作组数：新增动作由低优先级组数等量置换"));
}

{
  const current = data();
  const policy = mergeTrainingPolicy(defaultTrainingPolicy(), {
    musclePriorities: { sideDelt: "grow" },
    exerciseLocks: { [lateralRaise.id]: "freeze" },
  });
  const proposal = buildPlanAdaptation(current, policy, TODAY);
  assert.equal(proposal.changes.find((change) => change.templateId === pushTemplate.id), undefined, "A frozen exercise must not receive automatic set changes");

  const conflict = mergeTrainingPolicy(defaultTrainingPolicy(), {
    exercisePreferences: { [squat.id]: "exclude" },
    exerciseLocks: { [squat.id]: "keep" },
  });
  const conflictProposal = buildPlanAdaptation(current, conflict, TODAY);
  assert.equal(conflictProposal.changes.find((change) => change.templateId === legTemplate.id), undefined);
  assert.ok(conflictProposal.warnings.some((warning) => warning.includes("设为保留") && warning.includes("动作已排除")));
}

{
  const current = data();
  current.templates = [pushTemplate];
  current.schedule = {
    split: ["push", "push", "rest", "rest", "rest", "rest", "rest"],
    microcycle: [
      { id: "recovery_1", type: "push", label: "推 1", templateId: pushTemplate.id },
      { id: "recovery_2", type: "push", label: "推 2", templateId: pushTemplate.id },
      { id: "recovery_3", type: "rest", label: "休息" },
      { id: "recovery_4", type: "rest", label: "休息" },
      { id: "recovery_5", type: "rest", label: "休息" },
      { id: "recovery_6", type: "rest", label: "休息" },
      { id: "recovery_7", type: "rest", label: "休息" },
    ],
  };
  const policy = mergeTrainingPolicy(defaultTrainingPolicy(), {
    weeklyTrainingDays: { minimum: 1, target: 2, maximum: 3 },
    minimumRecoveryDays: 2,
  });
  const proposal = buildScheduleAdaptation(current, policy, TODAY);
  const pushPositions = proposal.nextSchedule.microcycle?.flatMap((step, index) => step.type === "push" ? [index] : []) ?? [];
  assert.equal(proposal.changed, true);
  assert.deepEqual(pushPositions, [0, 3]);
  assert.ok(proposal.reasons.some((reason) => reason.includes("至少间隔 2 天")));
}

{
  const policy = mergeTrainingPolicy(defaultTrainingPolicy(), {
    decisionEvents: [
      { id: "reject_1", at: "2026-07-20T00:00:00.000Z", proposalId: "proposal_1", outcome: "rejected", summary: "拒绝", feedbackReason: "volumeTooHigh" },
      { id: "reject_2", at: "2026-07-21T00:00:00.000Z", proposalId: "proposal_2", outcome: "rejected", summary: "拒绝", feedbackReason: "volumeTooHigh" },
    ],
  });
  const signal = deriveAdaptiveLearningSignals(data(), policy).find((item) => item.kind === "feedbackGuardrail");
  assert.ok(signal, "Repeated proposal feedback must become an explicit, confirmable learning signal");
  const accepted = acceptAdaptiveLearningSignal(policy, signal);
  assert.equal(accepted.planningAggressiveness, "conservative");
  assert.equal(accepted.preserveTotalWorkingSets, true);
}

{
  const legacy = defaultTrainingPolicy("2026-07-01T00:00:00.000Z") as unknown as Record<string, unknown>;
  legacy.version = 3;
  for (const field of ["planTargets", "exerciseLocks", "planningAggressiveness", "scheduleAdaptation", "minimumRecoveryDays", "allowExerciseAdditions", "preserveTotalWorkingSets", "maintenanceFloorRatio", "changeBudget"]) delete legacy[field];
  const storage = new Map<string, string>([[PREVIOUS_TRAINING_POLICY_STORAGE_KEY, JSON.stringify(legacy)]]);
  const runtime = globalThis as typeof globalThis & { window?: Window };
  const previousWindow = runtime.window;
  Object.defineProperty(runtime, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    } as unknown as Window,
  });
  const migrated = loadTrainingPolicy();
  assert.equal(migrated.version, 4);
  assert.equal(migrated.goal, "hypertrophy");
  assert.equal(migrated.planningAggressiveness, "balanced");
  assert.ok(storage.has(TRAINING_POLICY_STORAGE_KEY));
  assert.equal(storage.has(PREVIOUS_TRAINING_POLICY_STORAGE_KEY), false);
  if (previousWindow) Object.defineProperty(runtime, "window", { configurable: true, value: previousWindow });
  else Reflect.deleteProperty(runtime, "window");
}

{
  const legacy = { ...defaultTrainingPolicy("2026-07-01T00:00:00.000Z"), version: 3, goal: "strength" };
  const storage = new Map<string, string>([[PREVIOUS_TRAINING_POLICY_STORAGE_KEY, JSON.stringify(legacy)]]);
  const runtime = globalThis as typeof globalThis & { window?: Window };
  const previousWindow = runtime.window;
  Object.defineProperty(runtime, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          if (key === TRAINING_POLICY_STORAGE_KEY) throw new DOMException("Storage quota exceeded", "QuotaExceededError");
          storage.set(key, value);
        },
        removeItem: (key: string) => storage.delete(key),
      },
      dispatchEvent: () => true,
    } as unknown as Window,
  });
  const migrated = loadTrainingPolicy();
  assert.equal(migrated.goal, "strength", "A failed migration write must still return the user's readable legacy policy");
  assert.equal(storage.has(PREVIOUS_TRAINING_POLICY_STORAGE_KEY), true, "The legacy key must remain until the v4 write succeeds");
  if (previousWindow) Object.defineProperty(runtime, "window", { configurable: true, value: previousWindow });
  else Reflect.deleteProperty(runtime, "window");
}

console.log("training-policy tests passed");
