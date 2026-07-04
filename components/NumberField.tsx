"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  value: number;
  onChange: (n: number) => void;
  onCommit?: () => void;
  placeholder?: string;
  className?: string;
  allowDecimal?: boolean;
  ariaLabel?: string;
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
}: Props) {
  const [buf, setBuf] = useState(value ? String(value) : "");
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setBuf(value ? String(value) : "");
  }, [value]);

  function clean(s: string) {
    return s.replace(allowDecimal ? /[^0-9.]/g : /[^0-9]/g, "");
  }

  return (
    <input
      type="text"
      inputMode={allowDecimal ? "decimal" : "numeric"}
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
      className={className}
    />
  );
}
