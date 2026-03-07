import { useState, useEffect, useRef, useCallback } from "react";
import { useTauri } from "../hooks/useTauri";
import Button from "./Button";
import type { ContainerConfig, LogEntry } from "../types";

interface LogsTabProps {
  config: ContainerConfig | null;
  containerRunning: boolean;
  visible: boolean;
  podLogsRequest: { podName: string } | null;
  onPodLogsClear: () => void;
}

const sourceColors: Record<string, string> = {
  backend: "bg-accent-muted text-accent-hover",
  frontend: "bg-success-muted text-success",
  postgres: "bg-warning-muted text-warning",
  kind: "bg-[rgba(139,92,246,0.15)] text-[#a78bfa]",
  supervisor: "bg-[rgba(236,72,153,0.15)] text-[#f472b6]",
  system: "bg-surface-tertiary text-content-secondary",
};

const levelColors: Record<string, string> = {
  error: "text-danger",
  warn: "text-warning",
  info: "text-info",
  debug: "text-content-muted",
};

export default function LogsTab({
  config,
  containerRunning,
  visible,
  podLogsRequest,
  onPodLogsClear,
}: LogsTabProps) {
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
      const result = await api.getContainerLogs(containerName, 500, sourceFilter, levelFilter);
      setLogs(result);
    } catch (e) {
      console.error("Failed to fetch logs:", e);
    }
  }, [containerRunning, containerName, sourceFilter, levelFilter]);

  useEffect(() => {
    if (visible && containerRunning && !podLogsRequest) {
      fetchLogs();
    }
  }, [visible, containerRunning, sourceFilter, levelFilter, podLogsRequest]);

  // Handle pod-specific log requests
  useEffect(() => {
    if (!podLogsRequest) return;
    (async () => {
      try {
        const backendPort = config?.backend_port || 9000;
        const result = await api.getPodLogs(backendPort, podLogsRequest.podName, 200);
        setLogs(result);
      } catch (e) {
        console.error("Failed to fetch pod logs:", e);
      }
    })();
    return () => onPodLogsClear();
  }, [podLogsRequest]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  function handleSearchChange(value: string) {
    setSearch(value);
    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(fetchLogs, 300);
  }

  function handleDownload() {
    (async () => {
      try {
        const allLogs = await api.getContainerLogs(containerName, 5000, "all", "all");
        const text = allLogs
          .map((l) => `${l.timestamp || ""} [${l.source}] ${l.level} ${l.message}`)
          .join("\n");
        const blob = new Blob([text], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `archestra-logs-${new Date().toISOString().slice(0, 10)}.txt`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        alert("Failed to download logs: " + e);
      }
    })();
  }

  const filtered = search
    ? logs.filter((l) => l.message.toLowerCase().includes(search.toLowerCase()))
    : logs;

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-[22px] font-semibold">Logs</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="px-3 py-1.5 border border-border rounded bg-surface-tertiary text-content-primary text-[13px] cursor-pointer focus:outline-none focus:border-accent"
          >
            <option value="all">All Sources</option>
            <option value="backend">Backend</option>
            <option value="frontend">Frontend</option>
            <option value="postgres">PostgreSQL</option>
            <option value="kind">KinD</option>
            <option value="supervisor">Supervisor</option>
            <option value="system">System</option>
          </select>
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="px-3 py-1.5 border border-border rounded bg-surface-tertiary text-content-primary text-[13px] cursor-pointer focus:outline-none focus:border-accent"
          >
            <option value="all">All Levels</option>
            <option value="error">Error</option>
            <option value="warn">Warning</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </select>
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search logs..."
            className="px-3 py-1.5 border border-border rounded bg-surface-tertiary text-content-primary text-[13px] focus:outline-none focus:border-accent"
          />
          <Button size="sm" onClick={fetchLogs}>Refresh</Button>
          <Button size="sm" onClick={handleDownload}>Download</Button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="bg-surface-secondary border border-border rounded-lg h-[calc(100vh-160px)] overflow-y-auto font-mono text-xs leading-7"
      >
        {!containerRunning ? (
          <div className="flex items-center justify-center h-[200px] text-content-muted">
            Start the container to view logs
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-[200px] text-content-muted">
            No logs matching filters
          </div>
        ) : (
          filtered.map((entry, i) => {
            const ts = entry.timestamp ? entry.timestamp.substring(11, 19) : "";
            return (
              <div
                key={i}
                className="px-3 py-0.5 flex gap-2 border-b border-white/[0.03] hover:bg-surface-hover"
              >
                <span className="text-content-muted shrink-0 min-w-[85px]">{ts}</span>
                <span
                  className={`px-1.5 rounded-sm text-[10px] font-semibold uppercase shrink-0 min-w-[70px] text-center inline-flex items-center justify-center ${
                    sourceColors[entry.source] || sourceColors.system
                  }`}
                >
                  {entry.source}
                </span>
                <span
                  className={`text-[10px] font-bold min-w-[40px] shrink-0 ${
                    levelColors[entry.level] || "text-content-muted"
                  }`}
                >
                  {entry.level.toUpperCase()}
                </span>
                <span className="text-content-primary break-all flex-1">{entry.message}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
