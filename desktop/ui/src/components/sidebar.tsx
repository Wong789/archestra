"use client";

import { Home, FileText, Monitor, Database, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Tab } from "@/lib/types";

const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "logs", label: "Logs", icon: FileText },
  { id: "pods", label: "Pods", icon: Monitor },
  { id: "database", label: "Database", icon: Database },
  { id: "settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  updateAvailable: boolean;
}

export function Sidebar({ activeTab, onTabChange, updateAvailable }: SidebarProps) {
  return (
    <nav className="w-[220px] bg-sidebar border-r border-sidebar-border flex flex-col shrink-0">
      <div className="px-4 pt-5 pb-4 flex items-center gap-2">
        <h1 className="text-lg font-bold text-sidebar-primary">Archestra</h1>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">v0.1.0</Badge>
      </div>

      <div className="px-2 py-1 flex-1 space-y-0.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-sm transition-colors cursor-pointer",
                activeTab === tab.id
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="px-4 py-3 border-t border-sidebar-border">
        {updateAvailable && (
          <div className="flex items-center gap-2 px-3 py-2 bg-sidebar-accent rounded-md text-sidebar-accent-foreground text-xs">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span>Update available</span>
          </div>
        )}
      </div>
    </nav>
  );
}
