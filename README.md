# Minecraft Tauri

A voxel sandbox prototype built with **Tauri v2** (Rust backend) + **Three.js** (WebGL rendering).

![Tauri](https://img.shields.io/badge/Tauri-v2-blue?logo=tauri)
![Three.js](https://img.shields.io/badge/Three.js-r183-green?logo=three.js)
![Rust](https://img.shields.io/badge/Rust-2021-orange?logo=rust)

---

## Features

### World

- Chunk-based terrain with lazy loading and unloading
- Rust-driven terrain generation with caves, water, trees, and ruins
- Save/load support for modified world state
- Chunk meshing in Rust using exposed-face detection

### Gameplay

- First-person movement and mouse look
- Rust-side collision and physics stepping
- Block break/place interactions
- Hotbar block selection
- A* pathfinding endpoint for future mob logic

### Rendering

- Procedural block textures generated in the browser
- Three.js `BufferGeometry` built from backend mesh payloads
- Per-face materials for blocks like grass
- Ambient, directional, and hemisphere lighting

### UI

- Hotbar for block selection
- Debug overlay
- Start screen and loading screen
- Save/load shortcuts

---

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Bun](https://bun.sh/) or [Node.js](https://nodejs.org/)
- System dependencies for Tauri: [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/)

### Install And Run

```bash
git clone <repo-url>
cd minecraft-tauri

bun install

bun run tauri dev
```

### Build

```bash
bun run tauri build
```

## Controls

| Key              | Action               |
| ---------------- | -------------------- |
| **WASD**         | Move                 |
| **Mouse**        | Look around          |
| **Space**        | Jump                 |
| **Ctrl**         | Sprint               |
| **Left Click**   | Break block          |
| **Right Click**  | Place block          |
| **1-6**          | Select block type    |
| **Scroll Wheel** | Cycle block types    |
| **F3**           | Toggle debug info    |
| **F5**           | Save world           |
| **F9**           | Load world           |
| **Esc**          | Pause / Unlock mouse |

---

## Architecture

See [Architecture](./docs/ARCHITECTURE.md) for the current module layout and data flow.

## Documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [Backend API](./docs/BACKEND_API.md)
- [Contributing](./CONTRIBUTING.md)

## Development Notes

- Rust owns authoritative world state.
- TypeScript handles rendering, DOM UI, and input.
- Mesh data crossing the Tauri boundary is already face-culled and render-ready.
- Save files are written to the Tauri app data directory.

---

## License

MIT
