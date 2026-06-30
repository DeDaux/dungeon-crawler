// ai.js — advanced enemy AI with steering behaviors, group coordination, and boss phases
// Multi-player support: accepts players[] array, targets nearest player
// Enemies now use Q/W/E/R abilities against the player (dash, cone, projectile, aoe, summon, etc.)
import { findNearestEnemy, setMoveTarget } from './movement.js';
import { dealDamage, applyBurn, addEnemyProjectile } from './combat.js';
import { getEnemySpellConfig } from '../config/enemySpells.js';
import { isPositionFree } from './movement.js';
import { spawnParticles } from '../render/drawEffects.js';
import { spawnEnemy } from '../entities/factory.js';
import { shake } from '../camera.js';

const AI_TICK_INTERVAL = 0.15; // Faster tick for responsive AI (was 0.3s)
const TWO_PI = Math.PI * 2;

// ─── Steering Helpers ────────────────────────────────────────────

/** Normalize an angle to [-PI, PI] */
function normalizeAngle(a) {
    while (a > Math.PI) a -= TWO_PI;
    while (a < -Math.PI) a += TWO_PI;
    return a;
}

/** Get angle from entity to point */
function angleTo(from, toX, toY) {
    return Math.atan2(toY - from.y, toX - from.x);
}

/**
 * Whether an entity can see the player — gates fresh aggro acquisition so
 * units can't sense/chase through walls. Has no effect on an entity already
 * mid-chase (callers OR this with `aiState === 'chase'`), since losing sight
 * for a moment mid-fight shouldn't break an already-engaged pursuit.
 */
function canSeePlayer(entity, player, map) {
    if (!map) return true;
    // Horror champions are relentless hunters — they sense the player through
    // walls (within their aggroRange), so there is nowhere to hide.
    if (entity._hunter) return true;
    return map.hasLineOfSight(entity.x, entity.y, player.x, player.y);
}

/** Squared distance (avoids sqrt) */
function distSq(ax, ay, bx, by) {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
}

/** Get nearby allies within a radius */
function getNearbyAllies(entity, entities, radius) {
    const rSq = radius * radius;
    const allies = [];
    for (const e of entities) {
        if (e === entity || !e.alive || e.type === 'player') continue;
        if (distSq(entity.x, entity.y, e.x, e.y) < rSq) allies.push(e);
    }
    return allies;
}

/** Separation steering: push away from nearby allies */
function separationForce(entity, allies, minDist) {
    let fx = 0, fy = 0;
    const minDistSq = minDist * minDist;
    for (const a of allies) {
        const dx = entity.x - a.x;
        const dy = entity.y - a.y;
        const dSq = dx * dx + dy * dy;
        if (dSq < minDistSq && dSq > 0.01) {
            const d = Math.sqrt(dSq);
            const strength = (minDist - d) / minDist;
            fx += (dx / d) * strength;
            fy += (dy / d) * strength;
        }
    }
    return { x: fx, y: fy };
}

/** Calculate a flanking offset angle based on entity ID for consistent spread */
function getFlankAngle(entity, totalNearby) {
    // Use entity ID to get a consistent slot, spread evenly around player
    const slot = entity.id % Math.max(totalNearby, 3);
    return (TWO_PI / Math.max(totalNearby, 3)) * slot;
}

/**
 * Find the nearest alive player from an array of players.
 * Returns the nearest player (or null if none alive).
 */
function findNearestPlayer(entity, players) {
    let best = null;
    let bestDist = Infinity;
    for (const p of players) {
        if (!p.alive || p.disconnected) continue;
        const d = Math.hypot(entity.x - p.x, entity.y - p.y);
        if (d < bestDist) { bestDist = d; best = p; }
    }
    return best;
}

/**
 * Find the nearest alive player to a position.
 */
function findNearestPlayerToPos(x, y, players) {
    let best = null;
    let bestDist = Infinity;
    for (const p of players) {
        if (!p.alive || p.disconnected) continue;
        const d = Math.hypot(x - p.x, y - p.y);
        if (d < bestDist) { bestDist = d; best = p; }
    }
    return best;
}

// ─── Main AI Update ──────────────────────────────────────────────

/**
 * Update AI for all non-player entities.
 * @param {Array} entities - all entities
 * @param {Array} players - array of player entities (for multi-target)
 * @param {number} dt - delta time
 */
export function updateAI(entities, players, dt, map) {
    // Backward compat: if players is a single entity, wrap it
    const playerArray = players && players.length !== undefined ? players : (players ? [players] : []);
    if (playerArray.length === 0) return;

    // Check if any player is alive
    const anyAlive = playerArray.some(p => p.alive);
    if (!anyAlive) return;

    for (const entity of entities) {
        if (!entity.alive || entity.type === 'player') continue;
        if (entity.state === 'death') continue;

        // Permanent aggro lock: once a player damages this entity (set in
        // combat.js dealDamage), always target that specific player —
        // release the lock only when they die or disconnect.
        if (entity._aggroLockedTarget && (!entity._aggroLockedTarget.alive || entity._aggroLockedTarget.disconnected)) {
            entity._aggroLockedTarget = null;
        }
        const lockedTarget = entity._aggroLockedTarget;

        // Find nearest player for this entity (or stick to the locked one)
        const player = lockedTarget || findNearestPlayer(entity, playerArray);
        if (!player) continue;

        // Stun recovery (ticks every frame, not AI-gated)
        if (entity.aiStunTimer > 0) {
            entity.aiStunTimer -= dt;
            entity.targetX = null;
            entity.targetY = null;
            entity.state = 'idle';
            if (entity.aiStunTimer <= 0) {
                entity.aiStunTimer = 0;
                entity.aiState = 'idle';
            }
            continue;
        }

        // Handle stunned state (transition to stun timer)
        if (entity.aiState === 'stunned') {
            // If no timer was set (old stun method), set a default
            if (entity.aiStunTimer <= 0) {
                entity.aiStunTimer = 0.75; // default stun duration
            }
            continue;
        }

        // Dodge cooldown
        if (entity.aiDodgeCooldown > 0) entity.aiDodgeCooldown -= dt;

        // AI tick rate
        entity.aiTimer -= dt;
        if (entity.aiTimer > 0) continue;
        entity.aiTimer = AI_TICK_INTERVAL + (Math.random() * 0.05); // slight jitter to desync

        // Invisible player (Vanish / Cloak of Shadows): enemies lose track of them
        if (player.invisible) {
            if (entity.attackTarget === player) {
                entity.attackTarget = null;
                entity.targetX = null;
                entity.targetY = null;
                entity.state = 'idle';
                entity.aiState = 'idle';
            }
            continue;
        }

        // Cache common values
        const dx = player.x - entity.x;
        const dy = player.y - entity.y;
        const distToPlayer = Math.hypot(dx, dy);
        const distToHome = Math.hypot(entity.x - entity.aiHomeX, entity.y - entity.aiHomeY);

        // Store player position in memory
        entity.aiLastPlayerX = player.x;
        entity.aiLastPlayerY = player.y;

        // While locked on, widen aggro/leash to infinite for this tick so the
        // existing per-behavior distance checks below ("aggroRange" to
        // engage, "leashRange" to disengage) all resolve to "stay engaged" —
        // the entity is in active combat and must never leash back home.
        let savedAggro, savedLeash;
        if (lockedTarget) {
            entity.attackTarget = player;
            savedAggro = entity.aggroRange;
            savedLeash = entity.leashRange;
            entity.aggroRange = Infinity;
            entity.leashRange = Infinity;
        }

        switch (entity.aiBehavior) {
            case 'flier': updateFlierAI(entity, player, distToPlayer, distToHome, entities, players, dt, map); break;
            case 'slow_chase': updateSlowChaseAI(entity, player, distToPlayer, distToHome, entities, players, dt, map); break;
            case 'ranged': updateRangedAI(entity, player, distToPlayer, distToHome, entities, players, dt, map); break;
            case 'ranged_magic': updateRangedMagicAI(entity, player, distToPlayer, distToHome, entities, players, dt, map); break;
            case 'fast_chase': updateFastChaseAI(entity, player, distToPlayer, distToHome, entities, players, dt, map); break;
            case 'boss': updateBossAI(entity, player, distToPlayer, distToHome, entities, players, dt); break;
            case 'melee': default: updateMeleeAI(entity, player, distToPlayer, distToHome, entities, players, dt, map); break;
        }

        if (lockedTarget) {
            entity.aggroRange = savedAggro;
            entity.leashRange = savedLeash;
        }

        // ── Ability Usage ─────────────────────────────────────────────
        // Try to use enemy abilities after AI behavior update
        // Priority: R (ultimate) > Q > W > E (usually highest cooldown first)
        if (entity.abilities && Object.keys(entity.abilities).length > 0 && entity.attackTarget === player) {
            // Determine ability priority for this enemy type
            const abilityKeys = ['r', 'q', 'w', 'e'];
            for (const key of abilityKeys) {
                if (tryUseEnemyAbility(entity, key, player, entities, dt, map)) {
                    break; // Only one ability per AI tick
                }
            }
        }
    }
}

// ─── Melee AI ─────────────────────────────────────────────────────
// Surround tactics: spread around the player instead of stacking.
// When chasing, pick a flanking offset angle based on entity slot.

function updateMeleeAI(entity, player, distToPlayer, distToHome, entities, players, dt, map) {
    // If locked on and player alive, maintain chase with flanking
    if (entity.attackTarget === player && entity.attackTarget.alive) {
        if (distToPlayer > entity.leashRange) {
            entity.attackTarget = null;
            entity.aiState = 'returning';
            return;
        }

        entity.aiState = 'chase';
        entity.facing = player.x > entity.x ? 'right' : 'left';

        // Flanking: get nearby melee allies and pick a spread-out position
        const allies = getNearbyAllies(entity, entities, 120);
        const meleeAllies = allies.filter(a => a.aiBehavior === 'melee' || a.aiBehavior === undefined);
        const totalNearby = meleeAllies.length + 1;

        if (distToPlayer > entity.attackRange * 1.2) {
            // Approach with flanking offset
            const baseAngle = angleTo(player, entity.x, entity.y); // angle from player to us
            const flankAngle = getFlankAngle(entity, totalNearby);
            const targetAngle = baseAngle + normalizeAngle(flankAngle - baseAngle) * 0.3;

            const approachDist = entity.attackRange * 0.8;
            entity.targetX = player.x + Math.cos(targetAngle) * approachDist;
            entity.targetY = player.y + Math.sin(targetAngle) * approachDist;
            entity.state = 'walk';

            // Separation from allies to avoid clumping
            const sep = separationForce(entity, meleeAllies, entity.size * 1.5);
            entity.targetX += sep.x * 20;
            entity.targetY += sep.y * 20;
        } else {
            // In attack range — circle strafe slightly
            entity.targetX = player.x;
            entity.targetY = player.y;
            entity.attackTarget = player;
            entity.state = 'walk';
        }
        return;
    }

    // Returning home
    if (entity.aiState === 'returning') {
        if (distToHome < entity.size * 2) {
            entity.aiState = 'idle';
            entity.targetX = entity.aiHomeX;
            entity.targetY = entity.aiHomeY;
            entity.state = 'idle';
        } else {
            entity.targetX = entity.aiHomeX;
            entity.targetY = entity.aiHomeY;
            entity.state = 'walk';
        }
        // Re-aggro if player comes close while returning (must be in sight)
        if (distToPlayer < entity.aggroRange * 0.7 && canSeePlayer(entity, player, map)) {
            entity.aiState = 'chase';
            entity.attackTarget = player;
        }
        return;
    }

    // Idle — acquire target if in aggro range and visible (no aggro through walls)
    if (distToPlayer < entity.aggroRange && canSeePlayer(entity, player, map)) {
        entity.aiState = 'chase';
        entity.attackTarget = player;
        entity.facing = player.x > entity.x ? 'right' : 'left';
        entity.targetX = player.x;
        entity.targetY = player.y;
        entity.state = 'walk';
    } else if (Math.random() < 0.12 && entity.aiState === 'idle') {
        // Wander around home
        const angle = Math.random() * TWO_PI;
        const d = 40 + Math.random() * 80;
        entity.targetX = entity.aiHomeX + Math.cos(angle) * d;
        entity.targetY = entity.aiHomeY + Math.sin(angle) * d;
        entity.state = 'walk';
    }
}

// ─── Flier AI ─────────────────────────────────────────────────────
// Erratic swooping attacks: circle around player, dive in, strike, pull out.

function updateFlierAI(entity, player, distToPlayer, distToHome, entities, players, dt, map) {
    // Flee at very low HP
    if (entity.hp < entity.maxHp * 0.2) {
        entity.aiState = 'flee';
        const fleeAngle = angleTo(player, entity.x, entity.y) + (Math.random() - 0.5) * 0.8;
        entity.targetX = entity.x + Math.cos(fleeAngle) * 200;
        entity.targetY = entity.y + Math.sin(fleeAngle) * 200;
        entity.attackTarget = null;
        entity.state = 'walk';
        return;
    }

    if (entity.aiState === 'flee') {
        if (distToPlayer > entity.leashRange) {
            entity.aiState = 'returning';
        }
        return;
    }

    if (entity.aiState === 'returning') {
        if (distToHome < entity.size) { entity.aiState = 'idle'; entity.state = 'idle'; }
        else { setMoveTarget(entity, entity.aiHomeX, entity.aiHomeY); }
        if (distToPlayer < entity.aggroRange && canSeePlayer(entity, player, map)) { entity.aiState = 'chase'; }
        return;
    }

    if (distToPlayer < entity.aggroRange && (entity.aiState === 'chase' || canSeePlayer(entity, player, map))) {
        entity.aiState = 'chase';
        entity.attackTarget = player;
        entity.facing = player.x > entity.x ? 'right' : 'left';

        // Swooping behavior: orbit at medium range, then dive in
        if (distToPlayer > entity.attackRange * 2.5) {
            // Circling approach with jitter
            entity.aiStrafeAngle += entity.aiStrafeDir * 0.4;
            const orbitDist = entity.attackRange * 1.8;
            const orbitAngle = angleTo(player, entity.x, entity.y) + entity.aiStrafeDir * 0.3;
            entity.targetX = player.x + Math.cos(orbitAngle) * orbitDist;
            entity.targetY = player.y + Math.sin(orbitAngle) * orbitDist;
            entity.state = 'walk';
        } else if (distToPlayer > entity.attackRange) {
            // Dive attack — rush straight at player
            entity.targetX = player.x + (Math.random() - 0.5) * 20;
            entity.targetY = player.y + (Math.random() - 0.5) * 20;
            entity.state = 'walk';
        } else {
            // In range — attack then pull out
            entity.attackTarget = player;
            // After attacking, set a pull-out target
            const pullAngle = angleTo(player, entity.x, entity.y) + (Math.random() - 0.5) * 1.2;
            entity.targetX = entity.x + Math.cos(pullAngle) * 80;
            entity.targetY = entity.y + Math.sin(pullAngle) * 80;
        }
    }

    if (distToPlayer > entity.leashRange) {
        entity.aiState = 'returning';
        entity.attackTarget = null;
    }
}

// ─── Slow Chase AI (Slime) ────────────────────────────────────────
// Relentless pursuit with path prediction — tries to cut off the player.

function updateSlowChaseAI(entity, player, distToPlayer, distToHome, entities, players, dt, map) {
    if (entity.aiState === 'returning') {
        if (distToHome < entity.size * 2) { entity.aiState = 'idle'; entity.state = 'idle'; }
        else { entity.targetX = entity.aiHomeX; entity.targetY = entity.aiHomeY; entity.state = 'walk'; }
        if (distToPlayer < entity.aggroRange && canSeePlayer(entity, player, map)) { entity.aiState = 'chase'; entity.attackTarget = player; }
        return;
    }

    if (distToPlayer < entity.aggroRange && (entity.aiState === 'chase' || canSeePlayer(entity, player, map))) {
        entity.aiState = 'chase';
        entity.attackTarget = player;
        entity.facing = player.x > entity.x ? 'right' : 'left';

        // Predict player movement: aim ahead of player based on their velocity
        // Estimate player heading from last known pos
        const prevDx = player.x - (entity.aiLastPlayerX || player.x);
        const prevDy = player.y - (entity.aiLastPlayerY || player.y);
        // Lead the player by projecting their movement
        const leadTime = distToPlayer / Math.max(entity.speed, 30);
        const predictX = player.x + prevDx * leadTime * 2;
        const predictY = player.y + prevDy * leadTime * 2;

        entity.targetX = predictX;
        entity.targetY = predictY;
        entity.state = 'walk';

        // Separation from other slimes
        const allies = getNearbyAllies(entity, entities, 60);
        const sep = separationForce(entity, allies, entity.size * 1.2);
        entity.targetX += sep.x * 15;
        entity.targetY += sep.y * 15;
    }

    if (distToPlayer > entity.leashRange) {
        entity.aiState = 'returning';
        entity.attackTarget = null;
    }
}

// ─── Ranged AI (Skeleton Archer) ──────────────────────────────────
// Kiting with lateral strafing: maintain optimal range, dodge sideways.

function updateRangedAI(entity, player, distToPlayer, distToHome, entities, players, dt, map) {
    if (entity.aiState === 'returning') {
        if (distToHome < entity.size) { entity.aiState = 'idle'; entity.state = 'idle'; }
        else { setMoveTarget(entity, entity.aiHomeX, entity.aiHomeY); }
        if (distToPlayer < entity.aggroRange && canSeePlayer(entity, player, map)) { entity.aiState = 'chase'; entity.attackTarget = player; }
        return;
    }

    if (distToPlayer < entity.aggroRange && (entity.aiState === 'chase' || canSeePlayer(entity, player, map))) {
        entity.aiState = 'chase';
        entity.attackTarget = player;
        entity.facing = player.x > entity.x ? 'right' : 'left';

        const idealRange = entity.attackRange * 0.65; // sweet spot
        const tooClose = entity.attackRange * 0.35;
        const tooFar = entity.attackRange * 0.9;

        if (distToPlayer < tooClose) {
            // Too close — kite backward with strafe
            const backAngle = angleTo(player, entity.x, entity.y);
            entity.aiStrafeAngle += entity.aiStrafeDir * 0.3;
            const retreatAngle = backAngle + Math.sin(entity.aiStrafeAngle) * 0.4;
            entity.targetX = entity.x + Math.cos(retreatAngle) * 100;
            entity.targetY = entity.y + Math.sin(retreatAngle) * 100;
            entity.state = 'walk';
        } else if (distToPlayer < tooFar) {
            // In sweet spot — strafe laterally while attacking
            entity.aiStrafeAngle += entity.aiStrafeDir * 0.25;
            // Reverse strafe direction occasionally
            if (Math.random() < 0.08) entity.aiStrafeDir *= -1;

            const perpAngle = angleTo(entity, player.x, player.y) + (Math.PI / 2) * entity.aiStrafeDir;
            entity.targetX = entity.x + Math.cos(perpAngle) * 35;
            entity.targetY = entity.y + Math.sin(perpAngle) * 35;
            entity.state = 'walk';
            entity.attackTarget = player;
        } else {
            // Too far — approach carefully
            const approachAngle = angleTo(entity, player.x, player.y);
            const approachDist = Math.min(40, distToPlayer - idealRange);
            entity.targetX = entity.x + Math.cos(approachAngle) * approachDist;
            entity.targetY = entity.y + Math.sin(approachAngle) * approachDist;
            entity.state = 'walk';
        }

        // Separation from other ranged allies
        const allies = getNearbyAllies(entity, entities, 80);
        const sep = separationForce(entity, allies, entity.size * 2);
        entity.targetX += sep.x * 25;
        entity.targetY += sep.y * 25;
    }

    if (distToPlayer > entity.leashRange) {
        entity.aiState = 'returning';
        entity.attackTarget = null;
    }
}

// ─── Ranged Magic AI (Necromancer, Fire Elemental) ────────────────
// Smarter kiting: keep max range, dodge projectiles, retreat to allies.

function updateRangedMagicAI(entity, player, distToPlayer, distToHome, entities, players, dt, map) {
    if (entity.aiState === 'returning') {
        if (distToHome < entity.size) { entity.aiState = 'idle'; entity.state = 'idle'; }
        else { setMoveTarget(entity, entity.aiHomeX, entity.aiHomeY); }
        if (distToPlayer < entity.aggroRange && canSeePlayer(entity, player, map)) { entity.aiState = 'chase'; entity.attackTarget = player; }
        return;
    }

    // Flee toward allies when low HP
    if (entity.hp < entity.maxHp * 0.35 && distToPlayer < entity.aggroRange) {
        const allies = getNearbyAllies(entity, entities, 300);
        const meleeAllies = allies.filter(a => a.aiBehavior === 'melee' || a.aiBehavior === 'fast_chase');
        if (meleeAllies.length > 0) {
            // Run toward the nearest melee ally for protection
            let nearestAlly = meleeAllies[0], nearestDist = Infinity;
            for (const a of meleeAllies) {
                const d = distSq(entity.x, entity.y, a.x, a.y);
                if (d < nearestDist) { nearestDist = d; nearestAlly = a; }
            }
            entity.targetX = nearestAlly.x;
            entity.targetY = nearestAlly.y;
            entity.state = 'walk';
            entity.attackTarget = player; // still attack while fleeing
            entity.facing = player.x > entity.x ? 'right' : 'left';
            return;
        }
    }

    if (distToPlayer < entity.aggroRange && (entity.aiState === 'chase' || canSeePlayer(entity, player, map))) {
        entity.aiState = 'chase';
        entity.attackTarget = player;
        entity.facing = player.x > entity.x ? 'right' : 'left';

        const idealRange = entity.attackRange * 0.75;
        const dangerClose = entity.attackRange * 0.3;

        if (distToPlayer < dangerClose) {
            // Emergency retreat
            const backAngle = angleTo(player, entity.x, entity.y);
            entity.targetX = entity.x + Math.cos(backAngle) * 120;
            entity.targetY = entity.y + Math.sin(backAngle) * 120;
            entity.state = 'walk';
        } else if (distToPlayer < idealRange) {
            // Comfortable range — strafe while casting
            entity.aiStrafeAngle += entity.aiStrafeDir * 0.2;
            if (Math.random() < 0.06) entity.aiStrafeDir *= -1;
            const perpAngle = angleTo(entity, player.x, player.y) + (Math.PI / 2) * entity.aiStrafeDir;
            entity.targetX = entity.x + Math.cos(perpAngle) * 30;
            entity.targetY = entity.y + Math.sin(perpAngle) * 30;
            entity.state = 'walk';
        } else if (distToPlayer > entity.attackRange * 0.9) {
            // Too far — approach to ideal range
            const approachAngle = angleTo(entity, player.x, player.y);
            entity.targetX = entity.x + Math.cos(approachAngle) * 50;
            entity.targetY = entity.y + Math.sin(approachAngle) * 50;
            entity.state = 'walk';
        } else {
            entity.state = 'idle'; // In range, stand and cast
        }
    }

    if (distToPlayer > entity.leashRange) {
        entity.aiState = 'returning';
        entity.attackTarget = null;
    }
}

// ─── Fast Chase AI (Demon Hound, Giant Spider) ────────────────────
// Pack behavior: coordinate with nearby fast chasers to flank from multiple angles.

function updateFastChaseAI(entity, player, distToPlayer, distToHome, entities, players, dt, map) {
    if (entity.aiState === 'returning') {
        if (distToHome < entity.size * 2) { entity.aiState = 'idle'; entity.attackTarget = null; entity.state = 'idle'; }
        else { entity.targetX = entity.aiHomeX; entity.targetY = entity.aiHomeY; entity.state = 'walk'; }
        if (distToPlayer < entity.aggroRange && canSeePlayer(entity, player, map)) { entity.aiState = 'chase'; entity.attackTarget = player; }
        return;
    }

    if (distToPlayer < entity.aggroRange && (entity.aiState === 'chase' || canSeePlayer(entity, player, map))) {
        entity.aiState = 'chase';
        entity.attackTarget = player;
        entity.facing = player.x > entity.x ? 'right' : 'left';

        // Pack coordination: get nearby fast chasers and assign flank angles
        const allies = getNearbyAllies(entity, entities, 200);
        const packMates = allies.filter(a => a.aiBehavior === 'fast_chase');
        const packSize = packMates.length + 1;

        if (distToPlayer > entity.attackRange * 1.5) {
            // Flanking approach: each pack member takes a different angle
            const baseAngle = angleTo(player, entity.x, entity.y);
            const flankOffset = getFlankAngle(entity, packSize);
            const targetAngle = baseAngle + normalizeAngle(flankOffset - baseAngle) * 0.4;

            // Aim slightly ahead of player for interception
            const predictX = player.x + (player.x - (entity.aiLastPlayerX || player.x)) * 3;
            const predictY = player.y + (player.y - (entity.aiLastPlayerY || player.y)) * 3;

            const approachDist = entity.attackRange * 0.7;
            entity.targetX = predictX + Math.cos(targetAngle) * approachDist;
            entity.targetY = predictY + Math.sin(targetAngle) * approachDist;
        } else {
            // In range — attack directly
            entity.targetX = player.x;
            entity.targetY = player.y;
        }
        entity.state = 'walk';

        // Separation from pack mates
        const sep = separationForce(entity, packMates, entity.size * 1.3);
        entity.targetX += sep.x * 20;
        entity.targetY += sep.y * 20;
    }

    if (distToPlayer > entity.leashRange) {
        entity.aiState = 'returning';
        entity.attackTarget = null;
    }
}

// ─── Boss AI ──────────────────────────────────────────────────────
// Multi-phase boss with charge attacks, AoE slams, and enrage.
// Phase 0: Normal melee chase (100%-60% HP)
// Phase 1: Charge attacks + faster (60%-30% HP)
// Phase 2: Enraged — much faster, stronger, AoE slam pattern (below 30% HP)

function updateBossAI(entity, player, distToPlayer, distToHome, entities, players, dt) {
    entity.attackTarget = player;
    entity.facing = player.x > entity.x ? 'right' : 'left';

    // Ensure base stats are stored on first tick
    if (!entity._bossBaseSpeed) {
        entity._bossBaseSpeed = entity.baseSpeed || entity.speed;
        entity._bossBaseAttackDamage = entity.baseAttackDamage || entity.attackDamage;
    }

    // Determine phase based on HP percentage
    const hpPct = entity.hp / entity.maxHp;
    let newPhase;
    if (hpPct > 0.6) newPhase = 0;
    else if (hpPct > 0.3) newPhase = 1;
    else newPhase = 2;

    // Phase transition effects
    if (newPhase !== entity.aiPhase) {
        entity.aiPhase = newPhase;
        entity.aiPhaseTimer = 0;

        // Apply phase-specific stat changes (from base, never compounding)
        switch (newPhase) {
            case 1:
                entity.speed = entity._bossBaseSpeed * 1.25;
                entity.baseSpeed = entity.speed;
                entity.attackDamage = entity._bossBaseAttackDamage * 1.15;
                entity.baseAttackDamage = entity.attackDamage;
                break;
            case 2:
                entity.speed = entity._bossBaseSpeed * 1.6;
                entity.baseSpeed = entity.speed;
                entity.attackDamage = Math.round(entity._bossBaseAttackDamage * 1.4);
                entity.baseAttackDamage = entity.attackDamage;
                entity.attackSpeed = Math.min(entity.attackSpeed * 1.3, 2.0);
                break;
        }
    }

    entity.aiPhaseTimer += dt;
    entity.aiState = 'chase';

    switch (entity.aiPhase) {
        case 0: // Normal chase
            setMoveTarget(entity, player.x, player.y);
            break;

        case 1: // Charge attacks — periodically rushes at player
            if (distToPlayer > entity.attackRange * 3 && entity.aiPhaseTimer > 2) {
                // Charge: set target far ahead for a rushing attack
                entity.targetX = player.x;
                entity.targetY = player.y;
                entity.state = 'walk';
                entity.aiPhaseTimer = 0;
            } else if (distToPlayer > entity.attackRange) {
                // Normal approach between charges
                setMoveTarget(entity, player.x, player.y);
            } else {
                entity.targetX = player.x;
                entity.targetY = player.y;
                entity.state = 'walk';
            }
            break;

        case 2: // Enraged — aggressive pursuit with AoE slam pattern
            // Zigzag approach: alternate between rushing straight and circling
            if (entity.aiPhaseTimer % 3 < 1.5) {
                // Rush directly
                entity.targetX = player.x;
                entity.targetY = player.y;
            } else {
                // Circle strafe before lunging
                entity.aiStrafeAngle += entity.aiStrafeDir * 0.5;
                const circleAngle = angleTo(player, entity.x, entity.y) + entity.aiStrafeDir * 0.4;
                const circleDist = entity.attackRange * 1.5;
                entity.targetX = player.x + Math.cos(circleAngle) * circleDist;
                entity.targetY = player.y + Math.sin(circleAngle) * circleDist;
            }
            entity.state = 'walk';
            break;
    }
}

// ═══════════════════════════════════════════════════════════════════
// ENEMY ABILITY SYSTEM — Q / W / E / R
// ═══════════════════════════════════════════════════════════════════

/**
 * Tick ability cooldowns for all enemies (called every frame).
 * Called from the main game loop alongside updateAI().
 */
export function tickEnemyAbilities(entities, dt) {
    for (const entity of entities) {
        if (!entity.alive || entity.type !== 'enemy') continue;
        if (!entity.abilities) continue;

        for (const key of ['q', 'w', 'e', 'r']) {
            const abil = entity.abilities[key];
            if (abil && abil.cooldown > 0) {
                abil.cooldown -= dt;
            }
        }
    }
}

/**
 * Try to use a specific enemy ability key (q/w/e/r).
 * Returns true if the ability was fired, false otherwise.
 */
export function tryUseEnemyAbility(entity, key, player, entities, dt, map) {
    if (!entity.abilities || !entity.abilities[key]) return false;
    const abil = entity.abilities[key];
    if (abil.cooldown > 0) return false;

    const config = abil.config;
    if (!config) return false;

    const dx = player.x - entity.x;
    const dy = player.y - entity.y;
    const distToPlayer = Math.hypot(dx, dy);

    // Range check
    if (config.range && distToPlayer > config.range * 1.15) return false;

    // Face the player
    entity.facing = dx > 0 ? 'right' : 'left';

    // Set cooldown
    abil.cooldown = config.cooldown;

    // Execute based on type
    executeEnemyAbility(entity, config, player, entities, dx, dy, distToPlayer, dt, map);
    return true;
}

/**
 * Execute an enemy ability based on its type.
 * @param {Object} entity  - The enemy casting
 * @param {Object} config  - The ability config from ENEMY_SPELLS
 * @param {Object} player  - The target player
 * @param {Array}  entities - All entities (for AoE, summon, etc.)
 * @param {number} dx       - Delta x to player
 * @param {number} dy       - Delta y to player
 * @param {number} dist     - Distance to player
 * @param {number} dt       - Delta time
 */
function executeEnemyAbility(entity, config, player, entities, dx, dy, dist, dt, map) {
    const normX = dx / Math.max(dist, 0.01);
    const normY = dy / Math.max(dist, 0.01);

    // Set enemy to attacking state briefly
    entity.state = 'attack';

    // Visual cast flash
    spawnParticles(entity.x, entity.y - entity.size * 0.3, config.color || '#FFF', 6, 60, 0.5, 2);

    switch (config.type) {
        // ────────────────── DASH (Charge/Pounce/Tackle) ──────────────────
        case 'dash': {
            const rawEndX = entity.x + normX * config.range;
            const rawEndY = entity.y + normY * config.range;

            // Step toward the target, stopping just before any wall so the
            // enemy doesn't end up clipped inside it (and stuck there).
            let endX = entity.x;
            let endY = entity.y;
            if (map) {
                const steps = 10;
                for (let i = 1; i <= steps; i++) {
                    const t = i / steps;
                    const px = entity.x + (rawEndX - entity.x) * t;
                    const py = entity.y + (rawEndY - entity.y) * t;
                    if (!isPositionFree(entity, px, py, map, entities)) break;
                    endX = px;
                    endY = py;
                }
            } else {
                endX = rawEndX;
                endY = rawEndY;
            }

            entity.x = endX;
            entity.y = endY;
            entity.targetX = endX;
            entity.targetY = endY;

            // Trail particles
            spawnParticles(entity.x, entity.y - entity.size * 0.3, config.color || '#FFF', 8, 80, 0.4, 3);

            // Damage player if close
            const postDist = Math.hypot(player.x - entity.x, player.y - entity.y);
            if (postDist < entity.size + player.size + 16) {
                dealDamage(player, config.damage || 10, entity);
                spawnParticles(player.x, player.y - player.size * 0.3, '#FF5722', 6, 50, 0.3, 2);

                // Stun
                if (config.stunDuration && config.stunDuration > 0) {
                    player.aiStunTimer = Math.max(player.aiStunTimer || 0, config.stunDuration);
                }
            }
            break;
        }

        // ────────────────── CONE (Cleave/Flame Breath/Goo Spray) ──────────────────
        case 'cone': {
            const angle = Math.atan2(dy, dx);
            const coneAngle = config.coneAngle || Math.PI / 4;
            const range = config.range || 50;

            // Check if player is inside the cone
            const playerAngle = Math.atan2(player.y - entity.y, player.x - entity.x);
            let angleDiff = playerAngle - angle;
            while (angleDiff > Math.PI) angleDiff -= TWO_PI;
            while (angleDiff < -Math.PI) angleDiff += TWO_PI;

            if (Math.abs(angleDiff) <= coneAngle / 2 && dist <= range) {
                dealDamage(player, config.damage || 10, entity);
                spawnParticles(player.x, player.y - player.size * 0.3, config.color || '#FFF', 8, 60, 0.3, 3);

                // Apply burn
                if (config.burnDuration && config.burnDps) {
                    applyBurn(player, config.burnDuration, config.burnDps);
                }

                // Apply slow
                if (config.slowAmount && config.slowDuration) {
                    const slowEffect = config.slowAmount;
                    if (!player._enemySlowTimer || player._enemySlowTimer <= 0) {
                        player.speed = Math.max(player.speed * (1 - slowEffect), 30);
                    }
                    player._enemySlowTimer = Math.max(player._enemySlowTimer || 0, config.slowDuration);
                }
            }

            // Cone visual particles
            for (let i = 0; i < 6; i++) {
                const spreadAngle = angle + (Math.random() - 0.5) * coneAngle;
                const pDist = Math.random() * range;
                const px = entity.x + Math.cos(spreadAngle) * pDist;
                const py = (entity.y - entity.size * 0.3) + Math.sin(spreadAngle) * pDist;
                spawnParticles(px, py, config.color || '#FFF', 3, 40, 0.2, 2);
            }
            break;
        }

        // ────────────────── AOE_SELF (Stomp/Screech/Poison Bite) ──────────────────
        case 'aoe_self': {
            const radius = config.radius || 60;
            const distToPlayer = Math.hypot(player.x - entity.x, player.y - entity.y);

            if (distToPlayer <= radius) {
                dealDamage(player, config.damage || 8, entity);
                spawnParticles(player.x, player.y - player.size * 0.3, config.color || '#FFF', 8, 70, 0.4, 3);

                // Stun
                if (config.stunDuration && config.stunDuration > 0) {
                    player.aiStunTimer = Math.max(player.aiStunTimer || 0, config.stunDuration);
                }

                // Burn
                if (config.burnDuration && config.burnDps) {
                    applyBurn(player, config.burnDuration, config.burnDps);
                }

                // Knockback
                if (config.knockback && config.knockback > 0) {
                    const angle = Math.atan2(player.y - entity.y, player.x - entity.x);
                    player.knockback.vx = Math.cos(angle) * config.knockback;
                    player.knockback.vy = Math.sin(angle) * config.knockback;
                }
            }

            // Ground crack visual
            spawnParticles(entity.x, entity.y, config.color || '#FFF', 12, 80, 0.5, 4);
            break;
        }

        // ────────────────── PROJECTILE (Bolt/Arrow/Web) ──────────────────
        case 'projectile': {
            const speed = config.projectileSpeed || 300;
            const range = config.range || 200;
            const projectileDx = normX * speed;
            const projectileDy = normY * speed;

            const proj = {
                x: entity.x,
                y: entity.y - entity.size * 0.3,
                vx: projectileDx,
                vy: projectileDy,
                size: config.projectileSize || 5,
                color: config.color || '#FF9800',
                damage: config.damage || 10,
                source: entity,
                team: 'enemy',
                maxRange: range,
                startX: entity.x,
                startY: entity.y,
                alive: true,
                // Custom payload
                _explosionRadius: config.explosionRadius || 0,
                _burnDuration: config.burnDuration || 0,
                _burnDps: config.burnDps || 0,
                _slowAmount: config.slowAmount || 0,
                _slowDuration: config.slowDuration || 0,
                _lifesteal: config.lifesteal || 0,
            };

            addEnemyProjectile(proj);

            // Launch particles
            spawnParticles(entity.x, entity.y - entity.size * 0.3, config.color || '#FFF', 4, 50, 0.2, 2);
            break;
        }

        // ────────────────── GROUND_AOE (Lava Pool) ──────────────────
        case 'ground_aoe': {
            // Create a persistent ground AoE zone
            const targetX = player.x;
            const targetY = player.y;
            const aoeDuration = config.duration || 3;
            const aoeRadius = config.wallLength || 60;
            const dmgPerSecond = config.damagePerSecond || 12;

            // Add AoE zone to entity data (processed in main loop)
            if (!entity._aoeZones) entity._aoeZones = [];
            entity._aoeZones.push({
                x: targetX,
                y: targetY,
                radius: aoeRadius,
                duration: aoeDuration,
                timer: aoeDuration,
                damagePerSecond: dmgPerSecond,
                color: config.color || '#FF5722',
            });

            // Visual burst
            spawnParticles(targetX, targetY, config.color || '#FF5722', 15, 100, 0.6, 5);
            break;
        }

        // ────────────────── SUMMON (Minions) ──────────────────
        case 'summon': {
            const summonType = config.summonType || 'skeleton_minion';
            const summonX = entity.x + (Math.random() - 0.5) * 60;
            const summonY = entity.y + (Math.random() - 0.5) * 60;
            const minion = spawnEnemy(summonType, summonX, summonY, null, 1);
            if (minion) {
                minion._isSummon = true;
                minion._summonMaster = entity;
                minion.deathTimer = 0.4; // Summons fade quickly
                // Auto-aggro the summon
                minion.attackTarget = player;
                minion.aiState = 'chase';
                entities.push(minion);

                spawnParticles(summonX, summonY, config.color || '#4B0082', 10, 80, 0.4, 3);
            }
            break;
        }

        // ────────────────── PASSIVE_SUMMON (Slime Split on Death) ──────────────────
        case 'passive_summon': {
            // Handled in onDeath hook, nothing to do here
            break;
        }

        // ────────────────── TELEGRAPH_AOE (boss ultimates — dodge the warning ring) ──────────────────
        case 'telegraph_aoe': {
            const targetX = player.x;
            const targetY = player.y;
            const telegraphDuration = config.telegraphDuration || 1.2;

            if (!entity._aoeZones) entity._aoeZones = [];
            entity._aoeZones.push({
                x: targetX,
                y: targetY,
                radius: config.radius || 90,
                delay: telegraphDuration,
                maxDelay: telegraphDuration,
                damage: config.damage || 40,
                shakeIntensity: config.shakeIntensity || 16,
                color: config.color || '#D50000',
            });

            spawnParticles(targetX, targetY, config.color || '#D50000', 10, 50, 0.4, 3);
            break;
        }
    }
}

/**
 * Process ground AoE zones from enemies (lava pools, etc.).
 * Called every frame from the main loop.
 */
export function processEnemyAoEZones(entities, dt) {
    for (const entity of entities) {
        if (!entity.alive || entity.type !== 'enemy') continue;
        if (!entity._aoeZones || entity._aoeZones.length === 0) continue;

        for (let i = entity._aoeZones.length - 1; i >= 0; i--) {
            const zone = entity._aoeZones[i];

            // ── Telegraphed one-shot blast (boss ultimates) ──
            // Counts down with no damage so the player can see and dodge the
            // warning ring (rendered in drawEnemyAoeZones), then bursts once.
            if (zone.delay !== undefined) {
                zone.delay -= dt;
                if (zone.delay <= 0) {
                    for (const other of entities) {
                        if (other.type === 'player' && other.alive) {
                            const dz = Math.hypot(other.x - zone.x, other.y - zone.y);
                            if (dz < zone.radius) {
                                dealDamage(other, zone.damage, entity);
                            }
                        }
                    }
                    spawnParticles(zone.x, zone.y, zone.color, 30, 140, 0.6, 6);
                    shake(zone.shakeIntensity || 16);
                    entity._aoeZones.splice(i, 1);
                }
                continue;
            }

            zone.timer -= dt;

            // Damage players in zone
            for (const other of entities) {
                if (other.type === 'player' && other.alive) {
                    const dz = Math.hypot(other.x - zone.x, other.y - zone.y);
                    if (dz < zone.radius) {
                        zone._accumDmg = (zone._accumDmg || 0) + zone.damagePerSecond * dt;
                        if (zone._accumDmg >= 1) {
                            dealDamage(other, Math.floor(zone._accumDmg), entity);
                            zone._accumDmg -= Math.floor(zone._accumDmg);
                        }
                    }
                }
            }

            // Particles for visual
            if (Math.random() < 0.3) {
                const px = zone.x + (Math.random() - 0.5) * zone.radius * 2;
                const py = zone.y + (Math.random() - 0.5) * zone.radius * 2;
                spawnParticles(px, py, zone.color, 2, 20, 0.2, 1);
            }

            if (zone.timer <= 0) {
                entity._aoeZones.splice(i, 1);
            }
        }
    }
}
