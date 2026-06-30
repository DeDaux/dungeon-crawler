// movement.js — movement, wall collision, wall-slide, entity push, anti-stuck
import { DungeonMap } from './map.js';

const TILE_SIZE = DungeonMap.TILE_SIZE;

export function updateMovement(entities, map, dt) {
    for (const entity of entities) {
        if (!entity.alive) continue;
        if (entity.state === 'death') continue;
        // ENEMIES in attack state can still move (chase). Only player is locked during attack.
        if (entity.type === 'player' && (entity.state === 'attack' || entity.state.startsWith('cast'))) continue;
        if (entity.type !== 'player' && entity.state.startsWith('cast')) continue;

        // Knockback
        if (entity.knockback.vx !== 0 || entity.knockback.vy !== 0) {
            const kx = entity.knockback.vx * dt;
            const ky = entity.knockback.vy * dt;
            if (tryMove(entity, kx, ky, map, entities)) {
                entity.knockback.vx *= 0.85;
                entity.knockback.vy *= 0.85;
                if (Math.abs(entity.knockback.vx) < 1) entity.knockback.vx = 0;
                if (Math.abs(entity.knockback.vy) < 1) entity.knockback.vy = 0;
            } else {
                entity.knockback.vx = 0;
                entity.knockback.vy = 0;
            }
        }

        // Move toward target
        if (entity.targetX !== null && entity.targetY !== null) {
            const dx = entity.targetX - entity.x;
            const dy = entity.targetY - entity.y;
            const dist = Math.hypot(dx, dy);

            if (dist > entity.size * 0.3) {
                // Enemies can walk while having attackTarget (they're chasing)
                if (entity.type !== 'player' || (!entity.attackTarget && !entity.state.startsWith('cast'))) {
                    entity.state = 'walk';
                }
                entity.facing = dx > 0 ? 'right' : 'left';

                const moveSpeed = entity.speed * dt;
                const step = Math.min(moveSpeed, dist);
                let mx = (dx / dist) * step;
                let my = (dy / dist) * step;

                // Attempt primary movement with wall-sliding
                const moved = tryMoveWithSlide(entity, mx, my, map, entities);

                // Anti-stuck: track position over time
                if (!entity._stuckTimer) {
                    entity._stuckX = entity.x;
                    entity._stuckY = entity.y;
                    entity._stuckTimer = 0;
                }
                entity._stuckTimer += dt;
                if (entity._stuckTimer > 1.0) {
                    const stuckDist = Math.hypot(entity.x - entity._stuckX, entity.y - entity._stuckY);
                    if (stuckDist < entity.size * 0.5) {
                        // Stuck! Try orthogonal movement to break free
                        const tryDirs = [
                            { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
                            { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
                            { dx: 1, dy: 1 }, { dx: -1, dy: 1 },
                            { dx: 1, dy: -1 }, { dx: -1, dy: -1 },
                        ];
                        for (const d of tryDirs) {
                            const attemptX = entity.x + d.dx * moveSpeed * 2;
                            const attemptY = entity.y + d.dy * moveSpeed * 2;
                            // Try a bigger jump to get unstuck
                            if (isPositionFree(entity, attemptX, attemptY, map, entities)) {
                                entity.x = attemptX;
                                entity.y = attemptY;
                                break;
                            }
                            // Try smaller
                            const sx = entity.x + d.dx * moveSpeed;
                            const sy = entity.y + d.dy * moveSpeed;
                            if (isPositionFree(entity, sx, sy, map, entities)) {
                                entity.x = sx;
                                entity.y = sy;
                                break;
                            }
                        }
                    }
                    entity._stuckTimer = 0;
                    entity._stuckX = entity.x;
                    entity._stuckY = entity.y;
                }
            } else {
                entity.targetX = null;
                entity.targetY = null;
                if (entity.state === 'walk' && !entity.attackTarget) {
                    entity.state = 'idle';
                }
            }
        }

        // Animation frame tick (handled by tickEntityFrame in main loop, skip duplicate)
    }

    const player = entities.find(e => e.type === 'player');
    if (player && player.attackTarget && !player.attackTarget.alive) {
        player.attackTarget = null;
    }
    if (player && !player.attackTarget && player.targetX === null && player.state !== 'attack') {
        if (player.state !== 'castQ' && player.state !== 'castW' &&
            player.state !== 'castE' && player.state !== 'castR') {
            player.state = 'idle';
        }
    }
}

/**
 * Try to move with wall-sliding: if blocked in one axis, try the other.
 * Returns true if ANY movement occurred.
 */
function tryMoveWithSlide(entity, mx, my, map, entities) {
    const startX = entity.x;
    const startY = entity.y;

    // Try full diagonal
    if (isPositionFree(entity, entity.x + mx, entity.y + my, map, entities)) {
        entity.x += mx;
        entity.y += my;
    } else {
        // Try X-only with extra slide
        if (isPositionFree(entity, entity.x + mx, entity.y, map, entities)) {
            entity.x += mx;
            // Slide along Y while moving X
            const slideAmount = my * 0.5;
            if (slideAmount !== 0 && isPositionFree(entity, entity.x, entity.y + slideAmount, map, entities)) {
                entity.y += slideAmount;
            }
        } else if (isPositionFree(entity, entity.x, entity.y + my, map, entities)) {
            // X blocked, try Y-only
            entity.y += my;
            // Slide along X while moving Y
            const slideAmount = mx * 0.5;
            if (slideAmount !== 0 && isPositionFree(entity, entity.x + slideAmount, entity.y, map, entities)) {
                entity.x += slideAmount;
            }
        } else {
            // Both blocked - try perpendicular slide along both axes independently
            const perpSlides = [
                { sx: mx, sy: 0 },
                { sx: 0, sy: my },
                { sx: mx, sy: my * 0.3 },
                { sx: mx * 0.3, sy: my },
                { sx: mx * 0.7, sy: my * 0.7 },
            ];
            for (const slide of perpSlides) {
                if (isPositionFree(entity, entity.x + slide.sx, entity.y + slide.sy, map, entities)) {
                    entity.x += slide.sx;
                    entity.y += slide.sy;
                    break;
                }
            }
        }
    }

    // Safety: push out of walls if we ended up inside one (shouldn't happen but safety net)
    if (!isPositionFree(entity, entity.x, entity.y, map, entities)) {
        pushOutOfWall(entity, map, entities);
    }

    // Entity-to-entity separation (skip distant entities early)
    for (const other of entities) {
        if (other === entity || !other.alive) continue;
        const edx = entity.x - other.x;
        const edy = entity.y - other.y;
        // Quick bounding box check before expensive hypot
        const maxSize = (entity.size + other.size) * 0.45;
        if (Math.abs(edx) > maxSize || Math.abs(edy) > maxSize) continue;
        const edist = Math.hypot(edx, edy);
        const minDist = maxSize;
        if (edist < minDist && edist > 0.01) {
            const overlap = (minDist - edist) * 0.5;
            const pushX = (edx / edist) * overlap;
            const pushY = (edy / edist) * overlap;
            const nx = entity.x + pushX;
            const ny = entity.y + pushY;
            if (isPositionFree(entity, nx, ny, map, entities)) {
                entity.x = nx;
                entity.y = ny;
            }
        }
    }

    return entity.x !== startX || entity.y !== startY;
}

/**
 * Original tryMove (used for knockback)
 */
function tryMove(entity, dx, dy, map, entities) {
    return tryMoveWithSlide(entity, dx, dy, map, entities);
}

function pushOutOfWall(entity, map, entities) {
    // Try half-tile pushes in all 8 directions, sorted by distance from center
    const attempts = [];
    for (let sx = -1; sx <= 1; sx++) {
        for (let sy = -1; sy <= 1; sy++) {
            if (sx === 0 && sy === 0) continue;
            const dist = Math.abs(sx) + Math.abs(sy);
            attempts.push({ dx: sx * 16, dy: sy * 16, dist });
        }
    }
    attempts.sort((a, b) => a.dist - b.dist);

    for (const a of attempts) {
        const nx = entity.x + a.dx;
        const ny = entity.y + a.dy;
        if (isPositionFree(entity, nx, ny, map, entities)) {
            entity.x = nx;
            entity.y = ny;
            return;
        }
    }

    // Fallback: full tile pushes
    const dirs = [
        { dx: 0, dy: -32 }, { dx: 0, dy: 32 },
        { dx: -32, dy: 0 }, { dx: 32, dy: 0 },
    ];
    for (const d of dirs) {
        const nx = entity.x + d.dx;
        const ny = entity.y + d.dy;
        if (isPositionFree(entity, nx, ny, map, entities)) {
            entity.x = nx;
            entity.y = ny;
            return;
        }
    }
}

export function isPositionFree(entity, px, py, map, entities) {
    const halfSize = entity.size * 0.45; // Slightly tighter than visual for corridor navigation
    const bodyTop = py - entity.size;

    const corners = [
        { x: px - halfSize, y: bodyTop },
        { x: px + halfSize, y: bodyTop },
        { x: px - halfSize, y: py - halfSize * 0.3 },
        { x: px + halfSize, y: py - halfSize * 0.3 },
    ];

    for (const c of corners) {
        if (!map.isWorldWalkable(c.x, c.y)) return false;
    }

    // Center check
    if (!map.isWorldWalkable(px, py - halfSize)) return false;

    return true;
}

export function setMoveTarget(entity, wx, wy) {
    entity.targetX = wx;
    entity.targetY = wy;
    // Only clear attackTarget for player (player click-to-move), not enemies
    if (entity.type === 'player') {
        entity.attackTarget = null;
    }
    entity.state = 'walk';
    // Reset stuck tracking on new target
    entity._stuckTimer = 0;
    entity._stuckX = entity.x;
    entity._stuckY = entity.y;
}

export function attackMove(player, wx, wy, entities) {
    player.targetX = wx;
    player.targetY = wy;
    player.state = 'walk';
    if (!player.attackTarget) {
        const nearest = findNearestEnemy(player, entities);
        if (nearest) player.attackTarget = nearest;
    }
}

export function findNearestEnemy(entity, entities) {
    let best = null;
    let bestDist = Infinity;
    for (const other of entities) {
        if (other === entity || !other.alive || other.type === 'player') continue;
        const d = Math.hypot(other.x - entity.x, other.y - entity.y);
        if (d < bestDist) { bestDist = d; best = other; }
    }
    return best;
}