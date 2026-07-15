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

assert.equal(localeText("en", "体脂估算", "Body-fat estimate", "体脂肪推定"), "Body-fat estimate");
assert.equal(localeText("ja", "体脂估算", "Body-fat estimate", "体脂肪推定"), "体脂肪推定");
assert.equal(localeText("zh", "体脂估算", "Body-fat estimate", "体脂肪推定"), "体脂估算");

const progressShell = readFileSync("components/ProgressPageShell.tsx", "utf8");
const trainPage = readFileSync("app/train/page.tsx", "utf8");
const themeCopy = readFileSync("lib/copy.ts", "utf8");
const cutHome = readFileSync("components/CutHome.tsx", "utf8");
assert.ok(progressShell.includes("relativeLabel(row.date, locale)"));
assert.ok(progressShell.includes("formatCompact(row.date, locale)"));
assert.ok(trainPage.includes("localeText(locale"));
assert.ok(themeCopy.includes('locale !== "zh"'));
assert.ok(cutHome.includes("This week's pace will change with cardio logs"));
console.log("training regression tests passed");
