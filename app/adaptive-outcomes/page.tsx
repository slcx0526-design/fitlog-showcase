"use client";

import Link from "next/link";
import { useMemo } from "react";
import { buildAdaptiveResponseModel } from "@/lib/adaptiveResponse";
import { useToday } from "@/lib/hooks";
import { useStore } from "@/lib/store";

const CONFIDENCE_LABELS = { low: "不足", building: "建立中", ready: "充分" } as const;
const TOLERANCE_LABELS = { unknown: "未知", low: "偏低", balanced: "平衡", high: "偏高" } as const;
const PHASE_LABELS = { build: "构建", deload: "减载" } as const;
const OUTCOME_LABELS = { positive: "改善", neutral: "稳定", negative: "恶化" } as const;

export default function AdaptiveOutcomesPage() {
  const { loaded, data } = useStore();
  const today = useToday();
  const model = useMemo(() => buildAdaptiveResponseModel(data, today), [data, today]);

  if (!loaded) {
    return <div className="space-y-3"><div className="h-20 rounded-2xl bg-surface-2" /><div className="h-64 rounded-2xl bg-surface-2" /></div>;
  }

  const nextVolume = model.volumeBias > 0
    ? `下一周期可尝试 +${Math.round(model.volumeBias * 100)}% 容量`
    : model.volumeBias < 0
      ? `下一周期优先减少 ${Math.abs(Math.round(model.volumeBias * 100))}% 容量`
      : "下一周期维持当前容量";
  const nextFrequency = model.trainingDayDelta > 0
    ? "满足恢复条件时可增加 1 个训练日"
    : model.trainingDayDelta < 0
      ? "下一周期建议减少 1 个训练日"
      : "维持当前训练频率";

  return (
    <div className="space-y-4 pb-8">
      <header className="control-card p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">ADAPTIVE PLAN V4</p>
            <h1 className="mt-1 text-[24px] font-bold tracking-tight text-fg">个人训练反应模型</h1>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">比较多个完整微周期，判断训练剂量变化后完成率、难度、进阶和恢复是否真正改善。</p>
          </div>
          <Link href="/training-policy" className="choice-chip press shrink-0 border border-border bg-surface-2 px-2.5 py-2 text-[12px] font-semibold text-accent">动态计划</Link>
        </div>
      </header>

      <section className="control-card p-3.5">
        <SectionTitle title="模型结论" detail="短期恢复决定今天怎么练；长期反应决定下一周期应该维持、减量还是逐步加量。" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Fact label="置信度" value={CONFIDENCE_LABELS[model.confidence]} />
          <Fact label="容量耐受" value={TOLERANCE_LABELS[model.tolerance]} />
          <Fact label="有效周期" value={String(model.evaluatedCycles)} />
          <Fact label="周期比较" value={String(model.comparableTransitions)} />
        </div>
        <div className="control-strip mt-3 rounded-xl px-3 py-3">
          <p className="text-[13px] font-semibold leading-relaxed text-fg">{model.summary}</p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Recommendation label="容量" value={nextVolume} />
            <Recommendation label="频率" value={nextFrequency} />
          </div>
          <div className="mt-2 space-y-1">{model.reasons.map((reason) => <p key={reason} className="text-[10px] leading-relaxed text-faint">· {reason}</p>)}</div>
        </div>
      </section>

      <section className="control-card overflow-hidden">
        <div className="px-3.5 py-3">
          <SectionTitle title="周期结果" detail="只使用已经结束并至少包含两次有效训练的周期。" />
        </div>
        {model.cycles.length ? (
          <div className="soft-divider border-t">
            {model.cycles.map((cycle) => (
              <div key={cycle.microcycleId} className="soft-divider border-t px-3.5 py-3 first:border-t-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-semibold text-fg">{cycle.startedAt} — {cycle.endedAt}</p>
                    <p className="mt-0.5 text-[10px] text-faint">{PHASE_LABELS[cycle.phase]}周期 · {cycle.sessions} 次训练 · 平均 {cycle.prescribedSetsPerSession} 组/次</p>
                  </div>
                  <span className="rounded-md bg-surface-2 px-2 py-1 text-[10px] font-semibold text-muted">{Math.round(cycle.averageAdaptiveScale * 100)}%</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <MiniFact label="完成率" value={`${cycle.completionPct}%`} />
                  <MiniFact label="困难占比" value={cycle.hardRatio == null ? "未知" : `${Math.round(cycle.hardRatio * 100)}%`} />
                  <MiniFact label="进阶兑现" value={cycle.progressionPct == null ? "样本不足" : `${cycle.progressionPct}%`} />
                  <MiniFact label="恢复均值" value={cycle.recoveryAverage == null ? "样本不足" : String(cycle.recoveryAverage)} />
                </div>
              </div>
            ))}
          </div>
        ) : <p className="px-3.5 pb-4 text-[11px] leading-relaxed text-faint">目前没有足够的完整周期。继续正常记录训练完成状态和主观难度，模型会自动建立。</p>}
      </section>

      <section className="control-card p-3.5">
        <SectionTitle title="相邻周期比较" detail="同等或更高训练量下结果改善，才会被视为耐受提升。" />
        {model.transitions.length ? (
          <div className="space-y-2">
            {model.transitions.map((transition) => (
              <div key={`${transition.fromMicrocycleId}:${transition.toMicrocycleId}`} className="control-strip rounded-xl px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold text-fg">训练量 {Math.round(transition.loadRatio * 100)}%</p>
                  <span className="rounded-md bg-surface px-2 py-1 text-[10px] font-semibold text-muted">{OUTCOME_LABELS[transition.outcome]}</span>
                </div>
                <div className="mt-1 space-y-0.5">{transition.reasons.map((reason) => <p key={reason} className="text-[10px] text-faint">· {reason}</p>)}</div>
              </div>
            ))}
          </div>
        ) : <p className="text-[11px] leading-relaxed text-faint">至少需要两个可比较的构建周期。</p>}
      </section>

      <section className="control-card p-3.5">
        <SectionTitle title="自动化边界" detail="终版模型仍保留明确的安全限制。" />
        <div className="space-y-1.5 text-[11px] leading-relaxed text-muted">
          <p>· 不回写已完成训练，也不修改历史周期快照。</p>
          <p>· 高耐受只允许在周期审核中逐步加量，不会临时放大当天处方。</p>
          <p>· 自动频率调整仍最多变化 1 天；增加训练日必须满足高置信模型并由现有权限控制。</p>
          <p>· 模型由本地历史记录实时计算，不上传训练数据，也不依赖外部AI服务。</p>
        </div>
      </section>
    </div>
  );
}

function SectionTitle({ title, detail }: { title: string; detail: string }) {
  return <div className="mb-3"><h2 className="text-[15px] font-semibold text-fg">{title}</h2><p className="mt-0.5 text-[10px] leading-relaxed text-faint">{detail}</p></div>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-surface-2 px-2.5 py-2.5"><p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-faint">{label}</p><p className="tnum mt-1 truncate text-[14px] font-bold text-fg">{value}</p></div>;
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-surface-2 px-2.5 py-2"><p className="text-[9px] text-faint">{label}</p><p className="tnum mt-0.5 text-[11px] font-semibold text-fg">{value}</p></div>;
}

function Recommendation({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-surface px-2.5 py-2"><p className="text-[9px] font-semibold text-faint">{label}</p><p className="mt-0.5 text-[11px] font-semibold leading-relaxed text-fg">{value}</p></div>;
}
