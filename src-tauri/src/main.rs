// เปิดใช้งานการป้องกันหน้าต่างโผล่ซ้อนตอนรันบน Windows
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use noise::{NoiseFn, Perlin};
use serde::Serialize;

// Block types
const BLOCK_GRASS: u8 = 1;
const BLOCK_DIRT: u8 = 2;
const BLOCK_STONE: u8 = 3;
const BLOCK_SAND: u8 = 4;
const BLOCK_WOOD: u8 = 5;
const BLOCK_LEAVES: u8 = 6;
const BLOCK_WATER: u8 = 7;

const CHUNK_SIZE: i32 = 16;
const SEA_LEVEL: i32 = 8;

#[derive(Serialize)]
struct BlockData {
    x: i32,
    y: i32,
    z: i32,
    block_type: u8,
}

/// Multi-octave noise for more natural terrain
fn terrain_height(perlin: &Perlin, world_x: i32, world_z: i32) -> i32 {
    let x = world_x as f64;
    let z = world_z as f64;

    // Octave 1: Large-scale hills & valleys
    let h1 = perlin.get([x * 0.005, z * 0.005]) * 24.0;
    // Octave 2: Medium detail
    let h2 = perlin.get([x * 0.02, z * 0.02]) * 8.0;
    // Octave 3: Small bumps
    let h3 = perlin.get([x * 0.08, z * 0.08]) * 3.0;
    // Octave 4: Micro detail
    let h4 = perlin.get([x * 0.15, z * 0.15]) * 1.5;

    let base = 12.0; // Base terrain height
    (base + h1 + h2 + h3 + h4).max(1.0) as i32
}

/// Check if a tree should grow here (deterministic based on position)
fn should_place_tree(perlin: &Perlin, x: i32, z: i32, height: i32) -> bool {
    if height <= SEA_LEVEL + 1 {
        return false; // No trees on beaches/underwater
    }
    let tree_val = perlin.get([x as f64 * 0.8 + 500.0, z as f64 * 0.8 + 500.0]);
    tree_val > 0.45
}

fn generate_tree(blocks: &mut Vec<BlockData>, bx: i32, by: i32, bz: i32) {
    let trunk_h = 5;
    for dy in 0..trunk_h {
        blocks.push(BlockData { x: bx, y: by + dy, z: bz, block_type: BLOCK_WOOD });
    }
    let leaf_y = by + trunk_h - 1;
    for dy in 0..3i32 {
        let r: i32 = if dy == 2 { 1 } else { 2 };
        for dx in -r..=r {
            for dz in -r..=r {
                if dx.abs() == r && dz.abs() == r { continue; }
                if dx == 0 && dz == 0 && dy == 0 { continue; }
                blocks.push(BlockData {
                    x: bx + dx, y: leaf_y + dy, z: bz + dz, block_type: BLOCK_LEAVES,
                });
            }
        }
    }
}

/// Generate a single 16×16 chunk at chunk coordinates (chunk_x, chunk_z)
#[tauri::command]
fn generate_chunk(chunk_x: i32, chunk_z: i32) -> Vec<BlockData> {
    let perlin = Perlin::new(42); // Fixed seed for reproducibility
    let mut blocks = Vec::new();
    let mut tree_candidates = Vec::new();

    let base_x = chunk_x * CHUNK_SIZE;
    let base_z = chunk_z * CHUNK_SIZE;

    for lx in 0..CHUNK_SIZE {
        for lz in 0..CHUNK_SIZE {
            let wx = base_x + lx;
            let wz = base_z + lz;
            let height = terrain_height(&perlin, wx, wz);
            let is_beach = height <= SEA_LEVEL + 1 && height >= SEA_LEVEL - 1;

            // Solid terrain column
            for y in 0..=height {
                let block_type = if y == height {
                    if is_beach || height <= SEA_LEVEL { BLOCK_SAND } else { BLOCK_GRASS }
                } else if y > height - 4 {
                    if is_beach { BLOCK_SAND } else { BLOCK_DIRT }
                } else {
                    BLOCK_STONE
                };
                blocks.push(BlockData { x: wx, y, z: wz, block_type });
            }

            // Water: fill up to sea level if terrain is below
            if height < SEA_LEVEL {
                for y in (height + 1)..=SEA_LEVEL {
                    blocks.push(BlockData { x: wx, y, z: wz, block_type: BLOCK_WATER });
                }
            }

            // Tree candidate (only in inner area to avoid cross-chunk issues)
            if lx >= 3 && lx < CHUNK_SIZE - 3 && lz >= 3 && lz < CHUNK_SIZE - 3 {
                if should_place_tree(&perlin, wx, wz, height) {
                    tree_candidates.push((wx, height + 1, wz));
                }
            }
        }
    }

    // Generate trees
    for (tx, ty, tz) in tree_candidates {
        generate_tree(&mut blocks, tx, ty, tz);
    }

    blocks
}

fn main() {
    #[cfg(target_os = "linux")]
    unsafe {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![generate_chunk])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
