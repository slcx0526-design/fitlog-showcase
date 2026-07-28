"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const VISIBLE_ROUTES = ["/schedule", "/templates", "/train"];

export default function TrainingPolicyShortcut() {
  const pathname = usePathname();
  if (pathname === "/adaptive-outcomes") return null;
  if (pathname === "/training-policy") {
    return (
      <Link
        href="/adaptive-outcomes"
        title="查看跨周期个人训练反应模型"
        className="press fixed right-3 z-[18] flex h-10 items-center gap-1.5 rounded-full border border-border bg-surface/95 px-3 text-[12px] font-semibold text-accent shadow-lg backdrop-blur-xl"
        style={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom))" }}
        aria-label="打开个人训练反应模型"
      >
        <span aria-hidden="true">◎</span>
        反应模型
      </Link>
    );
  }
  if (!VISIBLE_ROUTES.some((route) => pathname.startsWith(route))) return null;
  return (
    <Link
      href="/training-policy"
      title="查看恢复证据并调整下一次训练处方"
      className="press fixed right-3 z-[18] flex h-10 items-center gap-1.5 rounded-full border border-border bg-surface/95 px-3 text-[12px] font-semibold text-accent shadow-lg backdrop-blur-xl"
      style={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom))" }}
      aria-label="打开动态训练计划控制台"
    >
      <span aria-hidden="true">↻</span>
      动态计划
    </Link>
  );
}
