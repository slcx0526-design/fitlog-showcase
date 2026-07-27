"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  PERSISTENCE_EVENT,
  type PersistenceEventDetail,
} from "@/lib/storage";
import { localeText, useI18n } from "@/lib/i18n";

export default function PersistenceStatus() {
  const { locale } = useI18n();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onPersistence = (event: Event) => {
      const detail = (event as CustomEvent<PersistenceEventDetail>).detail;
      setStatus(detail.status);
      if (detail.status === "error") setDismissed(false);
    };
    window.addEventListener(PERSISTENCE_EVENT, onPersistence);
    return () => window.removeEventListener(PERSISTENCE_EVENT, onPersistence);
  }, []);

  if (status !== "error" || dismissed) {
    return <span className="sr-only" data-persistence-state={status} />;
  }

  const t = (zh: string, en: string, ja: string) => localeText(locale, zh, en, ja);
  return (
    <div className="persistence-alert" role="alert" data-persistence-state="error">
      <div className="min-w-0 flex-1">
        <strong>{t("本次修改未能保存", "This change was not saved", "今回の変更を保存できませんでした")}</strong>
        <p>{t("请在设置中导出备份，并检查浏览器存储空间。", "Export a backup in Settings and check browser storage.", "設定からバックアップを書き出し、ブラウザ容量を確認してください。")}</p>
      </div>
      <Link href="/settings" className="press">{t("去设置", "Settings", "設定")}</Link>
      <button type="button" onClick={() => setDismissed(true)} className="ui-icon-button press" aria-label={t("关闭", "Dismiss", "閉じる")}>×</button>
    </div>
  );
}
