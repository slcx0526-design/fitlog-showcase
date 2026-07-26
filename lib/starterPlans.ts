import { DEFAULT_EXERCISES } from "./exercises";
import { defaultTrackId, intentLabel, performanceModeFor } from "./prescription";
import { hasRecordedTrainingWork } from "./trainingMetrics";
import type {
  AppData,
  ProgressionPrescription,
  Schedule,
  StarterPlanPreset,
  Template,
  TemplateItem,
  TrainingIntent,
  TrainingType,
} from "./types";

interface StarterPlanDefinition {
  id: StarterPlanPreset;
  name: string;
  detail: string;
  trainingDays: number;
  templates: Template[];
  schedule: Schedule;
}

interface ItemOptions {
  sets?: number;
  reps?: [number, number];
  intent?: TrainingIntent;
}

const presetById = new Map(DEFAULT_EXERCISES.map((preset) => [preset.id, preset]));

function templateItem(exerciseId: string, options: ItemOptions = {}): TemplateItem {
  const preset = presetById.get(exerciseId);
  if (!preset) throw new Error(`Unknown starter exercise: ${exerciseId}`);
  const performanceMode = performanceModeFor(preset.recordModes);
  const intent = options.intent ?? "hypertrophy";
  const reps = options.reps ?? (intent === "strength" ? [4, 6] : [8, 12]);
  const sets = options.sets ?? (intent === "strength" ? 4 : 3);
  const unit = performanceMode === "duration" ? "秒" : performanceMode === "distance" ? "米" : "次";
  const prescription: ProgressionPrescription = {
    progressionTrackId: defaultTrackId(preset.id, intent, reps[0], reps[1], sets, performanceMode),
    progressionTrackLabel: `${intentLabel(intent)} · ${reps[0]}–${reps[1]} ${unit}`,
    trainingIntent: intent,
    targetRepMin: reps[0],
    targetRepMax: reps[1],
    targetRirMin: 1,
    targetRirMax: 2,
    workingSets: sets,
    loadIncrementKg: preset.defaultLoadIncrementKg ?? (preset.equipment === "bodyweight" ? 0 : 2.5),
    progressionRule: "doubleProgression",
    performanceMode,
  };
  return {
    exerciseId: preset.id,
    name: preset.name,
    sets,
    repsLow: reps[0],
    repsHigh: reps[1],
    isMain: preset.isMain,
    primaryMuscle: preset.primaryMuscle,
    secondaryMuscles: preset.secondaryMuscles,
    volumeContributions: preset.volumeContributions,
    equipment: preset.equipment,
    movementPattern: preset.movementPattern,
    alternatives: preset.alternatives,
    recordModes: preset.recordModes,
    prescription,
  };
}

function template(
  plan: StarterPlanPreset,
  suffix: string,
  name: string,
  type: Exclude<TrainingType, "rest" | "custom">,
  items: Array<[string, ItemOptions?]>,
): Template {
  return {
    id: `starter_${plan}_${suffix}`,
    name,
    type,
    items: items.map(([id, options]) => templateItem(id, options)),
  };
}

function scheduleFor(
  steps: Array<{ suffix: string; type: Exclude<TrainingType, "custom">; label: string; templateId?: string }>,
): Schedule {
  const split = Array.from({ length: 7 }, (_, index) => steps[index]?.type ?? "") as Schedule["split"];
  return {
    split,
    microcycle: steps.map((step, index) => ({
      id: `starter_step_${index + 1}_${step.suffix}`,
      type: step.type,
      label: step.label,
      ...(step.templateId ? { templateId: step.templateId } : {}),
    })),
  };
}

function compact3(): StarterPlanDefinition {
  const id: StarterPlanPreset = "compact3";
  const templates = [
    template(id, "push", "推 · 基础", "push", [
      ["px_barbell_bench", { sets: 3, reps: [6, 10] }],
      ["px_incline_db"],
      ["px_lateral_raise", { reps: [10, 15] }],
      ["px_triceps_pushdown", { sets: 2, reps: [10, 15] }],
    ]),
    template(id, "pull", "拉 · 基础", "pull", [
      ["pl_lat_pulldown"],
      ["pl_seated_row"],
      ["pl_face_pull", { reps: [10, 15] }],
      ["pl_biceps_curl", { sets: 2, reps: [10, 15] }],
    ]),
    template(id, "legs", "腿 · 基础", "legs", [
      ["lg_squat", { sets: 3, reps: [6, 10] }],
      ["lg_rdl", { sets: 3, reps: [6, 10] }],
      ["lg_leg_extension", { sets: 2, reps: [10, 15] }],
      ["lg_leg_curl", { sets: 2, reps: [10, 15] }],
      ["lg_calf_raise", { sets: 2, reps: [10, 15] }],
    ]),
  ];
  return {
    id,
    name: "精简 3 练",
    detail: "推 / 拉 / 腿，适合刚开始建立稳定记录。",
    trainingDays: 3,
    templates,
    schedule: scheduleFor([
      { suffix: "push", type: "push", label: "Push", templateId: templates[0].id },
      { suffix: "pull", type: "pull", label: "Pull", templateId: templates[1].id },
      { suffix: "legs", type: "legs", label: "Legs", templateId: templates[2].id },
      { suffix: "rest", type: "rest", label: "Rest" },
    ]),
  };
}

function balanced5(): StarterPlanDefinition {
  const id: StarterPlanPreset = "balanced5";
  const templates = [
    template(id, "push_strength", "推 · 力量", "push", [
      ["px_barbell_bench", { sets: 4, reps: [4, 6], intent: "strength" }],
      ["px_incline_db", { sets: 3, reps: [6, 10] }],
      ["px_lateral_raise", { reps: [10, 15] }],
      ["px_triceps_pushdown", { sets: 2, reps: [10, 15] }],
    ]),
    template(id, "pull_strength", "拉 · 力量", "pull", [
      ["pl_barbell_row", { sets: 4, reps: [4, 6], intent: "strength" }],
      ["pl_lat_pulldown", { sets: 3, reps: [6, 10] }],
      ["pl_face_pull", { reps: [10, 15] }],
      ["pl_biceps_curl", { sets: 2, reps: [8, 12] }],
    ]),
    template(id, "legs", "腿 · 综合", "legs", [
      ["lg_squat", { sets: 4, reps: [5, 8], intent: "strength" }],
      ["lg_rdl", { sets: 3, reps: [6, 10] }],
      ["lg_leg_extension", { sets: 3, reps: [10, 15] }],
      ["lg_leg_curl", { sets: 3, reps: [10, 15] }],
      ["lg_calf_raise", { sets: 3, reps: [10, 15] }],
    ]),
    template(id, "push_hypertrophy", "推 · 增肌", "push", [
      ["px_incline_smith", { reps: [8, 12] }],
      ["px_chest_press", { reps: [8, 12] }],
      ["px_machine_lateral", { sets: 4, reps: [10, 15] }],
      ["px_overhead_ext", { sets: 3, reps: [10, 15] }],
    ]),
    template(id, "pull_hypertrophy", "拉 · 增肌", "pull", [
      ["pl_single_arm_pulldown", { reps: [8, 12] }],
      ["pl_hammer_row", { reps: [8, 12] }],
      ["pl_rear_delt", { sets: 4, reps: [10, 15] }],
      ["pl_hammer_curl", { sets: 3, reps: [10, 15] }],
    ]),
  ];
  return {
    id,
    name: "均衡 5 练",
    detail: "力量与增肌轨道分开，适合稳定训练者。",
    trainingDays: 5,
    templates,
    schedule: scheduleFor([
      { suffix: "push_strength", type: "push", label: "Push Strength", templateId: templates[0].id },
      { suffix: "pull_strength", type: "pull", label: "Pull Strength", templateId: templates[1].id },
      { suffix: "legs", type: "legs", label: "Legs", templateId: templates[2].id },
      { suffix: "rest_1", type: "rest", label: "Rest" },
      { suffix: "push_hypertrophy", type: "push", label: "Push Hypertrophy", templateId: templates[3].id },
      { suffix: "pull_hypertrophy", type: "pull", label: "Pull Hypertrophy", templateId: templates[4].id },
      { suffix: "rest_2", type: "rest", label: "Rest" },
    ]),
  };
}

function highFrequency6(): StarterPlanDefinition {
  const base = balanced5();
  const id: StarterPlanPreset = "highFrequency6";
  const legStrength = template(id, "legs_strength", "腿 · 力量", "legs", [
    ["lg_squat", { sets: 4, reps: [4, 6], intent: "strength" }],
    ["lg_rdl", { sets: 3, reps: [6, 10] }],
    ["lg_leg_extension", { sets: 3, reps: [10, 15] }],
    ["lg_calf_raise", { sets: 3, reps: [10, 15] }],
  ]);
  const legHypertrophy = template(id, "legs_hypertrophy", "腿 · 增肌", "legs", [
    ["lg_leg_press", { sets: 4, reps: [8, 12] }],
    ["lg_hip_thrust", { sets: 3, reps: [8, 12] }],
    ["lg_leg_curl", { sets: 3, reps: [10, 15] }],
    ["lg_leg_extension", { sets: 3, reps: [10, 15] }],
    ["lg_seated_calf_raise", { sets: 3, reps: [10, 15] }],
  ]);
  const remap = base.templates.map((value) => ({
    ...value,
    id: value.id.replace("starter_balanced5_", "starter_highFrequency6_"),
  }));
  const templates = [remap[0], remap[1], legStrength, remap[3], remap[4], legHypertrophy];
  return {
    id,
    name: "高频 6 练",
    detail: "推拉腿各两次，仅适合恢复和时间都稳定时。",
    trainingDays: 6,
    templates,
    schedule: scheduleFor([
      { suffix: "push_strength", type: "push", label: "Push Strength", templateId: templates[0].id },
      { suffix: "pull_strength", type: "pull", label: "Pull Strength", templateId: templates[1].id },
      { suffix: "legs_strength", type: "legs", label: "Legs Strength", templateId: templates[2].id },
      { suffix: "push_hypertrophy", type: "push", label: "Push Hypertrophy", templateId: templates[3].id },
      { suffix: "pull_hypertrophy", type: "pull", label: "Pull Hypertrophy", templateId: templates[4].id },
      { suffix: "legs_hypertrophy", type: "legs", label: "Legs Hypertrophy", templateId: templates[5].id },
      { suffix: "rest", type: "rest", label: "Rest" },
    ]),
  };
}

export const STARTER_PLANS: StarterPlanDefinition[] = [compact3(), balanced5(), highFrequency6()];

export function starterPlanById(id: StarterPlanPreset) {
  return STARTER_PLANS.find((plan) => plan.id === id) ?? STARTER_PLANS[0];
}

export function needsStarterSetup(data: AppData) {
  if (data.onboarding?.completedAt || data.onboarding?.dismissedAt) return false;
  if (data.templates?.length) return false;
  return !Object.values(data.days).some((day) => hasRecordedTrainingWork(day.workout));
}
