// camera.js — smooth follow camera, edge pan, space-to-center

import { Input } from './input.js';
import { getCanvas } from './engine.js';

const canvas = getCanvas();

/** Zoom factor — higher means sprites/tiles appear larger on screen */
export const ZOOM = 1.5;

export const Camera = {
    x: 0,
    y: 0,
    _targetX: 0,
    _targetY: 0,
    _followTarget: null,
    _mapWidth: 1600,
    _mapHeight: 1600,
    /** For screen shake */
    shakeX: 0,
    shakeY: 0,
    shakeIntensity: 0,
};

/** Set the entity to follow */
export function setFollowTarget(entity) {
    Camera._followTarget = entity;
    if (entity) {
        Camera.x = entity.x - (canvas.width / ZOOM) / 2;
        Camera.y = entity.y - (canvas.height / ZOOM) / 2;
        Camera._targetX = Camera.x;
        Camera._targetY = Camera.y;
        // Immediately clamp to avoid a visible shift at game start
        Camera.x = Math.max(0, Math.min(Camera._mapWidth - canvas.width / ZOOM, Camera.x));
        Camera.y = Math.max(0, Math.min(Camera._mapHeight - canvas.height / ZOOM, Camera.y));
    }
}

/** Set map bounds for clamping */
export function setMapBounds(width, height) {
    Camera._mapWidth = width;
    Camera._mapHeight = height;
}

/** Trigger screen shake */
let _pendingShake = 0;
export function shake(intensity = 8, duration = 0.3) {
    Camera.shakeIntensity = Math.max(Camera.shakeIntensity, intensity);
    _pendingShake = Math.max(_pendingShake, intensity);
}

/** Host: drain the strongest shake fired since the last snapshot (for relay). */
export function getPendingShake() {
    const s = _pendingShake;
    _pendingShake = 0;
    return s;
}

export function updateCamera(dt) {
    if (!Camera._followTarget) return;

    const target = Camera._followTarget;

    // Raw target: center on player
    Camera._targetX = target.x - (canvas.width / ZOOM) / 2;
    Camera._targetY = target.y - (canvas.height / ZOOM) / 2;

    // Edge pan (only when not following tightly — optional, disabled for now)
    // Smooth lerp — fast enough that it snaps in under a second
    const lerpSpeed = 15;
    Camera.x += (Camera._targetX - Camera.x) * Math.min(1, lerpSpeed * dt);
    Camera.y += (Camera._targetY - Camera.y) * Math.min(1, lerpSpeed * dt);

    // Clamp to map bounds so the map edges don't reveal void
    Camera.x = Math.max(0, Math.min(Camera._mapWidth - canvas.width / ZOOM, Camera.x));
    Camera.y = Math.max(0, Math.min(Camera._mapHeight - canvas.height / ZOOM, Camera.y));

    // Screen shake decay
    if (Camera.shakeIntensity > 0) {
        Camera.shakeX = (Math.random() - 0.5) * Camera.shakeIntensity * 2;
        Camera.shakeY = (Math.random() - 0.5) * Camera.shakeIntensity * 2;
        Camera.shakeIntensity *= Math.max(0, 1 - dt * 6); // decay over ~0.3s
        if (Camera.shakeIntensity < 0.5) {
            Camera.shakeIntensity = 0;
            Camera.shakeX = 0;
            Camera.shakeY = 0;
        }
    }

    // Update mouse world position
    Input.setMouseWorld(
        Input.mouseScreen.x / ZOOM + Camera.x + Camera.shakeX,
        Input.mouseScreen.y / ZOOM + Camera.y + Camera.shakeY
    );

    // Space to center on player instantly
    if (Input.wasPressed(' ')) {
        Camera.x = target.x - (canvas.width / ZOOM) / 2;
        Camera.y = target.y - (canvas.height / ZOOM) / 2;
    }
}

/** Apply camera transform to context */
export function applyCameraTransform(ctx) {
    ctx.scale(ZOOM, ZOOM);
    ctx.translate(-Math.round(Camera.x + Camera.shakeX), -Math.round(Camera.y + Camera.shakeY));
}
