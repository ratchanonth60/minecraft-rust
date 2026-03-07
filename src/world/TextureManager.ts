import * as THREE from "three";

/**
 * Procedural texture manager — generates 16×16 pixel art textures on canvas
 * No external image files needed!
 */

const TEXTURE_SIZE = 16;

// Block type constants (must match Rust)
export const BLOCK_GRASS = 1;
export const BLOCK_DIRT = 2;
export const BLOCK_STONE = 3;
export const BLOCK_SAND = 4;
export const BLOCK_WOOD = 5;
export const BLOCK_LEAVES = 6;

export const BLOCK_NAMES: Record<number, string> = {
    [BLOCK_GRASS]: "Grass",
    [BLOCK_DIRT]: "Dirt",
    [BLOCK_STONE]: "Stone",
    [BLOCK_SAND]: "Sand",
    [BLOCK_WOOD]: "Wood",
    [BLOCK_LEAVES]: "Leaves",
};

export const BLOCK_COLORS: Record<number, string> = {
    [BLOCK_GRASS]: "#4a8c2a",
    [BLOCK_DIRT]: "#8b6914",
    [BLOCK_STONE]: "#808080",
    [BLOCK_SAND]: "#e8d68c",
    [BLOCK_WOOD]: "#6b4226",
    [BLOCK_LEAVES]: "#2d8a4e",
};

// Simple seeded random for texture generation
function seededRandom(seed: number): () => number {
    let s = seed;
    return () => {
        s = (s * 16807 + 0) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

function createTexture(
    drawFn: (ctx: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = TEXTURE_SIZE;
    canvas.height = TEXTURE_SIZE;
    const ctx = canvas.getContext("2d")!;
    drawFn(ctx);
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    return texture;
}

function drawGrassTop(ctx: CanvasRenderingContext2D) {
    const rand = seededRandom(42);
    ctx.fillStyle = "#4a8c2a";
    ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
    // Random grass variation
    for (let i = 0; i < 40; i++) {
        const x = Math.floor(rand() * TEXTURE_SIZE);
        const y = Math.floor(rand() * TEXTURE_SIZE);
        const shade = Math.floor(rand() * 30) - 15;
        const g = Math.min(255, Math.max(0, 140 + shade));
        ctx.fillStyle = `rgb(74, ${g}, 42)`;
        ctx.fillRect(x, y, 1, 1);
    }
}

function drawGrassSide(ctx: CanvasRenderingContext2D) {
    // Top 3 pixels = grass green
    ctx.fillStyle = "#4a8c2a";
    ctx.fillRect(0, 0, TEXTURE_SIZE, 3);
    // Bottom = dirt
    ctx.fillStyle = "#8b6914";
    ctx.fillRect(0, 3, TEXTURE_SIZE, TEXTURE_SIZE - 3);
    // Irregular grass edge
    const rand = seededRandom(123);
    for (let x = 0; x < TEXTURE_SIZE; x++) {
        const extra = Math.floor(rand() * 3);
        ctx.fillStyle = "#4a8c2a";
        ctx.fillRect(x, 3, 1, extra);
    }
    // Dirt texture noise
    for (let i = 0; i < 20; i++) {
        const x = Math.floor(rand() * TEXTURE_SIZE);
        const y = 4 + Math.floor(rand() * (TEXTURE_SIZE - 4));
        ctx.fillStyle = `rgb(${120 + Math.floor(rand() * 30)}, ${90 + Math.floor(rand() * 25)}, ${15 + Math.floor(rand() * 15)})`;
        ctx.fillRect(x, y, 1, 1);
    }
}

function drawDirt(ctx: CanvasRenderingContext2D) {
    const rand = seededRandom(77);
    ctx.fillStyle = "#8b6914";
    ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
    for (let i = 0; i < 30; i++) {
        const x = Math.floor(rand() * TEXTURE_SIZE);
        const y = Math.floor(rand() * TEXTURE_SIZE);
        const shade = Math.floor(rand() * 30) - 15;
        ctx.fillStyle = `rgb(${139 + shade}, ${105 + shade}, ${20 + Math.floor(rand() * 10)})`;
        ctx.fillRect(x, y, 1, 1);
    }
}

function drawStone(ctx: CanvasRenderingContext2D) {
    const rand = seededRandom(99);
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
    // Add cracks/variation
    for (let i = 0; i < 50; i++) {
        const x = Math.floor(rand() * TEXTURE_SIZE);
        const y = Math.floor(rand() * TEXTURE_SIZE);
        const v = 110 + Math.floor(rand() * 40);
        ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
        ctx.fillRect(x, y, 1, 1);
    }
    // Dark crack lines
    ctx.fillStyle = "#606060";
    for (let i = 0; i < 3; i++) {
        const startX = Math.floor(rand() * TEXTURE_SIZE);
        const startY = Math.floor(rand() * TEXTURE_SIZE);
        for (let j = 0; j < 4; j++) {
            ctx.fillRect(startX + j, startY + Math.floor(rand() * 2), 1, 1);
        }
    }
}

function drawSand(ctx: CanvasRenderingContext2D) {
    const rand = seededRandom(55);
    ctx.fillStyle = "#e8d68c";
    ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
    for (let i = 0; i < 40; i++) {
        const x = Math.floor(rand() * TEXTURE_SIZE);
        const y = Math.floor(rand() * TEXTURE_SIZE);
        const shade = Math.floor(rand() * 20) - 10;
        ctx.fillStyle = `rgb(${232 + shade}, ${214 + shade}, ${140 + shade})`;
        ctx.fillRect(x, y, 1, 1);
    }
}

function drawWood(ctx: CanvasRenderingContext2D) {
    const rand = seededRandom(33);
    ctx.fillStyle = "#6b4226";
    ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
    // Horizontal bark lines
    for (let y = 0; y < TEXTURE_SIZE; y += 3) {
        ctx.fillStyle = `rgb(${90 + Math.floor(rand() * 20)}, ${55 + Math.floor(rand() * 15)}, ${30 + Math.floor(rand() * 10)})`;
        ctx.fillRect(0, y, TEXTURE_SIZE, 1);
    }
    // Random bark texture
    for (let i = 0; i < 15; i++) {
        const x = Math.floor(rand() * TEXTURE_SIZE);
        const y = Math.floor(rand() * TEXTURE_SIZE);
        ctx.fillStyle = "#5a3520";
        ctx.fillRect(x, y, 1, 2);
    }
}

function drawLeaves(ctx: CanvasRenderingContext2D) {
    const rand = seededRandom(66);
    ctx.fillStyle = "#2d8a4e";
    ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
    // Leaf pattern with holes
    for (let i = 0; i < 50; i++) {
        const x = Math.floor(rand() * TEXTURE_SIZE);
        const y = Math.floor(rand() * TEXTURE_SIZE);
        const g = 100 + Math.floor(rand() * 60);
        ctx.fillStyle = `rgb(${30 + Math.floor(rand() * 20)}, ${g}, ${50 + Math.floor(rand() * 30)})`;
        ctx.fillRect(x, y, 1, 1);
    }
    // Transparent holes (darker spots)
    for (let i = 0; i < 10; i++) {
        const x = Math.floor(rand() * TEXTURE_SIZE);
        const y = Math.floor(rand() * TEXTURE_SIZE);
        ctx.fillStyle = "#1a5e30";
        ctx.fillRect(x, y, 2, 2);
    }
}

// Cache for materials
const materialCache: Map<string, THREE.MeshLambertMaterial> = new Map();

function getOrCreateMaterial(
    key: string,
    drawFn: (ctx: CanvasRenderingContext2D) => void,
): THREE.MeshLambertMaterial {
    if (!materialCache.has(key)) {
        const texture = createTexture(drawFn);
        materialCache.set(
            key,
            new THREE.MeshLambertMaterial({ map: texture }),
        );
    }
    return materialCache.get(key)!;
}

/**
 * Get material(s) for a block type.
 * Grass blocks have different top/side/bottom textures.
 * Other blocks use same texture on all sides.
 */
export function getBlockMaterials(
    blockType: number,
): THREE.MeshLambertMaterial | THREE.MeshLambertMaterial[] {
    switch (blockType) {
        case BLOCK_GRASS:
            // [right, left, top, bottom, front, back]
            return [
                getOrCreateMaterial("grass_side", drawGrassSide),
                getOrCreateMaterial("grass_side", drawGrassSide),
                getOrCreateMaterial("grass_top", drawGrassTop),
                getOrCreateMaterial("dirt", drawDirt),
                getOrCreateMaterial("grass_side", drawGrassSide),
                getOrCreateMaterial("grass_side", drawGrassSide),
            ];
        case BLOCK_DIRT:
            return getOrCreateMaterial("dirt", drawDirt);
        case BLOCK_STONE:
            return getOrCreateMaterial("stone", drawStone);
        case BLOCK_SAND:
            return getOrCreateMaterial("sand", drawSand);
        case BLOCK_WOOD:
            return getOrCreateMaterial("wood", drawWood);
        case BLOCK_LEAVES: {
            const mat = getOrCreateMaterial("leaves", drawLeaves);
            mat.transparent = true;
            mat.opacity = 0.9;
            return mat;
        }
        default:
            return getOrCreateMaterial("dirt", drawDirt);
    }
}
