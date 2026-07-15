"use client";

import { useEffect } from "react";
import { useI18n } from "@/lib/i18n";

const CSV_KEYS = ["训练 CSV", "身体 CSV", "日志 CSV"] as const;
type CsvKey = typeof CSV_KEYS[number];

const labels: Record<"zh" | "en" | "ja", Record<CsvKey, string>> = {
  zh: { "训练 CSV": "训练 CSV", "身体 CSV": "身体 CSV", "日志 CSV": "日志 CSV" },
  en: { "训练 CSV": "Training CSV", "身体 CSV": "Body CSV", "日志 CSV": "Log CSV" },
  ja: { "训练 CSV": "トレーニング CSV", "身体 CSV": "身体 CSV", "日志 CSV": "ログ CSV" },
};

function isCsvKey(value: string | undefined): value is CsvKey {
  return !!value && CSV_KEYS.includes(value as CsvKey);
}

export default function DataManagementLocaleBridge() {
  const { locale } = useI18n();

  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-data-management]");
    if (!root) return;

    const apply = () => {
      root.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
        const stored = button.dataset.csvLocaleKey;
        const detected = CSV_KEYS.find((candidate) => button.textContent?.trim() === candidate);
        const key = isCsvKey(stored) ? stored : detected;
        if (!key) return;
        button.dataset.csvLocaleKey = key;
        const label = labels[locale][key];
        if (button.textContent !== label) button.textContent = label;
        button.setAttribute("aria-label", label);
      });
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [locale]);

  return null;
}