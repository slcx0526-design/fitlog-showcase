"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ProgressPageShell from "@/components/ProgressPageShell";
import LogReview from "@/components/LogReview";

function Inner() {
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab = raw === "training" || raw === "log" || raw === "body" ? raw : "body";
  if (tab !== "log") return <ProgressPageShell initialTab={tab} />;
  return <div className="progress-shell"><header className="control-card mb-4 flex items-end justify-between gap-4 p-3.5"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">REVIEW</p><h1 className="mt-1 text-[25px] font-bold tracking-tight text-fg">进度</h1><p className="mt-1 text-[12px] text-muted">按日期回看与补记</p></div><Link href="/settings" className="press rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12px] font-semibold text-muted">备份与设置</Link></header><div className="control-strip mb-5 grid grid-cols-3 gap-1 rounded-2xl p-1"><Link href="/progress?tab=body" className="choice-chip press flex h-10 items-center justify-center text-[13px] font-semibold text-muted">身体</Link><Link href="/progress?tab=training" className="choice-chip press flex h-10 items-center justify-center text-[13px] font-semibold text-muted">训练</Link><span className="choice-chip flex h-10 items-center justify-center bg-fg text-[13px] font-semibold text-bg shadow-sm">日志</span></div><LogReview /></div>;
}

export default function ProgressPage() { return <Suspense fallback={<div className="h-64 rounded-2xl bg-surface-2" />}><Inner /></Suspense>; }
