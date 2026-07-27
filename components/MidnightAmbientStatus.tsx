"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { useUIMode } from "@/lib/uiMode";
import { workingSets } from "@/lib/trainingMetrics";
import { localeText, useI18n, type Locale } from "@/lib/i18n";

const tx = (locale: Locale, zh: string, en: string, ja: string) => localeText(locale, zh, en, ja);

function two(value: number) {
  return String(value).padStart(2, "0");
}

function routeLabel(pathname: string, locale: Locale) {
  if (pathname.startsWith("/train")) return tx(locale, "训练", "Training", "トレーニング");
  if (pathname.startsWith("/nutrition")) return tx(locale, "饮食", "Nutrition", "食事");
  if (pathname.startsWith("/cut")) return tx(locale, "减脂", "Cut", "減量");
  if (pathname.startsWith("/progress") || pathname.startsWith("/data") || pathname.startsWith("/history")) return tx(locale, "进度", "Progress", "進捗");
  if (pathname.startsWith("/cardio")) return tx(locale, "有氧", "Cardio", "有酸素");
  if (pathname.startsWith("/settings")) return tx(locale, "设置", "Settings", "設定");
  return tx(locale, "今天", "Today", "今日");
}

function phaseFor(hour: number, locale: Locale) {
  if (hour < 5) return { label: tx(locale, "深夜", "Late night", "深夜"), glyph: "●" };
  if (hour < 9) return { label: tx(locale, "清晨", "Morning", "朝"), glyph: "◐" };
  if (hour < 17) return { label: tx(locale, "白天", "Daytime", "昼"), glyph: "○" };
  if (hour < 21) return { label: tx(locale, "傍晚", "Evening", "夕方"), glyph: "◑" };
  return { label: tx(locale, "夜间", "Night", "夜"), glyph: "●" };
}

/**
 * A moonlit daily status layer: current hour, route, and today's logged state.
 * It uses existing FitLog data only and adds no fictional progression system.
 */
export default function MidnightAmbientStatus() {
  const pathname = usePathname();
  const today = useToday();
  const { mode } = useUIMode();
  const { data } = useStore();
  const { locale } = useI18n();
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const summary = useMemo(() => {
    const day = data.days[today];
    const trained = !!day?.workout?.done || (day?.workout?.exercises.some((exercise) => workingSets(exercise.sets).length > 0) ?? false);
    const ate = (day?.nutrition?.calories ?? 0) > 0;
    const moved = (day?.cardio ?? []).length > 0;
    return [
      trained ? tx(locale, "训练已记录", "Training logged", "トレーニング記録済み") : tx(locale, "训练待记录", "Training open", "トレーニング未記録"),
      ate ? tx(locale, "饮食已记录", "Nutrition logged", "食事記録済み") : tx(locale, "饮食待记录", "Nutrition open", "食事未記録"),
      moved ? tx(locale, "有氧已记录", "Cardio logged", "有酸素記録済み") : tx(locale, "有氧待记录", "Cardio open", "有酸素未記録"),
    ].join(" · ");
  }, [data.days, locale, today]);

  if (mode !== "midnight" || pathname.startsWith("/settings") || pathname.startsWith("/train")) return null;
  const phase = phaseFor(clock.getHours(), locale);
  const time = `${two(clock.getHours())}:${two(clock.getMinutes())}`;

  return (
    <section className="midnight-ambient-status" aria-label={tx(locale, "午夜主题状态", "Midnight status", "ミッドナイト状態")}>
      <div className="midnight-ambient-status__moon" aria-hidden="true">{phase.glyph}</div>
      <div className="min-w-0">
        <p className="midnight-ambient-status__eyebrow">{phase.label} · {routeLabel(pathname, locale)}</p>
        <p className="truncate midnight-ambient-status__summary">{summary}</p>
      </div>
      <div className="midnight-ambient-status__time tnum">{time}</div>
    </section>
  );
}
