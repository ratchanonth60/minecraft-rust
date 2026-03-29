import {
    BLOCK_GRASS,
    BLOCK_DIRT,
    BLOCK_STONE,
    BLOCK_SAND,
    BLOCK_WOOD,
    BLOCK_LEAVES,
    BLOCK_NAMES,
    BLOCK_COLORS,
} from "../world/TextureManager";

const HOTBAR_BLOCKS = [
    BLOCK_GRASS,
    BLOCK_DIRT,
    BLOCK_STONE,
    BLOCK_SAND,
    BLOCK_WOOD,
    BLOCK_LEAVES,
];

export class UI {
    selectedSlot = 0;
    debugVisible = false;

    private hotbarEl: HTMLDivElement;
    private debugEl: HTMLDivElement;
    private startScreen: HTMLDivElement;
    private loadingEl: HTMLDivElement;
    private loadingTextEl: HTMLParagraphElement;
    private slots: HTMLDivElement[] = [];

    onBlockSelect: (blockType: number) => void = () => { };
    onStart: () => void = () => { };

    constructor() {
        // Hotbar
        this.hotbarEl = document.createElement("div");
        this.hotbarEl.id = "hotbar";

        HOTBAR_BLOCKS.forEach((blockType, i) => {
            const slot = document.createElement("div");
            slot.className = "hotbar-slot" + (i === 0 ? " selected" : "");
            slot.title = BLOCK_NAMES[blockType];

            const icon = document.createElement("div");
            icon.className = "block-icon";
            icon.style.backgroundColor = BLOCK_COLORS[blockType];
            slot.appendChild(icon);

            const num = document.createElement("span");
            num.className = "slot-number";
            num.textContent = String(i + 1);
            slot.appendChild(num);

            this.hotbarEl.appendChild(slot);
            this.slots.push(slot);
        });
        document.body.appendChild(this.hotbarEl);

        // Debug overlay
        this.debugEl = document.createElement("div");
        this.debugEl.id = "debug-overlay";
        this.debugEl.style.display = "none";
        document.body.appendChild(this.debugEl);

        // Loading screen
        this.loadingEl = document.createElement("div");
        this.loadingEl.id = "loading-screen";
        this.loadingEl.innerHTML = `
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <p id="loading-text">⛏️ Generating world...</p>
      </div>
    `;
        this.loadingTextEl = this.loadingEl.querySelector("#loading-text") as HTMLParagraphElement;
        this.loadingEl.style.display = "none";
        document.body.appendChild(this.loadingEl);

        // Start screen
        this.startScreen = document.createElement("div");
        this.startScreen.id = "start-screen";
        this.startScreen.innerHTML = `
      <div class="start-content">
        <h1>⛏️ Minecraft Clone</h1>
        <p>Tauri + Three.js + Rust</p>
        <div class="start-instructions">
          <p>🖱️ Click to play</p>
          <p>WASD — Move &nbsp; | &nbsp; Space — Jump</p>
          <p>L-Click — Break &nbsp; | &nbsp; R-Click — Place</p>
          <p>1-6 — Select Block &nbsp; | &nbsp; Ctrl — Sprint</p>
          <p>F3 — Debug Info &nbsp; | &nbsp; F5/F9 — Save/Load</p>
        </div>
      </div>
    `;
        this.startScreen.addEventListener("click", () => {
            this.onStart();
        });
        document.body.appendChild(this.startScreen);

        // Keyboard: slot selection & F3
        document.addEventListener("keydown", (e) => {
            const num = parseInt(e.key);
            if (num >= 1 && num <= HOTBAR_BLOCKS.length) {
                this.selectSlot(num - 1);
            }
            if (e.code === "F3") {
                e.preventDefault();
                this.debugVisible = !this.debugVisible;
                this.debugEl.style.display = this.debugVisible ? "block" : "none";
            }
        });

        // Mouse wheel to cycle slots
        document.addEventListener("wheel", (e) => {
            const dir = e.deltaY > 0 ? 1 : -1;
            let next = this.selectedSlot + dir;
            if (next < 0) next = HOTBAR_BLOCKS.length - 1;
            if (next >= HOTBAR_BLOCKS.length) next = 0;
            this.selectSlot(next);
        });
    }

    selectSlot(index: number) {
        this.slots[this.selectedSlot].classList.remove("selected");
        this.selectedSlot = index;
        this.slots[this.selectedSlot].classList.add("selected");
        this.onBlockSelect(HOTBAR_BLOCKS[index]);
    }

    getSelectedBlockType(): number {
        return HOTBAR_BLOCKS[this.selectedSlot];
    }

    updateDebug(fps: number, x: number, y: number, z: number, blockCount: number) {
        if (!this.debugVisible) return;
        this.debugEl.innerHTML = `
      <div>FPS: ${fps}</div>
      <div>XYZ: ${x.toFixed(1)} / ${y.toFixed(1)} / ${z.toFixed(1)}</div>
      <div>Blocks: ${blockCount}</div>
    `;
    }

    showLoading(message: string = "⛏️ Generating world...") {
        this.loadingTextEl.textContent = message;
        this.loadingEl.style.display = "flex";
        this.startScreen.style.display = "none";
    }

    hideLoading() {
        this.loadingEl.style.display = "none";
    }

    showError(message: string) {
        this.loadingEl.innerHTML = `
      <div class="loading-content">
        <p>${message}</p>
      </div>
    `;
        this.loadingEl.style.display = "flex";
        this.startScreen.style.display = "none";
    }

    hideStartScreen() {
        this.startScreen.style.display = "none";
    }

    showStartScreen() {
        this.startScreen.style.display = "flex";
    }
}
