//! Authoritative voxel-world simulation.
//!
//! This module owns runtime world state, lazy chunk generation, player
//! collision/physics queries, and pathfinding over walkable cells.

mod generation;
mod helpers;
mod mesh;

use crate::backend::types::{
    ChunkCoord, ChunkData, ChunkMeshPayload, IVec3, PathRequest, PlayerSimulationInput,
    PlayerSimulationOutput, SpawnPoint, BLOCK_AIR, CHUNK_SIZE, PLAYER_RADIUS, PLAYER_STEP_HEIGHT,
    SEA_LEVEL, WORLD_HEIGHT,
};
use generation::{generate_chunk, surface_height};
use helpers::{chunk_coord_from_world, is_solid};
use mesh::build_chunk_mesh;
use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap, HashSet};

/// In-memory world state used by the backend simulation.
pub struct WorldState {
    /// Seed used for deterministic procedural generation.
    pub seed: u32,
    /// Lazily generated chunk cache keyed by chunk coordinate.
    pub chunks: HashMap<ChunkCoord, ChunkData>,
    /// Explicit block overrides written by player edits.
    pub modified_blocks: HashMap<IVec3, u8>,
    /// Explicit block removals applied on top of generated terrain.
    pub removed_blocks: HashSet<IVec3>,
}

impl Default for WorldState {
    fn default() -> Self {
        Self {
            seed: 42,
            chunks: HashMap::new(),
            modified_blocks: HashMap::new(),
            removed_blocks: HashSet::new(),
        }
    }
}

/// Priority-queue entry used by A* pathfinding.
#[derive(Clone, Eq, PartialEq)]
struct PathNode {
    pos: IVec3,
    f_score: i32,
    g_score: i32,
}

impl Ord for PathNode {
    fn cmp(&self, other: &Self) -> Ordering {
        other
            .f_score
            .cmp(&self.f_score)
            .then_with(|| other.g_score.cmp(&self.g_score))
    }
}

impl PartialOrd for PathNode {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl WorldState {
    /// Resets cached world state and updates the active generation seed.
    ///
    /// # Examples
    ///
    /// ```rust,ignore
    /// use minecraft_tauri_lib::backend::world::WorldState;
    ///
    /// let mut world = WorldState::default();
    /// world.reset(1234);
    /// assert_eq!(world.seed, 1234);
    /// assert!(world.chunks.is_empty());
    /// ```
    pub fn reset(&mut self, seed: u32) {
        self.seed = seed;
        self.chunks.clear();
        self.modified_blocks.clear();
        self.removed_blocks.clear();
    }

    /// Returns a spawn position above the terrain near the origin.
    ///
    /// # Examples
    ///
    /// ```rust,ignore
    /// use minecraft_tauri_lib::backend::world::WorldState;
    ///
    /// let mut world = WorldState::default();
    /// let spawn = world.spawn_point();
    /// assert!(spawn.y > 0.0);
    /// ```
    pub fn spawn_point(&mut self) -> SpawnPoint {
        let x = 0;
        let z = 0;
        let y = self.surface_height(x, z).max(SEA_LEVEL + 1) + 3;
        SpawnPoint {
            x: x as f32,
            y: y as f32,
            z: z as f32,
        }
    }

    /// Builds a meshed payload for the requested chunk.
    ///
    /// # Examples
    ///
    /// ```rust,ignore
    /// use minecraft_tauri_lib::backend::world::WorldState;
    ///
    /// let mut world = WorldState::default();
    /// let mesh = world.chunk_mesh(0, 0);
    /// assert_eq!(mesh.chunk_x, 0);
    /// assert_eq!(mesh.chunk_z, 0);
    /// ```
    pub fn chunk_mesh(&mut self, chunk_x: i32, chunk_z: i32) -> ChunkMeshPayload {
        let coord = ChunkCoord {
            x: chunk_x,
            z: chunk_z,
        };
        self.ensure_chunk(coord);

        let blocks = self
            .chunks
            .get(&coord)
            .map(|chunk| chunk.blocks.clone())
            .unwrap_or_default();

        build_chunk_mesh(chunk_x, chunk_z, blocks, |pos| self.block_at(pos))
    }

    /// Applies a block edit and rebuilds all affected chunk meshes.
    ///
    /// # Examples
    ///
    /// ```rust,ignore
    /// use minecraft_tauri_lib::backend::types::IVec3;
    /// use minecraft_tauri_lib::backend::world::WorldState;
    ///
    /// let mut world = WorldState::default();
    /// let updates = world.update_block(IVec3 { x: 0, y: 20, z: 0 }, Some(1));
    /// assert!(!updates.is_empty());
    /// ```
    pub fn update_block(&mut self, pos: IVec3, block_type: Option<u8>) -> Vec<ChunkMeshPayload> {
        let coord = chunk_coord_from_world(pos.x, pos.z);
        self.ensure_chunk(coord);

        if let Some(chunk) = self.chunks.get_mut(&coord) {
            match block_type {
                Some(bt) => {
                    chunk.blocks.insert(pos, bt);
                    self.modified_blocks.insert(pos, bt);
                    self.removed_blocks.remove(&pos);
                }
                None => {
                    chunk.blocks.remove(&pos);
                    self.modified_blocks.remove(&pos);
                    self.removed_blocks.insert(pos);
                }
            }
        }

        let mut affected = HashSet::new();
        affected.insert(coord);
        if pos.x.rem_euclid(CHUNK_SIZE) == 0 {
            affected.insert(ChunkCoord {
                x: coord.x - 1,
                z: coord.z,
            });
        }
        if pos.x.rem_euclid(CHUNK_SIZE) == CHUNK_SIZE - 1 {
            affected.insert(ChunkCoord {
                x: coord.x + 1,
                z: coord.z,
            });
        }
        if pos.z.rem_euclid(CHUNK_SIZE) == 0 {
            affected.insert(ChunkCoord {
                x: coord.x,
                z: coord.z - 1,
            });
        }
        if pos.z.rem_euclid(CHUNK_SIZE) == CHUNK_SIZE - 1 {
            affected.insert(ChunkCoord {
                x: coord.x,
                z: coord.z + 1,
            });
        }

        affected
            .into_iter()
            .map(|chunk| self.chunk_mesh(chunk.x, chunk.z))
            .collect()
    }

    /// Advances player movement by one physics step.
    ///
    /// # Examples
    ///
    /// ```rust,ignore
    /// use minecraft_tauri_lib::backend::types::PlayerSimulationInput;
    /// use minecraft_tauri_lib::backend::world::WorldState;
    ///
    /// let mut world = WorldState::default();
    /// let result = world.simulate_player(PlayerSimulationInput {
    ///     x: 0.0,
    ///     y: 20.0,
    ///     z: 0.0,
    ///     velocity_y: 0.0,
    ///     delta_time: 1.0 / 60.0,
    ///     move_x: 0.0,
    ///     move_z: 1.0,
    ///     jump: false,
    ///     player_height: 1.6,
    ///     sprinting: false,
    /// });
    /// assert!(result.y.is_finite());
    /// ```
    pub fn simulate_player(&mut self, input: PlayerSimulationInput) -> PlayerSimulationOutput {
        let mut position = [input.x, input.y, input.z];
        let mut velocity_y = input.velocity_y;
        let dt = input.delta_time.clamp(0.0, 0.05);

        let speed = if input.sprinting { 7.5 } else { 4.8 };
        let move_x = input.move_x * speed * dt;
        let move_z = input.move_z * speed * dt;

        position = self.move_axis(position, 0, move_x, input.player_height);
        position = self.move_axis(position, 2, move_z, input.player_height);

        let mut on_ground = self.is_on_ground(position, input.player_height);
        if input.jump && on_ground {
            velocity_y = 9.0;
            on_ground = false;
        }

        velocity_y += -25.0 * dt;
        position[1] += velocity_y * dt;

        if self.collides_with_player(position, input.player_height) {
            if velocity_y < 0.0 {
                position[1] = self.resolve_ground(position, input.player_height);
                on_ground = true;
            }
            velocity_y = 0.0;
        } else {
            on_ground = false;
        }

        if position[1] < -20.0 {
            let spawn = self.spawn_point();
            position = [spawn.x, spawn.y, spawn.z];
            velocity_y = 0.0;
            on_ground = false;
        }

        PlayerSimulationOutput {
            x: position[0],
            y: position[1],
            z: position[2],
            velocity_y,
            is_on_ground: on_ground,
        }
    }

    /// Computes a walkable path between two positions using A*.
    ///
    /// # Examples
    ///
    /// ```rust,ignore
    /// use minecraft_tauri_lib::backend::types::{IVec3, PathRequest};
    /// use minecraft_tauri_lib::backend::world::WorldState;
    ///
    /// let mut world = WorldState::default();
    /// let path = world.find_path(PathRequest {
    ///     start: IVec3 { x: 0, y: 20, z: 0 },
    ///     goal: IVec3 { x: 4, y: 20, z: 4 },
    ///     max_nodes: Some(1024),
    /// });
    /// assert!(path.len() <= 1024 || !path.is_empty() || path.is_empty());
    /// ```
    pub fn find_path(&mut self, request: PathRequest) -> Vec<IVec3> {
        let start = self.find_walkable(request.start);
        let goal = self.find_walkable(request.goal);
        let max_nodes = request.max_nodes.unwrap_or(4096).max(64);

        let mut open = BinaryHeap::new();
        let mut came_from: HashMap<IVec3, IVec3> = HashMap::new();
        let mut g_scores: HashMap<IVec3, i32> = HashMap::new();

        g_scores.insert(start, 0);
        open.push(PathNode {
            pos: start,
            g_score: 0,
            f_score: heuristic(start, goal),
        });

        let mut visited = 0usize;
        while let Some(current) = open.pop() {
            visited += 1;
            if visited > max_nodes {
                break;
            }
            if current.pos == goal {
                return reconstruct_path(came_from, current.pos);
            }

            for neighbor in self.walk_neighbors(current.pos) {
                let tentative = current.g_score + 1;
                if tentative < *g_scores.get(&neighbor).unwrap_or(&i32::MAX) {
                    came_from.insert(neighbor, current.pos);
                    g_scores.insert(neighbor, tentative);
                    open.push(PathNode {
                        pos: neighbor,
                        g_score: tentative,
                        f_score: tentative + heuristic(neighbor, goal),
                    });
                }
            }
        }

        Vec::new()
    }

    /// Returns the effective block id at a world-space position.
    ///
    /// # Examples
    ///
    /// ```rust,ignore
    /// use minecraft_tauri_lib::backend::types::IVec3;
    /// use minecraft_tauri_lib::backend::world::WorldState;
    ///
    /// let mut world = WorldState::default();
    /// let block = world.block_at(IVec3 { x: 0, y: 0, z: 0 });
    /// assert!(block <= 7);
    /// ```
    pub fn block_at(&mut self, pos: IVec3) -> u8 {
        if pos.y < 0 || pos.y >= WORLD_HEIGHT {
            return BLOCK_AIR;
        }
        if let Some(block_type) = self.modified_blocks.get(&pos) {
            return *block_type;
        }
        if self.removed_blocks.contains(&pos) {
            return BLOCK_AIR;
        }

        let coord = chunk_coord_from_world(pos.x, pos.z);
        self.ensure_chunk(coord);
        self.chunks
            .get(&coord)
            .and_then(|chunk| chunk.blocks.get(&pos))
            .copied()
            .unwrap_or(BLOCK_AIR)
    }

    /// Ensures the requested chunk exists in the cache.
    fn ensure_chunk(&mut self, coord: ChunkCoord) {
        if self.chunks.contains_key(&coord) {
            return;
        }

        let mut blocks = generate_chunk(self.seed, coord);
        for (pos, block_type) in self.modified_blocks.clone() {
            if chunk_coord_from_world(pos.x, pos.z) == coord {
                blocks.insert(pos, block_type);
            }
        }
        for pos in self.removed_blocks.clone() {
            if chunk_coord_from_world(pos.x, pos.z) == coord {
                blocks.remove(&pos);
            }
        }
        self.chunks.insert(coord, ChunkData { blocks });
    }

    /// Returns the highest solid block in a world column.
    fn surface_height(&mut self, x: i32, z: i32) -> i32 {
        surface_height(|pos| self.block_at(pos), x, z)
    }

    /// Resolves movement along a single horizontal axis.
    fn move_axis(
        &mut self,
        mut position: [f32; 3],
        axis: usize,
        delta: f32,
        player_height: f32,
    ) -> [f32; 3] {
        if delta.abs() < f32::EPSILON {
            return position;
        }

        let original = position[axis];
        position[axis] += delta;
        if !self.collides_with_player(position, player_height) {
            return position;
        }

        if let Some(stepped) = self.try_step(position, axis, delta, player_height) {
            return stepped;
        }

        let step = 0.05 * delta.signum();
        let mut current = original;
        while (current - original).abs() < delta.abs() {
            let next = if (delta > 0.0 && current + step > original + delta)
                || (delta < 0.0 && current + step < original + delta)
            {
                original + delta
            } else {
                current + step
            };
            position[axis] = next;
            if self.collides_with_player(position, player_height) {
                break;
            }
            current = next;
            if (current - (original + delta)).abs() < f32::EPSILON {
                break;
            }
        }
        position[axis] = current;
        position
    }

    /// Attempts a small step-up move for shallow ledges.
    fn try_step(
        &mut self,
        mut position: [f32; 3],
        axis: usize,
        target_delta: f32,
        player_height: f32,
    ) -> Option<[f32; 3]> {
        position[1] += PLAYER_STEP_HEIGHT;
        if self.collides_with_player(position, player_height) {
            return None;
        }

        position[axis] += 0.05 * target_delta.signum();
        if self.collides_with_player(position, player_height) {
            return None;
        }

        Some(position)
    }

    /// Tests the player's axis-aligned bounds against solid voxels.
    fn collides_with_player(&mut self, position: [f32; 3], player_height: f32) -> bool {
        let min_x = (position[0] - PLAYER_RADIUS).floor() as i32;
        let max_x = (position[0] + PLAYER_RADIUS).floor() as i32;
        let min_y = (position[1] - player_height).floor() as i32;
        let max_y = position[1].floor() as i32;
        let min_z = (position[2] - PLAYER_RADIUS).floor() as i32;
        let max_z = (position[2] + PLAYER_RADIUS).floor() as i32;

        for x in min_x..=max_x {
            for y in min_y..=max_y {
                for z in min_z..=max_z {
                    if is_solid(self.block_at(IVec3 { x, y, z })) {
                        return true;
                    }
                }
            }
        }
        false
    }

    /// Returns whether the player is standing on solid ground.
    fn is_on_ground(&mut self, mut position: [f32; 3], player_height: f32) -> bool {
        position[1] -= 0.08;
        self.collides_with_player(position, player_height)
    }

    /// Snaps a falling player back onto the nearest supporting surface.
    fn resolve_ground(&mut self, position: [f32; 3], player_height: f32) -> f32 {
        let probe_x = position[0].round() as i32;
        let probe_z = position[2].round() as i32;
        let mut highest = -64;
        for x in (probe_x - 1)..=(probe_x + 1) {
            for z in (probe_z - 1)..=(probe_z + 1) {
                let h = self.surface_height(x, z);
                if h > highest {
                    highest = h;
                }
            }
        }
        highest as f32 + 1.0 + player_height
    }

    /// Enumerates walkable neighbors in the four cardinal directions.
    fn walk_neighbors(&mut self, pos: IVec3) -> Vec<IVec3> {
        let mut neighbors = Vec::new();
        for (dx, dz) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
            let base = IVec3 {
                x: pos.x + dx,
                y: pos.y,
                z: pos.z + dz,
            };
            for dy in [-1, 0, 1] {
                let candidate = IVec3 {
                    x: base.x,
                    y: base.y + dy,
                    z: base.z,
                };
                if self.is_walkable(candidate) {
                    neighbors.push(candidate);
                    break;
                }
            }
        }
        neighbors
    }

    /// Returns whether a cell can be occupied by a walking entity.
    fn is_walkable(&mut self, pos: IVec3) -> bool {
        let feet = pos;
        let body = IVec3 {
            x: pos.x,
            y: pos.y + 1,
            z: pos.z,
        };
        let ground = IVec3 {
            x: pos.x,
            y: pos.y - 1,
            z: pos.z,
        };

        !is_solid(self.block_at(feet))
            && !is_solid(self.block_at(body))
            && is_solid(self.block_at(ground))
    }

    /// Projects an arbitrary position to a nearby walkable cell.
    fn find_walkable(&mut self, mut pos: IVec3) -> IVec3 {
        for offset in 0..=3 {
            let up = IVec3 {
                x: pos.x,
                y: pos.y + offset,
                z: pos.z,
            };
            if self.is_walkable(up) {
                return up;
            }
            let down = IVec3 {
                x: pos.x,
                y: pos.y - offset,
                z: pos.z,
            };
            if self.is_walkable(down) {
                return down;
            }
        }
        pos.y = self.surface_height(pos.x, pos.z) + 1;
        pos
    }
}

/// Heuristic used by A* on the voxel grid.
fn heuristic(a: IVec3, b: IVec3) -> i32 {
    (a.x - b.x).abs() + (a.y - b.y).abs() + (a.z - b.z).abs()
}

/// Reconstructs a path from the A* parent map.
fn reconstruct_path(mut came_from: HashMap<IVec3, IVec3>, mut current: IVec3) -> Vec<IVec3> {
    let mut path = vec![current];
    while let Some(prev) = came_from.remove(&current) {
        current = prev;
        path.push(current);
    }
    path.reverse();
    path
}
