import { useState, useEffect } from "react";
import { useTauri } from "../hooks/useTauri";
import Button from "./Button";
import type { ContainerConfig } from "../types";

interface SettingsTabProps {
  config: ContainerConfig | null;
  onConfigChange: (config: ContainerConfig) => void;
}

const defaults: ContainerConfig = {
  image: "archestra/platform:latest",
  container_name: "archestra",
  frontend_port: 3000,
  backend_port: 9000,
  drizzle_studio_port: 4983,
  cpu_limit: "4",
  memory_limit: "4g",
};

export default function SettingsTab({ config, onConfigChange }: SettingsTabProps) {
  const api = useTauri();

  const [image, setImage] = useState("");
  const [containerName, setContainerName] = useState("");
  const [frontendPort, setFrontendPort] = useState(3000);
  const [backendPort, setBackendPort] = useState(9000);
  const [drizzlePort, setDrizzlePort] = useState(4983);
  const [cpu, setCpu] = useState("4");
  const [memory, setMemory] = useState("4g");
  const [autoUpdate, setAutoUpdate] = useState(true);

  useEffect(() => {
    if (config) {
      setImage(config.image);
      setContainerName(config.container_name);
      setFrontendPort(config.frontend_port);
      setBackendPort(config.backend_port);
      setDrizzlePort(config.drizzle_studio_port);
      setCpu(config.cpu_limit);
      setMemory(config.memory_limit);
    }
  }, [config]);

  async function handleSave() {
    const newConfig: ContainerConfig = {
      image,
      container_name: containerName,
      frontend_port: frontendPort,
      backend_port: backendPort,
      drizzle_studio_port: drizzlePort,
      cpu_limit: cpu,
      memory_limit: memory,
    };
    try {
      await api.setContainerConfig(newConfig);
      onConfigChange(newConfig);
      alert("Settings saved! Restart the container for changes to take effect.");
    } catch (e) {
      alert("Failed to save settings: " + e);
    }
  }

  async function handleReset() {
    if (!confirm("Reset all settings to defaults?")) return;
    try {
      await api.setContainerConfig(defaults);
      onConfigChange(defaults);
      alert("Settings reset to defaults.");
    } catch (e) {
      alert("Failed to reset settings: " + e);
    }
  }

  const inputClass =
    "w-full px-3 py-1.5 border border-border rounded bg-surface-tertiary text-content-primary text-[13px] focus:outline-none focus:border-accent";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-[22px] font-semibold">Settings</h2>
      </div>

      {/* Container config */}
      <div className="bg-surface-secondary border border-border rounded-lg p-5 mb-4">
        <h3 className="text-[15px] font-semibold mb-1">Container Configuration</h3>
        <p className="text-[13px] text-content-secondary mb-4">
          Changes require a container restart to take effect.
        </p>

        <div className="mb-3.5">
          <label className="block text-xs text-content-secondary mb-1 font-medium">Docker Image</label>
          <input type="text" value={image} onChange={(e) => setImage(e.target.value)} className={`${inputClass} max-w-[400px]`} />
        </div>
        <div className="mb-3.5">
          <label className="block text-xs text-content-secondary mb-1 font-medium">Container Name</label>
          <input type="text" value={containerName} onChange={(e) => setContainerName(e.target.value)} className={`${inputClass} max-w-[400px]`} />
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-xs text-content-secondary mb-1 font-medium">Frontend Port</label>
            <input type="number" value={frontendPort} onChange={(e) => setFrontendPort(Number(e.target.value))} className={inputClass} />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-content-secondary mb-1 font-medium">Backend Port</label>
            <input type="number" value={backendPort} onChange={(e) => setBackendPort(Number(e.target.value))} className={inputClass} />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-content-secondary mb-1 font-medium">Drizzle Studio Port</label>
            <input type="number" value={drizzlePort} onChange={(e) => setDrizzlePort(Number(e.target.value))} className={inputClass} />
          </div>
        </div>

        <h3 className="text-[15px] font-semibold mt-5 mb-1">Resource Limits</h3>
        <p className="text-[13px] text-content-secondary mb-4">
          Resources allocated to the container runtime (Colima/Lima).
        </p>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-xs text-content-secondary mb-1 font-medium">CPU Cores</label>
            <input type="text" value={cpu} onChange={(e) => setCpu(e.target.value)} className={inputClass} />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-content-secondary mb-1 font-medium">Memory (e.g., 4g)</label>
            <input type="text" value={memory} onChange={(e) => setMemory(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <Button variant="primary" onClick={handleSave}>Save Settings</Button>
          <Button onClick={handleReset}>Reset to Defaults</Button>
        </div>
      </div>

      {/* Auto-update */}
      <div className="bg-surface-secondary border border-border rounded-lg p-5">
        <h3 className="text-[15px] font-semibold mb-1">Auto-Update</h3>
        <p className="text-[13px] text-content-secondary mb-4">
          Automatically check for new Docker images on startup.
        </p>
        <label className="flex items-center gap-2 cursor-pointer text-[13px]">
          <input
            type="checkbox"
            checked={autoUpdate}
            onChange={(e) => setAutoUpdate(e.target.checked)}
            className="accent-accent"
          />
          <span>Check for updates on startup</span>
        </label>
      </div>
    </div>
  );
}
