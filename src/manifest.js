// manifest.js — Phase 2 bridge for sprite loading
// Loads sprite frames and provides them for entity rendering

let spriteCache = {}; // key -> Image[]
let loadComplete = false;
let totalToLoad = 0;
let loadedCount = 0;

// Base path relative to index.html
const BASE = '.';

/**
 * Sprite paths organized by entity -> state -> facing -> frames
 */
const SPRITE_MANIFEST = {
    // --- PLAYER CHAMPIONS ---
    orc: {
        'idle_right': ['Orc/Idle right/frame_0.png', 'Orc/Idle right/frame_1.png', 'Orc/Idle right/frame_2.png', 'Orc/Idle right/frame_3.png'],
        'idle_left': ['Orc/Idle left/frame_0.png', 'Orc/Idle left/frame_1.png', 'Orc/Idle left/frame_2.png', 'Orc/Idle left/frame_3.png'],
        'walk_right': ['Orc/Walk right/frame_0.png', 'Orc/Walk right/frame_1.png', 'Orc/Walk right/frame_2.png', 'Orc/Walk right/frame_3.png'],
        'walk_left': ['Orc/Walk left/frame_0.png', 'Orc/Walk left/frame_1.png', 'Orc/Walk left/frame_2.png', 'Orc/Walk left/frame_3.png'],
        'attack_right': ['Orc/Attack right/frame_0.png', 'Orc/Attack right/frame_1.png', 'Orc/Attack right/frame_2.png', 'Orc/Attack right/frame_3.png'],
        'attack_left': ['Orc/Attack left/frame_0.png', 'Orc/Attack left/frame_1.png', 'Orc/Attack left/frame_2.png', 'Orc/Attack left/frame_3.png'],
        'death_right': ['Orc/Idle right/frame_0.png'],
        'death_left': ['Orc/Idle left/frame_0.png'],
    },
    // NOTE: paladin sprites ('Paladin 1/' folder) and pyro sprites ('girl/' folder)
    // are not present on disk — those champions use the blocky fallback renderer.
    // Add a manifest entry here once the sprite folders exist.
    elf: {
        'idle_right': ['Demoness/Idle right/1.png', 'Demoness/Idle right/2.png', 'Demoness/Idle right/3.png', 'Demoness/Idle right/4.png'],
        'idle_left': ['Demoness/Idle left/1.png', 'Demoness/Idle left/2.png', 'Demoness/Idle left/3.png', 'Demoness/Idle left/4.png'],
        'walk_right': ['Demoness/Walk right/1.png', 'Demoness/Walk right/2.png', 'Demoness/Walk right/3.png', 'Demoness/Walk right/4.png'],
        'walk_left': ['Demoness/Walk left/1.png', 'Demoness/Walk left/2.png', 'Demoness/Walk left/3.png', 'Demoness/Walk left/4.png'],
        'attack_right': ['Demoness/Attack right/1.png', 'Demoness/Attack right/2.png', 'Demoness/Attack right/3.png', 'Demoness/Attack right/4.png'],
        'attack_left': ['Demoness/Attack left/1.png', 'Demoness/Attack left/2.png', 'Demoness/Attack left/3.png', 'Demoness/Attack left/4.png'],
        'death_right': ['Demoness/Idle right/1.png'],
        'death_left': ['Demoness/Idle left/1.png'],
    },
    // --- ENEMIES ---
    // Slime and Goblin have completed sprites; all other enemies render as blocks
    goblin: {
        'idle_right': ['Goblin/Idle Right/frame_0.png', 'Goblin/Idle Right/frame_1.png', 'Goblin/Idle Right/frame_2.png', 'Goblin/Idle Right/frame_3.png'],
        'idle_left': ['Goblin/Idle Left/frame_0.png', 'Goblin/Idle Left/frame_1.png', 'Goblin/Idle Left/frame_2.png', 'Goblin/Idle Left/frame_3.png'],
        'walk_right': ['Goblin/Walk Right/frame_0.png', 'Goblin/Walk Right/frame_1.png', 'Goblin/Walk Right/frame_2.png', 'Goblin/Walk Right/frame_3.png'],
        'walk_left': ['Goblin/Walk Left/frame_0.png', 'Goblin/Walk Left/frame_1.png', 'Goblin/Walk Left/frame_2.png', 'Goblin/Walk Left/frame_3.png'],
        'attack_right': ['Goblin/Attack Right/frame_0.png', 'Goblin/Attack Right/frame_1.png', 'Goblin/Attack Right/frame_2.png', 'Goblin/Attack Right/frame_3.png'],
        'attack_left': ['Goblin/Attack Left/frame_0.png', 'Goblin/Attack Left/frame_1.png', 'Goblin/Attack Left/frame_2.png', 'Goblin/Attack Left/frame_3.png'],
        'death_right': ['Goblin/Idle Right/frame_0.png'],
        'death_left': ['Goblin/Idle Left/frame_0.png'],
    },
    slime: {
        'idle_right': ['Slime/Idle right/Slime Idle R.png', 'Slime/Idle right/Slime Idle R2.png', 'Slime/Idle right/Slime Idle R3.png', 'Slime/Idle right/Slime Idle R4.png'],
        'idle_left': ['Slime/Idle left/Slime Idle L.png', 'Slime/Idle left/Slime Idle L2.png', 'Slime/Idle left/Slime Idle L3.png', 'Slime/Idle left/Slime Idle L4.png'],
        'walk_right': ['Slime/Walk right/Slime Walk R1.png', 'Slime/Walk right/Slime Walk R2.png', 'Slime/Walk right/Slime Walk R3.png', 'Slime/Walk right/Slime Walk R4.png'],
        'walk_left': ['Slime/Walk left/Slime Walk L1.png', 'Slime/Walk left/Slime Walk L2.png', 'Slime/Walk left/Slime Walk L3.png', 'Slime/Walk left/Slime Walk L4.png'],
        'attack_right': ['Slime/Attack right/Slime Attack R1.png', 'Slime/Attack right/Slime Attack R2.png', 'Slime/Attack right/Slime Attack R3.png', 'Slime/Attack right/Slime Attack R4.png'],
        'attack_left': ['Slime/Attack left/Slime Attack L1.png', 'Slime/Attack left/Slime Attack L2.png', 'Slime/Attack left/Slime Attack L3.png', 'Slime/Attack left/Slime Attack L4.png'],
        'death_right': ['Slime/Death right/Slime Death R1.png', 'Slime/Death right/Slime Death R2.png', 'Slime/Death right/Slime Death R3.png', 'Slime/Death right/Slime Death R4.png'],
        'death_left': ['Slime/Death left/Slime Death L1.png', 'Slime/Death left/Slime Death L2.png', 'Slime/Death left/Slime Death L3.png', 'Slime/Death left/Slime Death L4.png'],
    },
};

/**
 * Map from entity state to animation key suffix
 */
function getAnimKey(entity) {
    const state = entity.state;
    const facing = entity.facing || 'right';

    // Map cast states to attack animation
    if (state.startsWith('cast')) return `attack_${facing}`;
    if (state === 'death' || (!entity.alive && entity.deathTimer > 0)) return `death_${facing}`;
    if (state === 'hurt') return `idle_${facing}`;

    return `${state}_${facing}`;
}

/**
 * Get entity type key for manifest lookup
 */
function getEntityKey(entity) {
    if (entity.type === 'player') return entity.championId;
    return entity.enemyType;
}

/**
 * Load the given frame and return a promise
 */
function loadImage(path) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            loadedCount++;
            resolve(img);
        };
        img.onerror = () => {
            loadedCount++;
            // Load a fallback (empty will be skipped)
            console.warn(`Failed to load sprite: ${path}`);
            resolve(null);
        };
        img.src = path;
    });
}

/**
 * Preload all sprites defined in the manifest
 * Returns a promise that resolves when all images are loaded
 */
export async function preloadSprites() {
    const allPaths = new Set();

    for (const entityKey of Object.keys(SPRITE_MANIFEST)) {
        const states = SPRITE_MANIFEST[entityKey];
        for (const stateKey of Object.keys(states)) {
            const frames = states[stateKey];
            for (const path of frames) {
                allPaths.add(path);
            }
        }
    }

    totalToLoad = allPaths.size;
    loadedCount = 0;

    // Load all unique paths and build path->Image map
    const imageMap = new Map();
    const loadPromises = [];
    for (const path of allPaths) {
        const promise = loadImage(path).then(img => {
            if (img) imageMap.set(path, img);
        });
        loadPromises.push(promise);
    }

    await Promise.all(loadPromises);

    // Build the cache using already-loaded Image objects (no duplicates)
    for (const entityKey of Object.keys(SPRITE_MANIFEST)) {
        if (!spriteCache[entityKey]) spriteCache[entityKey] = {};
        const states = SPRITE_MANIFEST[entityKey];
        for (const stateKey of Object.keys(states)) {
            const frames = states[stateKey];
            spriteCache[entityKey][stateKey] = frames
                .map(path => imageMap.get(path))
                .filter(img => img != null);
        }
    }

    loadComplete = true;
    console.log(`Sprites loaded: ${totalToLoad} images for ${Object.keys(SPRITE_MANIFEST).length} entities`);
}

/**
 * Get the sprite frames for an entity's current state
 */
export function getSpriteFrames(entity) {
    if (!loadComplete) return null;

    const entityKey = getEntityKey(entity);
    const animKey = getAnimKey(entity);

    const cache = spriteCache[entityKey];
    if (!cache) return null;

    const frames = cache[animKey];
    if (!frames || frames.length === 0) return null;

    return frames;
}

/**
 * Get the sprite manifest (for Phase 2 — always returns the full manifest)
 */
export async function getSpriteManifest() {
    return SPRITE_MANIFEST;
}

/**
 * Get sprite config for a specific entity type
 */
export function getEntitySpriteConfig(entityType) {
    return SPRITE_MANIFEST[entityType] || null;
}

/**
 * Check if sprites are available
 */
export function hasSprites() {
    return loadComplete;
}

/**
 * Get load progress (0-1)
 */
export function getLoadProgress() {
    if (totalToLoad === 0) return 0;
    return loadedCount / totalToLoad;
}

/**
 * Check if preloading is done
 */
export function isPreloadDone() {
    return loadComplete;
}