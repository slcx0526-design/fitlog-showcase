"use client";

import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";

interface Props {
  value: number;
  onChange: (n: number) => void;
  onCommit?: () => void;
  placeholder?: string;
  className?: string;
  allowDecimal?: boolean;
  ariaLabel?: string;
  focusWhenReady?: boolean;
  enterKeyHint?: InputHTMLAttributes<HTMLInputElement>["enterKeyHint"];
  onEnter?: (value: number) => void;
}

/** 内部维护字符串缓冲，聚焦时以缓冲为准，避免受控 number 输入的各种跳动 */
export default function NumberField({
  value,
  onChange,
  onCommit,
  placeholder,
  className,
  allowDecimal = true,
  ariaLabel,
  focusWhenReady = false,
  enterKeyHint,
  onEnter,
}: Props) {
  const [buf, setBuf] = useState(value ? String(value) : "");
  const focused = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focused.current) setBuf(value ? String(value) : "");
  }, [value]);

  useEffect(() => {
    if (focusWhenReady) input.current?.focus();
  }, [focusWhenReady]);

  function clean(s: string) {
    const stripped = s.replace(allowDecimal ? /[^0-9.]/g : /[^0-9]/g, "");
    if (!allowDecimal) return stripped;
    const [whole, ...decimals] = stripped.split(".");
    return decimals.length ? `${whole}.${decimals.join("")}` : whole;
  }

  return (
    <input
      ref={input}
      type="text"
      inputMode={allowDecimal ? "decimal" : "numeric"}
      enterKeyHint={enterKeyHint}
      value={buf}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onFocus={(e) => {
        focused.current = true;
        e.currentTarget.select();
      }}
      onBlur={() => {
        focused.current = false;
        setBuf(value ? String(value) : "");
        onCommit?.();
      }}
      onChange={(e) => {
        const c = clean(e.target.value);
        setBuf(c);
        const n = parseFloat(c);
        onChange(Number.isFinite(n) ? n : 0);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" || !onEnter) return;
        event.preventDefault();
        const next = parseFloat(buf);
        onEnter(Number.isFinite(next) ? next : 0);
      }}
      className={className}
    />
  );
}
