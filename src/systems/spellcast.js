// spellcast.js — spell execution engine: cooldowns, targeting, effects

import { SPELLS } from '../config/spells.js';
import { dealDamage, applyBurn, queueSoundEvent } from './combat.js';
import { findNearestEnemy, isPositionFree } from './movement.js';
import { addBuff } from '../entities/buffs.js';
import { shake } from '../camera.js';
import { playChampionSfx } from '../audio.js';
import { spawnBeamEffect } from '../render/drawEffects.js';

const projectilesToAdd = [];

/**
 * Get the damage multiplier for a spell at its current rank.
 * Rank 1 = 1x, rank 2+ = rankScaling.damagePerRank each level.
 */
function getRankDamageMultiplier(spellInstance, config) {
    const rank = spellInstance.rank || 1;
    if (!config.rankScaling) return 1;
    return 1 + (rank - 1) * config.rankScaling.damagePerRank;
}

/**
 * Apply rank-based cooldown reduction to a spell instance.
 * Cooldown = baseCooldown - (rank - 1) * cooldownPerRank, min 1s.
 */
function applyRankCooldown(spellInstance, config) {
    const rank = spellInstance.rank || 1;
    const base = config.cooldown;
    if (!config.rankScaling || rank <= 1) {
        spellInstance.maxCooldown = base;
        spellInstance.cooldown = base;
        return;
    }
    const reduction = (rank - 1) * config.rankScaling.cooldownPerRank;
    const finalCd = Math.max(1, base - reduction);
    spellInstance.maxCooldown = finalCd;
    spellInstance.cooldown = finalCd;
}

/**
 * Called from main loop to register projectiles created by spells
 */
export function getPendingProjectiles() {
    const p = [...projectilesToAdd];
    projectilesToAdd.length = 0;
    return p;
}

/**
 * Try to cast a spell for the player
 * @param {object} player - Player entity
 * @param {string} key - 'q', 'w', 'e', or 'r'
 * @param {number} targetX - Target world X
 * @param {number} targetY - Target world Y
 * @param {object[]} entities - All entities
 * @returns {boolean} - Whether the spell was cast
 */
export function tryCastSpell(player, key, targetX, targetY, entities) {
    const spell = player.spells[key];
    if (!spell) return false;
    if (spell.cooldown > 0) return false;
    if (!player.alive) return false;

    const spellConfig = SPELLS[spell.id];
    if (!spellConfig) return false;

    // Set the real cooldown on instance (with rank scaling)
    applyRankCooldown(spell, spellConfig);

    // Cooldown reduction items (Sapphire Ring), capped at 40%
    if (player._cdr) {
        const cdrMult = 1 - Math.min(player._cdr, 0.4);
        spell.cooldown *= cdrMult;
        spell.maxCooldown *= cdrMult;
    }

    // Set player state
    const stateKey = 'cast' + key.toUpperCase();
    player.state = stateKey;
    player.castingKey = key;
    player.castingTimer = spellConfig.castTime || 0.25;
    player.facing = targetX > player.x ? 'right' : 'left';

    // Store target for when cast completes
    player.castingTargetX = targetX;
    player.castingTargetY = targetY;

    // Play the champion's spell sound
    playChampionSfx(player.championId, key);
    queueSoundEvent({ type: 'championSfx', championId: player.championId, slot: key });

    return true;
}

/**
 * Execute a spell effect (called when cast time completes)
 */
export function executeSpell(player, entities, map) {
    const key = player.castingKey;
    if (!key) return;

    const spell = player.spells[key];
    if (!spell) return;

    const config = SPELLS[spell.id];
    if (!config) return;

    const targetX = player.castingTargetX || (player.facing === 'right' ? player.x + 50 : player.x - 50);
    const targetY = player.castingTargetY || player.y;

    try {
        switch (config.type) {
            case 'cone':
                executeCone(player, config, entities);
                break;
            case 'aoe_self':
                executeAoeSelf(player, config, entities);
                break;
            case 'dash':
                executeDash(player, config, entities, map);
                break;
            case 'buff':
                executeBuff(player, config);
                break;
            case 'projectile':
                executeProjectile(player, config, targetX, targetY, entities);
                break;
            case 'teleport':
                executeTeleport(player, config, entities, map);
                break;
            case 'mark':
                executeMark(player, config, entities);
                break;
            case 'ground_aoe':
                executeGroundAoe(player, config, targetX, targetY, map);
                break;
            case 'meteor_storm':
                executeMeteorStorm(player, config, targetX, targetY, entities);
                break;
            case 'heal':
                executeHeal(player, config);
                break;
            case 'holy_nova':
                executeHolyNova(player, config, entities);
                break;
            case 'beam':
                executeBeam(player, config, targetX, targetY, entities);
                break;
        }
    } catch (e) {
        console.error('Spell execution error:', config?.id, e);
    }

    // Clear casting state
    player.state = 'idle';
    player.castingKey = null;
    player.castingTimer = 0;
}

/**
 * Cone AOE — damage all enemies in a cone in front of player
 */
function executeCone(caster, config, entities) {
    const enemies = entities.filter(e => e.alive && e.type !== 'player');
    const angle = caster.facing === 'right' ? 0 : Math.PI;
    const rankMult = getRankDamageMultiplier(caster.spells[caster.castingKey], config);
    let shieldGranted = false;

    for (const enemy of enemies) {
        const dx = enemy.x - caster.x;
        const dy = enemy.y - caster.y;
        const dist = Math.hypot(dx, dy);

        if (dist > config.range) continue;

        const enemyAngle = Math.atan2(dy, dx);
        let diff = enemyAngle - angle;
        let safety = 0;
        while (diff > Math.PI && safety++ < 100) diff -= Math.PI * 2;
        safety = 0;
        while (diff < -Math.PI && safety++ < 100) diff += Math.PI * 2;

        if (Math.abs(diff) <= (config.coneAngle || Math.PI / 3) / 2) {
            const dmg = (config.damage + (caster.attackDamage * (config.adScaling || 0))) * rankMult;
            dealDamage(enemy, Math.round(dmg), caster);

            // Holy Strike heal
            if (config.healPercent) {
                const heal = Math.round(dmg * config.healPercent);
                caster.hp = Math.min(caster.maxHp, caster.hp + heal);
            }
            // Shield Bash stun + shield
            if (config.stunDuration) {
                enemy.aiState = 'stunned';
                enemy.aiStunTimer = config.stunDuration;
                enemy.targetX = null;
                enemy.targetY = null;
                enemy.attackTarget = null;
            }
            if (config.shieldAmount && !shieldGranted) {
                caster.shield += config.shieldAmount;
                caster.shieldTimer = config.shieldDuration || 3;
                shieldGranted = true;
            }

            // Slow on hit (Water Breathing)
            if (config.slowAmount && enemy.alive) {
                enemy.speed *= (1 - config.slowAmount);
                enemy.shadowStrikeSlow = Math.max(enemy.shadowStrikeSlow || 0, config.slowDuration || 2);
            }

            // Kaioken bonus per Power Up stack
            if (config.bonusPerBuff && enemy.alive) {
                const buff = caster.buffs?.find(b => b.id === 'power_up');
                if (buff) {
                    const stacks = buff.stacks || 1;
                    dealDamage(enemy, config.bonusPerBuff * stacks, caster);
                }
            }
        }
    }

    if (config.damage >= 20) shake(4);
}

/**
 * Self AOE — damage all enemies within radius
 */
function executeAoeSelf(caster, config, entities) {
    const enemies = entities.filter(e => e.alive && e.type !== 'player');
    const rankMult = getRankDamageMultiplier(caster.spells[caster.castingKey], config);

    for (const enemy of enemies) {
        const dx = enemy.x - caster.x;
        const dy = enemy.y - caster.y;
        const dist = Math.hypot(dx, dy);

        if (dist <= config.radius) {
            const dmg = config.damage * rankMult;
            dealDamage(enemy, Math.round(dmg), caster);

            // Extra explosion knockback, pushing outward from the caster
            if (config.knockback && dist > 0) {
                const kx = (dx / dist) * config.knockback;
                const ky = (dy / dist) * config.knockback;
                enemy.knockback.vx += kx;
                enemy.knockback.vy += ky;
            }

            if (config.stunDuration) {
                enemy.targetX = null;
                enemy.targetY = null;
                enemy.aiState = 'stunned';
                enemy.aiStunTimer = config.stunDuration;
                enemy.attackTarget = null;
            }

            // Combustion bonus per burning enemy
            if (config.bonusPerBurn && enemy.burning) {
                dealDamage(enemy, config.bonusPerBurn, caster);
                enemy.burning = false;
                enemy.burnTimer = 0;
            }
        }
    }

    if (config.damage >= 20) shake(6);
}

/**
 * Dash — move quickly toward target, stops at walls and enemies
 */
function executeDash(caster, config, entities, map) {
    const dx = caster.castingTargetX - caster.x;
    const dy = caster.castingTargetY - caster.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return; // cast on own position — nothing to do
    const dashDist = Math.min(dist, config.range || 180);

    const endX = caster.x + (dx / dist) * dashDist;
    const endY = caster.y + (dy / dist) * dashDist;

    // Linearly interpolate for collision with walls and enemies
    const steps = 10;
    let lastValidX = caster.x;
    let lastValidY = caster.y;
    let hitEnemy = null;

    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const px = caster.x + (endX - caster.x) * t;
        const py = caster.y + (endY - caster.y) * t;

        // Wall collision — use bounding-box check so edges don't clip into walls
        if (!isPositionFree(caster, px, py, map, entities)) {
            break;
        }

        // Entity collision — stop at enemy
        for (const enemy of entities) {
            if (!enemy.alive || enemy.type === 'player') continue;
            const edx = enemy.x - px;
            const edy = enemy.y - py;
            if (Math.hypot(edx, edy) < (caster.size + enemy.size) * 0.5) {
                hitEnemy = enemy;
                break;
            }
        }
        if (hitEnemy) break;

        lastValidX = px;
        lastValidY = py;
    }

    caster.x = lastValidX;
    caster.y = lastValidY;

    if (hitEnemy) {
        const rankMult = getRankDamageMultiplier(caster.spells[caster.castingKey], config);
        const dmg = (config.damage + (caster.attackDamage * (config.adScaling || 0))) * rankMult;
        dealDamage(hitEnemy, Math.round(dmg), caster);
        if (config.stunDuration) {
            hitEnemy.targetX = null;
            hitEnemy.targetY = null;
            hitEnemy.aiState = 'stunned';
            hitEnemy.aiStunTimer = config.stunDuration;
            hitEnemy.attackTarget = null;
        }
        shake(5);
    }

    // Closing the gap empowers the caster (e.g. Saiyan's Instant Transmission
    // feeds Kaioken Punch's bonusPerBuff via the shared 'power_up' buff id).
    if (config.grantBuffId) {
        const stats = {};
        if (config.grantSpeedMultiplier) stats.speedMultiplier = config.grantSpeedMultiplier;
        if (config.grantDamageMultiplier) stats.damageMultiplier = config.grantDamageMultiplier;
        addBuff(caster, config.grantBuffId, config.grantBuffDuration || 4, stats);
    }
}

/**
 * Self buff
 */
function executeBuff(caster, config) {
    const rank = caster.spells[caster.castingKey]?.rank || 1;
    const stats = {};
    if (config.attackSpeedMultiplier) stats.attackSpeedMultiplier = config.attackSpeedMultiplier;
    if (config.speedMultiplier) stats.speedMultiplier = config.speedMultiplier;
    if (config.damageMultiplier) stats.damageMultiplier = config.damageMultiplier;
    if (config.bonusDamage) stats.bonusDamage = config.bonusDamage * (1 + (rank - 1) * 0.5);

    const flags = {};
    if (config.invisible) flags.invisible = true;

    const duration = config.duration + (rank - 1) * 0.5;
    addBuff(caster, config.id, duration, stats, flags);
}

/**
 * Beam — an instant, wide line blast (Kamehameha). Unlike a projectile this
 * has no travel time and no falloff: every enemy caught in the line takes
 * full damage the instant it fires. Width (and therefore "space") grows
 * with rank via rankScaling.sizePerRank.
 */
function executeBeam(caster, config, targetX, targetY, entities) {
    const dx = targetX - caster.x;
    const dy = targetY - caster.y;
    const dist = Math.hypot(dx, dy) || 1;
    const dirX = dx / dist;
    const dirY = dy / dist;
    const range = config.range || 400;

    const spellInstance = caster.spells[caster.castingKey];
    const rank = spellInstance?.rank || 1;
    const rankMult = getRankDamageMultiplier(spellInstance, config);
    const beamWidth = (config.beamWidth || 60) + (rank - 1) * (config.rankScaling?.sizePerRank || 0);
    const damage = Math.round((config.damage + (caster.attackDamage * (config.adScaling || 0))) * rankMult);

    const endX = caster.x + dirX * range;
    const endY = caster.y + dirY * range;

    caster.facing = dirX >= 0 ? 'right' : 'left';

    for (const enemy of entities) {
        if (!enemy.alive || enemy.type === 'player') continue;
        const ex = enemy.x - caster.x;
        const ey = enemy.y - caster.y;
        // Project the enemy onto the beam's local axes (localX = along the
        // beam, localY = perpendicular distance from its centerline).
        const localX = ex * dirX + ey * dirY;
        const localY = -ex * dirY + ey * dirX;
        if (localX >= 0 && localX <= range && Math.abs(localY) <= beamWidth / 2 + enemy.size * 0.5) {
            dealDamage(enemy, damage, caster);
        }
    }

    spawnBeamEffect(caster.x, caster.y, endX, endY, beamWidth, config.projectileColor || config.color, 0.5);
    shake(config.shakeIntensity || 18);
}

/**
 * Projectile spell
 */
function executeProjectile(caster, config, targetX, targetY, entities) {
    const dx = targetX - caster.x;
    const dy = targetY - caster.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;

    const maxRange = config.range || 200;
    const projDist = Math.min(dist, maxRange);
    const vx = (dx / dist) * (config.projectileSpeed || 350);
    const vy = (dy / dist) * (config.projectileSpeed || 350);
    const rankMult = getRankDamageMultiplier(caster.spells[caster.castingKey], config);
    const rank = caster.spells[caster.castingKey]?.rank || 1;

    // Kamehameha rank scaling — projectile and explosion grow massively per rank
    const rankSizeBonus = config.rankScaling?.sizePerRank ? (rank - 1) * config.rankScaling.sizePerRank : 0;
    const rankExplosionBonus = config.rankScaling?.explosionPerRank ? (rank - 1) * config.rankScaling.explosionPerRank : 0;

    const projectile = {
        x: caster.x,
        y: caster.y,
        vx: vx,
        vy: vy,
        size: (config.projectileSize || 6) + rankSizeBonus,
        color: config.projectileColor || config.color || '#FF9800',
        damage: Math.round((config.damage + (caster.attackDamage * (config.adScaling || 0))) * rankMult),
        source: caster,
        maxRange: maxRange,
        startX: caster.x,
        startY: caster.y,
        config: config,
        alive: true,
        spellId: config.id,
        explosionRadius: (config.explosionRadius || 0) + rankExplosionBonus,
        slowAmount: config.slowAmount || 0,
        slowDuration: config.slowDuration || 0,
        // Piercing projectiles pass through enemies, hitting each once instead
        // of dying on first contact (archer's Piercing Shot / Deadeye).
        pierce: config.pierce || false,
        _hitIds: config.pierce ? new Set() : null,
    };

    projectilesToAdd.push(projectile);
}

/**
 * Teleport behind target (backstab)
 */
function executeTeleport(caster, config, entities, map) {
    const target = caster.attackTarget;
    if (!target || !target.alive) {
        // Teleport toward cursor instead
        const dx = caster.castingTargetX - caster.x;
        const dy = caster.castingTargetY - caster.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 1) return; // cast on own position
        const tpDist = Math.min(dist, config.range || 150);
        const nx = caster.x + (dx / dist) * tpDist;
        const ny = caster.y + (dy / dist) * tpDist;
        // Safety: don't teleport into a wall
        if (!map || map.isWorldWalkable(nx, ny)) {
            caster.x = nx;
            caster.y = ny;
        }
        return;
    }

    // Teleport behind target
    const angle = Math.atan2(target.y - caster.y, target.x - caster.x);
    const behindDist = target.size + caster.size;
    const nx = target.x - Math.cos(angle) * behindDist;
    const ny = target.y - Math.sin(angle) * behindDist;
    // Safety: don't teleport into a wall; fall back to current position
    if (!map || map.isWorldWalkable(nx, ny)) {
        caster.x = nx;
        caster.y = ny;
    }

    // Backstab bonus
    const rankMult = getRankDamageMultiplier(caster.spells[caster.castingKey], config);
    const dmg = Math.round((config.damage + (caster.attackDamage * (config.adScaling || 0))) * rankMult);
    dealDamage(target, dmg, caster);
    shake(4);
}

/**
 * Death Mark — mark target, delayed burst
 */
function executeMark(caster, config, entities) {
    const target = caster.attackTarget || findNearestEnemy(caster, entities);
    if (!target || !target.alive) return;
    const rankMult = getRankDamageMultiplier(caster.spells[caster.castingKey], config);

    target.mark = {
        expireTimer: config.markDuration || 3,
        storedDamage: 0,
        casterId: caster.id,
        baseDamage: Math.round((config.baseDamage || 50) * rankMult),
        storedPercent: config.storedDamagePercent || 0.35,
    };

    // Burst of speed to chase down the marked target
    if (config.selfSpeedMult) {
        addBuff(caster, 'death_mark_speed', config.selfSpeedDuration || 2, { speedMult: config.selfSpeedMult });
    }
}

/**
 * Ground AOE (Flame Wall) — creates persistent fire zone
 */
function executeGroundAoe(caster, config, targetX, targetY, map) {
    const rankMult = getRankDamageMultiplier(caster.spells[caster.castingKey], config);

    // Clamp to the spell's cast range first
    {
        const dx0 = targetX - caster.x;
        const dy0 = targetY - caster.y;
        const dist0 = Math.hypot(dx0, dy0);
        const maxRange = config.range || 110;
        if (dist0 > maxRange) {
            targetX = caster.x + (dx0 / dist0) * maxRange;
            targetY = caster.y + (dy0 / dist0) * maxRange;
        }
    }

    // Clamp to line-of-sight: walk from caster toward the target and stop
    // short if a wall is hit, so the wall can't be placed through walls.
    let placeX = targetX;
    let placeY = targetY;
    if (map) {
        const dx = targetX - caster.x;
        const dy = targetY - caster.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0) {
            const steps = Math.ceil(dist / 8);
            let lastX = caster.x;
            let lastY = caster.y;
            for (let i = 1; i <= steps; i++) {
                const t = (i / steps) * dist;
                const px = caster.x + (dx / dist) * t;
                const py = caster.y + (dy / dist) * t;
                if (!map.isWorldWalkable(px, py)) break;
                lastX = px;
                lastY = py;
            }
            placeX = lastX;
            placeY = lastY;
        }
    }

    // Create a ground-based hazard entity
    const hazard = {
        type: 'hazard',
        x: placeX,
        y: placeY,
        size: 20,
        hazardType: 'flame_wall',
        duration: config.duration || 4,
        lifeTimer: config.duration || 4,
        dps: (config.damagePerSecond || 15) * rankMult,
        wallLength: config.wallLength || 100,
        color: config.color || '#FF5722',
        alive: true,
        source: caster, // kill credit + knockback for wall damage
        angle: Math.atan2(caster.castingTargetY - caster.y, caster.castingTargetX - caster.x),
    };
    projectilesToAdd.push(hazard);
}

/**
 * Meteor Storm — multi-wave AOE
 */
function executeMeteorStorm(caster, config, targetX, targetY, entities) {
    const waveCount = config.waveCount || 4;
    const radius = config.radius || 120;
    const rankMult = getRankDamageMultiplier(caster.spells[caster.castingKey], config);
    const damage = (config.damage || 60) * rankMult;

    // Clamp to cast range
    {
        const dx0 = targetX - caster.x;
        const dy0 = targetY - caster.y;
        const dist0 = Math.hypot(dx0, dy0);
        const maxRange = config.range || 200;
        if (dist0 > maxRange) {
            targetX = caster.x + (dx0 / dist0) * maxRange;
            targetY = caster.y + (dy0 / dist0) * maxRange;
        }
    }

    const impactRadius = 45;
    // Keep meteors within the indicator circle, accounting for their own impact radius
    const spread = Math.max(0, radius - impactRadius);

    for (let i = 0; i < waveCount; i++) {
        // Each wave spawns multiple meteors in the area
        const meteorCount = 3 + i * 2;
        for (let m = 0; m < meteorCount; m++) {
            const offsetAngle = Math.random() * Math.PI * 2;
            const offsetDist = Math.random() * spread;
            const offsetX = Math.cos(offsetAngle) * offsetDist;
            const offsetY = Math.sin(offsetAngle) * offsetDist;

            const hazard = {
                type: 'hazard',
                hazardType: 'meteor',
                x: targetX + offsetX,
                y: targetY + offsetY,
                size: 12,
                damage: Math.round(damage / 6),
                impactRadius,
                delay: 0.2 + i * 0.5 + Math.random() * 0.3,
                lifeTimer: 1,
                alive: true,
                color: '#F44336',
                caster: caster,
            };
            projectilesToAdd.push(hazard);
        }
    }
    shake(10);
}

/**
 * Heal spell (Divine Light)
 */
function executeHeal(caster, config) {
    const healAmount = config.healAmount || 30;
    caster.hp = Math.min(caster.maxHp, caster.hp + healAmount);

    // Heal over time: heals (healAmount * healOverTime) spread over the duration
    if (config.healOverTime && config.hotDuration) {
        const hotPerSec = (healAmount * config.healOverTime) / config.hotDuration;
        addBuff(caster, 'divine_light_hot', config.hotDuration, { hotHealPerSec: hotPerSec }, {});
    }
}

/**
 * Holy Nova — burst damage + heal / burn (Sun Dance)
 */
function executeHolyNova(caster, config, entities) {
    const enemies = entities.filter(e => e.alive && e.type !== 'player');
    const rankMult = getRankDamageMultiplier(caster.spells[caster.castingKey], config);
    const dmg = Math.round((config.damage || 50) * rankMult);

    for (const enemy of enemies) {
        const dx = enemy.x - caster.x;
        const dy = enemy.y - caster.y;
        const dist = Math.hypot(dx, dy);

        if (dist <= config.radius) {
            dealDamage(enemy, dmg, caster);

            // Sun Dance burn effect (applyBurn signature is (target, duration, dps))
            if (config.burnDps && enemy.alive) {
                applyBurn(enemy, config.burnDuration || 4, config.burnDps);
            }
        }
    }

    // Heal self (only if healAmount is defined — Paladin's Holy Nova)
    if (config.healAmount) {
        const heal = config.healAmount;
        caster.hp = Math.min(caster.maxHp, caster.hp + heal);
    }

    shake(8);
}
