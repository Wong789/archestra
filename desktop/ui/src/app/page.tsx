"use client";

import { useState, useEffect, useCallback } from "react";
import { useTauri } from "@/hooks/use-tauri";
import { Sidebar } from "@/components/sidebar";
import { HomeTab } from "@/components/home-tab";
import { LogsTab } from "@/components/logs-tab";
import { PodsTab } from "@/components/pods-tab";
import { DatabaseTab } from "@/components/database-tab";
import { SettingsTab } from "@/components/settings-tab";
import type { Tab, ContainerConfig, ContainerStatus } from "@/lib/types";

export default function Page() {
  const api = useTauri();
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [config, setConfig] = useState<ContainerConfig | null>(null);
  const [containerStatus, setContainerStatus] = useState<ContainerStatus | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [podLogsRequest, setPodLogsRequest] = useState<{ podName: string } | null>(null);

  const containerRunning = containerStatus?.status === "Running";

  useEffect(() => {
    (async () => {
      try { setConfig(await api.getContainerConfig()); } catch (e) { console.error("Failed to load config:", e); }
    })();
  }, []);

  const refreshStatus = useCallback(async () => {
    try { setContainerStatus(await api.getContainerStatus()); } catch {}
  }, []);

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 10000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  function handleViewPodLogs(podName: string) {
    setPodLogsRequest({ podName });
    setActiveTab("logs");
  }

  return (
    <div className="flex h-screen">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} updateAvailable={updateAvailable} />
      <main className="flex-1 overflow-y-auto p-6">
        {activeTab === "home" && <HomeTab config={config} onUpdateAvailable={() => setUpdateAvailable(true)} />}
        {activeTab === "logs" && <LogsTab config={config} containerRunning={containerRunning} visible={activeTab === "logs"} podLogsRequest={podLogsRequest} onPodLogsClear={() => setPodLogsRequest(null)} />}
        {activeTab === "pods" && <PodsTab config={config} containerRunning={containerRunning} visible={activeTab === "pods"} onViewPodLogs={handleViewPodLogs} />}
        {activeTab === "database" && <DatabaseTab config={config} containerRunning={containerRunning} />}
        {activeTab === "settings" && <SettingsTab config={config} onConfigChange={setConfig} />}
      </main>
    </div>
  );
}
