"use client";

import { useState, useEffect } from "react";
import { useTauri } from "@/hooks/use-tauri";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { ContainerConfig } from "@/lib/types";

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

export function SettingsTab({ config, onConfigChange }: SettingsTabProps) {
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
    if (!config) return;
    setImage(config.image);
    setContainerName(config.container_name);
    setFrontendPort(config.frontend_port);
    setBackendPort(config.backend_port);
    setDrizzlePort(config.drizzle_studio_port);
    setCpu(config.cpu_limit);
    setMemory(config.memory_limit);
  }, [config]);

  async function handleSave() {
    const newConfig: ContainerConfig = {
      image, container_name: containerName, frontend_port: frontendPort,
      backend_port: backendPort, drizzle_studio_port: drizzlePort, cpu_limit: cpu, memory_limit: memory,
    };
    try {
      await api.setContainerConfig(newConfig);
      onConfigChange(newConfig);
      alert("Settings saved! Restart the container for changes to take effect.");
    } catch (e) { alert("Failed to save settings: " + e); }
  }

  async function handleReset() {
    if (!confirm("Reset all settings to defaults?")) return;
    try {
      await api.setContainerConfig(defaults);
      onConfigChange(defaults);
      alert("Settings reset to defaults.");
    } catch (e) { alert("Failed to reset settings: " + e); }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Settings</h2>

      <Card>
        <CardHeader>
          <CardTitle>Container Configuration</CardTitle>
          <CardDescription>Changes require a container restart to take effect.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="image">Docker Image</Label>
            <Input id="image" value={image} onChange={(e) => setImage(e.target.value)} className="max-w-md" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Container Name</Label>
            <Input id="name" value={containerName} onChange={(e) => setContainerName(e.target.value)} className="max-w-md" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fp">Frontend Port</Label>
              <Input id="fp" type="number" value={frontendPort} onChange={(e) => setFrontendPort(Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bp">Backend Port</Label>
              <Input id="bp" type="number" value={backendPort} onChange={(e) => setBackendPort(Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dp">Drizzle Studio Port</Label>
              <Input id="dp" type="number" value={drizzlePort} onChange={(e) => setDrizzlePort(Number(e.target.value))} />
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-semibold mb-1">Resource Limits</h3>
            <p className="text-sm text-muted-foreground mb-3">Resources allocated to the container runtime (Colima/Lima).</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cpu">CPU Cores</Label>
              <Input id="cpu" value={cpu} onChange={(e) => setCpu(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mem">Memory (e.g., 4g)</Label>
              <Input id="mem" value={memory} onChange={(e) => setMemory(e.target.value)} />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave}>Save Settings</Button>
            <Button variant="outline" onClick={handleReset}>Reset to Defaults</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Auto-Update</CardTitle>
          <CardDescription>Automatically check for new Docker images on startup.</CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={autoUpdate}
              onChange={(e) => setAutoUpdate(e.target.checked)}
              className="accent-primary h-4 w-4"
            />
            <span>Check for updates on startup</span>
          </label>
        </CardContent>
      </Card>
    </div>
  );
}
