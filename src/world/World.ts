import * as THREE from "three";
import { invoke } from "@tauri-apps/api/core";
import { getBlockMaterials, BLOCK_DIRT } from "./TextureManager";

interface BlockData {
  x: number;
  y: number;
  z: number;
  block_type: number;
}

export class World {
  scene: THREE.Scene;
  blocks: THREE.Mesh[] = [];
  // Map for quick position lookup: "x,y,z" -> mesh
  blockMap: Map<string, THREE.Mesh> = new Map();

  private geometry = new THREE.BoxGeometry(1, 1, 1);
  private edgeGeometry = new THREE.EdgesGeometry(this.geometry);
  private lineMaterial = new THREE.LineBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.15,
  });

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  private posKey(x: number, y: number, z: number): string {
    return `${Math.round(x)},${Math.round(y)},${Math.round(z)}`;
  }

  async generateWorldFromRust(size: number) {
    try {
      const rustBlocks: BlockData[] = await invoke("generate_chunk", {
        size: size,
      });

      // Batch block creation
      rustBlocks.forEach((b) => {
        const materials = getBlockMaterials(b.block_type);
        const cube = new THREE.Mesh(this.geometry, materials as any);
        const line = new THREE.LineSegments(
          this.edgeGeometry,
          this.lineMaterial,
        );
        cube.add(line);
        cube.position.set(b.x, b.y, b.z);
        // Store block_type in userData for later use
        cube.userData.blockType = b.block_type;
        this.scene.add(cube);
        this.blocks.push(cube);
        this.blockMap.set(this.posKey(b.x, b.y, b.z), cube);
      });

      console.log(
        `World generated: ${rustBlocks.length} blocks rendered.`,
      );
    } catch (error) {
      console.error("Failed to generate chunk from Rust:", error);
    }
  }

  removeBlock(mesh: THREE.Object3D) {
    this.scene.remove(mesh);
    const key = this.posKey(
      mesh.position.x,
      mesh.position.y,
      mesh.position.z,
    );
    this.blockMap.delete(key);
    this.blocks = this.blocks.filter((b) => b !== mesh);
  }

  addBlock(position: THREE.Vector3, blockType: number = BLOCK_DIRT) {
    const materials = getBlockMaterials(blockType);
    const cube = new THREE.Mesh(this.geometry, materials as any);
    const line = new THREE.LineSegments(
      this.edgeGeometry,
      this.lineMaterial,
    );
    cube.add(line);
    cube.position.copy(position).round();
    cube.userData.blockType = blockType;
    this.scene.add(cube);
    this.blocks.push(cube);
    this.blockMap.set(
      this.posKey(cube.position.x, cube.position.y, cube.position.z),
      cube,
    );
  }

  /** Check if a block exists at the given position */
  hasBlockAt(x: number, y: number, z: number): boolean {
    return this.blockMap.has(this.posKey(Math.round(x), Math.round(y), Math.round(z)));
  }

  /** Get the highest block Y at a given XZ position */
  getGroundHeight(x: number, z: number): number {
    const rx = Math.round(x);
    const rz = Math.round(z);
    let maxY = -Infinity;
    for (let y = 0; y < 30; y++) {
      if (this.blockMap.has(this.posKey(rx, y, rz))) {
        maxY = y;
      }
    }
    return maxY;
  }
}
