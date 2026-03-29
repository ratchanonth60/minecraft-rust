import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { World } from "../world/World";
import { BLOCK_GRASS } from "../world/TextureManager";

export class Player {
  camera: THREE.PerspectiveCamera;
  controls: PointerLockControls;
  world: World;
  keys: Record<string, boolean> = {};

  // Movement
  baseSpeed = 5.0;
  sprintMultiplier = 1.6;
  isSprinting = false;

  // Physics
  velocityY = 0;
  gravity = -25;
  lastValidGroundY = 0;
  jumpForce = 9;
  isOnGround = false;
  playerHeight = 1.6;

  // Raycasting
  private raycaster = new THREE.Raycaster();
  private center = new THREE.Vector2(0, 0);

  // Block highlight
  highlightMesh: THREE.LineSegments;
  private highlightTimer = 0;
  private highlightInterval = 0.08;

  // Selected block type
  selectedBlockType: number = BLOCK_GRASS;

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    world: World,
  ) {
    this.camera = camera;
    this.world = world;
    this.controls = new PointerLockControls(camera, domElement);

    // Block highlight wireframe
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

    // Lock pointer
    domElement.addEventListener("click", () => {
      if (!this.controls.isLocked) this.controls.lock();
    });

    // Keyboard
    document.addEventListener("keydown", (e) => {
      this.keys[e.code] = true;
    });
    document.addEventListener("keyup", (e) => {
      this.keys[e.code] = false;
      if (e.code === "ControlLeft" || e.code === "ControlRight")
        this.isSprinting = false;
    });

    // Block interaction
    document.addEventListener("mousedown", (event) => {
      if (!this.controls.isLocked || !world.ready) return;

      this.raycaster.setFromCamera(this.center, this.camera);
      this.raycaster.far = 6;
      const intersects = this.raycaster.intersectObjects(world.blocks, false);
      if (intersects.length === 0) return;

      const hit = intersects[0];

      if (event.button === 0) {
        // LEFT CLICK = BREAK
        world.breakBlock(hit);
      } else if (event.button === 2 && hit.face) {
        // RIGHT CLICK = PLACE
        const blockPos = world.getHitPosition(hit);
        if (!blockPos) return;

        const newPos = blockPos.clone().add(hit.face.normal).round();

        // Don't place inside player
        const px = Math.round(this.camera.position.x);
        const pz = Math.round(this.camera.position.z);
        const feetY = Math.round(this.camera.position.y - this.playerHeight);
        if (
          Math.round(newPos.x) === px &&
          Math.round(newPos.z) === pz &&
          Math.round(newPos.y) >= feetY &&
          Math.round(newPos.y) <= feetY + 1
        )
          return;

        world.addBlock(newPos, this.selectedBlockType);
      }
    });

    document.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  update(deltaTime: number) {
    if (!this.controls.isLocked || !this.world.ready) return;

    if (this.keys["ControlLeft"] || this.keys["ControlRight"])
      this.isSprinting = true;
    const speed =
      this.baseSpeed *
      (this.isSprinting ? this.sprintMultiplier : 1) *
      deltaTime;

    if (this.keys["KeyW"]) this.controls.moveForward(speed);
    if (this.keys["KeyS"]) this.controls.moveForward(-speed);
    if (this.keys["KeyA"]) this.controls.moveRight(-speed);
    if (this.keys["KeyD"]) this.controls.moveRight(speed);

    // Jump
    if (this.keys["Space"] && this.isOnGround) {
      this.velocityY = this.jumpForce;
      this.isOnGround = false;
    }

    // Gravity
    this.velocityY += this.gravity * deltaTime;
    this.camera.position.y += this.velocityY * deltaTime;

    // Ground collision
    const groundY = this.world.getGroundHeight(
      this.camera.position.x,
      this.camera.position.z,
    );
    // Use cached ground height when chunk is unloaded (groundY === -1)
    const effectiveGround = groundY >= 0 ? groundY : this.lastValidGroundY;
    if (groundY >= 0) this.lastValidGroundY = groundY;
    const surface = effectiveGround + 1;
    if (
      this.camera.position.y - this.playerHeight <= surface &&
      this.velocityY <= 0
    ) {
      this.camera.position.y = surface + this.playerHeight;
      this.velocityY = 0;
      this.isOnGround = true;
    } else {
      this.isOnGround = false;
    }

    // Respawn on void
    if (this.camera.position.y < -20) {
      this.camera.position.set(0, 30, 0);
      this.velocityY = 0;
    }

    // Throttled highlight
    this.highlightTimer += deltaTime;
    if (this.highlightTimer >= this.highlightInterval) {
      this.highlightTimer = 0;
      this.updateHighlight();
    }
  }

  private updateHighlight() {
    this.raycaster.setFromCamera(this.center, this.camera);
    this.raycaster.far = 6;
    const intersects = this.raycaster.intersectObjects(
      this.world.blocks,
      false,
    );

    if (intersects.length > 0) {
      const pos = this.world.getHitPosition(intersects[0]);
      if (pos) {
        this.highlightMesh.position.copy(pos);
        this.highlightMesh.visible = true;
        return;
      }
    }
    this.highlightMesh.visible = false;
  }

  getPosition(): THREE.Vector3 {
    return this.camera.position;
  }
}
