// simulation.js — shared per-frame simulation tick for dungeon and defense modes
import { updateCombat, processBurns, getPendingEnemyProjectiles, dealDamage, spawnFloatText } from './systems/combat.js';
import { updateMovement } from './systems/movement.js';
import { updateBuffs, addBuff } from './entities/buffs.js';
import { updateCamera } from './camera.js';
import { updateParticles } from './render/drawEffects.js';
import { tickEntityFrame } from './render/drawEntity.js';
import { updateProjectiles } from './systems/projectiles.js';
import { getPendingProjectiles, executeSpell } from './systems/spellcast.js';

/**
 * Tick spell casts, cooldowns, and shield decay for every player.
 * Called identically by dungeon and defense modes.
 */
export function tickSpells(players, entities, map, dt) {
    for (const p of players) {
        // Complete any in-progress spell cast
        if (p.alive && p.castingKey) {
            p.castingTimer -= dt;
            if (p.castingTimer <= 0) {
                executeSpell(p, entities, map);
            }
        }
        // Tick spell cooldowns
        for (const key of ['q', 'w', 'e', 'r']) {
            const spell = p.spells[key];
            if (spell && spell.cooldown > 0) {
                spell.cooldown = Math.max(0, spell.cooldown - dt);
            }
        }
        // Tick temporary shield decay
        if (p.shieldTimer > 0) {
            p.shieldTimer -= dt;
            if (p.shieldTimer <= 0) {
                p.shield = 0;
                p.shieldTimer = 0;
            }
        }
    }
}

/**
 * Shared systems tick — called identically by dungeon and defense modes after
 * their respective AI step (updateAI / updateDefenseEnemies).
 *
 * @param {object[]} entities
 * @param {object[]} players
 * @param {object[]} projectiles
 * @param {object} map
 * @param {number} dt
 * @param {object} [opts]
 * @param {object} [opts.localPlayer] — for player-specific item/regen effects
 */
export function tickSystems(entities, players, projectiles, map, dt, opts = {}) {
    const localPlayer = opts.localPlayer || null;

    updateCombat(entities, dt, map);
    processBurns(entities, dt);
    updateMovement(entities, map, dt);
    for (const p of players) {
        if (p.alive) updateBuffs(p, dt);
    }
    updateCamera(dt);
    updateParticles(dt);
    tickPlayerRegen(players, dt);
    tickItemEffects(localPlayer, entities, dt);

    // Tick entity animation frames
    for (const entity of entities) {
        tickEntityFrame(entity, dt);
    }

    // Process projectiles
    updateProjectiles(projectiles, entities, map, dt);

    // Collect projectiles queued by spells and ranged enemies
    for (const proj of getPendingProjectiles()) projectiles.push(proj);
    for (const proj of getPendingEnemyProjectiles()) projectiles.push(proj);

    // Tick the damage flash overlay
    if (_tickDamageFlashFn) _tickDamageFlashFn(dt);
}

// Late-binding to avoid circular import: set by main.js
let _tickDamageFlashFn = null;
export function setTickDamageFlash(fn) { _tickDamageFlashFn = fn; }

/**
 * Out-of-combat HP regeneration for all players.
 */
export function tickPlayerRegen(players, dt) {
    for (const p of players) {
        if (!p || !p.alive) continue;
        if (p.lastDamageTimer > 0) {
            p.lastDamageTimer -= dt;
            continue;
        }
        if (p.hp >= p.maxHp) continue;
        const regenPerSec = p.maxHp * (0.01 + (p._regenBonus || 0));
        p._regenAccum = (p._regenAccum || 0) + regenPerSec * dt;
        if (p._regenAccum >= 1) {
            const heal = Math.floor(p._regenAccum);
            p._regenAccum -= heal;
            p.hp = Math.min(p.maxHp, p.hp + heal);
        }
    }
}

/**
 * Tick item-driven effects for a player (scrolls, auras, Cloak of Shadows).
 */
export function tickItemEffects(player, entities, dt) {
    if (!player || !player.alive) return;

    // Pending AoE damage scroll
    if (player._pendingAoE) {
        const { damage, range } = player._pendingAoE;
        player._pendingAoE = null;
        for (const e of entities) {
            if (e.type === 'player' || !e.alive) continue;
            if (Math.hypot(e.x - player.x, e.y - player.y) <= range) {
                dealDamage(e, damage, player);
            }
        }
    }

    // Pending AoE heal scroll
    if (player._pendingAoEHeal) {
        const { heal } = player._pendingAoEHeal;
        player._pendingAoEHeal = null;
        player.hp = Math.min(player.maxHp, player.hp + heal);
        spawnFloatText(player.x, player.y - 30, `+${heal}`, '#4CAF50', 16);
    }

    // Damage auras
    let auraDps = 0, auraRange = 0;
    if (player._stormAura) {
        auraDps += player._stormAura.dps;
        auraRange = Math.max(auraRange, player._stormAura.range);
    }
    for (const buff of player.buffs || []) {
        if (buff.stats && buff.stats.poisonAura) {
            auraDps += buff.stats.poisonAura;
            auraRange = Math.max(auraRange, 100);
        }
    }
    if (auraDps > 0 && auraRange > 0) {
        player._auraAccum = (player._auraAccum || 0) + auraDps * dt;
        if (player._auraAccum >= 1) {
            const dmg = Math.floor(player._auraAccum);
            player._auraAccum -= dmg;
            for (const e of entities) {
                if (e.type === 'player' || !e.alive || e._isChest) continue;
                if (Math.hypot(e.x - player.x, e.y - player.y) <= auraRange) {
                    dealDamage(e, dmg, null);
                }
            }
        }
    }

    // Cloak of Shadows
    if (player._shadowCloak) {
        player._cloakTimer = (player._cloakTimer || 0) - dt;
        if (player._cloakTimer <= 0) {
            player._cloakTimer = 30;
            addBuff(player, 'shadow_cloak', 3, {}, { invisible: true });
            spawnFloatText(player.x, player.y - 40, '🌑 Cloaked', '#B39DDB', 14);
        }
    }
}
