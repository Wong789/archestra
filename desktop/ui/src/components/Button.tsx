import type { ButtonHTMLAttributes } from "react";

type Variant = "default" | "primary" | "danger";
type Size = "default" | "sm";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  default:
    "bg-surface-tertiary border-border text-content-primary hover:bg-surface-hover hover:border-content-muted",
  primary:
    "bg-accent border-accent text-white hover:bg-accent-hover hover:border-accent-hover",
  danger:
    "bg-transparent border-danger text-danger hover:bg-danger-muted",
};

export default function Button({
  variant = "default",
  size = "default",
  className = "",
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={`border rounded cursor-pointer whitespace-nowrap transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-4 py-2 text-[13px]"
      } ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
