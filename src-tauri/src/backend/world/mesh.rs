//! Chunk meshing for frontend rendering.
//!
//! The mesher emits quads only for exposed faces and preserves material groups
//! so the frontend can apply per-face textures.

use crate::backend::types::{
    ChunkMeshPart, ChunkMeshPayload, IVec3, MeshGroup, BLOCK_AIR, BLOCK_WATER,
};
use std::collections::HashMap;

/// Static description of one cube face.
#[derive(Clone, Copy)]
struct FaceDef {
    neighbor: IVec3,
    normal: [f32; 3],
    corners: [[f32; 3]; 4],
    material_index: u8,
}

const FACE_DEFS: [FaceDef; 6] = [
    FaceDef {
        neighbor: IVec3 { x: 1, y: 0, z: 0 },
        normal: [1.0, 0.0, 0.0],
        corners: [
            [0.5, -0.5, -0.5],
            [0.5, 0.5, -0.5],
            [0.5, 0.5, 0.5],
            [0.5, -0.5, 0.5],
        ],
        material_index: 0,
    },
    FaceDef {
        neighbor: IVec3 { x: -1, y: 0, z: 0 },
        normal: [-1.0, 0.0, 0.0],
        corners: [
            [-0.5, -0.5, 0.5],
            [-0.5, 0.5, 0.5],
            [-0.5, 0.5, -0.5],
            [-0.5, -0.5, -0.5],
        ],
        material_index: 1,
    },
    FaceDef {
        neighbor: IVec3 { x: 0, y: 1, z: 0 },
        normal: [0.0, 1.0, 0.0],
        corners: [
            [-0.5, 0.5, 0.5],
            [0.5, 0.5, 0.5],
            [0.5, 0.5, -0.5],
            [-0.5, 0.5, -0.5],
        ],
        material_index: 2,
    },
    FaceDef {
        neighbor: IVec3 { x: 0, y: -1, z: 0 },
        normal: [0.0, -1.0, 0.0],
        corners: [
            [-0.5, -0.5, -0.5],
            [0.5, -0.5, -0.5],
            [0.5, -0.5, 0.5],
            [-0.5, -0.5, 0.5],
        ],
        material_index: 3,
    },
    FaceDef {
        neighbor: IVec3 { x: 0, y: 0, z: 1 },
        normal: [0.0, 0.0, 1.0],
        corners: [
            [0.5, -0.5, 0.5],
            [0.5, 0.5, 0.5],
            [-0.5, 0.5, 0.5],
            [-0.5, -0.5, 0.5],
        ],
        material_index: 4,
    },
    FaceDef {
        neighbor: IVec3 { x: 0, y: 0, z: -1 },
        normal: [0.0, 0.0, -1.0],
        corners: [
            [-0.5, -0.5, -0.5],
            [-0.5, 0.5, -0.5],
            [0.5, 0.5, -0.5],
            [0.5, -0.5, -0.5],
        ],
        material_index: 5,
    },
];

/// Temporary mesh buffers for a single material slot.
#[derive(Default)]
struct SurfaceBuffer {
    positions: Vec<f32>,
    normals: Vec<f32>,
    uvs: Vec<f32>,
    indices: Vec<u32>,
}

/// Per-block-type surface accumulator.
#[derive(Default)]
struct MeshCollector {
    surfaces: [SurfaceBuffer; 6],
}

/// Builds a render-ready chunk mesh from raw block data.
///
/// # Examples
///
/// ```rust,ignore
/// use std::collections::HashMap;
/// use minecraft_tauri_lib::backend::types::IVec3;
/// use minecraft_tauri_lib::backend::world::mesh::build_chunk_mesh;
///
/// let mut blocks = HashMap::new();
/// blocks.insert(IVec3 { x: 0, y: 0, z: 0 }, 1);
///
/// let mesh = build_chunk_mesh(0, 0, blocks, |_| 0);
/// assert_eq!(mesh.chunk_x, 0);
/// assert_eq!(mesh.chunk_z, 0);
/// assert!(!mesh.parts.is_empty());
/// ```
pub fn build_chunk_mesh<F>(
    chunk_x: i32,
    chunk_z: i32,
    blocks: HashMap<IVec3, u8>,
    mut block_at: F,
) -> ChunkMeshPayload
where
    F: FnMut(IVec3) -> u8,
{
    let mut collectors: HashMap<u8, MeshCollector> = HashMap::new();

    for (pos, block_type) in blocks {
        if block_type == BLOCK_AIR {
            continue;
        }

        for face in FACE_DEFS {
            let neighbor_pos = IVec3 {
                x: pos.x + face.neighbor.x,
                y: pos.y + face.neighbor.y,
                z: pos.z + face.neighbor.z,
            };
            let neighbor = block_at(neighbor_pos);
            if !face_exposed(block_type, neighbor) {
                continue;
            }

            // Keep material groups separate so the frontend can preserve
            // per-face textures like grass top/side/bottom.
            let collector = collectors.entry(block_type).or_default();
            append_face(
                &mut collector.surfaces[face.material_index as usize],
                pos,
                face,
            );
        }
    }

    let mut parts = Vec::new();
    for (block_type, collector) in collectors {
        let mut positions = Vec::new();
        let mut normals = Vec::new();
        let mut uvs = Vec::new();
        let mut indices = Vec::new();
        let mut groups = Vec::new();

        let mut vertex_offset = 0u32;
        let mut index_offset = 0u32;

        for (material_index, surface) in collector.surfaces.into_iter().enumerate() {
            if surface.indices.is_empty() {
                continue;
            }

            positions.extend_from_slice(&surface.positions);
            normals.extend_from_slice(&surface.normals);
            uvs.extend_from_slice(&surface.uvs);
            indices.extend(surface.indices.into_iter().map(|i| i + vertex_offset));

            let index_count = (positions.len() / 3) as u32;
            let current_count = (indices.len() as u32).saturating_sub(index_offset);
            groups.push(MeshGroup {
                material_index: material_index as u8,
                start: index_offset,
                count: current_count,
            });

            vertex_offset = index_count;
            index_offset = indices.len() as u32;
        }

        if !indices.is_empty() {
            parts.push(ChunkMeshPart {
                block_type,
                positions,
                normals,
                uvs,
                indices,
                groups,
            });
        }
    }

    ChunkMeshPayload {
        chunk_x,
        chunk_z,
        parts,
    }
}

/// Appends a single face quad to the target surface buffer.
fn append_face(surface: &mut SurfaceBuffer, pos: IVec3, face: FaceDef) {
    let base = (surface.positions.len() / 3) as u32;
    let uvs = [[0.0_f32, 0.0_f32], [0.0, 1.0], [1.0, 1.0], [1.0, 0.0]];
    for (corner, uv) in face.corners.into_iter().zip(uvs.into_iter()) {
        surface.positions.extend_from_slice(&[
            pos.x as f32 + corner[0],
            pos.y as f32 + corner[1],
            pos.z as f32 + corner[2],
        ]);
        surface.normals.extend_from_slice(&face.normal);
        surface.uvs.extend_from_slice(&uv);
    }
    surface
        .indices
        .extend_from_slice(&[base, base + 1, base + 2, base, base + 2, base + 3]);
}

/// Returns whether a face between two neighboring blocks is visible.
fn face_exposed(block_type: u8, neighbor_type: u8) -> bool {
    if block_type == BLOCK_WATER {
        return neighbor_type != BLOCK_WATER;
    }
    neighbor_type == BLOCK_AIR || neighbor_type == BLOCK_WATER
}
