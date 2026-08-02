import { DEFAULT_EXERCISES } from "./exercises";
import { microcycleForScheduleEdit, microcycleForTemplateEdit } from "./microcycle";
import { normalizeTemplateItemPrescription } from "./prescription";
import type { AppData, Schedule, TemplateItem } from "./types";

export interface AdaptiveTemplatePatch {
  templateId: string;
  nextItems: TemplateItem[];
}

/** Builds one future-plan state so templates, schedule, and the unstarted cycle snapshot move together. */
export function applyAdaptivePlanPatch(
  data: AppData,
  patches: AdaptiveTemplatePatch[],
  schedule?: Schedule,
): AppData {
  let next = data;

  if (patches.length) {
    const patchById = new Map(patches.map((patch) => [patch.templateId, patch.nextItems]));
    const presets = new Map(
      [...DEFAULT_EXERCISES, ...data.customExercises].map((preset) => [preset.id, preset]),
    );
    const templates = (data.templates ?? []).map((template) => {
      const items = patchById.get(template.id);
      if (!items) return template;
      return {
        ...template,
        items: items.map((item) => normalizeTemplateItemPrescription(item, presets.get(item.exerciseId))),
      };
    });
    const withTemplates = { ...next, templates };
    next = {
      ...withTemplates,
      microcycle: microcycleForTemplateEdit(withTemplates, templates),
    };
  }

  if (schedule) {
    const withSchedule = { ...next, schedule };
    next = {
      ...withSchedule,
      microcycle: microcycleForScheduleEdit(withSchedule, schedule),
    };
  }

  return next;
}
