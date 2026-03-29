# Backend API

The frontend talks to Rust through Tauri commands defined in `src-tauri/src/backend/commands.rs`.

## Commands

### `init_world(seed?: number) -> WorldInit`

Resets the in-memory world state and returns:

- `seed`: the seed being used
- `spawn`: `{ x, y, z }` spawn position for the player camera

### `get_chunk_mesh(chunk_x: number, chunk_z: number) -> ChunkMeshPayload`

Returns render-ready chunk geometry:

- `chunk_x`, `chunk_z`: chunk coordinate
- `parts[]`: one mesh part per block type
- `positions`, `normals`, `uvs`, `indices`: flattened vertex buffers
- `groups[]`: material index ranges for Three.js groups

### `place_block(x, y, z, block_type) -> ChunkMeshPayload[]`

Places a block and returns every chunk that must be rebuilt because of the edit.

### `remove_block(x, y, z) -> ChunkMeshPayload[]`

Removes a block and returns every chunk that must be rebuilt because of the edit.

### `simulate_player(input) -> PlayerSimulationOutput`

Runs one backend physics step.

Important fields in `input`:

- `x`, `y`, `z`: current player position
- `velocity_y`: vertical velocity
- `delta_time`: frame delta used for the step
- `move_x`, `move_z`: desired movement vector in world space
- `jump`: whether jump was requested this frame
- `player_height`: eye-to-feet offset used for collision
- `sprinting`: whether sprint speed should apply

### `find_path(request) -> IVec3[]`

Runs A* pathfinding in the current world.

### `save_world(slot?: string) -> string`

Persists the current world delta and returns the written file path.

### `load_world(slot?: string) -> boolean`

Loads a saved world delta if it exists and returns whether a file was found.

## Notes

- Rust is the authoritative simulation layer.
- The frontend should treat returned data as source of truth.
- Chunk payloads are already face-culled and grouped for rendering.
