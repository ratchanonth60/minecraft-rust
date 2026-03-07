use serde::Serialize;
use noise::{NoiseFn, Perlin};

// Block types
const BLOCK_GRASS: u8 = 1;
const BLOCK_DIRT: u8 = 2;
const BLOCK_STONE: u8 = 3;
const BLOCK_SAND: u8 = 4;
const BLOCK_WOOD: u8 = 5;
const BLOCK_LEAVES: u8 = 6;

#[derive(Serialize)]
struct BlockData {
    x: i32,
    y: i32,
    z: i32,
    block_type: u8,
}

fn should_place_tree(perlin: &Perlin, x: i32, z: i32) -> bool {
    let tree_noise = perlin.get([x as f64 * 0.5 + 1000.0, z as f64 * 0.5 + 1000.0]);
    tree_noise > 0.55
}

fn generate_tree(blocks: &mut Vec<BlockData>, base_x: i32, base_y: i32, base_z: i32) {
    let trunk_height = 5;
    for dy in 0..trunk_height {
        blocks.push(BlockData { x: base_x, y: base_y + dy, z: base_z, block_type: BLOCK_WOOD });
    }
    let leaf_base = base_y + trunk_height - 1;
    for dy in 0..3i32 {
        let radius: i32 = if dy == 2 { 1 } else { 2 };
        for dx in -radius..=radius {
            for dz in -radius..=radius {
                if dx.abs() == radius && dz.abs() == radius && dy < 2 { continue; }
                if dx == 0 && dz == 0 && dy < 1 { continue; }
                blocks.push(BlockData { x: base_x + dx, y: leaf_base + dy, z: base_z + dz, block_type: BLOCK_LEAVES });
            }
        }
    }
}

#[tauri::command]
fn generate_chunk(size: i32) -> Vec<BlockData> {
    let mut blocks = Vec::new();
    let perlin = Perlin::new(42);
    let scale = 0.08;
    let amplitude = 8.0;
    let base_height = 4;
    let mut surface_map: Vec<(i32, i32, i32)> = Vec::new();

    for x in -size..size {
        for z in -size..size {
            let noise_val = perlin.get([x as f64 * scale, z as f64 * scale]);
            let height = base_height + (((noise_val + 1.0) / 2.0) * amplitude) as i32;
            let is_sand = height <= base_height + 1;

            for y in 0..=height {
                let block_type = if y == height {
                    if is_sand { BLOCK_SAND } else { BLOCK_GRASS }
                } else if y > height - 3 {
                    BLOCK_DIRT
                } else {
                    BLOCK_STONE
                };
                blocks.push(BlockData { x, y, z, block_type });
            }

            if !is_sand && height > base_height + 2 {
                surface_map.push((x, height + 1, z));
            }
        }
    }

    for (x, y, z) in &surface_map {
        if should_place_tree(&perlin, *x, *z) {
            if x.abs() < size - 3 && z.abs() < size - 3 {
                generate_tree(&mut blocks, *x, *y, *z);
            }
        }
    }

    blocks
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![generate_chunk])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
