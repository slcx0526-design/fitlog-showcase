"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ProgressHub from "@/components/ProgressHub";

function Inner() {
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab = raw === "training" || raw === "log" || raw === "body" ? raw : "body";
  return <ProgressHub initialTab={tab} />;
}
export default function ProgressPage() { return <Suspense fallback={<div className="h-64 rounded-2xl bg-surface-2" />}><Inner /></Suspense>; }
