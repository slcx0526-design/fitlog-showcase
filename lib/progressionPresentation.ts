import type { PerformanceMode, ProgressionPrescription } from "./types";
import type { Locale } from "./i18n";
import type { ProgressionSuggestion } from "./prescription";

export interface ProgressionPresentation {
  value: string;
  summary: string;
  condition: string;
  tone: "accent" | "warn" | "muted";
}

const tx = (locale: Locale, zh: string, en: string, ja: string) => locale === "en" ? en : locale === "ja" ? ja : zh;

export function progressionPresentation(
  suggestion: ProgressionSuggestion,
  prescription: ProgressionPrescription,
  performanceMode: PerformanceMode,
  locale: Locale,
): ProgressionPresentation {
  const unit = performanceMode === "duration" ? tx(locale, "秒", "sec", "秒") : performanceMode === "distance" ? "m" : tx(locale, "次", "reps", "回");
  const target = tx(locale, `目标 ${prescription.targetRepMin}–${prescription.targetRepMax} ${unit}`, `Target ${prescription.targetRepMin}–${prescription.targetRepMax} ${unit}`, `目標 ${prescription.targetRepMin}–${prescription.targetRepMax} ${unit}`);
  const value = suggestionValue(suggestion, performanceMode, locale);
  const detail = suggestionSummary(suggestion, performanceMode, prescription, locale);
  return {
    value,
    summary: `${target} · ${detail}`,
    condition: suggestionCondition(suggestion, prescription, unit, locale),
    tone: suggestion.status === "addWeight"
      ? "accent"
      : ["effortCheck", "mixedLoads", "missingLoad"].includes(suggestion.status)
        ? "warn"
        : "muted",
  };
}

function suggestionValue(suggestion: ProgressionSuggestion, mode: PerformanceMode, locale: Locale) {
  if (suggestion.nextWeight != null && suggestion.nextWeight > 0) {
    if (suggestion.status === "addWeight") return `${suggestion.nextWeight}kg`;
    return tx(locale, `${suggestion.nextWeight}kg · 保持`, `${suggestion.nextWeight}kg · hold`, `${suggestion.nextWeight}kg・維持`);
  }
  if (suggestion.status === "manualProgression") return tx(locale, "手动进阶", "Choose progression", "進行方法を選択");
  if (suggestion.status === "mixedLoads") return tx(locale, "手动定基准", "Choose baseline", "基準を選択");
  if (suggestion.status === "missingLoad") return tx(locale, "补全负重", "Log load", "重量を記録");
  if (suggestion.status === "modeReference") return tx(locale, "仅作参考", "Reference only", "参考のみ");
  if (suggestion.status === "finishSets") return tx(locale, "先补齐组数", "Finish sets", "セットを完了");
  if (suggestion.status === "stabilize") return tx(locale, "先稳定下限", "Stabilize", "下限を安定");
  if (suggestion.status === "addReps") return mode === "duration"
    ? tx(locale, "继续补时长", "Build duration", "時間を伸ばす")
    : mode === "distance"
      ? tx(locale, "继续补距离", "Build distance", "距離を伸ばす")
      : tx(locale, "继续补次数", "Build reps", "回数を伸ばす");
  return tx(locale, "先建立历史", "Build history", "履歴を作成");
}

function suggestionSummary(suggestion: ProgressionSuggestion, mode: PerformanceMode, prescription: ProgressionPrescription, locale: Locale) {
  if (suggestion.status === "noHistory") return tx(locale, "当前轨道暂无记录，先记录本次表现", "No history on this track; log this session first", "このトラックには記録がありません。まず今回を記録してください");
  if (suggestion.status === "finishSets") return tx(locale, "先完成计划工作组，再调整负重", "Finish the planned work sets before changing load", "予定のワーキングセットを完了してから負荷を調整します");
  if (suggestion.status === "addWeight") return tx(locale, `下次加 ${prescription.loadIncrementKg} kg`, `Add ${prescription.loadIncrementKg} kg next time`, `次回は ${prescription.loadIncrementKg} kg 増やす`);
  if (suggestion.status === "modeReference") return tx(locale, "保留同轨道历史参考，不自动改处方", "Keep same-track history as reference without changing the prescription", "同一トラック履歴を参照用に保持し、処方は自動変更しません");
  if (suggestion.status === "manualProgression") return tx(locale, "已达到当前处方上限，下一步由你选择进阶方式", "The current prescription ceiling is reached; choose the next progression", "現在の処方上限に到達しました。次の進行方法を選択してください");
  if (suggestion.status === "mixedLoads") return tx(locale, "上次计划组负重不一致，不自动选择基准", "The planned sets used mixed loads, so no baseline is chosen automatically", "前回の予定セットで重量が異なるため、基準重量を自動選択しません");
  if (suggestion.status === "missingLoad") return tx(locale, "上次计划组缺少负重，不生成加重值", "The previous planned sets are missing load data, so no load is suggested", "前回の予定セットに重量記録がないため、増量値を提案しません");
  if (suggestion.status === "effortCheck") return tx(locale, "次数已达标，但上次状态不适合直接加重", "The target was met, but the last session was not ready for a load increase", "目標は達成しましたが、前回の状態ではすぐに増量しません");
  if (suggestion.status === "stabilize") return tx(locale, "先稳定达到目标下限", "Reach the bottom of the target range first", "先に目標範囲の下限を安定して達成します");
  if (mode === "duration") return tx(locale, "保持当前方式，继续补时长", "Keep the current setup and build duration", "現在の方法を維持して時間を伸ばします");
  if (mode === "distance") return tx(locale, "保持当前方式，继续补距离", "Keep the current setup and build distance", "現在の方法を維持して距離を伸ばします");
  return tx(locale, "保持重量，继续补次数", "Keep the load and build reps", "重量を維持して回数を伸ばします");
}

function suggestionCondition(suggestion: ProgressionSuggestion, prescription: ProgressionPrescription, unit: string, locale: Locale) {
  if (suggestion.status === "noHistory") return tx(locale, "完成一次同轨道训练后生成", "Complete one same-track session first", "同一トラックを1回完了すると生成されます");
  if (suggestion.status === "finishSets") return tx(locale, `完成 ${prescription.workingSets} 个标准工作组`, `Complete ${prescription.workingSets} standard work sets`, `標準ワーキングセットを ${prescription.workingSets} セット完了`);
  if (suggestion.status === "addWeight") return tx(locale, `所有计划组达到 ${prescription.targetRepMax} ${unit}，且整体不吃力`, `All planned sets reach ${prescription.targetRepMax} ${unit} without a hard session`, `全予定セットで ${prescription.targetRepMax} ${unit} に到達し、全体がきつすぎないこと`);
  if (suggestion.status === "effortCheck") return tx(locale, "同一负重再次达到上限，且整体不吃力", "Reach the ceiling again at the same load without a hard session", "同じ重量で再び上限に到達し、全体がきつすぎないこと");
  if (suggestion.status === "stabilize") return tx(locale, `所有计划组先达到 ${prescription.targetRepMin} ${unit}`, `Bring every planned set to at least ${prescription.targetRepMin} ${unit}`, `全予定セットをまず ${prescription.targetRepMin} ${unit} 以上にする`);
  if (suggestion.status === "mixedLoads") return tx(locale, "使用同一基准负重完成计划组", "Complete the planned sets with one baseline load", "1つの基準重量で予定セットを完了する");
  if (suggestion.status === "missingLoad") return tx(locale, "每个计划工作组记录实际负重", "Log the actual load for every planned work set", "各予定ワーキングセットの実重量を記録する");
  if (suggestion.status === "manualProgression") return tx(locale, "选择更难变式、外部负重或新的处方目标", "Choose a harder variation, external load, or a new prescription target", "難しいバリエーション、外部負荷、または新しい処方目標を選ぶ");
  if (suggestion.status === "modeReference") return tx(locale, "自定义轨道由你手动调整处方", "Adjust custom-track prescriptions manually", "カスタムトラックの処方は手動で調整する");
  return tx(locale, `所有计划组达到 ${prescription.targetRepMax} ${unit}`, `Bring all planned sets to ${prescription.targetRepMax} ${unit}`, `全予定セットを ${prescription.targetRepMax} ${unit} に到達させる`);
}
