"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { daysAgo } from "@/lib/date";
import { type AppData, downloadBackup, parseBackupWithMeta } from "@/lib/storage";
import { typeLabel } from "@/lib/exercises";

export default function DataManagement() {
  const { tr, locale } = useI18n();
  const { exportData, importFromText, clearAll, data } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pendingImport, setPendingImport] = useState<{
    text: string;
    dayCount: number;
    bodyWeightCount: number;
    waistCount: number;
    templateCount: number;
    exportedAt?: string;
    version?: number;
  } | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null
  );

  const lastBackup = daysAgo(data.lastBackupAt, locale);
  const stale = !lastBackup || lastBackup.days >= 30;
  const currentDayCount = Object.keys(data.days).length;
  const filledDayCount = Object.values(data.days).filter((day) => {
    const sets = day.workout?.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0) ?? 0;
    const cardioMinutes = (day.cardio ?? []).reduce((sum, entry) => sum + entry.minutes, 0);
    return sets > 0 || day.workout?.type === "rest" || (day.nutrition?.calories ?? 0) > 0 || cardioMinutes > 0;
  }).length;

  function flash(kind: "ok" | "err", text: string) {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setMsg({ kind, text });
    flashTimer.current = setTimeout(() => setMsg(null), 2600);
  }

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 允许重复选择同一文件
    if (!file) return;
    try {
      const text = await file.text();
      // 先解析校验 + 统计，但不立即应用 —— 等用户确认覆盖
      const preview = parseBackupWithMeta(text);
      setPendingImport({
        text,
        dayCount: Object.keys(preview.data.days).length,
        bodyWeightCount: preview.data.bodyWeights.length,
        waistCount: preview.data.waistEntries.length,
        templateCount: preview.data.templates?.length ?? 0,
        exportedAt: preview.exportedAt,
        version: preview.version,
      });
    } catch (err) {
      flash("err", err instanceof Error ? tr(err.message) : tr("文件无法解析"));
    }
  }

  function confirmImport() {
    if (!pendingImport) return;
    try {
      importFromText(pendingImport.text);
      flash("ok", tr("导入成功，数据已恢复"));
    } catch (err) {
      flash("err", err instanceof Error ? tr(err.message) : tr("导入失败"));
    }
    setPendingImport(null);
  }

  return (
    <section className="mt-7">
      <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
        {tr("数据管理")}
      </h2>

      <div className="control-card space-y-2 p-3">
        <div className="grid grid-cols-5 gap-1.5">
          <ArchiveMetric label={tr("日志")} value={String(filledDayCount)} />
          <ArchiveMetric label={tr("体重")} value={String(data.bodyWeights.length)} />
          <ArchiveMetric label={tr("腰围")} value={String(data.waistEntries.length)} />
          <ArchiveMetric label={tr("模板")} value={String(data.templates?.length ?? 0)} />
          <ArchiveMetric label={tr("动作")} value={String(data.customExercises.length)} />
        </div>

        {/* 备份状态 */}
        <div
          className={
            "control-strip flex items-center justify-between rounded-xl px-2.5 py-1.5 text-[12px] " +
            (stale
              ? "bg-warn-soft text-warn"
              : "bg-surface-2 text-muted")
          }
        >
          <span className="flex items-center gap-1.5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              {stale ? (
                <path
                  d="M12 8V13M12 16.5V16.6M4.9 19H19.1L12 5L4.9 19Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : (
                <path
                  d="M5 13L9 17L19 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </svg>
            <span>
              {lastBackup
                ? tr("上次备份：{d}", { d: lastBackup.label })
                : tr("尚未备份")}
            </span>
          </span>
          {stale && (
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              {tr("建议备份")}
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={exportData}
            className="choice-chip press flex h-11 flex-1 items-center justify-center gap-1.5 border border-border bg-surface-2 text-[14px] font-medium text-fg active:bg-surface"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 4V15M12 15L8 11M12 15L16 11M5 19H19"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {tr("导出备份")}
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="choice-chip press flex h-11 flex-1 items-center justify-center gap-1.5 border border-border bg-surface-2 text-[14px] font-medium text-fg active:bg-surface"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 20V9M12 9L8 13M12 9L16 13M5 5H19"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {tr("导入恢复")}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={onFile}
            className="hidden"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => downloadTrainingCsv(data)}
            className="choice-chip press h-10 border border-border bg-surface text-[12px] font-semibold text-muted"
          >
            训练 CSV
          </button>
          <button
            type="button"
            onClick={() => downloadBodyCsv(data)}
            className="choice-chip press h-10 border border-border bg-surface text-[12px] font-semibold text-muted"
          >
            身体 CSV
          </button>
          <button
            type="button"
            onClick={() => downloadDailyCsv(data)}
            className="choice-chip press h-10 border border-border bg-surface text-[12px] font-semibold text-muted"
          >
            日志 CSV
          </button>
        </div>

        {/* 导入二次确认：覆盖全部数据前必须确认 */}
        {pendingImport && (
          <div className="animate-slidedown rounded-xl border border-accent/40 bg-accent-soft p-2.5">
            <p className="tnum px-1 text-[13px] font-medium text-accent">
              {tr("导入将")}<strong>{tr("覆盖当前全部数据")}</strong>
            </p>
            <p className="tnum mt-0.5 px-1 text-[12px] text-accent/80">
              {tr("当前 {a} 天记录 → 替换为备份的 {b} 天", { a: currentDayCount, b: pendingImport.dayCount })}
            </p>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              <ImportMetric label={tr("版本")} value={pendingImport.version ? `v${pendingImport.version}` : "—"} />
              <ImportMetric label={tr("体重")} value={String(pendingImport.bodyWeightCount)} />
              <ImportMetric label={tr("腰围")} value={String(pendingImport.waistCount)} />
              <ImportMetric label={tr("模板")} value={String(pendingImport.templateCount)} />
            </div>
            {pendingImport.exportedAt && (
              <p className="tnum mt-1.5 px-1 text-[11px] text-accent/70">
                {tr("导出时间")}：{new Date(pendingImport.exportedAt).toLocaleString()}
              </p>
            )}
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => setPendingImport(null)}
                className="press h-9 flex-1 rounded-md border border-border bg-surface text-[13px] text-fg"
              >
                {tr("取消")}
              </button>
              <button
                onClick={() => {
                  downloadBackup(data);
                  flash("ok", tr("当前数据已导出"));
                }}
                className="press h-9 flex-1 rounded-md border border-border bg-surface text-[13px] font-medium text-accent"
              >
                {tr("先导出当前")}
              </button>
              <button
                onClick={confirmImport}
                className="press h-9 flex-1 rounded-md bg-accent text-[13px] font-semibold text-accent-fg"
              >
                {tr("确认覆盖导入")}
              </button>
            </div>
          </div>
        )}

        {/* 清空：两段内联确认，无弹窗 */}
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="choice-chip press h-10 w-full text-[13px] font-medium text-muted active:bg-surface-2"
          >
            {tr("清空全部数据")}
          </button>
        ) : (
          <div className="animate-slidedown flex items-center gap-2 rounded-xl border border-accent/40 bg-accent-soft p-2">
            <span className="flex-1 pl-1 text-[13px] font-medium text-accent">
              {tr("确认清空？不可恢复")}
            </span>
            <button
              onClick={() => setConfirming(false)}
              className="press h-9 rounded-md border border-border bg-surface px-3 text-[13px] text-fg"
            >
              {tr("取消")}
            </button>
            <button
              onClick={() => {
                clearAll();
                setConfirming(false);
                flash("ok", tr("已清空"));
              }}
              className="press h-9 rounded-md bg-accent px-3 text-[13px] font-semibold text-accent-fg"
            >
              {tr("确认清空")}
            </button>
          </div>
        )}

        {msg && (
          <p
            className={
              "text-center text-[12px] " +
              (msg.kind === "ok" ? "text-muted" : "text-accent")
            }
          >
            {msg.text}
          </p>
        )}
      </div>

      <p className="mt-2 px-1 text-[11px] leading-relaxed text-faint">
        {tr("数据仅保存在此设备的浏览器中。清理浏览器数据或更换设备前，请先导出备份。")}
      </p>
    </section>
  );
}

function csvCell(value: string | number | undefined | null) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(filename: string, rows: (string | number | undefined | null)[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function downloadTrainingCsv(data: AppData) {
  const rows: (string | number | undefined | null)[][] = [["date", "type", "exercise", "set", "weight", "reps"]];
  Object.keys(data.days).sort().forEach((date) => {
    const workout = data.days[date].workout;
    if (!workout) return;
    if (workout.type === "rest") {
      rows.push([date, typeLabel(workout.type), "休息", "", "", ""]);
      return;
    }
    workout.exercises.forEach((exercise) => {
      if (!exercise.sets.length) {
        rows.push([date, typeLabel(workout.type), exercise.name, "", "", ""]);
        return;
      }
      exercise.sets.forEach((set, index) => {
        rows.push([date, typeLabel(workout.type), exercise.name, index + 1, set.weight, set.reps]);
      });
    });
  });
  downloadCsv(`fitlog-training-${dateStamp()}.csv`, rows);
}

function downloadBodyCsv(data: AppData) {
  const dates = new Set([
    ...data.bodyWeights.map((entry) => entry.date),
    ...data.waistEntries.map((entry) => entry.date),
  ]);
  const rows: (string | number | undefined | null)[][] = [["date", "weight_kg", "waist_cm"]];
  [...dates].sort().forEach((date) => {
    rows.push([
      date,
      data.bodyWeights.find((entry) => entry.date === date)?.weight,
      data.waistEntries.find((entry) => entry.date === date)?.waist,
    ]);
  });
  downloadCsv(`fitlog-body-${dateStamp()}.csv`, rows);
}

function downloadDailyCsv(data: AppData) {
  const rows: (string | number | undefined | null)[][] = [["date", "calories", "protein", "carbs", "fat", "cardio_minutes", "cardio_modes"]];
  Object.keys(data.days).sort().forEach((date) => {
    const day = data.days[date];
    rows.push([
      date,
      day.nutrition?.calories,
      day.nutrition?.protein,
      day.nutrition?.carbs,
      day.nutrition?.fat,
      (day.cardio ?? []).reduce((sum, entry) => sum + entry.minutes, 0),
      (day.cardio ?? []).map((entry) => entry.mode).join(" / "),
    ]);
  });
  downloadCsv(`fitlog-daily-${dateStamp()}.csv`, rows);
}

function ArchiveMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="control-strip rounded-xl px-1.5 py-2 text-center">
      <p className="text-[10px] text-faint">{label}</p>
      <p className="tnum mt-1 text-[15px] font-bold text-fg">{value}</p>
    </div>
  );
}

function ImportMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface px-2 py-1.5 text-center">
      <p className="text-[10px] text-faint">{label}</p>
      <p className="tnum mt-0.5 text-[12px] font-semibold text-fg">{value}</p>
    </div>
  );
}
