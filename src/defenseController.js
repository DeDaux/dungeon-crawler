// defenseController.js — Base Defense game mode logic
// Extracted from main.js; all functions accept state explicitly rather than
// closing over module-level variables.
import { tickEnemyAbilities, tryUseEnemyAbility, processEnemyAoEZones } from './systems/ai.js';
import { spawnFloatText } from './systems/combat.js';
import { isPositionFree } from './systems/movement.js';
import { shake, updateCamera, setFollowTarget, setMapBounds } from './camera.js';
import { updateParticles } from './render/drawEffects.js';
import { tickEntityFrame } from './render/drawEntity.js';
import { spawnPlayer } from './entities/factory.js';
import { resetCombatState, getPendingEnemyProjectiles } from './systems/combat.js';
import { getPendingProjectiles } from './systems/spellcast.js';
import { DungeonMap } from './systems/map.js';
import { BaseDefenseGame } from './systems/baseDefense.js';
import { resetIdCounter } from './entities/factory.js';
import { SPELLS } from './config/spells.js';
import { startBGM } from './audio.js';
import { getDefensePanelButtons } from './render/drawBaseDefense.js';

// ── Pure AI helpers ────────────────────────────────────────────────

/** Apply boss phase scaling in defense mode (mirrors dungeon boss phases). */
export function applyBossEnrage(e) {
    if (!e._bossBaseSpeed) {
        e._bossBaseSpeed = e.baseSpeed || e.speed;
        e._bossBaseAttackDamage = e.baseAttackDamage || e.attackDamage;
        e._bossBaseAttackSpeed = e.attackSpeed || 1;
    }
    const hpPct = e.hp / e.maxHp;
    const phase = hpPct > 0.6 ? 0 : (hpPct > 0.3 ? 1 : 2);
    if (phase === e._bossPhase) return;
    e._bossPhase = phase;
    if (phase === 2) {
        e.baseSpeed = e._bossBaseSpeed * 1.6;
        e.baseAttackDamage = Math.round(e._bossBaseAttackDamage * 1.5);
        e.attackDamage = e.baseAttackDamage;
        e.attackSpeed = Math.min(e._bossBaseAttackSpeed * 1.4, 2.2);
        spawnFloatText(e.x, e.y - (e.size || 40), '🔥 ENRAGED!', '#F44336', 22);
        shake(8);
    } else if (phase === 1) {
        e.baseSpeed = e._bossBaseSpeed * 1.25;
        e.baseAttackDamage = Math.round(e._bossBaseAttackDamage * 1.2);
        e.attackDamage = e.baseAttackDamage;
        spawnFloatText(e.x, e.y - (e.size || 40), '⚡ Enraged!', '#FF9800', 18);
    } else {
        e.baseSpeed = e._bossBaseSpeed;
        e.baseAttackDamage = e._bossBaseAttackDamage;
        e.attackDamage = e.baseAttackDamage;
        e.attackSpeed = e._bossBaseAttackSpeed;
    }
}

/** March each defense enemy along its path toward the base, engaging players
 *  or towers encountered along the way. Replaces updateAI for defense mode. */
export function updateDefenseEnemies(dt, defenseGame, entities, players, map) {
    const base = defenseGame.base;
    const livePlayers = players.filter(p => p && p.alive && !p.disconnected);

    tickEnemyAbilities(entities, dt);

    for (const e of entities) {
        if (!e.alive || e.type !== 'enemy') continue;

        if (e.aiBehavior === 'boss' || e.enemyType === 'boss_dragon') applyBossEnrage(e);

        const baseSpd = e.baseSpeed || e.speed;
        e.speed = Math.max(baseSpd * (1 - (e._towerSlowAmount || 0)), 20);

        if (!e._desperate && e.hp < e.maxHp * 0.25 && Math.hypot(e.x - base.x, e.y - base.y) < 340) {
            e._desperate = true;
        }
        const desperate = e._desperate;
        if (desperate) e.speed *= 1.5;

        const ranged = e.aiBehavior === 'ranged' || e.aiBehavior === 'ranged_magic' || (e.attackRange || 0) > 60;
        const fast = e.aiBehavior === 'fast_chase' || e.aiBehavior === 'flier';
        const atkR = e.attackRange || 30;
        const standoff = ranged ? Math.min(Math.max(atkR * 0.85, 90), 240) : atkR * 0.9;
        const flank = (((e.id * 73) % 100) / 100 - 0.5) * 1.3;

        const aggroRange = Math.max(e.aggroRange || 200, 280);
        let target = null;
        if (desperate) {
            target = null;
        } else if (e._aggroLockedTarget && e._aggroLockedTarget.alive && !e._aggroLockedTarget.disconnected) {
            target = e._aggroLockedTarget;
        } else {
            let best = null, bestD = aggroRange;
            for (const p of livePlayers) {
                const d = Math.hypot(p.x - e.x, p.y - e.y);
                if (d < bestD && map.hasLineOfSight(e.x, e.y, p.x, p.y)) { bestD = d; best = p; }
            }
            target = best;
        }

        if (target) {
            e.attackTarget = target;
            const dx = target.x - e.x, dy = target.y - e.y;
            const d = Math.hypot(dx, dy) || 1;
            const awayAng = Math.atan2(e.y - target.y, e.x - target.x);

            if (ranged) {
                if (d < standoff * 0.7) {
                    e.targetX = e.x + Math.cos(awayAng) * 70;
                    e.targetY = e.y + Math.sin(awayAng) * 70;
                    e.state = 'walk';
                } else if (d > standoff * 1.25) {
                    e.targetX = target.x; e.targetY = target.y; e.state = 'walk';
                } else {
                    if (e._strafe === undefined) e._strafe = (e.id % 2) ? 1 : -1;
                    if (Math.random() < 0.015) e._strafe *= -1;
                    const perp = awayAng + Math.PI / 2 * e._strafe;
                    e.targetX = e.x + Math.cos(perp) * 28;
                    e.targetY = e.y + Math.sin(perp) * 28;
                    e.state = 'walk';
                }
            } else if (d > atkR * 0.9) {
                const aimAng = Math.atan2(dy, dx) + (fast ? flank : 0);
                const aimDist = fast ? atkR * 0.7 : 0;
                e.targetX = target.x - Math.cos(aimAng) * aimDist;
                e.targetY = target.y - Math.sin(aimAng) * aimDist;
                e.state = 'walk';
            } else {
                e.targetX = e.x; e.targetY = e.y; e.state = 'idle';
            }
            e.facing = dx > 0 ? 'right' : 'left';

            if (e.abilities) {
                for (const key of ['r', 'q', 'w', 'e']) {
                    if (tryUseEnemyAbility(e, key, target, entities, dt, map)) break;
                }
            }
            continue;
        }

        e.attackTarget = null;

        if (!desperate && defenseGame.towers.length) {
            let tw = null, twD = Infinity;
            const engage = ranged ? standoff * 1.2 : atkR * 1.5;
            for (const t of defenseGame.towers) {
                if (!t.alive) continue;
                const d = Math.hypot(t.x - e.x, t.y - e.y);
                if (d < engage && d < twD) { twD = d; tw = t; }
            }
            if (tw) {
                e._towerTarget = tw;
                const d = twD || 1;
                if (ranged) {
                    if (d < standoff * 0.7) {
                        const aa = Math.atan2(e.y - tw.y, e.x - tw.x);
                        e.targetX = e.x + Math.cos(aa) * 60; e.targetY = e.y + Math.sin(aa) * 60; e.state = 'walk';
                    } else if (d > standoff * 1.1) {
                        e.targetX = tw.x; e.targetY = tw.y; e.state = 'walk';
                    } else { e.targetX = e.x; e.targetY = e.y; e.state = 'idle'; }
                } else if (d > atkR * 0.9) {
                    e.targetX = tw.x; e.targetY = tw.y; e.state = 'walk';
                } else { e.targetX = e.x; e.targetY = e.y; e.state = 'attack'; }
                e.facing = tw.x > e.x ? 'right' : 'left';
                continue;
            }
        }
        e._towerTarget = null;

        const dBase = Math.hypot(e.x - base.x, e.y - base.y);

        // ── Fire-and-movement: units alternately BOUND forward and HOLD, so the
        // assault advances in rushes (and a held line keeps pressure) rather than
        // one undifferentiated blob. ──
        e._boundT = (e._boundT ?? Math.random() * 2.5) - dt;
        if (e._boundT <= 0) {
            e._holding = !e._holding;
            e._boundT = e._holding ? (0.5 + Math.random() * 0.7) : (1.3 + Math.random() * 1.6);
        }

        // ── Sappers bury mines along the approach to deny ground to the hero. ──
        const sapper = e.enemyType === 'goblin' || e.enemyType === 'necromancer' || e.enemyType === 'skeleton';
        if (sapper && defenseGame.layTrap) {
            e._trapCd = (e._trapCd ?? 3 + Math.random() * 4) - dt;
            if (e._trapCd <= 0 && dBase < 460 && dBase > standoff + 50) {
                defenseGame.layTrap(e.x, e.y, Math.round((e.attackDamage || 10) * 1.4));
                e._trapCd = 7 + Math.random() * 7;
                e.state = 'attack'; e.frame = 0;   // brief crouch-to-plant
            }
        }

        // ── Encirclement: near the base, fan out to a ring slot keyed to the unit
        // id so attackers pincer the crystal from every side at once. ──
        let goalX = base.x, goalY = base.y;
        if (dBase < 240) {
            const ang = ((e.id * 47) % 360) * Math.PI / 180;
            const ring = standoff * 0.85;
            goalX = base.x + Math.cos(ang) * ring;
            goalY = base.y + Math.sin(ang) * ring;
        }

        if (dBase < standoff + 6) {
            e.targetX = e.x; e.targetY = e.y;
            e.state = ranged ? 'idle' : 'attack';
            e.facing = base.x > e.x ? 'right' : 'left';
            continue;
        }

        // Overwatch hold: stand fast (unless desperate) to let others bound up.
        if (e._holding && !desperate && dBase > standoff + 40) {
            e.targetX = e.x; e.targetY = e.y;
            e.state = 'idle';
            e.facing = base.x > e.x ? 'right' : 'left';
            continue;
        }

        if (!e._defensePath) { e.targetX = goalX; e.targetY = goalY; e.state = 'walk'; continue; }
        if (e._defensePathIndex === undefined) e._defensePathIndex = 0;
        const path = e._defensePath;

        let wp = path[e._defensePathIndex];
        while (wp && Math.hypot(wp.x - e.x, wp.y - e.y) < 16 &&
               e._defensePathIndex < path.length - 1) {
            e._defensePathIndex++;
            wp = path[e._defensePathIndex];
        }

        e._defPosT = (e._defPosT || 0) + dt;
        if (e._defPosT >= 0.4) {
            const moved = (e._defPx === undefined) ? 999 : Math.hypot(e.x - e._defPx, e.y - e._defPy);
            if (moved < 4) {
                e._defHardStuck = (e._defHardStuck || 0) + e._defPosT;
                if (e._defHardStuck > 1.5) {
                    for (let k = e._defensePathIndex; k < path.length; k++) {
                        if (isPositionFree(e, path[k].x, path[k].y, map, entities)) {
                            e.x = path[k].x; e.y = path[k].y;
                            e._defensePathIndex = Math.min(k + 1, path.length - 1);
                            break;
                        }
                    }
                    e._defHardStuck = 0;
                }
            } else {
                e._defHardStuck = 0;
            }
            e._defPx = e.x; e._defPy = e.y; e._defPosT = 0;
            wp = path[e._defensePathIndex];
        }

        // Near the base, head straight to the assigned ring slot (encircle);
        // otherwise follow the corridor path toward the crystal.
        if (dBase < 240) { e.targetX = goalX; e.targetY = goalY; }
        else if (wp) { e.targetX = wp.x; e.targetY = wp.y; }
        else { e.targetX = goalX; e.targetY = goalY; }
        e.state = 'walk';
    }
}

// ── Tower UI ────────────────────────────────────────────────────────

/**
 * Handle clicks on tower spots and tower/panel buttons. Returns true if the
 * click was consumed (should not also move/attack the hero).
 *
 * @param {object} defenseGame
 * @param {object} Input — the Input module (with mouseScreenX/Y, mouseWorld, leftClicked)
 * @param {HTMLCanvasElement} canvas
 * @param {boolean} mpIsGuest
 * @param {function} send — network send function
 * @returns {boolean}
 */
export function handleDefenseTowerUI(defenseGame, Input, canvas, mpIsGuest, send) {
    const dg = defenseGame;
    if (!Input.leftClicked) return false;
    const sx = Input.mouseScreenX, sy = Input.mouseScreenY;

    const buttons = getDefensePanelButtons(dg, canvas);
    for (const b of buttons) {
        if (sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h) {
            if (!b.disabled) {
                if (b.kind === 'buy') {
                    const spot = dg.towerSpots[dg.selectedSpotIndex];
                    if (spot) {
                        if (mpIsGuest) send('defAction', { kind: 'build', x: spot.x, y: spot.y, tower: b.id });
                        else dg.placeTower(b.id, dg.selectedSpotIndex);
                    }
                    dg.selectedSpotIndex = null;
                } else if (b.kind === 'upgrade') {
                    if (dg.selectedTower) {
                        if (mpIsGuest) send('defAction', { kind: 'upgrade', x: dg.selectedTower.x, y: dg.selectedTower.y });
                        else { const i = dg.towers.indexOf(dg.selectedTower); if (i >= 0) dg.upgradeTower(i); }
                    }
                } else if (b.kind === 'sell') {
                    if (dg.selectedTower) {
                        if (mpIsGuest) send('defAction', { kind: 'sell', x: dg.selectedTower.x, y: dg.selectedTower.y });
                        else { const i = dg.towers.indexOf(dg.selectedTower); if (i >= 0) dg.sellTower(i); }
                    }
                    dg.selectedTower = null;
                } else if (b.kind === 'close') {
                    dg.selectedSpotIndex = null; dg.selectedTower = null;
                }
            }
            return true;
        }
    }

    const wx = Input.mouseWorld.x, wy = Input.mouseWorld.y;
    const t = dg.getTowerAt(wx, wy);
    if (t) { dg.selectedTower = t.tower; dg.selectedSpotIndex = null; return true; }
    const si = dg.getSpotAt(wx, wy);
    if (si >= 0) { dg.selectedSpotIndex = si; dg.selectedTower = null; return true; }

    if (dg.selectedSpotIndex !== null || dg.selectedTower) {
        dg.selectedSpotIndex = null; dg.selectedTower = null;
    }
    return false;
}

// ── Guest-side defense ──────────────────────────────────────────────

/**
 * Guest-side defense update: predict local champion movement, send inputs to
 * host, render host's world from snapshots.
 */
export function updateDefenseGuest(dt, ctx) {
    const { defenseGame, localPlayer, entities, map } = ctx;
    if (localPlayer) defenseGame.localPlayer = localPlayer;
    updateCamera(dt);

    ctx.mpPingTimer -= dt;
    if (ctx.mpPingTimer <= 0 && ctx.isConnected()) {
        ctx.mpPingTimer = 0.5; ctx.mpLastPingT = performance.now();
        ctx.send('ping', { t: ctx.mpLastPingT });
    }

    if (defenseGame.state === 'lost') { updateParticles(dt); return; }

    const consumedClick = handleDefenseTowerUI(defenseGame, ctx.Input, ctx.canvas, true, ctx.send);
    if (ctx.Input.isKeyPressedThisFrame('escape')) {
        defenseGame.selectedSpotIndex = null; defenseGame.selectedTower = null;
    }

    if (localPlayer) {
        ctx.handleInput(localPlayer, entities, { suppressLeftClick: consumedClick });
        if (localPlayer.alive && localPlayer.castingKey) {
            localPlayer.castingTimer -= dt;
            if (localPlayer.castingTimer <= 0) { localPlayer.state = 'idle'; localPlayer.castingKey = null; localPlayer.castingTimer = 0; }
        }
        if (localPlayer.alive) {
            const tgt = (localPlayer.attackTarget && localPlayer.attackTarget.alive)
                ? localPlayer.attackTarget
                : ((localPlayer.targetX !== null && localPlayer.targetY !== null) ? { x: localPlayer.targetX, y: localPlayer.targetY } : null);
            if (tgt) {
                const dx = tgt.x - localPlayer.x, dy = tgt.y - localPlayer.y;
                const dist = Math.hypot(dx, dy);
                const stopAt = localPlayer.attackTarget ? (localPlayer.attackRange || 28) : 4;
                if (dist > stopAt) {
                    const step = (localPlayer.speed || 120) * dt;
                    localPlayer.x += (dx / dist) * step;
                    localPlayer.y += (dy / dist) * step;
                    localPlayer.state = 'walk';
                    localPlayer.facing = dx > 0 ? 'right' : 'left';
                }
            }
            if (map) {
                const m = 10;
                localPlayer.x = Math.max(m, Math.min(map.width * 32 - m, localPlayer.x));
                localPlayer.y = Math.max(m, Math.min(map.height * 32 - m, localPlayer.y));
            }
        }
    }

    updateParticles(dt);
    for (const e of entities) tickEntityFrame(e, dt);
}

// ── Host-side defense ───────────────────────────────────────────────

/**
 * Authoritative defense tick (host/solo). Runs the hero pipeline, enemy AI,
 * wave/tower/base logic, and relays state to guests.
 *
 * @param {number} dt
 * @param {object} ctx — bundle of shared state (see call site in main.js)
 */
export function updateDefense(dt, ctx) {
    const dg = ctx.defenseGame;
    if (!dg) return;

    if (ctx.mpIsGuest) { updateDefenseGuest(dt, ctx); return; }

    const { localPlayer, entities, players, projectiles, map } = ctx;
    if (!dg.localPlayer) return;

    if (dg.state === 'lost') {
        updateCamera(dt);
        if (!ctx.mpIsHost && ctx.Input.isKeyPressedThisFrame('r')) {
            ctx.initDefenseGame(dg.championId || (localPlayer ? localPlayer.championId : 'orc'));
        }
        if (ctx.mpIsHost && ctx.isConnected()) {
            ctx.mpSnapshotTimer -= dt;
            if (ctx.mpSnapshotTimer <= 0) { ctx.mpSnapshotTimer = 0.05; ctx.sendSnapshot(); }
        }
        return;
    }

    if (ctx.mpIsHost && ctx.mpPendingRemoteInput.length > 0) {
        const pending = ctx.mpPendingRemoteInput;
        ctx.mpPendingRemoteInput = [];
        for (const ri of pending) {
            const pid = ctx.mpGuestPlayers.get(String(ri.from));
            if (pid === undefined) continue;
            const gp = players.find(p => p.id === pid);
            if (gp) ctx.applyRemoteInput(gp, ri);
        }
    }

    const consumedClick = handleDefenseTowerUI(dg, ctx.Input, ctx.canvas, ctx.mpIsGuest, ctx.send);
    if (ctx.Input.isKeyPressedThisFrame('escape')) {
        dg.selectedSpotIndex = null;
        dg.selectedTower = null;
    }

    ctx.handleInput(localPlayer, entities, { suppressLeftClick: consumedClick });
    ctx.tickSpells(players, entities, map, dt);

    updateDefenseEnemies(dt, dg, entities, players, map);
    processEnemyAoEZones(entities, dt);
    ctx.tickSystems(entities, players, projectiles, map, dt, { localPlayer });

    dg.update(dt);

    const respawnList = ctx.mpIsHost ? players : [localPlayer];
    for (const p of respawnList) {
        if (!p) continue;
        if (!p.alive) {
            p._defRespawn = (p._defRespawn ?? 5) - dt;
            if (p._defRespawn <= 0) { respawnDefensePlayer(p, dg); p._defRespawn = 5; }
        } else {
            p._defRespawn = 5;
        }
    }

    if (ctx.mpIsHost && ctx.isConnected()) {
        const soundEvents = ctx.getPendingSoundEvents();
        const floatTexts = ctx.getPendingFloatTexts();
        const shakeAmt = ctx.getPendingShake();
        if (soundEvents.length > 0) ctx._pendingSoundEvents.push(...soundEvents);
        if (floatTexts.length > 0) ctx._pendingFloatTexts.push(...floatTexts);
        if (shakeAmt > 0) ctx._pendingShakeRelay = Math.max(ctx._pendingShakeRelay, shakeAmt);
        ctx.mpSnapshotTimer -= dt;
        if (ctx.mpSnapshotTimer <= 0) { ctx.mpSnapshotTimer = 0.02; ctx.sendSnapshot(); }
    }
}

// ── Actions ─────────────────────────────────────────────────────────

/** Host: apply a guest's tower build/upgrade/sell request. */
export function applyDefenseAction(msg, defenseGame) {
    const dg = defenseGame;
    if (!dg) return;
    if (msg.kind === 'build') {
        const i = dg.towerSpots.findIndex(s => !s.occupied && Math.abs(s.x - msg.x) < 26 && Math.abs(s.y - msg.y) < 26);
        if (i >= 0) dg.placeTower(msg.tower, i);
    } else if (msg.kind === 'upgrade') {
        const t = dg.getTowerAt(msg.x, msg.y);
        if (t) dg.upgradeTower(t.index);
    } else if (msg.kind === 'sell') {
        const t = dg.getTowerAt(msg.x, msg.y);
        if (t) dg.sellTower(t.index);
    }
}

/** Revive a defense-mode hero at the base. */
export function respawnDefensePlayer(p, defenseGame) {
    p.alive = true;
    p.hp = Math.round(p.maxHp * 0.6);
    p.shield = 0;
    p.state = 'idle';
    p.deathTimer = 0;
    p.attackTarget = null;
    p.knockback.vx = 0; p.knockback.vy = 0;
    p.x = defenseGame.base.x + 60;
    p.y = defenseGame.base.y;
    spawnFloatText(p.x, p.y - 44, '✨ Respawned!', '#4CAF50', 18);
}

// ── Init ────────────────────────────────────────────────────────────

/** Initialize a base defense game. */
export function initDefenseGame(championId, ctx) {
    ctx.setPlayersProvider(() => ctx.players);
    ctx.gameState = 'defense';
    ctx.gameMode = 'defense';
    ctx.currentFloor = 1;

    resetIdCounter();
    resetCombatState();
    getPendingProjectiles();
    getPendingEnemyProjectiles();

    ctx.map = new DungeonMap();
    let spawn;
    for (let attempt = 0; attempt < 8; attempt++) {
        ctx.generateFloor(ctx.currentFloor);
        spawn = ctx.map.getPlayerSpawn();
        if (ctx.map.rooms.length >= 2) break;
    }
    setMapBounds(120 * 32, 90 * 32);

    ctx.localPlayer = spawnPlayer(championId);
    ctx.localPlayer.x = spawn.x;
    ctx.localPlayer.y = spawn.y;
    ctx.localPlayer.currentFloor = 1;

    for (const key of ['q', 'w', 'e', 'r']) {
        const spell = ctx.localPlayer.spells[key];
        if (spell) {
            const config = SPELLS[spell.id];
            if (config) {
                spell.maxCooldown = config.cooldown;
                spell.castTime = config.castTime || 0.25;
            }
        }
    }

    ctx.players = [ctx.localPlayer];
    ctx.entities = [ctx.localPlayer];
    ctx.projectiles = [];

    const dg = new BaseDefenseGame(championId, ctx.players, ctx.map, ctx.entities);
    dg.setLocalPlayer(ctx.localPlayer);
    dg.setupArena(ctx.map._playerSpawnRoomIndex);
    dg.gold = 105;
    dg.spawnTimer = 3;   // brief breather before the first attackers arrive

    ctx.localPlayer.x = dg.base.x + 70;
    ctx.localPlayer.y = dg.base.y;

    ctx.defenseGame = dg;

    setFollowTarget(ctx.localPlayer);
    ctx.kills = 0;
    ctx.floorBannerTimer = 0;

    startBGM();
}
