import type { ReactNode } from "react";

interface InlineConfirmProps {
  message: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  tone?: "warning" | "danger";
  className?: string;
}

export default function InlineConfirm({
  message,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  tone = "warning",
  className = "",
}: InlineConfirmProps) {
  return (
    <div className={`ui-inline-confirm ${tone === "danger" ? "is-danger" : ""} ${className}`.trim()} role="alert">
      <div className="min-w-0 flex-1">{message}</div>
      <div className="ui-inline-confirm__actions">
        <button type="button" onClick={onCancel} className="press">{cancelLabel}</button>
        <button type="button" onClick={onConfirm} className="press is-confirm">{confirmLabel}</button>
      </div>
    </div>
  );
}
