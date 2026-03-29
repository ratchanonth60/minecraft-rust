# Contributing

## Project Shape

- Rust owns gameplay-critical logic.
- TypeScript owns rendering, browser input, and DOM UI.
- New code should usually be added by domain, not by framework feature.

## Where To Put Things

- Backend commands: `src-tauri/src/backend/commands.rs`
- Backend world simulation: `src-tauri/src/backend/world/`
- Backend persistence: `src-tauri/src/backend/storage/`
- Frontend bootstrapping: `src/app/`
- Frontend orchestration: `src/game/`
- Frontend rendering bridge to Rust: `src/world/`

## Guidelines

- Prefer thin entrypoints and small modules with clear responsibilities.
- Keep Rust as the single source of truth for world state.
- Keep frontend gameplay logic limited to visual helpers and input capture.
- Add doc comments to new public backend functions and types.
- Update `README.md` or `docs/` when the architecture changes in meaningful ways.

## Before Opening A PR

- Run `cargo check --manifest-path src-tauri/Cargo.toml`
- Run `npm run build`
- If you touched architecture or command payloads, update:
  - `docs/ARCHITECTURE.md`
  - `docs/BACKEND_API.md`
