use crate::backend::types::{
    ChunkCoord, BLOCK_DIRT, BLOCK_GRASS, BLOCK_LEAVES, BLOCK_SAND, BLOCK_STONE, BLOCK_WOOD,
    CHUNK_SIZE,
};

pub fn is_solid(block_type: u8) -> bool {
    matches!(
        block_type,
        BLOCK_GRASS | BLOCK_DIRT | BLOCK_STONE | BLOCK_SAND | BLOCK_WOOD | BLOCK_LEAVES
    )
}

pub fn chunk_coord_from_world(x: i32, z: i32) -> ChunkCoord {
    ChunkCoord {
        x: x.div_euclid(CHUNK_SIZE),
        z: z.div_euclid(CHUNK_SIZE),
    }
}
