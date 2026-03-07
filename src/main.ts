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
scene.background = new THREE.Color(0x87ceeb); // Sky blue
scene.fog = new THREE.Fog(0x87ceeb, 30, 80); // Fog for distance fading

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.set(0, 20, 0); // Start high to fall onto terrain

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = false;
document.body.appendChild(renderer.domElement);

// ==========================================
// 2. Lighting
// ==========================================
// Ambient light for base illumination (like scattered sky light)
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

// Directional light (sun)
const sunLight = new THREE.DirectionalLight(0xfff4e0, 0.8);
sunLight.position.set(50, 100, 30);
scene.add(sunLight);

// Hemisphere light for sky/ground color blending
const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x556b2f, 0.3);
scene.add(hemiLight);

// ==========================================
// 3. World & Player & UI
// ==========================================
const world = new World(scene);
world.generateWorldFromRust(24); // 48×48 block terrain

const player = new Player(camera, document.body, world);
const ui = new UI();

// Connect UI block selection to player
ui.onBlockSelect = (blockType: number) => {
  player.selectedBlockType = blockType;
};
player.selectedBlockType = BLOCK_GRASS;

// Handle pointer lock events for start screen
player.controls.addEventListener("lock", () => {
  ui.hideStartScreen();
});
player.controls.addEventListener("unlock", () => {
  ui.showStartScreen();
});

// ==========================================
// 4. Game Loop
// ==========================================
const clock = new THREE.Clock();
let frameCount = 0;
let fpsTime = 0;
let currentFps = 0;

function animate() {
  requestAnimationFrame(animate);

  const deltaTime = Math.min(clock.getDelta(), 0.05); // Cap delta to prevent physics explosion

  // Update player (physics, movement)
  player.update(deltaTime);

  // FPS counter
  frameCount++;
  fpsTime += deltaTime;
  if (fpsTime >= 1.0) {
    currentFps = frameCount;
    frameCount = 0;
    fpsTime = 0;
  }

  // Update debug UI
  const pos = player.getPosition();
  ui.updateDebug(currentFps, pos.x, pos.y, pos.z, world.blocks.length);

  // Render
  renderer.render(scene, camera);
}
animate();

// ==========================================
// 5. Window Resize Handler
// ==========================================
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
