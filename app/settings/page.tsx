"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUIMode, type UIMode } from "@/lib/uiMode";
import { pulseHapticsEnabled, pulseSoundEnabled, setPulseHapticsEnabled, setPulseSoundEnabled } from "@/lib/feedback";
import { useStore } from "@/lib/store";
import { maxHR, methodNote } from "@/lib/hr";
import { LEVELS, weeklyTarget, MUSCLE_LABELS, EQUIPMENT_LABELS } from "@/lib/muscles";
import NumberField from "@/components/NumberField";
import CustomExerciseEditor from "@/components/CustomExerciseEditor";
import { useI18n, LOCALE_LABELS, type Locale } from "@/lib/i18n";
import DataManagement from "@/components/DataManagement";
import pkg from "../../package.json";

export default function SettingsPage() {
  const { tr } = useI18n();
  const { mode, setMode, loaded } = useUIMode();
  const { data } = useStore();
  const [editId, setEditId] = useState<string | null>(null);
  const [pulseSound, setPulseSound] = useState(true);
  const [pulseHaptics, setPulseHaptics] = useState(true);

  useEffect(() => {
    setPulseSound(pulseSoundEnabled());
    setPulseHaptics(pulseHapticsEnabled());
  }, []);

  if (!loaded) {
    return (
      <div className="pt-2">
        <div className="h-7 w-32 rounded bg-surface-2" />
        <div className="mt-4 h-32 rounded-lg bg-surface-2" />
      </div>
    );
  }

  return (
    <div>
      <header className="mb-4">
        <Link
          href="/"
          className="press mb-1 flex items-center gap-1 text-[13px] font-medium text-muted"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M15 6L9 12L15 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {tr("今天")}
        </Link>
        <div className="control-card p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">
            SETTINGS
          </p>
          <h1 className="mt-1 text-[22px] font-bold tracking-tight text-fg">{tr("设置")}</h1>
          <p className="mt-0.5 text-[12px] text-faint">{tr("偏好 · 数据 · 备份")}</p>
        </div>
      </header>

      {/* —— 界面与反馈 —— */}
      <section className="mb-6">
        <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
          {tr("界面模式")}
        </h2>
        <div className="control-card p-3">
          <div className="grid grid-cols-2 gap-2">
            <ModeOption
              label="PERSONA LITE"
              sublabel="LITE · DEFAULT"
              hint={tr("轻量训练房节奏")}
              active={mode === "lite"}
              onClick={() => setMode("lite")}
              accentTitle
            />
            <ModeOption
              label="PULSE MODE"
              sublabel="PULSE"
              hint={tr("高对比动态界面与反馈")}
              active={mode === "pulse"}
              onClick={() => setMode("pulse")}
              accentTitle
            />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-faint">
            {tr("Lite 为默认界面。Pulse 只改变视觉、音效与触感，不改变任何记录或计算。")}
          </p>
        </div>

        {mode === "pulse" && (
          <div className="control-card mt-2 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold text-fg">PULSE FEEDBACK</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-faint">使用原创合成点击音；不含任何第三方游戏音效。iPhone Safari 通常不支持网页震动，因此触感会在支持的设备上生效。</p>
              </div>
              <span className="rounded-full bg-accent-soft px-2 py-1 text-[10px] font-bold text-accent">ON DEVICE</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <FeedbackToggle
                label="交互音效"
                enabled={pulseSound}
                onChange={(enabled) => { setPulseSound(enabled); setPulseSoundEnabled(enabled); }}
              />
              <FeedbackToggle
                label="触感反馈"
                enabled={pulseHaptics}
                onChange={(enabled) => { setPulseHaptics(enabled); setPulseHapticsEnabled(enabled); }}
              />
            </div>
          </div>
        )}
      </section>

      {/* —— 语言 —— */}
      <LanguageSection />

      {/* —— 身体数据（用于心率区间与 RFM 体脂估算） —— */}
      <ProfileSection />

      {/* —— 训练水平（→ 每周容量目标） —— */}
      <TrainingLevelSection />

      {/* —— 自定义动作管理 —— */}
      {data.customExercises.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
            {tr("自定义动作")}
          </h2>
          <div className="control-card overflow-hidden">
            {data.customExercises.map((c) => (
              <div
                key={c.id}
                className="soft-divider border-t px-3 py-2.5 first:border-t-0"
              >
                {editId === c.id ? (
                  <CustomExerciseEditor preset={c} onClose={() => setEditId(null)} />
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[14px] text-fg">
                      {tr(c.name)}
                    </span>
                    {c.primaryMuscle ? (
                      <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">
                        {tr(MUSCLE_LABELS[c.primaryMuscle])}
                        {c.equipment ? ` · ${tr(EQUIPMENT_LABELS[c.equipment])}` : ""}
                      </span>
                    ) : (
                      <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-faint">
                        {tr("未分类")}
                      </span>
                    )}
                    <button
                      onClick={() => setEditId(c.id)}
                      aria-label={tr("编辑")}
                      className="press grid h-9 w-9 place-items-center text-faint hover:text-accent"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M14 6L18 10M4 20L4.5 16.5L15 6L18 9L7.5 19.5L4 20Z"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-faint">
            {tr("点铅笔可改名 / 改部位 / 改器械或删除。删除后历史记录仍保留，只是不再出现在选择器。")}
          </p>
        </section>
      )}

      {/* —— 数据管理 —— */}
      <DataManagement />

      <p className="mt-6 mb-2 text-center text-[11px] tracking-wide text-faint">
        FitLog v{pkg.version}
      </p>
    </div>
  );
}

function ProfileSection() {
  const { tr } = useI18n();
  const { data, setProfile } = useStore();
  const p = data.profile;
  const m = maxHR(p);

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
        {tr("身体数据")}
      </h2>
      <div className="control-card p-3">
        <div className="grid grid-cols-2 gap-2">
          <ProfileField
            label={tr("身高")}
            placeholder="cm"
            value={p?.heightCm ?? 0}
            onChange={(n) => setProfile({ heightCm: n })}
          />
          <div className="flex flex-col">
            <span className="mb-1 text-[11px] font-medium text-faint">{tr("生理性别")}</span>
            <div className="control-strip grid h-11 grid-cols-2 gap-1 rounded-xl p-1">
              {(["male", "female"] as const).map((sex) => {
                const active = p?.sex === sex;
                return (
                  <button
                    key={sex}
                    type="button"
                    onClick={() => setProfile({ sex })}
                    className={
                      "choice-chip press text-[12px] font-semibold " +
                      (active ? "bg-surface text-accent shadow-sm" : "text-faint")
                    }
                    aria-pressed={active}
                  >
                    {tr(sex === "male" ? "男性" : "女性")}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          {tr("身高、生理性别与出生年份用于腰围 RFM 体脂和减脂能量估算，不影响训练建议。")}
        </p>

        <div className="mt-2.5 grid grid-cols-3 gap-2">
          <ProfileField
            label={tr("出生年份")}
            placeholder={tr("如 2003")}
            value={p?.birthYear ?? 0}
            onChange={(n) => setProfile({ birthYear: n })}
          />
          <ProfileField
            label={tr("静息心率")}
            placeholder="bpm"
            value={p?.restingHR ?? 0}
            onChange={(n) => setProfile({ restingHR: n })}
          />
          <ProfileField
            label={tr("最大心率")}
            placeholder={tr("选填")}
            value={p?.maxHR ?? 0}
            onChange={(n) => setProfile({ maxHR: n })}
          />
        </div>

        <div className="control-strip mt-2.5 flex items-center justify-between rounded-xl px-3 py-2">
          <span className="text-[12px] text-muted">{tr("推算最大心率")}</span>
          <span className="tnum text-[14px] font-semibold text-fg">
            {m ? `${m.bpm} bpm` : "—"}
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          {methodNote(p, tr)}。{tr("全部可选 —— 不填也能用谈话测试估区间；填了越多，心率区间越贴你。静息心率：早晨醒来别动，数 1 分钟脉搏。")}
        </p>
      </div>
    </section>
  );
}

function ProfileField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex flex-col">
      <span className="mb-1 text-[11px] font-medium text-faint">{label}</span>
      <NumberField
        value={value}
        onChange={onChange}
        ariaLabel={label}
        placeholder={placeholder}
        allowDecimal={false}
        className="number-cell tnum h-11 w-full rounded-xl border border-border bg-surface-2 px-2 text-center text-[16px] font-semibold text-fg outline-none focus:border-accent"
      />
    </label>
  );
}

function TrainingLevelSection() {
  const { tr } = useI18n();
  const { data, setProfile } = useStore();
  const level = data.profile?.trainingLevel;
  const target = level ? weeklyTarget(level) : null;
  const cur = LEVELS.find((l) => l.value === level);

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
        {tr("训练水平")}
      </h2>
      <div className="control-card p-3">
        <div className="grid grid-cols-3 gap-2">
          {LEVELS.map((l) => {
            const active = level === l.value;
            return (
              <button
                key={l.value}
                onClick={() => setProfile({ trainingLevel: l.value })}
                className={
                  "choice-chip press border px-2 py-2.5 text-center " +
                  (active
                    ? "border-accent bg-accent-soft"
                    : "border-border bg-surface-2")
                }
              >
                <p
                  className={
                    "text-[14px] font-bold " +
                    (active ? "text-accent" : "text-fg")
                  }
                >
                  {tr(l.label)}
                </p>
                <p className="mt-0.5 text-[10px] text-faint">{tr(l.years)}</p>
              </button>
            );
          })}
        </div>

        {target && cur ? (
          <div className="control-strip mt-2.5 rounded-xl px-3 py-2.5">
            <p className="tnum text-[13px] text-fg">
              {tr("每周每肌群目标")}{" "}
              <b className="text-accent">
                {target.low}–{target.high}
              </b>{" "}
              {tr("组")}
            </p>
            <p className="mt-0.5 text-[11px] text-muted">{tr(cur.blurb)}</p>
          </div>
        ) : (
          <p className="mt-2.5 text-[12px] text-muted">
            {tr("选择训练水平，系统给出适合你的每周容量目标（新手不必硬上大容量）。")}
          </p>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          {tr("小肌群（二头/三头/小腿）通常还会从复合动作获得额外间接容量。区间为参考，按恢复情况自行增减。")}
        </p>
      </div>
    </section>
  );
}

function ModeOption({
  label,
  sublabel,
  hint,
  active,
  onClick,
  accentTitle,
}: {
  label: string;
  sublabel: string;
  hint: string;
  active: boolean;
  onClick: () => void;
  accentTitle?: boolean;
}) {
  const { tr } = useI18n();
  return (
    <button
      onClick={onClick}
      className={
        "choice-chip press border px-3 py-3 text-left " +
        (active
          ? "border-accent bg-accent-soft"
          : "border-border bg-surface-2")
      }
    >
      <p
        className={
          "text-[13px] font-bold " +
          (active
            ? "text-accent"
            : accentTitle
            ? "text-fg"
            : "text-fg")
        }
      >
        {label}
      </p>
      <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-faint">
        {sublabel}
      </p>
      <p className="mt-1 text-[11px] text-muted">{hint}</p>
      {active && (
        <p className="mt-1 text-[10px] font-semibold text-accent">{tr("已启用")}</p>
      )}
    </button>
  );
}

function LanguageSection() {
  const { locale, setLocale, tr } = useI18n();
  const LOCALES: Locale[] = ["zh", "ja", "en"];
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
        {tr("语言")} · Language
      </h2>
      <div className="control-card p-3">
        <div className="grid grid-cols-3 gap-2">
          {LOCALES.map((l) => {
            const active = locale === l;
            return (
              <button
                key={l}
                onClick={() => setLocale(l)}
                className={
                  "choice-chip press border px-2 py-2.5 text-center text-[13px] font-bold " +
                  (active
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-border bg-surface-2 text-fg")
                }
              >
                {LOCALE_LABELS[l]}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FeedbackToggle({ label, enabled, onChange }: { label: string; enabled: boolean; onChange: (enabled: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      aria-pressed={enabled}
      className={"choice-chip press flex items-center justify-between border px-3 py-2.5 text-left " + (enabled ? "border-accent bg-accent-soft" : "border-border bg-surface-2")}
    >
      <span className={"text-[12px] font-semibold " + (enabled ? "text-accent" : "text-fg")}>{label}</span>
      <span className={"relative h-5 w-9 rounded-full transition-colors " + (enabled ? "bg-accent" : "bg-border-strong")}>
        <span className={"absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow-sm transition-transform " + (enabled ? "translate-x-4.5" : "translate-x-0.5")} />
      </span>
    </button>
  );
}
