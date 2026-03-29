//! Tauri command handlers exposed to the frontend.

use super::state::GameState;
use super::storage::{load_world_data, save_world_data};
use super::types::{
    ChunkMeshPayload, IVec3, PathRequest, PlayerSimulationInput, PlayerSimulationOutput, WorldInit,
};
use tauri::{AppHandle, State};

/// Initializes a fresh world and returns its spawn data.
///
/// # Examples
///
/// ```rust,ignore
/// // This command is normally called by Tauri from the frontend:
/// // let init = invoke("init_world", { seed: 42 });
/// ```
#[tauri::command]
pub fn init_world(state: State<'_, GameState>, seed: Option<u32>) -> Result<WorldInit, String> {
    let mut world = state
        .world
        .lock()
        .map_err(|_| "failed to lock world state".to_string())?;
    world.reset(seed.unwrap_or(42));
    Ok(WorldInit {
        seed: world.seed,
        spawn: world.spawn_point(),
    })
}

/// Returns a render-ready mesh payload for a chunk.
///
/// # Examples
///
/// ```rust,ignore
/// // Frontend usage:
/// // let mesh = invoke("get_chunk_mesh", { chunk_x: 0, chunk_z: 0 });
/// ```
#[tauri::command]
pub fn get_chunk_mesh(
    state: State<'_, GameState>,
    chunk_x: i32,
    chunk_z: i32,
) -> Result<ChunkMeshPayload, String> {
    let mut world = state
        .world
        .lock()
        .map_err(|_| "failed to lock world state".to_string())?;
    Ok(world.chunk_mesh(chunk_x, chunk_z))
}

/// Places a block and returns rebuilt meshes for affected chunks.
///
/// # Examples
///
/// ```rust,ignore
/// // Frontend usage:
/// // let updates = invoke("place_block", { x: 1, y: 20, z: 1, block_type: 1 });
/// ```
#[tauri::command]
pub fn place_block(
    state: State<'_, GameState>,
    x: i32,
    y: i32,
    z: i32,
    block_type: u8,
) -> Result<Vec<ChunkMeshPayload>, String> {
    let mut world = state
        .world
        .lock()
        .map_err(|_| "failed to lock world state".to_string())?;
    Ok(world.update_block(IVec3 { x, y, z }, Some(block_type)))
}

/// Removes a block and returns rebuilt meshes for affected chunks.
///
/// # Examples
///
/// ```rust,ignore
/// // Frontend usage:
/// // let updates = invoke("remove_block", { x: 1, y: 20, z: 1 });
/// ```
#[tauri::command]
pub fn remove_block(
    state: State<'_, GameState>,
    x: i32,
    y: i32,
    z: i32,
) -> Result<Vec<ChunkMeshPayload>, String> {
    let mut world = state
        .world
        .lock()
        .map_err(|_| "failed to lock world state".to_string())?;
    Ok(world.update_block(IVec3 { x, y, z }, None))
}

/// Runs one player physics step inside the backend simulation.
///
/// # Examples
///
/// ```rust,ignore
/// // Frontend usage:
/// // let result = invoke("simulate_player", { input: { ... } });
/// ```
#[tauri::command]
pub fn simulate_player(
    state: State<'_, GameState>,
    input: PlayerSimulationInput,
) -> Result<PlayerSimulationOutput, String> {
    let mut world = state
        .world
        .lock()
        .map_err(|_| "failed to lock world state".to_string())?;
    Ok(world.simulate_player(input))
}

/// Computes a path against the current world state.
///
/// # Examples
///
/// ```rust,ignore
/// // Frontend usage:
/// // let path = invoke("find_path", { request: { start, goal, max_nodes: 1024 } });
/// ```
#[tauri::command]
pub fn find_path(state: State<'_, GameState>, request: PathRequest) -> Result<Vec<IVec3>, String> {
    let mut world = state
        .world
        .lock()
        .map_err(|_| "failed to lock world state".to_string())?;
    Ok(world.find_path(request))
}

/// Persists the current world delta to disk.
///
/// # Examples
///
/// ```rust,ignore
/// // Frontend usage:
/// // let save_path = invoke("save_world", { slot: "world.json" });
/// ```
#[tauri::command]
pub fn save_world(
    app: AppHandle,
    state: State<'_, GameState>,
    slot: Option<String>,
) -> Result<String, String> {
    let world = state
        .world
        .lock()
        .map_err(|_| "failed to lock world state".to_string())?;
    save_world_data(&app, &world, slot)
}

/// Loads a persisted world delta if a save file exists.
///
/// # Examples
///
/// ```rust,ignore
/// // Frontend usage:
/// // let loaded = invoke("load_world", { slot: "world.json" });
/// ```
#[tauri::command]
pub fn load_world(
    app: AppHandle,
    state: State<'_, GameState>,
    slot: Option<String>,
) -> Result<bool, String> {
    let mut world = state
        .world
        .lock()
        .map_err(|_| "failed to lock world state".to_string())?;
    load_world_data(&app, &mut world, slot)
}
