import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "type"> {
  label: string;
  children: ReactNode;
  tone?: "neutral" | "danger";
}

export default function IconButton({
  label,
  children,
  className = "",
  tone = "neutral",
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      type="button"
      aria-label={label}
      className={`ui-icon-button press ${tone === "danger" ? "is-danger" : ""} ${className}`.trim()}
    >
      {children}
    </button>
  );
}
