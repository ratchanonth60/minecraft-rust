import * as THREE from "three";
import { invoke } from "@tauri-apps/api/core";
import {
  getBlockMaterials,
  BLOCK_DIRT,
} from "./TextureManager";

interface MeshGroup {
  material_index: number;
  start: number;
  count: number;
}

interface ChunkMeshPart {
  block_type: number;
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  groups: MeshGroup[];
}

interface ChunkMeshPayload {
  chunk_x: number;
  chunk_z: number;
  parts: ChunkMeshPart[];
}

interface WorldInit {
  seed: number;
  spawn: {
    x: number;
    y: number;
    z: number;
  };
}

interface ChunkRender {
  meshes: THREE.Mesh[];
}

const CHUNK_SIZE = 16;
const _normalMatrix = new THREE.Matrix3();

/**
 * Frontend bridge for the Rust-owned voxel world.
 *
 * This class intentionally stays thin on gameplay logic. Its job is to stream
 * chunk meshes, rebuild visible chunks after edits, and expose render objects
 * for local raycasts and highlighting.
 */
export class World {
  scene: THREE.Scene;
  renderDistance = 3;
  ready = false;

  private loadedChunks: Set<string> = new Set();
  private pendingChunks: Set<string> = new Set();
  private chunkRenders: Map<string, ChunkRender> = new Map();
  private _blocks: THREE.Object3D[] = [];
  private _dirty = true;
  private lastPlayerChunkKey = "";

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Cached raycast targets built from currently loaded chunk meshes. */
  get blocks(): THREE.Object3D[] {
    if (this._dirty) {
      this._blocks = [];
      for (const chunk of this.chunkRenders.values()) {
        this._blocks.push(...chunk.meshes);
      }
      this._dirty = false;
    }
    return this._blocks;
  }

  private invalidate() {
    this._dirty = true;
  }

  private chunkKey(cx: number, cz: number) {
    return `${cx},${cz}`;
  }

  private worldToChunk(w: number) {
    return Math.floor(w / CHUNK_SIZE);
  }

  /** Requests a meshed chunk from Rust and installs it into the scene. */
  private async fetchChunk(cx: number, cz: number) {
    const payload = await invoke<ChunkMeshPayload>("get_chunk_mesh", {
      chunkX: cx,
      chunkZ: cz,
    });
    this.applyChunkMesh(payload);
  }

  private expandMaterials(
    materials: THREE.Material | THREE.Material[],
  ): THREE.Material | THREE.Material[] {
    if (Array.isArray(materials)) return materials;
    return [materials, materials, materials, materials, materials, materials];
  }

  /** Replaces an existing chunk render with the latest backend mesh payload. */
  private applyChunkMesh(payload: ChunkMeshPayload) {
    const key = this.chunkKey(payload.chunk_x, payload.chunk_z);
    this.removeChunkRender(key);

    const meshes: THREE.Mesh[] = [];
    for (const part of payload.parts) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(part.positions, 3),
      );
      geometry.setAttribute(
        "normal",
        new THREE.Float32BufferAttribute(part.normals, 3),
      );
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(part.uvs, 2));
      geometry.setIndex(part.indices);
      geometry.clearGroups();
      for (const group of part.groups) {
        geometry.addGroup(group.start, group.count, group.material_index);
      }
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();

      const mesh = new THREE.Mesh(
        geometry,
        this.expandMaterials(getBlockMaterials(part.block_type)),
      );
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.userData.chunkKey = key;
      this.scene.add(mesh);
      meshes.push(mesh);
    }

    this.chunkRenders.set(key, { meshes });
    this.loadedChunks.add(key);
    this.invalidate();
  }

  /** Removes all Three.js resources associated with a rendered chunk. */
  private removeChunkRender(key: string) {
    const existing = this.chunkRenders.get(key);
    if (!existing) return;
    for (const mesh of existing.meshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.chunkRenders.delete(key);
    this.loadedChunks.delete(key);
    this.invalidate();
  }

  /** Initializes a fresh world in Rust and preloads chunks around the spawn point. */
  async init(seed = 42): Promise<THREE.Vector3> {
    const init = await invoke<WorldInit>("init_world", { seed });
    const spawn = new THREE.Vector3(init.spawn.x, init.spawn.y, init.spawn.z);

    const pcx = this.worldToChunk(spawn.x);
    const pcz = this.worldToChunk(spawn.z);
    // Load only the spawn chunk synchronously so startup is fast and failures
    // surface immediately. The rest of the visible radius streams in on the
    // first update tick after the game loop starts.
    await this.fetchChunk(pcx, pcz);
    this.lastPlayerChunkKey = "";
    this.ready = true;
    this.invalidate();
    return spawn;
  }

  /** Streams chunks based on the player's current chunk coordinate. */
  update(playerX: number, playerZ: number) {
    const pcx = this.worldToChunk(playerX);
    const pcz = this.worldToChunk(playerZ);
    const current = this.chunkKey(pcx, pcz);
    if (current === this.lastPlayerChunkKey) return;
    this.lastPlayerChunkKey = current;

    const rd = this.renderDistance;
    const rdSq = rd * rd + 1;
    const needed = new Set<string>();

    for (let dx = -rd; dx <= rd; dx++) {
      for (let dz = -rd; dz <= rd; dz++) {
        if (dx * dx + dz * dz > rdSq) continue;
        needed.add(this.chunkKey(pcx + dx, pcz + dz));
      }
    }

    for (const key of [...this.loadedChunks]) {
      if (!needed.has(key)) this.removeChunkRender(key);
    }

    for (const key of needed) {
      if (this.loadedChunks.has(key) || this.pendingChunks.has(key)) continue;
      const [cx, cz] = key.split(",").map(Number);
      this.pendingChunks.add(key);
      this.fetchChunk(cx, cz)
        .catch((error) => console.error("Failed to load chunk", key, error))
        .finally(() => this.pendingChunks.delete(key));
    }
  }

  /** Converts face normals from object-local space into world space. */
  private getWorldNormal(intersection: THREE.Intersection): THREE.Vector3 | null {
    if (!intersection.face) return null;
    _normalMatrix.getNormalMatrix(intersection.object.matrixWorld);
    return intersection.face.normal.clone().applyMatrix3(_normalMatrix).normalize();
  }

  /** Resolves which block the cursor is currently pointing at. */
  getTargetBlockPosition(intersection: THREE.Intersection): THREE.Vector3 | null {
    const normal = this.getWorldNormal(intersection);
    if (!normal) return null;
    return intersection.point.clone().addScaledVector(normal, -0.5).round();
  }

  /** Resolves the adjacent placement cell for a clicked block face. */
  getPlacementPosition(intersection: THREE.Intersection): THREE.Vector3 | null {
    const normal = this.getWorldNormal(intersection);
    if (!normal) return null;
    return intersection.point.clone().addScaledVector(normal, 0.5).round();
  }

  /** Removes the targeted block and swaps in rebuilt chunk meshes from Rust. */
  async breakBlock(intersection: THREE.Intersection) {
    const pos = this.getTargetBlockPosition(intersection);
    if (!pos) return;
    const updates = await invoke<ChunkMeshPayload[]>("remove_block", {
      x: Math.round(pos.x),
      y: Math.round(pos.y),
      z: Math.round(pos.z),
    });
    for (const payload of updates) this.applyChunkMesh(payload);
  }

  /** Places a block and swaps in rebuilt chunk meshes from Rust. */
  async addBlock(position: THREE.Vector3, blockType: number = BLOCK_DIRT) {
    const p = position.clone().round();
    const updates = await invoke<ChunkMeshPayload[]>("place_block", {
      x: Math.round(p.x),
      y: Math.round(p.y),
      z: Math.round(p.z),
      blockType,
    });
    for (const payload of updates) this.applyChunkMesh(payload);
  }

  /** Persists the modified world state through the backend storage layer. */
  async saveWorld(slot?: string) {
    return invoke<string>("save_world", { slot });
  }

  /** Reloads the saved world and refreshes whatever chunks are currently visible. */
  async loadWorld(slot?: string) {
    const loaded = await invoke<boolean>("load_world", { slot });
    if (!loaded) return false;

    const visible = [...this.loadedChunks].map((key) => key.split(",").map(Number));
    for (const key of [...this.loadedChunks]) {
      this.removeChunkRender(key);
    }
    await Promise.all(visible.map(([cx, cz]) => this.fetchChunk(cx, cz)));
    this.ready = true;
    return true;
  }
}
