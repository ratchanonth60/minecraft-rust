import * as THREE from "three";
import { invoke } from "@tauri-apps/api/core";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { World } from "../world/World";
import { BLOCK_GRASS } from "../world/TextureManager";

interface PlayerSimulationOutput {
  x: number;
  y: number;
  z: number;
  velocity_y: number;
  is_on_ground: boolean;
}

/**
 * Browser-side player controller.
 *
 * Input collection, raycasts, and pointer lock live here. Actual physics and
 * collision resolution are delegated to the Rust backend.
 */
export class Player {
  camera: THREE.PerspectiveCamera;
  controls: PointerLockControls;
  world: World;
  keys: Record<string, boolean> = {};

  baseSpeed = 1.0;
  sprintMultiplier = 1.6;
  isSprinting = false;

  velocityY = 0;
  jumpForce = 9;
  isOnGround = false;
  playerHeight = 1.6;
  selectedBlockType: number = BLOCK_GRASS;

  private raycaster = new THREE.Raycaster();
  private center = new THREE.Vector2(0, 0);
  private forward = new THREE.Vector3();
  private right = new THREE.Vector3();
  private moveIntent = new THREE.Vector3();
  private highlightTimer = 0;
  private highlightInterval = 0.08;
  private physicsAccumulator = 0;
  private physicsPending = false;

  highlightMesh: THREE.LineSegments;

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    world: World,
  ) {
    /**
     * Creates the browser-side player controller and binds all DOM input.
     *
     * What it does:
     * - stores references to the camera, world bridge, and pointer-lock controls
     * - creates a wireframe highlight mesh used for block targeting feedback
     * - attaches keyboard and mouse listeners for movement and block interaction
     *
     * How it works:
     * - pointer lock is requested when the canvas container is clicked
     * - keyboard events only collect intent into `this.keys`
     * - mouse clicks raycast against currently rendered chunk meshes
     * - actual block edits are forwarded to Rust through `World`
     */
    this.camera = camera;
    this.world = world;
    this.controls = new PointerLockControls(camera, domElement);

    // Outline mesh used to preview the currently targeted block.
    const hlGeom = new THREE.EdgesGeometry(
      new THREE.BoxGeometry(1.005, 1.005, 1.005),
    );
    const hlMat = new THREE.LineBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.6,
    });
    this.highlightMesh = new THREE.LineSegments(hlGeom, hlMat);
    this.highlightMesh.visible = false;
    this.highlightMesh.raycast = () => {};
    world.scene.add(this.highlightMesh);

    // Pointer lock is the only browser-specific piece of movement ownership.
    domElement.addEventListener("click", () => {
      if (!this.controls.isLocked) this.controls.lock();
    });

    document.addEventListener("keydown", (e) => {
      this.keys[e.code] = true;
    });

    document.addEventListener("keyup", (e) => {
      this.keys[e.code] = false;
      if (e.code === "ControlLeft" || e.code === "ControlRight") {
        this.isSprinting = false;
      }
    });

    document.addEventListener("mousedown", async (event) => {
      if (!this.controls.isLocked || !world.ready) return;

      // Interaction still raycasts locally, but the actual block mutation and
      // resulting chunk remesh happen on the Rust side.
      this.raycaster.setFromCamera(this.center, this.camera);
      this.raycaster.far = 6;
      const intersects = this.raycaster.intersectObjects(world.blocks, false);
      if (intersects.length === 0) return;

      const hit = intersects[0];

      if (event.button === 0) {
        await world.breakBlock(hit);
      } else if (event.button === 2) {
        const newPos = world.getPlacementPosition(hit);
        if (!newPos) return;

        const px = Math.round(this.camera.position.x);
        const pz = Math.round(this.camera.position.z);
        const feetY = Math.round(this.camera.position.y - this.playerHeight);
        if (
          Math.round(newPos.x) === px &&
          Math.round(newPos.z) === pz &&
          Math.round(newPos.y) >= feetY &&
          Math.round(newPos.y) <= feetY + 1
        ) {
          return;
        }

        await world.addBlock(newPos, this.selectedBlockType);
      }
    });

    document.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  /**
   * Teleports the player to a new position.
   *
   * What it does:
   * - copies the provided world position into the camera
   * - clears vertical velocity and grounded state so old movement does not leak
   *
   * How it works:
   * - the frontend camera is treated as the local representation of the player
   * - the next backend physics step will continue from this new authoritative spot
   */
  setPosition(position: THREE.Vector3) {
    this.camera.position.copy(position);
    this.velocityY = 0;
    this.isOnGround = false;
  }

  /**
   * Runs one frame of local player-side updates.
   *
   * What it does:
   * - ignores updates while pointer lock is inactive or the world is not ready
   * - accumulates delta time for backend physics stepping
   * - updates sprint intent from keyboard state
   * - throttles block-highlight raycasts so they do not run every render frame
   *
   * How it works:
   * - render frames can be more frequent than simulation steps
   * - this method batches time in `physicsAccumulator`
   * - once enough time has accumulated, it triggers `stepPhysics`
   * - highlight updates stay local because they are purely visual feedback
   */
  update(deltaTime: number) {
    if (!this.controls.isLocked || !this.world.ready) return;

    this.physicsAccumulator += deltaTime;
    this.isSprinting = this.keys["ControlLeft"] || this.keys["ControlRight"];

    if (!this.physicsPending && this.physicsAccumulator >= 1 / 90) {
      const dt = Math.min(this.physicsAccumulator, 0.05);
      this.physicsAccumulator = 0;
      void this.stepPhysics(dt);
    }

    this.highlightTimer += deltaTime;
    if (this.highlightTimer >= this.highlightInterval) {
      this.highlightTimer = 0;
      this.updateHighlight();
    }
  }

  /**
   * Sends one movement simulation step to the Rust backend.
   *
   * What it does:
   * - converts current keyboard intent into world-space movement vectors
   * - sends position, jump state, sprint state, and vertical velocity to Rust
   * - applies the returned authoritative position and grounded state locally
   *
   * How it works:
   * - `forward` and `right` are derived from the current camera rotation
   * - the movement vector is normalized so diagonal movement is not faster
   * - Rust performs collision resolution and gravity
   * - the result replaces local transient state instead of being blended
   */
  private async stepPhysics(deltaTime: number) {
    this.physicsPending = true;

    this.forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.forward.y = 0;
    this.forward.normalize();

    this.right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.right.y = 0;
    this.right.normalize();

    this.moveIntent.set(0, 0, 0);
    if (this.keys["KeyW"]) this.moveIntent.add(this.forward);
    if (this.keys["KeyS"]) this.moveIntent.sub(this.forward);
    if (this.keys["KeyD"]) this.moveIntent.add(this.right);
    if (this.keys["KeyA"]) this.moveIntent.sub(this.right);
    if (this.moveIntent.lengthSq() > 0) {
      this.moveIntent.normalize().multiplyScalar(this.baseSpeed);
    }

    try {
      const next = await invoke<PlayerSimulationOutput>("simulate_player", {
        input: {
          x: this.camera.position.x,
          y: this.camera.position.y,
          z: this.camera.position.z,
          velocity_y: this.velocityY,
          delta_time: deltaTime,
          move_x: this.moveIntent.x,
          move_z: this.moveIntent.z,
          jump: Boolean(this.keys["Space"]),
          player_height: this.playerHeight,
          sprinting: this.isSprinting,
        },
      });

      this.camera.position.set(next.x, next.y, next.z);
      this.velocityY = next.velocity_y;
      this.isOnGround = next.is_on_ground;
    } catch (error) {
      console.error("simulate_player failed", error);
    } finally {
      this.physicsPending = false;
    }
  }

  /**
   * Updates the block highlight wireframe.
   *
   * What it does:
   * - raycasts from the screen center into the currently rendered world meshes
   * - resolves the targeted block position from the hit face
   * - moves and toggles the outline mesh so the player sees what will be edited
   *
   * How it works:
   * - the raycast is local because it only depends on visible render geometry
   * - `World.getTargetBlockPosition` converts the hit point plus face normal
   *   into the integer block cell that should be considered selected
   */
  private updateHighlight() {
    this.raycaster.setFromCamera(this.center, this.camera);
    this.raycaster.far = 6;
    const intersects = this.raycaster.intersectObjects(this.world.blocks, false);

    if (intersects.length > 0) {
      const pos = this.world.getTargetBlockPosition(intersects[0]);
      if (pos) {
        this.highlightMesh.position.copy(pos);
        this.highlightMesh.visible = true;
        return;
      }
    }

    this.highlightMesh.visible = false;
  }

  /**
   * Returns the player's current world position.
   *
   * What it does:
   * - exposes the camera position to systems like chunk streaming and debug UI
   *
   * How it works:
   * - the camera acts as the local player transform on the frontend
   */
  getPosition(): THREE.Vector3 {
    return this.camera.position;
  }
}
