// towers.js — tower type definitions for Base Defense mode

export const TOWER_TYPES = {
    arrow: {
        id: 'arrow',
        name: 'Arrow Tower',
        description: 'Fast attacks against single targets',
        color: '#8BC34A',
        icon: '🏹',
        cost: 50,
        range: 150,
        attackSpeed: 1.5,   // attacks per second
        attackDamage: 12,
        hp: 160,            // structure HP — enemies can destroy it
        projectileSpeed: 500,
        projectileColor: '#8BC34A',
        projectileSize: 4,
    },
    cannon: {
        id: 'cannon',
        name: 'Cannon Tower',
        description: 'Slow area damage with splash',
        color: '#FF5722',
        icon: '💣',
        cost: 100,
        range: 130,
        attackSpeed: 0.5,
        attackDamage: 35,
        hp: 280,
        splashRadius: 40,
        projectileSpeed: 350,
        projectileColor: '#FF5722',
        projectileSize: 6,
    },
    frost: {
        id: 'frost',
        name: 'Frost Tower',
        description: 'Slows enemies while dealing damage',
        color: '#00BCD4',
        icon: '❄️',
        cost: 75,
        range: 140,
        attackSpeed: 0.8,
        attackDamage: 8,
        hp: 200,
        slowAmount: 0.5,    // 50% slow
        slowDuration: 2.0,
        projectileSpeed: 400,
        projectileColor: '#80DEEA',
        projectileSize: 5,
    },
    magic: {
        id: 'magic',
        name: 'Magic Tower',
        description: 'Channels magic bolts that hit multiple enemies',
        color: '#7C4DFF',
        icon: '🔮',
        cost: 120,
        range: 160,
        attackSpeed: 0.7,
        attackDamage: 20,
        hp: 170,
        chainCount: 3,      // hits up to 3 enemies
        chainRange: 60,     // chains to enemies within this range
        projectileSpeed: 450,
        projectileColor: '#B388FF',
        projectileSize: 5,
    },
};

/** Get tower config by id */
export function getTowerConfig(towerId) {
    return TOWER_TYPES[towerId] || null;
}

/** Get tower upgrade cost */
export function getUpgradeCost(tower) {
    const baseCost = tower.config.cost || 50;
    return Math.round(baseCost * (tower.level || 1) * 0.75);
}

/** Calculate upgraded damage for a tower level */
export function getTowerDamage(tower) {
    const base = tower.config.attackDamage || 10;
    const level = tower.level || 1;
    return Math.round(base * (1 + (level - 1) * 0.4));
}

/** Calculate upgraded range for a tower level */
export function getTowerRange(tower) {
    const base = tower.config.range || 100;
    const level = tower.level || 1;
    return base + (level - 1) * 10;
}

/** Max structure HP for a tower at its current level (+50% per level). */
export function getTowerMaxHp(tower) {
    const base = (tower.config && tower.config.hp) || 160;
    const level = tower.level || 1;
    return Math.round(base * (1 + (level - 1) * 0.5));
}
