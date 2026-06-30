// main.js — game loop orchestrator for multi-floor dungeon crawl
// Supports solo play and host-authoritative multiplayer (Phase 1)
import { getCanvas, getCtx, tick, Engine } from './engine.js';
import { Input, pollSpellKeys, setHoveredEntity, setClickedEntity } from './input.js';
import { Camera, setFollowTarget, setMapBounds, updateCamera, shake, getPendingShake } from './camera.js';
import { CHAMPIONS } from './config/champions.js';
import { SPELLS } from './config/spells.js';
import { getEnemyPoolForFloor } from './config/enemies.js';
import { spawnPlayer, spawnEnemy, spawnChest, applyChestLoot, resetIdCounter } from './entities/factory.js';
import { updateBuffs, addBuff } from './entities/buffs.js';
import { DungeonMap } from './systems/map.js';
import { updateMovement, findNearestEnemy, setMoveTarget, attackMove, isPositionFree } from './systems/movement.js';
import { updateAI, tickEnemyAbilities, tryUseEnemyAbility, processEnemyAoEZones } from './systems/ai.js';
import { updateCombat, dealDamage, processBurns, resetCombatState, getFloatingTexts, getPendingEnemyProjectiles, spawnFloatText, tickFloatingTexts, getPendingSoundEvents, getPendingFloatTexts, setPlayersProvider, queueSoundEvent, setDamageFlashCallback } from './systems/combat.js';
import { tryCastSpell, getPendingProjectiles, executeSpell } from './systems/spellcast.js';
import { catchUpToLevel } from './systems/leveling.js';
import { updateProjectiles } from './systems/projectiles.js';
import { BaseDefenseGame } from './systems/baseDefense.js';
import { getTowerConfig, getTowerRange } from './config/towers.js';
import { drawDefenseWorld, drawDefenseHUD, drawDefensePanel, drawBaseDefenseGameOver } from './render/drawBaseDefense.js';
import {
    updateDefense,
    applyDefenseAction,
    initDefenseGame as initDefGame,
} from './defenseController.js';
import { render, tickDamageFlash, triggerDamageFlash, triggerJumpScare } from './render/renderer.js';
import { updateParticles, spawnDeathParticles, spawnParticles } from './render/drawEffects.js';
import { tickEntityFrame } from './render/drawEntity.js';
import { showChampionSelect, showGameOver } from './screens/champSelect.js';
import { showModeSelect } from './screens/modeSelect.js';
import { preloadSprites, isPreloadDone } from './manifest.js';
import { isShopOpen, openShop, drawShop, handleShopInput } from './screens/shop.js';
import { applyItemEffect } from './config/items.js';
import { initAudio, startBGM, playMenuClick, toggleMute, isMuted, playSoundEvent, startHorrorAmbience, updateHorrorAudio, playJumpScare } from './audio.js';
import { tickSpells, tickSystems, setTickDamageFlash } from './simulation.js';
import { getRole, isConnected, isMultiplayer, connect, send, on, off, getSelfId, isP2P, disconnect as mpDisconnect } from './network.js';

const canvas = getCanvas();
const ctx = getCtx();

// -- GAME STATE --
let gameState = 'menu'; // menu | playing | gameOver | defense
let gameMode = 'dungeon'; // dungeon | defense
let localPlayer = null;  // the locally-controlled player entity
let defenseGame = null;   // base defense game instance (when gameMode === 'defense')
let players = [];        // all player entities (local + remote in MP)
let entities = [];
let projectiles = [];
let map = null;
let currentFloor = 1;

let kills = 0;
let roomsCleared = 0;
let floorTransition = false; // true when waiting for stair input

// Shop interaction
let shopTriggered = false;
let shopKeyPressed = false;

// Floor announcement banner ("Floor 3", fades out)
let floorBannerTimer = 0;

// Double-tap rank-up tracking for spell keys
const _lastSpellKeyTime = {};
const DOUBLE_TAP_WINDOW = 0.35; // seconds

// Player fields that shop purchases can affect — synced from guest to host
// after closing the shop so the host's authoritative copy reflects the buy.
const SHOP_SYNC_FIELDS = [
    'gold', 'inventory', 'hp', 'maxHp', 'shield', 'shieldTimer', 'skillPoints',
    'attackDamage', 'baseAttackDamage', 'armor', '_baseArmor', 'speed', 'baseSpeed',
    'attackSpeed', 'baseAttackSpeed', '_thornsPercent', '_cdr', '_regenBonus',
    '_dodgeBonus', '_lifesteal', '_critBonus', '_fireTouch', '_shadowCloak',
    '_stormAura', '_frostSlow', '_chainLightning', '_goldMult', '_executeChance',
    '_hasRevive', 'spellVamp', 'itemTags', 'attackMinRange',
];

/** Snapshot of a player's shop-affectable state, for syncing guest purchases to host */
function serializeShopState(player) {
    const state = {};
    for (const field of SHOP_SYNC_FIELDS) {
        if (field in player) state[field] = player[field];
    }
    state.buffs = (player.buffs || []).map(b => ({ id: b.id, duration: b.duration, maxDuration: b.maxDuration, stats: b.stats, flags: b.flags }));
    state.spells = {
        q: player.spells.q ? { cooldown: player.spells.q.cooldown } : null,
        w: player.spells.w ? { cooldown: player.spells.w.cooldown } : null,
        e: player.spells.e ? { cooldown: player.spells.e.cooldown } : null,
        r: player.spells.r ? { cooldown: player.spells.r.cooldown } : null,
    };
    return state;
}

// ── Defense controller context ──
// Bundles all mutable state the defense controller functions need.
function _defCtx() {
    return {
        get defenseGame() { return defenseGame; },
        set defenseGame(v) { defenseGame = v; },
        get entities() { return entities; },
        set entities(v) { entities = v; },
        get players() { return players; },
        set players(v) { players = v; },
        get projectiles() { return projectiles; },
        set projectiles(v) { projectiles = v; },
        get map() { return map; },
        set map(v) { map = v; },
        get localPlayer() { return localPlayer; },
        set localPlayer(v) { localPlayer = v; },
        get gameState() { return gameState; },
        set gameState(v) { gameState = v; },
        get gameMode() { return gameMode; },
        set gameMode(v) { gameMode = v; },
        get currentFloor() { return currentFloor; },
        set currentFloor(v) { currentFloor = v; },
        get kills() { return kills; },
        set kills(v) { kills = v; },
        get floorBannerTimer() { return floorBannerTimer; },
        set floorBannerTimer(v) { floorBannerTimer = v; },
        mpIsHost,
        mpIsGuest,
        get mpGuestPlayers() { return mpGuestPlayers; },
        get mpPendingRemoteInput() { return mpPendingRemoteInput; },
        set mpPendingRemoteInput(v) { mpPendingRemoteInput = v; },
        get mpSnapshotTimer() { return mpSnapshotTimer; },
        set mpSnapshotTimer(v) { mpSnapshotTimer = v; },
        mpPingTimer,
        mpLastPingT,
        _pendingSoundEvents,
        _pendingFloatTexts,
        _pendingShakeRelay,
        Input,
        canvas,
        isConnected,
        send,
        applyRemoteInput,
        handleInput,
        tickSpells: (p, e, m, d) => tickSpells(p, e, m, d),
        tickSystems: (e, p, pr, m, d, o) => tickSystems(e, p, pr, m, d, o),
        getPendingSoundEvents,
        getPendingFloatTexts,
        getPendingShake,
        sendSnapshot,
        generateFloor,
        setPlayersProvider,
        initDefenseGame: (cid) => initDefGame(cid, _defCtx()),
    };
}

// ── Multiplayer state ──
let mpIsHost = false;
let mpIsGuest = false;
let mpSnapshotTimer = 0;          // host sends snapshots every N seconds
let mpPendingRemoteInput = [];    // guest input queued for host processing
let mpGuestPlayers = new Map();  // host: peerId -> guest player entity id
let mpSelfId = null;             // guest: our own peer id (to find our player)
let mpLobbyPlayerCount = 1;      // host: party size, for scaling floor 1 before guests spawn
let mpLastSnapshot = null;       // last received snapshot (on guest)
let mpLastSnapshotTime = 0;      // perf time the last snapshot arrived (on guest)
let mpRtt = 0;                   // guest: measured round-trip time to host (ms)
let mpPingTimer = 0;             // guest: countdown to next ping
let mpLastPingT = 0;             // guest: timestamp of the outstanding ping

// ── Exposed for host snapshot serialisation ──
export function getLocalPlayer() { return localPlayer; }
export function getPlayers() { return players; }
export function getEntities() { return entities; }
export function getMap() { return map; }
export function getCurrentFloor() { return currentFloor; }
export function getProjectiles() { return projectiles; }

/** Generate a single floor */
function generateFloor(floorNumber) {
    const mapWorldWidth = 120 * 32;   // was 80 — 50% wider
    const mapWorldHeight = 90 * 32;   // was 60 — 50% taller

    // More rooms on every floor: baseline 8–12, scaling with depth
    const roomCount = 8 + Math.floor(Math.random() * 5) + Math.floor(floorNumber / 2);

    map.generate(mapWorldWidth, mapWorldHeight, roomCount, floorNumber);
    setMapBounds(mapWorldWidth, mapWorldHeight);
}

/** Co-op scaling: more (and slightly tougher) enemies the bigger the party. */
function coopPartySize() {
    return Math.max(1, players.length, mpLobbyPlayerCount);
}
function coopEnemyHpMul() {
    return 1 + (coopPartySize() - 1) * 0.25; // +25% enemy HP per extra player
}
/** Spawn an enemy and apply the co-op HP scale. */
function spawnScaledEnemy(type, x, y, floorNumber) {
    const enemy = spawnEnemy(type, x, y, map, floorNumber);
    const mul = coopEnemyHpMul();
    if (mul > 1) {
        enemy.maxHp = Math.round(enemy.maxHp * mul);
        enemy.hp = enemy.maxHp;
    }
    return enemy;
}

/** Spawn enemies for current floor */
function spawnFloorEnemies(floorNumber) {
    const pool = getEnemyPoolForFloor(floorNumber);
    // getEnemySpawnPoints() already excludes the player's spawn room, so the
    // room the player starts in stays empty — a safe moment before the hunt.
    const spawnPoints = map.getEnemySpawnPoints();
    const countMul = 1 + (coopPartySize() - 1) * 0.5; // +50% enemy count per extra player

    // Spawn enemies in other rooms + chests
    for (const sp of spawnPoints) {
        const baseCount = 2 + Math.floor(Math.random() * 3) + Math.floor(floorNumber / 3);
        const enemyCount = Math.round(baseCount * countMul);
        for (let i = 0; i < enemyCount; i++) {
            const type = pool[Math.floor(Math.random() * pool.length)];
            const offsetX = (Math.random() - 0.5) * 80;
            const offsetY = (Math.random() - 0.5) * 80;
            const enemy = spawnScaledEnemy(type, sp.x + offsetX, sp.y + offsetY, floorNumber);
            entities.push(enemy);
        }
        // ~30% chance of a chest per room
        if (Math.random() < 0.3 && !sp.isFirstRoom) {
            const chestX = sp.x + (Math.random() - 0.5) * 50;
            const chestY = sp.y + (Math.random() - 0.5) * 50;
            entities.push(spawnChest(chestX, chestY, floorNumber));
        }
    }

    // Boss floor (every 5th floor) gets extra boss in the boss arena if one exists
    if (floorNumber % 5 === 0) {
        // Prefer the boss arena room (special shape), else the last room
        const arenaRoom = map.bossArenaRoom
            ? map.rooms[map.bossArenaRoom]
            : map.rooms[map.rooms.length - 1];
        if (arenaRoom) {
            const bx = (arenaRoom.x + Math.floor(arenaRoom.w / 2)) * 32;
            const by = (arenaRoom.y + Math.floor(arenaRoom.h / 2)) * 32;
            const dragon = spawnScaledEnemy('boss_dragon', bx, by, floorNumber);
            // Boss in arena gets more HP for a real fight
            dragon.maxHp = Math.round(dragon.maxHp * 1.5);
            dragon.hp = dragon.maxHp;
            entities.push(dragon);
            // Extra minions in the arena
            const minionCount = 3 + Math.floor(floorNumber / 2);
            for (let m = 0; m < minionCount; m++) {
                const mx = bx + (Math.random() - 0.5) * 120;
                const my = by + (Math.random() - 0.5) * 120;
                const pool = getEnemyPoolForFloor(floorNumber);
                const type = pool[Math.floor(Math.random() * pool.length)];
                entities.push(spawnScaledEnemy(type, mx, my, floorNumber));
            }
        }
    }
}

/** Initialize the game (solo or host) */
function initGame(championId) {
    // Let combat.js read the live players list for co-op shared rewards.
    setPlayersProvider(() => players);
    setDamageFlashCallback((intensity) => triggerDamageFlash(intensity));
    setTickDamageFlash((dt) => tickDamageFlash(dt));
    gameState = 'playing';
    currentFloor = 1;
    floorTransition = false;
    shopTriggered = false;
    shopKeyPressed = false;

    resetIdCounter();
    resetCombatState();
    getPendingProjectiles(); // drain any spell projectiles left over from a previous run
    getPendingEnemyProjectiles();

    map = new DungeonMap();
    generateFloor(currentFloor);

    const spawn = map.getPlayerSpawn();
    localPlayer = spawnPlayer(championId);
    localPlayer.x = spawn.x;
    localPlayer.y = spawn.y;
    localPlayer.currentFloor = currentFloor;

    for (const key of ['q', 'w', 'e', 'r']) {
        const spell = localPlayer.spells[key];
        if (spell) {
            const config = SPELLS[spell.id];
            if (config) {
                spell.maxCooldown = config.cooldown;
                spell.castTime = config.castTime || 0.25;
            }
        }
    }

    players = [localPlayer];
    entities = [localPlayer];
    projectiles = [];

    spawnFloorEnemies(currentFloor);
    setFollowTarget(localPlayer);

    kills = 0;
    roomsCleared = 0;
    floorBannerTimer = 2.5;

    // Start background music + the looping horror dread bed.
    startBGM();
    startHorrorAmbience();
}

/** Deseed to the next floor */
function descendFloor() {
    // In co-op the descend may be triggered by a guest while the host's own
    // player is downed, so allow it as long as ANY player is still standing.
    if (!localPlayer || !players.some(p => p.alive)) return;

    currentFloor++;
    floorTransition = false;
    shopTriggered = false;

    // Clean up old entities (keep all players)
    entities = [...players];

    // Reset player positions
    map = new DungeonMap();
    generateFloor(currentFloor);

    const spawn = map.getPlayerSpawn();
    for (const p of players) {
        p.x = spawn.x + (Math.random() - 0.5) * 60;
        p.y = spawn.y + (Math.random() - 0.5) * 60;
        p.currentFloor = currentFloor;
        // Reaching a new floor revives any downed teammates at partial HP.
        if (p.downed) revivePlayer(p, false);
    }
    // Ensure localPlayer gets the spawn point
    localPlayer.x = spawn.x;
    localPlayer.y = spawn.y;

    // Fresh projectiles
    projectiles = [];
    getPendingProjectiles();
    getPendingEnemyProjectiles();
    spawnFloorEnemies(currentFloor);
    setFollowTarget(localPlayer);
    floorBannerTimer = 2.5;

    // Host: the guest's map is now stale — resend it along with a fresh snapshot
    if (mpIsHost && isConnected()) {
        send('mapData', map.toSnapshot());
        sendSnapshot();
    }
}

// ── Co-op downed / revive ──
const REVIVE_RADIUS = 90;   // a living teammate this close revives a downed one
const REVIVE_TIME = 3;      // seconds of proximity to fully revive
const RECONNECT_GRACE = 30; // seconds a disconnected player's character is kept

/** Host: expire the grace window of disconnected players who never returned. */
function updateDisconnects(dt) {
    let removed = false;
    for (const p of players) {
        if (!p.disconnected) continue;
        p._dcTimer = (p._dcTimer || 0) - dt;
        if (p._dcTimer <= 0) {
            const id = p.id;
            players = players.filter(x => x.id !== id);
            entities = entities.filter(x => x.id !== id);
            for (const [pid, eid] of mpGuestPlayers) if (eid === id) mpGuestPlayers.delete(pid);
            removed = true;
        }
    }
    if (removed) _forceFullSnap = true;
}

/** Host: progress revives for any downed players with a living teammate nearby. */
function updateRevives(dt) {
    for (const p of players) {
        if (!p.downed || p.disconnected) continue;
        let reviver = null;
        for (const o of players) {
            if (o === p || !o.alive || o.disconnected) continue;
            if (Math.hypot(o.x - p.x, o.y - p.y) < REVIVE_RADIUS) { reviver = o; break; }
        }
        if (reviver) {
            p.reviveProgress = Math.min(1, (p.reviveProgress || 0) + dt / REVIVE_TIME);
            if (p.reviveProgress >= 1) revivePlayer(p, true);
        } else if (p.reviveProgress) {
            p.reviveProgress = Math.max(0, p.reviveProgress - dt / REVIVE_TIME);
        }
    }
}

/** Bring a downed player back at partial HP. */
function revivePlayer(p, celebrate) {
    p.alive = true;
    p.downed = false;
    p.reviveProgress = 0;
    p.hp = Math.max(1, Math.round(p.maxHp * 0.4));
    p.state = 'idle';
    p.deathTimer = 0;
    p.attackTarget = null;
    spawnFloatText(p.x, p.y - 50, '✨ REVIVED!', '#4CAF50', 22);
    if (celebrate) queueSoundEvent({ type: 'levelUp' });
}

/** End the run for everyone. On the host this also tells the guests so the
 *  whole party sees the same game-over / victory screen at the same time. */
function endRun(victory) {
    gameState = 'gameOver';
    if (mpIsHost && isConnected()) {
        sendSnapshot();              // flush final world state
        send('gameOver', { victory });
    }
    showGameOver(localPlayer ? localPlayer.championId : '', {
        kills: localPlayer ? (localPlayer.kills || 0) : 0,
        floor: currentFloor,
        gold: localPlayer ? (localPlayer.gold || 0) : 0,
        victory,
    });
}

/** How many living players are standing on the stairs (for the descend gate). */
function stairsReadyCount() {
    const living = players.filter(p => p.alive);
    const on = living.filter(p => map && map.isOnStairs(p.x, p.y)).length;
    return { on, total: living.length };
}

/** Attempt to descend. Solo descends immediately; in co-op the whole party must
 *  be standing on the stairs together so no one is yanked mid-fight or mid-shop.
 *  Returns true if the descent actually happened. */
function requestDescend(requester) {
    if (!requester || !requester.alive || !map || !map.isOnStairs(requester.x, requester.y)) return false;
    if (!mpIsHost) { descendFloor(); return true; } // solo
    const { on, total } = stairsReadyCount();
    if (total > 0 && on === total) { descendFloor(); return true; }
    return false;
}

/** Toggle mute if the sound indicator (top-right corner) was left-clicked.
 *  Shared by dungeon and defense modes so the on-screen control works in both. */
function handleMuteClick() {
    if (!Input.leftClicked) return;
    const mx = Input.mouseScreenX;
    const my = Input.mouseScreenY;
    if (mx >= canvas.width - 70 && mx <= canvas.width - 10 && my >= 10 && my <= 34) {
        toggleMute();
    }
}

/** Update — routes to either dungeon crawl or base defense game logic */
function update(dt) {
    // The mute indicator is drawn in both modes; handle its click in both.
    if (gameState === 'playing' || gameState === 'defense') handleMuteClick();

    if (gameState === 'defense') {
        updateDefense(dt, _defCtx());
        Input.resetFrame();
        return;
    }
    if (gameState !== 'playing') return;

    // ── Run-end checks (host & solo are authoritative; a guest waits for the
    // host's explicit 'gameOver' message so the whole party transitions together) ──
    if (mpIsHost) {
        // Co-op: the run only ends when EVERY connected player is down. A downed
        // player can be revived by a teammate or on the next floor descent.
        updateRevives(dt);
        updateDisconnects(dt);
        const present = players.filter(p => !p.disconnected);
        if (present.length && present.every(p => !p.alive)) { endRun(false); return; }
        if (currentFloor > 10 && players.some(p => p.alive)) { endRun(true); return; }
    } else if (!mpIsGuest) {
        // Solo
        if (localPlayer && !localPlayer.alive) { endRun(false); return; }
        if (localPlayer && currentFloor > 10 && localPlayer.alive) { endRun(true); return; }
    }

    // ── Guest mode: local movement prediction + snapshot reconciliation ──
    if (mpIsGuest) {
        updateCamera(dt);

        // Measure round-trip latency to the host (~2 Hz) for the HUD indicator.
        mpPingTimer -= dt;
        if (mpPingTimer <= 0 && isConnected()) {
            mpPingTimer = 0.5;
            mpLastPingT = performance.now();
            send('ping', { t: mpLastPingT });
        }

        // Handle local input (sends actions to host)
        handleInput(localPlayer, entities);

        // Tick local cast timer for instant visual feedback
        if (localPlayer && localPlayer.alive && localPlayer.castingKey) {
            localPlayer.castingTimer -= dt;
            if (localPlayer.castingTimer <= 0) {
                localPlayer.state = 'idle';
                localPlayer.castingKey = null;
                localPlayer.castingTimer = 0;
            }
        }

        // ── PREDICT local player movement right away ──
        // This eliminates the RTT lag: the player moves immediately on click,
        // and the host authority will correct us if we drift.
        if (localPlayer && localPlayer.alive) {
            // Save pre-movement position (for detecting when prediction overshoots)
            localPlayer._lastSnapshotX = localPlayer._lastSnapshotX || localPlayer.x;
            localPlayer._lastSnapshotY = localPlayer._lastSnapshotY || localPlayer.y;

            // Run local movement prediction for our player only
            const prevX = localPlayer.x;
            const prevY = localPlayer.y;

            // Temporarily set local walkable-move on the map (we don't have
            // pathfinding on the guest — just direct movement toward target)
            if (localPlayer.targetX !== null && localPlayer.targetY !== null) {
                const dx = localPlayer.targetX - localPlayer.x;
                const dy = localPlayer.targetY - localPlayer.y;
                const dist = Math.hypot(dx, dy);
                if (dist > 4) {
                    const speed = localPlayer.speed || 120;
                    const step = speed * dt;
                    localPlayer.x += (dx / dist) * step;
                    localPlayer.y += (dy / dist) * step;
                    localPlayer.state = 'walk';
                    localPlayer.facing = dx > 0 ? 'right' : 'left';
                }
            }

            // Attack target — move toward it until in range
            if (localPlayer.attackTarget && localPlayer.attackTarget.alive) {
                const atkDist = Math.hypot(
                    localPlayer.attackTarget.x - localPlayer.x,
                    localPlayer.attackTarget.y - localPlayer.y
                );
                if (atkDist > (localPlayer.attackRange || 28)) {
                    const speed = localPlayer.speed || 120;
                    const step = speed * dt;
                    const dx = localPlayer.attackTarget.x - localPlayer.x;
                    const dy = localPlayer.attackTarget.y - localPlayer.y;
                    const d = Math.hypot(dx, dy);
                    localPlayer.x += (dx / d) * step;
                    localPlayer.y += (dy / d) * step;
                    localPlayer.state = 'walk';
                    localPlayer.facing = dx > 0 ? 'right' : 'left';
                } else {
                    localPlayer.state = 'idle';
                }
            }

            // Keep player within map bounds (rough check)
            if (map) {
                const tileSize = 32;
                const margin = 10;
                localPlayer.x = Math.max(margin, Math.min(map.width * tileSize - margin, localPlayer.x));
                localPlayer.y = Math.max(margin, Math.min(map.height * tileSize - margin, localPlayer.y));
            }

            localPlayer._predictedX = localPlayer.x;
            localPlayer._predictedY = localPlayer.y;
        }

        // Stairs / shop interaction (guest acts on their own local map copy,
        // descend is relayed to the host since it affects the whole party;
        // shop purchases are applied locally then synced to the host on close)
        if (localPlayer && localPlayer.alive && map && !isShopOpen()) {
            if (map.isOnStairs(localPlayer.x, localPlayer.y)) {
                if (Input.isKeyPressedThisFrame('f') || Input.isKeyPressedThisFrame(' ')) {
                    send('input', { descend: true });
                }
            } else if (map.isOnShop(localPlayer.x, localPlayer.y)) {
                if ((Input.isKeyPressedThisFrame('f') || Input.isKeyPressedThisFrame(' ')) && !shopKeyPressed) {
                    shopKeyPressed = true;
                    const before = JSON.stringify(serializeShopState(localPlayer));
                    openShop(currentFloor).then(() => {
                        shopKeyPressed = false;
                        const after = serializeShopState(localPlayer);
                        if (JSON.stringify(after) !== before && isConnected()) {
                            send('input', { shopSync: after });
                        }
                    });
                }
            }
        }

        // ── Render OTHER entities at their *projected* current position ──
        // Dead-reckoning: extrapolate along last-known velocity (capped) so a
        // moving entity appears where it actually is now, not ~one snapshot
        // behind, then lerp toward that to stay smooth between 50 Hz updates.
        const lerpT = Math.min(1, 22 * dt);
        const nowMs = performance.now();
        for (const e of entities) {
            if (e === localPlayer) continue; // local player uses prediction
            if (e._targetX === undefined) continue;
            let tx = e._targetX, ty = e._targetY;
            if ((e._vx || e._vy) && e.alive) {
                const ahead = Math.min(0.12, (nowMs - (e._lastTargetTime || nowMs)) / 1000);
                tx += e._vx * ahead;
                ty += e._vy * ahead;
            }
            e.x += (tx - e.x) * lerpT;
            e.y += (ty - e.y) * lerpT;
        }

        // ── Reconcile our predicted player with the host's authoritative position ──
        // Small drift is corrected gently (invisible); a large gap (e.g. host
        // blocked us on a wall or knockback) snaps so we don't desync the sim.
        if (localPlayer && localPlayer._targetX !== undefined) {
            const dx = localPlayer._targetX - localPlayer.x;
            const dy = localPlayer._targetY - localPlayer.y;
            const drift = Math.hypot(dx, dy);
            if (drift > 120) {
                localPlayer.x = localPlayer._targetX;
                localPlayer.y = localPlayer._targetY;
            } else if (drift > 2) {
                const k = Math.min(1, 6 * dt);
                localPlayer.x += dx * k;
                localPlayer.y += dy * k;
            }
        }

        // Tick entity animations
        for (const entity of entities) {
            tickEntityFrame(entity, dt);
        }

        // Tick death timers on dead entities (host does this in updateCombat;
        // the guest must do it locally so corpses shrink/fade and get cleaned up).
        for (const entity of entities) {
            if (!entity.alive && entity.type !== 'player' && entity.deathTimer > 0) {
                entity.deathTimer -= dt;
            }
        }

        // Remove non-player dead entities whose death timer expired (the host
        // already cleaned them up server-side and won't include them in future
        // snapshots, so we must clean them up locally too).
        for (let i = entities.length - 1; i >= 0; i--) {
            const e = entities[i];
            if (e.type !== 'player' && !e.alive && e.deathTimer <= 0) {
                entities.splice(i, 1);
            }
        }

        updateParticles(dt);
        tickFloatingTexts(dt);
        renderFrame();
        Input.resetFrame();
        return;
    }

    // ── Handle local input — parameterised for solo or MP host ──
    handleInput(localPlayer, entities);

    // Tick spell casts, cooldowns, and shield decay for all players
    tickSpells(players, entities, map, dt);

    // ── Host: process queued remote input, routed to each guest's player ──
    if (mpIsHost && mpPendingRemoteInput.length > 0) {
        const pending = mpPendingRemoteInput;
        mpPendingRemoteInput = [];
        for (const ri of pending) {
            const playerId = mpGuestPlayers.get(String(ri.from));
            if (playerId === undefined) continue;
            const guestPlayer = players.find(p => p.id === playerId);
            if (!guestPlayer) continue;
            // A guest requests descent — only succeeds when the whole party is
            // on the stairs (validated against the host's authoritative pos).
            if (ri.descend) {
                if (requestDescend(guestPlayer)) return; // state rebuilt; stop
                continue;                                 // not all ready — keep going
            }
            applyRemoteInput(guestPlayer, ri);
        }
    }

    updateAI(entities, players, dt, map);

    // ── Enemy ability system ──
    tickEnemyAbilities(entities, dt);
    // Each enemy AI tick also includes ability usage in the behavior functions
    // Process AoE ground zones (lava pools)
    processEnemyAoEZones(entities, dt);
    // Handle enemy slow/debuff timers on the player
    updatePlayerDebuffs(dt);

    // Shared simulation pipeline (combat, burns, movement, buffs, camera,
    // particles, regen, items, animations, projectiles)
    tickSystems(entities, players, projectiles, map, dt, { localPlayer });

    updateCoopCamera();  // host: spectate a teammate while downed

    // Tick chest loot text timers (so they show above the dead chest for 3 seconds)
    for (const entity of entities) {
        if (entity._lootTextTimer > 0) {
            entity._lootTextTimer -= dt;
        }
    }

    // Drain this frame's relay buffers (sounds, float text, shake). Always
    // drain so they never accumulate in solo/guest; only buffer for sending
    // when we're the host.
    const soundEvents = getPendingSoundEvents();
    const floatTexts = getPendingFloatTexts();
    const shakeAmt = getPendingShake();
    if (mpIsHost && isConnected()) {
        if (soundEvents.length > 0) _pendingSoundEvents.push(...soundEvents);
        if (floatTexts.length > 0) _pendingFloatTexts.push(...floatTexts);
        if (shakeAmt > 0) _pendingShakeRelay = Math.max(_pendingShakeRelay, shakeAmt);
    }

    // Handle chain lightning from combat (for localPlayer)
    if (localPlayer && localPlayer._pendingChain) {
        const { target, amount } = localPlayer._pendingChain;
        localPlayer._pendingChain = null;
        const chainTargets = entities.filter(e =>
            e.type !== 'player' && e.alive && e !== target &&
            Math.hypot(e.x - target.x, e.y - target.y) < 120
        );
        for (const ct of chainTargets) {
            const chainDmg = Math.round(amount * 0.6);
            dealDamage(ct, chainDmg, localPlayer, false);
        }
    }

    // Death mark handling
    for (const entity of entities) {
        if (entity.mark && entity.alive) {
            entity.mark.expireTimer -= dt;
            if (entity.mark.expireTimer <= 0) {
                const storedDmg = Math.round(entity.mark.storedDamage * entity.mark.storedPercent);
                const totalDmg = entity.mark.baseDamage + storedDmg;
                dealDamage(entity, totalDmg, localPlayer);
                entity.mark = null;
            }
        }
    }

    if (localPlayer && localPlayer.alive) {
        for (const entity of entities) {
            if (entity.mark && entity.mark.casterId === localPlayer.id && entity.hitFlash) {
                entity.mark.storedDamage += 5;
            }
        }
    }

    // Show stair hint
    if (localPlayer && map.isOnStairs(localPlayer.x, localPlayer.y)) {
        if (!floorTransition) {
            floorTransition = true;
        }
        if (Input.isKeyPressedThisFrame('f') || Input.isKeyPressedThisFrame(' ')) {
            if (requestDescend(localPlayer)) return;
        }
    }

    // Shop interaction
    if (localPlayer && map.isOnShop(localPlayer.x, localPlayer.y)) {
        if (!shopTriggered) {
            shopTriggered = true;
        }
        if (Input.isKeyPressedThisFrame('f') || Input.isKeyPressedThisFrame(' ')) {
            if (!shopKeyPressed) {
                shopKeyPressed = true;
                openShop(currentFloor).then(() => {
                    shopKeyPressed = false;
                });
            }
        }
    }

    // Slime split on death (passive_summon ability)
    function handleSlimeSplit(e) {
        if (e.enemyType === 'slime' && e.abilities && e.abilities.e && e.abilities.e.config.type === 'passive_summon') {
            // Spawn 2 small slimes
            for (let i = 0; i < 2; i++) {
                const angle = (Math.PI * 2 / 2) * i + Math.random() * 0.5;
                const spawnDist = 20 + Math.random() * 20;
                const sx = e.x + Math.cos(angle) * spawnDist;
                const sy = e.y + Math.sin(angle) * spawnDist;
                const smallSlime = spawnEnemy('slime', sx, sy, map, currentFloor);
                if (smallSlime) {
                    smallSlime.name = 'Small Slime';
                    smallSlime.hp = Math.max(1, Math.round(e.maxHp * 0.35));
                    smallSlime.maxHp = smallSlime.hp;
                    smallSlime.size = 20;
                    smallSlime.attackDamage = Math.round(e.attackDamage * 0.6);
                    smallSlime.attackRange = 22;
                    smallSlime.speed = e.speed * 1.2;
                    smallSlime.baseSpeed = smallSlime.speed;
                    smallSlime.xpReward = Math.round(e.xpReward * 0.5);
                    smallSlime.goldReward = Math.round(e.goldReward * 0.3);
                    smallSlime.attackTarget = e.attackTarget || null;
                    smallSlime.aiState = 'chase';
                    smallSlime._isSplit = true;
                    // Remove passive_summon ability from split slimes (so they don't split again)
                    if (smallSlime.abilities && smallSlime.abilities.e) {
                        delete smallSlime.abilities.e;
                    }
                    entities.push(smallSlime);
                }
            }
            spawnParticles(e.x, e.y, '#2E7D32', 12, 80, 0.5, 4);
            spawnFloatText(e.x, e.y - 30, '💥 SPLIT!', '#4CAF50', 16);
        }
    }

    // Death VFX
    for (const e of entities) {
        if (!e.alive && !e._deathFxDone && e.type !== 'player') {
            e._deathFxDone = true;
            handleSlimeSplit(e);
            spawnDeathParticles(e);
        }
    }

    // Clean dead entities (keep chests around while loot text is showing)
    let deadCount = 0;
    for (let i = 0; i < entities.length; i++) {
        const e = entities[i];
        if (!e.alive && e.deathTimer <= 0 && e.type !== 'player') {
            if (e._isChest && localPlayer && localPlayer.alive) {
                // Apply loot only once
                if (!e._lootApplied) {
                    e._lootApplied = true;
                    const loot = applyChestLoot(localPlayer, e);
                    if (loot) {
                        e._lootTextItems = [];
                        if (loot.gold > 0) {
                            e._lootTextItems.push({ text: `+${loot.gold} Gold`, color: '#FFD700', size: 16 });
                        }
                        if (loot.itemName) {
                            e._lootTextItems.push({ text: loot.itemName, color: '#4FC3F7', size: 16 });
                        }
                        e._lootTextTimer = 3.0;
                    }
                }
            }
            deadCount++;
        }
    }
    if (deadCount > 0) {
        // Keep chests with active loot text around until the timer expires
        entities = entities.filter(e => 
            e.type === 'player' || 
            e.alive || 
            e.deathTimer > 0 || 
            (e._isChest && e._lootTextTimer > 0)
        );
    }

    // ── Host: send snapshots to the guest at ~50 Hz ──
    // The guest renders at full RAF (100 fps) and interpolates between these,
    // so 50 Hz position updates already look perfectly smooth while keeping
    // relay traffic and CPU low. (Heavy/rare fields self-throttle to 5 Hz.)
    if (mpIsHost && isConnected()) {
        mpSnapshotTimer -= dt;
        if (mpSnapshotTimer <= 0) {
            mpSnapshotTimer = 0.02; // ~50 snapshots/sec
            sendSnapshot();
        }
    }

    updateHorrorAtmosphere(dt);

    Input.resetFrame();
}

/**
 * Drive the horror audio + jump-scares from how close the hunting champions are.
 * The drone swells, the heartbeat races, whispers creep in, and when one closes
 * to striking distance it lunges out of the dark with a scare.
 */
let _jumpScareCd = 0;
function updateHorrorAtmosphere(dt) {
    _jumpScareCd -= dt;
    if (!localPlayer || !localPlayer.alive) { updateHorrorAudio(0, 0, dt); return; }
    let nearest = Infinity, hunting = 0;
    for (const e of entities) {
        if (!e.alive || !e._hunter) continue;
        if (e.attackTarget !== localPlayer && e.aiState !== 'chase') continue;
        hunting++;
        const d = Math.hypot(e.x - localPlayer.x, e.y - localPlayer.y);
        if (d < nearest) nearest = d;
    }
    const prox = nearest < 420 ? 1 - nearest / 420 : 0;
    updateHorrorAudio(prox, hunting, dt);

    // A hunter reaching striking range bursts out of the darkness.
    if (hunting > 0 && nearest < 74 && _jumpScareCd <= 0) {
        _jumpScareCd = 6.5;
        triggerJumpScare();
        playJumpScare();
        shake(30);
    }
}

/** Apply remote input to a guest player entity (on host) */
function applyRemoteInput(playerEntity, inputData) {
    if (!playerEntity) return;

    // Sync shop purchases made on the guest's client back onto the
    // authoritative (host-side) copy of the guest's player entity.
    if (inputData.shopSync) {
        const sync = inputData.shopSync;
        for (const field of SHOP_SYNC_FIELDS) {
            if (field in sync) playerEntity[field] = sync[field];
        }
        if (sync.buffs) playerEntity.buffs = sync.buffs;
        if (sync.spells) {
            for (const key of ['q', 'w', 'e', 'r']) {
                if (playerEntity.spells[key] && sync.spells[key]) {
                    playerEntity.spells[key].cooldown = sync.spells[key].cooldown;
                }
            }
        }
    }

    if (!playerEntity.alive) return;

    if (inputData.rightClick) {
        const tx = inputData.targetX, ty = inputData.targetY;
        // Find nearest enemy as attack target
        let nearest = null, nearestDist = Infinity;
        for (const e of entities) {
            if (e.type === 'player' || !e.alive) continue;
            const d = Math.hypot(e.x - tx, e.y - ty);
            if (d < nearestDist && d < 48) { nearestDist = d; nearest = e; }
        }
        if (nearest) {
            playerEntity.attackTarget = nearest;
            playerEntity.targetX = null;
            playerEntity.targetY = null;
            playerEntity.state = 'idle';
        } else {
            playerEntity.targetX = tx;
            playerEntity.targetY = ty;
            playerEntity.attackTarget = null;
            playerEntity.state = 'walk';
        }
    }

    // Spell keys
    if (inputData.spellKey) {
        const key = inputData.spellKey;
        const spell = playerEntity.spells[key];
        if (inputData.rankUp) {
            const champ = CHAMPIONS[playerEntity.championId];
            const spellIndex = { q: 0, w: 1, e: 2, r: 3 }[key];
            const spellId = champ ? champ.spells[spellIndex] : null;
            if (!spell && spellId) {
                const config = SPELLS[spellId];
                playerEntity.spells[key] = {
                    id: spellId, key: key,
                    cooldown: 0, maxCooldown: config ? config.cooldown : 5,
                    castTime: config ? config.castTime : 0.25, rank: 1,
                };
            } else if (spell) {
                spell.rank = (spell.rank || 1) + 1;
            }
            playerEntity.skillPoints--;
        } else if (spell && !playerEntity.state.startsWith('cast')) {
            tryCastSpell(playerEntity, key, inputData.mouseX, inputData.mouseY, entities);
        }
    }
}

/** Handle player debuffs from enemy abilities (slow, etc.) */
function updatePlayerDebuffs(dt) {
    for (const p of players) {
        if (!p || !p.alive) continue;
        // Slow duration from enemy skills
        if (p._enemySlowTimer > 0) {
            p._enemySlowTimer -= dt;
            if (p._enemySlowTimer <= 0) {
                p._enemySlowTimer = 0;
                p.speed = p.baseSpeed;
            }
        }
        // Stun timer
        if (p.aiStunTimer > 0) {
            p.aiStunTimer -= dt;
            if (p.aiStunTimer <= 0) {
                p.aiStunTimer = 0;
            }
        }
    }
}

/** Handle player input — parameterised for localPlayer */
function handleInput(playerEntity, entityList, opts) {
    if (!playerEntity || !playerEntity.alive) return;
    if (isShopOpen()) return;
    // Base Defense: when a left-click was consumed by the tower UI, don't also
    // let it select an enemy as an attack target.
    const suppressLeftClick = !!(opts && opts.suppressLeftClick);

    // Spell key handling
    pollSpellKeys();
    if (Input.spellKey) {
        const key = Input.spellKey;
        const spell = playerEntity.spells[key];

        const now = Engine.time;
        const lastPress = _lastSpellKeyTime[key] || 0;
        const isDoubleTap = (now - lastPress) < DOUBLE_TAP_WINDOW;
        _lastSpellKeyTime[key] = isDoubleTap ? 0 : now;

        const wantsRankUp = !spell || isDoubleTap;
        const canRankUp = playerEntity.skillPoints > 0 && wantsRankUp && (!spell || (spell.rank || 1) < 5);

        if (mpIsGuest && isConnected()) {
            // ── Guest: send the intent to the host (authoritative), but also
            // predict the cast locally for instant visual feedback (state,
            // facing, and the cast-target indicator) — the next snapshot will
            // reconcile/overwrite these fields once the host processes it.
            const mouseWorld = Input.mouseWorld;
            send('input', {
                spellKey: key,
                mouseX: mouseWorld.x,
                mouseY: mouseWorld.y,
                rightClick: false,
                targetX: 0,
                targetY: 0,
                rankUp: canRankUp,
            });

            if (!canRankUp && spell && spell.cooldown <= 0 && !playerEntity.state.startsWith('cast')) {
                const spellConfig = SPELLS[spell.id];
                playerEntity.state = 'cast' + key.toUpperCase();
                playerEntity.castingKey = key;
                playerEntity.castingTimer = (spellConfig && spellConfig.castTime) || 0.25;
                playerEntity.facing = mouseWorld.x > playerEntity.x ? 'right' : 'left';
                playerEntity.castingTargetX = mouseWorld.x;
                playerEntity.castingTargetY = mouseWorld.y;
                // Predict the cooldown immediately so the spell icon updates
                // without waiting for the host's next rare-field sync.
                spell.cooldown = spell.maxCooldown;
            }
        } else if (canRankUp) {
            const champ = CHAMPIONS[playerEntity.championId];
            const spellIndex = { q: 0, w: 1, e: 2, r: 3 }[key];
            const spellId = champ ? champ.spells[spellIndex] : null;
            if (!spell && spellId) {
                const config = SPELLS[spellId];
                playerEntity.spells[key] = {
                    id: spellId, key: key,
                    cooldown: 0, maxCooldown: config ? config.cooldown : 5,
                    castTime: config ? config.castTime : 0.25, rank: 1,
                };
            } else if (spell) {
                spell.rank = (spell.rank || 1) + 1;
            }
            playerEntity.skillPoints--;
            playMenuClick();
        } else if (spell && !playerEntity.state.startsWith('cast')) {
            const mouseWorld = Input.mouseWorld;
            tryCastSpell(playerEntity, key, mouseWorld.x, mouseWorld.y, entityList);
        }
    }

    if (playerEntity.state.startsWith('cast')) return;

    // Entity hit-testing
    let hoveredEntity = null;
    {
        const mouseWorld = Input.mouseWorld;
        for (let i = entityList.length - 1; i >= 0; i--) {
            const e = entityList[i];
            if (!e.alive || e.type === 'player') continue;
            if (Math.abs(mouseWorld.x - e.x) < e.size && Math.abs(mouseWorld.y - e.y) < e.size) {
                hoveredEntity = e;
                break;
            }
        }
        setHoveredEntity(hoveredEntity);
        if (Input.leftClicked && hoveredEntity && !suppressLeftClick) {
            setClickedEntity(hoveredEntity);
        }
    }

    // Right-click
    if (Input.rightClicked && hoveredEntity && hoveredEntity.type !== 'player' && !hoveredEntity._isChest) {
        playerEntity.attackTarget = hoveredEntity;
        playerEntity.targetX = null;
        playerEntity.targetY = null;
        playerEntity.state = 'idle';
        for (const e of entityList) e.isTargeted = false;
        hoveredEntity.isTargeted = true;

        // ── Guest: relay the attack order so the host actually engages ──
        // (host resolves rightClick at this position to the nearest enemy)
        if (mpIsGuest && isConnected()) {
            send('input', {
                spellKey: null,
                mouseX: 0, mouseY: 0,
                rightClick: true,
                targetX: hoveredEntity.x,
                targetY: hoveredEntity.y,
            });
        }
    } else if (Input.rightClicked) {
        const target = Input.rightClickTarget;
        if (map && !map.isWorldWalkable(target.x, target.y)) {
            const { tx, ty } = map.worldToTile(target.x, target.y);
            let bestDist = Infinity, bestX = target.x, bestY = target.y;
            for (let dy = -3; dy <= 3; dy++) {
                for (let dx = -3; dx <= 3; dx++) {
                    const nx = tx + dx, ny = ty + dy;
                    if (map.isWalkable(nx, ny)) {
                        const wx = nx * 32 + 16, wy = ny * 32 + 16;
                        const d = Math.hypot(wx - target.x, wy - target.y);
                        if (d < bestDist) { bestDist = d; bestX = wx; bestY = wy; }
                    }
                }
            }
            target.x = bestX;
            target.y = bestY;
        }
        playerEntity.targetX = target.x;
        playerEntity.targetY = target.y;
        playerEntity.attackTarget = null;
        playerEntity.state = 'walk';
        playerEntity.facing = target.x > playerEntity.x ? 'right' : 'left';

        // ── Guest: send move input to host ──
        if (mpIsGuest && isConnected()) {
            send('input', {
                spellKey: null,
                mouseX: 0,
                mouseY: 0,
                rightClick: true,
                targetX: target.x,
                targetY: target.y,
            });
        }
    }

    if (Input.clickedEntity) {
        playerEntity.attackTarget = Input.clickedEntity;
        playerEntity.state = 'idle';
        playerEntity.targetX = null;
        playerEntity.targetY = null;
        for (const e of entityList) e.isTargeted = false;
        Input.clickedEntity.isTargeted = true;
    }

    if (Input.isAttackMove) {
        const target = Input.attackMoveTarget;
        attackMove(playerEntity, target.x, target.y, entityList);
    }

    if (playerEntity.attackTarget && !playerEntity.attackTarget.alive) {
        playerEntity.attackTarget.isTargeted = false;
        playerEntity.attackTarget = null;
    }

    // Mute toggle
    if (Input.isKeyPressedThisFrame('m')) {
        toggleMute();
    }

    // Consumable slots 1-8
    for (let i = 1; i <= 8; i++) {
        if (Input.isKeyPressedThisFrame(String(i))) {
            const slot = i - 1;
            const item = playerEntity.inventory[slot];
            if (item) {
                applyItemEffect(playerEntity, item);
                playerEntity.inventory[slot] = null;
                spawnFloatText(playerEntity.x, playerEntity.y - 30, `${item.icon || ''} ${item.name} used`, '#4FC3F7', 14);
            }
        }
    }
}

/** Render */
function renderFrame() {
    if (gameState === 'defense') {
        if (!defenseGame || !defenseGame.localPlayer || !map) {
            ctx.fillStyle = '#0a0a12';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            return;
        }
        // Identical dungeon render: tiles + hero + enemies (sprites) + projectiles
        // + particles + the normal player HUD.
        render(entities, projectiles, map, localPlayer);
        // World-space defense overlay (base crystal, build spots, towers, range
        // rings, tower projectiles) — applies the camera transform internally.
        drawDefenseWorld(ctx, defenseGame);
        // Screen-space: wave/gold/base strip + the contextual tower panel.
        drawDefenseHUD(ctx, defenseGame);
        drawDefensePanel(ctx, defenseGame);
        drawBaseDefenseGameOver(ctx, defenseGame);
        drawMuteIndicator();
        return;
    }

    if (gameState === 'playing') {
        // Guard: don't render until map and localPlayer are available
        if (!map || !localPlayer) {
            ctx.fillStyle = '#0a0a12';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            return;
        }
        render(entities, projectiles, map, localPlayer);

        // Draw shop overlay
        if (isShopOpen()) {
            ctx.save();
            drawShop(ctx, localPlayer);
            ctx.restore();
        }
        drawInteractionHints();
        drawMuteIndicator();
        drawNetIndicator();
        drawFloorBanner();
    }
}

/** Draw a small multiplayer transport indicator (P2P vs relay + snapshot age). */
function drawNetIndicator() {
    if (!isMultiplayer() || !isConnected()) return;
    const p2p = isP2P();
    let label = p2p ? '🟢 P2P' : '🟡 RELAY';
    if (mpIsGuest && mpRtt) label += `  ${mpRtt}ms`;
    // Colour the latency: green good, amber mediocre, red bad.
    let col = p2p ? '#8BC34A' : '#FFC107';
    if (mpIsGuest && mpRtt) col = mpRtt < 60 ? '#8BC34A' : mpRtt < 130 ? '#FFC107' : '#FF5252';
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(canvas.width - 140, 40, 130, 22);
    ctx.fillStyle = col;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, canvas.width - 75, 56);
    ctx.textAlign = 'start';
    ctx.restore();
}

/** Draw "Floor N" banner */
function drawFloorBanner() {
    if (floorBannerTimer <= 0) return;
    floorBannerTimer -= Engine.dt;
    const alpha = Math.min(1, floorBannerTimer / 0.8);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#d4a84b';
    ctx.font = 'bold 42px serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 8;
    ctx.fillText(`— Floor ${currentFloor} —`, canvas.width / 2, canvas.height * 0.25);
    if (currentFloor % 5 === 0) {
        ctx.font = 'bold 18px serif';
        ctx.fillStyle = '#e53935';
        ctx.fillText('A powerful presence stirs...', canvas.width / 2, canvas.height * 0.25 + 32);
    }
    ctx.restore();
}

/** Draw mute/unmute indicator */
function drawMuteIndicator() {
    if (!localPlayer) return;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(canvas.width - 70, 10, 60, 24);
    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(isMuted() ? '🔇 Muted' : '🔊 Sound', canvas.width - 40, 27);
    ctx.textAlign = 'start';
}

/** Draw hints for stairs/shop */
function drawInteractionHints() {
    if (!localPlayer || !localPlayer.alive) return;

    if (map.isOnStairs(localPlayer.x, localPlayer.y)) {
        ctx.textAlign = 'center';
        if (isMultiplayer()) {
            // Co-op: the whole party must gather on the stairs to descend.
            const { on, total } = stairsReadyCount();
            const ready = on === total;
            ctx.fillStyle = ready ? '#FFD700' : '#FFB74D';
            ctx.font = 'bold 18px sans-serif';
            ctx.fillText(ready ? '▼ PRESS [F] TO DESCEND TOGETHER ▼'
                               : `Waiting for the party… ${on}/${total} on the stairs`,
                canvas.width / 2, canvas.height / 2 - 60);
        } else {
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 18px sans-serif';
            ctx.fillText('▼ DESCEND TO NEXT FLOOR [F] ▼', canvas.width / 2, canvas.height / 2 - 60);
        }
        ctx.textAlign = 'start';
    }
    if (map.isOnShop(localPlayer.x, localPlayer.y) && !isShopOpen()) {
        ctx.fillStyle = '#CE93D8';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('💰 OPEN SHOP [F] 💰', canvas.width / 2, canvas.height / 2 - 100);
        ctx.textAlign = 'start';
    }
}

/** Game loop */
function gameLoop(timestamp) {
    try {
        tick(timestamp);
        update(Engine.dt);
        renderFrame();
    } catch (e) {
        console.error('Game loop error:', e);
        if (localPlayer) {
            localPlayer.state = 'idle';
            localPlayer.castingKey = null;
            localPlayer.castingTimer = 0;
        }
    }
    requestAnimationFrame(gameLoop);
}

// Keyboard listener
document.addEventListener('keydown', (e) => {
    if (isShopOpen() && localPlayer) {
        handleShopInput(localPlayer, e.code, Input.mouseScreenX, Input.mouseScreenY, false);
    }
});

// Mouse click listener
document.addEventListener('click', (e) => {
    if (isShopOpen() && localPlayer) {
        handleShopInput(localPlayer, null, e.clientX, e.clientY, true);
    }
});

async function start() {
    initAudio();

    const mainMenu = document.getElementById('mainMenu');
    const champSelect = document.getElementById('champSelect');
    const mpLobby = document.getElementById('mpLobby');

    // Show main menu, hide others
    mainMenu.style.display = 'flex';
    champSelect.style.display = 'none';
    mpLobby.style.display = 'none';
    document.getElementById('gameOver').style.display = 'none';

    // Wait for a menu button click
    const choice = await new Promise((resolve) => {
        const soloBtn = document.getElementById('soloBtn');
        const mpBtn = document.getElementById('multiplayerBtn');

        soloBtn.onclick = () => resolve('solo');
        mpBtn.onclick = () => resolve('multiplayer');
    });

    if (choice === 'solo') {
        // Solo mode: pick a game mode, then a champion, then start
        mainMenu.style.display = 'none';
        const mode = await showModeSelect('Select Game Mode');
        if (mode === null) { start(); return; } // back → main menu
        const preloadPromise = preloadSprites();
        const championId = await showChampionSelect();
        await preloadPromise;
        if (mode === 'baseDefense') {
            initDefGame(championId, _defCtx());
        } else {
            initGame(championId);
        }
        requestAnimationFrame(gameLoop);
    } else {
        // Multiplayer mode: show multiplayer lobby
        mainMenu.style.display = 'none';
        const { showMultiplayerLobby, showMpChampSelect, showMpWaiting, hideMpLobby } = await import('./screens/mpLobby.js');
        const mpResult = await showMultiplayerLobby();

        if (!mpResult) {
            // User cancelled / went back — restart
            start();
            return;
        }

        const { role, wsUrl } = mpResult;

        if (role === 'host') {
            await startMultiplayerHost(wsUrl, { showMpChampSelect, showMpWaiting, hideMpLobby });
        } else {
            await startMultiplayerGuest(wsUrl, { showMpChampSelect, showMpWaiting, hideMpLobby });
        }
    }
}


/** Spawn a guest's player character and register the peer→id map. */
function spawnGuestPlayer(peerId, guestChampionId, token) {
    const guestPlayer = spawnPlayer(guestChampionId);
    guestPlayer._token = token || null;

    // Spawn at the floor's designated (walkable) spawn point rather than on top
    // of the host's current position, which could be mid-combat or in a wall.
    const spawn = map.getPlayerSpawn();
    guestPlayer.x = spawn.x + (Math.random() - 0.5) * 60;
    guestPlayer.y = spawn.y + (Math.random() - 0.5) * 60;
    const { tx, ty } = map.worldToTile(guestPlayer.x, guestPlayer.y);
    if (!map.isWalkable(tx, ty)) { guestPlayer.x = spawn.x; guestPlayer.y = spawn.y; }
    guestPlayer.currentFloor = currentFloor;

    // Initialize spells for guest
    for (const key of ['q', 'w', 'e', 'r']) {
        const spell = guestPlayer.spells[key];
        if (spell) {
            const config = SPELLS[spell.id];
            if (config) {
                spell.maxCooldown = config.cooldown;
                spell.castTime = config.castTime || 0.25;
            }
        }
    }

    // Late join into a game in progress: catch the new player up to the party
    // (average level of living teammates) so they aren't instantly killed and
    // a liability — they still start with no gold/items.
    if (gameState === 'playing') {
        const livingLevels = players.filter(p => p.alive && p.level).map(p => p.level);
        if (livingLevels.length) {
            const avg = Math.round(livingLevels.reduce((a, b) => a + b, 0) / livingLevels.length);
            if (avg > 1) catchUpToLevel(guestPlayer, avg);
            guestPlayer.gold = Math.min(...players.filter(p => p.alive).map(p => p.gold || 0));
        }
    }

    players.push(guestPlayer);
    entities.push(guestPlayer);
    mpGuestPlayers.set(String(peerId), guestPlayer.id);
    // The next snapshot must be a full resync so the new guest (and any
    // existing ones) receive every entity's one-time + rare fields.
    _forceFullSnap = true;
}

/** Remove a disconnected guest's player from the world. */
function removeGuestPlayer(peerId) {
    const pid = mpGuestPlayers.get(String(peerId));
    if (pid === undefined) return;
    mpGuestPlayers.delete(String(peerId));
    players = players.filter(p => p.id !== pid);
    entities = entities.filter(e => e.id !== pid);
    // The reassignment above creates a NEW array — keep the defense controller
    // pointing at the same list it spawns enemies into.
    if (defenseGame) defenseGame.entities = entities;
}


// ── Multiplayer: host session ──
// Host connects, picks a champion, then waits in a lobby for any number of
// guests to join and pick their champions before starting the shared game.
export async function startMultiplayerHost(wsUrl, lobby) {
    initAudio();
    await connect(wsUrl, 'host');
    mpIsHost = true;

    // peerId -> championId / token chosen by each guest (before the game starts)
    const guestChampions = new Map();
    const guestTokens = new Map();
    let waitCtrl = null;

    const readyCount = () => guestChampions.size;
    const refreshLobby = () => {
        if (!waitCtrl) return;
        const n = readyCount();
        if (n > 0) {
            waitCtrl.setStatus(`${n} player${n > 1 ? 's' : ''} ready`);
            waitCtrl.enableStart();
        } else {
            waitCtrl.setStatus('');
        }
    };

    on('peerJoined', () => {
        if (waitCtrl) waitCtrl.setStatus('Player joined! Waiting for them to pick a champion...');
    });

    on('champSelect', (msg) => {
        if (!msg.championId) return;
        const peerId = String(msg.from);
        const token = msg.token || null;
        if (gameState === 'playing' || gameState === 'defense') {
            // Reconnect: re-bind to the existing (frozen) character for this token.
            if (token) {
                const existing = players.find(p => p._token === token);
                if (existing) {
                    existing.disconnected = false;
                    existing._dcTimer = 0;
                    // Drop any stale peerId still pointing at this entity so a
                    // late 'peerLeft' for the old connection can't re-disconnect it.
                    for (const [pid, eid] of mpGuestPlayers) if (eid === existing.id) mpGuestPlayers.delete(pid);
                    mpGuestPlayers.set(peerId, existing.id);
                    _forceFullSnap = true;
                    send('mapData', { ...map.toSnapshot(), mode: gameMode });
                    return;
                }
            }
            // Fresh late join after the game already started — spawn immediately.
            spawnGuestPlayer(peerId, msg.championId, token);
            send('mapData', { ...map.toSnapshot(), mode: gameMode });
            return;
        }
        guestChampions.set(peerId, msg.championId);
        if (token) guestTokens.set(peerId, token);
        refreshLobby();
    });

    on('input', (msg) => {
        mpPendingRemoteInput.push(msg);
    });

    // Guest tower build/upgrade/sell request — apply on the authoritative copy.
    on('defAction', (msg) => {
        if (gameMode !== 'defense' || !defenseGame || !msg) return;
        applyDefenseAction(msg, defenseGame);
    });

    // Latency probe: echo the guest's timestamp straight back.
    on('ping', (msg) => {
        send('pong', { t: msg.t });
    });

    on('peerLeft', (msg) => {
        const peerId = String(msg.peerId);
        console.log(`Guest ${peerId} disconnected`);
        guestChampions.delete(peerId);
        guestTokens.delete(peerId);
        const pid = mpGuestPlayers.get(peerId);
        // Mid-game with a known token: keep the character frozen for a grace
        // period so the player can reconnect without losing progress.
        if (gameState === 'playing' && pid !== undefined) {
            const ent = players.find(p => p.id === pid);
            if (ent && ent._token) {
                ent.disconnected = true;
                ent._dcTimer = RECONNECT_GRACE;
                ent.state = 'idle';
                ent.attackTarget = null;
                mpGuestPlayers.delete(peerId);
                _forceFullSnap = true;
                refreshLobby();
                return;
            }
        }
        removeGuestPlayer(peerId);
        refreshLobby();
    });

    const preloadPromise = preloadSprites();

    // Host picks their champion first
    const championId = await lobby.showMpChampSelect('Select Your Champion (Host)');

    // Then wait in the lobby until clicking Start (enabled once ≥1 guest ready)
    await new Promise((resolve) => {
        waitCtrl = lobby.showMpWaiting('Waiting for players to join...', {
            status: readyCount() ? `${readyCount()} player(s) ready` : '',
            startEnabled: readyCount() > 0,
            onStart: resolve,
        });
    });

    lobby.hideMpLobby();
    await preloadPromise;

    // Scale floor 1 to the party size (guests aren't spawned until after initGame).
    mpLobbyPlayerCount = guestChampions.size + 1;

    if (gameMode === 'defense') {
        initDefGame(championId, _defCtx());
    } else {
        initGame(championId);
    }
    mpSnapshotTimer = 0;

    // Spawn a player for every guest that picked a champion.
    for (const [peerId, champ] of guestChampions) {
        spawnGuestPlayer(peerId, champ, guestTokens.get(peerId));
    }
    if (mpGuestPlayers.size > 0) {
        send('mapData', { ...map.toSnapshot(), mode: gameMode });
    }

    requestAnimationFrame(gameLoop);
}


// ── Multiplayer: guest session ──
// Guest connects, picks a champion, then waits in a lobby until the host starts.
export async function startMultiplayerGuest(wsUrl, lobby) {
    initAudio();
    await connect(wsUrl, 'guest');
    mpIsGuest = true;

    let resolveGameStart;
    const gameStartPromise = new Promise((resolve) => { resolveGameStart = resolve; });

    // Map data arrives once the host starts the game
    on('mapData', (msg) => {
        map = DungeonMap.fromSnapshot(msg);
        setMapBounds(map.width * 32, map.height * 32);
        if (msg.mode === 'defense') {
            gameMode = 'defense';
            gameState = 'defense';
            // Guest defense shell — base/spots/towers/gold/wave are filled from the
            // host's snapshot `df` block; we never run the authoritative sim here.
            defenseGame = new BaseDefenseGame(localPlayer ? localPlayer.championId : 'orc', players, map, entities);
        } else {
            gameMode = 'dungeon';
            gameState = 'playing';
        }
        resolveGameStart();
    });

    // Listen for snapshot
    on('snapshot', (msg) => {
        mpLastSnapshot = msg;
        mpLastSnapshotTime = performance.now();
        applySnapshot(msg);
    });

    // Latency probe reply — compute RTT from our own outstanding ping.
    on('pong', (msg) => {
        if (msg && msg.t === mpLastPingT) {
            const rtt = performance.now() - msg.t;
            mpRtt = mpRtt ? Math.round(mpRtt * 0.6 + rtt * 0.4) : Math.round(rtt);
        }
    });

    // Host ended the run for the whole party (everyone downed, or victory).
    on('gameOver', (msg) => {
        gameState = 'gameOver';
        showGameOver(localPlayer ? localPlayer.championId : '', {
            kills: localPlayer ? (localPlayer.kills || 0) : 0,
            floor: currentFloor,
            gold: localPlayer ? (localPlayer.gold || 0) : 0,
            victory: !!(msg && msg.victory),
        });
    });

    on('hostLeft', () => {
        console.log('Host disconnected');
        mpIsHost = false;
        mpIsGuest = false;
        gameState = 'gameOver';
        // Show the guest's own last-known progress, not blank zeros, and make
        // it clear the run ended because the host left (not because they died).
        showGameOver(localPlayer ? localPlayer.championId : '', {
            kills: localPlayer ? (localPlayer.kills || 0) : 0,
            floor: currentFloor,
            gold: localPlayer ? (localPlayer.gold || 0) : 0,
            victory: false,
            disconnected: true,
        });
    });

    const preloadPromise = preloadSprites();

    // Wait for the server to confirm we joined (and assign our peer id)
    await new Promise((resolve) => on('joined', (msg) => {
        if (msg && msg.selfId !== undefined) mpSelfId = String(msg.selfId);
        resolve();
    }));

    const championId = await lobby.showMpChampSelect('Select Your Champion');
    // Stable per-browser token so a reconnect re-binds to our existing
    // character (keeping level/gold/items) instead of spawning a fresh one.
    let token = null;
    try {
        token = localStorage.getItem('dcToken');
        if (!token) { token = 'g' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('dcToken', token); }
    } catch { /* localStorage unavailable — reconnect just won't rebind */ }
    send('champSelect', { championId, token });

    lobby.showMpWaiting('Waiting for the host to start the game...');

    await preloadPromise;
    await gameStartPromise;

    lobby.hideMpLobby();
    requestAnimationFrame(gameLoop);
}


/** Host: send a lightweight DELTA snapshot to the guests.
 *
 * Only data that actually changed since the last send goes out:
 *   • HOT fields (position, hp, state, alive, facing) — an entity is included
 *     only when one of these changed, so idle enemies cost nothing.
 *   • RARE fields (stats, spells, buffs, inventory) — checked at ~10 Hz and
 *     sent only for entities whose rare data changed (most never do).
 * This keeps each guest's channel far under its buffer limit even with several
 * players, so position updates never stall behind a fat rare dump. Smooth
 * 100 fps motion on the guest comes from interpolation, not raw send rate.
 * A full resync is forced on floor change and whenever a new guest joins. */
function sendSnapshot() {
    if (!isConnected()) return;

    // Tell each guest which entity is *their* player (peerId -> entityId).
    const gmap = {};
    for (const [peerId, pid] of mpGuestPlayers) gmap[peerId] = pid;

    const now = performance.now();
    const floorChanged = _prevFloor !== currentFloor;
    const full = floorChanged || _forceFullSnap;
    const sendRare = full || !_lastSentRareTime || (now - _lastSentRareTime) > 100;

    // A full resync re-sends every field: the guest rebuilds its entity list on
    // a floor change, and a freshly-joined guest has seen nothing yet.
    if (full) {
        for (const e of entities) { e._snapSeen = false; e._lastRareJSON = null; e._lastHotSig = null; }
    }

    const eList = [];
    for (const e of entities) {
        const firstSee = !e._snapSeen;
        const dn = e.downed ? 1 : 0;
        const dc = e.disconnected ? 1 : 0;
        const sig = `${~~e.x},${~~e.y},${~~e.hp},${e.state},${e.alive ? 1 : 0},${e.facing},${dn},${dc}`;
        if (!firstSee && sig === e._lastHotSig) continue; // unchanged → skip
        e._lastHotSig = sig;
        e._snapSeen = true;
        eList.push({
            i: e.id,
            x: ~~e.x, y: ~~e.y,
            h: ~~e.hp,
            s: e.state,
            a: e.alive ? 1 : 0,
            f: e.facing,
            dn: dn || undefined,          // downed (co-op) — only sent when true
            dc: dc || undefined,          // disconnected (awaiting reconnect)
            el: firstSee ? (e.elite ? 1 : 0) : undefined,
            // Size/type/name only need to be sent the first time we see an entity
            z: firstSee ? e.size : undefined,
            t: firstSee ? e.type : undefined,
            et: firstSee ? e.enemyType : undefined,
            n: firstSee ? e.name : undefined,
        });
    }

    const payload = {
        ee: eList,
        fl: currentFloor,
        gm: gmap,
    };

    if (sendRare) {
        _lastSentRareTime = now;
        _prevFloor = currentFloor;

        if (full) {
            // Full resync: send rare data for every entity at once (new guest
            // joined, or floor changed — one-time cost is unavoidable here).
            const er = [];
            for (const e of entities) {
                const rare = buildRareFields(e);
                if (!rare) continue;
                er.push(rare);
            }
            if (er.length) payload.er = er;
        } else {
            // Staggered rare-field update (~10 Hz per entity): each snapshot
            // covers only _rareBatchSize entities, cycling through the full
            // list so every entity's rare fields are re-synced at least once
            // per 100 ms without a single-frame CPU spike from building &
            // JSON.stringify-ing rare objects for every entity at once.
            const entitiesArr = entities;
            let batchSize = Math.max(1, Math.ceil(entitiesArr.length / 5));
            if (batchSize > 4) batchSize = 4; // upper cap: never more than 4 per frame
            // Examine (not "send") batchSize entities per tick. buildRareFields
            // returns null for unchanged entities; looping until we *send*
            // batchSize would spin forever on a tick where nothing changed
            // (the common idle case) and hang the host. Capping by entities
            // examined keeps the per-frame JSON cost bounded and never hangs.
            const examineCount = Math.min(batchSize, entitiesArr.length);
            const er = [];
            for (let n = 0; n < examineCount; n++) {
                if (_rareCursor >= entitiesArr.length) _rareCursor = 0;
                const e = entitiesArr[_rareCursor];
                _rareCursor++;
                const rare = buildRareFields(e);
                if (rare) er.push(rare);
            }
            if (er.length) payload.er = er;
        }
    }

    // Projectiles ~10 Hz — they move predictably so the guest extrapolates between
    if (!_lastProjTime || (now - _lastProjTime) > 100) {
        _lastProjTime = now;
        payload.pp = projectiles.map(p => ({
            x: ~~p.x, y: ~~p.y, vx: p.vx, vy: p.vy,
            z: p.size, c: p.color, d: p.damage,
            r: p.maxRange, sx: p.startX, sy: p.startY,
            a: p.alive ? 1 : 0, te: p.team,
        }));
    }

    if (full) _forceFullSnap = false;

    // Sound events triggered by this tick's simulation, replayed on the guest
    if (_pendingSoundEvents.length > 0) {
        payload.snd = _pendingSoundEvents;
        _pendingSoundEvents = [];
    }

    // Floating combat text + screen shake produced by the host this tick
    if (_pendingFloatTexts.length > 0) {
        payload.ft = _pendingFloatTexts;
        _pendingFloatTexts = [];
    }
    if (_pendingShakeRelay > 0) {
        payload.shk = _pendingShakeRelay;
        _pendingShakeRelay = 0;
    }

    // Base Defense state (base crystal, gold, wave, towers, tower spots, tower
    // shots). Small enough to send whole each snapshot — guests reconstruct it.
    if (gameState === 'defense' && defenseGame) {
        const dg = defenseGame;
        payload.df = {
            bh: ~~dg.base.hp, bm: dg.base.maxHp, bx: ~~dg.base.x, by: ~~dg.base.y,
            gd: dg.gold, el: Math.round(dg.elapsed), ki: dg.kills, th: dg.threat, st: dg.state,
            ts: dg.towerSpots.map(s => ({ x: ~~s.x, y: ~~s.y, o: s.occupied ? 1 : 0 })),
            to: dg.towers.map(t => ({ x: ~~t.x, y: ~~t.y, ti: t.towerId, lv: t.level, h: ~~t.hp, mh: ~~t.maxHp })),
            tp: dg.towerProjectiles.map(p => ({ x: ~~p.x, y: ~~p.y, z: p.size, c: p.color })),
        };
    }

    send('snapshot', payload);
}

let _lastSentRareTime = 0;
let _prevFloor = -1;
let _lastProjTime = 0;
let _rareCursor = 0;          // cursor for staggered rare-field cycling
let _pendingSoundEvents = [];
let _pendingFloatTexts = [];   // host: float-text spawns awaiting relay
let _pendingShakeRelay = 0;    // host: strongest screen shake awaiting relay
let _forceFullSnap = false;   // next snapshot re-sends every field (new guest joined)

/** Build a compact rare-fields object for one entity. Returns null if the
 *  entity shouldn't be included (e.g. dead and fully cleaned up). The
 *  caller JSON.stringify's it and checks against _lastRareJSON for delta. */
function buildRareFields(e) {
    // Skip entities the host already cleaned up locally — they won't be in
    // the guest's list either (the guest removes them when deathTimer expires).
    if (!e.alive && e.type !== 'player' && e.deathTimer <= 0) return null;

    const rare = {
        i: e.id,
        m: e.maxHp, sp: e.speed, ar: ~~e.attackRange,
        ad: ~~e.attackDamage, arm: ~~e.armor, as: e.attackSpeed,
        g: e.goldReward, xp: e.xpReward,
        ic: e._isChest ? 1 : 0, ci: e.championId,
        gd: e.gold, kl: e.kills, sh: e.shield, st: e.shieldTimer,
        sk: e.skillPoints, iv: e.invisible ? 1 : 0,
        bn: e.burning ? 1 : 0, bt: e.burnTimer, bd: e.burnDps,
        lv: e.level, x: e.xp, xn: e.xpToNext,
        atk: e.attackTarget ? e.attackTarget.id : null,
        rb: e._regenBonus, db: e._dodgeBonus, ls: e._lifesteal, cb: e._critBonus,
        sc: e._shadowCloak ? 1 : 0, fs: e._frostSlow ? 1 : 0,
        gm: e._goldMult, ex: e._executeChance ? 1 : 0, hr: e._hasRevive ? 1 : 0,
        sv: e.spellVamp, inv: e.inventory,
        rp: e.reviveProgress ? Math.round(e.reviveProgress * 100) : 0,
        so: e.spells ? {
            q: e.spells.q ? { id: e.spells.q.id, cooldown: e.spells.q.cooldown, maxCooldown: e.spells.q.maxCooldown, castTime: e.spells.q.castTime, rank: e.spells.q.rank } : null,
            w: e.spells.w ? { id: e.spells.w.id, cooldown: e.spells.w.cooldown, maxCooldown: e.spells.w.maxCooldown, castTime: e.spells.w.castTime, rank: e.spells.w.rank } : null,
            e: e.spells.e ? { id: e.spells.e.id, cooldown: e.spells.e.cooldown, maxCooldown: e.spells.e.maxCooldown, castTime: e.spells.e.castTime, rank: e.spells.e.rank } : null,
            r: e.spells.r ? { id: e.spells.r.id, cooldown: e.spells.r.cooldown, maxCooldown: e.spells.r.maxCooldown, castTime: e.spells.r.castTime, rank: e.spells.r.rank } : null,
        } : null,
        bo: (e.buffs || []).map(b => ({ id: b.id, d: b.duration, m: b.maxDuration, st: b.stats, fg: b.flags })),
    };

    const j = JSON.stringify(rare);
    if (j === e._lastRareJSON) return null; // unchanged → skip
    e._lastRareJSON = j;
    return rare;
}

/** Guest: apply a differential snapshot from the host */
function applySnapshot(snapshot) {
    if (!snapshot) return;
    const floorChanged = snapshot.fl !== undefined && snapshot.fl !== currentFloor;

    const hotById = new Map();
    for (const se of snapshot.ee || []) hotById.set(se.i, se);

    const rareById = new Map();
    if (snapshot.er) {
        for (const re of snapshot.er) rareById.set(re.i, re);
    }

    if (floorChanged) {
        entities = []; // full rebuild on floor change
        floorBannerTimer = 2.5; // show the "Floor N" banner on the guest too
    }

    // Update entities we already know about
    for (const e of entities) {
        const se = hotById.get(e.id);
        if (!se) continue;
        hotById.delete(e.id);

        const wasAlive = e.alive;

        // Estimate velocity from the move since the last snapshot so the guest
        // can dead-reckon this entity forward (hides snapshot-to-render lag).
        const nowT = performance.now();
        if (e._lastTargetTime && e._targetX !== undefined) {
            const dts = (nowT - e._lastTargetTime) / 1000;
            if (dts > 0.005 && dts < 0.5) {
                const nvx = (se.x - e._targetX) / dts;
                const nvy = (se.y - e._targetY) / dts;
                e._vx = (e._vx || 0) * 0.5 + nvx * 0.5; // light smoothing vs jitter
                e._vy = (e._vy || 0) * 0.5 + nvy * 0.5;
            } else if (dts >= 0.5) {
                e._vx = 0; e._vy = 0; // stale → stop extrapolating
            }
        }
        e._lastTargetTime = nowT;

        // Hot fields → interpolation targets (renderer lerps x/y toward these)
        e._targetX = se.x;
        e._targetY = se.y;
        e.hp = se.h;
        e.state = se.s;
        e.alive = se.a === 1;
        e.facing = se.f;
        e.downed = se.dn === 1;
        e.disconnected = se.dc === 1;
        if (se.el !== undefined) e.elite = se.el === 1;
        if (se.z !== undefined) e.size = se.z;
        if (se.t !== undefined) e.type = se.t;
        if (se.et !== undefined) e.enemyType = se.et;
        if (se.n !== undefined) e.name = se.n;

        // Reproduce death feedback locally from the alive→dead transition.
        if (wasAlive && !e.alive) {
            e.deathTimer = 0.8;
            if (e.type !== 'player') spawnDeathParticles(e);
        }

        applyRareFields(e, rareById.get(e.id), entities);
        if (rareById.has(e.id)) rareById.delete(e.id);
    }

    // Spawn entities we haven't seen yet
    for (const [id, se] of hotById) {
        const re = rareById.get(id);
        const e = {
            id, _targetX: se.x, _targetY: se.y, x: se.x, y: se.y,
            hp: se.h, maxHp: re?.m ?? 100, alive: se.a === 1,
            state: se.s, facing: se.f, size: se.z ?? 24,
            downed: se.dn === 1, disconnected: se.dc === 1, elite: se.el === 1,
            type: se.t ?? 'enemy', enemyType: se.et ?? 'unknown', name: se.n ?? '',
            attackTarget: null, deathTimer: 0, _snapSeen: true,
            knockback: { vx: 0, vy: 0 }, frame: 0, frameTimer: 0,
            spells: null, buffs: [], inventory: [],
        };
        applyRareFields(e, re, entities);
        entities.push(e);
    }

    players = entities.filter(e => e.type === 'player');
    // Find *our* player via the peerId -> entityId map the host broadcasts.
    if (mpSelfId === null) mpSelfId = getSelfId();
    const myId = snapshot.gm ? snapshot.gm[mpSelfId] : undefined;
    if (myId !== undefined) {
        localPlayer = players.find(p => p.id === myId) || localPlayer;
    }

    // Projectiles (snap directly — they're visual-only on the guest)
    if (snapshot.pp) {
        projectiles = snapshot.pp.map(p => ({
            x: p.x, y: p.y, vx: p.vx, vy: p.vy,
            size: p.z, color: p.c, damage: p.d,
            maxRange: p.r, startX: p.sx, startY: p.sy,
            alive: p.a === 1, team: p.te, source: null,
        }));
    }

    currentFloor = snapshot.fl || 1;

    // Camera: follow our own player, or spectate a living ally while downed.
    updateCoopCamera();

    // Replay sound effects from the host's simulation tick
    if (snapshot.snd) {
        for (const evt of snapshot.snd) playSoundEvent(evt);
    }

    // Floating combat text relayed from the host (damage/heal/crit).
    if (snapshot.ft) {
        for (const ft of snapshot.ft) spawnFloatText(ft.x, ft.y, ft.t, ft.c, ft.s);
    }

    // Screen shake relayed from the host (heavy hits, big spells).
    if (snapshot.shk) shake(snapshot.shk);

    // Base Defense state from the host (authoritative). Rebuild the lightweight
    // view the guest renders + lets the guest's tower UI hit-test spots/towers.
    if (snapshot.df && defenseGame) {
        const d = snapshot.df, dg = defenseGame;
        dg.base.hp = d.bh; dg.base.maxHp = d.bm; dg.base.x = d.bx; dg.base.y = d.by;
        dg.gold = d.gd; dg.elapsed = d.el; dg.kills = d.ki; dg.threat = d.th; dg.state = d.st;
        dg.towerSpots = (d.ts || []).map(s => ({ x: s.x, y: s.y, occupied: s.o === 1 }));
        dg.towers = (d.to || []).map(t => {
            const config = getTowerConfig(t.ti);
            const tower = { x: t.x, y: t.y, towerId: t.ti, level: t.lv, config, type: 'tower', alive: true, hp: t.h, maxHp: t.mh, hitFlash: 0 };
            tower.range = getTowerRange(tower);
            return tower;
        });
        dg.towerProjectiles = (d.tp || []).map(p => ({ x: p.x, y: p.y, size: p.z, color: p.c, alive: true }));
        if (localPlayer) dg.localPlayer = localPlayer;
    }
}

/** Follow our own player, or — while downed/dead in co-op — spectate the
 *  nearest living teammate so you can watch the fight instead of a corpse. */
function updateCoopCamera() {
    if (!localPlayer || (!mpIsHost && !mpIsGuest)) return;
    if (localPlayer.alive) {
        if (Camera._followTarget !== localPlayer) setFollowTarget(localPlayer);
        return;
    }
    let best = null, bd = Infinity;
    for (const p of players) {
        if (!p.alive || p === localPlayer || p.disconnected) continue;
        const d = Math.hypot(p.x - localPlayer.x, p.y - localPlayer.y);
        if (d < bd) { bd = d; best = p; }
    }
    if (best && Camera._followTarget !== best) setFollowTarget(best);
}

/** Merge a rare-field dump (compact keys) onto a guest entity */
function applyRareFields(e, re, allEntities) {
    if (!re) return;
    if (re.m !== undefined) e.maxHp = re.m;
    if (re.sp !== undefined) e.speed = re.sp;
    if (re.ar !== undefined) e.attackRange = re.ar;
    if (re.ad !== undefined) e.attackDamage = re.ad;
    if (re.arm !== undefined) e.armor = re.arm;
    if (re.as !== undefined) e.attackSpeed = re.as;
    if (re.g !== undefined) e.goldReward = re.g;
    if (re.xp !== undefined) e.xpReward = re.xp;
    if (re.ic !== undefined) e._isChest = re.ic === 1;
    if (re.ci !== undefined) e.championId = re.ci;
    if (re.gd !== undefined) e.gold = re.gd;
    if (re.kl !== undefined) e.kills = re.kl;
    if (re.sh !== undefined) e.shield = re.sh;
    if (re.st !== undefined) e.shieldTimer = re.st;
    if (re.sk !== undefined) e.skillPoints = re.sk;
    if (re.iv !== undefined) e.invisible = re.iv === 1;
    if (re.bn !== undefined) e.burning = re.bn === 1;
    if (re.bt !== undefined) e.burnTimer = re.bt;
    if (re.bd !== undefined) e.burnDps = re.bd;
    if (re.lv !== undefined) e.level = re.lv;
    if (re.x !== undefined) e.xp = re.x;
    if (re.xn !== undefined) e.xpToNext = re.xn;
    if (re.atk !== null && re.atk !== undefined) {
        e.attackTarget = allEntities.find(te => te.id === re.atk) || null;
    } else if (re.atk === null) {
        e.attackTarget = null;
    }
    if (re.rb !== undefined) e._regenBonus = re.rb;
    if (re.db !== undefined) e._dodgeBonus = re.db;
    if (re.ls !== undefined) e._lifesteal = re.ls;
    if (re.cb !== undefined) e._critBonus = re.cb;
    if (re.sc !== undefined) e._shadowCloak = re.sc === 1;
    if (re.fs !== undefined) e._frostSlow = re.fs === 1;
    if (re.gm !== undefined) e._goldMult = re.gm;
    if (re.ex !== undefined) e._executeChance = re.ex === 1;
    if (re.hr !== undefined) e._hasRevive = re.hr === 1;
    if (re.sv !== undefined) e.spellVamp = re.sv;
    if (re.rp !== undefined) e.reviveProgress = re.rp / 100;
    if (re.inv !== undefined) e.inventory = re.inv;
    if (re.so !== undefined) e.spells = re.so;
    if (re.bo !== undefined) e.buffs = re.bo;
}

// ── Bot / testing API ──
window.__getDefenseGame = () => defenseGame;
window.__attackEnemyById = (id) => {
    if (!localPlayer || !localPlayer.alive) return false;
    const enemy = entities.find(e => e.id === id);
    if (enemy && enemy.alive) {
        localPlayer.attackTarget = enemy;
        enemy.isTargeted = true;
        for (const e of entities) if (e !== enemy) e.isTargeted = false;
        return true;
    }
    return false;
};
window.__getGameState = () => {
    if (!localPlayer) return null;
    return {
        player: {
            x: Math.round(localPlayer.x), y: Math.round(localPlayer.y),
            hp: Math.round(localPlayer.hp), maxHp: localPlayer.maxHp,
            gold: localPlayer.gold || 0, level: localPlayer.level, floor: currentFloor,
            state: localPlayer.state, facing: localPlayer.facing, alive: localPlayer.alive,
            attackDamage: localPlayer.attackDamage, armor: localPlayer.armor,
            shield: localPlayer.shield,
            spells: {
                q: localPlayer.spells.q ? { id: localPlayer.spells.q.id, cooldown: Math.round((localPlayer.spells.q.cooldown || 0) * 10) / 10, rank: localPlayer.spells.q.rank } : null,
                w: localPlayer.spells.w ? { id: localPlayer.spells.w.id, cooldown: Math.round((localPlayer.spells.w.cooldown || 0) * 10) / 10, rank: localPlayer.spells.w.rank } : null,
                e: localPlayer.spells.e ? { id: localPlayer.spells.e.id, cooldown: Math.round((localPlayer.spells.e.cooldown || 0) * 10) / 10, rank: localPlayer.spells.e.rank } : null,
                r: localPlayer.spells.r ? { id: localPlayer.spells.r.id, cooldown: Math.round((localPlayer.spells.r.cooldown || 0) * 10) / 10, rank: localPlayer.spells.r.rank } : null,
            },
            skillPoints: localPlayer.skillPoints,
            xp: localPlayer.xp, xpToNext: localPlayer.xpToNext,
            buffs: (localPlayer.buffs || []).map(b => ({ id: b.id, remaining: Math.round(b.duration * 10) / 10 })),
            lifesteal: localPlayer._lifesteal || 0,
            fireTouch: !!localPlayer._fireTouch,
            shadowCloak: !!localPlayer._shadowCloak,
        },
        enemies: entities.filter(e => e.type !== 'player').map(e => ({
            id: e.id, type: e.enemyType, name: e.name,
            x: Math.round(e.x), y: Math.round(e.y),
            hp: Math.round(e.hp), maxHp: e.maxHp,
            alive: e.alive, state: e.state, aiState: e.aiState,
            distance: localPlayer ? Math.round(Math.hypot(e.x - localPlayer.x, e.y - localPlayer.y)) : 0,
            attackTarget: e.attackTarget ? 'player' : null,
        })),
        map: {
            onStairs: map ? map.isOnStairs(localPlayer.x, localPlayer.y) : false,
            onShop: map ? map.isOnShop(localPlayer.x, localPlayer.y) : false,
            stairsX: map ? Math.round(map.stairsX) : 0,
            stairsY: map ? Math.round(map.stairsY) : 0,
            shopX: map ? Math.round(map.shopX) : 0,
            shopY: map ? Math.round(map.shopY) : 0,
            hasShop: map ? map.hasShop : false,
        },
        summary: {
            gameState,
            enemiesAlive: entities.filter(e => e.type !== 'player' && e.alive).length,
            enemiesTotal: entities.filter(e => e.type !== 'player').length,
            projectiles: projectiles.length,
            kills: localPlayer.kills || 0,
            floor: currentFloor,
            gold: localPlayer.gold || 0,
            shopOpen: isShopOpen(),
        }
    };
};

window.__errorLog = [];
window.addEventListener('error', (e) => {
    window.__errorLog.push({ time: Date.now(), msg: e.message, stack: e.error?.stack?.slice(0, 200) });
    if (window.__errorLog.length > 100) window.__errorLog.shift();
});

start();
