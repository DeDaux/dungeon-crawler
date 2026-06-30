// enemySpells.js — spell definitions used exclusively by enemies
// Enemies use simplified versions of player spells, tuned for challenge.
// Keys: q, w, e — bosses also get r

export const ENEMY_SPELLS = {
    // ==================== GOBLIN ====================
    goblin_tackle: {
        id: 'goblin_tackle',
        key: 'e',
        cooldown: 5,
        type: 'dash',
        range: 120,
        damage: 8,
        stunDuration: 0.3,
        color: '#8B4513',
        description: 'Tackles the player, dealing damage and stunning briefly.',
    },

    // ==================== BAT ====================
    screech: {
        id: 'screech',
        key: 'q',
        cooldown: 6,
        type: 'aoe_self',
        radius: 60,
        damage: 6,
        stunDuration: 0.4,
        color: '#7B1FA2',
        description: 'Lets out a piercing screech, stunning nearby enemies.',
    },

    // ==================== SLIME ====================
    goo_spray: {
        id: 'goo_spray',
        key: 'w',
        cooldown: 5,
        type: 'cone',
        range: 50,
        coneAngle: Math.PI / 4,
        damage: 5,
        slowAmount: 0.4,
        slowDuration: 2,
        color: '#2E7D32',
        description: 'Sprays goo that slows the player.',
    },
    slime_split: {
        id: 'slime_split',
        key: 'e',
        cooldown: 12,
        type: 'passive_summon',
        color: '#2E7D32',
        description: 'Splits into two smaller slimes on death.',
    },

    // ==================== SKELETON ARCHER ====================
    arrow_volley: {
        id: 'arrow_volley',
        key: 'q',
        cooldown: 4,
        type: 'projectile',
        projectileSpeed: 350,
        range: 200,
        damage: 10,
        projectileSize: 5,
        color: '#D7CCC8',
        description: 'Fires a fast arrow volley.',
    },
    trap_arrow: {
        id: 'trap_arrow',
        key: 'w',
        cooldown: 8,
        type: 'projectile',
        projectileSpeed: 300,
        range: 180,
        damage: 8,
        slowAmount: 0.6,
        slowDuration: 2,
        projectileSize: 6,
        color: '#BDBDBD',
        description: 'Fires a slowing trap arrow.',
    },

    // ==================== ORC WARRIOR ====================
    orc_cleave: {
        id: 'orc_cleave',
        key: 'q',
        cooldown: 4,
        type: 'cone',
        range: 56,
        coneAngle: Math.PI / 3,
        damage: 15,
        color: '#556B2F',
        description: 'Sweeps a weapon in a wide arc.',
    },
    orc_stomp: {
        id: 'orc_stomp',
        key: 'w',
        cooldown: 7,
        type: 'aoe_self',
        radius: 64,
        damage: 10,
        stunDuration: 0.5,
        color: '#795548',
        description: 'Stomps the ground, stunning nearby enemies.',
    },
    orc_charge: {
        id: 'orc_charge',
        key: 'e',
        cooldown: 8,
        type: 'dash',
        range: 160,
        damage: 20,
        stunDuration: 0.4,
        color: '#66BB6A',
        description: 'Charges at the player dealing heavy damage.',
    },

    // ==================== DEMON HOUND ====================
    flame_bite: {
        id: 'flame_bite',
        key: 'q',
        cooldown: 4,
        type: 'cone',
        range: 40,
        coneAngle: Math.PI / 4,
        damage: 12,
        burnDuration: 3,
        burnDps: 8,
        color: '#FF6D00',
        description: 'Breathes fire, burning the player.',
    },
    hell_pounce: {
        id: 'hell_pounce',
        key: 'e',
        cooldown: 6,
        type: 'dash',
        range: 200,
        damage: 15,
        color: '#8B0000',
        description: 'Leaps at the player from a distance.',
    },

    // ==================== NECROMANCER ====================
    dark_bolt: {
        id: 'dark_bolt',
        key: 'q',
        cooldown: 3,
        type: 'projectile',
        projectileSpeed: 320,
        range: 200,
        damage: 14,
        projectileSize: 6,
        color: '#7C4DFF',
        description: 'Fires a bolt of dark energy.',
    },
    life_drain: {
        id: 'life_drain',
        key: 'w',
        cooldown: 7,
        type: 'projectile',
        projectileSpeed: 280,
        range: 180,
        damage: 10,
        lifesteal: 0.5,
        projectileSize: 7,
        color: '#E040FB',
        description: 'Drains life from the player, healing the caster.',
    },
    summon_minion: {
        id: 'summon_minion',
        key: 'e',
        cooldown: 10,
        type: 'summon',
        summonType: 'skeleton_minion',
        range: 80,
        color: '#4B0082',
        description: 'Summons a skeleton minion to fight.',
    },

    // ==================== GIANT SPIDER ====================
    web_snare: {
        id: 'web_snare',
        key: 'q',
        cooldown: 5,
        type: 'projectile',
        projectileSpeed: 240,
        range: 160,
        damage: 5,
        slowAmount: 0.7,
        slowDuration: 2.5,
        projectileSize: 8,
        color: '#90A4AE',
        description: 'Fires a web that heavily slows the player.',
    },
    poison_bite: {
        id: 'poison_bite',
        key: 'w',
        cooldown: 6,
        type: 'aoe_self',
        radius: 40,
        damage: 8,
        burnDuration: 4,
        burnDps: 6,
        color: '#4CAF50',
        description: 'Deals poison damage over time.',
    },

    // ==================== DARK KNIGHT ====================
    dark_slash: {
        id: 'dark_slash',
        key: 'q',
        cooldown: 4,
        type: 'cone',
        range: 56,
        coneAngle: Math.PI / 3,
        damage: 18,
        color: '#424242',
        description: 'A sweeping dark slash.',
    },
    fear_aura: {
        id: 'fear_aura',
        key: 'w',
        cooldown: 8,
        type: 'aoe_self',
        radius: 70,
        damage: 5,
        stunDuration: 0.3,
        color: '#212121',
        description: 'Emits a fearful aura, briefly stunning enemies.',
    },
    shadow_dash: {
        id: 'shadow_dash',
        key: 'e',
        cooldown: 7,
        type: 'dash',
        range: 180,
        damage: 22,
        color: '#000000',
        description: 'Dashes through shadows at the player.',
    },

    // ==================== FIRE ELEMENTAL ====================
    fire_blast: {
        id: 'fire_blast',
        key: 'q',
        cooldown: 3,
        type: 'projectile',
        projectileSpeed: 300,
        range: 180,
        damage: 16,
        explosionRadius: 30,
        projectileSize: 7,
        color: '#FF6D00',
        description: 'Launches a fire blast that explodes.',
    },
    lava_pool: {
        id: 'lava_pool',
        key: 'w',
        cooldown: 6,
        type: 'ground_aoe',
        range: 100,
        wallLength: 60,
        duration: 3,
        damagePerSecond: 12,
        color: '#FF5722',
        description: 'Creates a pool of lava.',
    },

    // ==================== BOSS DRAGON ====================
    dragon_fire_breath: {
        id: 'dragon_fire_breath',
        key: 'q',
        cooldown: 3,
        type: 'cone',
        range: 80,
        coneAngle: Math.PI / 3,
        damage: 25,
        burnDuration: 4,
        burnDps: 15,
        color: '#FF5722',
        description: 'Breathes a cone of fire.',
    },
    tail_sweep: {
        id: 'tail_sweep',
        key: 'w',
        cooldown: 5,
        type: 'aoe_self',
        radius: 80,
        damage: 20,
        knockback: 200,
        color: '#795548',
        description: 'Sweeps its tail, knocking back enemies.',
    },
    wing_buffet: {
        id: 'wing_buffet',
        key: 'e',
        cooldown: 6,
        type: 'aoe_self',
        radius: 100,
        damage: 15,
        stunDuration: 0.3,
        color: '#BDBDBD',
        description: 'Beats its wings, stunning nearby enemies.',
    },
    dragon_meteor: {
        id: 'dragon_meteor',
        key: 'r',
        cooldown: 14,
        type: 'telegraph_aoe',
        range: 400,
        radius: 90,
        telegraphDuration: 1.3,
        damage: 45,
        shakeIntensity: 22,
        color: '#D50000',
        description: 'Calls down a colossal meteor — a glowing danger ring marks the impact zone. Get out before it lands!',
    },
};

// ═══════════════════════════════════════════════════════════════════════
//  HORROR CHAMPIONS — 10 nightmare stalkers, each with a full Q/W/E/R kit.
//  Available from floor 1, they relentlessly hunt the player. Built from a
//  compact spec table (mechanics reuse the same executeEnemyAbility types as
//  every other enemy) so the kit reads at a glance.
// ═══════════════════════════════════════════════════════════════════════
const HORROR_SPECS = {
    // The Smiling Man — a grinning stalker that blinks in and lunges.
    smiler: {
        q: { type: 'dash', cooldown: 6, range: 170, damage: 8, stunDuration: 0.25, color: '#f0f0f0', description: 'Lunges with an ear-to-ear grin.' },
        w: { type: 'aoe_self', cooldown: 9, radius: 95, damage: 5, stunDuration: 0.45, color: '#cfd8dc', description: 'A rictus grin freezes you in terror.' },
        e: { type: 'dash', cooldown: 8, range: 280, damage: 5, color: '#ffffff', description: 'Blinks across the dark to your side.' },
        r: { type: 'cone', cooldown: 14, range: 78, coneAngle: Math.PI / 1.8, damage: 13, stunDuration: 0.3, color: '#e0e0e0', description: '"Say cheese." A killing smile.' },
    },
    // The Veiled Nun — a floating habit and a screaming void beneath the veil.
    nun: {
        q: { type: 'projectile', cooldown: 3.5, range: 250, damage: 8, projectileSpeed: 300, projectileSize: 7, color: '#6a2da8', description: 'Hurls a bolt of unholy dark.' },
        w: { type: 'summon', cooldown: 13, summonType: 'wraithling', range: 90, color: '#4a2070', description: 'Calls writhing shades from the walls.' },
        e: { type: 'projectile', cooldown: 7, range: 220, damage: 6, projectileSpeed: 260, projectileSize: 8, slowAmount: 0.5, slowDuration: 2, color: '#7e57c2', description: 'A wail that drags at your legs.' },
        r: { type: 'telegraph_aoe', cooldown: 16, range: 420, radius: 105, telegraphDuration: 1.3, damage: 17, shakeIntensity: 16, color: '#4a148c', description: 'A lament of the damned crashes down.' },
    },
    // The Crawler — a body bent the wrong way, scuttling fast.
    crawler: {
        q: { type: 'dash', cooldown: 5, range: 230, damage: 8, color: '#7a5230', description: 'Pounces on all fours.' },
        w: { type: 'projectile', cooldown: 7, range: 180, damage: 4, projectileSpeed: 250, projectileSize: 8, slowAmount: 0.55, slowDuration: 2, color: '#8d9b6a', description: 'Spits clinging bile.' },
        e: { type: 'aoe_self', cooldown: 8, radius: 75, damage: 6, stunDuration: 0.25, color: '#6b4a2a', description: 'Skitters in a frenzy of limbs.' },
        r: { type: 'cone', cooldown: 13, range: 60, coneAngle: Math.PI / 2.2, damage: 11, color: '#3a2a1a', description: 'A frenzied rend of broken hands.' },
    },
    // The Weeping Child — it lures with sobs, then shrieks.
    weeper: {
        q: { type: 'projectile', cooldown: 3.5, range: 230, damage: 7, projectileSpeed: 290, projectileSize: 6, color: '#90caf9', description: 'A sorrow that cuts the air.' },
        w: { type: 'summon', cooldown: 14, summonType: 'wraithling', range: 80, color: '#64b5f6', description: 'Its tears birth small horrors.' },
        e: { type: 'dash', cooldown: 8, range: 250, damage: 5, color: '#bbdefb', description: 'It is suddenly behind you.' },
        r: { type: 'telegraph_aoe', cooldown: 15, range: 400, radius: 95, telegraphDuration: 1.2, damage: 15, shakeIntensity: 14, color: '#1565c0', description: 'A scream that buckles the floor.' },
    },
    // The Butcher — a mountain of meat and a cleaver.
    butcher: {
        q: { type: 'cone', cooldown: 5, range: 66, coneAngle: Math.PI / 3, damage: 11, color: '#b71c1c', description: 'A wet, heavy cleave.' },
        w: { type: 'dash', cooldown: 9, range: 210, damage: 9, stunDuration: 0.35, color: '#7f0000', description: 'Drags you in on a meat hook.' },
        e: { type: 'aoe_self', cooldown: 8, radius: 82, damage: 8, stunDuration: 0.4, color: '#9b2d2d', description: 'Stomps the slaughterhouse floor.' },
        r: { type: 'aoe_self', cooldown: 15, radius: 95, damage: 14, knockback: 200, color: '#c62828', description: 'A butchering rampage.' },
    },
    // The Hollow — a faceless tall thing that should not be.
    hollow: {
        q: { type: 'projectile', cooldown: 3.5, range: 240, damage: 7, projectileSpeed: 320, projectileSize: 6, color: '#37474f', description: 'Static tears at your eyes.' },
        w: { type: 'dash', cooldown: 7, range: 300, damage: 5, color: '#263238', description: 'It is not where it was.' },
        e: { type: 'aoe_self', cooldown: 9, radius: 105, damage: 4, stunDuration: 0.3, color: '#1c1c22', description: 'Dread radiates outward.' },
        r: { type: 'cone', cooldown: 14, range: 82, coneAngle: Math.PI / 1.5, damage: 13, color: '#0d0d12', description: 'A forest of black arms unfurls.' },
    },
    // The Wraith — a hateful spirit that drinks the living.
    wraith: {
        q: { type: 'projectile', cooldown: 3.5, range: 230, damage: 7, projectileSpeed: 300, projectileSize: 6, color: '#80deea', description: 'A shard of cold spite.' },
        w: { type: 'projectile', cooldown: 7, range: 200, damage: 7, projectileSpeed: 270, projectileSize: 8, lifesteal: 0.5, color: '#26c6da', description: 'Drains your warmth to mend itself.' },
        e: { type: 'dash', cooldown: 8, range: 250, damage: 5, color: '#b2ebf2', description: 'Phases through you with a chill.' },
        r: { type: 'telegraph_aoe', cooldown: 16, range: 420, radius: 110, telegraphDuration: 1.3, damage: 16, shakeIntensity: 15, color: '#00838f', description: 'A banshee shriek shatters the air.' },
    },
    // The Effigy — a stitched scarecrow that burns.
    effigy: {
        q: { type: 'cone', cooldown: 5, range: 58, coneAngle: Math.PI / 3, damage: 9, color: '#a1561b', description: 'Rakes you with thorn-fingers.' },
        w: { type: 'projectile', cooldown: 7, range: 200, damage: 6, projectileSpeed: 280, projectileSize: 7, burnDuration: 3, burnDps: 4, color: '#ff7043', description: 'Flings a fistful of embers.' },
        e: { type: 'dash', cooldown: 8, range: 190, damage: 7, stunDuration: 0.3, color: '#bf6019', description: 'Lunges and clutches.' },
        r: { type: 'ground_aoe', cooldown: 13, range: 120, wallLength: 70, duration: 4, damagePerSecond: 8, color: '#ff5722', description: 'Erupts into a harvest pyre.' },
    },
    // The Marionette — a cracked porcelain doll on unseen strings.
    doll: {
        q: { type: 'projectile', cooldown: 3.5, range: 220, damage: 7, projectileSpeed: 300, projectileSize: 5, color: '#cfd8dc', description: 'Looses a hail of needles.' },
        w: { type: 'summon', cooldown: 14, summonType: 'wraithling', range: 80, color: '#b0bec5', description: 'More dolls join the dance.' },
        e: { type: 'dash', cooldown: 8, range: 200, damage: 7, stunDuration: 0.25, color: '#eceff1', description: 'Yanks you in by the strings.' },
        r: { type: 'aoe_self', cooldown: 13, radius: 82, damage: 11, color: '#90a4ae', description: 'A whirling, shattering pirouette.' },
    },
    // The Parasite — a fleshy mass of mouths that lunges.
    leech: {
        q: { type: 'cone', cooldown: 3.5, range: 46, coneAngle: Math.PI / 2.5, damage: 8, color: '#8e2447', description: 'A ring of feeding mouths.' },
        w: { type: 'projectile', cooldown: 6, range: 180, damage: 6, projectileSpeed: 260, projectileSize: 7, slowAmount: 0.45, slowDuration: 1.8, color: '#ad1457', description: 'Spits a clot of clinging flesh.' },
        e: { type: 'dash', cooldown: 7, range: 190, damage: 8, color: '#6a1b3a', description: 'Engulfs the gap between you.' },
        r: { type: 'summon', cooldown: 14, summonType: 'wraithling', range: 70, color: '#880e4f', description: 'Births a swarm of spawn.' },
    },
};

// Expand the spec table into full ENEMY_SPELLS entries (id = `${type}_${key}`).
const HORROR_LOADOUTS = {};
for (const [type, kit] of Object.entries(HORROR_SPECS)) {
    HORROR_LOADOUTS[type] = {};
    for (const [key, def] of Object.entries(kit)) {
        const id = `${type}_${key}`;
        ENEMY_SPELLS[id] = { id, key, cooldown: def.cooldown || 6, ...def };
        HORROR_LOADOUTS[type][key] = id;
    }
}

/**
 * Get enemy ability loadout by enemy type.
 * Returns { q: spellId | null, w: spellId | null, e: spellId | null, r: spellId | null }
 */
export function getEnemyAbilities(enemyType) {
    const loadouts = {
        goblin: { e: 'goblin_tackle' },
        bat: { q: 'screech' },
        slime: { w: 'goo_spray', e: 'slime_split' },
        skeleton: { q: 'arrow_volley', w: 'trap_arrow' },
        orc_warrior: { q: 'orc_cleave', w: 'orc_stomp', e: 'orc_charge' },
        demon_hound: { q: 'flame_bite', e: 'hell_pounce' },
        necromancer: { q: 'dark_bolt', w: 'life_drain', e: 'summon_minion' },
        giant_spider: { q: 'web_snare', w: 'poison_bite' },
        dark_knight: { q: 'dark_slash', w: 'fear_aura', e: 'shadow_dash' },
        fire_elemental: { q: 'fire_blast', w: 'lava_pool' },
        boss_dragon: { q: 'dragon_fire_breath', w: 'tail_sweep', e: 'wing_buffet', r: 'dragon_meteor' },
        ...HORROR_LOADOUTS,
    };
    return loadouts[enemyType] || {};
}

/**
 * Get the full spell config for an enemy ability
 */
export function getEnemySpellConfig(spellId) {
    return ENEMY_SPELLS[spellId] || null;
}
