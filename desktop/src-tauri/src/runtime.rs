use crate::state::{AppState, RuntimeStatus, RuntimeType};
use serde::Serialize;
use std::sync::Arc;
use tokio::process::Command;
use tokio::sync::Mutex;

#[derive(Debug, Serialize)]
pub struct RuntimeInfo {
    pub runtime_type: RuntimeType,
    pub status: RuntimeStatus,
    pub version: Option<String>,
}

async fn command_exists(cmd: &str) -> bool {
    which::which(cmd).is_ok()
}

async fn get_command_version(cmd: &str, args: &[&str]) -> Option<String> {
    Command::new(cmd)
        .args(args)
        .output()
        .await
        .ok()
        .and_then(|o| {
            if o.status.success() {
                Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                None
            }
        })
}

async fn is_docker_running() -> bool {
    Command::new("docker")
        .args(["info"])
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Detect which container runtime is available on the system.
/// Priority: native Docker > Colima > Lima > Docker Desktop > Podman > WSL2
#[tauri::command]
pub async fn detect_runtime(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
) -> Result<RuntimeInfo, String> {
    let mut state = state.lock().await;

    // Linux: native Docker
    if cfg!(target_os = "linux") && command_exists("docker").await {
        let version = get_command_version("docker", &["--version"]).await;
        let running = is_docker_running().await;
        state.runtime_type = RuntimeType::NativeDocker;
        state.runtime_status = if running {
            RuntimeStatus::Running
        } else {
            RuntimeStatus::Stopped
        };
        return Ok(RuntimeInfo {
            runtime_type: RuntimeType::NativeDocker,
            status: state.runtime_status.clone(),
            version,
        });
    }

    // macOS: Colima (preferred)
    if cfg!(target_os = "macos") && command_exists("colima").await {
        let version = get_command_version("colima", &["version"]).await;
        let status_output = Command::new("colima")
            .args(["status"])
            .output()
            .await
            .ok();
        let running = status_output
            .map(|o| o.status.success())
            .unwrap_or(false);
        state.runtime_type = RuntimeType::Colima;
        state.runtime_status = if running {
            RuntimeStatus::Running
        } else {
            RuntimeStatus::Stopped
        };
        return Ok(RuntimeInfo {
            runtime_type: RuntimeType::Colima,
            status: state.runtime_status.clone(),
            version,
        });
    }

    // macOS: Lima
    if cfg!(target_os = "macos") && command_exists("limactl").await {
        let version = get_command_version("limactl", &["--version"]).await;
        state.runtime_type = RuntimeType::Lima;
        state.runtime_status = RuntimeStatus::Stopped;
        return Ok(RuntimeInfo {
            runtime_type: RuntimeType::Lima,
            status: RuntimeStatus::Stopped,
            version,
        });
    }

    // macOS/Windows: Docker Desktop
    if command_exists("docker").await {
        let version = get_command_version("docker", &["--version"]).await;
        let running = is_docker_running().await;
        state.runtime_type = RuntimeType::DockerDesktop;
        state.runtime_status = if running {
            RuntimeStatus::Running
        } else {
            RuntimeStatus::Stopped
        };
        return Ok(RuntimeInfo {
            runtime_type: RuntimeType::DockerDesktop,
            status: state.runtime_status.clone(),
            version,
        });
    }

    // Podman
    if command_exists("podman").await {
        let version = get_command_version("podman", &["--version"]).await;
        state.runtime_type = RuntimeType::Podman;
        state.runtime_status = RuntimeStatus::Stopped;
        return Ok(RuntimeInfo {
            runtime_type: RuntimeType::Podman,
            status: state.runtime_status.clone(),
            version,
        });
    }

    // Windows: WSL2
    if cfg!(target_os = "windows") && command_exists("wsl").await {
        state.runtime_type = RuntimeType::Wsl2;
        state.runtime_status = RuntimeStatus::Stopped;
        return Ok(RuntimeInfo {
            runtime_type: RuntimeType::Wsl2,
            status: RuntimeStatus::Stopped,
            version: None,
        });
    }

    state.runtime_type = RuntimeType::None;
    state.runtime_status = RuntimeStatus::NotInstalled;
    Ok(RuntimeInfo {
        runtime_type: RuntimeType::None,
        status: RuntimeStatus::NotInstalled,
        version: None,
    })
}

/// Start the container runtime (VM layer on macOS/Windows, no-op on Linux).
#[tauri::command]
pub async fn start_runtime(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
) -> Result<RuntimeInfo, String> {
    let mut state = state.lock().await;

    state.runtime_status = RuntimeStatus::Starting;
    let result = match &state.runtime_type {
        RuntimeType::Colima => {
            let config = &state.container_config;
            Command::new("colima")
                .args([
                    "start",
                    "--cpu",
                    &config.cpu_limit,
                    "--memory",
                    &config.memory_limit.replace('g', ""),
                    "--disk",
                    "60",
                    "--runtime",
                    "docker",
                ])
                .output()
                .await
        }
        RuntimeType::Lima => Command::new("limactl")
            .args(["start", "--name=archestra", "--tty=false", "template://docker"])
            .output()
            .await,
        RuntimeType::Podman => Command::new("podman")
            .args(["machine", "start"])
            .output()
            .await,
        RuntimeType::Wsl2 => Command::new("wsl")
            .args(["--install", "--no-launch"])
            .output()
            .await,
        RuntimeType::NativeDocker | RuntimeType::DockerDesktop => {
            // Docker is managed externally, just check if it's running
            if is_docker_running().await {
                state.runtime_status = RuntimeStatus::Running;
                return Ok(RuntimeInfo {
                    runtime_type: state.runtime_type.clone(),
                    status: RuntimeStatus::Running,
                    version: None,
                });
            }
            state.runtime_status = RuntimeStatus::Error;
            return Err("Docker is not running. Please start Docker manually.".to_string());
        }
        RuntimeType::None => {
            state.runtime_status = RuntimeStatus::NotInstalled;
            return Err(
                "No container runtime found. Please install Colima, Docker, or Podman."
                    .to_string(),
            );
        }
    };

    match result {
        Ok(output) if output.status.success() => {
            state.runtime_status = RuntimeStatus::Running;
            Ok(RuntimeInfo {
                runtime_type: state.runtime_type.clone(),
                status: RuntimeStatus::Running,
                version: None,
            })
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            state.runtime_status = RuntimeStatus::Error;
            Err(format!("Failed to start runtime: {}", stderr))
        }
        Err(e) => {
            state.runtime_status = RuntimeStatus::Error;
            Err(format!("Failed to start runtime: {}", e))
        }
    }
}

/// Stop the container runtime.
#[tauri::command]
pub async fn stop_runtime(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
) -> Result<(), String> {
    let mut state = state.lock().await;

    state.runtime_status = RuntimeStatus::Stopping;
    let result = match &state.runtime_type {
        RuntimeType::Colima => Command::new("colima").args(["stop"]).output().await,
        RuntimeType::Lima => Command::new("limactl")
            .args(["stop", "archestra"])
            .output()
            .await,
        RuntimeType::Podman => Command::new("podman")
            .args(["machine", "stop"])
            .output()
            .await,
        _ => {
            state.runtime_status = RuntimeStatus::Stopped;
            return Ok(());
        }
    };

    match result {
        Ok(output) if output.status.success() => {
            state.runtime_status = RuntimeStatus::Stopped;
            Ok(())
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            state.runtime_status = RuntimeStatus::Error;
            Err(format!("Failed to stop runtime: {}", stderr))
        }
        Err(e) => {
            state.runtime_status = RuntimeStatus::Error;
            Err(format!("Failed to stop runtime: {}", e))
        }
    }
}

/// Get the current runtime status.
#[tauri::command]
pub async fn get_runtime_status(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
) -> Result<RuntimeInfo, String> {
    let state = state.lock().await;
    Ok(RuntimeInfo {
        runtime_type: state.runtime_type.clone(),
        status: state.runtime_status.clone(),
        version: None,
    })
}
