"use client";

import { useMemo } from "react";
import Link from "next/link";
import NumberField from "./NumberField";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import type { BaselineActivity } from "@/lib/types";
import {
  BASELINE_ACTIVITY,
  DEFAULT_BASELINE_ACTIVITY,
  DEFAULT_WEEKLY_LOSS_PCT,
  ageFromBirthYear,
  resolveCutEnergyPlan,
} from "@/lib/cut";
import { cardioWeekSummary, weeklyCardioGoal } from "@/lib/cardio";
import {
  currentCutSnapshot,
  isCutModeActive,
  projectedWeeksToBodyFat,
  projectedWeightAtBodyFat,
  suggestedCutVolumeScale,
} from "@/lib/cutMode";
import { workingSets } from "@/lib/prescription";

const ACTIVITY_LEVELS: BaselineActivity[] = ["low", "light", "moderate", "high"];
const LOSS_PRESETS = [0.25, 0.5, 0.75] as const;
const BF_PRESETS = [18, 15, 12] as const;

function kcal(n: number | null | undefined) {
  return n == null || !Number.isFinite(n)
    ? "—"
    : `${Math.round(n).toLocaleString()} kcal`;
}

function signedKg(n: number | null) {
  if (n == null) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(2)} kg / 周`;
}

export default function CutDashboard() {
  const today = useToday();
  const { data, loaded, getDay, setProfile, setCutPlan } = useStore();
  const profile = data.profile;
  const plan = data.cutPlan;
  const active = isCutModeActive(plan);
  const day = getDay(today);
  const energy = useMemo(
    () =>
      resolveCutEnergyPlan(
        profile,
        plan,
        data.days,
        data.bodyWeights,
        today
      ),
    [profile, plan, data.days, data.bodyWeights, today]
  );
  const snapshot = useMemo(
    () => currentCutSnapshot(profile, data.bodyWeights, data.waistEntries),
    [profile, data.bodyWeights, data.waistEntries]
  );
  const age = ageFromBirthYear(profile?.birthYear);
  const activity = plan?.baselineActivity ?? DEFAULT_BASELINE_ACTIVITY;
  const weeklyLossPct = plan?.weeklyLossPct ?? DEFAULT_WEEKLY_LOSS_PCT;
  const targetBf = plan?.targetBodyFatPct;
  const projectedWeight = projectedWeightAtBodyFat(snapshot?.leanMassKg, targetBf);
  const projectedWeeks = projectedWeeksToBodyFat(
    snapshot?.weightKg,
    projectedWeight,
    weeklyLossPct
  );
  const suggestedScale = suggestedCutVolumeScale(
    snapshot?.bodyFatPercent,
    weeklyLossPct
  );
  const volumeScale = plan?.trainingVolumeScale ?? suggestedScale;
  const intake = day?.nutrition?.calories ?? 0;
  const remaining =
    energy.calorieTarget != null && intake > 0
      ? Math.round(energy.calorieTarget - intake)
      : null;
  const setCount =
    day?.workout?.exercises.reduce((sum, exercise) => sum + workingSets(exercise.sets).length, 0) ??
    0;
  const cardioToday = (day?.cardio ?? []).reduce(
    (sum, entry) => sum + entry.minutes,
    0
  );
  const cardioWeek = useMemo(
    () => cardioWeekSummary(data.days, data.cutPlan),
    [data.days, data.cutPlan],
  );
  const cardioGoal = weeklyCardioGoal(plan);
  const targetWeeklyKg = energy.weightKg
    ? -(energy.weightKg * (weeklyLossPct / 100))
    : null;
  const needsProfile = !(
    profile?.sex &&
    profile.heightCm &&
    age &&
    energy.weightKg
  );

  if (!loaded) return <Loading />;

  return (
    <div>
      <header className="control-card mb-4 p-3.5">
        <p className="text-[12px] font-medium uppercase tracking-wide text-faint">
          CUT MODE
        </p>
        <div className="mt-0.5 flex items-center justify-between gap-3">
          <h1 className="text-[22px] font-bold tracking-tight text-fg">减脂计划</h1>
          <button
            type="button"
            onClick={() => setCutPlan({ enabled: !active })}
            className={
              "press relative h-8 w-14 rounded-full transition-colors " +
              (active ? "bg-accent" : "border border-border bg-surface-2")
            }
            aria-label={active ? "关闭减脂模式" : "开启减脂模式"}
          >
            <span
              className={
                "absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-transform " +
                (active ? "translate-x-6" : "translate-x-1")
              }
            />
          </button>
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">
          {active
            ? "体脂目标、固定饮食预算、训练容量与周度趋势正在使用同一套计划。"
            : "开启后，减脂目标会同步到今天、饮食与模板训练。"}
        </p>
      </header>

      {needsProfile ? (
        <SetupCard
          sex={profile?.sex}
          height={profile?.heightCm ?? 0}
          birthYear={profile?.birthYear ?? 0}
          weight={energy.weightKg}
          onSex={(sex) => setProfile({ sex })}
          onHeight={(heightCm) => setProfile({ heightCm })}
          onBirthYear={(birthYear) => setProfile({ birthYear })}
        />
      ) : (
        <>
          <section className="control-card p-3">
            <SectionTitle
              title="目标与进度"
              sub="体脂率是主目标；参考体重只是假设去脂体重不变时的推算"
            />
            {!snapshot ? (
              <div className="mt-3 control-strip rounded-xl px-3 py-3">
                <p className="text-[13px] font-medium text-fg">还缺少腰围记录</p>
                <p className="mt-1 text-[11px] leading-relaxed text-faint">
                  记录一条腰围后，才能把体脂目标转换为可跟踪的阶段进度与参考体重。
                </p>
                <Link
                  href="/data"
                  className="choice-chip press mt-2 inline-flex border border-border bg-surface px-2.5 py-1.5 text-[12px] font-medium text-accent"
                >
                  去记录腰围
                </Link>
              </div>
            ) : (
              <>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <MiniMetric
                    label="当前 RFM 估算"
                    value={`${snapshot.bodyFatPercent.toFixed(1)}%`}
                    accent
                  />
                  <MiniMetric
                    label="最新腰围"
                    value={`${snapshot.waistCm.toFixed(1)} cm`}
                  />
                  <MiniMetric
                    label="估算去脂体重"
                    value={`${snapshot.leanMassKg.toFixed(1)} kg`}
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <MetricInput
                    label="目标体脂"
                    unit="%"
                    value={targetBf ?? 0}
                    placeholder="15"
                    decimal
                    onChange={(targetBodyFatPct) => setCutPlan({ targetBodyFatPct })}
                  />
                  <MetricInput
                    label="每周下降"
                    unit="% 体重"
                    value={weeklyLossPct}
                    placeholder="0.5"
                    decimal
                    onChange={(weeklyLossPct) => setCutPlan({ weeklyLossPct })}
                  />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {BF_PRESETS.map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setCutPlan({ targetBodyFatPct: pct })}
                      className={
                        "choice-chip press border py-2 text-[13px] font-semibold " +
                        (Math.abs((targetBf ?? 0) - pct) < 0.01
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-border bg-surface-2 text-fg")
                      }
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {LOSS_PRESETS.map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setCutPlan({ weeklyLossPct: pct })}
                      className={
                        "choice-chip press border py-2 text-[12px] " +
                        (Math.abs(weeklyLossPct - pct) < 0.01
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-border bg-surface-2 text-muted")
                      }
                    >
                      {pct}% / 周
                    </button>
                  ))}
                </div>
                {targetBf && projectedWeight ? (
                  <div className="mt-3 control-strip rounded-xl px-3 py-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <div>
                        <p className="text-[11px] text-faint">
                          达到 {targetBf.toFixed(1)}% 的参考体重
                        </p>
                        <p className="tnum mt-0.5 text-[21px] font-bold text-fg">
                          {projectedWeight.toFixed(1)}{" "}
                          <span className="text-[12px] font-medium text-faint">kg</span>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="tnum text-[14px] font-semibold text-fg">
                          {projectedWeeks ? `约 ${projectedWeeks} 周` : "—"}
                        </p>
                        <p className="text-[10px] text-faint">按当前速度</p>
                      </div>
                    </div>
                    <p className="mt-2 text-[10px] leading-relaxed text-faint">
                      RFM 与参考体重只用于看趋势，不是 DXA 测量或硬性截止线。
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-[11px] leading-relaxed text-faint">
                    先选择目标体脂率。建议把它视为阶段区间，而不是精确到 0.1% 的终点。
                  </p>
                )}
              </>
            )}
          </section>

          <section className="mt-5 control-card p-3">
            <SectionTitle
              title="饮食预算"
              sub="同一个固定目标用于今天与饮食页；有氧不会兑换成当天可多吃的热量"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <MiniMetric
                label={energy.maintenanceSource === "trend" ? "趋势维持热量" : "公式维持热量"}
                value={kcal(energy.maintenance)}
                accent={energy.maintenanceSource === "trend"}
              />
              <MiniMetric label="目标日赤字" value={kcal(energy.dailyDeficit)} />
              <MiniMetric label="每日热量目标" value={kcal(energy.calorieTarget)} accent />
              <MiniMetric
                label={intake > 0 ? "今日相对目标" : "今日已记录"}
                value={
                  intake > 0 && remaining != null
                    ? remaining >= 0
                      ? `剩 ${remaining} kcal`
                      : `超 ${Math.abs(remaining)} kcal`
                    : "—"
                }
                tone={remaining != null && remaining < 0 ? "warn" : undefined}
              />
            </div>
            <div className="mt-3">
              <p className="mb-1 text-[11px] font-medium text-faint">日常活动基线</p>
              <div className="grid grid-cols-2 gap-2">
                {ACTIVITY_LEVELS.map((level) => {
                  const meta = BASELINE_ACTIVITY[level];
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setCutPlan({ baselineActivity: level })}
                      className={
                        "choice-chip press border px-3 py-2 text-left " +
                        (activity === level
                          ? "border-accent bg-accent-soft"
                          : "border-border bg-surface-2")
                      }
                    >
                      <p
                        className={
                          "text-[12px] font-semibold " +
                          (activity === level ? "text-accent" : "text-fg")
                        }
                      >
                        {meta.label}
                      </p>
                      <p className="mt-0.5 text-[10px] text-faint">{meta.note}</p>
                    </button>
                  );
                })}
              </div>
            </div>
            {energy.macros && (
              <div className="mt-3 grid grid-cols-4 gap-2 border-t border-border/60 pt-3">
                <MiniMetric label="蛋白" value={`${energy.macros.protein} g`} />
                <MiniMetric label="脂肪" value={`${energy.macros.fat} g`} />
                <MiniMetric label="碳水" value={`${energy.macros.carbs} g`} />
                <MiniMetric label="纤维" value={`${energy.macros.fiber} g`} />
              </div>
            )}
            {energy.macros?.caloriesTooLow && (
              <p className="mt-3 rounded-md bg-warn-soft px-3 py-2 text-[12px] leading-relaxed text-warn">
                热量目标已低于蛋白和脂肪底线所需的约 {energy.macros.minCaloriesForProteinAndFat} kcal。
                应降低减脂速度，而不是继续压碳水。
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <Link
                href="/nutrition"
                className="press flex h-11 flex-1 items-center justify-center rounded-xl bg-accent text-[13px] font-semibold text-accent-fg"
              >
                记录饮食
              </Link>
              <Link
                href="/data"
                className="choice-chip press flex h-11 flex-1 items-center justify-center border border-border bg-surface text-[13px] font-semibold text-fg"
              >
                记录体重 / 腰围
              </Link>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-faint">
              {energy.maintenanceSource === "trend"
                ? "当前预算已由近 21 天摄入和体重趋势校准。"
                : "当前预算由基础公式起算；达到数据量后会自动切换为趋势校准。"}
            </p>
          </section>

          <section className="mt-5 control-card p-3">
            <SectionTitle
              title="减脂训练覆盖"
              sub="保留动作选择与强度练习，优先缩减计划组数而不是删掉动作"
            />
            <div className="mt-3 flex items-end justify-between control-strip rounded-xl px-3 py-3">
              <div>
                <p className="text-[12px] font-medium text-fg">模板计划容量</p>
                <p className="mt-0.5 text-[10px] text-faint">
                  开启减脂模式后，套用模板时临时生效；原模板不改。
                </p>
              </div>
              <p className="tnum text-[24px] font-bold text-fg">
                {Math.round(volumeScale * 100)}
                <span className="text-[12px] font-medium text-faint">%</span>
              </p>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCutPlan({ trainingVolumeScale: 0.8 })}
                className={
                  "choice-chip press border px-2 py-2 text-[12px] " +
                  (Math.abs(volumeScale - 0.8) < 0.01
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-border bg-surface-2 text-muted")
                }
              >
                常规 80%
              </button>
              <button
                type="button"
                onClick={() => setCutPlan({ trainingVolumeScale: 0.7 })}
                className={
                  "choice-chip press border px-2 py-2 text-[12px] " +
                  (Math.abs(volumeScale - 0.7) < 0.01
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-border bg-surface-2 text-muted")
                }
              >
                恢复优先 70%
              </button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-faint">
              4 组动作通常变为 3 组，3 组变为 2 组，2 组不再继续削减。已记录训练绝不会被自动改动。
            </p>
            <Link
              href="/train"
              className="press mt-3 flex h-11 items-center justify-center rounded-xl bg-fg text-[13px] font-semibold text-bg"
            >
              进入训练
            </Link>
          </section>

          <section className="mt-5 control-card p-3">
            <SectionTitle
              title="活动与训练记录"
              sub="记录活动量与心肺强度，不输入也不展示不可靠的“运动可吃热量”"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <MiniMetric
                label="今日力量训练"
                value={setCount > 0 ? `${setCount} 组` : "未记录"}
                accent={setCount > 0}
              />
              <MiniMetric
                label="今日有氧"
                value={cardioToday > 0 ? `${cardioToday} 分钟` : "未记录"}
                accent={cardioToday > 0}
              />
            </div>
            <div className="mt-3 control-strip rounded-xl px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[12px] font-medium text-fg">本周有氧执行</p>
                <p className="tnum text-[17px] font-bold text-fg">
                  {cardioWeek.totalMinutes} <span className="text-[11px] font-medium text-faint">/ {cardioGoal} 分钟</span>
                </p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(cardioWeek.progress * 100)}%` }} />
              </div>
              <p className="tnum mt-2 text-[11px] text-muted">
                {cardioWeek.activeDays} 天活动 · Z2 {cardioWeek.zoneMinutes[2]} · Z3 {cardioWeek.zoneMinutes[3]} · Z4–5 {cardioWeek.zoneMinutes[4] + cardioWeek.zoneMinutes[5]} 分钟
              </p>
            </div>
            <div className="mt-3">
              <p className="mb-1.5 text-[11px] font-medium text-faint">每周有氧目标</p>
              <div className="grid grid-cols-4 gap-2">
                {[90, 120, 150, 180].map((value) => (
                  <button key={value} type="button" onClick={() => setCutPlan({ weeklyCardioMinutes: value })} className={"choice-chip press h-9 border text-[12px] font-semibold " + (cardioGoal === value ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface-2 text-muted")}>{value}</button>
                ))}
              </div>
            </div>
            <Link
              href="/cardio"
              className="choice-chip press mt-3 flex h-11 items-center justify-center border border-border bg-surface text-[13px] font-semibold text-fg"
            >
              记录有氧活动
            </Link>
            <p className="mt-2 text-[10px] leading-relaxed text-faint">
              力量训练由训练页自动记录；有氧只记录方式、时长与区间。二者会在训练和趋势复盘中解释体重变化，但不直接改变今天的食物预算。
            </p>
          </section>

          <section className="mt-5 control-card px-3 py-3">
            <p className="text-[12px] font-semibold text-fg">周度复盘与校准</p>
            {energy.calibration.ready ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <MiniMetric
                  label="当前趋势"
                  value={signedKg(energy.calibration.weeklyTrendKg)}
                  accent
                />
                <MiniMetric
                  label="计划速度"
                  value={
                    targetWeeklyKg != null
                      ? `${targetWeeklyKg.toFixed(2)} kg / 周`
                      : "—"
                  }
                />
              </div>
            ) : null}
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              {energy.calibration.ready
                ? `近 ${energy.calibration.periodDays} 天已用摄入与平滑体重校准维持热量。连续两周明显偏离计划速度时，再调整热量或减脂速度。`
                : `当前先用公式预算。近 ${energy.calibration.periodDays} 天达到至少 ${energy.calibration.intakeDays}/14 天饮食和 ${energy.calibration.weightDays}/8 条体重后，会自动切换到趋势校准。`}
            </p>
          </section>
        </>
      )}
    </div>
  );
}

function SetupCard({
  sex,
  height,
  birthYear,
  weight,
  onSex,
  onHeight,
  onBirthYear,
}: {
  sex: "male" | "female" | undefined;
  height: number;
  birthYear: number;
  weight: number | undefined;
  onSex: (v: "male" | "female") => void;
  onHeight: (v: number) => void;
  onBirthYear: (v: number) => void;
}) {
  return (
    <section className="control-card p-3">
      <p className="text-[13px] font-semibold text-fg">先补齐计划参数</p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">
        减脂模式至少需要最近体重、生理性别、身高和出生年份。体脂目标还需要腰围记录。
      </p>
      {!weight && (
        <Link
          href="/data"
          className="press mt-3 flex h-10 items-center justify-center rounded-xl bg-accent text-[13px] font-semibold text-accent-fg"
        >
          先记录体重
        </Link>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onSex("male")}
          className={
            "choice-chip press border py-2 text-[13px] " +
            (sex === "male"
              ? "border-accent bg-accent-soft text-accent"
              : "border-border bg-surface-2 text-fg")
          }
        >
          男性
        </button>
        <button
          type="button"
          onClick={() => onSex("female")}
          className={
            "choice-chip press border py-2 text-[13px] " +
            (sex === "female"
              ? "border-accent bg-accent-soft text-accent"
              : "border-border bg-surface-2 text-fg")
          }
        >
          女性
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <MetricInput label="身高" unit="cm" value={height} placeholder="183" onChange={onHeight} />
        <MetricInput
          label="出生年份"
          unit="年"
          value={birthYear}
          placeholder="2003"
          onChange={onBirthYear}
        />
      </div>
    </section>
  );
}

function SectionTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">{title}</h2>
      <p className="mt-0.5 text-[11px] leading-relaxed text-faint">{sub}</p>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  accent,
  tone,
}: {
  label: string;
  value: string;
  accent?: boolean;
  tone?: "warn";
}) {
  return (
    <div className="control-strip rounded-xl px-2.5 py-2">
      <p className="text-[10px] text-faint">{label}</p>
      <p
        className={
          "tnum mt-0.5 text-[13px] font-semibold " +
          (tone === "warn" ? "text-warn" : accent ? "text-accent" : "text-fg")
        }
      >
        {value}
      </p>
    </div>
  );
}

function MetricInput({
  label,
  unit,
  value,
  placeholder,
  decimal,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  placeholder: string;
  decimal?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="control-strip rounded-xl px-2.5 py-2">
      <span className="text-[10px] text-faint">{label}</span>
      <div className="mt-0.5 flex items-center gap-1">
        <NumberField
          value={value}
          onChange={onChange}
          ariaLabel={label}
          placeholder={placeholder}
          allowDecimal={decimal}
          className="tnum h-7 min-w-0 flex-1 bg-transparent text-[16px] font-bold text-fg outline-none"
        />
        <span className="shrink-0 text-[10px] text-faint">{unit}</span>
      </div>
    </label>
  );
}

function Loading() {
  return (
    <div className="pt-2">
      <div className="h-7 w-32 rounded bg-surface-2" />
      <div className="mt-4 h-48 rounded-lg bg-surface-2" />
      <div className="mt-4 h-48 rounded-lg bg-surface-2" />
    </div>
  );
}
