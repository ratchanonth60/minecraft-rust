import * as THREE from "three";
import { invoke } from "@tauri-apps/api/core";
import {
  getBlockMaterials,
  BLOCK_DIRT,
  BLOCK_GRASS,
  BLOCK_STONE,
  BLOCK_SAND,
  BLOCK_WOOD,
  BLOCK_LEAVES,
  BLOCK_WATER,
} from "./TextureManager";

interface BlockData {
  x: number;
  y: number;
  z: number;
  block_type: number;
}

interface ChunkRender {
  meshes: THREE.InstancedMesh[];
}

const CHUNK_SIZE = 16;
const NEIGHBORS: [number, number, number][] = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];

const _dummy = new THREE.Object3D();
const _matrix = new THREE.Matrix4();

export class World {
  scene: THREE.Scene;

  /** ALL block data (including hidden/culled) */
  allBlockData: Map<string, BlockData> = new Map();
  /** Set of position keys that are currently rendered */
  renderedPositions: Set<string> = new Set();

  /** Chunk system */
  private loadedChunks: Set<string> = new Set();
  private pendingChunks: Set<string> = new Set();
  private chunkRenders: Map<string, ChunkRender> = new Map();
  private chunkBlockKeys: Map<string, string[]> = new Map();

  /** Individual meshes (player-placed + revealed neighbors) */
  private individualMeshes: THREE.Mesh[] = [];
  private individualMap: Map<string, THREE.Mesh> = new Map();

  /** Cached raycast targets */
  private _blocks: THREE.Object3D[] = [];
  private _dirty = true;

  private geometry = new THREE.BoxGeometry(1, 1, 1);
  renderDistance = 3;
  ready = false;
  private lastPlayerChunkKey = "";

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** blocks getter — used by Player for raycasting */
  get blocks(): THREE.Object3D[] {
    if (this._dirty) {
      this._blocks = [];
      for (const cr of this.chunkRenders.values()) {
        for (const m of cr.meshes) {
          if (m.count > 0) this._blocks.push(m);
        }
      }
      for (const m of this.individualMeshes) {
        this._blocks.push(m);
      }
      this._dirty = false;
    }
    return this._blocks;
  }

  private invalidate() { this._dirty = true; }
  private chunkKey(cx: number, cz: number) { return `${cx},${cz}`; }
  private posKey(x: number, y: number, z: number) { return `${x},${y},${z}`; }
  private worldToChunk(w: number) { return Math.floor(w / CHUNK_SIZE); }

  private isExposed(x: number, y: number, z: number): boolean {
    for (const [dx, dy, dz] of NEIGHBORS) {
      if (!this.allBlockData.has(this.posKey(x + dx, y + dy, z + dz))) {
        return true;
      }
    }
    return false;
  }

  // ====================================================
  // Get the world position from a raycast intersection
  // (works for both InstancedMesh and regular Mesh)
  // ====================================================
  getHitPosition(intersection: THREE.Intersection): THREE.Vector3 | null {
    if (
      intersection.object instanceof THREE.InstancedMesh &&
      intersection.instanceId != null
    ) {
      intersection.object.getMatrixAt(intersection.instanceId, _matrix);
      return new THREE.Vector3().setFromMatrixPosition(_matrix);
    }
    return intersection.object.position.clone();
  }

  // ====================================================
  // Break a block from raycast hit
  // ====================================================
  breakBlock(intersection: THREE.Intersection) {
    const pos = this.getHitPosition(intersection);
    if (!pos) return;

    const x = Math.round(pos.x);
    const y = Math.round(pos.y);
    const z = Math.round(pos.z);
    const key = this.posKey(x, y, z);

    // Hide/remove the rendered block
    if (
      intersection.object instanceof THREE.InstancedMesh &&
      intersection.instanceId != null
    ) {
      // Hide InstancedMesh instance
      _dummy.position.set(0, -500, 0);
      _dummy.scale.set(0, 0, 0);
      _dummy.updateMatrix();
      intersection.object.setMatrixAt(intersection.instanceId, _dummy.matrix);
      intersection.object.instanceMatrix.needsUpdate = true;
    } else {
      // Remove individual mesh
      this.scene.remove(intersection.object);
      this.individualMeshes = this.individualMeshes.filter(
        (m) => m !== intersection.object,
      );
      this.individualMap.delete(key);
    }

    this.allBlockData.delete(key);
    this.renderedPositions.delete(key);

    // Reveal hidden neighbors
    for (const [dx, dy, dz] of NEIGHBORS) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      const nk = this.posKey(nx, ny, nz);
      if (this.allBlockData.has(nk) && !this.renderedPositions.has(nk)) {
        const data = this.allBlockData.get(nk)!;
        this.createIndividualBlock(data);
      }
    }

    this.invalidate();
  }

  // ====================================================
  // Place a block
  // ====================================================
  addBlock(position: THREE.Vector3, blockType: number = BLOCK_DIRT) {
    const p = position.clone().round();
    const key = this.posKey(p.x, p.y, p.z);
    if (this.allBlockData.has(key)) return;

    const data: BlockData = { x: p.x, y: p.y, z: p.z, block_type: blockType };
    this.allBlockData.set(key, data);
    this.createIndividualBlock(data);
    this.invalidate();
  }

  private createIndividualBlock(b: BlockData): THREE.Mesh {
    const materials = getBlockMaterials(b.block_type);
    const cube = new THREE.Mesh(this.geometry, materials as THREE.Material | THREE.Material[]);
    cube.position.set(b.x, b.y, b.z);
    cube.userData.blockType = b.block_type;
    this.scene.add(cube);
    this.individualMeshes.push(cube);
    const key = this.posKey(b.x, b.y, b.z);
    this.individualMap.set(key, cube);
    this.renderedPositions.add(key);
    return cube;
  }

  // ====================================================
  // Initial load
  // ====================================================
  async init(spawnX: number, spawnZ: number) {
    const pcx = this.worldToChunk(spawnX);
    const pcz = this.worldToChunk(spawnZ);
    const rd = this.renderDistance;
    const rdSq = rd * rd + 1;

    const promises: Promise<void>[] = [];
    for (let dx = -rd; dx <= rd; dx++) {
      for (let dz = -rd; dz <= rd; dz++) {
        if (dx * dx + dz * dz > rdSq) continue;
        promises.push(this.loadChunk(pcx + dx, pcz + dz));
      }
    }
    await Promise.all(promises);
    this.lastPlayerChunkKey = this.chunkKey(pcx, pcz);
    this.ready = true;
    this.invalidate();
  }

  // ====================================================
  // Per-frame update: load/unload chunks
  // ====================================================
  update(playerX: number, playerZ: number) {
    const pcx = this.worldToChunk(playerX);
    const pcz = this.worldToChunk(playerZ);
    const ck = this.chunkKey(pcx, pcz);
    if (ck === this.lastPlayerChunkKey) return;
    this.lastPlayerChunkKey = ck;

    const rd = this.renderDistance;
    const rdSq = rd * rd + 1;

    const needed = new Set<string>();
    for (let dx = -rd; dx <= rd; dx++) {
      for (let dz = -rd; dz <= rd; dz++) {
        if (dx * dx + dz * dz > rdSq) continue;
        needed.add(this.chunkKey(pcx + dx, pcz + dz));
      }
    }

    // Unload far chunks
    for (const key of [...this.loadedChunks]) {
      if (!needed.has(key)) this.unloadChunk(key);
    }

    // Load needed chunks
    for (const key of needed) {
      if (!this.loadedChunks.has(key) && !this.pendingChunks.has(key)) {
        const [cx, cz] = key.split(",").map(Number);
        this.pendingChunks.add(key);
        this.loadChunk(cx, cz).then(() => this.pendingChunks.delete(key));
      }
    }
  }

  // ====================================================
  // Load chunk with InstancedMesh rendering
  // ====================================================
  private async loadChunk(cx: number, cz: number) {
    const key = this.chunkKey(cx, cz);
    if (this.loadedChunks.has(key)) return;

    let blockDataList: BlockData[];
    try {
      blockDataList = await invoke<BlockData[]>("generate_chunk", {
        chunk_x: cx, chunk_z: cz,
      });
    } catch {
      blockDataList = this.fallbackChunk(cx, cz);
    }
    if (!blockDataList || blockDataList.length === 0) {
      blockDataList = this.fallbackChunk(cx, cz);
    }

    // Store all block data
    const keys: string[] = [];
    for (const b of blockDataList) {
      const pk = this.posKey(b.x, b.y, b.z);
      this.allBlockData.set(pk, b);
      keys.push(pk);
    }
    this.chunkBlockKeys.set(key, keys);

    // Group exposed blocks by type
    const byType = new Map<number, BlockData[]>();
    for (const b of blockDataList) {
      if (this.isExposed(b.x, b.y, b.z)) {
        if (!byType.has(b.block_type)) byType.set(b.block_type, []);
        byType.get(b.block_type)!.push(b);
      }
    }

    // Create InstancedMesh for each block type
    const meshes: THREE.InstancedMesh[] = [];
    for (const [blockType, blocks] of byType) {
      const mat = getBlockMaterials(blockType);
      const im = new THREE.InstancedMesh(
        this.geometry,
        mat as THREE.Material | THREE.Material[],
        blocks.length,
      );

      for (let i = 0; i < blocks.length; i++) {
        _dummy.position.set(blocks[i].x, blocks[i].y, blocks[i].z);
        _dummy.scale.set(1, 1, 1);
        _dummy.updateMatrix();
        im.setMatrixAt(i, _dummy.matrix);
        this.renderedPositions.add(this.posKey(blocks[i].x, blocks[i].y, blocks[i].z));
      }

      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingBox();
      im.computeBoundingSphere();
      this.scene.add(im);
      meshes.push(im);
    }

    this.chunkRenders.set(key, { meshes });
    this.loadedChunks.add(key);
    this.invalidate();
  }

  // ====================================================
  // Unload chunk
  // ====================================================
  private unloadChunk(key: string) {
    const cr = this.chunkRenders.get(key);
    if (cr) {
      for (const m of cr.meshes) {
        this.scene.remove(m);
        m.dispose();
      }
    }

    const blockKeys = this.chunkBlockKeys.get(key);
    if (blockKeys) {
      for (const pk of blockKeys) {
        this.allBlockData.delete(pk);
        this.renderedPositions.delete(pk);
      }
    }

    this.chunkRenders.delete(key);
    this.chunkBlockKeys.delete(key);
    this.loadedChunks.delete(key);
    this.invalidate();
  }

  // ====================================================
  // Collision helpers
  // ====================================================
  hasBlockAt(x: number, y: number, z: number): boolean {
    return this.allBlockData.has(
      this.posKey(Math.round(x), Math.round(y), Math.round(z)),
    );
  }

  getGroundHeight(x: number, z: number): number {
    const rx = Math.round(x);
    const rz = Math.round(z);
    for (let y = 50; y >= 0; y--) {
      const d = this.allBlockData.get(this.posKey(rx, y, rz));
      if (d && d.block_type !== BLOCK_WATER) return y;
    }
    return -1;
  }

  // ====================================================
  // JS fallback chunk
  // ====================================================
  private fallbackChunk(cx: number, cz: number): BlockData[] {
    const blocks: BlockData[] = [];
    const bx = cx * CHUNK_SIZE;
    const bz = cz * CHUNK_SIZE;
    const SEA = 8;

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = bx + lx, wz = bz + lz;
        const h = Math.max(1, Math.floor(
          12 + Math.sin(wx * 0.005) * 24 / 3 +
          (Math.sin(wx * 0.02) * 8 + Math.cos(wz * 0.02) * 8) / 3 +
          Math.sin((wx + wz) * 0.08) * 1,
        ));
        const beach = h <= SEA + 1 && h >= SEA - 1;

        for (let y = 0; y <= h; y++) {
          let bt: number;
          if (y === h) bt = beach || h <= SEA ? BLOCK_SAND : BLOCK_GRASS;
          else if (y > h - 4) bt = beach ? BLOCK_SAND : BLOCK_DIRT;
          else bt = BLOCK_STONE;
          blocks.push({ x: wx, y, z: wz, block_type: bt });
        }
        if (h < SEA) {
          for (let y = h + 1; y <= SEA; y++) {
            blocks.push({ x: wx, y, z: wz, block_type: BLOCK_WATER });
          }
        }
        // Sparse trees
        if (lx >= 4 && lx < 12 && lz >= 4 && lz < 12 && h > SEA + 1 && Math.sin(wx * 5.7 + wz * 3.1) > 0.7) {
          for (let dy = 1; dy <= 5; dy++) blocks.push({ x: wx, y: h + dy, z: wz, block_type: BLOCK_WOOD });
          const ly = h + 5;
          for (let dy = 0; dy < 3; dy++) {
            const r = dy === 2 ? 1 : 2;
            for (let dx = -r; dx <= r; dx++) {
              for (let dz = -r; dz <= r; dz++) {
                if (dx === 0 && dz === 0 && dy === 0) continue;
                if (Math.abs(dx) === r && Math.abs(dz) === r) continue;
                blocks.push({ x: wx + dx, y: ly + dy, z: wz + dz, block_type: BLOCK_LEAVES });
              }
            }
          }
        }
      }
    }
    return blocks;
  }
}
