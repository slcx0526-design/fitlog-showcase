"use client";

import Link from "next/link";
import { localeText, useI18n } from "@/lib/i18n";

type TrainingWorkspaceView = "cycle" | "review" | "policy" | "outcomes";

export default function TrainingWorkspaceNav({ active, className = "" }: { active: TrainingWorkspaceView; className?: string }) {
  const { locale } = useI18n();
  const t = (zh: string, en: string, ja: string) => localeText(locale, zh, en, ja);
  const links: Array<{ id: TrainingWorkspaceView; href: string; label: string }> = [
    { id: "cycle", href: "/schedule", label: t("周期", "Cycle", "周期") },
    { id: "review", href: "/progress?tab=training", label: t("复盘", "Review", "レビュー") },
    { id: "policy", href: "/training-policy", label: t("动态", "Adaptive", "適応") },
    { id: "outcomes", href: "/adaptive-outcomes", label: t("反应", "Response", "反応") },
  ];

  return (
    <nav
      className={`training-workspace-nav ${className}`.trim()}
      data-training-workspace-nav
      aria-label={t("训练规划视图", "Training planning views", "トレーニング計画表示")}
    >
      {links.map((link) => (
        <Link key={link.id} href={link.href} className="press" aria-current={active === link.id ? "page" : undefined}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
