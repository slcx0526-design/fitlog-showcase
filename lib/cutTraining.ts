import { DEFAULT_EXERCISES } from "./exercises";
import { MUSCLE_ORDER, type MuscleGroup } from "./muscles";
import { cutSetPlan, DEFAULT_CUT_VOLUME_SCALE } from "./cutMode";
import type {
  CutPlan,
  CutTrainingTemplateType,
  ExercisePreset,
  Schedule,
  Template,
  TemplateItem,
  TrainingType,
  VolumeContribution,
} from "./types";

const TRAINING_TYPES: CutTrainingTemplateType[] = ["push", "pull", "legs"];
const FALLBACK_SPLIT: (TrainingType | "")[] = ["push", "pull", "legs", "rest", "push", "pull", "rest"];

export type CutExercisePlan = {
  exerciseId: string;
  name: string;
  normalSets: number;
  cutSets: number;
  isMain: boolean;
};

export type CutTemplatePlan = {
  type: CutTrainingTemplateType;
  templateId: string;
  templateName: string;
  weeklySessions: number;
  normalSetsPerSession: number;
  cutSetsPerSession: number;
  normalWeeklySets: number;
  cutWeeklySets: number;
  exercises: CutExercisePlan[];
};

export type CutMuscleVolume = {
  muscle: MuscleGroup;
  normalWeeklySets: number;
  cutWeeklySets: number;
};

export type WeeklyCutTrainingPlan = {
  scale: number;
  weeklySessions: number;
  normalWeeklySets: number;
  cutWeeklySets: number;
  normalWeeklyVolume: number;
  cutWeeklyVolume: number;
  actualPercent: number;
  templates: CutTemplatePlan[];
  muscleVolumes: CutMuscleVolume[];
  missingTypes: CutTrainingTemplateType[];
};

function scheduleCounts(schedule: Schedule | undefined): Record<CutTrainingTemplateType, number> {
  const split = schedule?.split?.length === 7 ? schedule.split : FALLBACK_SPLIT;
  return {
    push: split.filter((item) => item === "push").length,
    pull: split.filter((item) => item === "pull").length,
    legs: split.filter((item) => item === "legs").length,
  };
}

function selectTemplate(templates: Template[], type: CutTrainingTemplateType, plan: CutPlan | undefined): Template | null {
  const matching = templates.filter((template) => template.type === type && template.items.length > 0);
  if (!matching.length) return null;
  const selectedId = plan?.trainingTemplateIds?.[type];
  return matching.find((template) => template.id === selectedId) ?? matching[0];
}

function contributionFor(item: TemplateItem, preset: ExercisePreset | undefined): VolumeContribution[] {
  if (item.volumeContributions?.length) return item.volumeContributions;
  if (preset?.volumeContributions?.length) return preset.volumeContributions;
  const primaryMuscle = item.primaryMuscle ?? preset?.primaryMuscle;
  if (primaryMuscle) return [{ muscle: primaryMuscle, weight: 1, direct: true }];
  return [];
}

/**
 * Weekly cut plan is set-based only. It calls the same canonical allocation
 * routine as session setup, so displayed weekly volume equals the sets a user
 * receives when applying that template. Load, tonnage and effort remain actual
 * session decisions.
 */
export function buildWeeklyCutTrainingPlan(args: {
  plan: CutPlan | undefined;
  templates: Template[] | undefined;
  customExercises: ExercisePreset[];
  schedule: Schedule | undefined;
}): WeeklyCutTrainingPlan {
  const templates = args.templates ?? [];
  const pool = [...DEFAULT_EXERCISES, ...args.customExercises];
  const scale = args.plan?.trainingVolumeScale ?? DEFAULT_CUT_VOLUME_SCALE;
  const counts = scheduleCounts(args.schedule);
  const normalByMuscle = new Map<MuscleGroup, number>();
  const cutByMuscle = new Map<MuscleGroup, number>();
  const output: CutTemplatePlan[] = [];
  const missingTypes: CutTrainingTemplateType[] = [];

  for (const type of TRAINING_TYPES) {
    const weeklySessions = counts[type];
    if (!weeklySessions) continue;
    const template = selectTemplate(templates, type, args.plan);
    if (!template) { missingTypes.push(type); continue; }

    const prepared = template.items.map((item) => ({
      item,
      preset: pool.find((candidate) => candidate.id === item.exerciseId),
    }));
    const allocation = cutSetPlan(
      prepared.map(({ item, preset }) => ({ id: item.exerciseId, sets: item.sets, isMain: item.isMain ?? preset?.isMain })),
      scale
    );
    const exercises: CutExercisePlan[] = prepared.map(({ item, preset }, index) => ({
      exerciseId: item.exerciseId,
      name: item.name,
      normalSets: allocation[index].normalSets,
      cutSets: allocation[index].cutSets,
      isMain: item.isMain ?? preset?.isMain ?? false,
    }));

    const normalSetsPerSession = exercises.reduce((sum, item) => sum + item.normalSets, 0);
    const cutSetsPerSession = exercises.reduce((sum, item) => sum + item.cutSets, 0);
    for (const exercise of exercises) {
      const source = prepared.find(({ item }) => item.exerciseId === exercise.exerciseId)!;
      for (const contribution of contributionFor(source.item, source.preset)) {
        normalByMuscle.set(contribution.muscle, (normalByMuscle.get(contribution.muscle) ?? 0) + exercise.normalSets * weeklySessions * contribution.weight);
        cutByMuscle.set(contribution.muscle, (cutByMuscle.get(contribution.muscle) ?? 0) + exercise.cutSets * weeklySessions * contribution.weight);
      }
    }
    output.push({ type, templateId: template.id, templateName: template.name.trim() || "未命名模板", weeklySessions, normalSetsPerSession, cutSetsPerSession, normalWeeklySets: normalSetsPerSession * weeklySessions, cutWeeklySets: cutSetsPerSession * weeklySessions, exercises });
  }

  const normalWeeklySets = output.reduce((sum, item) => sum + item.normalWeeklySets, 0);
  const cutWeeklySets = output.reduce((sum, item) => sum + item.cutWeeklySets, 0);
  const normalWeeklyVolume = [...normalByMuscle.values()].reduce((sum, value) => sum + value, 0);
  const cutWeeklyVolume = [...cutByMuscle.values()].reduce((sum, value) => sum + value, 0);
  const muscleVolumes = MUSCLE_ORDER.filter((muscle) => (normalByMuscle.get(muscle) ?? 0) > 0 || (cutByMuscle.get(muscle) ?? 0) > 0).map((muscle) => ({ muscle, normalWeeklySets: Math.round((normalByMuscle.get(muscle) ?? 0) * 10) / 10, cutWeeklySets: Math.round((cutByMuscle.get(muscle) ?? 0) * 10) / 10 }));

  return { scale, weeklySessions: output.reduce((sum, item) => sum + item.weeklySessions, 0), normalWeeklySets, cutWeeklySets, normalWeeklyVolume: Math.round(normalWeeklyVolume * 10) / 10, cutWeeklyVolume: Math.round(cutWeeklyVolume * 10) / 10, actualPercent: normalWeeklySets > 0 ? Math.round((cutWeeklySets / normalWeeklySets) * 100) : 0, templates: output, muscleVolumes, missingTypes };
}
