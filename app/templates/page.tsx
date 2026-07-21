"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import { DEFAULT_EXERCISES, searchExercisePreset } from "@/lib/exercises";
import { defaultTrackId, inferIntent, intentLabel, performanceModeFor, prescriptionForPreset, prescriptionFromTemplateItem } from "@/lib/prescription";
import {
  TEMPLATE_TYPES,
  TYPE_LABEL,
  MAX_TEMPLATES_PER_TYPE,
  formatReps,
} from "@/lib/templates";
import CustomExerciseEditor, { isCustomExercise } from "@/components/CustomExerciseEditor";
import {
  EQUIPMENT_LABELS,
  MUSCLE_LABELS,
  MUSCLE_ORDER,
  type Equipment,
  type MuscleGroup,
} from "@/lib/muscles";
import type { ExercisePreset, RecordMode, Template, TemplateItem } from "@/lib/types";

const EQUIP_ORDER: Equipment[] = ["machine", "cable", "free", "bodyweight"];
type CustomRecordKind = "weightReps" | "reps" | "duration" | "distance";
const CUSTOM_RECORD_MODES: Record<CustomRecordKind, RecordMode[]> = { weightReps: ["weight", "reps"], reps: ["reps"], duration: ["duration"], distance: ["distance"] };

type Tr = (s: string, vars?: Record<string, string | number>) => string;

function templateItemMode(item: TemplateItem) {
  const preset = DEFAULT_EXERCISES.find((candidate) => candidate.id === item.exerciseId);
  return item.prescription?.performanceMode ?? performanceModeFor(item.recordModes ?? preset?.recordModes);
}

function targetUnit(item: TemplateItem, tr: Tr) {
  const mode = templateItemMode(item);
  return mode === "duration" ? tr("秒") : mode === "distance" ? "m" : tr("次");
}

function targetLimits(item: TemplateItem) {
  const mode = templateItemMode(item);
  if (mode === "duration") return { min: 5, max: 600, step: 5 };
  if (mode === "distance") return { min: 1, max: 1000, step: 5 };
  return { min: 1, max: 40, step: 1 };
}

/** 单个模板 → 纯文字（无 RPE、无署名，跟随语言） */
function templateToText(tpl: Template, tr: Tr): string {
  const head = `${tpl.name.trim() || tr("未命名模板")} · ${tr(TYPE_LABEL[tpl.type as "push" | "pull" | "legs"])}`;
  const lines = tpl.items.map(
    (it, i) => {
      return `${i + 1}. ${tr(it.name)}  ${it.sets} × ${formatReps(it.repsLow, it.repsHigh)} ${targetUnit(it, tr)}`;
    }
  );
  return [head, ...lines].join("\n");
}

/** 全部模板 → 纯文字（按出现顺序，跳过空模板，空行分隔） */
function allTemplatesToText(list: Template[], tr: Tr): string {
  return list
    .filter((t) => t.items.length > 0)
    .map((t) => templateToText(t, tr))
    .join("\n\n");
}

/** 复制到剪贴板，失败兜底为手动选择 */
async function copyText(
  text: string,
  onOk: () => void,
  onFail: () => void
): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    onOk();
    return;
  } catch {
    /* 继续兜底 */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    onOk();
  } catch {
    onFail();
  }
}

export default function TemplatesPage() {
  const { tr } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const { data, loaded } = useStore();
  const [openId, setOpenId] = useState<string | null>(null);

  // 自动保存反馈：模板数据一变就短暂亮"已保存"，1.5s 淡出
  const [showSaved, setShowSaved] = useState(false);
  const tplRef = useRef<typeof data.templates>(undefined);
  const initedRef = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!loaded) return;
    if (!initedRef.current) {
      initedRef.current = true;
      tplRef.current = data.templates;
      return;
    }
    if (data.templates !== tplRef.current) {
      tplRef.current = data.templates;
      setShowSaved(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setShowSaved(false), 1500);
    }
  }, [data.templates, loaded]);

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  if (!loaded) {
    return (
      <div className="pt-2">
        <div className="h-7 w-32 rounded bg-surface-2" />
        <div className="mt-4 h-44 rounded-lg bg-surface-2" />
      </div>
    );
  }

  const all = data.templates ?? [];

  return (
    <div>
      <header className="mb-4">
        <Link
          href="/schedule"
          className="press mb-1 flex items-center gap-1 text-[13px] font-medium text-muted"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M15 6L9 12L15 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {tr("计划")}
        </Link>
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-[22px] font-bold tracking-tight text-fg">{tr("训练模板")}</h1>
          <span
            className={
              "flex shrink-0 items-center gap-1 text-[12px] font-medium text-accent transition-opacity duration-300 " +
              (showSaved ? "opacity-100" : "opacity-0")
            }
            aria-hidden={!showSaved}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M5 13L9 17L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {tr("已保存")}
          </span>
        </div>
        <p className="mt-0.5 text-[12px] text-faint">
          {tr("每类型可建多个模板（最多 5 个），自由命名；存组数×次数不存重量")}
        </p>
      </header>

      <div className="space-y-5">
        {TEMPLATE_TYPES.map((type) => (
          <TypeSection
            key={type}
            type={type as "push" | "pull" | "legs"}
            templates={all.filter((t) => t.type === type)}
            openId={openId}
            setOpenId={setOpenId}
          />
        ))}
      </div>

      {all.length > 0 && (
        <button type="button"
          onClick={() =>
            copyText(
              allTemplatesToText(all, tr),
              () => toast.show(tr("已复制")),
              () => toast.show(tr("复制失败，请手动选择"))
            )
          }
          className="press mt-5 flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface text-[14px] font-medium text-fg"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.7" />
            <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {tr("复制全部计划")}
        </button>
      )}

      <button type="button"
        onClick={() => router.push("/schedule")}
        className="press mt-3 flex h-11 w-full items-center justify-center rounded-lg bg-accent text-[15px] font-semibold text-accent-fg"
      >
        {tr("完成")}
      </button>
    </div>
  );
}

// ============================================================
// 类型分组：标题 + 该类型的模板列表 + 新建按钮（上限 5）
// ============================================================
function TypeSection({
  type,
  templates,
  openId,
  setOpenId,
}: {
  type: "push" | "pull" | "legs";
  templates: Template[];
  openId: string | null;
  setOpenId: (id: string | null) => void;
}) {
  const { tr } = useI18n();
  const { createTemplate } = useStore();
  const full = templates.length >= MAX_TEMPLATES_PER_TYPE;

  function add() {
    const name = `${tr(TYPE_LABEL[type])} ${templates.length + 1}`;
    const id = createTemplate(type, name);
    if (id) setOpenId(id);
  }

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between px-0.5">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted">
          {tr(TYPE_LABEL[type])}
        </h2>
        <span className="tnum text-[11px] text-faint">
          {templates.length}/{MAX_TEMPLATES_PER_TYPE}
        </span>
      </div>

      <div className="space-y-2">
        {templates.map((tpl, index) => (
          <TemplateCard
            key={tpl.id}
            tpl={tpl}
            open={openId === tpl.id}
            onToggle={() => setOpenId(openId === tpl.id ? null : tpl.id)}
            canMoveUp={index > 0}
            canMoveDown={index < templates.length - 1}
          />
        ))}

        <button type="button"
          onClick={add}
          disabled={full}
          className={
            "press flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed text-[13px] font-medium " +
            (full
              ? "border-border text-faint opacity-50"
              : "border-border-strong text-muted active:bg-surface-2")
          }
        >
          {!full && (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
          {full ? tr("已达上限 5 个") : tr("新建模板")}
        </button>
      </div>
    </section>
  );
}

// ============================================================
// 单个模板卡：折叠看名字/概览；展开改名 + 编辑动作 + 删除
// ============================================================
function TemplateCard({
  tpl,
  open,
  onToggle,
  canMoveUp,
  canMoveDown,
}: {
  tpl: Template;
  open: boolean;
  onToggle: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const { tr } = useI18n();
  const toast = useToast();
  const { data, setTemplateItems, renameTemplate, duplicateTemplate, moveTemplate, deleteTemplate } = useStore();
  const items = tpl.items;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  function update(idx: number, patch: Partial<TemplateItem>) {
    const changesTrack = patch.sets != null || patch.repsLow != null || patch.repsHigh != null || patch.trainingIntent != null;
    const changesEffort = Object.prototype.hasOwnProperty.call(patch, "rpe");
    setTemplateItems(tpl.id, items.map((item, index) => {
      if (index !== idx) return item;
      const preset = [...DEFAULT_EXERCISES, ...data.customExercises].find((candidate) => candidate.id === item.exerciseId);
      const currentPrescription = prescriptionFromTemplateItem(item, preset);
      const currentSharedId = defaultTrackId(item.exerciseId, currentPrescription.trainingIntent, item.repsLow, item.repsHigh, item.sets, currentPrescription.performanceMode);
      const wasIndependent = currentPrescription.progressionTrackId !== currentSharedId;
      const next: TemplateItem = {
        ...item,
        ...patch,
        ...(changesTrack ? { prescription: undefined, progressionTrackId: undefined, progressionTrackLabel: undefined } : {}),
        ...(changesEffort ? { prescription: undefined, targetRirMin: undefined, targetRirMax: undefined } : {}),
      };
      if ((changesTrack || changesEffort) && wasIndependent) {
        const nextPrescription = prescriptionFromTemplateItem(next, preset);
        const nextSharedId = defaultTrackId(next.exerciseId, nextPrescription.trainingIntent, next.repsLow, next.repsHigh, next.sets, nextPrescription.performanceMode);
        next.prescription = {
          ...nextPrescription,
          progressionTrackId: `${nextSharedId}-ind-${tpl.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
          progressionTrackLabel: `${nextPrescription.progressionTrackLabel.replace(/\s*·\s*独立$/, "")} · 独立`,
        };
      }
      return next;
    }));
  }
  function remove(idx: number) {
    setTemplateItems(tpl.id, items.filter((_, i) => i !== idx));
  }
  function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[idx], next[j]] = [next[j], next[idx]];
    setTemplateItems(tpl.id, next);
  }
  function add(p: ExercisePreset) {
    if (items.some((it) => it.exerciseId === p.id)) return;
    const prescription = prescriptionForPreset(p, tpl.type);
    setTemplateItems(tpl.id, [
      ...items,
      { exerciseId: p.id, name: p.name, sets: prescription.workingSets, repsLow: prescription.targetRepMin, repsHigh: prescription.targetRepMax, prescription, recordModes: p.recordModes },
    ]);
  }

  function setTrackMode(index: number, mode: "shared" | "independent") {
    const item = items[index];
    const preset = [...DEFAULT_EXERCISES, ...data.customExercises].find((candidate) => candidate.id === item.exerciseId);
    const prescription = prescriptionFromTemplateItem(item, preset);
    const sharedId = defaultTrackId(item.exerciseId, prescription.trainingIntent, item.repsLow, item.repsHigh, item.sets, prescription.performanceMode);
    const sharedLabel = prescription.progressionTrackLabel.replace(/\s*·\s*独立$/, "");
    update(index, {
      progressionTrackId: undefined,
      progressionTrackLabel: undefined,
      prescription: {
        ...prescription,
        progressionTrackId: mode === "shared" ? sharedId : `${sharedId}-ind-${tpl.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
        progressionTrackLabel: mode === "shared" ? sharedLabel : `${sharedLabel} · 独立`,
      },
    });
  }

  const totalSets = items.reduce((s, it) => s + it.sets, 0);
  const pool = [...DEFAULT_EXERCISES, ...data.customExercises];
  const mainCount = items.filter((item) => item.isMain ?? pool.find((preset) => preset.id === item.exerciseId)?.isMain).length;

  return (
    <div className="control-card overflow-hidden">
      <div className="flex items-center gap-2 px-3.5 py-3">
        <button type="button"
          onClick={onToggle}
          className="press flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={open}
        >
          <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-fg">
            {tpl.name.trim() || tr("未命名模板")}
          </span>
          <span className="tnum shrink-0 text-[12px] text-muted">
            {items.length ? tr("{n} 动作 · {m} 组", { n: items.length, m: totalSets }) : tr("空模板")}
          </span>
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            className="shrink-0 text-faint"
            style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}
          >
            <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {(canMoveUp || canMoveDown) && (
          <span className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => moveTemplate(tpl.id, -1)}
              disabled={!canMoveUp}
              aria-label={tr("上移模板")}
              className="press grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-faint disabled:opacity-30"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M6 15L12 9L18 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => moveTemplate(tpl.id, 1)}
              disabled={!canMoveDown}
              aria-label={tr("下移模板")}
              className="press grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-faint disabled:opacity-30"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </span>
        )}
      </div>

      {open && (
        <div className="soft-divider animate-slidedown space-y-2 border-t px-3.5 pb-3.5 pt-3">
          <div className="grid grid-cols-3 gap-2">
            <TemplateFact label="动作" value={`${items.length}`} />
            <TemplateFact label="计划组" value={`${totalSets}`} />
            <TemplateFact label="主项" value={`${mainCount}`} />
          </div>
          {/* 名字 + 删除模板 */}
          <div className="flex items-center gap-2">
            <input
              value={tpl.name}
              aria-label={tr("模板名称")}
              onChange={(e) => renameTemplate(tpl.id, e.target.value)}
              placeholder={tr("模板名称…")}
              className="number-cell h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 text-[15px] font-semibold text-fg outline-none placeholder:font-normal placeholder:text-faint focus:border-accent"
            />
            <button type="button"
              onClick={() => {
                const id = duplicateTemplate(tpl.id);
                if (id) {
                  toast.show(tr("已复制模板"));
                  return;
                }
                toast.show(tr("该类型模板已达上限"));
              }}
              aria-label={tr("复制为新模板")}
              className="press grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-surface text-faint hover:text-accent"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M8 7H6.5C5.7 7 5 7.7 5 8.5V18.5C5 19.3 5.7 20 6.5 20H16.5C17.3 20 18 19.3 18 18.5V17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="8" y="4" width="11" height="11" rx="1.8" stroke="currentColor" strokeWidth="1.7" />
              </svg>
            </button>
            <button type="button"
              onClick={() =>
                copyText(
                  templateToText(tpl, tr),
                  () => toast.show(tr("已复制")),
                  () => toast.show(tr("复制失败，请手动选择"))
                )
              }
              aria-label={tr("复制文字计划")}
              className="press grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-surface text-faint hover:text-accent"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.7" />
                <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {confirmDel ? (
              <button type="button"
                onClick={() => deleteTemplate(tpl.id)}
                className="press h-10 shrink-0 rounded-lg border border-warn/60 bg-warn/10 px-3 text-[13px] font-semibold text-warn"
              >
                {tr("确认删除")}
              </button>
            ) : (
              <button type="button"
                onClick={() => setConfirmDel(true)}
                aria-label={tr("删除模板")}
                className="press grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-surface text-faint hover:text-warn"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>

          {/* 动作清单 */}
          {items.length === 0 && !pickerOpen && (
            <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-[12px] text-faint">
              {tr("还没有动作 —— 点下方按钮按部位添加")}
            </p>
          )}
          {items.map((it, idx) => (
            <div key={it.exerciseId} className="control-strip rounded-xl px-2.5 py-2">
              <div className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-fg">{tr(it.name)}</span>
                <span className="tnum shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                  {templateItemMode(it) === "duration" ? tr("时长") : templateItemMode(it) === "distance" ? tr("距离") : intentLabel(it.prescription?.trainingIntent ?? it.trainingIntent ?? inferIntent(it.repsLow, it.repsHigh))} · {it.repsLow}–{it.repsHigh} {targetUnit(it, tr)}
                </span>
                <button type="button" onClick={() => move(idx, -1)} aria-label={tr("上移")} className={"press grid h-8 w-8 place-items-center " + (idx === 0 ? "text-border" : "text-faint")}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 19V5M6 11L12 5L18 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <button type="button" onClick={() => move(idx, 1)} aria-label={tr("下移")} className={"press grid h-8 w-8 place-items-center " + (idx === items.length - 1 ? "text-border" : "text-faint")}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 5V19M6 13L12 19L18 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <button type="button" onClick={() => remove(idx)} aria-label={tr("移除")} className="press grid h-8 w-8 place-items-center text-faint hover:text-accent">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M6 6L18 18M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                </button>
              </div>

              {/* 组 / 次 / RPE：全步进器，无下拉（消除 iOS 弹出卡顿） */}
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-9 shrink-0 text-[12px] text-faint">{tr("组")}</span>
                  <Stepper label={tr("组数")} value={it.sets} min={1} max={12} onChange={(v) => update(idx, { sets: v })} />
                </div>
                <div>
                  <span className="mb-1 block text-[12px] text-faint">{templateItemMode(it) === "duration" ? tr("时长") : templateItemMode(it) === "distance" ? tr("距离") : tr("次数")}</span>
                  <div className="flex items-center gap-2">
                    <Stepper
                      label={tr("目标下限")}
                      value={it.repsLow}
                      min={targetLimits(it).min}
                      max={targetLimits(it).max}
                      step={targetLimits(it).step}
                      onChange={(low) => update(idx, { repsLow: low, repsHigh: Math.max(low, it.repsHigh) })}
                    />
                    <span className="text-[13px] text-faint">–</span>
                    <Stepper
                      label={tr("目标上限")}
                      value={it.repsHigh}
                      min={targetLimits(it).min}
                      max={targetLimits(it).max}
                      step={targetLimits(it).step}
                      onChange={(high) => update(idx, { repsHigh: high, repsLow: Math.min(it.repsLow, high) })}
                    />
                    <span className="text-[11px] text-faint">{targetUnit(it, tr)}</span>
                  </div>
                </div>
                {templateItemMode(it) === "reps" && <div className="flex items-center gap-2">
                  <span className="w-9 shrink-0 text-[12px] text-faint">RPE</span>
                  {it.rpe == null ? (
                    <button type="button"
                      onClick={() => update(idx, { rpe: 8 })}
                      className="choice-chip press flex h-9 items-center gap-1 border border-border bg-surface px-3 text-[12px] text-muted"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                      </svg>
                      RPE
                    </button>
                  ) : (
                    <>
                      <Stepper label="RPE" value={it.rpe} min={7} max={10} step={0.5} onChange={(v) => update(idx, { rpe: v })} />
                      <button type="button"
                        onClick={() => update(idx, { rpe: undefined })}
                        className="press text-[12px] text-faint"
                      >
                        {tr("清除")}
                      </button>
                    </>
                  )}
                </div>}
                {templateItemMode(it) === "reps" && <div className="flex items-center gap-2">
                  <span className="w-9 shrink-0 text-[12px] text-faint">{tr("加重")}</span>
                  <Stepper label={tr("加重")} value={it.prescription?.loadIncrementKg ?? it.loadIncrementKg ?? 2.5} min={0} max={10} step={0.5} onChange={(v) => update(idx, { loadIncrementKg: v })} />
                  <span className="text-[11px] text-faint">kg</span>
                </div>}
                <div className="flex items-center gap-2">
                  <span className="w-9 shrink-0 text-[12px] text-faint">{tr("轨道")}</span>
                  {(() => {
                    const preset = pool.find((candidate) => candidate.id === it.exerciseId);
                    const prescription = prescriptionFromTemplateItem(it, preset);
                    const sharedId = defaultTrackId(it.exerciseId, prescription.trainingIntent, it.repsLow, it.repsHigh, it.sets, prescription.performanceMode);
                    const independent = prescription.progressionTrackId !== sharedId;
                    return <div className="control-strip grid min-w-0 flex-1 grid-cols-2 gap-1 rounded-lg p-1" role="group" aria-label={tr("训练轨道")}>
                      <button type="button" onClick={() => setTrackMode(idx, "shared")} aria-pressed={!independent} className={"choice-chip press h-8 min-w-0 text-[11px] font-semibold " + (!independent ? "bg-fg text-bg" : "text-muted")}>{tr("共享")}</button>
                      <button type="button" onClick={() => setTrackMode(idx, "independent")} aria-pressed={independent} className={"choice-chip press h-8 min-w-0 text-[11px] font-semibold " + (independent ? "bg-fg text-bg" : "text-muted")}>{tr("独立")}</button>
                    </div>;
                  })()}
                </div>
              </div>
            </div>
          ))}

          {pickerOpen ? (
            <MusclePicker
              addedIds={new Set(items.map((i) => i.exerciseId))}
              onPick={add}
              onClose={() => setPickerOpen(false)}
            />
          ) : (
            <button type="button"
              onClick={() => setPickerOpen(true)}
              className="choice-chip press flex h-10 w-full items-center justify-center gap-1.5 border border-dashed border-border-strong bg-surface text-[13px] font-medium text-muted active:bg-surface-2"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              {tr("按部位加动作")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TemplateFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface px-2 py-1.5 text-center">
      <p className="text-[10px] text-faint">{label}</p>
      <p className="tnum mt-0.5 text-[12px] font-semibold text-fg">{value}</p>
    </div>
  );
}

// 通用步进器（组 / 次 / RPE 共用，无下拉）
function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const dec = () => onChange(Math.max(min, +(value - step).toFixed(1)));
  const inc = () => onChange(Math.min(max, +(value + step).toFixed(1)));
  return (
    <div className="control-strip flex items-center rounded-xl">
      <button type="button"
        onClick={dec}
        disabled={value <= min}
        className="press grid h-9 w-9 place-items-center text-muted disabled:opacity-25"
        aria-label={`${label} · 减少`}
        title={`${label} · 减少`}
      >
        −
      </button>
      <span className="tnum w-10 text-center text-[14px] font-bold text-fg">{value}</span>
      <button type="button"
        onClick={inc}
        disabled={value >= max}
        className="press grid h-9 w-9 place-items-center text-muted disabled:opacity-25"
        aria-label={`${label} · 增加`}
        title={`${label} · 增加`}
      >
        +
      </button>
    </div>
  );
}

// ============================================================
// 按部位选动作：肌群 chips → 动作列表（带器械标签）。最多两跳。
// ============================================================
function MusclePicker({
  addedIds,
  onPick,
  onClose,
}: {
  addedIds: Set<string>;
  onPick: (p: ExercisePreset) => void;
  onClose: () => void;
}) {
  const { tr } = useI18n();
  const { data, addCustomExercise, toggleFavoriteExercise } = useStore();
  const pool = useMemo(
    () => [...DEFAULT_EXERCISES, ...data.customExercises],
    [data.customExercises]
  );
  const muscles = useMemo(
    () => MUSCLE_ORDER.filter((m) => pool.some((p) => p.primaryMuscle === m)),
    [pool]
  );
  const untagged = useMemo(() => pool.filter((p) => !p.primaryMuscle), [pool]);
  const [muscle, setMuscle] = useState<MuscleGroup | "untagged" | "favorites" | null>(null);
  const [query, setQuery] = useState("");
  const [equipmentFilter, setEquipmentFilter] = useState<Equipment | "">("");
  const [editId, setEditId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newEquip, setNewEquip] = useState<Equipment | "">("");
  const [newRecordKind, setNewRecordKind] = useState<CustomRecordKind>("weightReps");
  const favoriteIds = useMemo(() => new Set(data.favoriteExerciseIds ?? []), [data.favoriteExerciseIds]);
  const presetNameById = useMemo(() => new Map(DEFAULT_EXERCISES.map((preset) => [preset.id, preset.name])), []);

  function createHere() {
    const name = newName.trim();
    if (!name || muscle === null || muscle === "untagged" || muscle === "favorites") return;
    const p = addCustomExercise(name, false, muscle, newEquip || undefined, CUSTOM_RECORD_MODES[newRecordKind]);
    onPick(p);
    setNewName("");
    setNewEquip("");
    setNewRecordKind("weightReps");
  }

  const activeSearch = Boolean(query.trim() || equipmentFilter);
  const list = useMemo(() => {
    if (muscle === null && !activeSearch) return [];
    return pool
      .filter((preset) => searchExercisePreset(preset, query))
      .filter((preset) => !equipmentFilter || preset.equipment === equipmentFilter)
      .filter((preset) => {
        if (muscle === null) return true;
        if (muscle === "favorites") return favoriteIds.has(preset.id);
        if (muscle === "untagged") return !preset.primaryMuscle;
        return preset.primaryMuscle === muscle || preset.secondaryMuscles?.includes(muscle);
      })
      .sort((a, b) => Number(favoriteIds.has(b.id)) - Number(favoriteIds.has(a.id)) || Number(!b.custom) - Number(!a.custom) || a.name.localeCompare(b.name));
  }, [activeSearch, equipmentFilter, favoriteIds, muscle, pool, query]);

  return (
    <div className="control-strip rounded-2xl p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{tr("按部位选择")}</span>
        <button type="button" onClick={onClose} className="press text-[12px] font-medium text-muted">{tr("收起")}</button>
      </div>

      <div className="mb-2 space-y-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={tr("搜索动作")}
          placeholder={tr("搜索动作 / 英文 / 别名")}
          className="number-cell h-10 w-full rounded-xl border border-border bg-surface px-3 text-[13px] text-fg outline-none placeholder:text-faint focus:border-accent"
        />
        <select value={equipmentFilter} onChange={(event) => setEquipmentFilter(event.target.value as Equipment | "")} aria-label={tr("按器械筛选")} className="h-9 w-full rounded-lg border border-border bg-surface px-2 text-[12px] text-muted outline-none focus:border-accent">
          <option value="">{tr("全部器械")}</option>
          {EQUIP_ORDER.map((equipment) => <option key={equipment} value={equipment}>{tr(EQUIPMENT_LABELS[equipment])}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {favoriteIds.size > 0 && (
          <button type="button" onClick={() => setMuscle((current) => current === "favorites" ? null : "favorites")} className={"choice-chip press border px-2.5 py-1.5 text-[13px] " + (muscle === "favorites" ? "border-accent bg-accent-soft font-medium text-accent" : "border-border bg-surface text-fg")}>
            {tr("收藏")}
          </button>
        )}
        {muscles.map((m) => (
          <button type="button"
            key={m}
            onClick={() => setMuscle((cur) => (cur === m ? null : m))}
            className={"choice-chip press border px-2.5 py-1.5 text-[13px] " + (muscle === m ? "border-accent bg-accent-soft font-medium text-accent" : "border-border bg-surface text-fg")}
          >
            {tr(MUSCLE_LABELS[m])}
          </button>
        ))}
        {untagged.length > 0 && (
          <button type="button"
            onClick={() => setMuscle((cur) => (cur === "untagged" ? null : "untagged"))}
            className={"choice-chip press border px-2.5 py-1.5 text-[13px] " + (muscle === "untagged" ? "border-accent bg-accent-soft font-medium text-accent" : "border-border bg-surface text-faint")}
          >
            {tr("未分类")}
          </button>
        )}
      </div>

      {(muscle !== null || activeSearch) && (
        <div className="mt-2 space-y-1">
          {list.map((p) => {
            const added = addedIds.has(p.id);
            if (editId === p.id) {
              return <CustomExerciseEditor key={p.id} preset={p} onClose={() => setEditId(null)} />;
            }
            return (
              <div key={p.id} className="flex items-stretch gap-1">
                <button type="button" onClick={() => toggleFavoriteExercise(p.id)} aria-label={favoriteIds.has(p.id) ? tr("取消收藏") : tr("收藏动作")} className={"press grid w-9 shrink-0 place-items-center rounded-lg border " + (favoriteIds.has(p.id) ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface text-faint")}>
                  {favoriteIds.has(p.id) ? "★" : "☆"}
                </button>
                <button type="button"
                  onClick={() => !added && onPick(p)}
                  disabled={added}
                  className={"choice-chip flex min-w-0 flex-1 items-center gap-2 border px-2.5 py-2 text-left " + (added ? "cursor-default border-border bg-surface text-faint" : "press border-border bg-surface text-fg active:bg-accent-soft")}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{tr(p.name)}</span>
                    <span className="mt-0.5 block truncate text-[10px] font-normal text-faint">{[p.primaryMuscle ? tr(MUSCLE_LABELS[p.primaryMuscle]) : null, ...(p.secondaryMuscles ?? []).slice(0, 2).map((item) => tr(MUSCLE_LABELS[item])), p.englishName].filter(Boolean).join(" · ")}</span>
                    {(p.alternatives ?? []).length > 0 && <span className="mt-0.5 block truncate text-[10px] font-normal text-faint">{tr("替代")}：{p.alternatives!.map((id) => presetNameById.get(id)).filter(Boolean).slice(0, 2).map((name) => tr(name!)).join(" / ")}</span>}
                  </span>
                  {p.region && <span className="shrink-0 text-[10px] text-faint">{tr(p.region)}</span>}
                  {p.equipment && <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">{tr(EQUIPMENT_LABELS[p.equipment])}</span>}
                  {added ? (
                    <span className="shrink-0 text-[11px]">{tr("已加入")}</span>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0 text-accent"><path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
                  )}
                </button>
                {isCustomExercise(p) && (
                  <button type="button"
                    onClick={() => setEditId(p.id)}
                    aria-label={tr("编辑")}
                    className="press grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-surface text-faint"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M14 6L18 10M4 20L4.5 16.5L15 6L18 9L7.5 19.5L4 20Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                )}
              </div>
            );
          })}
          {list.length === 0 && <p className="px-1 py-2 text-[12px] text-faint">{muscle !== null && muscle !== "untagged" && muscle !== "favorites"
            ? tr("没有匹配动作，可在下方新建自定义动作")
            : tr("没有匹配动作，选择目标肌群后可新建")}</p>}

          {muscle !== "untagged" && muscle !== "favorites" && muscle !== null && (
            <div className="mt-1.5 space-y-2 rounded-xl border border-dashed border-border-strong bg-surface/60 p-2">
              <p className="text-[11px] text-faint">{tr("没有想要的？新建「{m}」动作", { m: tr(MUSCLE_LABELS[muscle]) })}</p>
              <div className="flex gap-1.5">
                <input
                  value={newName}
                  aria-label={tr("动作名称")}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createHere()}
                  placeholder={tr("动作名称…")}
                  className="number-cell h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 text-[14px] text-fg outline-none placeholder:text-faint focus:border-accent"
                />
                <select
                  value={newEquip}
                  onChange={(e) => setNewEquip(e.target.value as Equipment | "")}
                  className="h-9 shrink-0 rounded-lg border border-border bg-surface px-1.5 text-[12px] text-muted outline-none focus:border-accent"
                  aria-label={tr("器械（选填）")}
                >
                  <option value="">{tr("器械（选填）")}</option>
                  {EQUIP_ORDER.map((eq) => <option key={eq} value={eq}>{tr(EQUIPMENT_LABELS[eq])}</option>)}
                </select>
                <button type="button"
                  onClick={createHere}
                  disabled={!newName.trim()}
                  className="press h-9 shrink-0 rounded-lg bg-fg px-3 text-[13px] font-medium text-bg disabled:opacity-30"
                >
                  {tr("新建")}
                </button>
              </div>
              <select value={newRecordKind} onChange={(event) => setNewRecordKind(event.target.value as CustomRecordKind)} aria-label={tr("记录方式")} className="h-9 w-full rounded-lg border border-border bg-surface px-2 text-[12px] text-muted outline-none focus:border-accent">
                <option value="weightReps">{tr("重量次数")}</option>
                <option value="reps">{tr("仅次数")}</option>
                <option value="duration">{tr("时长")}</option>
                <option value="distance">{tr("距离")}</option>
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
