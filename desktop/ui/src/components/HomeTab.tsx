import { useState, useEffect, useCallback } from "react";
import { useTauri } from "../hooks/useTauri";
import StatusCard from "./StatusCard";
import Button from "./Button";
import type { RuntimeInfo, ContainerStatus, ContainerConfig, ImageInfo } from "../types";

interface HomeTabProps {
  config: ContainerConfig | null;
  onUpdateAvailable: () => void;
}

const runtimeNames: Record<string, string> = {
  Colima: "Colima",
  Lima: "Lima",
  DockerDesktop: "Docker Desktop",
  Podman: "Podman",
  Wsl2: "WSL2",
  NativeDocker: "Docker (Native)",
  None: "Not Found",
};

export default function HomeTab({ config, onUpdateAvailable }: HomeTabProps) {
  const api = useTauri();

  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [container, setContainer] = useState<ContainerStatus | null>(null);
  const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null);
  const [clusterName, setClusterName] = useState("-");
  const [clusterPods, setClusterPods] = useState("");
  const [clusterStatus, setClusterStatus] = useState("neutral");
  const [imageStatus, setImageStatus] = useState("neutral");
  const [imageSub, setImageSub] = useState("");
  const [showPullBtn, setShowPullBtn] = useState(false);

  const [runtimeLoading, setRuntimeLoading] = useState<string | null>(null);
  const [containerLoading, setContainerLoading] = useState<string | null>(null);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [pullLoading, setPullLoading] = useState(false);

  const containerRunning = container?.status === "Running";

  const refreshContainer = useCallback(async () => {
    try {
      const info = await api.getContainerStatus();
      setContainer(info);
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const rt = await api.detectRuntime();
        setRuntime(rt);
      } catch {}
      await refreshContainer();
      try {
        const img = await api.getCurrentImageInfo();
        setImageInfo(img);
        setImageSub(`Size: ${img.size} | ID: ${img.image_id}`);
      } catch {}
    })();

    const interval = setInterval(refreshContainer, 10000);
    return () => clearInterval(interval);
  }, []);

  // Fetch cluster info when container is running
  useEffect(() => {
    if (!containerRunning || !config) return;
    (async () => {
      try {
        const cluster = await api.getClusterInfo(config.container_name);
        setClusterName(cluster.cluster_name);
        setClusterPods(`${cluster.pod_count}/${cluster.total_pods} pods running`);
        setClusterStatus(cluster.pod_count > 0 ? "running" : "neutral");
      } catch {}
    })();
  }, [containerRunning, config]);

  function formatUptime(uptime: string | null): string {
    if (!uptime) return "";
    const started = new Date(uptime);
    const diff = Date.now() - started.getTime();
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return hours > 0 ? `Up ${hours}h ${minutes}m` : `Up ${minutes}m`;
  }

  async function handleStartRuntime() {
    setRuntimeLoading("Starting...");
    try {
      const info = await api.startRuntime();
      setRuntime(info);
      await refreshContainer();
    } catch (e) {
      alert("Failed to start runtime: " + e);
    }
    setRuntimeLoading(null);
  }

  async function handleStopRuntime() {
    setRuntimeLoading("Stopping...");
    try {
      await api.stopRuntime();
      const info = await api.detectRuntime();
      setRuntime(info);
    } catch (e) {
      alert("Failed to stop runtime: " + e);
    }
    setRuntimeLoading(null);
  }

  async function handleStartContainer() {
    setContainerLoading("Starting...");
    try {
      const info = await api.startContainer();
      setContainer(info);
    } catch (e) {
      alert("Failed to start container: " + e);
    }
    setContainerLoading(null);
  }

  async function handleStopContainer() {
    setContainerLoading("Stopping...");
    try {
      await api.stopContainer();
      await refreshContainer();
    } catch (e) {
      alert("Failed to stop container: " + e);
    }
    setContainerLoading(null);
  }

  async function handleRestartContainer() {
    setContainerLoading("Restarting...");
    try {
      await api.restartContainer();
      await refreshContainer();
    } catch (e) {
      alert("Failed to restart container: " + e);
    }
    setContainerLoading(null);
  }

  async function handleCheckUpdates() {
    setUpdateLoading(true);
    try {
      const info = await api.checkForUpdates();
      if (info.update_available) {
        setImageStatus("starting");
        setShowPullBtn(true);
        setImageSub(`Update available! Last updated: ${info.last_updated || "unknown"}`);
        onUpdateAvailable();
      } else {
        setImageStatus("running");
        setImageSub("Up to date");
      }
    } catch (e) {
      alert("Failed to check updates: " + e);
    }
    setUpdateLoading(false);
  }

  async function handlePullImage() {
    setPullLoading(true);
    try {
      await api.pullLatestImage();
      setImageStatus("running");
      setShowPullBtn(false);
      const img = await api.getCurrentImageInfo();
      setImageInfo(img);
      setImageSub(`Size: ${img.size} | ID: ${img.image_id}`);
      alert("Image updated! Restart the container to use the new version.");
    } catch (e) {
      alert("Failed to pull image: " + e);
    }
    setPullLoading(false);
  }

  function openUrl(port: number) {
    if (containerRunning) window.open(`http://localhost:${port}`, "_blank");
  }

  const frontendPort = config?.frontend_port || 3000;
  const backendPort = config?.backend_port || 9000;
  const drizzlePort = config?.drizzle_studio_port || 4983;

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-[22px] font-semibold">Dashboard</h2>
        <Button
          variant="primary"
          disabled={!containerRunning}
          onClick={() => openUrl(frontendPort)}
        >
          Open Archestra UI
        </Button>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4 mb-6">
        <StatusCard
          title="Runtime"
          status={runtime?.status || "stopped"}
          value={runtimeNames[runtime?.runtime_type || "None"] || runtime?.runtime_type || "Detecting..."}
          sub={runtime?.version || ""}
        >
          <Button
            size="sm"
            disabled={runtime?.status === "Running" || runtime?.runtime_type === "None" || !!runtimeLoading}
            onClick={handleStartRuntime}
          >
            {runtimeLoading === "Starting..." ? "Starting..." : "Start"}
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={runtime?.status !== "Running" || runtime?.runtime_type === "NativeDocker" || !!runtimeLoading}
            onClick={handleStopRuntime}
          >
            {runtimeLoading === "Stopping..." ? "Stopping..." : "Stop"}
          </Button>
        </StatusCard>

        <StatusCard
          title="Container"
          status={container?.status || "stopped"}
          value={container?.image || "-"}
          sub={formatUptime(container?.uptime || null)}
        >
          <Button
            size="sm"
            variant="primary"
            disabled={containerRunning || !!containerLoading}
            onClick={handleStartContainer}
          >
            {containerLoading === "Starting..." ? "Starting..." : "Start"}
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={!containerRunning || !!containerLoading}
            onClick={handleStopContainer}
          >
            {containerLoading === "Stopping..." ? "Stopping..." : "Stop"}
          </Button>
          <Button
            size="sm"
            disabled={!containerRunning || !!containerLoading}
            onClick={handleRestartContainer}
          >
            {containerLoading === "Restarting..." ? "Restarting..." : "Restart"}
          </Button>
        </StatusCard>

        <StatusCard
          title="Image"
          status={imageStatus}
          value={imageInfo?.image || "-"}
          sub={imageSub}
        >
          <Button size="sm" disabled={updateLoading} onClick={handleCheckUpdates}>
            {updateLoading ? "Checking..." : "Check for Updates"}
          </Button>
          {showPullBtn && (
            <Button size="sm" variant="primary" disabled={pullLoading} onClick={handlePullImage}>
              {pullLoading ? "Pulling..." : "Pull Update"}
            </Button>
          )}
        </StatusCard>

        <StatusCard
          title="Cluster"
          status={clusterStatus}
          value={clusterName}
          sub={clusterPods}
        />
      </div>

      {/* Quick Links */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold mb-3 text-content-secondary">Quick Links</h3>
        <div className="flex gap-3 flex-wrap">
          {[
            { label: "Frontend", port: frontendPort, icon: "rect" },
            { label: "Backend API", port: backendPort, icon: "server" },
            { label: "Drizzle Studio", port: drizzlePort, icon: "db" },
          ].map((link) => (
            <button
              key={link.label}
              onClick={() => openUrl(link.port)}
              disabled={!containerRunning}
              className={`flex items-center gap-2.5 px-4 py-3 bg-surface-secondary border border-border rounded-lg text-content-primary no-underline transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                containerRunning ? "hover:border-accent hover:bg-accent-muted" : ""
              }`}
            >
              <span className="text-content-secondary">
                {link.icon === "rect" && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                  </svg>
                )}
                {link.icon === "server" && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                    <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                    <line x1="6" y1="6" x2="6.01" y2="6" />
                    <line x1="6" y1="18" x2="6.01" y2="18" />
                  </svg>
                )}
                {link.icon === "db" && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <ellipse cx="12" cy="5" rx="9" ry="3" />
                    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                  </svg>
                )}
              </span>
              <span>{link.label}</span>
              <span className="font-mono text-xs text-content-muted">:{link.port}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
