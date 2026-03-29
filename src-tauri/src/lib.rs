use noise::{NoiseFn, Perlin};
use serde::Serialize;

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

fn terrain_height(perlin: &Perlin, wx: i32, wz: i32) -> i32 {
    let x = wx as f64;
    let z = wz as f64;
    let h1 = perlin.get([x * 0.005, z * 0.005]) * 24.0;
    let h2 = perlin.get([x * 0.02, z * 0.02]) * 8.0;
    let h3 = perlin.get([x * 0.08, z * 0.08]) * 3.0;
    let h4 = perlin.get([x * 0.15, z * 0.15]) * 1.5;
    (12.0 + h1 + h2 + h3 + h4).max(1.0) as i32
}

fn should_place_tree(perlin: &Perlin, x: i32, z: i32, height: i32) -> bool {
    if height <= SEA_LEVEL + 1 {
        return false;
    }
    perlin.get([x as f64 * 0.8 + 500.0, z as f64 * 0.8 + 500.0]) > 0.45
}

fn generate_tree(blocks: &mut Vec<BlockData>, bx: i32, by: i32, bz: i32) {
    for dy in 0..5 {
        blocks.push(BlockData {
            x: bx,
            y: by + dy,
            z: bz,
            block_type: BLOCK_WOOD,
        });
    }
    let ly = by + 4;
    for dy in 0..3i32 {
        let r: i32 = if dy == 2 { 1 } else { 2 };
        for dx in -r..=r {
            for dz in -r..=r {
                if dx.abs() == r && dz.abs() == r {
                    continue;
                }
                if dx == 0 && dz == 0 && dy == 0 {
                    continue;
                }
                blocks.push(BlockData {
                    x: bx + dx,
                    y: ly + dy,
                    z: bz + dz,
                    block_type: BLOCK_LEAVES,
                });
            }
        }
    }
}

#[tauri::command]
fn generate_chunk(chunk_x: i32, chunk_z: i32) -> Vec<BlockData> {
    let perlin = Perlin::new(42);
    let mut blocks = Vec::new();
    let mut trees = Vec::new();
    let bx = chunk_x * CHUNK_SIZE;
    let bz = chunk_z * CHUNK_SIZE;

    for lx in 0..CHUNK_SIZE {
        for lz in 0..CHUNK_SIZE {
            let wx = bx + lx;
            let wz = bz + lz;
            let h = terrain_height(&perlin, wx, wz);
            let beach = (SEA_LEVEL - 1..=SEA_LEVEL + 1).contains(&h);

            for y in 0..=h {
                let bt = if y == h {
                    if beach || h <= SEA_LEVEL {
                        BLOCK_SAND
                    } else {
                        BLOCK_GRASS
                    }
                } else if y > h - 4 {
                    if beach {
                        BLOCK_SAND
                    } else {
                        BLOCK_DIRT
                    }
                } else {
                    BLOCK_STONE
                };
                blocks.push(BlockData {
                    x: wx,
                    y,
                    z: wz,
                    block_type: bt,
                });
            }
            if h < SEA_LEVEL {
                for y in (h + 1)..=SEA_LEVEL {
                    blocks.push(BlockData {
                        x: wx,
                        y,
                        z: wz,
                        block_type: BLOCK_WATER,
                    });
                }
            }
            if (3..CHUNK_SIZE - 3).contains(&lx)
                && (3..CHUNK_SIZE - 3).contains(&lz)
                && should_place_tree(&perlin, wx, wz, h)
            {
                trees.push((wx, h + 1, wz));
            }
        }
    }
    for (tx, ty, tz) in trees {
        generate_tree(&mut blocks, tx, ty, tz);
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
