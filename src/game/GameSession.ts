import * as THREE from "three";
import type { SceneBundle } from "../core/scene";
import { Player } from "../player/Player";
import { UI } from "../ui/UI";
import { World } from "../world/World";

/**
 * High-level game orchestrator for the webview side.
 *
 * Rust owns the simulation state; this class wires browser concerns together:
 * scene setup, input/UI binding, the render loop, and backend-driven world sync.
 */
export class GameSession {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly world: World;
  readonly player: Player;
  readonly ui: UI;

  private readonly clock = new THREE.Clock();
  private frameCount = 0;
  private fpsAccum = 0;
  private currentFps = 0;

  constructor(bundle: SceneBundle) {
    this.scene = bundle.scene;
    this.camera = bundle.camera;
    this.renderer = bundle.renderer;

    this.world = new World(this.scene);
    this.player = new Player(this.camera, this.renderer.domElement, this.world);
    this.ui = new UI();

    this.bindUi();
    this.bindLifecycle();
  }

  /** Boots the first world load and starts the render loop once the spawn is ready. */
  async init() {
    this.ui.showLoading();
    try {
      const spawn = await this.world.init(42);
      this.player.setPosition(spawn);
      this.ui.hideLoading();
      this.ui.showStartScreen();
      this.startLoop();
    } catch (error) {
      console.error("Failed to initialize game session", error);
      const message = error instanceof Error ? error.message : String(error);
      this.ui.showError(`Failed to generate world: ${message}`);
    }
  }

  /** Connects UI selections to the active player inventory slot. */
  private bindUi() {
    this.ui.onBlockSelect = (blockType: number) => {
      this.player.selectedBlockType = blockType;
    };

    this.ui.onStart = () => {
      this.player.controls.lock();
    };
  }

  /** Attaches browser-level lifecycle events and save/load shortcuts. */
  private bindLifecycle() {
    this.player.controls.addEventListener("lock", () => {
      this.ui.hideStartScreen();
    });

    this.player.controls.addEventListener("unlock", () => {
      this.ui.showStartScreen();
    });

    document.addEventListener("keydown", (event) => {
      if (event.code === "F5") {
        event.preventDefault();
        void this.world.saveWorld().then((path) => {
          console.log(`World saved to ${path}`);
        });
      }

      if (event.code === "F9") {
        event.preventDefault();
        this.ui.showLoading();
        void this.world.loadWorld().then((loaded) => {
          this.ui.hideLoading();
          console.log(loaded ? "World loaded from save." : "No saved world found.");
        });
      }
    });

    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  /** Main animation loop: poll input, stream chunks, update debug text, and render. */
  private startLoop() {
    const animate = () => {
      requestAnimationFrame(animate);

      const dt = Math.min(this.clock.getDelta(), 0.05);
      this.player.update(dt);

      if (this.world.ready) {
        const pos = this.player.getPosition();
        this.world.update(pos.x, pos.z);
      }

      this.frameCount++;
      this.fpsAccum += dt;
      if (this.fpsAccum >= 1.0) {
        this.currentFps = this.frameCount;
        this.frameCount = 0;
        this.fpsAccum = 0;
      }

      const pos = this.player.getPosition();
      this.ui.updateDebug(
        this.currentFps,
        pos.x,
        pos.y,
        pos.z,
        this.world.blocks.length,
      );

      this.renderer.render(this.scene, this.camera);
    };

    animate();
  }
}
