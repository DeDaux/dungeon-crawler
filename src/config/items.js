// items.js — shop items, consumables, and equipment
// Each item has a cost, effect, and description
// MASSIVE expansion: 40+ items so you can't buy everything

import { CHAMPIONS } from './champions.js';

export const SHOP_ITEMS = {
    // --- POTIONS (8 items) ---
    health_potion: {
        id: 'health_potion',
        name: 'Health Potion',
        type: 'consumable',
        cost: 33,
        icon: '❤️',
        color: '#F44336',
        description: 'Restore 40 HP instantly.',
        effect: { heal: 40 },
    },
    greater_health_potion: {
        id: 'greater_health_potion',
        name: 'Greater Health Potion',
        type: 'consumable',
        cost: 80,
        icon: '💖',
        color: '#E91E63',
        description: 'Restore 100 HP instantly.',
        effect: { heal: 100 },
    },
    super_health_potion: {
        id: 'super_health_potion',
        name: 'Super Health Potion',
        type: 'consumable',
        cost: 160,
        icon: '💖',
        color: '#D50000',
        description: 'Restore 250 HP instantly.',
        effect: { heal: 250 },
    },
    ultimate_potion: {
        id: 'ultimate_potion',
        name: 'Potion of Rebirth',
        type: 'consumable',
        cost: 325,
        icon: '🔥',
        color: '#FF6F00',
        description: 'Full heal + 30% max HP bonus 30s.',
        effect: { heal: 9999, buff: { id: 'rebirth', duration: 30, stats: { bonusMaxHp: 0.3 } } },
    },
    mana_potion: {
        id: 'mana_potion',
        name: 'Mana Potion',
        type: 'consumable',
        cost: 28,
        icon: '💙',
        color: '#2196F3',
        description: 'Reset all spell cooldowns.',
        effect: { resetCooldowns: true },
    },
    poison_vial: {
        id: 'poison_vial',
        name: 'Vial of Poison',
        type: 'consumable',
        cost: 40,
        icon: '☠️',
        color: '#7CB342',
        description: 'Poisons target enemy for 10dps/8s.',
        effect: { buff: { id: 'poison_aura', duration: 8, stats: { poisonAura: 10 } } },
    },
    elixir_of_speed: {
        id: 'elixir_of_speed',
        name: 'Elixir of Speed',
        type: 'consumable',
        cost: 50,
        icon: '💨',
        color: '#00BCD4',
        description: '+40% move speed for 15 seconds.',
        effect: { buff: { id: 'speed_elixir', duration: 15, stats: { speedMult: 1.4 } } },
    },
    elixir_of_might: {
        id: 'elixir_of_might',
        name: 'Elixir of Might',
        type: 'consumable',
        cost: 65,
        icon: '💪',
        color: '#FF9800',
        description: '+50% attack damage for 15 seconds.',
        effect: { buff: { id: 'might_elixir', duration: 15, stats: { damageMult: 1.5 } } },
    },
    elixir_of_iron: {
        id: 'elixir_of_iron',
        name: 'Elixir of Iron',
        type: 'consumable',
        cost: 58,
        icon: '🛡️',
        color: '#607D8B',
        description: '+10 armor for 20 seconds.',
        effect: { buff: { id: 'iron_elixir', duration: 20, stats: { bonusArmor: 10 } } },
    },

    // --- WEAPONS (7 items) ---
    iron_sword: {
        id: 'iron_sword',
        name: 'Iron Sword',
        type: 'equipment',
        cost: 75,
        icon: '🗡️',
        color: '#B0BEC5',
        description: '+8 attack damage.',
        effect: { stat: 'attackDamage', value: 8 },
    },
    demon_blade: {
        id: 'demon_blade',
        name: 'Demon Blade',
        type: 'equipment',
        cost: 200,
        icon: '🔪',
        color: '#D50000',
        description: '+20 attack damage. Lifesteal 10%.',
        effect: { stat: 'attackDamage', value: 20, lifesteal: 0.1 },
    },
    frost_axe: {
        id: 'frost_axe',
        name: 'Frost Axe',
        type: 'equipment',
        cost: 160,
        icon: '🪓',
        color: '#00BCD4',
        description: '+12 dmg. Slows enemies on hit.',
        effect: { stat: 'attackDamage', value: 12, special: 'frost_slow' },
    },
    shadow_dagger: {
        id: 'shadow_dagger',
        name: 'Shadow Dagger',
        type: 'equipment',
        cost: 140,
        icon: '🗡️',
        color: '#7B1FA2',
        description: '+10 dmg. +5% crit chance.',
        effect: { stat: 'attackDamage', value: 10, special: 'crit_up' },
    },
    greatsword: {
        id: 'greatsword',
        name: 'Greatsword of Power',
        type: 'equipment',
        cost: 275,
        icon: '⚔️',
        color: '#FF6F00',
        description: '+35 attack damage.',
        effect: { stat: 'attackDamage', value: 35 },
    },
    vampiric_scepter: {
        id: 'vampiric_scepter',
        name: 'Vampiric Scepter',
        type: 'equipment',
        cost: 175,
        icon: '🩸',
        color: '#B71C1C',
        description: '+8 dmg. 18% lifesteal.',
        effect: { stat: 'attackDamage', value: 8, lifesteal: 0.18 },
    },
    thunder_hammer: {
        id: 'thunder_hammer',
        name: 'Thunder Hammer',
        type: 'equipment',
        cost: 225,
        icon: '🔨',
        color: '#FFD600',
        description: '+18 dmg. Chain lightning on crit.',
        effect: { stat: 'attackDamage', value: 18, special: 'chain_lightning' },
    },

    // --- ARMOR & DEFENSE (7 items) ---
    chainmail: {
        id: 'chainmail',
        name: 'Chainmail',
        type: 'equipment',
        cost: 90,
        icon: '🛡️',
        color: '#9E9E9E',
        description: '+5 armor.',
        effect: { stat: 'armor', value: 5 },
    },
    plate_armor: {
        id: 'plate_armor',
        name: 'Plate Armor',
        type: 'equipment',
        cost: 175,
        icon: '🛡️',
        color: '#FFC107',
        description: '+10 armor. +50 max HP.',
        effect: { stat: 'armor', value: 10, bonusMaxHp: 50 },
    },
    guardian_plate: {
        id: 'guardian_plate',
        name: 'Guardian Plate',
        type: 'equipment',
        cost: 250,
        icon: '🛡️',
        color: '#1A237E',
        description: '+15 armor. +100 max HP.',
        effect: { stat: 'armor', value: 15, bonusMaxHp: 100 },
    },
    evasion_cloak: {
        id: 'evasion_cloak',
        name: 'Evasion Cloak',
        type: 'equipment',
        cost: 110,
        icon: '🌫️',
        color: '#78909C',
        description: '+8% dodge chance.',
        effect: { special: 'dodge_up', dodgeBonus: 0.08 },
    },
    magic_robe: {
        id: 'magic_robe',
        name: 'Magic Robe',
        type: 'equipment',
        cost: 100,
        icon: '👘',
        color: '#7E57C2',
        description: '+5 armor. Start fights with shield.',
        effect: { stat: 'armor', value: 5, special: 'shield_start' },
    },
    thornmail: {
        id: 'thornmail',
        name: 'Thornmail',
        type: 'equipment',
        cost: 190,
        icon: '🌵',
        color: '#2E7D32',
        description: 'Reflect 20% damage back.',
        effect: { special: 'thorns', thornsPercent: 0.2 },
    },
    regen_ring: {
        id: 'regen_ring',
        name: 'Ring of Regeneration',
        type: 'equipment',
        cost: 130,
        icon: '💚',
        color: '#00C853',
        description: '+2% HP regen per second.',
        effect: { special: 'regen_up', regenBonus: 0.02 },
    },

    // --- BOOTS (4 items) ---
    swift_boots: {
        id: 'swift_boots',
        name: 'Swift Boots',
        type: 'equipment',
        cost: 100,
        icon: '👢',
        color: '#8BC34A',
        description: '+25 move speed.',
        effect: { stat: 'speed', value: 25 },
    },
    winged_boots: {
        id: 'winged_boots',
        name: 'Winged Boots',
        type: 'equipment',
        cost: 175,
        icon: '👟',
        color: '#E0F7FA',
        description: '+50 move speed.',
        effect: { stat: 'speed', value: 50 },
    },
    greaves_of_swiftness: {
        id: 'greaves_of_swiftness',
        name: 'Greaves of Swiftness',
        type: 'equipment',
        cost: 250,
        icon: '⚡',
        color: '#FFEA00',
        description: '+80 move speed. +5% dodge.',
        effect: { stat: 'speed', value: 80, special: 'dodge_up', dodgeBonus: 0.05 },
    },
    plated_greaves: {
        id: 'plated_greaves',
        name: 'Plated Greaves',
        type: 'equipment',
        cost: 90,
        icon: '🥾',
        color: '#795548',
        description: '+10 speed. +3 armor.',
        effect: { stat: 'speed', value: 10, bonusArmor: 3 },
    },

    // --- ACCESSORIES / RINGS (7 items) ---
    berserker_ring: {
        id: 'berserker_ring',
        name: 'Berserker Ring',
        type: 'equipment',
        cost: 125,
        icon: '💍',
        color: '#FF5722',
        description: '+30% attack speed.',
        effect: { stat: 'attackSpeed', value: 0.3, isMultiplier: true },
    },
    amulet_of_vitality: {
        id: 'amulet_of_vitality',
        name: 'Amulet of Vitality',
        type: 'equipment',
        cost: 150,
        icon: '📿',
        color: '#4CAF50',
        description: '+100 max HP.',
        effect: { stat: 'maxHp', value: 100 },
    },
    ring_of_power: {
        id: 'ring_of_power',
        name: 'Ring of Power',
        type: 'equipment',
        cost: 200,
        icon: '💍',
        color: '#D500F9',
        description: '+50 max HP. +10% atk speed.',
        effect: { stats: [{ stat: 'maxHp', value: 50 }, { stat: 'attackSpeed', value: 0.1 }] },
    },
    ring_of_wealth: {
        id: 'ring_of_wealth',
        name: 'Ring of Wealth',
        type: 'equipment',
        cost: 1000,
        icon: '💰',
        color: '#FFD700',
        description: '+50% gold from all sources.',
        effect: { special: 'gold_bonus', goldMult: 1.5 },
    },
    ruby_crystal: {
        id: 'ruby_crystal',
        name: 'Ruby Crystal',
        type: 'equipment',
        cost: 75,
        icon: '🔴',
        color: '#F44336',
        description: '+60 max HP.',
        effect: { stat: 'maxHp', value: 60 },
    },
    sapphire_ring: {
        id: 'sapphire_ring',
        name: 'Sapphire Ring',
        type: 'equipment',
        cost: 125,
        icon: '🔵',
        color: '#1565C0',
        description: '+15% spell cooldown reduction.',
        effect: { special: 'cdr', cdrPercent: 0.15 },
    },
    emerald_ring: {
        id: 'emerald_ring',
        name: 'Emerald Ring',
        type: 'equipment',
        cost: 150,
        icon: '🟢',
        color: '#00C853',
        description: '+2 HP/sec regen. +5 armor.',
        effect: { special: 'regen_up', regenBonus: 0.02, stats: [{ stat: 'armor', value: 5 }] },
    },

    // --- SPECIAL / LEGENDARY (7 items) ---
    cloak_of_shadows: {
        id: 'cloak_of_shadows',
        name: 'Cloak of Shadows',
        type: 'equipment',
        cost: 175,
        icon: '🌑',
        color: '#311B92',
        description: 'Invisible 3s every 30s.',
        effect: { special: 'shadow_cloak' },
    },
    fire_amulet: {
        id: 'fire_amulet',
        name: 'Fire Amulet',
        type: 'equipment',
        cost: 140,
        icon: '🔥',
        color: '#FF6D00',
        description: 'Burns enemies for 3s on hit.',
        effect: { special: 'fire_touch', burnDuration: 3, burnDps: 8 },
    },
    phoenix_feather: {
        id: 'phoenix_feather',
        name: 'Phoenix Feather',
        type: 'equipment',
        cost: 300,
        icon: '🪶',
        color: '#FF6F00',
        description: 'Revive on death once (50% HP).',
        effect: { special: 'revive' },
    },
    titan_belt: {
        id: 'titan_belt',
        name: 'Titan Belt',
        type: 'equipment',
        cost: 225,
        icon: '🔗',
        color: '#8D6E63',
        description: '+200 max HP. +5 armor.',
        effect: { stats: [{ stat: 'maxHp', value: 200 }, { stat: 'armor', value: 5 }] },
    },
    executioner_axe: {
        id: 'executioner_axe',
        name: "Executioner's Axe",
        type: 'equipment',
        cost: 250,
        icon: '🪓',
        color: '#B71C1C',
        description: '+25 dmg. 20% chance to execute (<20% HP enemies).',
        effect: { stat: 'attackDamage', value: 25, special: 'execute' },
    },
    storm_cape: {
        id: 'storm_cape',
        name: 'Storm Cape',
        type: 'equipment',
        cost: 225,
        icon: '🧣',
        color: '#1A237E',
        description: 'Lightning aura: 10dps to nearby enemies.',
        effect: { special: 'storm_aura', auraDps: 10, auraRange: 100 },
    },
    divine_crown: {
        id: 'divine_crown',
        name: 'Divine Crown',
        type: 'equipment',
        cost: 400,
        icon: '👑',
        color: '#FFD700',
        description: '+5 all stats. +1 skill point. Shiny.',
        effect: { stats: [{ stat: 'attackDamage', value: 5 }, { stat: 'armor', value: 5 }, { stat: 'speed', value: 15 }, { stat: 'maxHp', value: 75 }], skillPoint: 1 },
    },

    // --- SPELL TOMES & SCROLLS (6 items) ---
    tome_of_power: {
        id: 'tome_of_power',
        name: 'Tome of Power',
        type: 'consumable',
        cost: 125,
        icon: '📖',
        color: '#AB47BC',
        description: 'Gain 1 skill point.',
        effect: { skillPoint: 1 },
    },
    ancient_tome: {
        id: 'ancient_tome',
        name: 'Ancient Tome',
        type: 'consumable',
        cost: 250,
        icon: '📕',
        color: '#6A1B9A',
        description: 'Gain 2 skill points.',
        effect: { skillPoint: 2 },
    },
    scroll_of_lightning: {
        id: 'scroll_of_lightning',
        name: 'Scroll of Lightning',
        type: 'consumable',
        cost: 95,
        icon: '⚡',
        color: '#FFEB3B',
        description: 'Deal 60 AoE damage.',
        effect: { aoeDamage: 60, aoeRange: 120 },
    },
    scroll_of_meteor: {
        id: 'scroll_of_meteor',
        name: 'Scroll of Meteor',
        type: 'consumable',
        cost: 190,
        icon: '☄️',
        color: '#FF4500',
        description: 'Deal 150 AoE damage.',
        effect: { aoeDamage: 150, aoeRange: 150 },
    },
    scroll_of_healing: {
        id: 'scroll_of_healing',
        name: 'Scroll of Healing',
        type: 'consumable',
        cost: 65,
        icon: '📜',
        color: '#66BB6A',
        description: 'Heal 60 HP to you + nearby.',
        effect: { aoeHeal: 60, aoeRange: 100 },
    },
    scroll_of_protection: {
        id: 'scroll_of_protection',
        name: 'Scroll of Protection',
        type: 'consumable',
        cost: 75,
        icon: '🛡️',
        color: '#42A5F5',
        description: 'Grant 40 shield for 20s.',
        effect: { buff: { id: 'scroll_shield', duration: 20, stats: { shieldAmount: 40 } } },
    },

    // --- LATE-GAME LEGENDARIES (high cost, deep floors only) ---
    ascended_plate: {
        id: 'ascended_plate',
        name: 'Ascended Plate',
        type: 'equipment',
        cost: 600,
        icon: '🛡️',
        color: '#FFD700',
        description: '+25 armor. +150 max HP.',
        effect: { stat: 'armor', value: 25, bonusMaxHp: 150 },
    },
    archmage_robe: {
        id: 'archmage_robe',
        name: 'Archmage Robe',
        type: 'equipment',
        cost: 550,
        icon: '👘',
        color: '#9C27B0',
        description: '+12 armor. +25% spell cooldown reduction.',
        effect: { stat: 'armor', value: 12, special: 'cdr', cdrPercent: 0.25 },
    },
    legendary_blade: {
        id: 'legendary_blade',
        name: 'Legendary Blade',
        type: 'equipment',
        cost: 750,
        icon: '⚔️',
        color: '#FF1744',
        description: '+50 attack damage. 15% lifesteal.',
        effect: { stat: 'attackDamage', value: 50, lifesteal: 0.15 },
    },
};

/** Generate a random shop inventory of items (more items, and pricier ones, on deeper floors) */
export function generateShopInventory(floorNumber, itemCount = null) {
    const allItems = Object.keys(SHOP_ITEMS);

    // More items on deeper floors — way more than you can afford
    const baseCount = 10 + Math.floor(floorNumber / 2); // 10-14 items
    const count = itemCount || Math.min(baseCount, allItems.length);

    // Higher floors = more expensive items become available
    const availableItems = allItems.filter(key => {
        const item = SHOP_ITEMS[key];
        if (floorNumber < 2 && item.cost > 150) return false;
        if (floorNumber < 4 && item.cost > 300) return false;
        if (floorNumber < 6 && item.cost > 500) return false;
        if (floorNumber < 8 && item.cost > 1000) return false;
        return true;
    });

    const picks = [...availableItems].sort(() => Math.random() - 0.5);
    const finalCount = Math.min(count, picks.length);
    const inventory = [];

    // Prices creep up on deeper floors — about +8% per floor past floor 1,
    // plus a flat 120% jump from floor 2 onward.
    let floorMult = 1 + Math.max(0, floorNumber - 1) * 0.08;
    if (floorNumber >= 2) floorMult *= 2.2;

    for (let i = 0; i < finalCount; i++) {
        const item = { ...SHOP_ITEMS[picks[i]] };
        item.cost = Math.round(item.cost * floorMult * 3);
        inventory.push(item);
    }

    return inventory;
}

/**
 * Ranged-class champions (elf, pyro) get only half the armor/max-HP value
 * from items — squishy glass-cannon archetypes shouldn't be able to
 * out-tank melee bruisers just by stacking defensive gear.
 */
function isRangedClass(player) {
    const champ = CHAMPIONS[player.championId];
    return !!(champ && champ.class === 'ranged');
}

/**
 * Apply a permanent stat boost. Base stats must be updated too —
 * the buff system recalculates current stats from base every frame.
 */
function applyStatBoost(player, stat, value) {
    switch (stat) {
        case 'attackDamage':
            player.attackDamage += value;
            player.baseAttackDamage += value;
            break;
        case 'armor':
            if (isRangedClass(player)) value = Math.round(value * 0.5);
            player.armor += value;
            if (player._baseArmor !== undefined) player._baseArmor += value;
            break;
        case 'speed':
            player.speed += value;
            player.baseSpeed += value;
            break;
        case 'maxHp':
            if (isRangedClass(player)) value = Math.round(value * 0.5);
            player.maxHp += value;
            player.hp += value;
            break;
        case 'attackSpeed':
            player.attackSpeed += value;
            player.baseAttackSpeed += value;
            break;
    }
}

/** Apply an item effect to the player */
export function applyItemEffect(player, item) {
    if (!item || !item.effect) return false;

    const e = item.effect;

    // Heal
    if (e.heal) {
        player.hp = Math.min(player.maxHp, player.hp + e.heal);
    }

    // Reset cooldowns
    if (e.resetCooldowns) {
        for (const key of ['q', 'w', 'e', 'r']) {
            const spell = player.spells[key];
            if (spell) spell.cooldown = 0;
        }
    }

    // Buff
    if (e.buff) {
        player.buffs = player.buffs || [];
        player.buffs.push({
            id: e.buff.id,
            duration: e.buff.duration,
            maxDuration: e.buff.duration,
            stats: { ...e.buff.stats },
            flags: {},
        });
        // Shield-granting buffs (Scroll of Protection) apply immediately
        if (e.buff.stats && e.buff.stats.shieldAmount) {
            player.shield += e.buff.stats.shieldAmount;
            player.shieldTimer = e.buff.duration;
        }
    }

    // Stat boosts — single stat or a list of them
    if (e.stat) {
        applyStatBoost(player, e.stat, e.value);
    }
    if (e.stats) {
        for (const s of e.stats) {
            applyStatBoost(player, s.stat, s.value);
        }
    }
    if (e.bonusMaxHp) {
        const bonus = isRangedClass(player) ? Math.round(e.bonusMaxHp * 0.5) : e.bonusMaxHp;
        player.maxHp += bonus;
        player.hp += bonus;
    }
    if (e.bonusArmor) {
        const bonus = isRangedClass(player) ? Math.round(e.bonusArmor * 0.5) : e.bonusArmor;
        player.armor += bonus;
        if (player._baseArmor !== undefined) player._baseArmor += bonus;
    }

    // Spell tome
    if (e.skillPoint) {
        player.skillPoints += e.skillPoint;
    }

    // AoE damage scroll
    if (e.aoeDamage) {
        player._pendingAoE = { damage: e.aoeDamage, range: e.aoeRange };
    }

    // AoE heal scroll
    if (e.aoeHeal) {
        player._pendingAoEHeal = { heal: e.aoeHeal, range: e.aoeRange };
    }

    // Special items
    if (e.special) {
        switch (e.special) {
            case 'shadow_cloak': player._shadowCloak = true; break;
            case 'fire_touch': player._fireTouch = e; break;
            case 'dodge_up':
                player._dodgeBonus = (player._dodgeBonus || 0) + (e.dodgeBonus || 0.08);
                break;
            case 'gold_bonus':
                player._goldMult = (player._goldMult || 1) * (e.goldMult || 1.5);
                break;
            case 'regen_up':
                player._regenBonus = (player._regenBonus || 0) + (e.regenBonus || 0.02);
                break;
            case 'thorns':
                player._thornsPercent = (player._thornsPercent || 0) + (e.thornsPercent || 0.2);
                break;
            case 'cdr':
                player._cdr = (player._cdr || 0) + (e.cdrPercent || 0.15);
                break;
            case 'revive':
                player._hasRevive = true;
                break;
            case 'execute':
                player._executeChance = 0.2;
                break;
            case 'storm_aura':
                player._stormAura = { dps: e.auraDps || 10, range: e.auraRange || 100 };
                break;
            case 'frost_slow':
                player._frostSlow = true;
                break;
            case 'crit_up':
                // Handled in combat crit calculation
                player._critBonus = (player._critBonus || 0) + 0.05;
                break;
            case 'chain_lightning':
                player._chainLightning = true;
                break;
        }
    }

    // Lifesteal
    if (e.lifesteal) {
        player._lifesteal = (player._lifesteal || 0) + e.lifesteal;
    }

    return true;
}