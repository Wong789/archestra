import type { ReactNode } from "react";

interface StatusCardProps {
  title: string;
  status: string;
  value: string;
  sub?: string;
  wide?: boolean;
  description?: string;
  warning?: string;
  children?: ReactNode;
}

function statusDotClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "running") return "status-dot status-dot-running";
  if (s === "starting" || s === "pulling") return "status-dot status-dot-starting";
  if (s === "error") return "status-dot status-dot-error";
  if (s === "stopped") return "status-dot status-dot-stopped";
  return "status-dot status-dot-neutral";
}

export default function StatusCard({
  title,
  status,
  value,
  sub,
  wide,
  description,
  warning,
  children,
}: StatusCardProps) {
  return (
    <div
      className={`bg-surface-secondary border border-border rounded-lg p-4 ${
        wide ? "col-span-full max-w-[600px]" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wide text-content-secondary font-semibold">
          {title}
        </span>
        <span className={statusDotClass(status)} />
      </div>
      <div className="text-base font-semibold mb-1">{value}</div>
      {sub && <div className="text-xs text-content-secondary mb-3">{sub}</div>}
      {description && (
        <p className="text-content-secondary text-[13px] mb-4 leading-relaxed">{description}</p>
      )}
      {children && <div className="flex gap-2">{children}</div>}
      {warning && <p className="text-warning text-xs mt-3">{warning}</p>}
    </div>
  );
}
