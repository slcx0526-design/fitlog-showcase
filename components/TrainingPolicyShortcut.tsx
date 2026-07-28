"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const VISIBLE_ROUTES = ["/schedule", "/templates", "/train"];

export default function TrainingPolicyShortcut() {
  const pathname = usePathname();
  if (pathname === "/training-policy" || !VISIBLE_ROUTES.some((route) => pathname.startsWith(route))) return null;
  return (
    <Link
      href="/training-policy"
      title="根据训练倾向调整未来计划"
      className="press fixed right-3 z-[18] flex h-10 items-center gap-1.5 rounded-full border border-border bg-surface/95 px-3 text-[12px] font-semibold text-accent shadow-lg backdrop-blur-xl"
      style={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom))" }}
      aria-label="打开训练计划自适应控制台"
    >
      <span aria-hidden="true">↻</span>
      计划自适应
    </Link>
  );
}
