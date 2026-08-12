import { cutSetPlan } from "./cutMode";
import { MUSCLE_LABELS } from "./muscles";
import { plannedWorkingSets, summarizeExerciseWork, workingSets } from "./trainingMetrics";
import type { Exercise, ExercisePreset, Template, TemplateItem } from "./types";

export interface SessionVolumeRow {
  id: string;
  name: string;
  targetSets: number;
  currentSets: number;
  present: boolean;
  muscle?: string;
}

export interface SessionVolumeMissingAction {
  id: string;
  name: string;
  sets: number;
  suggestions: ExercisePreset[];
}

export interface SessionVolumePlanResult {
  targetSets: number;
  currentPlannedSets: number;
  completedSets: number;
  missing: SessionVolumeMissingAction[];
  rows: SessionVolumeRow[];
}

const EMPTY_PLAN: SessionVolumePlanResult = {
  targetSets: 0,
  currentPlannedSets: 0,
  completedSets: 0,
  missing: [],
  rows: [],
};

function exercisePresetFor(item: TemplateItem, template: Template, presets: Map<string, ExercisePreset>): ExercisePreset {
  return presets.get(item.exerciseId) ?? {
    id: item.exerciseId,
    name: item.name,
    type: template.type,
    isMain: item.isMain ?? false,
    primaryMuscle: item.primaryMuscle,
    secondaryMuscles: item.secondaryMuscles,
    volumeContributions: item.volumeContributions,
    equipment: item.equipment,
    movementPattern: item.movementPattern,
    alternatives: item.alternatives,
    recordModes: item.recordModes,
  };
}

function findAlternatives(source: ExercisePreset, pool: ExercisePreset[], existingIds: Set<string>) {
  const directIds = source.alternatives ?? [];
  const direct = directIds
    .map((id) => pool.find((item) => item.id === id))
    .filter((item): item is ExercisePreset => Boolean(item));
  const similar = pool.filter((item) => (
    item.id !== source.id
    && !directIds.includes(item.id)
    && (
      item.movementPattern === source.movementPattern
      || (source.primaryMuscle && item.primaryMuscle === source.primaryMuscle)
    )
  ));
  return [...direct, ...similar]
    .filter((item) => !existingIds.has(item.id))
    .slice(0, 5);
}

export function buildSessionVolumePlan(
  template: Template | undefined,
  exercises: Exercise[],
  pool: ExercisePreset[],
  cutActive: boolean,
  scale: number,
): SessionVolumePlanResult {
  if (!template) return EMPTY_PLAN;

  const presets = new Map(pool.map((preset) => [preset.id, preset]));
  const sourceFor = (item: TemplateItem) => exercisePresetFor(item, template, presets);
  const adjusted = new Map(
    (cutActive
      ? cutSetPlan(template.items.map((item) => ({
          id: item.exerciseId,
          sets: item.sets,
          isMain: item.isMain ?? presets.get(item.exerciseId)?.isMain,
        })), scale)
      : template.items.map((item) => ({ id: item.exerciseId, cutSets: item.sets })))
      .map((row) => [row.id, row.cutSets]),
  );
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const existingIds = new Set(exercises.map((exercise) => exercise.id));

  const rows = template.items.map((item): SessionVolumeRow => {
    const exercise = byId.get(item.exerciseId);
    const preset = sourceFor(item);
    return {
      id: item.exerciseId,
      name: item.name,
      targetSets: adjusted.get(item.exerciseId) ?? item.sets,
      currentSets: exercise
        ? plannedWorkingSets(exercise) || workingSets(exercise.sets).length
        : 0,
      present: Boolean(exercise),
      muscle: preset.primaryMuscle ? MUSCLE_LABELS[preset.primaryMuscle] : undefined,
    };
  });

  const templateIds = new Set(template.items.map((item) => item.exerciseId));
  const addedPlanned = exercises
    .filter((exercise) => !templateIds.has(exercise.id))
    .reduce((sum, exercise) => sum + (plannedWorkingSets(exercise) || workingSets(exercise.sets).length), 0);
  const currentTemplateSets = rows.reduce((sum, row) => sum + (row.present ? row.currentSets : 0), 0);
  const targetSets = rows.reduce((sum, row) => sum + row.targetSets, 0);
  const completedSets = Math.round(
    exercises.reduce((sum, exercise) => sum + summarizeExerciseWork(exercise).completionCredits, 0) * 100,
  ) / 100;
  const missing = rows
    .filter((row) => !row.present)
    .map((row): SessionVolumeMissingAction => {
      const item = template.items.find((candidate) => candidate.exerciseId === row.id)!;
      return {
        id: row.id,
        name: row.name,
        sets: row.targetSets,
        suggestions: findAlternatives(sourceFor(item), pool, existingIds),
      };
    });

  return {
    targetSets,
    currentPlannedSets: currentTemplateSets + addedPlanned,
    completedSets,
    missing,
    rows,
  };
}
