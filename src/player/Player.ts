import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { World } from "../world/World";
import { BLOCK_DIRT } from "../world/TextureManager";

export class Player {
  camera: THREE.PerspectiveCamera;
  controls: PointerLockControls;
  world: World;
  keys: Record<string, boolean> = {};

  // Movement
  baseSpeed = 5.0; // blocks per second
  sprintMultiplier = 1.6;
  isSprinting = false;

  // Physics
  velocityY = 0;
  gravity = -25;
  jumpForce = 9;
  isOnGround = false;
  playerHeight = 1.6; // eyes are 1.6 blocks above feet

  // Raycasting
  raycaster = new THREE.Raycaster();
  downRay = new THREE.Raycaster();

  // Block highlight
  highlightMesh: THREE.Mesh;
  highlightedBlock: THREE.Object3D | null = null;

  // Selected block type
  selectedBlockType: number = BLOCK_DIRT;

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    world: World,
  ) {
    this.camera = camera;
    this.world = world;
    this.controls = new PointerLockControls(camera, domElement);

    // Create block highlight wireframe
    const hlGeom = new THREE.BoxGeometry(1.01, 1.01, 1.01);
    const hlMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.5,
    });
    this.highlightMesh = new THREE.Mesh(hlGeom, hlMat);
    this.highlightMesh.visible = false;
    world.scene.add(this.highlightMesh);

    // Click to lock pointer
    domElement.addEventListener("click", () => {
      if (!this.controls.isLocked) {
        this.controls.lock();
      }
    });

    // Keyboard input
    document.addEventListener("keydown", (e) => {
      this.keys[e.code] = true;
    });
    document.addEventListener("keyup", (e) => {
      this.keys[e.code] = false;
      if (e.code === "ControlLeft" || e.code === "ControlRight") {
        this.isSprinting = false;
      }
    });

    // Block interaction: left click = break, right click = place
    domElement.addEventListener("mousedown", (event) => {
      if (!this.controls.isLocked) return;

      this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
      this.raycaster.far = 7; // reach distance
      const intersects = this.raycaster.intersectObjects(world.blocks);

      if (intersects.length > 0) {
        const intersect = intersects[0];

        if (event.button === 0) {
          // Left click = break block
          world.removeBlock(intersect.object);
        } else if (event.button === 2) {
          // Right click = place block
          if (intersect.face) {
            const newPos = intersect.object.position
              .clone()
              .add(intersect.face.normal);
            // Don't place block inside player
            const playerPos = this.camera.position.clone();
            const dist = newPos.distanceTo(
              new THREE.Vector3(playerPos.x, playerPos.y - 0.8, playerPos.z),
            );
            if (dist > 0.8) {
              world.addBlock(newPos, this.selectedBlockType);
            }
          }
        }
      }
    });

    // Prevent context menu on right click
    domElement.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  update(deltaTime: number) {
    if (!this.controls.isLocked) return;

    // Sprint
    if (
      this.keys["ControlLeft"] ||
      this.keys["ControlRight"]
    ) {
      this.isSprinting = true;
    }

    const speed =
      this.baseSpeed *
      (this.isSprinting ? this.sprintMultiplier : 1) *
      deltaTime;

    // Movement
    if (this.keys["KeyW"]) this.controls.moveForward(speed);
    if (this.keys["KeyS"]) this.controls.moveForward(-speed);
    if (this.keys["KeyA"]) this.controls.moveRight(-speed);
    if (this.keys["KeyD"]) this.controls.moveRight(speed);

    // Jump
    if (this.keys["Space"] && this.isOnGround) {
      this.velocityY = this.jumpForce;
      this.isOnGround = false;
    }

    // Apply gravity
    this.velocityY += this.gravity * deltaTime;
    this.camera.position.y += this.velocityY * deltaTime;

    // Ground collision - cast ray downward from player position
    const feetPos = this.camera.position.clone();
    feetPos.y -= this.playerHeight;

    // Check if there's a block below feet
    const groundY = this.world.getGroundHeight(
      this.camera.position.x,
      this.camera.position.z,
    );
    const groundSurface = groundY + 1; // top of the block
    const feetY = this.camera.position.y - this.playerHeight;

    if (feetY <= groundSurface && this.velocityY <= 0) {
      this.camera.position.y = groundSurface + this.playerHeight;
      this.velocityY = 0;
      this.isOnGround = true;
    } else {
      this.isOnGround = false;
    }

    // Prevent falling through the void
    if (this.camera.position.y < -10) {
      this.camera.position.y = 20;
      this.velocityY = 0;
    }

    // Block highlight — show wireframe on hovered block
    this.updateBlockHighlight();
  }

  private updateBlockHighlight() {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    this.raycaster.far = 7;
    const intersects = this.raycaster.intersectObjects(this.world.blocks);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      this.highlightMesh.position.copy(hit.position);
      this.highlightMesh.visible = true;
      this.highlightedBlock = hit;
    } else {
      this.highlightMesh.visible = false;
      this.highlightedBlock = null;
    }
  }

  getPosition(): THREE.Vector3 {
    return this.camera.position.clone();
  }
}
