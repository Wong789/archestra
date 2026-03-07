import { useState, useEffect, useCallback } from "react";
import { useTauri } from "../hooks/useTauri";
import Button from "./Button";
import type { ContainerConfig, PodInfo, ClusterInfo } from "../types";

interface PodsTabProps {
  config: ContainerConfig | null;
  containerRunning: boolean;
  visible: boolean;
  onViewPodLogs: (podName: string) => void;
}

const podStatusColors: Record<string, string> = {
  Running: "bg-success shadow-[0_0_8px_theme(colors.success.DEFAULT)]",
  Pending: "bg-warning animate-pulse",
  Failed: "bg-danger",
  CrashLoopBackOff: "bg-danger",
  Succeeded: "bg-info",
};

export default function PodsTab({ config, containerRunning, visible, onViewPodLogs }: PodsTabProps) {
  const api = useTauri();
  const [pods, setPods] = useState<PodInfo[]>([]);
  const [cluster, setCluster] = useState<ClusterInfo | null>(null);
  const [detailModal, setDetailModal] = useState<{ title: string; content: string } | null>(null);

  const containerName = config?.container_name || "archestra";

  const refresh = useCallback(async () => {
    if (!containerRunning) return;
    try {
      const [podList, clusterInfo] = await Promise.all([
        api.listPods(containerName),
        api.getClusterInfo(containerName).catch(() => null),
      ]);
      setPods(podList);
      setCluster(clusterInfo);
    } catch (e) {
      console.error("Failed to load pods:", e);
    }
  }, [containerRunning, containerName]);

  useEffect(() => {
    if (visible && containerRunning) refresh();
  }, [visible, containerRunning]);

  async function handleDescribe(podName: string) {
    try {
      const detail = await api.describePod(containerName, podName);
      setDetailModal({ title: `Pod: ${podName}`, content: detail });
    } catch (e) {
      alert("Failed to describe pod: " + e);
    }
  }

  async function handleRestart(podName: string) {
    if (!confirm(`Restart pod "${podName}"? It will be recreated by its deployment.`)) return;
    try {
      await api.restartPod(containerName, podName);
      await refresh();
    } catch (e) {
      alert("Failed to restart pod: " + e);
    }
  }

  async function handleDelete(podName: string) {
    if (!confirm(`Delete pod "${podName}" and its deployment? This cannot be undone.`)) return;
    try {
      await api.deletePod(containerName, podName);
      await refresh();
    } catch (e) {
      alert("Failed to delete pod: " + e);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-[22px] font-semibold">MCP Server Pods</h2>
        <Button size="sm" onClick={refresh}>Refresh</Button>
      </div>

      <div className="flex flex-col gap-3">
        {!containerRunning ? (
          <div className="flex items-center justify-center h-[200px] text-content-muted">
            Start the container to view pods
          </div>
        ) : pods.length === 0 ? (
          <div className="flex items-center justify-center h-[200px] text-content-muted">
            No MCP server pods found
          </div>
        ) : (
          pods.map((pod) => (
            <div
              key={pod.name}
              className="bg-surface-secondary border border-border rounded-lg p-4 flex items-center gap-4"
            >
              <div
                className={`w-3 h-3 rounded-full shrink-0 ${
                  podStatusColors[pod.status] || "bg-content-muted"
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm mb-0.5">{pod.name}</div>
                <div className="text-xs text-content-secondary flex gap-4">
                  <span>Image: {pod.image}</span>
                  <span>Restarts: {pod.restarts}</span>
                  <span>Status: {pod.status}</span>
                </div>
              </div>
              <div className="flex gap-3 text-xs text-content-secondary font-mono">
                {pod.cpu && <span>CPU: {pod.cpu}</span>}
                {pod.memory && <span>Mem: {pod.memory}</span>}
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" onClick={() => onViewPodLogs(pod.name)}>Logs</Button>
                <Button size="sm" onClick={() => handleDescribe(pod.name)}>Describe</Button>
                <Button size="sm" onClick={() => handleRestart(pod.name)}>Restart</Button>
                <Button size="sm" variant="danger" onClick={() => handleDelete(pod.name)}>Delete</Button>
              </div>
            </div>
          ))
        )}
      </div>

      {cluster && (
        <div className="flex gap-6 px-4 py-3 bg-surface-secondary border border-border rounded-lg mt-4 text-xs text-content-secondary font-mono">
          <span>Cluster: {cluster.cluster_name}</span>
          <span>Nodes: {cluster.node_count}</span>
          <span>Pods: {cluster.pod_count}/{cluster.total_pods}</span>
          <span>CPU: {cluster.cpu_usage || "-"}</span>
          <span>Memory: {cluster.memory_usage || "-"}</span>
        </div>
      )}

      {/* Pod detail modal */}
      {detailModal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setDetailModal(null)}
        >
          <div
            className="bg-surface-secondary border border-border rounded-lg w-[90%] max-w-[700px] max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-4 border-b border-border">
              <h3 className="text-base font-semibold">{detailModal.title}</h3>
              <button
                onClick={() => setDetailModal(null)}
                className="bg-transparent border-none text-content-secondary text-2xl cursor-pointer px-1 hover:text-content-primary"
              >
                &times;
              </button>
            </div>
            <pre className="px-4 py-4 overflow-y-auto font-mono text-xs leading-relaxed text-content-secondary whitespace-pre-wrap">
              {detailModal.content}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
