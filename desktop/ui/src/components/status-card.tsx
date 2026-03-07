"use client";

import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatusCardProps {
  title: string;
  status: string;
  value: string;
  sub?: string;
  description?: string;
  warning?: string;
  className?: string;
  children?: ReactNode;
}

function statusDotClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "running") return "bg-success shadow-[0_0_8px_var(--success)]";
  if (s === "starting" || s === "pulling") return "bg-warning animate-pulse";
  if (s === "error") return "bg-destructive";
  if (s === "stopped") return "bg-muted-foreground";
  return "bg-muted-foreground";
}

export function StatusCard({
  title,
  status,
  value,
  sub,
  description,
  warning,
  className,
  children,
}: StatusCardProps) {
  return (
    <Card className={cn("py-0", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
            {title}
          </CardTitle>
          <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", statusDotClass(status))} />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-base font-semibold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
        {description && <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>}
        {children && <div className="flex gap-2 pt-1">{children}</div>}
        {warning && <p className="text-xs text-warning pt-1">{warning}</p>}
      </CardContent>
    </Card>
  );
}
