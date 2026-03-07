import { useState, useEffect } from "react";
import { useTauri } from "../hooks/useTauri";
import StatusCard from "./StatusCard";
import Button from "./Button";
import type { ContainerConfig } from "../types";

interface DatabaseTabProps {
  config: ContainerConfig | null;
  containerRunning: boolean;
}

export default function DatabaseTab({ config, containerRunning }: DatabaseTabProps) {
  const api = useTauri();
  const [drizzleRunning, setDrizzleRunning] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const status = await api.getDrizzleStudioStatus();
        setDrizzleRunning(status);
      } catch {}
    })();
  }, []);

  async function handleToggle() {
    setLoading(true);
    try {
      const result = await api.toggleDrizzleStudio(!drizzleRunning);
      setDrizzleRunning(result);
    } catch (e) {
      alert("Failed to toggle Drizzle Studio: " + e);
    }
    setLoading(false);
  }

  function handleOpen() {
    const port = config?.drizzle_studio_port || 4983;
    window.open(`http://localhost:${port}`, "_blank");
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-[22px] font-semibold">Database</h2>
      </div>

      <div className="max-w-[600px]">
        <StatusCard
          title="Drizzle Studio"
          status={drizzleRunning ? "running" : "stopped"}
          value={drizzleRunning ? "Running" : "Stopped"}
          wide
          description="Drizzle Studio provides a visual interface for browsing and managing the Archestra PostgreSQL database. It runs inside the container and is accessible via your browser."
          warning="Warning: Drizzle Studio gives full read/write access to the database. Use with caution."
        >
          <Button
            variant={drizzleRunning ? "danger" : "primary"}
            disabled={loading || !containerRunning}
            onClick={handleToggle}
          >
            {loading
              ? drizzleRunning ? "Disabling..." : "Enabling..."
              : drizzleRunning ? "Disable Drizzle Studio" : "Enable Drizzle Studio"}
          </Button>
          {drizzleRunning && (
            <Button size="sm" onClick={handleOpen}>
              Open in Browser
            </Button>
          )}
        </StatusCard>
      </div>
    </div>
  );
}
