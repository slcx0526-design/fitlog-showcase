import type { AppData } from "./storage";
import type { DayLog, MicrocycleState, MicrocycleStep, Schedule, Template, TrainingType, WorkoutSession } from "./types";
import { hasRecordedTrainingWork } from "./trainingMetrics";

export function makeMicrocycleId(index: number, startedAt: string) { return `mc_${index}_${startedAt.replace(/[^0-9]/g, "").slice(0, 8)}`; }

function localDate() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; }
const STEP_LABELS: Record<TrainingType, string> = { push: "推", pull: "拉", legs: "腿", rest: "休息", custom: "自定义" };
export function microcyclePatternFor(schedule: Schedule | undefined): MicrocycleStep[] {
  if (schedule?.microcycle?.length) {
    return schedule.microcycle.map(({ templateSnapshot: _snapshot, ...step }) => ({ ...step }));
  }
  const split = schedule?.split.filter((type): type is Exclude<TrainingType, "custom"> => Boolean(type) && type !== "custom");
  const pattern: TrainingType[] = split?.length ? split : ["push", "pull", "legs", "rest", "push", "pull", "rest"];
  return pattern.map((type, index) => ({ id: `cycle_step_${index + 1}`, type, label: STEP_LABELS[type] }));
}

export function cloneTemplate(template: Template): Template {
  return {
    ...template,
    items: template.items.map((item) => ({
      ...item,
      ...(item.prescription ? { prescription: { ...item.prescription } } : {}),
      ...(item.secondaryMuscles ? { secondaryMuscles: [...item.secondaryMuscles] } : {}),
      ...(item.volumeContributions ? { volumeContributions: item.volumeContributions.map((entry) => ({ ...entry })) } : {}),
      ...(item.alternatives ? { alternatives: [...item.alternatives] } : {}),
      ...(item.recordModes ? { recordModes: [...item.recordModes] } : {}),
    })),
  };
}

function cloneStep(step: MicrocycleStep): MicrocycleStep {
  return {
    ...step,
    ...(step.templateSnapshot ? { templateSnapshot: cloneTemplate(step.templateSnapshot) } : {}),
  };
}

function snapshot(schedule: Schedule | undefined, templates: Template[] = []) {
  const byId = new Map(templates.map((template) => [template.id, template]));
  return microcyclePatternFor(schedule).map((step) => {
    const template = step.templateId ? byId.get(step.templateId) : undefined;
    return {
      ...step,
      ...(template && template.type === step.type ? { templateSnapshot: cloneTemplate(template) } : {}),
    };
  });
}

function hydrateSnapshots(steps: MicrocycleStep[], templates: Template[] = []) {
  const byId = new Map(templates.map((template) => [template.id, template]));
  return steps.map((step) => {
    if (step.templateSnapshot) return cloneStep(step);
    const template = step.templateId ? byId.get(step.templateId) : undefined;
    return {
      ...step,
      ...(template && template.type === step.type ? { templateSnapshot: cloneTemplate(template) } : {}),
    };
  });
}

export function activeMicrocyclePattern(data: Pick<AppData, "schedule" | "microcycle" | "templates">): MicrocycleStep[] {
  return data.microcycle?.steps?.length ? data.microcycle.steps.map(cloneStep) : snapshot(data.schedule, data.templates);
}
export function defaultMicrocycle(today: string, schedule?: Schedule, templates: Template[] = []): MicrocycleState { return { currentId: makeMicrocycleId(1, today), startedAt: today, index: 1, steps: snapshot(schedule, templates) }; }
export function ensureMicrocycle(data: AppData, today: string): MicrocycleState {
  return data.microcycle
    ? { ...data.microcycle, steps: data.microcycle.steps?.length ? hydrateSnapshots(data.microcycle.steps, data.templates) : snapshot(data.schedule, data.templates) }
    : defaultMicrocycle(today, data.schedule, data.templates);
}
export function nextMicrocycle(current: MicrocycleState | undefined, today: string, schedule?: Schedule, templates: Template[] = []): MicrocycleState { const index = (current?.index ?? 0) + 1; return { currentId: makeMicrocycleId(index, today), startedAt: today, index, steps: snapshot(schedule, templates) }; }
export function microcycleForScheduleEdit(data: AppData, schedule: Schedule): MicrocycleState | undefined {
  const current = data.microcycle;
  if (!current) return current;
  const hasRecordedWorkout = Object.values(data.days).some((day) => isActiveMicrocycleDay(data, day));
  return hasRecordedWorkout ? current : { ...current, steps: snapshot(schedule, data.templates) };
}

export function microcycleForTemplateEdit(data: AppData, templates: Template[]): MicrocycleState | undefined {
  const current = data.microcycle;
  if (!current) return current;
  const hasRecordedWorkout = Object.values(data.days).some((day) => isActiveMicrocycleDay(data, day));
  return hasRecordedWorkout ? current : { ...current, steps: snapshot(data.schedule, templates) };
}
/** Must match the valid-work semantics used by progression and volume. */
function hasWorkingSet(day: DayLog) {
  return hasRecordedTrainingWork(day.workout);
}

export function completedStep(day: DayLog, today = localDate()) {
  const workout = day.workout;
  if (!workout || day.date > today || workout.done === false) return false;
  if (workout.type === "rest") return true;
  if (!hasWorkingSet(day)) return false;
  return workout.done === true || day.date < today;
}

function historicalCompletedStep(day: DayLog, today: string) {
  const workout = day.workout;
  if (!workout || day.date > today) return false;
  if (day.date === today) return completedStep(day, today);
  if (workout.type === "rest") return true;
  return hasWorkingSet(day);
}

export function isActiveMicrocycleDay(data: Pick<AppData, "microcycle">, day: DayLog) {
  const current = data.microcycle;
  return Boolean(current && day.date >= current.startedAt && day.workout?.microcycleId === current.currentId);
}

export function microcycleStepMatchesWorkout(
  step: MicrocycleStep | undefined,
  workout: WorkoutSession | undefined,
  allowLegacyUnbound = false,
) {
  if (!step || !workout || workout.type !== step.type) return false;
  if (workout.microcycleStepId) return workout.microcycleStepId === step.id;
  if (step.type === "rest" || !step.templateId) return true;
  return workout.templateId === step.templateId || (allowLegacyUnbound && !workout.templateId);
}

export function microcycleStepHref(step: MicrocycleStep) {
  const params = new URLSearchParams({ start: step.type, cycleStep: step.id });
  if (step.type !== "rest" && step.templateId) params.set("template", step.templateId);
  return `/train?${params.toString()}`;
}

export function templateForMicrocycleStep(
  data: Pick<AppData, "microcycle" | "templates">,
  stepId: string | undefined,
  templateId: string | undefined,
) {
  const step = stepId ? data.microcycle?.steps?.find((item) => item.id === stepId) : undefined;
  if (step?.templateSnapshot && (!templateId || step.templateSnapshot.id === templateId)) {
    return cloneTemplate(step.templateSnapshot);
  }
  return templateId ? data.templates?.find((template) => template.id === templateId) : undefined;
}

export function templateForWorkout(
  data: Pick<AppData, "microcycle" | "templates">,
  workout: Pick<WorkoutSession, "templateId" | "templateSnapshot" | "microcycleStepId"> | undefined,
) {
  if (workout?.templateSnapshot) return cloneTemplate(workout.templateSnapshot);
  return templateForMicrocycleStep(data, workout?.microcycleStepId, workout?.templateId);
}

export function shouldAdvanceMicrocycle(data: AppData, today = localDate()) {
  const currentId = data.microcycle?.currentId;
  if (!currentId) return false;
  const expected = activeMicrocyclePattern(data);
  const days = Object.values(data.days).filter((day) => isActiveMicrocycleDay(data, day) && completedStep(day, today)).sort((a, b) => a.date.localeCompare(b.date));
  let cursor = 0;
  for (const day of days) {
    if (microcycleStepMatchesWorkout(expected[cursor], day.workout)) cursor += 1;
    if (cursor >= expected.length) return true;
  }
  return false;
}

export function currentMicrocycleProgress(data: AppData, today = localDate()) {
  const pattern = activeMicrocyclePattern(data);
  const currentId = data.microcycle?.currentId;
  if (!currentId) return { pattern, completed: 0, next: pattern[0] ?? null };
  const days = Object.values(data.days)
    .filter((day) => isActiveMicrocycleDay(data, day) && completedStep(day, today))
    .sort((a, b) => a.date.localeCompare(b.date));
  let cursor = 0;
  for (const day of days) {
    if (microcycleStepMatchesWorkout(pattern[cursor], day.workout)) cursor += 1;
    if (cursor >= pattern.length) break;
  }
  return { pattern, completed: Math.min(cursor, pattern.length), next: pattern[cursor] ?? null };
}

/** Keep a completed cycle visible until the next workout is actually created. */
export function microcycleForNewWorkout(data: AppData, date = localDate()) {
  const current = ensureMicrocycle(data, date);
  return shouldAdvanceMicrocycle(data, date) ? nextMicrocycle(current, date, data.schedule, data.templates) : current;
}

/** Backfilled workouts before the active cycle keep a stable historical id immediately. */
export function microcycleAssignmentForNewWorkout(data: AppData, date = localDate()) {
  const current = ensureMicrocycle(data, date);
  if (date < current.startedAt) {
    return { microcycle: current, microcycleId: `legacy_mc_${date.replace(/-/g, "")}` };
  }
  const microcycle = microcycleForNewWorkout(data, date);
  return { microcycle, microcycleId: microcycle.currentId };
}

export function assignHistoricalMicrocycles(days: Record<string, DayLog>, schedule: Schedule | undefined, today: string, templates: Template[] = []): { days: Record<string, DayLog>; microcycle: MicrocycleState } {
  const workouts = Object.entries(days).filter(([, day]) => !!day.workout).sort(([a], [b]) => a.localeCompare(b));
  if (!workouts.length) return { days, microcycle: defaultMicrocycle(today, schedule, templates) };
  const steps = snapshot(schedule, templates);
  const nextDays: Record<string, DayLog> = { ...days };
  let index = 1;
  let startedAt = workouts[0][0];
  let currentId = makeMicrocycleId(index, startedAt);
  let cursor = 0;
  let nextCycleAtNextWorkout = false;
  for (const [date, day] of workouts) {
    if (nextCycleAtNextWorkout) { index += 1; startedAt = date; currentId = makeMicrocycleId(index, startedAt); cursor = 0; nextCycleAtNextWorkout = false; }
    const workout = day.workout!;
    const matchedStep = historicalCompletedStep(day, today) && microcycleStepMatchesWorkout(steps[cursor], workout, true)
      ? steps[cursor]
      : undefined;
    const microcycleStepId = workout.microcycleStepId ?? matchedStep?.id;
    nextDays[date] = {
      ...day,
      workout: {
        ...workout,
        microcycleId: currentId,
        ...(microcycleStepId ? { microcycleStepId } : {}),
      },
    };
    if (matchedStep) {
      cursor += 1;
      if (cursor >= steps.length) nextCycleAtNextWorkout = true;
    }
  }
  if (nextCycleAtNextWorkout) { index += 1; startedAt = today; currentId = makeMicrocycleId(index, startedAt); }
  return { days: nextDays, microcycle: { currentId, startedAt, index, steps } };
}
