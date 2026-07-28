import { DEFAULT_EXERCISES } from "./exercises";
import { weeklyTargetFor, type MuscleGroup } from "./muscles";
import { normalizeTemplateItemPrescription } from "./prescription";
import { compileTrainingConstraints, exerciseConstraintViolations, exercisePreferenceScore } from "./trainingConstraints";
import { musclePriorityMultiplier, policyRevision, type TrainingPolicy } from "./trainingPolicy";
import type { AppData, ExercisePreset, Template, TemplateItem, VolumeContribution } from "./types";

export type PlanAdaptationTrigger =
  | "policyChanged"
  | "temporaryOverride"
  | "cycleReview"
  | "userRequested";

export interface TemplatePlanChange {
  templateId: string;
  templateName: string;
  previousItems: TemplateItem[];
  nextItems: TemplateItem[];
  reasons: string[];
  estimatedMinutesBefore: number;
  estimatedMinutesAfter: number;
}

export interface PlanAdaptationProposal {
  id: string;
  createdAt: string;
  trigger: PlanAdaptationTrigger;
  scope: "nextSession" | "nextMicrocycle";
  sourceRevision: string;
  confidence: "explicit" | "high" | "medium" | "low";
  summary: string;
  reasons: string[];
  evidence: string[];
  changes: TemplatePlanChange[];
  impact: {
    changedTemplates: number;
    replacedExercises: number;
    removedExercises: number;
    setDelta: number;
    estimatedMinutesBefore: number;
    estimatedMinutesAfter: number;
    muscleSetDelta: Partial<Record<MuscleGroup, number>>;
  };
  warnings: string[];
}

export interface ApplyPlanAdaptationResult {
  applied: boolean;
  reason?: "stale" | "empty";
  data: AppData;
}

type Preset = (typeof DEFAULT_EXERCISES)[number] | AppData["customExercises"][number];

type MutableTemplate = {
  source: Template;
  items: TemplateItem[];
  reasons: Set<string>;
  replaced: number;
  removed: number;
};

function cloneItems(items: TemplateItem[]) {
  return items.map((item) => ({
    ...item,
    ...(item.secondaryMuscles ? { secondaryMuscles: [...item.secondaryMuscles] } : {}),
    ...(item.volumeContributions ? { volumeContributions: item.volumeContributions.map((entry) => ({ ...entry })) } : {}),
    ...(item.alternatives ? { alternatives: [...item.alternatives] } : {}),
    ...(item.recordModes ? { recordModes: [...item.recordModes] } : {}),
    ...(item.prescription ? { prescription: { ...item.prescription } } : {}),
  }));
}

function fingerprintTemplates(data: AppData, policy: TrainingPolicy) {
  const compact = (data.templates ?? []).map((template) => ({
    id: template.id,
    type: template.type,
    items: template.items.map((item) => ({ id: item.exerciseId, sets: item.sets, low: item.repsLow, high: item.repsHigh })),
  }));
  const source = `${policyRevision(policy)}:${JSON.stringify(compact)}:${JSON.stringify(data.schedule.microcycle ?? data.schedule.split)}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `plan-${(hash >>> 0).toString(36)}`;
}

function directContributions(item: TemplateItem, preset?: Preset): VolumeContribution[] {
  const configured = item.volumeContributions?.length ? item.volumeContributions : preset?.volumeContributions;
  if (configured?.length) return configured.filter((entry) => entry.direct);
  const primary = item.primaryMuscle ?? preset?.primaryMuscle;
  return primary ? [{ muscle: primary, weight: 1, direct: true }] : [];
}

function itemPreset(item: TemplateItem, presets: Map<string, Preset>) {
  return presets.get(item.exerciseId);
}

export function estimateTemplateMinutes(items: TemplateItem[], presets?: Map<string, Preset>) {
  return Math.round(items.reduce((minutes, item, index) => {
    const preset = presets?.get(item.exerciseId);
    const isMain = item.isMain ?? preset?.isMain ?? false;
    const perSet = isMain ? 3.5 : item.supersetGroup ? 1.7 : 2.4;
    const transition = index === 0 ? 3 : 1.2;
    return minutes + transition + item.sets * perSet;
  }, 0));
}

function replacementItem(source: TemplateItem, preset: Preset): TemplateItem {
  const item: TemplateItem = {
    exerciseId: preset.id,
    name: preset.name,
    sets: source.sets,
    repsLow: source.repsLow,
    repsHigh: source.repsHigh,
    ...(source.rpe != null ? { rpe: source.rpe } : {}),
    isMain: preset.isMain,
    ...(preset.primaryMuscle ? { primaryMuscle: preset.primaryMuscle } : {}),
    ...(preset.secondaryMuscles?.length ? { secondaryMuscles: [...preset.secondaryMuscles] } : {}),
    ...(preset.volumeContributions?.length ? { volumeContributions: preset.volumeContributions.map((entry) => ({ ...entry })) } : {}),
    ...(preset.equipment ? { equipment: preset.equipment } : {}),
    ...(preset.movementPattern ? { movementPattern: preset.movementPattern } : {}),
    ...(preset.alternatives?.length ? { alternatives: [...preset.alternatives] } : {}),
    ...(preset.recordModes?.length ? { recordModes: [...preset.recordModes] } : {}),
    ...(source.supersetGroup ? { supersetGroup: source.supersetGroup } : {}),
  };
  return normalizeTemplateItemPrescription(item, preset);
}

function replacementCandidates(
  template: MutableTemplate,
  item: TemplateItem,
  presets: Map<string, Preset>,
  constraints: ReturnType<typeof compileTrainingConstraints>,
) {
  const current = itemPreset(item, presets);
  const currentPrimary = item.primaryMuscle ?? current?.primaryMuscle;
  const currentPattern = item.movementPattern ?? current?.movementPattern;
  const used = new Set(template.items.map((entry) => entry.exerciseId));
  const explicitAlternatives = new Set([...(item.alternatives ?? []), ...(current?.alternatives ?? [])]);
  return [...presets.values()]
    .filter((candidate) => candidate.id !== item.exerciseId && !used.has(candidate.id))
    .filter((candidate) => candidate.type === template.source.type || candidate.type === "custom")
    .filter((candidate) => exerciseConstraintViolations(candidate, constraints).length === 0)
    .filter((candidate) => {
      if (explicitAlternatives.has(candidate.id) || explicitAlternatives.has(candidate.name)) return true;
      if (currentPrimary && candidate.primaryMuscle === currentPrimary) return true;
      return Boolean(currentPattern && candidate.movementPattern === currentPattern);
    })
    .sort((a, b) => {
      const score = (candidate: Preset) => {
        let value = exercisePreferenceScore(candidate, constraints);
        if (explicitAlternatives.has(candidate.id) || explicitAlternatives.has(candidate.name)) value += 50;
        if (currentPattern && candidate.movementPattern === currentPattern) value += 20;
        if (currentPrimary && candidate.primaryMuscle === currentPrimary) value += 15;
        if (candidate.isMain === (item.isMain ?? current?.isMain)) value += 5;
        return value;
      };
      return score(b) - score(a) || a.name.localeCompare(b.name);
    });
}

function templateUsage(data: AppData) {
  const counts = new Map<string, number>();
  const steps = data.microcycle?.steps?.length ? data.microcycle.steps : data.schedule.microcycle;
  for (const step of steps ?? []) {
    if (step.templateId) counts.set(step.templateId, (counts.get(step.templateId) ?? 0) + 1);
  }
  if (!counts.size) for (const template of data.templates ?? []) counts.set(template.id, 1);
  return counts;
}

function cycleMuscleSets(templates: MutableTemplate[], usage: Map<string, number>, presets: Map<string, Preset>) {
  const totals: Partial<Record<MuscleGroup, number>> = {};
  for (const template of templates) {
    const count = usage.get(template.source.id) ?? 0;
    if (!count) continue;
    for (const item of template.items) {
      for (const contribution of directContributions(item, itemPreset(item, presets))) {
        totals[contribution.muscle] = (totals[contribution.muscle] ?? 0) + item.sets * contribution.weight * count;
      }
    }
  }
  return totals;
}

function itemMuscleWeight(item: TemplateItem, muscle: MuscleGroup, presets: Map<string, Preset>) {
  return directContributions(item, itemPreset(item, presets)).find((entry) => entry.muscle === muscle)?.weight ?? 0;
}

function adjustMusclePriorities(
  data: AppData,
  policy: TrainingPolicy,
  templates: MutableTemplate[],
  usage: Map<string, number>,
  presets: Map<string, Preset>,
) {
  const before = cycleMuscleSets(templates, usage, presets);
  for (const [muscle, priority] of Object.entries(policy.musclePriorities) as Array<[MuscleGroup, NonNullable<TrainingPolicy["musclePriorities"][MuscleGroup]>]>) {
    const target = data.muscleTargets?.[muscle] ?? weeklyTargetFor(muscle, data.profile?.trainingLevel);
    const desired = Math.max(1, Math.round(target.low * musclePriorityMultiplier(priority)));
    let current = before[muscle] ?? 0;
    if (priority === "specialize" || priority === "grow") {
      if (current >= desired) continue;
      const candidates = templates.flatMap((template) => template.items.map((item, index) => ({ template, item, index })))
        .filter(({ item }) => itemMuscleWeight(item, muscle, presets) > 0)
        .filter(({ item }) => !compileTrainingConstraints(policy, new Date().toISOString().slice(0, 10)).avoidedExerciseIds.has(item.exerciseId))
        .sort((a, b) => {
          const aPreset = itemPreset(a.item, presets);
          const bPreset = itemPreset(b.item, presets);
          const aScore = exercisePreferenceScore(aPreset ?? { id: a.item.exerciseId }, compileTrainingConstraints(policy, new Date().toISOString().slice(0, 10))) + (a.item.isMain ?? aPreset?.isMain ? 4 : 0);
          const bScore = exercisePreferenceScore(bPreset ?? { id: b.item.exerciseId }, compileTrainingConstraints(policy, new Date().toISOString().slice(0, 10))) + (b.item.isMain ?? bPreset?.isMain ? 4 : 0);
          return bScore - aScore;
        });
      for (const candidate of candidates) {
        if (current >= desired) break;
        const count = usage.get(candidate.template.source.id) ?? 1;
        const weight = itemMuscleWeight(candidate.item, muscle, presets);
        const delta = Math.min(2, Math.max(1, Math.ceil((desired - current) / Math.max(weight * count, 0.1))));
        candidate.template.items[candidate.index] = {
          ...candidate.item,
          sets: Math.min(12, candidate.item.sets + delta),
          ...(candidate.item.prescription ? { prescription: { ...candidate.item.prescription, workingSets: Math.min(12, candidate.item.sets + delta) } } : {}),
        };
        candidate.template.reasons.add(`${muscle} 被设为${priority === "specialize" ? "专项强化" : "增长"}，增加直接组`);
        current += delta * weight * count;
      }
    } else {
      if (current <= desired) continue;
      const candidates = templates.flatMap((template) => template.items.map((item, index) => ({ template, item, index })))
        .filter(({ item }) => itemMuscleWeight(item, muscle, presets) > 0 && item.sets > 1)
        .sort((a, b) => {
          const aPreset = itemPreset(a.item, presets);
          const bPreset = itemPreset(b.item, presets);
          const aMain = a.item.isMain ?? aPreset?.isMain ?? false;
          const bMain = b.item.isMain ?? bPreset?.isMain ?? false;
          return Number(aMain) - Number(bMain) || b.item.sets - a.item.sets;
        });
      for (const candidate of candidates) {
        if (current <= desired) break;
        const count = usage.get(candidate.template.source.id) ?? 1;
        const weight = itemMuscleWeight(candidate.item, muscle, presets);
        const removable = Math.min(candidate.item.sets - 1, Math.max(1, Math.ceil((current - desired) / Math.max(weight * count, 0.1))));
        const nextSets = candidate.item.sets - removable;
        candidate.template.items[candidate.index] = {
          ...candidate.item,
          sets: nextSets,
          ...(candidate.item.prescription ? { prescription: { ...candidate.item.prescription, workingSets: nextSets } } : {}),
        };
        candidate.template.reasons.add(`${muscle} 被设为${priority === "maintain" ? "维持" : "降低优先级"}，减少直接组`);
        current -= removable * weight * count;
      }
    }
  }
  return before;
}

function enforceSessionCaps(
  template: MutableTemplate,
  constraints: ReturnType<typeof compileTrainingConstraints>,
  presets: Map<string, Preset>,
) {
  const lowValueIndex = () => template.items
    .map((item, index) => ({ item, index, preset: itemPreset(item, presets) }))
    .sort((a, b) => {
      const aMain = a.item.isMain ?? a.preset?.isMain ?? false;
      const bMain = b.item.isMain ?? b.preset?.isMain ?? false;
      const aScore = exercisePreferenceScore(a.preset ?? { id: a.item.exerciseId }, constraints);
      const bScore = exercisePreferenceScore(b.preset ?? { id: b.item.exerciseId }, constraints);
      return Number(aMain) - Number(bMain) || aScore - bScore || b.index - a.index;
    })[0]?.index;

  while (template.items.length > constraints.maxExercisesPerSession) {
    const index = lowValueIndex();
    if (index == null) break;
    const [removed] = template.items.splice(index, 1);
    template.removed += 1;
    template.reasons.add(`动作数超过 ${constraints.maxExercisesPerSession}，移除低优先级动作 ${removed.name}`);
  }

  let guard = 0;
  while (
    guard < 80
    && (template.items.reduce((sum, item) => sum + item.sets, 0) > constraints.maxWorkingSetsPerSession
      || estimateTemplateMinutes(template.items, presets) > constraints.maxSessionMinutes)
  ) {
    guard += 1;
    const candidates = template.items
      .map((item, index) => ({ item, index, preset: itemPreset(item, presets) }))
      .filter(({ item }) => item.sets > 1)
      .sort((a, b) => {
        const aMain = a.item.isMain ?? a.preset?.isMain ?? false;
        const bMain = b.item.isMain ?? b.preset?.isMain ?? false;
        const aScore = exercisePreferenceScore(a.preset ?? { id: a.item.exerciseId }, constraints);
        const bScore = exercisePreferenceScore(b.preset ?? { id: b.item.exerciseId }, constraints);
        return Number(aMain) - Number(bMain) || aScore - bScore || b.item.sets - a.item.sets;
      });
    const candidate = candidates[0];
    if (!candidate) break;
    const nextSets = candidate.item.sets - 1;
    template.items[candidate.index] = {
      ...candidate.item,
      sets: nextSets,
      ...(candidate.item.prescription ? { prescription: { ...candidate.item.prescription, workingSets: nextSets } } : {}),
    };
    template.reasons.add(`控制在 ${constraints.maxSessionMinutes} 分钟 / ${constraints.maxWorkingSetsPerSession} 组以内`);
  }
}

function sameItems(left: TemplateItem[], right: TemplateItem[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function muscleDelta(before: Partial<Record<MuscleGroup, number>>, after: Partial<Record<MuscleGroup, number>>) {
  const result: Partial<Record<MuscleGroup, number>> = {};
  const muscles = new Set<MuscleGroup>([...Object.keys(before), ...Object.keys(after)] as MuscleGroup[]);
  for (const muscle of muscles) {
    const delta = Math.round(((after[muscle] ?? 0) - (before[muscle] ?? 0)) * 10) / 10;
    if (delta) result[muscle] = delta;
  }
  return result;
}

export function buildPlanAdaptation(
  data: AppData,
  policy: TrainingPolicy,
  date: string,
  trigger: PlanAdaptationTrigger = "userRequested",
): PlanAdaptationProposal {
  const createdAt = new Date().toISOString();
  const sourceRevision = fingerprintTemplates(data, policy);
  const constraints = compileTrainingConstraints(policy, date);
  const presets = new Map<string, Preset>([...DEFAULT_EXERCISES, ...data.customExercises].map((preset) => [preset.id, preset]));
  const templates: MutableTemplate[] = (data.templates ?? []).map((template) => ({
    source: template,
    items: cloneItems(template.items),
    reasons: new Set<string>(),
    replaced: 0,
    removed: 0,
  }));
  const warnings: string[] = [];

  for (const template of templates) {
    for (let index = 0; index < template.items.length; index += 1) {
      const item = template.items[index];
      const preset = itemPreset(item, presets) ?? ({
        id: item.exerciseId,
        name: item.name,
        type: template.source.type,
        isMain: Boolean(item.isMain),
        equipment: item.equipment,
        movementPattern: item.movementPattern,
        primaryMuscle: item.primaryMuscle,
        alternatives: item.alternatives,
      } as ExercisePreset);
      const violations = exerciseConstraintViolations(preset, constraints);
      if (!violations.length) continue;
      const replacement = replacementCandidates(template, item, presets, constraints)[0];
      if (replacement) {
        template.items[index] = replacementItem(item, replacement);
        template.replaced += 1;
        template.reasons.add(`${item.name} 因${violations.join("、")}替换为 ${replacement.name}`);
        continue;
      }
      const isMain = item.isMain ?? preset.isMain;
      if (!isMain) {
        template.items.splice(index, 1);
        index -= 1;
        template.removed += 1;
        template.reasons.add(`${item.name} 因${violations.join("、")}且无合适替代，已从未来模板移除`);
      } else {
        warnings.push(`${template.source.name} 的主项 ${item.name} 违反约束，但没有找到同肌群/同模式替代动作；未自动删除。`);
      }
    }
  }

  const usage = templateUsage(data);
  const beforeMuscles = cycleMuscleSets(templates.map((template) => ({ ...template, items: cloneItems(template.source.items) })), usage, presets);
  adjustMusclePriorities(data, policy, templates, usage, presets);
  for (const template of templates) enforceSessionCaps(template, constraints, presets);
  const afterMuscles = cycleMuscleSets(templates, usage, presets);

  const changes: TemplatePlanChange[] = templates.flatMap((template) => {
    if (sameItems(template.source.items, template.items)) return [];
    return [{
      templateId: template.source.id,
      templateName: template.source.name,
      previousItems: cloneItems(template.source.items),
      nextItems: cloneItems(template.items),
      reasons: [...template.reasons],
      estimatedMinutesBefore: estimateTemplateMinutes(template.source.items, presets),
      estimatedMinutesAfter: estimateTemplateMinutes(template.items, presets),
    }];
  });

  const estimatedMinutesBefore = changes.reduce((sum, change) => sum + change.estimatedMinutesBefore, 0);
  const estimatedMinutesAfter = changes.reduce((sum, change) => sum + change.estimatedMinutesAfter, 0);
  const setDelta = changes.reduce((sum, change) => (
    sum + change.nextItems.reduce((total, item) => total + item.sets, 0) - change.previousItems.reduce((total, item) => total + item.sets, 0)
  ), 0);
  const replacedExercises = templates.reduce((sum, template) => sum + template.replaced, 0);
  const removedExercises = templates.reduce((sum, template) => sum + template.removed, 0);
  const currentTrainingDays = data.schedule.split.filter((type) => type && type !== "rest").length;
  if (currentTrainingDays < policy.weeklyTrainingDays.minimum || currentTrainingDays > policy.weeklyTrainingDays.maximum) {
    warnings.push(`当前周排程为 ${currentTrainingDays} 个训练日，与设定的 ${policy.weeklyTrainingDays.minimum}–${policy.weeklyTrainingDays.maximum} 天不一致；第一版只提示，不自动重写分化。`);
  }
  if (!changes.length) warnings.push("当前模板已经满足已识别的动作、器械、肌群容量和单次时长约束。频率与分化结构仍需在计划页手动确认。");

  const reasons = [...new Set(changes.flatMap((change) => change.reasons))];
  return {
    id: `adaptation:${sourceRevision}:${createdAt}`,
    createdAt,
    trigger,
    scope: "nextMicrocycle",
    sourceRevision,
    confidence: reasons.some((reason) => reason.includes("排除") || reason.includes("器械")) ? "explicit" : changes.length ? "high" : "medium",
    summary: changes.length
      ? `建议调整 ${changes.length} 个模板：${replacedExercises} 个动作替换，${removedExercises} 个动作移除，工作组净变化 ${setDelta > 0 ? "+" : ""}${setDelta}。`
      : "没有发现必须修改的模板。",
    reasons,
    evidence: [
      `目标：${policy.goal}`,
      `单次上限：${constraints.maxSessionMinutes} 分钟 / ${constraints.maxWorkingSetsPerSession} 组 / ${constraints.maxExercisesPerSession} 动作`,
      `每周训练目标：${policy.weeklyTrainingDays.target} 天`,
      `明确排除动作：${constraints.excludedExerciseIds.size} 个`,
      `不可用器械：${constraints.unavailableEquipment.size} 类`,
    ],
    changes,
    impact: {
      changedTemplates: changes.length,
      replacedExercises,
      removedExercises,
      setDelta,
      estimatedMinutesBefore,
      estimatedMinutesAfter,
      muscleSetDelta: muscleDelta(beforeMuscles, afterMuscles),
    },
    warnings,
  };
}

export function applyPlanAdaptation(data: AppData, policy: TrainingPolicy, proposal: PlanAdaptationProposal): ApplyPlanAdaptationResult {
  if (!proposal.changes.length) return { applied: false, reason: "empty", data };
  if (proposal.sourceRevision !== fingerprintTemplates(data, policy)) return { applied: false, reason: "stale", data };
  const changes = new Map(proposal.changes.map((change) => [change.templateId, change]));
  const templates = data.templates?.map((template) => {
    const change = changes.get(template.id);
    if (!change) return template;
    if (!sameItems(template.items, change.previousItems)) return template;
    return { ...template, items: cloneItems(change.nextItems) };
  });
  return { applied: true, data: { ...data, templates } };
}
