// baseDefense.js — Base Defense game mode logic
// Waves of enemies march through a real procedural dungeon toward a base
// crystal. The player champion plays IDENTICALLY to Dungeon Crawl (the main
// loop runs the normal combat/movement/spell pipeline on the shared entities
// list). This controller only owns: waves, towers, the base crystal, and a
// small set of build spots.

import { getTowerConfig, getTowerDamage, getTowerRange, getUpgradeCost, getTowerMaxHp } from '../config/towers.js';
import { spawnEnemy } from '../entities/factory.js';
import { dealDamage, spawnFloatText, queueSoundEvent } from './combat.js';
import { spawnParticles } from '../render/drawEffects.js';
import { shake } from '../camera.js';

const TILE_SIZE = 32;
const MAX_TOWER_SPOTS = 5;  // "not many" — a few deliberate build points
const BASE_MAX_HP = 1500;

/**
 * TOWER PROJECTILE — homing shot fired by a tower. Kept separate from the
 * dungeon projectile array so the defense renderer draws them on its own pass.
 */
export class TowerProjectile {
    constructor(tower, target, damage, config) {
        this.x = tower.x;
        this.y = tower.y;
        this.target = target;
        this.damage = damage;
        this.speed = config.projectileSpeed || 400;
        this.size = config.projectileSize || 4;
        this.color = config.projectileColor || '#FFF';
        this.splashRadius = config.splashRadius || 0;
        this.slowAmount = config.slowAmount || 0;
        this.slowDuration = config.slowDuration || 0;
        this.chainCount = config.chainCount || 0;
        this.chainRange = config.chainRange || 60;
        this.alive = true;
        this.towerConfig = config;
        this.towerId = tower.id;
    }

    update(dt, allEntities, projectileList) {
        if (!this.alive || !this.target) { this.alive = false; return; }
        if (!this.target.alive) { this.alive = false; return; }

        const dx = this.target.x - this.x;
        const dy = this.target.y - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 8) {
            this.hit(allEntities, projectileList);
            return;
        }

        const step = Math.min(this.speed * dt, dist);
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
    }

    hit(allEntities, projectileList) {
        this.alive = false;
        const target = this.target;
        if (!target || !target.alive) return;

        dealDamage(target, this.damage, null);

        // Splash damage
        if (this.splashRadius > 0) {
            for (const e of allEntities) {
                if (e === target || !e.alive || e.type === 'player' || e.type === 'tower') continue;
                if (Math.hypot(e.x - target.x, e.y - target.y) < this.splashRadius) {
                    dealDamage(e, Math.floor(this.damage * 0.6), null);
                }
            }
            spawnParticles(target.x, target.y, '#FF5722', 10, 100, 0.4, 5);
        }

        // Slow effect
        if (this.slowAmount > 0 && target.alive) {
            target._towerSlowAmount = Math.max(target._towerSlowAmount || 0, this.slowAmount);
            target._towerSlowTimer = Math.max(target._towerSlowTimer || 0, this.slowDuration);
        }

        // Chain lightning
        if (this.chainCount > 0) {
            let chainTarget = this.target;
            for (let c = 0; c < this.chainCount; c++) {
                let best = null;
                let bestDist = this.chainRange;
                for (const e of allEntities) {
                    if (e === chainTarget || !e.alive || e.type === 'player' || e.type === 'tower') continue;
                    const d = Math.hypot(e.x - chainTarget.x, e.y - chainTarget.y);
                    if (d < bestDist) { bestDist = d; best = e; }
                }
                if (!best) break;
                const chainDmg = Math.floor(this.damage * (0.6 - c * 0.1));
                dealDamage(best, chainDmg, null);
                chainTarget = best;
            }
        }
    }
}

/**
 * Tower placed on a build spot. Auto-targets the nearest enemy in range.
 */
export class DefenseTower {
    constructor(towerId, x, y, spotIndex) {
        const config = getTowerConfig(towerId);
        this.id = 'tower_' + Math.random().toString(36).slice(2, 8);
        this.type = 'tower';
        this.towerId = towerId;
        this.config = config;
        this.x = x;
        this.y = y;
        this.spotIndex = spotIndex;
        this.level = 1;
        this.alive = true;
        this.attackCooldown = 0;
        this.range = getTowerRange(this);
        this.attackDamage = getTowerDamage(this);
        this.maxHp = getTowerMaxHp(this);
        this.hp = this.maxHp;
        this.hitFlash = 0;
        this.target = null;
        this.facing = 'right';
    }

    update(dt, allEntities, towerProjectiles) {
        if (!this.alive) return;

        let nearest = null;
        let nearestDist = this.range;
        for (const e of allEntities) {
            if (!e.alive || e.type === 'player' || e.type === 'tower' || e.type === 'chest') continue;
            const d = Math.hypot(e.x - this.x, e.y - this.y);
            if (d < nearestDist) { nearestDist = d; nearest = e; }
        }
        this.target = nearest;

        if (this.attackCooldown > 0) this.attackCooldown -= dt;

        if (this.target && this.attackCooldown <= 0) {
            this.attackCooldown = 1 / this.config.attackSpeed;
            this.facing = this.target.x > this.x ? 'right' : 'left';
            const dmg = getTowerDamage(this);
            towerProjectiles.push(new TowerProjectile(this, this.target, dmg, this.config));
            queueSoundEvent({ type: 'towerAttack', towerId: this.towerId });
        }
    }

    upgrade() {
        this.level++;
        this.range = getTowerRange(this);
        this.attackDamage = getTowerDamage(this);
        // Upgrading also repairs and reinforces the structure.
        this.maxHp = getTowerMaxHp(this);
        this.hp = this.maxHp;
        return true;
    }
}

// Endless siege: the enemy roster unlocks tougher units the longer you survive.
// Each tier lists the units that can appear once `minTime` seconds have elapsed;
// the spawner samples from every unlocked tier (recent tiers weighted heavier).
const SPAWN_TIERS = [
    { minTime: 0,   types: ['goblin', 'bat', 'slime'] },
    { minTime: 45,  types: ['skeleton', 'orc_warrior'] },
    { minTime: 110, types: ['demon_hound', 'giant_spider'] },
    { minTime: 180, types: ['necromancer', 'dark_knight'] },
    { minTime: 260, types: ['fire_elemental', 'orc_warrior', 'dark_knight'] },
    { minTime: 360, types: ['boss_dragon', 'fire_elemental', 'necromancer'] },
];

/** Difficulty knobs derived purely from elapsed survival time. */
function siegeParams(elapsed) {
    return {
        // Spawn cadence tightens from ~2.2s down to ~0.45s over ~6 minutes.
        interval: Math.max(0.45, 2.2 - elapsed / 170),
        // Enemy HP swells steadily so late game is genuinely threatening.
        hpMult: 1 + elapsed / 110,
        // Damage creeps up too.
        dmgMult: 1 + elapsed / 320,
        // Chance a spawn becomes a coordinated squad of the same unit.
        squadChance: Math.min(0.5, 0.12 + elapsed / 900),
    };
}

/** Pick an enemy type appropriate for how long the siege has lasted. */
function pickSiegeType(elapsed) {
    const unlocked = SPAWN_TIERS.filter(t => elapsed >= t.minTime);
    if (unlocked.length === 0) return 'goblin';
    // Weight later tiers more heavily so the mix shifts toward tougher units.
    const weighted = [];
    unlocked.forEach((tier, i) => {
        const w = 1 + i; // newest tier ~= (n) weight
        for (let k = 0; k < w; k++) weighted.push(tier);
    });
    const tier = weighted[Math.floor(Math.random() * weighted.length)];
    return tier.types[Math.floor(Math.random() * tier.types.length)];
}

/** Tile center → world center coords. */
function roomCenterWorld(room) {
    const tx = Math.floor(room.x + room.w / 2);
    const ty = Math.floor(room.y + room.h / 2);
    return { x: tx * TILE_SIZE + TILE_SIZE / 2, y: ty * TILE_SIZE + TILE_SIZE / 2, tx, ty };
}

/**
 * Main controller for a Base Defense session.
 *
 * NOTE: `entities` is the SHARED global entity list (the same array main.js
 * passes to updateCombat/updateMovement/etc.). The player lives there too.
 * Towers, towerProjectiles, the base, and build spots live on this instance.
 */
export class BaseDefenseGame {
    constructor(championId, players, map, entities) {
        this.map = map;                 // a real DungeonMap
        this.players = players || [];
        this.entities = entities;       // shared global list (player + enemies)
        this.championId = championId;
        this.localPlayer = null;

        this.state = 'active';          // active | lost  (endless — no victory)
        this.elapsed = 0;               // seconds survived
        this.kills = 0;                 // total enemies destroyed
        this.spawnTimer = 2.5;          // countdown to the next spawn
        this.threat = 1;                // displayed difficulty level (grows over time)

        this.gold = 105;
        this.towers = [];
        this.towerProjectiles = [];
        this.traps = [];                // enemy-laid mines [{x,y,arm,radius,damage,triggered,fuse}]
        this.towerSpots = [];           // [{x,y,occupied}]
        this.spawnPoints = [];          // world coords enemies emerge from
        this.base = { x: 0, y: 0, hp: BASE_MAX_HP, maxHp: BASE_MAX_HP };

        // UI selection (a contextual panel; no persistent build bar)
        this.selectedSpotIndex = null;  // open build panel for this spot
        this.selectedTower = null;      // open upgrade/sell panel for this tower
    }

    setLocalPlayer(player) {
        this.localPlayer = player;
        if (player && !this.entities.includes(player)) this.entities.push(player);
    }

    /**
     * Lay out the arena over the procedural dungeon:
     *  - base crystal at the player's spawn room (you defend your home),
     *  - enemy spawn(s) at the rooms farthest from the base,
     *  - a few build spots at rooms between, biased toward the base.
     */
    setupArena(playerSpawnRoomIndex) {
        const rooms = this.map.rooms;
        if (!rooms || rooms.length === 0) return;

        const baseIdx = (playerSpawnRoomIndex !== undefined && rooms[playerSpawnRoomIndex])
            ? playerSpawnRoomIndex : 0;
        const baseRoom = rooms[baseIdx];
        const baseC = roomCenterWorld(baseRoom);
        this.base = { x: baseC.x, y: baseC.y, hp: BASE_MAX_HP, maxHp: BASE_MAX_HP, tx: baseC.tx, ty: baseC.ty };

        // Distance of every other room from the base.
        const others = rooms
            .map((room, i) => ({ room, i, c: roomCenterWorld(room) }))
            .filter(o => o.i !== baseIdx)
            .map(o => ({ ...o, d: Math.hypot(o.c.x - baseC.x, o.c.y - baseC.y) }))
            .sort((a, b) => b.d - a.d); // farthest first

        // Enemy spawn rooms: the farthest 1–2 rooms that can actually reach the base.
        this.spawnPoints = [];
        for (const o of others) {
            const path = this.map.findPath(o.c.x, o.c.y, baseC.x, baseC.y);
            if (path && path.length > 1) {
                this.spawnPoints.push({ x: o.c.x, y: o.c.y });
                if (this.spawnPoints.length >= 2) break;
            }
        }
        // Fallback: if no reachable far room, spawn from the single farthest room.
        if (this.spawnPoints.length === 0 && others.length) {
            this.spawnPoints.push({ x: others[0].c.x, y: others[0].c.y });
        }

        // Build spots: rooms nearest the base (last line of defense), capped.
        const spotRooms = others.slice().sort((a, b) => a.d - b.d).slice(0, MAX_TOWER_SPOTS);
        this.towerSpots = spotRooms.map(o => ({ x: o.c.x, y: o.c.y, occupied: false }));
    }

    /** Per-frame defense logic (called AFTER the normal hero/combat pipeline). */
    update(dt) {
        if (this.state === 'lost') return;
        if (!this.localPlayer) return;

        if (this.base.hp <= 0) {
            this.state = 'lost';
            spawnFloatText(this.base.x, this.base.y - 40, '💀 BASE DESTROYED!', '#F44336', 28);
            return;
        }

        this.elapsed += dt;
        this.threat = 1 + Math.floor(this.elapsed / 30);  // a level every 30s

        // Tower slow timers (restore speed when they expire; speed itself is
        // applied in main.js's enemy march via _towerSlowAmount).
        for (const e of this.entities) {
            if (!e.alive || e.type === 'player' || e.type === 'tower') continue;
            if (e._towerSlowTimer > 0) {
                e._towerSlowTimer -= dt;
                if (e._towerSlowTimer <= 0) { e._towerSlowTimer = 0; e._towerSlowAmount = 0; }
            }
        }

        // ── Endless spawning: enemies never stop, only intensify ──
        const sp = siegeParams(this.elapsed);
        // Soft cap on concurrent attackers so performance stays sane during long runs.
        const aliveEnemies = this.entities.filter(e => e.alive && e.type === 'enemy').length;
        if (aliveEnemies < 60) {
            this.spawnTimer -= dt;
            if (this.spawnTimer <= 0) {
                this.spawnTimer = sp.interval * (0.75 + Math.random() * 0.5);
                const type = pickSiegeType(this.elapsed);
                // Sometimes a coordinated squad pushes in together.
                const squad = Math.random() < sp.squadChance ? (2 + Math.floor(Math.random() * 3)) : 1;
                for (let i = 0; i < squad; i++) this.spawnSiegeEnemy(type, sp);
            }
        }

        // Enemy attacks: a tower they've engaged (e._towerTarget, set by the enemy
        // controller) takes priority over the base. Enemies that reach the base
        // STAY and keep hammering it on their attack cooldown (they don't vanish on
        // contact); they only stop when killed, or when they break off to chase a
        // nearby player. Reach scales with the enemy's range so ranged kiters
        // bombard from their standoff while melee must close in.
        for (const e of this.entities) {
            if (!e.alive || e.type === 'player' || e.type === 'tower') continue;
            if (e.attackTarget && e.attackTarget.type === 'player') continue; // busy with a player
            const reach = Math.max(e.attackRange || 40, 44);

            // (a) Smash an engaged tower.
            const tw = e._towerTarget;
            if (tw && tw.alive && Math.hypot(e.x - tw.x, e.y - tw.y) < reach) {
                e._baseAtkCd = (e._baseAtkCd || 0) - dt;
                if (e._baseAtkCd <= 0) {
                    e._baseAtkCd = 1 / (e.attackSpeed || 1);
                    const dmg = Math.max(1, Math.round((e.attackDamage || 10) * 0.6));
                    tw.hp -= dmg; tw.hitFlash = 0.12;
                    e.state = 'attack'; e.frame = 0;
                    spawnParticles(tw.x, tw.y, tw.config.color || '#FFF', 5, 60, 0.3, 3);
                    if (tw.hp <= 0) this.destroyTower(tw);
                }
                continue;
            }

            // (b) Otherwise hammer the base if in range.
            if (Math.hypot(e.x - this.base.x, e.y - this.base.y) < reach) {
                e._baseAtkCd = (e._baseAtkCd || 0) - dt;
                if (e._baseAtkCd <= 0) {
                    e._baseAtkCd = 1 / (e.attackSpeed || 1);
                    const dmg = Math.max(1, Math.round((e.attackDamage || 10) * 0.5));
                    this.base.hp = Math.max(0, this.base.hp - dmg);
                    e.state = 'attack'; e.frame = 0;
                    spawnParticles(this.base.x, this.base.y, '#F44336', 6, 70, 0.3, 3);
                    spawnFloatText(this.base.x, this.base.y - 10, `-${dmg}`, '#F44336', 16);
                    shake(Math.min(dmg * 0.15, 5));
                }
            }
        }

        // Enemy-laid traps: arm, then detonate when a hero steps near.
        this.updateTraps(dt);

        // Towers + tower projectiles
        for (const tower of this.towers) {
            if (tower.hitFlash > 0) tower.hitFlash -= dt;
            tower.update(dt, this.entities, this.towerProjectiles);
        }
        for (let i = this.towerProjectiles.length - 1; i >= 0; i--) {
            const p = this.towerProjectiles[i];
            p.update(dt, this.entities, this.towerProjectiles);
            if (!p.alive) this.towerProjectiles.splice(i, 1);
        }

        // Remove dead enemies once their brief death animation finishes, paying
        // out a bounty the first time each one is counted as killed.
        for (let i = this.entities.length - 1; i >= 0; i--) {
            const e = this.entities[i];
            if (e.type === 'player') continue;
            if (!e.alive) {
                if (e.type === 'enemy' && !e._bountyPaid) {
                    e._bountyPaid = true;
                    this.kills++;
                    const bounty = Math.max(2, Math.round((e.goldReward || 8) * 0.6));
                    this.gold += bounty;
                    if (this.localPlayer) this.localPlayer.gold = (this.localPlayer.gold || 0) + bounty;
                }
                if (e.deathTimer > 0) e.deathTimer -= dt;
                if (e.deathTimer <= 0) this.entities.splice(i, 1);
            }
        }
    }

    /** A sapper enemy buries a mine. It arms after a moment, then detonates on a
     *  hero stepping inside its radius (or burns its fuse and blows regardless). */
    layTrap(x, y, damage) {
        if (this.traps.length > 40) return; // safety cap
        this.traps.push({ x, y, arm: 1.2, radius: 46, damage: Math.max(8, damage | 0), triggered: false, fuse: 14 });
        spawnParticles(x, y, '#6d4c33', 5, 40, 0.3, 2);
    }

    updateTraps(dt) {
        const players = this.entities.filter(e => e.type === 'player' && e.alive);
        for (let i = this.traps.length - 1; i >= 0; i--) {
            const tr = this.traps[i];
            if (tr.arm > 0) tr.arm -= dt;
            tr.fuse -= dt;
            let blow = tr.fuse <= 0;
            if (!blow && tr.arm <= 0) {
                for (const p of players) {
                    if (Math.hypot(p.x - tr.x, p.y - tr.y) < tr.radius) { blow = true; break; }
                }
            }
            if (blow) {
                for (const p of players) {
                    if (Math.hypot(p.x - tr.x, p.y - tr.y) < tr.radius) dealDamage(p, tr.damage, null);
                }
                // Mines also scar nearby towers.
                for (const tw of this.towers) {
                    if (tw.alive && Math.hypot(tw.x - tr.x, tw.y - tr.y) < tr.radius) {
                        tw.hp -= Math.round(tr.damage * 0.8); tw.hitFlash = 0.12;
                        if (tw.hp <= 0) this.destroyTower(tw);
                    }
                }
                spawnParticles(tr.x, tr.y, '#FF7043', 18, 150, 0.5, 5);
                spawnParticles(tr.x, tr.y, '#FFD54F', 10, 110, 0.4, 3);
                spawnFloatText(tr.x, tr.y - 14, '💥 MINE!', '#FF5252', 16);
                shake(6);
                this.traps.splice(i, 1);
            }
        }
    }

    /** Spawn one siege enemy at a spawn point and path it to the base. */
    spawnSiegeEnemy(enemyType, sp) {
        const point = this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];
        if (!point) return;

        // jitter so a squad doesn't stack on one pixel
        const jx = point.x + (Math.random() - 0.5) * 40;
        const jy = point.y + (Math.random() - 0.5) * 40;
        const enemy = spawnEnemy(enemyType, jx, jy, this.map, this.threat);
        if (!enemy) return;

        enemy.maxHp = Math.round(enemy.maxHp * sp.hpMult);
        enemy.hp = enemy.maxHp;
        enemy.attackDamage = Math.round((enemy.attackDamage || 10) * sp.dmgMult);
        enemy.baseAttackDamage = enemy.attackDamage;

        const path = this.map.findPath(enemy.x, enemy.y, this.base.x, this.base.y);
        enemy._defensePath = (path && path.length > 1)
            ? path
            : [{ x: enemy.x, y: enemy.y }, { x: this.base.x, y: this.base.y }];
        enemy._defensePathIndex = 0;
        enemy._isDefenseMode = true;
        enemy.attackTarget = null;
        enemy.aiState = 'chase';

        this.entities.push(enemy);
    }

    placeTower(towerId, spotIndex) {
        const spot = this.towerSpots[spotIndex];
        if (!spot || spot.occupied) return false;
        const config = getTowerConfig(towerId);
        if (!config || this.gold < config.cost) return false;

        this.gold -= config.cost;
        const tower = new DefenseTower(towerId, spot.x, spot.y, spotIndex);
        spot.occupied = true;
        this.towers.push(tower);
        spawnFloatText(spot.x, spot.y - 20, `${config.icon} built!`, config.color, 14);
        return true;
    }

    upgradeTower(towerIndex) {
        const tower = this.towers[towerIndex];
        if (!tower || tower.level >= 5) return false;
        const cost = getUpgradeCost(tower);
        if (this.gold < cost) return false;
        this.gold -= cost;
        tower.upgrade();
        spawnFloatText(tower.x, tower.y - 20, `⬆ Level ${tower.level}!`, '#FFD700', 14);
        return true;
    }

    /** An enemy reduced a tower to 0 HP — blow it up and free its spot to rebuild. */
    destroyTower(tower) {
        if (!tower || !tower.alive) return;
        tower.alive = false;
        if (this.towerSpots[tower.spotIndex]) this.towerSpots[tower.spotIndex].occupied = false;
        const i = this.towers.indexOf(tower);
        if (i >= 0) this.towers.splice(i, 1);
        if (this.selectedTower === tower) this.selectedTower = null;
        spawnParticles(tower.x, tower.y, tower.config.color || '#FFF', 18, 130, 0.5, 5);
        spawnParticles(tower.x, tower.y, '#FFF', 10, 90, 0.3, 3);
        spawnFloatText(tower.x, tower.y - 16, '💥 Tower destroyed!', '#FF5252', 16);
        shake(6);
        // Any enemies that were focusing it drop the target.
        for (const e of this.entities) if (e._towerTarget === tower) e._towerTarget = null;
    }

    sellTower(towerIndex) {
        const tower = this.towers[towerIndex];
        if (!tower) return 0;
        const refund = Math.floor((tower.config.cost || 50) * 0.5 * (1 + (tower.level - 1) * 0.3));
        this.gold += refund;
        if (this.towerSpots[tower.spotIndex]) this.towerSpots[tower.spotIndex].occupied = false;
        this.towers.splice(towerIndex, 1);
        spawnFloatText(tower.x, tower.y - 20, `💰 +${refund}g`, '#FFD700', 14);
        return refund;
    }

    getTowerAt(x, y) {
        for (let i = 0; i < this.towers.length; i++) {
            const t = this.towers[i];
            if (Math.abs(t.x - x) < 22 && Math.abs(t.y - y) < 22) return { tower: t, index: i };
        }
        return null;
    }

    /** Index of an unoccupied build spot near (x,y), or -1. */
    getSpotAt(x, y) {
        for (let i = 0; i < this.towerSpots.length; i++) {
            const s = this.towerSpots[i];
            if (!s.occupied && Math.abs(x - s.x) < 26 && Math.abs(y - s.y) < 26) return i;
        }
        return -1;
    }
}
