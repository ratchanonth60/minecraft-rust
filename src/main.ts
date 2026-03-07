import * as THREE from "three";
import { Player } from "./player/Player";
import { World } from "./world/World";
import { UI } from "./ui/UI";
import { BLOCK_GRASS } from "./world/TextureManager";
import "./styles.css";

// ==========================================
// 1. Scene Setup
// ==========================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.FogExp2(0x87ceeb, 0.02);

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  500,
);
camera.position.set(0, 30, 0);

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// ==========================================
// 2. Lighting
// ==========================================
const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff4e0, 0.75);
sunLight.position.set(50, 80, 30);
scene.add(sunLight);

const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x556b2f, 0.25);
scene.add(hemiLight);

// ==========================================
// 3. World, Player, UI
// ==========================================
const world = new World(scene);
const player = new Player(camera, document.body, world);
const ui = new UI();

// Connect UI → Player
ui.onBlockSelect = (blockType: number) => {
  player.selectedBlockType = blockType;
};
player.selectedBlockType = BLOCK_GRASS;

// Pointer lock → Start/Pause
player.controls.addEventListener("lock", () => {
  ui.hideStartScreen();
});
player.controls.addEventListener("unlock", () => {
  ui.showStartScreen();
});

// Initial world generation — loads all chunks around spawn
ui.showLoading();
world.init(0, 0).then(() => {
  ui.hideLoading();
  ui.showStartScreen();
  console.log(`World ready! ${world.blocks.length} blocks rendered.`);
});

// ==========================================
// 4. Game Loop
// ==========================================
const clock = new THREE.Clock();
let frameCount = 0;
let fpsAccum = 0;
let currentFps = 0;

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);

  player.update(dt);

  // Dynamic chunk loading/unloading based on player position
  if (world.ready) {
    const pos = player.getPosition();
    world.update(pos.x, pos.z);
  }

  // FPS
  frameCount++;
  fpsAccum += dt;
  if (fpsAccum >= 1.0) {
    currentFps = frameCount;
    frameCount = 0;
    fpsAccum = 0;
  }

  // Debug
  const pos = player.getPosition();
  ui.updateDebug(currentFps, pos.x, pos.y, pos.z, world.blocks.length);

  renderer.render(scene, camera);
}
animate();

// ==========================================
// 5. Window Resize
// ==========================================
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
