"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { haptic } from "@/lib/feedback";
import { localeText, useI18n } from "@/lib/i18n";
import TrainingWorkspaceNav from "@/components/TrainingWorkspaceNav";

type Tab = "body" | "training" | "log";
type Copy = [string, string, string];

const BodyProgressReview = dynamic(() => import("@/components/BodyProgressReview"), { loading: ReviewSkeleton });
const TrainingVolumeReview = dynamic(() => import("@/components/TrainingVolumeReview"), { loading: ReviewSkeleton });
const LogReview = dynamic(() => import("@/components/LogReview"), { loading: ReviewSkeleton });

const TAB_COPY: Record<Tab, { label: Copy; detail: Copy }> = {
  body: { label: ["身体", "Body", "身体"], detail: ["体重 · 腰围 · 体脂趋势", "Weight · waist · body-fat trends", "体重・ウエスト・体脂肪の推移"] },
  training: { label: ["训练", "Training", "トレーニング"], detail: ["容量 · 最近训练 · 有氧", "Volume · recent training · cardio", "ボリューム・最近のトレーニング・有酸素"] },
  log: { label: ["日志", "Log", "ログ"], detail: ["按日期回看与补记", "Review and backfill by date", "日付ごとの確認と追加入力"] },
};

export default function ProgressPageShell({ initialTab = "body" }: { initialTab?: Tab }) {
  const router = useRouter();
  const { loaded } = useStore();
  const { locale } = useI18n();
  const t = (zh: string, en: string, ja: string) => localeText(locale, zh, en, ja);
  const [tab, setTab] = useState<Tab>(initialTab);
  const selected = TAB_COPY[tab];

  useEffect(() => setTab(initialTab), [initialTab]);

  function change(next: Tab) {
    setTab(next);
    router.replace(`/progress?tab=${next}`, { scroll: false });
    haptic(8);
  }

  if (!loaded) return <div className="space-y-3"><div className="h-16 rounded-2xl bg-surface-2" /><div className="h-56 rounded-2xl bg-surface-2" /></div>;

  return <div className="progress-shell">
    <header className="page-heading mb-5">
      <div><p className="page-heading__eyebrow">{t("训练复盘", "Review", "レビュー")}</p><h1>{t("进度", "Progress", "進捗")}</h1><p className="page-heading__meta">{t(...selected.detail)}</p></div>
      <Link href="/settings" className="page-utility-link press">{t("设置", "Settings", "設定")}</Link>
    </header>
    <div className="control-strip mb-5 grid grid-cols-3 gap-1 rounded-2xl p-1" role="tablist" aria-label={t("进度分类", "Progress categories", "進捗カテゴリ")}>
      {(Object.keys(TAB_COPY) as Tab[]).map((item) => <button type="button" key={item} role="tab" aria-selected={tab === item} onClick={() => change(item)} className={"choice-chip press h-10 text-[13px] font-semibold " + (tab === item ? "bg-fg text-bg shadow-sm" : "text-muted")}>{t(...TAB_COPY[item].label)}</button>)}
    </div>
    {tab === "training" && <TrainingWorkspaceNav active="review" className="mb-4" />}
    {tab === "body" && <BodyProgressReview />}
    {tab === "training" && <TrainingVolumeReview />}
    {tab === "log" && <LogReview />}
  </div>;
}

function ReviewSkeleton() {
  return <div className="space-y-3" aria-hidden="true"><div className="h-28 rounded-lg bg-surface-2" /><div className="h-56 rounded-lg bg-surface-2" /></div>;
}
