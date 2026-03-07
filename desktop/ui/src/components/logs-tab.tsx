"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTauri } from "@/hooks/use-tauri";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ContainerConfig, LogEntry } from "@/lib/types";

interface LogsTabProps {
  config: ContainerConfig | null;
  containerRunning: boolean;
  visible: boolean;
  podLogsRequest: { podName: string } | null;
  onPodLogsClear: () => void;
}

const sourceVariant: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  backend: "default",
  frontend: "success",
  postgres: "warning",
  kind: "secondary",
  supervisor: "secondary",
  system: "outline",
};

const levelColors: Record<string, string> = {
  error: "text-destructive",
  warn: "text-warning",
  info: "text-primary",
  debug: "text-muted-foreground",
};

export function LogsTab({ config, containerRunning, visible, podLogsRequest, onPodLogsClear }: LogsTabProps) {
  const api = useTauri();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerName = config?.container_name || "archestra";

  const fetchLogs = useCallback(async () => {
    if (!containerRunning) return;
    try {
      setLogs(await api.getContainerLogs(containerName, 500, sourceFilter, levelFilter));
    } catch (e) {
      console.error("Failed to fetch logs:", e);
    }
  }, [containerRunning, containerName, sourceFilter, levelFilter]);

  useEffect(() => {
    if (visible && containerRunning && !podLogsRequest) fetchLogs();
  }, [visible, containerRunning, sourceFilter, levelFilter, podLogsRequest]);

  useEffect(() => {
    if (!podLogsRequest) return;
    (async () => {
      try {
        setLogs(await api.getPodLogs(config?.backend_port || 9000, podLogsRequest.podName, 200));
      } catch (e) {
        console.error("Failed to fetch pod logs:", e);
      }
    })();
    return () => onPodLogsClear();
  }, [podLogsRequest]);

  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [logs]);

  function handleSearchChange(value: string) {
    setSearch(value);
    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(fetchLogs, 300);
  }

  async function handleDownload() {
    try {
      const allLogs = await api.getContainerLogs(containerName, 5000, "all", "all");
      const text = allLogs.map((l) => `${l.timestamp || ""} [${l.source}] ${l.level} ${l.message}`).join("\n");
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `archestra-logs-${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert("Failed to download logs: " + e); }
  }

  const filtered = search ? logs.filter((l) => l.message.toLowerCase().includes(search.toLowerCase())) : logs;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold">Logs</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="backend">Backend</SelectItem>
              <SelectItem value="frontend">Frontend</SelectItem>
              <SelectItem value="postgres">PostgreSQL</SelectItem>
              <SelectItem value="kind">KinD</SelectItem>
              <SelectItem value="supervisor">Supervisor</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="warn">Warning</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="debug">Debug</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search logs..."
            className="w-[200px]"
          />
          <Button size="sm" variant="outline" onClick={fetchLogs}>Refresh</Button>
          <Button size="sm" variant="outline" onClick={handleDownload}>Download</Button>
        </div>
      </div>

      <div ref={containerRef} className="rounded-lg border bg-card h-[calc(100vh-160px)] overflow-y-auto font-mono text-xs leading-7">
        {!containerRunning ? (
          <div className="flex items-center justify-center h-[200px] text-muted-foreground">Start the container to view logs</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-[200px] text-muted-foreground">No logs matching filters</div>
        ) : (
          filtered.map((entry, i) => {
            const ts = entry.timestamp ? entry.timestamp.substring(11, 19) : "";
            return (
              <div key={i} className="px-3 py-0.5 flex items-center gap-2 border-b border-border/30 hover:bg-accent/30">
                <span className="text-muted-foreground shrink-0 min-w-[75px]">{ts}</span>
                <Badge variant={sourceVariant[entry.source] || "outline"} className="text-[10px] min-w-[70px] justify-center">
                  {entry.source}
                </Badge>
                <span className={cn("text-[10px] font-bold min-w-[40px] shrink-0", levelColors[entry.level] || "text-muted-foreground")}>
                  {entry.level.toUpperCase()}
                </span>
                <span className="break-all flex-1">{entry.message}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
