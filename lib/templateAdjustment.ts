import type { AppData } from "./storage";
import type { Template, TemplateItem } from "./types";
import type { TrainingDecisionAction } from "./trainingDecision";
import { DEFAULT_EXERCISES } from "./exercises";

export interface TemplateSetChange {
  exerciseId: string;
  exerciseName: string;
  fromSets: number;
  toSets: number;
}

export interface TemplateAdjustmentProposal {
  templateId: string;
  templateName: string;
  previousItems: TemplateItem[];
  nextItems: TemplateItem[];
  changes: TemplateSetChange[];
}

type AdjustableAction = Extract<TrainingDecisionAction, { kind: "simplifyPlan" | "reduceVolume" | "addVolume" }>;

function recentTemplateIds(data: AppData) {
  return Object.entries(data.days)
    .sort(([a], [b]) => b.localeCompare(a))
    .flatMap(([, day]) => day.workout?.templateId && day.workout.done !== false ? [day.workout.templateId] : []);
}

function rankTemplates(data: AppData, templates: Template[]) {
  const recent = recentTemplateIds(data);
  return [...templates].sort((a, b) => {
    const aIndex = recent.indexOf(a.id);
    const bIndex = recent.indexOf(b.id);
    return (aIndex < 0 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex < 0 ? Number.MAX_SAFE_INTEGER : bIndex);
  });
}

function proposal(template: Template, nextItems: TemplateItem[], changes: TemplateSetChange[]): TemplateAdjustmentProposal {
  return {
    templateId: template.id,
    templateName: template.name,
    previousItems: template.items.map((item) => ({ ...item })),
    nextItems,
    changes,
  };
}

export function buildTemplateAdjustmentProposal(data: AppData, action: AdjustableAction): TemplateAdjustmentProposal | null {
  const templates = data.templates ?? [];
  if (!templates.length) return null;

  if (action.kind === "reduceVolume" || action.kind === "addVolume") {
    if (!action.sourceExerciseId) return null;
    const template = rankTemplates(data, templates.filter((item) => item.items.some((entry) => entry.exerciseId === action.sourceExerciseId)))[0];
    if (!template) return null;
    const source = template.items.find((item) => item.exerciseId === action.sourceExerciseId);
    if (!source) return null;
    const delta = action.kind === "reduceVolume"
      ? Math.min(action.suggestedSets, Math.max(0, source.sets - 1))
      : Math.min(action.suggestedSets, Math.max(0, 12 - source.sets));
    if (!delta) return null;
    const toSets = action.kind === "reduceVolume" ? source.sets - delta : source.sets + delta;
    const nextItems = template.items.map((item) => item.exerciseId === source.exerciseId
      ? { ...item, sets: toSets, prescription: undefined, progressionTrackId: undefined, progressionTrackLabel: undefined }
      : item);
    return proposal(template, nextItems, [{ exerciseId: source.exerciseId, exerciseName: source.name, fromSets: source.sets, toSets }]);
  }

  const template = rankTemplates(data, templates)
    .find((item) => item.items.some((entry) => entry.sets > 1));
  if (!template) return null;
  const presets = new Map([...DEFAULT_EXERCISES, ...data.customExercises].map((item) => [item.id, item]));
  const source = [...template.items]
    .reverse()
    .find((item) => item.sets > 1 && !(item.isMain ?? presets.get(item.exerciseId)?.isMain))
    ?? [...template.items].reverse().find((item) => item.sets > 1);
  if (!source) return null;
  const delta = Math.min(action.averageMissingSets, source.sets - 1);
  const toSets = source.sets - delta;
  const nextItems = template.items.map((item) => item.exerciseId === source.exerciseId
    ? { ...item, sets: toSets, prescription: undefined, progressionTrackId: undefined, progressionTrackLabel: undefined }
    : item);
  return proposal(template, nextItems, [{ exerciseId: source.exerciseId, exerciseName: source.name, fromSets: source.sets, toSets }]);
}
