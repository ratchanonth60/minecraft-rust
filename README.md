# ⛏️ Minecraft Clone

A voxel-based Minecraft clone built with **Tauri v2** (Rust backend) + **Three.js** (WebGL rendering).

![Tauri](https://img.shields.io/badge/Tauri-v2-blue?logo=tauri)
![Three.js](https://img.shields.io/badge/Three.js-r183-green?logo=three.js)
![Rust](https://img.shields.io/badge/Rust-2021-orange?logo=rust)

---

## ✨ Features

### 🗺️ Infinite World Generation

- **Chunk-based** terrain — 16×16 chunks load/unload dynamically as you walk
- **4-octave Perlin noise** terrain (Rust) — natural hills, valleys, and mountains
- **Multi-block types** — Grass, Dirt, Stone, Sand, Wood, Leaves, Water
- **Procedural trees** — auto-generated on grass areas
- **Sea level water** — low terrain fills with semi-transparent water
- **Beach/sand detection** — sand at shoreline transitions

### 🎮 Gameplay

- **First-person controls** — WASD movement + mouse look
- **Physics** — gravity, jumping, ground collision detection
- **Block breaking** — left-click to destroy blocks (reveals hidden blocks underneath)
- **Block placing** — right-click to place blocks
- **Block selection** — hotbar with 6 block types (keys 1-6 or scroll wheel)
- **Sprint** — hold Ctrl for 1.6× speed

### 🎨 Rendering

- **Procedural textures** — 16×16 pixel art generated on Canvas (no image files!)
- **Per-face materials** — grass blocks have green top, dirt bottom, grass-side edges
- **InstancedMesh rendering** — ~350 draw calls instead of ~15,000 for massive FPS gains
- **Occlusion culling** — hidden blocks aren't rendered (60-70% reduction)
- **Ambient + Directional + Hemisphere lighting** — realistic shading
- **Exponential fog** — smooth distance fade like Minecraft

### 🖥️ UI

- **Hotbar** — glassmorphic block selection bar at bottom
- **Crosshair** — CSS-only thin cross
- **Debug overlay (F3)** — FPS, XYZ position, rendered block count
- **Start screen** — instructions with click-to-play
- **Loading screen** — spinner during world generation

---

## 🚀 Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Bun](https://bun.sh/) or [Node.js](https://nodejs.org/)
- System dependencies for Tauri: [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/)

### Install & Run

```bash
# Clone the repo
git clone <repo-url>
cd minecraft-tauri

# Install JS dependencies
bun install

# Run in development mode
bun run tauri dev
```

### Build for Production

```bash
bun run tauri build
```

Output binaries will be in `src-tauri/target/release/`.

---

## 🎹 Controls

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
| **Esc**          | Pause / Unlock mouse |

---

## 🏗️ Architecture

```
minecraft-tauri/
├── src/                    # Frontend (TypeScript + Three.js)
│   ├── main.ts             # Entry point, scene, lighting, game loop
│   ├── styles.css          # UI styling
│   ├── player/
│   │   └── Player.ts       # Movement, physics, block interaction
│   ├── world/
│   │   ├── World.ts        # Chunk loading, InstancedMesh rendering
│   │   └── TextureManager.ts  # Procedural texture generation
│   └── ui/
│       └── UI.ts           # Hotbar, debug overlay, start screen
├── src-tauri/              # Backend (Rust)
│   └── src/
│       ├── main.rs         # Terrain generation with Perlin noise
│       └── lib.rs          # Mobile entry point
├── index.html
├── package.json
└── vite.config.ts
```

### How Chunk Loading Works

1. Player position → calculate current chunk coordinates
2. Compare with loaded chunks → determine which to load/unload
3. Load: Rust generates 16×16 block column → occlusion cull → create InstancedMesh per block type
4. Unload: dispose InstancedMesh objects, clear block data

### Performance Optimizations

| Technique                    | Impact                                                             |
| ---------------------------- | ------------------------------------------------------------------ |
| **InstancedMesh**            | ~7 draw calls per chunk vs 1 per block. 50× fewer total draw calls |
| **Occlusion culling**        | Only render blocks with exposed faces. ~60-70% block reduction     |
| **Shared geometry**          | Single BoxGeometry instance for all blocks                         |
| **Material caching**         | One material per block type, reused across all chunks              |
| **Throttled raycasting**     | Block highlight updates every 80ms, not every frame                |
| **Cached raycast targets**   | Flat array rebuilt only on chunk changes                           |
| **Chunk boundary detection** | World update only runs when player crosses chunk border            |

---

## 📝 License

MIT
