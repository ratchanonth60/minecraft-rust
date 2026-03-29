//! Procedural chunk generation.
//!
//! Terrain is generated deterministically from the world seed using layered
//! noise fields for terrain shape, caves, and lightweight structures.

use super::helpers::is_solid;
use crate::backend::types::{
    ChunkCoord, IVec3, BLOCK_DIRT, BLOCK_GRASS, BLOCK_LEAVES, BLOCK_SAND, BLOCK_STONE, BLOCK_WATER,
    BLOCK_WOOD, CHUNK_SIZE, SEA_LEVEL, WORLD_HEIGHT,
};
use noise::{NoiseFn, Perlin};
use std::collections::HashMap;

/// Samples the procedural height field for a world column.
///
/// # Examples
///
/// ```rust,ignore
/// use noise::Perlin;
/// use minecraft_tauri_lib::backend::world::generation::terrain_height;
///
/// let terrain = Perlin::new(42);
/// let climate = Perlin::new(7);
/// let height = terrain_height(&terrain, &climate, 0, 0);
/// assert!(height >= 2);
/// ```
pub fn terrain_height(terrain: &Perlin, climate: &Perlin, x: i32, z: i32) -> i32 {
    let xf = x as f64;
    let zf = z as f64;
    let macro_hills = terrain.get([xf * 0.004, zf * 0.004]) * 28.0;
    let ridges = terrain.get([xf * 0.012, zf * 0.012]) * 10.0;
    let details = terrain.get([xf * 0.05, zf * 0.05]) * 3.0;
    let climate_bias = climate.get([xf * 0.002, zf * 0.002]) * 7.0;
    (16.0 + macro_hills + ridges + details + climate_bias)
        .round()
        .clamp(2.0, (WORLD_HEIGHT - 8) as f64) as i32
}

/// Generates raw block data for a single chunk.
///
/// # Examples
///
/// ```rust,ignore
/// use minecraft_tauri_lib::backend::types::ChunkCoord;
/// use minecraft_tauri_lib::backend::world::generation::generate_chunk;
///
/// let chunk = generate_chunk(42, ChunkCoord { x: 0, z: 0 });
/// assert!(!chunk.is_empty());
/// ```
pub fn generate_chunk(seed: u32, coord: ChunkCoord) -> HashMap<IVec3, u8> {
    let terrain = Perlin::new(seed);
    let climate = Perlin::new(seed ^ 0xA11C_E123);
    let caves = Perlin::new(seed ^ 0xCAFE_1234);
    let structures = Perlin::new(seed ^ 0x5EED_9001);

    let base_x = coord.x * CHUNK_SIZE;
    let base_z = coord.z * CHUNK_SIZE;
    let mut blocks = HashMap::new();
    let mut tree_candidates = Vec::new();
    let mut ruin_candidates = Vec::new();

    for lx in 0..CHUNK_SIZE {
        for lz in 0..CHUNK_SIZE {
            let wx = base_x + lx;
            let wz = base_z + lz;
            let height = terrain_height(&terrain, &climate, wx, wz);
            let is_beach = (SEA_LEVEL - 1..=SEA_LEVEL + 1).contains(&height);

            // Fill the terrain column from bedrock-ish depth up to the surface.
            for y in 0..=height {
                if should_carve_cave(&caves, wx, y, wz, height) {
                    continue;
                }

                let block_type = if y == height {
                    if is_beach || height <= SEA_LEVEL {
                        BLOCK_SAND
                    } else {
                        BLOCK_GRASS
                    }
                } else if y > height - 4 {
                    if is_beach {
                        BLOCK_SAND
                    } else {
                        BLOCK_DIRT
                    }
                } else {
                    BLOCK_STONE
                };

                blocks.insert(IVec3 { x: wx, y, z: wz }, block_type);
            }

            // Water gets filled after terrain carving so caves can cut through
            // underwater sections without us writing water into those cavities.
            if height < SEA_LEVEL {
                for y in (height + 1)..=SEA_LEVEL {
                    if !should_carve_cave(&caves, wx, y, wz, height) {
                        blocks.insert(IVec3 { x: wx, y, z: wz }, BLOCK_WATER);
                    }
                }
            }

            // Keep structures away from chunk borders so the current generator
            // can stay chunk-local and deterministic without cross-chunk stitching.
            if (2..CHUNK_SIZE - 2).contains(&lx)
                && (2..CHUNK_SIZE - 2).contains(&lz)
                && should_place_tree(&structures, wx, wz, height)
            {
                tree_candidates.push((wx, height + 1, wz));
            }

            if (3..CHUNK_SIZE - 3).contains(&lx)
                && (3..CHUNK_SIZE - 3).contains(&lz)
                && should_place_ruin(&structures, wx, wz, height)
            {
                ruin_candidates.push((wx, height + 1, wz));
            }
        }
    }

    for (x, y, z) in tree_candidates {
        generate_tree(&mut blocks, x, y, z);
    }
    for (x, y, z) in ruin_candidates {
        generate_ruin(&mut blocks, x, y, z);
    }

    blocks
}

/// Returns the highest solid block in a world column.
///
/// # Examples
///
/// ```rust,ignore
/// use minecraft_tauri_lib::backend::types::IVec3;
/// use minecraft_tauri_lib::backend::world::generation::surface_height;
///
/// let top = surface_height(
///     |pos| if pos == IVec3 { x: 0, y: 3, z: 0 } { 1 } else { 0 },
///     0,
///     0,
/// );
/// assert_eq!(top, 3);
/// ```
pub fn surface_height<F>(mut block_at: F, x: i32, z: i32) -> i32
where
    F: FnMut(IVec3) -> u8,
{
    for y in (0..WORLD_HEIGHT).rev() {
        let block = block_at(IVec3 { x, y, z });
        if is_solid(block) {
            return y;
        }
    }
    0
}

/// Returns whether a terrain voxel should be removed as cave space.
fn should_carve_cave(caves: &Perlin, x: i32, y: i32, z: i32, surface_height: i32) -> bool {
    if y < 4 || y >= surface_height - 2 {
        return false;
    }
    let density = caves.get([x as f64 * 0.05, y as f64 * 0.08, z as f64 * 0.05]);
    let worm = caves.get([
        x as f64 * 0.02 + 100.0,
        y as f64 * 0.03,
        z as f64 * 0.02 + 100.0,
    ]);
    density > 0.58 && worm > -0.15
}

/// Returns whether a tree should be placed at the given world column.
fn should_place_tree(structures: &Perlin, x: i32, z: i32, height: i32) -> bool {
    if height <= SEA_LEVEL + 1 {
        return false;
    }
    structures.get([x as f64 * 0.12 + 500.0, z as f64 * 0.12 + 500.0]) > 0.48
}

/// Returns whether a ruin should be placed at the given world column.
fn should_place_ruin(structures: &Perlin, x: i32, z: i32, height: i32) -> bool {
    if height <= SEA_LEVEL + 2 {
        return false;
    }
    structures.get([x as f64 * 0.03 - 900.0, z as f64 * 0.03 - 900.0]) > 0.71
}

/// Writes a simple tree into the chunk block map.
fn generate_tree(blocks: &mut HashMap<IVec3, u8>, x: i32, y: i32, z: i32) {
    for dy in 0..5 {
        blocks.insert(IVec3 { x, y: y + dy, z }, BLOCK_WOOD);
    }
    let canopy_y = y + 4;
    for dy in 0..3i32 {
        let radius: i32 = if dy == 2 { 1 } else { 2 };
        for dx in -radius..=radius {
            for dz in -radius..=radius {
                if dx.abs() == radius && dz.abs() == radius {
                    continue;
                }
                blocks.insert(
                    IVec3 {
                        x: x + dx,
                        y: canopy_y + dy,
                        z: z + dz,
                    },
                    BLOCK_LEAVES,
                );
            }
        }
    }
}

/// Writes a lightweight ruin footprint into the chunk block map.
fn generate_ruin(blocks: &mut HashMap<IVec3, u8>, x: i32, y: i32, z: i32) {
    for dx in -2i32..=2 {
        for dz in -2i32..=2 {
            if dx.abs() == 2 || dz.abs() == 2 {
                blocks.insert(
                    IVec3 {
                        x: x + dx,
                        y,
                        z: z + dz,
                    },
                    BLOCK_STONE,
                );
            }
        }
    }
    for dy in 1..=3 {
        for (dx, dz) in [(-2, -2), (-2, 2), (2, -2), (2, 2)] {
            blocks.insert(
                IVec3 {
                    x: x + dx,
                    y: y + dy,
                    z: z + dz,
                },
                BLOCK_STONE,
            );
        }
    }
}
