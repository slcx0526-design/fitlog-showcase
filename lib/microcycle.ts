import type { AppData } from "./storage";
import type { DayLog, MicrocycleState, MicrocycleStep, Schedule, TrainingType, WorkoutSession } from "./types";
import { hasRecordedTrainingWork } from "./trainingMetrics";

export function makeMicrocycleId(index: number, startedAt: string) { return `mc_${index}_${startedAt.replace(/[^0-9]/g, "").slice(0, 8)}`; }

function localDate() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; }
const STEP_LABELS: Record<TrainingType, string> = { push: "推", pull: "拉", legs: "腿", rest: "休息", custom: "自定义" };
export function microcyclePatternFor(schedule: Schedule | undefined): MicrocycleStep[] {
  if (schedule?.microcycle?.length) return schedule.microcycle;
  const split = schedule?.split.filter((type): type is Exclude<TrainingType, "custom"> => Boolean(type) && type !== "custom");
  const pattern: TrainingType[] = split?.length ? split : ["push", "pull", "legs", "rest", "push", "pull", "rest"];
  return pattern.map((type, index) => ({ id: `cycle_step_${index + 1}`, type, label: STEP_LABELS[type] }));
}
function snapshot(schedule: Schedule | undefined) { return microcyclePatternFor(schedule).map((step) => ({ ...step })); }
export function activeMicrocyclePattern(data: Pick<AppData, "schedule" | "microcycle">): MicrocycleStep[] {
  return data.microcycle?.steps?.length ? data.microcycle.steps.map((step) => ({ ...step })) : snapshot(data.schedule);
}
export function defaultMicrocycle(today: string, schedule?: Schedule): MicrocycleState { return { currentId: makeMicrocycleId(1, today), startedAt: today, index: 1, steps: snapshot(schedule) }; }
export function ensureMicrocycle(data: AppData, today: string): MicrocycleState {
  return data.microcycle
    ? { ...data.microcycle, steps: data.microcycle.steps?.length ? data.microcycle.steps.map((step) => ({ ...step })) : snapshot(data.schedule) }
    : defaultMicrocycle(today, data.schedule);
}
export function nextMicrocycle(current: MicrocycleState | undefined, today: string, schedule?: Schedule): MicrocycleState { const index = (current?.index ?? 0) + 1; return { currentId: makeMicrocycleId(index, today), startedAt: today, index, steps: snapshot(schedule) }; }
export function microcycleForScheduleEdit(data: AppData, schedule: Schedule): MicrocycleState | undefined {
  const current = data.microcycle;
  if (!current) return current;
  const hasRecordedWorkout = Object.values(data.days).some((day) => isActiveMicrocycleDay(data, day));
  return hasRecordedWorkout ? current : { ...current, steps: snapshot(schedule) };
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
  if (step.type === "rest" || !step.templateId) return true;
  return workout.templateId === step.templateId || (allowLegacyUnbound && !workout.templateId);
}

export function microcycleStepHref(step: MicrocycleStep) {
  const params = new URLSearchParams({ start: step.type });
  if (step.type !== "rest" && step.templateId) params.set("template", step.templateId);
  return `/train?${params.toString()}`;
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
  return shouldAdvanceMicrocycle(data, date) ? nextMicrocycle(current, date, data.schedule) : current;
}

export function assignHistoricalMicrocycles(days: Record<string, DayLog>, schedule: Schedule | undefined, today: string): { days: Record<string, DayLog>; microcycle: MicrocycleState } {
  const workouts = Object.entries(days).filter(([, day]) => !!day.workout).sort(([a], [b]) => a.localeCompare(b));
  if (!workouts.length) return { days, microcycle: defaultMicrocycle(today, schedule) };
  const steps = snapshot(schedule);
  const nextDays: Record<string, DayLog> = { ...days };
  let index = 1;
  let startedAt = workouts[0][0];
  let currentId = makeMicrocycleId(index, startedAt);
  let cursor = 0;
  let nextCycleAtNextWorkout = false;
  for (const [date, day] of workouts) {
    if (nextCycleAtNextWorkout) { index += 1; startedAt = date; currentId = makeMicrocycleId(index, startedAt); cursor = 0; nextCycleAtNextWorkout = false; }
    const workout = day.workout!;
    nextDays[date] = { ...day, workout: { ...workout, microcycleId: currentId } };
    if (historicalCompletedStep(day, today) && microcycleStepMatchesWorkout(steps[cursor], workout, true)) {
      cursor += 1;
      if (cursor >= steps.length) nextCycleAtNextWorkout = true;
    }
  }
  if (nextCycleAtNextWorkout) { index += 1; startedAt = today; currentId = makeMicrocycleId(index, startedAt); }
  return { days: nextDays, microcycle: { currentId, startedAt, index, steps } };
}
