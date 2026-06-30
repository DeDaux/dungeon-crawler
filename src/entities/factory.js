// factory.js — spawn player, enemies, chests
import { ENEMIES, scaleEnemyForFloor } from '../config/enemies.js';
import { CHAMPIONS } from '../config/champions.js';
import { SHOP_ITEMS } from '../config/items.js';
import { addBuff } from './buffs.js';
import { applyItemEffect } from '../config/items.js';
import { getEnemyAbilities, getEnemySpellConfig } from '../config/enemySpells.js';

let _idCounter = 0;

export function resetIdCounter() { _idCounter = 0; }
function nextId() { return ++_idCounter; }

// Built as a function so every entity gets FRESH objects/arrays and fresh
// randomized AI values — a shared template object would make all enemies
// share one knockback vector and one buffs array.
function makeEntityDefaults() {
    return {
        hp: 100,
        maxHp: 100,
        speed: 120,
        attackDamage: 15,
        attackRange: 32,
        attackSpeed: 1.0,
        armor: 0,
        shield: 0,
        knockback: { vx: 0, vy: 0 },
        buffs: [],
        hitFlash: false,
        hitFlashTimer: 0,
        attackCooldown: 0,
        aiTimer: 0.2 + Math.random() * 0.5,
        aiState: 'idle',
        aiStrafeDir: Math.random() < 0.5 ? 1 : -1,
        aiStrafeAngle: Math.random() * Math.PI * 2,
        aiHomeX: 0,
        aiHomeY: 0,
        aiLastPlayerX: 0,
        aiLastPlayerY: 0,
        aiPhase: 0,
        aiPhaseTimer: 0,
        aiStunTimer: 0,
        aiDodgeCooldown: 0,
        deathTimer: 0,
    };
}

/** Spawn a player entity */
export function spawnPlayer(championId) {
    const config = CHAMPIONS[championId];
    if (!config) return null;

    const player = {
        id: nextId(),
        type: 'player',
        championId,
        name: config.name,
        alive: true,
        state: 'idle',
        facing: 'right',
        frame: 0,
        animTimer: 0,

        hp: config.hp,
        maxHp: config.hp,
        speed: config.speed,
        baseSpeed: config.speed,
        attackDamage: config.attackDamage,
        baseAttackDamage: config.attackDamage,
        attackRange: config.attackRange || 30,
        attackSpeed: config.attackSpeed,
        baseAttackSpeed: config.attackSpeed,
        armor: config.armor || 0,
        magicResist: config.magicResist || 0,
        shield: 0,

        x: 0, y: 0,
        targetX: null, targetY: null,
        attackTarget: null,

        knockback: { vx: 0, vy: 0 },
        buffs: [],
        hitFlash: false,
        hitFlashTimer: 0,
        attackCooldown: 0,
        deathTimer: 0,
        lastDamageTimer: 0,

        level: 1,
        xp: 0,
        xpToNext: config.xpToNext || 100,
        skillPoints: 2,
        spells: {},
        kills: 0,
        gold: 0,
        inventory: new Array(8).fill(null),

        // Champion-specific stats
        size: config.size || 28,
        color: config.color || '#4CAF50',
        colorDark: config.colorDark || '#2E7D32',
        sprite: config.sprite || null,
    };

    // Assign champion spells
    for (let i = 0; i < config.spells.length; i++) {
        const key = ['q', 'w', 'e', 'r'][i];
        player.spells[key] = null; // starts locked
    }

    return player;
}

/** Spawn an enemy with optional elite variant */
export function spawnEnemy(type, x, y, map, floorNumber) {
    const baseConfig = ENEMIES[type];
    if (!baseConfig) return null;

    // ~15% chance to be elite (higher on deeper floors)
    const eliteChance = 0.10 + floorNumber * 0.02;
    const isElite = Math.random() < eliteChance;

    const config = scaleEnemyForFloor(baseConfig, floorNumber);
    const hpMult = isElite ? 2.0 : 1.0;

    const enemy = {
        ...makeEntityDefaults(),
        id: nextId(),
        type: 'enemy',
        enemyType: type,
        name: isElite ? `★ ${config.name}` : config.name,
        elite: isElite,
        alive: true,
        state: 'idle',
        facing: 'left',
        frame: 0,
        animTimer: 0,

        x, y,
        targetX: null, targetY: null,
        attackTarget: null,

        hp: Math.round(config.hp * hpMult),
        maxHp: Math.round(config.hp * hpMult),
        speed: isElite ? Math.round(config.speed * 1.15) : config.speed,
        baseSpeed: isElite ? Math.round(config.speed * 1.15) : config.speed,
        attackDamage: isElite ? Math.round(config.attackDamage * 1.5) : config.attackDamage,
        baseAttackDamage: isElite ? Math.round(config.attackDamage * 1.5) : config.attackDamage,
        attackRange: config.attackRange,
        attackSpeed: config.attackSpeed,
        armor: isElite ? Math.round(config.armor * 1.5) : config.armor,
        shield: 0,

        size: config.size || 28,
        color: isElite ? '#FFD700' : (config.color || '#F44336'),
        colorDark: isElite ? '#FFA000' : (config.colorDark || '#B71C1C'),
        sprite: config._sprite || null,

        xpReward: isElite ? Math.round(config.xpReward * 2.5) : config.xpReward,
        goldReward: isElite ? Math.round(config.goldReward * 3) : config.goldReward,
        aggroRange: config.aggroRange || 200,
        // Effectively infinite — enemies aggro until they die, never disengage from a chase
        leashRange: config.leashRange || 100000,
        aiBehavior: config.aiBehavior || 'melee',

        // Horror champions: relentless hunters routed to the nightmare renderer.
        _hunter: config._hunter || false,
        _horror: config._horror || null,

        // AI home
        aiHomeX: x,
        aiHomeY: y,

        // Boss phase tracking
        aiPhase: 0,
        aiPhaseTimer: 0,
    };

    // Initialize enemy abilities
    if (!enemy.abilities) {
        enemy.abilities = {};
        const abilityMap = getEnemyAbilities(type);
        for (const key of ['q', 'w', 'e', 'r']) {
            const spellId = abilityMap[key];
            if (spellId) {
                const config = getEnemySpellConfig(spellId);
                if (config) {
                    enemy.abilities[key] = {
                        id: spellId,
                        key: key,
                        cooldown: 0,
                        maxCooldown: config.cooldown || 5,
                        config: config,
                    };
                }
            }
        }
    }

    return enemy;
}

/** Spawn a chest that drops gold + items on destruction */
export function spawnChest(x, y, floorNumber) {
    const goldAmount = Math.round((20 + Math.floor(Math.random() * 30) + Math.floor(floorNumber * 10)) * 0.7);
    const hasItem = Math.random() < 0.4 + floorNumber * 0.05; // better items deeper

    const chest = {
        ...makeEntityDefaults(),
        id: nextId(),
        type: 'chest',
        enemyType: 'chest',
        name: 'Treasure Chest',
        alive: true,
        state: 'idle',
        facing: 'right',
        frame: 0,
        animTimer: 0,

        x, y,
        targetX: null, targetY: null,
        attackTarget: null,
        hp: 1, // one-shot
        maxHp: 1,
        speed: 0,
        attackDamage: 0,
        attackRange: 0,
        attackSpeed: 0,
        armor: 0,
        shield: 0,

        size: 24,
        color: '#FFD700',
        colorDark: '#FFA000',

        xpReward: 0,
        goldReward: 0,
        aggroRange: 0,
        leashRange: 0,
        aiBehavior: 'idle',
        deathTimer: 0.4,

        _isChest: true,
        _chestGold: goldAmount,
        _chestHasItem: hasItem,
        _chestItemId: hasItem ? pickRandomShopItem(floorNumber) : null,
    };

    return chest;
}

/** Pick a random affordable shop item for chest drops */
function pickRandomShopItem(floorNumber) {
    const keys = Object.keys(SHOP_ITEMS);
    const affordable = keys.filter(k => {
        const item = SHOP_ITEMS[k];
        if (floorNumber < 3 && item.cost > 200) return false;
        if (floorNumber < 5 && item.cost > 350) return false;
        return true;
    });
    return affordable.length > 0 ? affordable[Math.floor(Math.random() * affordable.length)] : 'health_potion';
}

/** Apply chest loot to player */
export function applyChestLoot(player, chest) {
    if (!chest._isChest) return null;
    player.gold = (player.gold || 0) + chest._chestGold;
    let itemName = null;
    if (chest._chestHasItem && chest._chestItemId) {
        const item = SHOP_ITEMS[chest._chestItemId];
        if (item) {
            applyItemEffect(player, item);
            itemName = `${item.icon || ''} ${item.name}`.trim();
        }
    }
    return { gold: chest._chestGold, itemName };
}
