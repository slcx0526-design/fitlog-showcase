import { microcycleStepMatchesWorkout, shouldAdvanceMicrocycle } from "./microcycle";
import { hasRecordedTrainingWork } from "./trainingMetrics";
import type { AppData, DayLog, TrainingCyclePhase } from "./types";

export interface FinalizedMicrocycleSample {
  id: string;
  startedAt: string;
  endedAt: string;
  phase: TrainingCyclePhase;
  completedSteps: number;
  trainingSessions: number;
  days: DayLog[];
  mesocycleId?: string;
  mesocycleCycleNumber?: number;
}

type MutableSample = {
  id: string;
  daysByStep: Map<string, DayLog>;
};

function completedCycleDay(day: DayLog, today: string) {
  const workout = day.workout;
  if (!workout || day.date > today || workout.done !== true) return false;
  return workout.type === "rest" || hasRecordedTrainingWork(workout);
}

function stepKey(day: DayLog) {
  return day.workout?.microcycleStepId
    ? `step:${day.workout.microcycleStepId}`
    : `date:${day.date}`;
}

function phaseFor(days: DayLog[]): TrainingCyclePhase {
  const deloads = days.filter((day) => day.workout?.cyclePhase === "deload").length;
  return deloads > days.length / 2 ? "deload" : "build";
}

function sampleFromGroup(group: MutableSample): FinalizedMicrocycleSample | null {
  const days = [...group.daysByStep.values()].sort((left, right) => left.date.localeCompare(right.date));
  if (!days.length) return null;
  const positioned = [...days].reverse().find((day) => day.workout?.mesocycleId && day.workout.mesocycleCycleNumber);
  return {
    id: group.id,
    startedAt: days[0].date,
    endedAt: days.at(-1)!.date,
    phase: phaseFor(days),
    completedSteps: days.length,
    trainingSessions: days.filter((day) => day.workout?.type !== "rest").length,
    days,
    ...(positioned?.workout?.mesocycleId ? { mesocycleId: positioned.workout.mesocycleId } : {}),
    ...(positioned?.workout?.mesocycleCycleNumber
      ? { mesocycleCycleNumber: positioned.workout.mesocycleCycleNumber }
      : {}),
  };
}

function positionKey(sample: FinalizedMicrocycleSample) {
  return sample.mesocycleId && sample.mesocycleCycleNumber
    ? `${sample.mesocycleId}::${sample.mesocycleCycleNumber}`
    : null;
}

function isLaterPosition(
  later: Pick<FinalizedMicrocycleSample, "mesocycleId" | "mesocycleCycleNumber" | "startedAt">,
  sample: FinalizedMicrocycleSample,
) {
  if (!sample.mesocycleId || !sample.mesocycleCycleNumber || later.startedAt <= sample.endedAt) return false;
  if (!later.mesocycleId || !later.mesocycleCycleNumber) return false;
  return later.mesocycleId !== sample.mesocycleId
    || later.mesocycleCycleNumber > sample.mesocycleCycleNumber;
}

function matchesCurrentSchedule(sample: FinalizedMicrocycleSample, data: AppData) {
  const pattern = data.schedule.microcycle;
  if (pattern?.length) {
    let cursor = 0;
    for (const day of sample.days) {
      if (microcycleStepMatchesWorkout(pattern[cursor], day.workout, true)) cursor += 1;
      if (cursor >= pattern.length) return true;
    }
    return false;
  }
  const split = data.schedule.split.filter(Boolean);
  if (!split.length || sample.days.length < split.length) return false;
  return split.every((type, index) => sample.days[index]?.workout?.type === type);
}

/**
 * Returns only cycles with evidence that their ordered loop actually ended.
 * A newer id alone is insufficient because users may manually reset an
 * unfinished cycle. Legacy one-day backfills stay reference-only.
 */
export function collectFinalizedMicrocycleSamples(data: AppData, today: string): FinalizedMicrocycleSample[] {
  const groups = new Map<string, MutableSample>();
  for (const day of Object.values(data.days)) {
    const id = day.workout?.microcycleId;
    if (!id || id.startsWith("legacy_mc_") || !completedCycleDay(day, today)) continue;
    const group = groups.get(id) ?? { id, daysByStep: new Map<string, DayLog>() };
    const key = stepKey(day);
    const previous = group.daysByStep.get(key);
    if (!previous || day.date < previous.date) group.daysByStep.set(key, day);
    groups.set(id, group);
  }

  const samples = [...groups.values()]
    .map(sampleFromGroup)
    .filter((sample): sample is FinalizedMicrocycleSample => Boolean(sample));
  const latestAtPosition = new Map<string, FinalizedMicrocycleSample>();
  for (const sample of samples) {
    const key = positionKey(sample);
    if (!key) continue;
    const current = latestAtPosition.get(key);
    if (!current || sample.endedAt > current.endedAt) latestAtPosition.set(key, sample);
  }

  return samples
    .filter((sample) => {
      if (sample.trainingSessions < 1) return false;
      if (sample.id === data.microcycle?.currentId) return shouldAdvanceMicrocycle(data, today);
      if (data.lastCycleReview?.sourceMicrocycleId === sample.id) return true;

      const key = positionKey(sample);
      if (key) {
        if (latestAtPosition.get(key)?.id !== sample.id) return false;
        const currentCycle = data.microcycle;
        if (currentCycle && isLaterPosition({
          mesocycleId: currentCycle.mesocycleId,
          mesocycleCycleNumber: currentCycle.mesocycleCycleNumber,
          startedAt: currentCycle.startedAt,
        }, sample)) return true;
        if (samples.some((later) => isLaterPosition(later, sample))) return true;
        return false;
      }

      // Older records may predate mesocycle snapshots. They qualify only when
      // their completed sequence still matches a full known schedule.
      return matchesCurrentSchedule(sample, data);
    })
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
}
