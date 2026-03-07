"use client";

import { useState, useEffect, useCallback } from "react";
import { useTauri } from "@/hooks/use-tauri";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ContainerConfig, PodInfo, ClusterInfo } from "@/lib/types";

interface PodsTabProps {
  config: ContainerConfig | null;
  containerRunning: boolean;
  visible: boolean;
  onViewPodLogs: (podName: string) => void;
}

const podStatusVariant: Record<string, "success" | "warning" | "destructive" | "default" | "secondary"> = {
  Running: "success",
  Pending: "warning",
  Failed: "destructive",
  CrashLoopBackOff: "destructive",
  Succeeded: "default",
};

export function PodsTab({ config, containerRunning, visible, onViewPodLogs }: PodsTabProps) {
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
    } catch (e) { console.error("Failed to load pods:", e); }
  }, [containerRunning, containerName]);

  useEffect(() => {
    if (visible && containerRunning) refresh();
  }, [visible, containerRunning]);

  async function handleDescribe(podName: string) {
    try {
      const detail = await api.describePod(containerName, podName);
      setDetailModal({ title: `Pod: ${podName}`, content: detail });
    } catch (e) { alert("Failed to describe pod: " + e); }
  }

  async function handleRestart(podName: string) {
    if (!confirm(`Restart pod "${podName}"? It will be recreated by its deployment.`)) return;
    try { await api.restartPod(containerName, podName); await refresh(); }
    catch (e) { alert("Failed to restart pod: " + e); }
  }

  async function handleDelete(podName: string) {
    if (!confirm(`Delete pod "${podName}" and its deployment? This cannot be undone.`)) return;
    try { await api.deletePod(containerName, podName); await refresh(); }
    catch (e) { alert("Failed to delete pod: " + e); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">MCP Server Pods</h2>
        <Button size="sm" variant="outline" onClick={refresh}>Refresh</Button>
      </div>

      <div className="space-y-3">
        {!containerRunning ? (
          <div className="flex items-center justify-center h-[200px] text-muted-foreground">Start the container to view pods</div>
        ) : pods.length === 0 ? (
          <div className="flex items-center justify-center h-[200px] text-muted-foreground">No MCP server pods found</div>
        ) : (
          pods.map((pod) => (
            <Card key={pod.name} className="flex flex-row items-center gap-4 p-4">
              <span className={cn(
                "w-3 h-3 rounded-full shrink-0",
                pod.status === "Running" && "bg-success shadow-[0_0_8px_var(--success)]",
                pod.status === "Pending" && "bg-warning animate-pulse",
                (pod.status === "Failed" || pod.status === "CrashLoopBackOff") && "bg-destructive",
                pod.status === "Succeeded" && "bg-primary",
              )} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{pod.name}</div>
                <div className="text-xs text-muted-foreground flex gap-4 mt-0.5">
                  <span>Image: {pod.image}</span>
                  <span>Restarts: {pod.restarts}</span>
                  <Badge variant={podStatusVariant[pod.status] || "secondary"} className="text-[10px]">{pod.status}</Badge>
                </div>
              </div>
              {(pod.cpu || pod.memory) && (
                <div className="flex gap-3 text-xs text-muted-foreground font-mono">
                  {pod.cpu && <span>CPU: {pod.cpu}</span>}
                  {pod.memory && <span>Mem: {pod.memory}</span>}
                </div>
              )}
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" onClick={() => onViewPodLogs(pod.name)}>Logs</Button>
                <Button size="sm" variant="outline" onClick={() => handleDescribe(pod.name)}>Describe</Button>
                <Button size="sm" variant="outline" onClick={() => handleRestart(pod.name)}>Restart</Button>
                <Button size="sm" variant="destructive" onClick={() => handleDelete(pod.name)}>Delete</Button>
              </div>
            </Card>
          ))
        )}
      </div>

      {cluster && (
        <Card className="flex flex-row gap-6 px-4 py-3 text-xs text-muted-foreground font-mono">
          <span>Cluster: {cluster.cluster_name}</span>
          <span>Nodes: {cluster.node_count}</span>
          <span>Pods: {cluster.pod_count}/{cluster.total_pods}</span>
          <span>CPU: {cluster.cpu_usage || "-"}</span>
          <span>Memory: {cluster.memory_usage || "-"}</span>
        </Card>
      )}

      <Dialog open={!!detailModal} onOpenChange={() => setDetailModal(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{detailModal?.title}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <pre className="font-mono text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap p-4">
              {detailModal?.content}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
