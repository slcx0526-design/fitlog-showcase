"use client";

import { useState } from "react";
import NumberField from "./NumberField";
import { useStore } from "@/lib/store";
import { useI18n, type Locale } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import { LEVELS, type TrainingLevel } from "@/lib/muscles";
import { STARTER_PLANS } from "@/lib/starterPlans";
import type { BiologicalSex, Profile, StarterPlanPreset } from "@/lib/types";

const tx = (locale: Locale, zh: string, en: string, ja: string) => locale === "en" ? en : locale === "ja" ? ja : zh;

export default function SetupGuide() {
  const { locale } = useI18n();
  const { data, completeSetup, dismissSetup } = useStore();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [level, setLevel] = useState<TrainingLevel>(data.profile?.trainingLevel ?? "beginner");
  const [sex, setSex] = useState<BiologicalSex | undefined>(data.profile?.sex);
  const [heightCm, setHeightCm] = useState(data.profile?.heightCm ?? 0);
  const [birthYear, setBirthYear] = useState(data.profile?.birthYear ?? 0);
  const [planId, setPlanId] = useState<StarterPlanPreset>("compact3");
  const plan = STARTER_PLANS.find((item) => item.id === planId) ?? STARTER_PLANS[0];
  const planCopy = starterPlanCopy(locale, plan.id);

  function finish() {
    const profile: Partial<Profile> = {
      trainingLevel: level,
      ...(sex ? { sex } : {}),
      ...(heightCm >= 120 && heightCm <= 230 ? { heightCm } : {}),
      ...(birthYear >= 1900 && birthYear <= new Date().getFullYear() ? { birthYear } : {}),
    };
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    completeSetup({ starterPlan: planId, profile, date });
    toast.show(tx(locale, "起始计划已建立", "Starter plan created", "開始プランを作成しました"));
  }

  return (
    <section className="control-card overflow-hidden" data-setup-guide>
      <div className="border-b border-border px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase text-faint">QUICK START · {step + 1}/3</p>
            <h2 className="mt-1 text-[19px] font-bold text-fg">
              {step === 0
                ? tx(locale, "先确定训练起点", "Set your training baseline", "トレーニングの起点を設定")
                : step === 1
                  ? tx(locale, "选择第一轮计划", "Choose your first cycle", "最初の周期を選択")
                  : tx(locale, "确认后再写入", "Review before applying", "適用前に確認")}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              dismissSetup();
              toast.show(tx(locale, "已跳过，可在设置中自行配置", "Skipped; configure it later in Settings", "スキップしました。設定から構成できます"));
            }}
            className="press shrink-0 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-faint"
          >
            {tx(locale, "暂时跳过", "Skip", "スキップ")}
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1" aria-hidden="true">
          {[0, 1, 2].map((index) => <span key={index} className={"h-1 rounded-full " + (index <= step ? "bg-accent" : "bg-border")} />)}
        </div>
      </div>

      <div className="p-4">
        {step === 0 && (
          <div>
            <p className="text-[12px] leading-relaxed text-muted">
              {tx(locale, "训练水平决定初始容量范围；身体资料只用于体脂、热量和心率估算，均可稍后补充。", "Training level sets the initial volume range. Body fields are optional and only support body-fat, energy, and heart-rate estimates.", "トレーニング歴は初期ボリューム範囲に使用します。身体情報は任意です。")}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {LEVELS.map((item) => {
                const active = level === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setLevel(item.value)}
                    aria-pressed={active}
                    className={"choice-chip press min-h-14 border px-2 py-2 text-center " + (active ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface-2 text-fg")}
                  >
                    <span className="block text-[13px] font-bold">{tx(locale, item.label, item.value === "beginner" ? "Beginner" : item.value === "intermediate" ? "Intermediate" : "Advanced", item.value === "beginner" ? "初心者" : item.value === "intermediate" ? "中級" : "上級")}</span>
                    <span className="mt-0.5 block text-[9px] font-medium text-faint">{item.years}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <label>
                <span className="mb-1 block text-[11px] font-semibold text-faint">{tx(locale, "身高", "Height", "身長")}</span>
                <NumberField value={heightCm} onChange={setHeightCm} ariaLabel={tx(locale, "身高", "Height", "身長")} placeholder="cm" allowDecimal={false} className="number-cell h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-[15px] text-fg" />
              </label>
              <label>
                <span className="mb-1 block text-[11px] font-semibold text-faint">{tx(locale, "出生年份", "Birth year", "生年")}</span>
                <NumberField value={birthYear} onChange={setBirthYear} ariaLabel={tx(locale, "出生年份", "Birth year", "生年")} placeholder="2000" allowDecimal={false} className="number-cell h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-[15px] text-fg" />
              </label>
            </div>
            <div className="control-strip mt-2 grid grid-cols-3 gap-1 rounded-xl p-1" role="group" aria-label={tx(locale, "生理性别", "Biological sex", "生物学的性別")}>
              <button type="button" onClick={() => setSex("male")} aria-pressed={sex === "male"} className={"choice-chip press h-9 text-[12px] font-semibold " + (sex === "male" ? "bg-fg text-bg" : "text-muted")}>{tx(locale, "男性", "Male", "男性")}</button>
              <button type="button" onClick={() => setSex("female")} aria-pressed={sex === "female"} className={"choice-chip press h-9 text-[12px] font-semibold " + (sex === "female" ? "bg-fg text-bg" : "text-muted")}>{tx(locale, "女性", "Female", "女性")}</button>
              <button type="button" onClick={() => setSex(undefined)} aria-pressed={!sex} className={"choice-chip press h-9 text-[12px] font-semibold " + (!sex ? "bg-fg text-bg" : "text-muted")}>{tx(locale, "稍后", "Later", "後で")}</button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-2">
            {STARTER_PLANS.map((item) => {
              const active = item.id === planId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPlanId(item.id)}
                  aria-pressed={active}
                  className={"press flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left " + (active ? "border-accent bg-accent-soft" : "border-border bg-surface-2")}
                >
                  <span className={"tnum grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[15px] font-bold " + (active ? "bg-accent text-accent-fg" : "bg-surface text-muted")}>{item.trainingDays}</span>
                  <span className="min-w-0 flex-1">
                    <span className={"block text-[14px] font-semibold " + (active ? "text-accent" : "text-fg")}>{starterPlanCopy(locale, item.id).name}</span>
                    <span className="mt-0.5 block text-[10px] leading-relaxed text-faint">{starterPlanCopy(locale, item.id).detail}</span>
                  </span>
                  <span className="text-[11px] font-semibold text-muted">{item.templates.length} {tx(locale, "模板", "templates", "テンプレート")}</span>
                </button>
              );
            })}
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <ReviewFact label={tx(locale, "水平", "Level", "レベル")} value={levelName(locale, level)} />
              <ReviewFact label={tx(locale, "每轮训练", "Sessions", "セッション")} value={`${plan.trainingDays}`} />
              <ReviewFact label={tx(locale, "模板", "Templates", "テンプレート")} value={`${plan.templates.length}`} />
            </div>
            <div className="control-strip mt-3 rounded-xl px-3 py-2.5">
              <p className="text-[13px] font-semibold text-fg">{planCopy.name}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">{plan.schedule.microcycle?.map((item) => starterStepLabel(locale, item.label)).join(" → ")}</p>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-faint">
              {tx(locale, "只为没有训练历史和模板的新工作区写入起始计划；之后可以自由编辑，不会自动覆盖。", "The starter plan is only installed for an empty training workspace. You can edit it freely afterward.", "トレーニング履歴とテンプレートが空の場合のみ開始プランを書き込みます。")}
            </p>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          {step > 0 ? (
            <button type="button" onClick={() => setStep((value) => value - 1)} className="press h-11 rounded-xl border border-border bg-surface text-[13px] font-semibold text-muted">
              {tx(locale, "上一步", "Back", "戻る")}
            </button>
          ) : <span />}
          <button
            type="button"
            onClick={() => step < 2 ? setStep((value) => value + 1) : finish()}
            className="press h-11 rounded-xl bg-fg text-[13px] font-semibold text-bg"
          >
            {step < 2 ? tx(locale, "继续", "Continue", "続ける") : tx(locale, "建立第一轮", "Create first cycle", "最初の周期を作成")}
          </button>
        </div>
      </div>
    </section>
  );
}

function levelName(locale: Locale, level: TrainingLevel) {
  if (level === "beginner") return tx(locale, "新手", "Beginner", "初心者");
  if (level === "intermediate") return tx(locale, "中级", "Intermediate", "中級");
  return tx(locale, "高级", "Advanced", "上級");
}

function starterPlanCopy(locale: Locale, id: StarterPlanPreset) {
  if (id === "compact3") return {
    name: tx(locale, "精简 3 练", "Compact 3-day", "コンパクト週3"),
    detail: tx(locale, "推 / 拉 / 腿，适合刚开始建立稳定记录。", "Push / pull / legs for building a consistent logging habit.", "プッシュ・プル・脚で、安定した記録習慣を作ります。"),
  };
  if (id === "balanced5") return {
    name: tx(locale, "均衡 5 练", "Balanced 5-day", "バランス週5"),
    detail: tx(locale, "力量与增肌轨道分开，适合稳定训练者。", "Separate strength and hypertrophy tracks for consistent trainees.", "筋力と筋肥大のトラックを分けた、継続的なトレーニング向けです。"),
  };
  return {
    name: tx(locale, "高频 6 练", "High-frequency 6-day", "高頻度週6"),
    detail: tx(locale, "推拉腿各两次，仅适合恢复和时间都稳定时。", "Two push, pull, and leg sessions; use only with reliable recovery and time.", "プッシュ・プル・脚を各2回。回復と時間が安定している場合に限ります。"),
  };
}

function starterStepLabel(locale: Locale, label: string) {
  const labels: Record<string, [string, string, string]> = {
    Push: ["推", "Push", "プッシュ"],
    Pull: ["拉", "Pull", "プル"],
    Legs: ["腿", "Legs", "脚"],
    Rest: ["休息", "Rest", "休息"],
    "Push Strength": ["推 · 力量", "Push strength", "プッシュ・筋力"],
    "Pull Strength": ["拉 · 力量", "Pull strength", "プル・筋力"],
    "Legs Strength": ["腿 · 力量", "Leg strength", "脚・筋力"],
    "Push Hypertrophy": ["推 · 增肌", "Push hypertrophy", "プッシュ・筋肥大"],
    "Pull Hypertrophy": ["拉 · 增肌", "Pull hypertrophy", "プル・筋肥大"],
    "Legs Hypertrophy": ["腿 · 增肌", "Leg hypertrophy", "脚・筋肥大"],
  };
  const value = labels[label];
  return value ? tx(locale, value[0], value[1], value[2]) : label;
}

function ReviewFact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-surface-2 px-2 py-2"><p className="text-[9px] font-semibold text-faint">{label}</p><p className="tnum mt-1 text-[13px] font-bold text-fg">{value}</p></div>;
}
