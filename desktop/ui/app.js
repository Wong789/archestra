// ============================================
// Archestra Desktop - Application Logic
// ============================================

const { invoke } = window.__TAURI__.core;

// ---- State ----

let currentTab = "home";
let containerRunning = false;
let drizzleStudioRunning = false;
let containerConfig = null;
let updateCheckInterval = null;

// ---- Tab Navigation ----

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    const tab = item.dataset.tab;
    switchTab(tab);
  });
});

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".nav-item").forEach((i) => i.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach((t) => t.classList.remove("active"));
  document.querySelector(`.nav-item[data-tab="${tab}"]`).classList.add("active");
  document.getElementById(`tab-${tab}`).classList.add("active");

  if (tab === "logs" && containerRunning) refreshLogs();
  if (tab === "pods" && containerRunning) refreshPods();
}

// ---- Runtime ----

async function detectRuntime() {
  try {
    const info = await invoke("detect_runtime");
    updateRuntimeUI(info);
    return info;
  } catch (e) {
    console.error("Failed to detect runtime:", e);
    return null;
  }
}

function updateRuntimeUI(info) {
  const statusDot = document.getElementById("runtime-status");
  const typeEl = document.getElementById("runtime-type");
  const versionEl = document.getElementById("runtime-version");
  const startBtn = document.getElementById("btn-start-runtime");
  const stopBtn = document.getElementById("btn-stop-runtime");

  const typeNames = {
    Colima: "Colima",
    Lima: "Lima",
    DockerDesktop: "Docker Desktop",
    Podman: "Podman",
    Wsl2: "WSL2",
    NativeDocker: "Docker (Native)",
    None: "Not Found",
  };

  typeEl.textContent = typeNames[info.runtime_type] || info.runtime_type;
  versionEl.textContent = info.version || "";

  statusDot.className = "status-dot " + info.status.toLowerCase();

  startBtn.disabled = info.status === "Running" || info.runtime_type === "None";
  stopBtn.disabled = info.status !== "Running" || info.runtime_type === "NativeDocker";
}

document.getElementById("btn-start-runtime").addEventListener("click", async () => {
  const btn = document.getElementById("btn-start-runtime");
  btn.disabled = true;
  btn.textContent = "Starting...";
  try {
    const info = await invoke("start_runtime");
    updateRuntimeUI(info);
    // After runtime starts, check container
    await refreshContainerStatus();
  } catch (e) {
    alert("Failed to start runtime: " + e);
  }
  btn.textContent = "Start";
});

document.getElementById("btn-stop-runtime").addEventListener("click", async () => {
  const btn = document.getElementById("btn-stop-runtime");
  btn.disabled = true;
  btn.textContent = "Stopping...";
  try {
    await invoke("stop_runtime");
    await detectRuntime();
  } catch (e) {
    alert("Failed to stop runtime: " + e);
  }
  btn.textContent = "Stop";
});

// ---- Container ----

async function refreshContainerStatus() {
  try {
    const info = await invoke("get_container_status");
    updateContainerUI(info);
    return info;
  } catch (e) {
    console.error("Failed to get container status:", e);
    return null;
  }
}

function updateContainerUI(info) {
  const statusDot = document.getElementById("container-status");
  const imageEl = document.getElementById("container-image");
  const uptimeEl = document.getElementById("container-uptime");
  const startBtn = document.getElementById("btn-start-container");
  const stopBtn = document.getElementById("btn-stop-container");
  const restartBtn = document.getElementById("btn-restart-container");
  const openBtn = document.getElementById("btn-open-ui");

  imageEl.textContent = info.image || "-";
  if (info.uptime) {
    const started = new Date(info.uptime);
    const diff = Date.now() - started.getTime();
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    uptimeEl.textContent = hours > 0 ? `Up ${hours}h ${minutes}m` : `Up ${minutes}m`;
  } else {
    uptimeEl.textContent = "";
  }

  statusDot.className = "status-dot " + info.status.toLowerCase();

  containerRunning = info.status === "Running";
  startBtn.disabled = containerRunning;
  stopBtn.disabled = !containerRunning;
  restartBtn.disabled = !containerRunning;
  openBtn.disabled = !containerRunning;

  updateQuickLinks(containerRunning);
}

function updateQuickLinks(running) {
  const links = ["link-frontend", "link-backend", "link-drizzle"];
  links.forEach((id) => {
    const el = document.getElementById(id);
    if (running) {
      el.classList.remove("disabled");
    } else {
      el.classList.add("disabled");
    }
  });
}

document.getElementById("btn-start-container").addEventListener("click", async () => {
  const btn = document.getElementById("btn-start-container");
  btn.disabled = true;
  btn.textContent = "Starting...";
  try {
    const info = await invoke("start_container");
    updateContainerUI(info);
  } catch (e) {
    alert("Failed to start container: " + e);
  }
  btn.textContent = "Start";
});

document.getElementById("btn-stop-container").addEventListener("click", async () => {
  const btn = document.getElementById("btn-stop-container");
  btn.disabled = true;
  btn.textContent = "Stopping...";
  try {
    await invoke("stop_container");
    await refreshContainerStatus();
  } catch (e) {
    alert("Failed to stop container: " + e);
  }
  btn.textContent = "Stop";
});

document.getElementById("btn-restart-container").addEventListener("click", async () => {
  const btn = document.getElementById("btn-restart-container");
  btn.disabled = true;
  btn.textContent = "Restarting...";
  try {
    await invoke("restart_container");
    await refreshContainerStatus();
  } catch (e) {
    alert("Failed to restart container: " + e);
  }
  btn.textContent = "Restart";
});

document.getElementById("btn-open-ui").addEventListener("click", () => {
  const port = containerConfig?.frontend_port || 3000;
  window.open(`http://localhost:${port}`, "_blank");
});

// ---- Quick Links ----

document.getElementById("link-frontend").addEventListener("click", (e) => {
  e.preventDefault();
  if (!containerRunning) return;
  const port = containerConfig?.frontend_port || 3000;
  window.open(`http://localhost:${port}`, "_blank");
});

document.getElementById("link-backend").addEventListener("click", (e) => {
  e.preventDefault();
  if (!containerRunning) return;
  const port = containerConfig?.backend_port || 9000;
  window.open(`http://localhost:${port}`, "_blank");
});

document.getElementById("link-drizzle").addEventListener("click", (e) => {
  e.preventDefault();
  if (!containerRunning || !drizzleStudioRunning) return;
  const port = containerConfig?.drizzle_studio_port || 4983;
  window.open(`http://localhost:${port}`, "_blank");
});

// ---- Image / Updates ----

async function checkImageInfo() {
  try {
    const info = await invoke("get_current_image_info");
    document.getElementById("image-name").textContent = info.image;
    document.getElementById("image-size").textContent = `Size: ${info.size} | ID: ${info.image_id}`;
  } catch (e) {
    console.error("Failed to get image info:", e);
  }
}

document.getElementById("btn-check-updates").addEventListener("click", async () => {
  const btn = document.getElementById("btn-check-updates");
  btn.disabled = true;
  btn.textContent = "Checking...";
  try {
    const info = await invoke("check_for_updates");
    if (info.update_available) {
      document.getElementById("image-status").className = "status-dot starting";
      document.getElementById("btn-pull-image").classList.remove("hidden");
      document.getElementById("update-indicator").classList.remove("hidden");
      document.getElementById("image-size").textContent = `Update available! Last updated: ${info.last_updated || "unknown"}`;
    } else {
      document.getElementById("image-status").className = "status-dot running";
      document.getElementById("image-size").textContent = "Up to date";
    }
  } catch (e) {
    alert("Failed to check updates: " + e);
  }
  btn.disabled = false;
  btn.textContent = "Check for Updates";
});

document.getElementById("btn-pull-image").addEventListener("click", async () => {
  const btn = document.getElementById("btn-pull-image");
  btn.disabled = true;
  btn.textContent = "Pulling...";
  try {
    await invoke("pull_latest_image");
    document.getElementById("image-status").className = "status-dot running";
    document.getElementById("btn-pull-image").classList.add("hidden");
    document.getElementById("update-indicator").classList.add("hidden");
    await checkImageInfo();
    alert("Image updated successfully! Restart the container to use the new version.");
  } catch (e) {
    alert("Failed to pull image: " + e);
  }
  btn.disabled = false;
  btn.textContent = "Pull Update";
});

// ---- Logs ----

async function refreshLogs() {
  const source = document.getElementById("log-source-filter").value;
  const level = document.getElementById("log-level-filter").value;
  const search = document.getElementById("log-search").value.toLowerCase();
  const container = containerConfig?.container_name || "archestra";

  try {
    const logs = await invoke("get_container_logs", {
      containerName: container,
      lines: 500,
      sourceFilter: source,
      levelFilter: level,
    });

    const logContainer = document.getElementById("log-container");
    if (logs.length === 0) {
      logContainer.innerHTML = '<div class="log-placeholder">No logs matching filters</div>';
      return;
    }

    const filtered = search
      ? logs.filter((l) => l.message.toLowerCase().includes(search))
      : logs;

    logContainer.innerHTML = filtered
      .map((entry) => {
        const ts = entry.timestamp ? entry.timestamp.substring(11, 19) : "";
        return `<div class="log-line">
          <span class="log-timestamp">${ts}</span>
          <span class="log-source ${entry.source}">${entry.source}</span>
          <span class="log-level ${entry.level}">${entry.level.toUpperCase()}</span>
          <span class="log-message">${escapeHtml(entry.message)}</span>
        </div>`;
      })
      .join("");

    logContainer.scrollTop = logContainer.scrollHeight;
  } catch (e) {
    console.error("Failed to fetch logs:", e);
  }
}

document.getElementById("btn-refresh-logs").addEventListener("click", refreshLogs);
document.getElementById("log-source-filter").addEventListener("change", refreshLogs);
document.getElementById("log-level-filter").addEventListener("change", refreshLogs);

let searchDebounce = null;
document.getElementById("log-search").addEventListener("input", () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(refreshLogs, 300);
});

document.getElementById("btn-download-logs").addEventListener("click", async () => {
  const container = containerConfig?.container_name || "archestra";
  try {
    const logs = await invoke("get_container_logs", {
      containerName: container,
      lines: 5000,
      sourceFilter: "all",
      levelFilter: "all",
    });
    const text = logs.map((l) => `${l.timestamp || ""} [${l.source}] ${l.level} ${l.message}`).join("\n");
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
});

// ---- Pods ----

async function refreshPods() {
  const container = containerConfig?.container_name || "archestra";
  const podsList = document.getElementById("pods-list");

  try {
    const pods = await invoke("list_pods", { containerName: container });

    if (pods.length === 0) {
      podsList.innerHTML = '<div class="log-placeholder">No MCP server pods found</div>';
    } else {
      podsList.innerHTML = pods
        .map(
          (pod) => `
        <div class="pod-card">
          <div class="pod-status-indicator ${pod.status}"></div>
          <div class="pod-info">
            <div class="pod-name">${escapeHtml(pod.name)}</div>
            <div class="pod-meta">
              <span>Image: ${escapeHtml(pod.image)}</span>
              <span>Restarts: ${pod.restarts}</span>
              <span>Status: ${pod.status}</span>
            </div>
          </div>
          <div class="pod-resources">
            ${pod.cpu ? `<span>CPU: ${pod.cpu}</span>` : ""}
            ${pod.memory ? `<span>Mem: ${pod.memory}</span>` : ""}
          </div>
          <div class="pod-actions">
            <button class="btn btn-sm" onclick="viewPodLogs('${escapeAttr(pod.name)}')">Logs</button>
            <button class="btn btn-sm" onclick="describePod('${escapeAttr(pod.name)}')">Describe</button>
            <button class="btn btn-sm" onclick="restartPod('${escapeAttr(pod.name)}')">Restart</button>
            <button class="btn btn-sm btn-danger" onclick="deletePod('${escapeAttr(pod.name)}')">Delete</button>
          </div>
        </div>`,
        )
        .join("");
    }

    // Fetch cluster info
    try {
      const cluster = await invoke("get_cluster_info", { containerName: container });
      const bar = document.getElementById("cluster-info-bar");
      bar.classList.remove("hidden");
      document.getElementById("cluster-info-name").textContent = `Cluster: ${cluster.cluster_name}`;
      document.getElementById("cluster-info-nodes").textContent = `Nodes: ${cluster.node_count}`;
      document.getElementById("cluster-info-pod-count").textContent = `Pods: ${cluster.pod_count}/${cluster.total_pods}`;
      document.getElementById("cluster-info-cpu").textContent = cluster.cpu_usage ? `CPU: ${cluster.cpu_usage}` : "CPU: -";
      document.getElementById("cluster-info-memory").textContent = cluster.memory_usage ? `Memory: ${cluster.memory_usage}` : "Memory: -";

      // Update dashboard cluster card
      document.getElementById("cluster-name").textContent = cluster.cluster_name;
      document.getElementById("cluster-pods").textContent = `${cluster.pod_count}/${cluster.total_pods} pods running`;
      document.getElementById("cluster-status").className = cluster.pod_count > 0 ? "status-dot running" : "status-dot neutral";
    } catch (e) {
      console.error("Failed to get cluster info:", e);
    }
  } catch (e) {
    podsList.innerHTML = `<div class="log-placeholder">Failed to load pods: ${escapeHtml(String(e))}</div>`;
  }
}

document.getElementById("btn-refresh-pods").addEventListener("click", refreshPods);

async function viewPodLogs(podName) {
  // Switch to logs tab and show pod-specific logs
  switchTab("logs");
  const backendPort = containerConfig?.backend_port || 9000;
  // For now, use the pod name to find the MCP server ID
  // This is a simplification - in production, map pod name to server ID
  document.getElementById("log-container").innerHTML = `<div class="log-placeholder">Loading logs for ${escapeHtml(podName)}...</div>`;

  try {
    const container = containerConfig?.container_name || "archestra";
    const logs = await invoke("get_pod_logs", {
      backendPort: backendPort,
      podId: podName,
      lines: 200,
    });

    const logContainer = document.getElementById("log-container");
    logContainer.innerHTML = logs
      .map((entry) => {
        const ts = entry.timestamp ? entry.timestamp.substring(11, 19) : "";
        return `<div class="log-line">
          <span class="log-timestamp">${ts}</span>
          <span class="log-source kind">${escapeHtml(podName.substring(0, 20))}</span>
          <span class="log-level ${entry.level}">${entry.level.toUpperCase()}</span>
          <span class="log-message">${escapeHtml(entry.message)}</span>
        </div>`;
      })
      .join("");
    logContainer.scrollTop = logContainer.scrollHeight;
  } catch (e) {
    document.getElementById("log-container").innerHTML = `<div class="log-placeholder">Failed to load pod logs: ${escapeHtml(String(e))}</div>`;
  }
}

async function describePod(podName) {
  const container = containerConfig?.container_name || "archestra";
  try {
    const detail = await invoke("describe_pod", { containerName: container, podName });
    document.getElementById("pod-detail-title").textContent = `Pod: ${podName}`;
    document.getElementById("pod-detail-content").textContent = detail;
    document.getElementById("pod-detail-modal").classList.remove("hidden");
  } catch (e) {
    alert("Failed to describe pod: " + e);
  }
}

async function restartPod(podName) {
  if (!confirm(`Restart pod "${podName}"? It will be recreated by its deployment.`)) return;
  const container = containerConfig?.container_name || "archestra";
  try {
    await invoke("restart_pod", { containerName: container, podName });
    await refreshPods();
  } catch (e) {
    alert("Failed to restart pod: " + e);
  }
}

async function deletePod(podName) {
  if (!confirm(`Delete pod "${podName}" and its deployment? This cannot be undone.`)) return;
  const container = containerConfig?.container_name || "archestra";
  try {
    await invoke("delete_pod", { containerName: container, podName });
    await refreshPods();
  } catch (e) {
    alert("Failed to delete pod: " + e);
  }
}

document.getElementById("btn-close-pod-detail").addEventListener("click", () => {
  document.getElementById("pod-detail-modal").classList.add("hidden");
});

// ---- Drizzle Studio ----

document.getElementById("btn-toggle-drizzle").addEventListener("click", async () => {
  const btn = document.getElementById("btn-toggle-drizzle");
  const newState = !drizzleStudioRunning;

  btn.disabled = true;
  btn.textContent = newState ? "Enabling..." : "Disabling...";

  try {
    const result = await invoke("toggle_drizzle_studio", { enable: newState });
    drizzleStudioRunning = result;
    updateDrizzleUI();
  } catch (e) {
    alert("Failed to toggle Drizzle Studio: " + e);
  }
  btn.disabled = false;
});

document.getElementById("btn-open-drizzle").addEventListener("click", () => {
  const port = containerConfig?.drizzle_studio_port || 4983;
  window.open(`http://localhost:${port}`, "_blank");
});

function updateDrizzleUI() {
  const statusDot = document.getElementById("drizzle-status");
  const toggleBtn = document.getElementById("btn-toggle-drizzle");
  const openBtn = document.getElementById("btn-open-drizzle");

  statusDot.className = drizzleStudioRunning ? "status-dot running" : "status-dot stopped";
  toggleBtn.textContent = drizzleStudioRunning ? "Disable Drizzle Studio" : "Enable Drizzle Studio";
  toggleBtn.className = drizzleStudioRunning ? "btn btn-danger" : "btn btn-primary";

  if (drizzleStudioRunning) {
    openBtn.classList.remove("hidden");
  } else {
    openBtn.classList.add("hidden");
  }
}

// ---- Settings ----

async function loadSettings() {
  try {
    containerConfig = await invoke("get_container_config");
    document.getElementById("setting-image").value = containerConfig.image;
    document.getElementById("setting-container-name").value = containerConfig.container_name;
    document.getElementById("setting-frontend-port").value = containerConfig.frontend_port;
    document.getElementById("setting-backend-port").value = containerConfig.backend_port;
    document.getElementById("setting-drizzle-port").value = containerConfig.drizzle_studio_port;
    document.getElementById("setting-cpu").value = containerConfig.cpu_limit;
    document.getElementById("setting-memory").value = containerConfig.memory_limit;

    // Update quick link ports
    document.getElementById("link-frontend-port").textContent = `:${containerConfig.frontend_port}`;
    document.getElementById("link-backend-port").textContent = `:${containerConfig.backend_port}`;
    document.getElementById("link-drizzle-port").textContent = `:${containerConfig.drizzle_studio_port}`;
  } catch (e) {
    console.error("Failed to load settings:", e);
  }
}

document.getElementById("btn-save-settings").addEventListener("click", async () => {
  const config = {
    image: document.getElementById("setting-image").value,
    container_name: document.getElementById("setting-container-name").value,
    frontend_port: parseInt(document.getElementById("setting-frontend-port").value),
    backend_port: parseInt(document.getElementById("setting-backend-port").value),
    drizzle_studio_port: parseInt(document.getElementById("setting-drizzle-port").value),
    cpu_limit: document.getElementById("setting-cpu").value,
    memory_limit: document.getElementById("setting-memory").value,
  };

  try {
    await invoke("set_container_config", { config });
    containerConfig = config;
    alert("Settings saved! Restart the container for changes to take effect.");
  } catch (e) {
    alert("Failed to save settings: " + e);
  }
});

document.getElementById("btn-reset-settings").addEventListener("click", async () => {
  if (!confirm("Reset all settings to defaults?")) return;
  const defaults = {
    image: "archestra/platform:latest",
    container_name: "archestra",
    frontend_port: 3000,
    backend_port: 9000,
    drizzle_studio_port: 4983,
    cpu_limit: "4",
    memory_limit: "4g",
  };
  try {
    await invoke("set_container_config", { config: defaults });
    containerConfig = defaults;
    await loadSettings();
    alert("Settings reset to defaults.");
  } catch (e) {
    alert("Failed to reset settings: " + e);
  }
});

// ---- Utilities ----

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// ---- Initialization ----

async function init() {
  await loadSettings();
  await detectRuntime();
  await refreshContainerStatus();
  await checkImageInfo();

  // Check Drizzle Studio status
  try {
    drizzleStudioRunning = await invoke("get_drizzle_studio_status");
    updateDrizzleUI();
  } catch (e) {
    console.error("Failed to check Drizzle Studio status:", e);
  }

  // Auto-refresh container status every 10 seconds
  setInterval(async () => {
    await refreshContainerStatus();
  }, 10000);

  // Auto-check for updates on startup if enabled
  const autoUpdate = document.getElementById("setting-auto-update").checked;
  if (autoUpdate) {
    setTimeout(async () => {
      try {
        const info = await invoke("check_for_updates");
        if (info.update_available) {
          document.getElementById("update-indicator").classList.remove("hidden");
          document.getElementById("image-status").className = "status-dot starting";
          document.getElementById("btn-pull-image").classList.remove("hidden");
        }
      } catch (e) {
        console.error("Auto-update check failed:", e);
      }
    }, 5000);
  }
}

// Wait for Tauri to be ready
if (window.__TAURI__) {
  init();
} else {
  window.addEventListener("DOMContentLoaded", () => {
    // Fallback: wait a bit for Tauri to inject globals
    setTimeout(init, 100);
  });
}
