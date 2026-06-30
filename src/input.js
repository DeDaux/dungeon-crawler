// input.js — League of Legends-style controls

import { getCanvas } from './engine.js';

const canvas = getCanvas();

// Raw key state
const keys = {};
const justPressed = {};
let _justPressedQueue = [];

// Mouse state
const mouse = { x: 0, y: 0, worldX: 0, worldY: 0 };
let _rightClicked = false;
let _leftClicked = false;
let _attackMove = false;  // true when A is held + left-click fired
let _attackMoveTarget = null; // { x, y } world coords of A-click
let _aKeyDown = false;
let _spellKey = null;

// Currently hovered entity
let _hoveredEntity = null;
let _clickedEntity = null;
let _clickedEntityFrame = 0;

export const Input = {
    /** Check if a key is held down */
    isDown(key) { return keys[key] === true; },

    /** Check if a key was just pressed this frame */
    wasPressed(key) { return justPressed[key] === true; },

    /** Get mouse position in screen coords */
    get mouseScreen() { return { x: mouse.x, y: mouse.y }; },

    /** Get mouse position in world coords (set each frame by camera) */
    get mouseWorld() { return { x: mouse.worldX, y: mouse.worldY }; },

    /** Set mouse world position — called by camera each frame */
    setMouseWorld(worldX, worldY) {
        mouse.worldX = worldX;
        mouse.worldY = worldY;
    },

    /** Was right-click fired this frame? */
    get rightClicked() { return _rightClicked; },

    /** Right-click target world coords */
    get rightClickTarget() { return { x: mouse.worldX, y: mouse.worldY }; },

    /** Was left-click fired this frame? */
    get leftClicked() { return _leftClicked; },

    /** Was this frame an attack-move (A + left-click)? */
    get isAttackMove() { return _attackMove; },

    /** Attack-move target world coords */
    get attackMoveTarget() { return _attackMoveTarget; },

    /** Which spell key was pressed this frame? Returns null or 'q'|'w'|'e'|'r' */
    get spellKey() { return _spellKey; },

    /** Which spell key was pressed with Ctrl this frame (to level up the spell) */
    /** The entity under the cursor (if any) */
    get hoveredEntity() { return _hoveredEntity; },

    /** The entity that was left-clicked this frame */
    get clickedEntity() { return _clickedEntity; },

    /** Check if a specific key code was pressed this frame */
    isKeyPressedThisFrame(keyCode) {
        return justPressed[keyCode.toLowerCase()] === true;
    },

    /** Mouse screen X */
    get mouseScreenX() { return mouse.x; },

    /** Mouse screen Y */
    get mouseScreenY() { return mouse.y; },

    /** Reset per-frame flags — call at end of update */
    resetFrame() {
        _rightClicked = false;
        _leftClicked = false;
        _attackMove = false;
        _attackMoveTarget = null;
        _spellKey = null;
        _clickedEntity = null;
        _hoveredEntity = null;

        // Drain justPressed for held keys
        for (const k of _justPressedQueue) {
            justPressed[k] = undefined;
        }
        _justPressedQueue = [];
    }
};

// Keyboard

document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (['q', 'w', 'e', 'r', 'a', ' '].includes(key)) {
        e.preventDefault();
    }
    if (!keys[key]) {
        keys[key] = true;
        justPressed[key] = true;
        _justPressedQueue.push(key);
    }

    if (key === 'a') {
        _aKeyDown = true;
    }
});

document.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    keys[key] = false;
    if (key === 'a') {
        _aKeyDown = false;
    }
});

// --- Mouse ---

canvas.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});

canvas.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (e.button === 2) {
        // Right-click → move
        _rightClicked = true;
    } else if (e.button === 0) {
        // Left-click
        _leftClicked = true;

        // If A key is held, this is an attack-move
        if (_aKeyDown) {
            _attackMove = true;
            _attackMoveTarget = { x: mouse.worldX, y: mouse.worldY };
        }
    }
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// --- Spell key detection (done via keydown, resolved at frame start) ---

export function pollSpellKeys() {
    _spellKey = null;
    for (const k of ['q', 'w', 'e', 'r']) {
        if (justPressed[k]) {
            _spellKey = k;
            break;
        }
    }
}

// --- Entity hit-testing (called by renderer each frame) ---

export function setHoveredEntity(entity) {
    _hoveredEntity = entity;
}

export function setClickedEntity(entity) {
    _clickedEntity = entity;
}
