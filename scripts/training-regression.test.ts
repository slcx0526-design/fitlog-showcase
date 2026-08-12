import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeVolumeSummary, volumeAdviceForRow, volumeTargetScale } from "../lib/volume";
import { localeText } from "../lib/i18n";

const empty = computeVolumeSummary([], "intermediate", undefined, volumeTargetScale("28d"));
const emptyChest = empty.rows.find((row) => row.muscle === "chest");
assert.ok(emptyChest);
assert.equal(volumeAdviceForRow(emptyChest, "28d").kind, "hold");

const chest = computeVolumeSummary([{ date: "2026-07-01", workout: { type: "push", exercises: [{ id: "bench", name: "卧推", isMain: true, sets: Array.from({ length: 16 }, () => ({ weight: 80, reps: 8, type: "working" as const })), volumeContributions: [{ muscle: "chest", weight: 1, direct: true }] }] } }], "intermediate", undefined, volumeTargetScale("28d")).rows.find((row) => row.muscle === "chest");
assert.ok(chest);
assert.equal(chest.target.low, 48);
assert.equal(volumeAdviceForRow(chest, "28d").kind, "add");

const cycleChest = computeVolumeSummary([{ date: "2026-07-01", workout: { type: "push", exercises: [{ id: "bench", name: "卧推", isMain: true, sets: Array.from({ length: 4 }, () => ({ weight: 80, reps: 8, type: "working" as const })), volumeContributions: [{ muscle: "chest", weight: 1, direct: true }] }] } }], "intermediate").rows.find((row) => row.muscle === "chest");
assert.ok(cycleChest);
const projectedOnTarget = volumeAdviceForRow(cycleChest, "microcycle", { cycleRatio: 1 / 7, projectionComplete: true, projectedDirectSets: 12 });
assert.equal(projectedOnTarget.kind, "hold", "Remaining templates that reach the target must suppress premature add-volume advice");
assert.equal(projectedOnTarget.basis, "projected");
const earlyProjectedLow = volumeAdviceForRow(cycleChest, "microcycle", { cycleRatio: 1 / 7, projectionComplete: true, projectedDirectSets: 6 });
assert.equal(earlyProjectedLow.kind, "hold", "Early-cycle data must not trigger add-volume advice");
assert.equal(earlyProjectedLow.basis, "partial");
const lateProjectedLow = volumeAdviceForRow(cycleChest, "microcycle", { cycleRatio: 6 / 7, projectionComplete: true, projectedDirectSets: 6 });
assert.equal(lateProjectedLow.kind, "add");
assert.equal(lateProjectedLow.basis, "projected");
assert.equal(lateProjectedLow.suggestedDirectSets, 4);
const incompleteProjection = volumeAdviceForRow(cycleChest, "microcycle", { cycleRatio: 6 / 7, projectionComplete: false, projectedDirectSets: 4 });
assert.equal(incompleteProjection.kind, "hold");
assert.equal(incompleteProjection.basis, "uncovered", "Missing template coverage must not produce speculative volume changes");
const certainHighProjection = volumeAdviceForRow(cycleChest, "microcycle", { cycleRatio: 1 / 7, projectionComplete: false, projectedDirectSets: 20 });
assert.equal(certainHighProjection.kind, "reduce", "Known projected excess stays actionable even when unknown templates can only add more volume");
assert.equal(certainHighProjection.basis, "projected");
const unconfirmedProjection = volumeAdviceForRow(cycleChest, "microcycle", { cycleRatio: 6 / 7, projectionComplete: true, projectedDirectSets: 6, evidenceConfirmed: false });
assert.equal(unconfirmedProjection.kind, "hold");
assert.equal(unconfirmedProjection.basis, "unconfirmed", "Active or unclosed sessions must block per-muscle plan changes too");

assert.equal(localeText("en", "体脂估算", "Body-fat estimate", "体脂肪推定"), "Body-fat estimate");
assert.equal(localeText("ja", "体脂估算", "Body-fat estimate", "体脂肪推定"), "体脂肪推定");
assert.equal(localeText("zh", "体脂估算", "Body-fat estimate", "体脂肪推定"), "体脂估算");

const progressShell = readFileSync("components/ProgressPageShell.tsx", "utf8");
const bodyReview = readFileSync("components/BodyProgressReview.tsx", "utf8");
const trainPage = readFileSync("app/train/page.tsx", "utf8");
const themeCopy = readFileSync("lib/copy.ts", "utf8");
const cutHome = readFileSync("components/CutHome.tsx", "utf8");
assert.ok(bodyReview.includes("relativeLabel(row.date, locale)"));
assert.ok(bodyReview.includes("formatCompact(row.date, locale)"));
assert.ok(progressShell.includes('dynamic(() => import("@/components/TrainingVolumeReview")'));
assert.ok(progressShell.includes('dynamic(() => import("@/components/LogReview")'));
assert.ok(trainPage.includes("localeText(locale"));
assert.ok(themeCopy.includes('locale !== "zh"'));
assert.ok(cutHome.includes("This week's pace will change with cardio logs"));
console.log("training regression tests passed");
