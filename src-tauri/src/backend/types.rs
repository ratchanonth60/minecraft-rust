use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Shared block ids used by both the backend simulation and frontend materials.
pub const BLOCK_AIR: u8 = 0;
pub const BLOCK_GRASS: u8 = 1;
pub const BLOCK_DIRT: u8 = 2;
pub const BLOCK_STONE: u8 = 3;
pub const BLOCK_SAND: u8 = 4;
pub const BLOCK_WOOD: u8 = 5;
pub const BLOCK_LEAVES: u8 = 6;
pub const BLOCK_WATER: u8 = 7;

pub const CHUNK_SIZE: i32 = 16;
pub const SEA_LEVEL: i32 = 10;
pub const WORLD_HEIGHT: i32 = 96;
pub const PLAYER_RADIUS: f32 = 0.35;
pub const PLAYER_STEP_HEIGHT: f32 = 0.6;

/// Integer voxel coordinate in world space.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, Eq, PartialEq, Hash)]
pub struct IVec3 {
    pub x: i32,
    pub y: i32,
    pub z: i32,
}

/// Chunk coordinate on the XZ plane.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, Eq, PartialEq, Hash)]
pub struct ChunkCoord {
    pub x: i32,
    pub z: i32,
}

/// Serialized block override stored in save files.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChunkBlock {
    pub pos: IVec3,
    pub block_type: u8,
}

/// Index range for a single Three.js material group inside a chunk part.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MeshGroup {
    pub material_index: u8,
    pub start: u32,
    pub count: u32,
}

/// Mesh data for one logical block type within a chunk.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChunkMeshPart {
    pub block_type: u8,
    pub positions: Vec<f32>,
    pub normals: Vec<f32>,
    pub uvs: Vec<f32>,
    pub indices: Vec<u32>,
    pub groups: Vec<MeshGroup>,
}

/// Render-ready payload returned to the frontend for a chunk request.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChunkMeshPayload {
    pub chunk_x: i32,
    pub chunk_z: i32,
    pub parts: Vec<ChunkMeshPart>,
}

/// Response returned when the frontend initializes or resets the world.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WorldInit {
    pub seed: u32,
    pub spawn: SpawnPoint,
}

/// World-space spawn position used by the frontend camera rig.
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct SpawnPoint {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

/// Input payload for a single backend-owned player physics step.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlayerSimulationInput {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    #[serde(alias = "velocityY")]
    pub velocity_y: f32,
    #[serde(alias = "deltaTime")]
    pub delta_time: f32,
    #[serde(alias = "moveX")]
    pub move_x: f32,
    #[serde(alias = "moveZ")]
    pub move_z: f32,
    pub jump: bool,
    #[serde(alias = "playerHeight")]
    pub player_height: f32,
    pub sprinting: bool,
}

/// Output of the backend player simulation step.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlayerSimulationOutput {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub velocity_y: f32,
    pub is_on_ground: bool,
}

/// Request for grid-based pathfinding in the current world state.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PathRequest {
    pub start: IVec3,
    pub goal: IVec3,
    pub max_nodes: Option<usize>,
}

/// Serializable world delta persisted to disk.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SavedWorld {
    pub seed: u32,
    pub modified_blocks: Vec<ChunkBlock>,
    pub removed_blocks: Vec<IVec3>,
}

/// Raw chunk block storage before meshing.
#[derive(Clone)]
pub struct ChunkData {
    pub blocks: HashMap<IVec3, u8>,
}
