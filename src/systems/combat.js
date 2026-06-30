// combat.js — auto-attacks, damage, knockback, death, XP, gold, lifesteal, crits
import { shake } from '../camera.js';
import { addBuff } from '../entities/buffs.js';
import { addXP } from './leveling.js';
import { playHitSound, playDeathSound, playEnemyAttack, playChampionSfx } from '../audio.js';
import { spawnParticles } from '../render/drawEffects.js';
import { isMultiplayer } from '../network.js';

// Provider for the live players list (set by main.js) so co-op kills can share
// rewards without combat.js importing main.js (which would be circular).
let _getPlayers = null;
export function setPlayersProvider(fn) { _getPlayers = fn; }

// Basic-attack projectile per ranged champion — fired and shown travelling to the
// target (melee champs have attackRange < ~60 and deal instant damage instead).
const BASIC_PROJECTILES = {
    pyro:          { kind: 'fireball', color: '#FF6D00', size: 6, speed: 440 },
    shadow_hunter: { kind: 'arrow',    color: '#E0D5C8', size: 4, speed: 680 },
    ronin:         { kind: 'kunai',    color: '#CFD8DC', size: 4, speed: 560 },
};
const DEFAULT_RANGED_PROJ = { kind: 'bolt', color: '#9C8BFF', size: 5, speed: 500 };

/** Track floating damage numbers */
let _floatingTexts = [];

/** Projectiles fired by ranged enemies, drained by the main loop */
const _enemyProjectiles = [];

/** Sound events queued during this frame's simulation, for relaying to the guest */
let _soundEvents = [];

/** Float-text spawns this frame, for relaying to guests (compact keys). */
let _pendingFloatTexts = [];

export function getFloatingTexts() { return _floatingTexts; }

/** Drain queued float-text spawns (host relays these to guests). */
export function getPendingFloatTexts() {
    const f = _pendingFloatTexts;
    _pendingFloatTexts = [];
    return f;
}

/** Damage flash overlay callback — set by the renderer */
let _onDamageFlash = null;
export function setDamageFlashCallback(fn) { _onDamageFlash = fn; }

/** Queue a sound event so the host can relay it to the guest via snapshot */
export function queueSoundEvent(evt) {
    _soundEvents.push(evt);
}

/** Drain queued sound events (called once per frame by the main loop) */
export function getPendingSoundEvents() {
    const e = _soundEvents;
    _soundEvents = [];
    return e;
}

export function getPendingEnemyProjectiles() {
    const p = [..._enemyProjectiles];
    _enemyProjectiles.length = 0;
    return p;
}

/**
 * Add a projectile to the enemy projectile queue (used by enemy abilities in ai.js)
 */
export function addEnemyProjectile(proj) {
    _enemyProjectiles.push(proj);
}

/** Spawn a floating damage number (also queued for relay to co-op guests) */
export function spawnFloatText(x, y, text, color = '#FFF', size = 16) {
    // Bigger callouts (crits, level-ups, item drops) linger a touch longer.
    const life = size >= 20 ? 1.45 : 1.15;
    // A small sideways drift so stacked popups fan out instead of overlapping.
    const vx = (_floatHash(text) - 0.5) * 26;
    _floatingTexts.push({
        x, y, text, color, size,
        life, maxLife: life,
        vy: -82,          // initial upward speed; decelerates in tickFloatingTexts
        vx,
        seed: _floatHash(text + size), // stable per-popup phase for shimmer
    });
    // Queue compact copy for the host to relay; harmless on guest/solo (drained
    // and discarded by the main loop unless we're the host).
    if (_pendingFloatTexts.length < 40) _pendingFloatTexts.push({ x: ~~x, y: ~~y, t: text, c: color, s: size });
}

/** Cheap deterministic 0..1 hash so popups animate consistently host↔guest. */
function _floatHash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 1000) / 1000;
}

/** Critical hit check (items can raise the base 15% chance) */
function isCrit(attacker) {
    const chance = 0.15 + (attacker && attacker._critBonus ? attacker._critBonus : 0);
    return Math.random() < chance;
}

/** Play the champion's attack sound */
function playChampionAttack(championId) {
    playChampionSfx(championId, 'basic');
}

/** Projectile colors for ranged enemy shots */
const ENEMY_PROJECTILE_COLORS = {
    skeleton: '#D7CCC8',
    necromancer: '#7C4DFF',
    fire_elemental: '#FF6D00',
};

/**
 * Update combat for all entities (auto-attacks)
 */
export function updateCombat(entities, dt, map) {
    for (const entity of entities) {
        // Tick death timer even for dead entities so they get cleaned up
        if (!entity.alive) {
            if (entity.deathTimer > 0) {
                entity.deathTimer -= dt;
            }
            continue;
        }
        if (entity.state === 'death') {
            entity.deathTimer -= dt;
            continue;
        }

        // Tick hit flash
        if (entity.hitFlash) {
            entity.hitFlashTimer -= dt;
            if (entity.hitFlashTimer <= 0) {
                entity.hitFlash = false;
            }
        }

        // Tick attack cooldown
        if (entity.attackCooldown > 0) {
            entity.attackCooldown -= dt;
        }

        // Auto-attack if we have a target
        if (entity.attackTarget && entity.attackTarget.alive) {
            const dx = entity.attackTarget.x - entity.x;
            const dy = entity.attackTarget.y - entity.y;
            const dist = Math.hypot(dx, dy);
            entity.facing = dx > 0 ? 'right' : 'left';

            const hasSight = !map || map.hasLineOfSight(entity.x, entity.y, entity.attackTarget.x, entity.attackTarget.y);

            if (dist <= entity.attackRange && entity.attackCooldown <= 0 && hasSight) {
                // Perform auto-attack
                entity.state = 'attack';
                entity.frame = 0;
                entity.frameTimer = 0;
                entity.attackCooldown = 1 / entity.attackSpeed;

                // Play attack sound
                if (entity.type === 'player') {
                    playChampionAttack(entity.championId);
                    queueSoundEvent({ type: 'championSfx', championId: entity.championId, slot: 'basic' });
                } else {
                    playEnemyAttack(entity.enemyType);
                    queueSoundEvent({ type: 'enemyAttack', enemyType: entity.enemyType });
                }

                // Check for crit
                const critical = isCrit(entity);
                const critMult = critical ? 2.0 : 1.0;
                const damage = Math.round(calculateDamage(entity, entity.attackTarget) * critMult);

                if (entity.type === 'player' && entity.attackRange > 60) {
                    // Ranged hero — fling a champion-specific projectile that travels
                    // to the target (arrow for the marksman, kunai for the ronin, etc.).
                    const cfg = BASIC_PROJECTILES[entity.championId] || DEFAULT_RANGED_PROJ;
                    _enemyProjectiles.push({
                        x: entity.x,
                        y: entity.y - entity.size * 0.3,
                        vx: (dx / dist) * cfg.speed,
                        vy: (dy / dist) * cfg.speed,
                        size: cfg.size,
                        color: cfg.color,
                        kind: cfg.kind,
                        angle: Math.atan2(dy, dx),
                        damage,
                        critical,
                        source: entity,
                        team: 'player',
                        maxRange: entity.attackRange * 1.5,
                        startX: entity.x,
                        startY: entity.y,
                        alive: true,
                    });
                } else if (entity.type !== 'player' && entity.attackRange > 60) {
                    // Ranged enemy: instant damage (no projectile travel time)
                    dealDamage(entity.attackTarget, damage, entity, critical);
                } else {
                    dealDamage(entity.attackTarget, damage, entity, critical);
                    // Apply on-hit effects (from buffs/items)
                    applyOnHitEffects(entity, entity.attackTarget);
                }
            } else if ((dist > entity.attackRange || !hasSight) && entity.type === 'player') {
                // Too far, or a wall blocks the shot — close the distance
                entity.targetX = entity.attackTarget.x;
                entity.targetY = entity.attackTarget.y;
                entity.state = 'walk';
            }
        } else if (entity.attackTarget && !entity.attackTarget.alive) {
            entity.attackTarget = null;
            if (entity.type !== 'player') {
                entity.aiState = 'idle';
            }
        }
    }

    tickFloatingTexts(dt);
}

/** Tick floating damage numbers (called every frame, including on the guest) */
export function tickFloatingTexts(dt) {
    for (let i = _floatingTexts.length - 1; i >= 0; i--) {
        const ft = _floatingTexts[i];
        ft.life -= dt;
        ft.y += ft.vy * dt;
        if (ft.vx) ft.x += ft.vx * dt;
        // Ease out: the popup darts up and gently coasts to a stop above its
        // source (instead of arcing back down), so it reads as a clean callout.
        ft.vy *= Math.max(0, 1 - 4.5 * dt);
        ft.vx *= Math.max(0, 1 - 3 * dt);
        if (ft.life <= 0) {
            _floatingTexts.splice(i, 1);
        }
    }
}

/**
 * Calculate damage from attacker to target
 */
function calculateDamage(attacker, target) {
    let damage = attacker.attackDamage;
    
    // Last Stand: below 20% HP = +40% damage
    if (attacker.type === 'player' && attacker.hp < attacker.maxHp * 0.2) {
        damage *= 1.4;
    }
    
    // Armor reduction
    const effectiveArmor = Math.max(0, target.armor);
    damage = Math.max(1, damage * (100 / (100 + effectiveArmor)));

    // Buff damage multipliers
    for (const buff of attacker.buffs) {
        if (buff.stats.damageMult) {
            damage *= buff.stats.damageMult;
        }
        if (buff.stats.bonusDamage) {
            damage += buff.stats.bonusDamage;
            buff.stats.bonusDamage = 0; // one-time bonus
        }
    }

    return Math.round(damage);
}

/**
 * Deal damage to an entity
 */
export function dealDamage(target, amount, source, critical = false) {
    if (!target.alive) return;

    // Shield absorbs first
    if (target.shield > 0) {
        if (target.shield >= amount) {
            target.shield -= amount;
            amount = 0;
        } else {
            amount -= target.shield;
            target.shield = 0;
        }
    }

    // Dodge chance for player (5% base, only from enemies)
    if (target.type === 'player' && source && source.type !== 'player') {
        const dodgeChance = 0.05 + (target._dodgeBonus || 0);
        if (Math.random() < dodgeChance) {
            spawnFloatText(target.x, target.y - 30, 'DODGE!', '#00BCD4', 18);
            return;
        }
    }

    // Execute check: if source has execute chance and target below 20% HP
    if (source && source._executeChance && source.type === 'player' && target.hp / target.maxHp <= 0.2) {
        if (Math.random() < source._executeChance) {
            amount = target.hp; // kill them
            spawnFloatText(target.x, target.y - 40, '💀 EXECUTED!', '#B71C1C', 22);
        }
    }

    const actualDamage = Math.min(amount, target.hp);
    target.hp -= amount;
    target.hitFlash = true;
    target.hitFlashTimer = 0.1;
    // Reset regen timer on damage taken
    target.lastDamageTimer = 3;

    // Track last damage source for thorns
    if (source) {
        target._lastDamageSource = source;
        target._lastDamage = actualDamage;

        // Permanent aggro: once a player damages this enemy, it must never
        // leash back home or drop the chase until that player dies (ai.js
        // updateAI widens aggro/leash to infinite while this is set).
        if (target.type !== 'player' && source.type === 'player') {
            target._aggroLockedTarget = source;
        }
    }

    // Play hit sound
    if (amount > 0) {
        playHitSound();
        queueSoundEvent({ type: 'hit' });

        // Trigger damage flash overlay when the player takes damage
        if (target.type === 'player' && _onDamageFlash) {
            _onDamageFlash(Math.min(1, amount / 30));
        }
    }

    // Floating damage number
    const dmgText = critical ? `⚡${amount}!` : `${amount}`;
    const dmgColor = critical ? '#FFD700' : (source && source.type === 'player' ? '#FF5252' : '#FF9800');
    const dmgSize = critical ? 22 : 14;
    spawnFloatText(target.x, target.y - target.size * 0.5, dmgText, dmgColor, dmgSize);

    // Knockback
    if (source) {
        const angle = Math.atan2(target.y - source.y, target.x - source.x);
        target.knockback.vx = Math.cos(angle) * 80;
        target.knockback.vy = Math.sin(angle) * 80;

        // Lifesteal for player source
        if (source.type === 'player' && source._lifesteal && source._lifesteal > 0) {
            const healAmount = Math.round(actualDamage * source._lifesteal);
            if (healAmount > 0) {
                source.hp = Math.min(source.maxHp, source.hp + healAmount);
                spawnFloatText(source.x, source.y + 20, `+${healAmount}`, '#4CAF50', 12);
            }
        }

        // Fire touch on-hit burn
        if (source.type === 'player' && source._fireTouch) {
            const ft = source._fireTouch;
            target.burning = true;
            target.burnTimer = Math.max(target.burnTimer || 0, ft.burnDuration);
            target.burnDps = Math.min((target.burnDps || 0) + ft.burnDps, 50);
        }
    }

    // Chain Lightning on crit — push to deferred processing since we don't have entities list here
    if (critical && source && source._chainLightning && source.type === 'player') {
        source._pendingChain = { target, amount };
    }

    // Death
    if (target.hp <= 0) {
        // Phoenix Feather: revive the player once at 50% HP
        if (target.type === 'player' && target._hasRevive) {
            target._hasRevive = false;
            target.hp = Math.round(target.maxHp * 0.5);
            target.shield = 0;
            spawnFloatText(target.x, target.y - 50, '🪶 REBORN!', '#FF6F00', 24);
            shake(10);
            return;
        }

        target.hp = 0;
        target.alive = false;
        target.state = 'death';
        target.deathTimer = 0.8;
        target.attackTarget = null;
        target.targetX = null;
        target.targetY = null;

        // In co-op a player isn't out of the run — they're DOWNED (enemies
        // ignore them via the !alive check) and can be revived by a teammate
        // or on the next floor descent. Solo death is final (handled in main).
        if (target.type === 'player' && isMultiplayer()) {
            target.downed = true;
            target.reviveProgress = 0;
        }

        // Play death sound
        playDeathSound(target);
        queueSoundEvent({ type: 'death', entityType: target.type, championId: target.championId, enemyType: target.enemyType });

        // Grant XP, gold, and kill count. In multiplayer, XP is shared with all
        // living players (no kill-stealing / level divergence) and each player
        // gets their own gold drop; solo is unchanged.
        if (source && source.type === 'player') {
            source.kills = (source.kills || 0) + 1;
            const xpReward = Math.round(target.xpReward || 10);
            const baseGold = Math.round(target.goldReward || 4);

            const recipients = (isMultiplayer() && _getPlayers)
                ? _getPlayers().filter(p => p && p.alive)
                : [source];

            for (const p of recipients) {
                addXP(p, xpReward);
                let g = baseGold;
                if (p._goldMult) g = Math.round(g * p._goldMult);
                p.gold = (p.gold || 0) + g;
            }

            const sourceGold = source._goldMult ? Math.round(baseGold * source._goldMult) : baseGold;
            spawnFloatText(target.x, target.y - target.size * 0.5, `+${sourceGold}g`, '#FFD700', 14);
        }
    }
}

/**
 * Apply on-hit effects from attack buffs
 */
function applyOnHitEffects(attacker, target) {
    for (const buff of attacker.buffs) {
        if (buff.id === 'vanish') {
            // Bonus damage already applied in calculateDamage
            // Remove invisibility on hit
            attacker.invisible = false;
            removeBuffByName(attacker, 'vanish');
        }
    }

    // Frost Axe: slow enemies on hit
    if (attacker._frostSlow && target.alive && target.type !== 'player') {
        if (!target.shadowStrikeSlow) {
            target.speed *= 0.65;
        }
        target.shadowStrikeSlow = Math.max(target.shadowStrikeSlow || 0, 1.2);
    }
}

function removeBuffByName(entity, name) {
    entity.buffs = entity.buffs.filter(b => b.id !== name);
}

/**
 * Apply burning status to an enemy
 */
export function applyBurn(target, duration = 3, dps = 10) {
    target.burning = true;
    target.burnTimer = Math.max(target.burnTimer || 0, duration);
    target.burnDps = Math.min((target.burnDps || 0) + dps, 50);
}

/**
 * Process burn damage over time for all enemies
 */
export function processBurns(entities, dt) {
    for (const entity of entities) {
        if (entity.type === 'player') continue;
        if (!entity.alive) continue;
        // Thorns damage
        if (entity._thornsPercent && entity._lastDamageSource) {
            const thornsDmg = Math.round(entity._lastDamage * entity._thornsPercent);
            if (thornsDmg > 0 && entity._lastDamageSource.alive) {
                dealDamage(entity._lastDamageSource, thornsDmg, null);
            }
            entity._lastDamageSource = null;
            entity._lastDamage = 0;
        }
        if (entity.burning && entity.burnTimer > 0) {
            entity.burnTimer -= dt;
            // Accumulate fractional damage — per-frame amounts round to 0 otherwise
            entity._burnAccum = (entity._burnAccum || 0) + (entity.burnDps || 10) * dt;
            if (entity._burnAccum >= 1) {
                const dmg = Math.floor(entity._burnAccum);
                entity._burnAccum -= dmg;
                dealDamage(entity, dmg, null);
            }
            if (entity.burnTimer <= 0) {
                entity.burning = false;
                entity.burnDps = 0;
                entity._burnAccum = 0;
            }
        }
    }
}

/** Reset combat state (called on new game) */
export function resetCombatState() {
    _floatingTexts = [];
    _enemyProjectiles.length = 0;
    _soundEvents = [];
    _pendingFloatTexts = [];
}
