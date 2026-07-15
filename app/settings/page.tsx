"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { maxHR, methodNote } from "@/lib/hr";
import { LEVELS, weeklyTarget, MUSCLE_LABELS, EQUIPMENT_LABELS } from "@/lib/muscles";
import NumberField from "@/components/NumberField";
import CustomExerciseEditor from "@/components/CustomExerciseEditor";
import { useI18n, LOCALE_LABELS, type Locale } from "@/lib/i18n";
import DataManagement from "@/components/DataManagement";
import DataManagementLocaleBridge from "@/components/DataManagementLocaleBridge";
import pkg from "../../package.json";

export default function SettingsPage() {
  const { tr } = useI18n();
  const { data } = useStore();
  const [editId, setEditId] = useState<string | null>(null);

  return (
    <div>
      <header className="mb-4">
        <Link href="/" className="press mb-1 flex items-center gap-1 text-[13px] font-medium text-muted">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 6L9 12L15 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {tr("今天")}
        </Link>
        <div className="control-card p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">SETTINGS</p>
          <h1 className="mt-1 text-[22px] font-bold tracking-tight text-fg">{tr("设置")}</h1>
          <p className="mt-0.5 text-[12px] text-faint">{tr("偏好 · 数据 · 备份")}</p>
        </div>
      </header>

      <LanguageSection />
      <ProfileSection />
      <TrainingLevelSection />

      {data.customExercises.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">{tr("自定义动作")}</h2>
          <div className="control-card overflow-hidden">
            {data.customExercises.map((exercise) => (
              <div key={exercise.id} className="soft-divider border-t px-3 py-2.5 first:border-t-0">
                {editId === exercise.id ? <CustomExerciseEditor preset={exercise} onClose={() => setEditId(null)} /> : (
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[14px] text-fg">{tr(exercise.name)}</span>
                    {exercise.primaryMuscle ? (
                      <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">{tr(MUSCLE_LABELS[exercise.primaryMuscle])}{exercise.equipment ? ` · ${tr(EQUIPMENT_LABELS[exercise.equipment])}` : ""}</span>
                    ) : <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-faint">{tr("未分类")}</span>}
                    <button type="button" onClick={() => setEditId(exercise.id)} aria-label={`${tr("编辑")}${tr(exercise.name)}`} className="press grid h-9 w-9 place-items-center text-faint hover:text-accent">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 6L18 10M4 20L4.5 16.5L15 6L18 9L7.5 19.5L4 20Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-faint">{tr("点铅笔可改名 / 改部位 / 改器械或删除。删除后历史记录仍保留，只是不再出现在选择器。")}</p>
        </section>
      )}

      <div data-data-management>
        <DataManagement />
        <DataManagementLocaleBridge />
      </div>
      <p className="mb-2 mt-6 text-center text-[11px] tracking-wide text-faint">FitLog v{pkg.version}</p>
    </div>
  );
}

function ProfileSection() {
  const { tr, locale } = useI18n();
  const { data, setProfile } = useStore();
  const profile = data.profile;
  const calculated = maxHR(profile);

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">{tr("身体数据")}</h2>
      <div className="control-card p-3">
        <div className="grid grid-cols-2 gap-2">
          <ProfileField label={tr("身高")} placeholder="cm" value={profile?.heightCm ?? 0} onChange={(heightCm) => setProfile({ heightCm })} />
          <div className="flex flex-col">
            <span className="mb-1 text-[11px] font-medium text-faint">{tr("生理性别")}</span>
            <div className="control-strip grid h-11 grid-cols-2 gap-1 rounded-xl p-1" role="group" aria-label={tr("生理性别")}>
              {(["male", "female"] as const).map((sex) => {
                const selected = profile?.sex === sex;
                return <button key={sex} type="button" onClick={() => setProfile({ sex })} aria-pressed={selected} className={`choice-chip press rounded-lg border text-[12px] font-semibold transition-colors ${selected ? "border-accent bg-accent-soft text-accent shadow-sm" : "border-transparent bg-transparent text-faint"}`}>{tr(sex === "male" ? "男性" : "女性")}</button>;
              })}
            </div>
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-faint">{tr("身高、生理性别与出生年份用于腰围 RFM 体脂和减脂能量估算，不影响训练建议。")}</p>
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          <ProfileField label={tr("出生年份")} placeholder={tr("如 2003")} value={profile?.birthYear ?? 0} onChange={(birthYear) => setProfile({ birthYear })} />
          <ProfileField label={tr("静息心率")} placeholder="bpm" value={profile?.restingHR ?? 0} onChange={(restingHR) => setProfile({ restingHR })} />
          <ProfileField label={tr("最大心率")} placeholder={tr("选填")} value={profile?.maxHR ?? 0} onChange={(maxHR) => setProfile({ maxHR })} />
        </div>
        <div className="control-strip mt-2.5 flex items-center justify-between rounded-xl px-3 py-2">
          <span className="text-[12px] text-muted">{tr("推算最大心率")}</span>
          <span className="tnum text-[14px] font-semibold text-fg">{calculated ? `${calculated.bpm} bpm` : "—"}</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-faint">{methodNote(profile, tr)}{locale === "en" ? ". " : "。"}{tr("全部可选 —— 不填也能用谈话测试估区间；填了越多，心率区间越贴你。静息心率：早晨醒来别动，数 1 分钟脉搏。")}</p>
      </div>
    </section>
  );
}

function ProfileField({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: number; onChange: (value: number) => void }) {
  return <label className="flex flex-col"><span className="mb-1 text-[11px] font-medium text-faint">{label}</span><NumberField value={value} onChange={onChange} ariaLabel={label} placeholder={placeholder} allowDecimal={false} className="number-cell tnum h-11 w-full rounded-xl border border-border bg-surface-2 px-2 text-center text-[16px] font-semibold text-fg outline-none focus:border-accent" /></label>;
}

function TrainingLevelSection() {
  const { tr } = useI18n();
  const { data, setProfile } = useStore();
  const level = data.profile?.trainingLevel;
  const target = level ? weeklyTarget(level) : null;
  const current = LEVELS.find((item) => item.value === level);
  return <section className="mb-6">
    <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">{tr("训练水平")}</h2>
    <div className="control-card p-3">
      <div className="grid grid-cols-3 gap-2">
        {LEVELS.map((item) => {
          const selected = level === item.value;
          return <button type="button" key={item.value} onClick={() => setProfile({ trainingLevel: item.value })} className={`choice-chip press border px-2 py-2.5 text-center ${selected ? "border-accent bg-accent-soft" : "border-border bg-surface-2"}`}><p className={`text-[14px] font-bold ${selected ? "text-accent" : "text-fg"}`}>{tr(item.label)}</p><p className="mt-0.5 text-[10px] text-faint">{tr(item.years)}</p></button>;
        })}
      </div>
      {target && current ? <div className="control-strip mt-2.5 rounded-xl px-3 py-2.5"><p className="tnum text-[13px] text-fg">{tr("每周每肌群目标")} <b className="text-accent">{target.low}–{target.high}</b> {tr("组")}</p><p className="mt-0.5 text-[11px] text-muted">{tr(current.blurb)}</p></div> : <p className="mt-2.5 text-[12px] text-muted">{tr("选择训练水平，系统给出适合你的每周容量目标（新手不必硬上大容量）。")}</p>}
      <p className="mt-2 text-[11px] leading-relaxed text-faint">{tr("小肌群（二头/三头/小腿）通常还会从复合动作获得额外间接容量。区间为参考，按恢复情况自行增减。")}</p>
    </div>
  </section>;
}

function LanguageSection() {
  const { locale, setLocale, tr } = useI18n();
  const locales: Locale[] = ["zh", "ja", "en"];
  return <section className="mb-6"><h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">{tr("语言")} · Language</h2><div className="control-card p-3"><div className="grid grid-cols-3 gap-2">{locales.map((item) => { const selected = locale === item; return <button type="button" key={item} onClick={() => setLocale(item)} className={`choice-chip press border px-2 py-2.5 text-center text-[13px] font-bold ${selected ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface-2 text-fg"}`}>{LOCALE_LABELS[item]}</button>; })}</div></div></section>;
}
