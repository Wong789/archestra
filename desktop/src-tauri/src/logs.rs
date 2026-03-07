use serde::Serialize;
use tokio::process::Command;

#[derive(Debug, Serialize)]
pub struct LogEntry {
    pub timestamp: Option<String>,
    pub source: String,
    pub level: String,
    pub message: String,
}

fn parse_log_line(line: &str) -> LogEntry {
    // Try to parse structured log lines (Supervisor or JSON format)
    // Supervisor format: "YYYY-MM-DD HH:MM:SS,mmm <source> <message>"
    // Fallback: treat the whole line as message

    let level = if line.contains("ERROR") || line.contains("error") {
        "error"
    } else if line.contains("WARN") || line.contains("warn") {
        "warn"
    } else if line.contains("DEBUG") || line.contains("debug") {
        "debug"
    } else {
        "info"
    };

    let source = if line.contains("[backend]") || line.contains("pnpm-backend") {
        "backend"
    } else if line.contains("[frontend]") || line.contains("pnpm-frontend") {
        "frontend"
    } else if line.contains("postgres") || line.contains("PostgreSQL") {
        "postgres"
    } else if line.contains("kind") || line.contains("KinD") {
        "kind"
    } else if line.contains("supervisor") {
        "supervisor"
    } else {
        "system"
    };

    // Try to extract timestamp from beginning of line
    let timestamp = if line.len() > 23 && line.as_bytes().get(4) == Some(&b'-') {
        Some(line[..23].to_string())
    } else {
        None
    };

    LogEntry {
        timestamp,
        source: source.to_string(),
        level: level.to_string(),
        message: line.to_string(),
    }
}

/// Get container logs with optional filtering.
#[tauri::command]
pub async fn get_container_logs(
    container_name: String,
    lines: Option<u32>,
    source_filter: Option<String>,
    level_filter: Option<String>,
) -> Result<Vec<LogEntry>, String> {
    let line_count = lines.unwrap_or(500).to_string();
    let output = Command::new("docker")
        .args(["logs", "--tail", &line_count, "--timestamps", &container_name])
        .output()
        .await
        .map_err(|e| format!("Failed to get logs: {}", e))?;

    // Docker logs can go to both stdout and stderr
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let all_output = format!("{}{}", stdout, stderr);

    let entries: Vec<LogEntry> = all_output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(parse_log_line)
        .filter(|entry| {
            if let Some(ref source) = source_filter {
                if source != "all" && entry.source != *source {
                    return false;
                }
            }
            if let Some(ref level) = level_filter {
                if level != "all" && entry.level != *level {
                    return false;
                }
            }
            true
        })
        .collect();

    Ok(entries)
}

/// Get logs for a specific MCP server pod via the Archestra backend API.
#[tauri::command]
pub async fn get_pod_logs(
    backend_port: u16,
    pod_id: String,
    lines: Option<u32>,
) -> Result<Vec<LogEntry>, String> {
    let line_count = lines.unwrap_or(200);
    let url = format!(
        "http://localhost:{}/api/mcp_server/{}/logs?lines={}",
        backend_port, pod_id, line_count
    );

    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to fetch pod logs: {}", e))?;

    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    let entries: Vec<LogEntry> = body
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(parse_log_line)
        .collect();

    Ok(entries)
}
