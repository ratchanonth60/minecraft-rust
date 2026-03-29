//! Backend application boundary for the Tauri side of the project.
//!
//! Modules are organized by responsibility so the command surface, runtime
//! state, world simulation, and persistence can evolve independently.

mod commands;
mod state;
mod storage;
mod types;
mod world;

/// Boots the Rust backend and registers the Tauri command surface.
pub fn run() {
    tauri::Builder::default()
        .manage(state::GameState::default())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::init_world,
            commands::get_chunk_mesh,
            commands::place_block,
            commands::remove_block,
            commands::simulate_player,
            commands::find_path,
            commands::save_world,
            commands::load_world
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
