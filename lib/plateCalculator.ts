import type { Exercise } from "./types";

export const DEFAULT_PLATE_SIZES_KG = [25, 20, 15, 10, 5, 2.5, 1.25, 0.5];

export interface PlateLoadResult {
  targetKg: number;
  barbellKg: number;
  perSideKg: number;
  platesPerSide: number[];
  achievedKg: number;
  remainderKg: number;
  exact: boolean;
  valid: boolean;
}

const round = (value: number) => Math.round(value * 100) / 100;

function bestPlateCombination(targetKg: number, sizesKg: number[]) {
  const scale = 100;
  const targetUnits = Math.max(0, Math.floor(targetKg * scale + 0.0001));
  const sizes = [...new Set(sizesKg.map((plate) => Math.round(plate * scale)))]
    .filter((plate) => plate > 0)
    .sort((a, b) => b - a);
  if (!targetUnits || !sizes.length) return { loadedKg: 0, plates: [] as number[] };

  // Exact unbounded change avoids greedy failures such as 20kg from 15kg + 10kg plates.
  // Extremely large accidental inputs use a bounded fallback to keep the UI responsive.
  if (targetUnits <= 250_000) {
    const unreachable = targetUnits + 1;
    const counts = new Int32Array(targetUnits + 1);
    const previous = new Int32Array(targetUnits + 1);
    counts.fill(unreachable);
    previous.fill(-1);
    counts[0] = 0;
    for (let amount = 1; amount <= targetUnits; amount += 1) {
      for (const plate of sizes) {
        if (plate > amount || counts[amount - plate] === unreachable) continue;
        const candidate = counts[amount - plate] + 1;
        if (candidate < counts[amount]) {
          counts[amount] = candidate;
          previous[amount] = plate;
        }
      }
    }
    let loadedUnits = targetUnits;
    while (loadedUnits > 0 && counts[loadedUnits] === unreachable) loadedUnits -= 1;
    const plates: number[] = [];
    for (let amount = loadedUnits; amount > 0;) {
      const plate = previous[amount];
      if (plate <= 0) break;
      plates.push(plate / scale);
      amount -= plate;
    }
    return { loadedKg: loadedUnits / scale, plates: plates.sort((a, b) => b - a) };
  }

  let remaining = targetKg;
  const plates: number[] = [];
  for (const plate of sizes.map((value) => value / scale)) {
    while (remaining + 0.0001 >= plate) {
      plates.push(plate);
      remaining = round(remaining - plate);
    }
  }
  return { loadedKg: round(plates.reduce((sum, plate) => sum + plate, 0)), plates };
}

export function calculatePlateLoad(
  targetKg: number,
  barbellKg = 20,
  plateSizesKg = DEFAULT_PLATE_SIZES_KG,
): PlateLoadResult {
  const safeTarget = Number.isFinite(targetKg) ? Math.max(0, targetKg) : 0;
  const safeBar = Number.isFinite(barbellKg) ? Math.max(1, barbellKg) : 20;
  const sizes = [...new Set(plateSizesKg)]
    .filter((plate) => Number.isFinite(plate) && plate > 0)
    .sort((a, b) => b - a);
  if (safeTarget < safeBar || !sizes.length) {
    return {
      targetKg: safeTarget,
      barbellKg: safeBar,
      perSideKg: 0,
      platesPerSide: [],
      achievedKg: safeBar,
      remainderKg: round(safeTarget - safeBar),
      exact: false,
      valid: false,
    };
  }
  const perSideKg = (safeTarget - safeBar) / 2;
  const combination = bestPlateCombination(perSideKg, sizes);
  const platesPerSide = combination.plates;
  const loadedPerSide = round(combination.loadedKg);
  const achievedKg = round(safeBar + loadedPerSide * 2);
  const remainderKg = round(safeTarget - achievedKg);
  return {
    targetKg: safeTarget,
    barbellKg: safeBar,
    perSideKg: round(perSideKg),
    platesPerSide,
    achievedKg,
    remainderKg,
    exact: Math.abs(remainderKg) < 0.01,
    valid: true,
  };
}

const BARBELL_EXERCISE_IDS = new Set([
  "px_barbell_bench",
  "px_incline_barbell",
  "px_barbell_ohp",
  "px_close_grip_bench",
  "pl_barbell_row",
  "pl_biceps_curl",
  "lg_squat",
  "lg_front_squat",
  "lg_rdl",
  "lg_deadlift",
  "lg_hip_thrust",
]);

export function supportsPlateCalculator(exercise: Pick<Exercise, "id" | "equipment" | "name">) {
  if (BARBELL_EXERCISE_IDS.has(exercise.id)) return true;
  return exercise.equipment === "free" && /杠铃|barbell/i.test(exercise.name);
}
