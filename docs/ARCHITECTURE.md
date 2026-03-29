# Architecture

This project is split into two clear layers:

- Rust backend: authoritative world simulation, terrain generation, chunk meshing, collision, pathfinding, and persistence.
- TypeScript frontend: WebGL rendering, input handling, UI, and scene orchestration.

## Flow

1. The frontend boots a `GameSession`.
2. `GameSession` asks Rust to initialize a world and return a spawn point.
3. The frontend requests visible chunk meshes from Rust.
4. Rust generates or loads chunk data, computes exposed faces, and returns render-ready buffers.
5. The frontend turns those buffers into Three.js `BufferGeometry`.
6. Player movement, block edits, pathfinding, and save/load all go back through Rust commands.

## Frontend Layout

- `src/main.ts`
  Thin entrypoint that imports the app bootstrap.
- `src/app/`
  Startup wiring and boot sequence.
- `src/core/`
  Engine-adjacent setup such as scene creation.
- `src/game/`
  High-level session orchestration and main loop.
- `src/world/`
  Frontend bridge for chunk rendering plus texture/material helpers.
- `src/player/`
  Input handling and player-side interaction with the world bridge.
- `src/ui/`
  DOM overlays and hotbar/debug UI.

## Backend Layout

- `src-tauri/src/lib.rs`
  Thin library entrypoint that re-exports the backend runner.
- `src-tauri/src/backend/commands.rs`
  Tauri command surface exposed to the frontend.
- `src-tauri/src/backend/state.rs`
  Shared application state wrapper.
- `src-tauri/src/backend/types.rs`
  Shared DTOs, block constants, and common data types.
- `src-tauri/src/backend/storage/`
  Save/load responsibilities only.
- `src-tauri/src/backend/world/`
  World domain logic split by concern:
  `generation.rs` for terrain/caves/structures,
  `mesh.rs` for exposed-face meshing,
  `helpers.rs` for low-level utilities,
  `mod.rs` for authoritative runtime state and simulation.

## Design Rules

- Rust owns gameplay-critical state.
- TypeScript should not duplicate simulation logic unless it is purely visual.
- Public commands return data already shaped for the caller's responsibility.
- Modules are organized by domain first, not by file size or language feature.

## Good Places To Extend Next

- Add mob state under `src-tauri/src/backend/world/` or a new `backend/mobs/` module.
- Add inventory/crafting as separate backend and frontend domains instead of growing `GameSession`.
- Add tests for world generation, meshing, and pathfinding at the backend module level.
