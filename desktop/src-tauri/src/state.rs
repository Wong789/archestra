use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerConfig {
    pub image: String,
    pub container_name: String,
    pub frontend_port: u16,
    pub backend_port: u16,
    pub drizzle_studio_port: u16,
    pub cpu_limit: String,
    pub memory_limit: String,
}

impl Default for ContainerConfig {
    fn default() -> Self {
        Self {
            image: "archestra/platform:latest".to_string(),
            container_name: "archestra".to_string(),
            frontend_port: 3000,
            backend_port: 9000,
            drizzle_studio_port: 4983,
            cpu_limit: "4".to_string(),
            memory_limit: "4g".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RuntimeType {
    Colima,
    Lima,
    DockerDesktop,
    Podman,
    Wsl2,
    NativeDocker,
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RuntimeStatus {
    Running,
    Stopped,
    Starting,
    Stopping,
    Error,
    NotInstalled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ContainerStatus {
    Running,
    Stopped,
    Pulling,
    Starting,
    Stopping,
    NotFound,
    Error,
}

pub struct AppState {
    pub runtime_type: RuntimeType,
    pub runtime_status: RuntimeStatus,
    pub container_status: ContainerStatus,
    pub container_config: ContainerConfig,
    pub drizzle_studio_running: bool,
    pub config_path: std::path::PathBuf,
}

impl AppState {
    pub fn new() -> Self {
        let config_path = dirs::config_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join("archestra-desktop");

        let container_config = Self::load_config(&config_path);

        Self {
            runtime_type: RuntimeType::None,
            runtime_status: RuntimeStatus::Stopped,
            container_status: ContainerStatus::NotFound,
            container_config,
            drizzle_studio_running: false,
            config_path,
        }
    }

    fn load_config(config_path: &std::path::Path) -> ContainerConfig {
        let config_file = config_path.join("config.json");
        if config_file.exists() {
            if let Ok(data) = std::fs::read_to_string(&config_file) {
                if let Ok(config) = serde_json::from_str(&data) {
                    return config;
                }
            }
        }
        ContainerConfig::default()
    }

    pub fn save_config(&self) -> Result<(), String> {
        std::fs::create_dir_all(&self.config_path).map_err(|e| e.to_string())?;
        let config_file = self.config_path.join("config.json");
        let data =
            serde_json::to_string_pretty(&self.container_config).map_err(|e| e.to_string())?;
        std::fs::write(config_file, data).map_err(|e| e.to_string())
    }
}
