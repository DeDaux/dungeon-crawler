// textures.js — loads tile/background texture images used by the dungeon renderer

function loadImage(src) {
    const img = new Image();
    img.src = src;
    return img;
}

export const Textures = {
    floor: loadImage('./src/assets/textures/floor_tile.svg'),
    // Note: the void/abyss backdrop is now drawn procedurally in renderer.js
    // (drawVoidBackground) — no background bitmap is loaded.
};
