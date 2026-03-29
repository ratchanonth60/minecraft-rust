//! Persistent storage for world save data.

use super::types::{ChunkBlock, SavedWorld};
use super::world::WorldState;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Resolves the save-file path inside the application data directory.
fn save_file_path(app: &AppHandle, slot: Option<String>) -> Result<PathBuf, String> {
    let mut path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?;
    fs::create_dir_all(&path).map_err(|e| format!("failed to create save dir: {e}"))?;
    path.push(slot.unwrap_or_else(|| "world.json".to_string()));
    Ok(path)
}

/// Serializes the current world delta to disk.
pub fn save_world_data(
    app: &AppHandle,
    world: &WorldState,
    slot: Option<String>,
) -> Result<String, String> {
    let save = SavedWorld {
        seed: world.seed,
        modified_blocks: world
            .modified_blocks
            .iter()
            .map(|(pos, block_type)| ChunkBlock {
                pos: *pos,
                block_type: *block_type,
            })
            .collect(),
        removed_blocks: world.removed_blocks.iter().copied().collect(),
    };

    let path = save_file_path(app, slot)?;
    let json =
        serde_json::to_string_pretty(&save).map_err(|e| format!("failed to serialize: {e}"))?;
    fs::write(&path, json).map_err(|e| format!("failed to write save file: {e}"))?;
    Ok(path.to_string_lossy().to_string())
}

/// Loads a saved world delta from disk and applies it to a fresh world state.
pub fn load_world_data(
    app: &AppHandle,
    world: &mut WorldState,
    slot: Option<String>,
) -> Result<bool, String> {
    let path = save_file_path(app, slot)?;
    if !path.exists() {
        return Ok(false);
    }

    let json = fs::read_to_string(&path).map_err(|e| format!("failed to read save file: {e}"))?;
    let saved: SavedWorld =
        serde_json::from_str(&json).map_err(|e| format!("failed to parse save file: {e}"))?;

    world.reset(saved.seed);
    for block in saved.modified_blocks {
        world.modified_blocks.insert(block.pos, block.block_type);
    }
    for pos in saved.removed_blocks {
        world.removed_blocks.insert(pos);
    }

    Ok(true)
}
