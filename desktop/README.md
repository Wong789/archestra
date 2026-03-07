# Archestra Desktop

A native desktop application that lets users run Archestra without pre-installing Docker or Kubernetes. Built with [Tauri](https://tauri.app/) for cross-platform support (macOS, Windows, Linux).

## Architecture

The desktop app is a **thin shell** around the existing `archestra/platform` Docker image. It manages:

1. **Container Runtime** - Starts/manages a lightweight Linux VM (Colima on macOS, WSL2 on Windows, native Docker on Linux)
2. **Container Lifecycle** - Pulls, starts, stops, and restarts the Archestra container
3. **Auto-Updates** - Detects new Docker images on Docker Hub and prompts the user to upgrade
4. **Logs Inspector** - Streams and filters container and MCP server pod logs
5. **Pod Manager** - Lists, restarts, deletes, and inspects KinD cluster pods
6. **Drizzle Studio** - Toggle database UI on/off inside the container

```
┌──────────────────────────────────────┐
│        Tauri App (native shell)      │
│  ┌────────────────────────────────┐  │
│  │  WebView UI (HTML/CSS/JS)     │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  Rust Backend                 │  │
│  │  ├── runtime.rs  (VM mgmt)   │  │
│  │  ├── container.rs (Docker)   │  │
│  │  ├── logs.rs     (streaming) │  │
│  │  ├── pods.rs     (kubectl)   │  │
│  │  └── updater.rs  (Hub API)   │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
                  │
    ┌─────────────▼─────────────┐
    │  archestra/platform:latest │
    │  (unchanged Docker image)  │
    └───────────────────────────┘
```

## Prerequisites

- [Rust](https://rustup.rs/) (for building)
- Tauri CLI: `cargo install tauri-cli`
- Platform-specific Tauri dependencies: https://v2.tauri.app/start/prerequisites/

## Development

```bash
cd desktop
cargo tauri dev
```

## Build

```bash
# Build for current platform
cargo tauri build

# Output locations:
# macOS: target/release/bundle/dmg/Archestra_0.1.0_*.dmg
# Windows: target/release/bundle/msi/Archestra_0.1.0_*.msi
# Linux: target/release/bundle/appimage/Archestra_0.1.0_*.AppImage
#        target/release/bundle/deb/archestra-desktop_0.1.0_*.deb
```

## Project Structure

```
desktop/
├── Cargo.toml                 # Rust dependencies
├── build.rs                   # Tauri build script
├── src-tauri/
│   ├── tauri.conf.json        # Tauri configuration
│   ├── capabilities/          # Permission definitions
│   └── src/
│       ├── main.rs            # Entry point
│       ├── lib.rs             # Command registration
│       ├── state.rs           # App state and config persistence
│       ├── runtime.rs         # Container runtime detection and management
│       ├── container.rs       # Docker container lifecycle
│       ├── logs.rs            # Log fetching and parsing
│       ├── pods.rs            # Kubernetes pod management via kubectl
│       └── updater.rs         # Docker Hub update checking
└── ui/
    ├── index.html             # Main UI layout
    ├── styles.css             # Dark theme styles
    └── app.js                 # Application logic and Tauri IPC
```

## How It Works

### Runtime Detection Priority
1. **Linux**: Native Docker (no VM needed)
2. **macOS**: Colima > Lima > Docker Desktop > Podman
3. **Windows**: Docker Desktop > WSL2 > Podman

### Release Process
The desktop app is **decoupled** from Archestra releases. When a new `archestra/platform` image is pushed to Docker Hub:
1. The app detects the new digest via Docker Hub API
2. Shows an "Update available" notification
3. User clicks update → pulls new image → restarts container

The app shell itself only needs a new release when the shell UI/features change.

## No Code Signing (Current)

The app is currently distributed without code signing:
- **macOS**: Users right-click → Open to bypass Gatekeeper
- **Windows**: Users click "More info" → "Run anyway" on SmartScreen
- **Linux**: No signing required
