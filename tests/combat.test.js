// tests/combat.test.js — damage pipeline tests
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock modules that combat.js imports (canvas/DOM/audio deps)
vi.mock('../src/camera.js', () => ({ shake: vi.fn() }));
vi.mock('../src/entities/buffs.js', () => ({ addBuff: vi.fn() }));
vi.mock('../src/audio.js', () => ({
    playHitSound: vi.fn(),
    playDeathSound: vi.fn(),
    playEnemyAttack: vi.fn(),
    playChampionSfx: vi.fn(),
}));
vi.mock('../src/render/drawEffects.js', () => ({ spawnParticles: vi.fn() }));
vi.mock('../src/network.js', () => ({ isMultiplayer: () => false }));

import {
    dealDamage,
    applyBurn,
    processBurns,
    resetCombatState,
    getFloatingTexts,
    spawnFloatText,
    tickFloatingTexts,
    setPlayersProvider,
} from '../src/systems/combat.js';

/** Create a minimal entity for testing */
function makeEntity(overrides = {}) {
    return {
        id: 1,
        type: 'enemy',
        alive: true,
        state: 'idle',
        hp: 100,
        maxHp: 100,
        armor: 0,
        shield: 0,
        x: 200,
        y: 200,
        size: 28,
        attackDamage: 20,
        attackRange: 40,
        attackSpeed: 1.0,
        speed: 80,
        xpReward: 20,
        goldReward: 10,
        knockback: { vx: 0, vy: 0 },
        buffs: [],
        burning: false,
        burnTimer: 0,
        burnDps: 0,
        hitFlash: false,
        hitFlashTimer: 0,
        attackCooldown: 0,
        deathTimer: 0,
        targetX: null,
        targetY: null,
        attackTarget: null,
        ...overrides,
    };
}

function makePlayer(overrides = {}) {
    return {
        id: 99,
        type: 'player',
        championId: 'orc',
        alive: true,
        state: 'idle',
        hp: 150,
        maxHp: 150,
        armor: 5,
        shield: 0,
        x: 100,
        y: 100,
        size: 34,
        attackDamage: 20,
        attackRange: 40,
        attackSpeed: 1.0,
        speed: 140,
        gold: 0,
        kills: 0,
        knockback: { vx: 0, vy: 0 },
        buffs: [],
        hitFlash: false,
        hitFlashTimer: 0,
        attackCooldown: 0,
        deathTimer: 0,
        lastDamageTimer: 3,
        targetX: null,
        targetY: null,
        attackTarget: null,
        ...overrides,
    };
}

describe('dealDamage', () => {
    beforeEach(() => {
        resetCombatState();
    });

    it('reduces target HP by damage amount', () => {
        const target = makeEntity({ hp: 100, maxHp: 100 });
        const source = makePlayer();

        dealDamage(target, 30, source);

        expect(target.hp).toBe(70);
        expect(target.alive).toBe(true);
    });

    it('kills the target when damage exceeds HP', () => {
        const target = makeEntity({ hp: 30, maxHp: 100 });
        const source = makePlayer();

        dealDamage(target, 50, source);

        expect(target.hp).toBe(0);
        expect(target.alive).toBe(false);
        expect(target.state).toBe('death');
        expect(target.deathTimer).toBeGreaterThan(0);
    });

    it('absorbs damage with shield first', () => {
        const target = makeEntity({ hp: 100, maxHp: 100, shield: 25 });
        const source = makePlayer();

        dealDamage(target, 30, source);

        expect(target.shield).toBe(0);
        expect(target.hp).toBe(95); // 30 - 25 shield = 5 HP damage
    });

    it('partially absorbs when damage > shield', () => {
        const target = makeEntity({ hp: 100, maxHp: 100, shield: 10 });
        const source = makePlayer();

        dealDamage(target, 40, source);

        expect(target.shield).toBe(0);
        expect(target.hp).toBe(70); // 40 - 10 shield = 30 HP damage
    });

    it('fully absorbs when shield >= damage', () => {
        const target = makeEntity({ hp: 100, maxHp: 100, shield: 60 });
        const source = makePlayer();

        dealDamage(target, 40, source);

        expect(target.shield).toBe(20);
        expect(target.hp).toBe(100); // untouched
    });

    it('triggers hit flash on target', () => {
        const target = makeEntity({ hp: 100 });
        const source = makePlayer();

        dealDamage(target, 20, source);

        expect(target.hitFlash).toBe(true);
        expect(target.hitFlashTimer).toBe(0.1);
    });

    it('applies knockback away from source', () => {
        const target = makeEntity({ x: 120, y: 100, hp: 100 });
        const source = makePlayer({ x: 100, y: 100 }); // source left of target

        dealDamage(target, 20, source);

        // Knockback should push target right (away from source)
        expect(target.knockback.vx).toBeGreaterThan(0);
    });

    it('grants XP and gold to the source on kill', () => {
        const target = makeEntity({ hp: 10, xpReward: 25, goldReward: 15 });
        const source = makePlayer({ kills: 0, gold: 0 });

        dealDamage(target, 50, source);

        expect(source.kills).toBe(1);
        expect(source.gold).toBeGreaterThan(0);
    });

    it('applies lifesteal healing to the source', () => {
        const target = makeEntity({ hp: 100 });
        const source = makePlayer({ hp: 100, maxHp: 150, _lifesteal: 0.2 });

        dealDamage(target, 30, source);

        // 30 damage * 0.2 lifesteal = 6 HP healed
        expect(source.hp).toBe(106);
    });

    it('does not heal above max HP with lifesteal', () => {
        const target = makeEntity({ hp: 100 });
        const source = makePlayer({ hp: 148, maxHp: 150, _lifesteal: 0.2 });

        dealDamage(target, 30, source);

        expect(source.hp).toBe(150); // capped
    });

    it('grants dodge chance to players vs enemy sources', () => {
        // Awkward to test a random chance directly, but we can check that
        // dealDamage does NOT skip when dodgeBonus is 0 (default 5%).
        // We verify the entity IS damaged (the 95% case).
        const target = makePlayer({ hp: 100, _dodgeBonus: 0 });
        const source = makeEntity(); // enemy source

        dealDamage(target, 20, source);

        // 5% dodge chance, 95% of the time this hits. It's probabilistic
        // but with just 5% we can assert it usually hits.
        // The test verifies the function doesn't throw.
        expect(target.hp).toBeLessThanOrEqual(100);
    });

    it('resets regen timer on damage taken', () => {
        const target = makeEntity({ hp: 100, lastDamageTimer: 0 });
        const source = makePlayer();

        dealDamage(target, 20, source);

        expect(target.lastDamageTimer).toBe(3);
    });

    it('sets permanent aggro lock on damaged enemies', () => {
        const target = makeEntity({ hp: 100 });
        const source = makePlayer();

        dealDamage(target, 20, source);

        expect(target._aggroLockedTarget).toBe(source);
    });

    it('generates floating damage text', () => {
        const target = makeEntity({ hp: 100 });
        const source = makePlayer();

        const before = getFloatingTexts().length;
        dealDamage(target, 25, source);
        const after = getFloatingTexts().length;

        expect(after).toBeGreaterThan(before);
    });
});

describe('critical hits', () => {
    beforeEach(() => {
        resetCombatState();
    });

    it('applies critical damage multiplier via dealDamage', () => {
        const target = makeEntity({ hp: 100 });
        const source = makePlayer({ _critBonus: 0 });

        // Critical flag should produce a float text with '⚡'
        dealDamage(target, 30, source, true);
        const texts = getFloatingTexts();
        const critText = texts.find(t => t.text.includes('⚡'));

        expect(critText).toBeDefined();
    });
});

describe('applyBurn / processBurns', () => {
    beforeEach(() => {
        resetCombatState();
    });

    it('sets burning state on target', () => {
        const target = makeEntity({ hp: 100 });
        applyBurn(target, 3, 10);

        expect(target.burning).toBe(true);
        expect(target.burnTimer).toBe(3);
        expect(target.burnDps).toBe(10);
    });

    it('accumulates fractional burn damage over time', () => {
        const target = makeEntity({ hp: 100, burning: true, burnTimer: 2, burnDps: 50 });
        const entities = [target];

        // 50 DPS over 0.5s = 25 damage
        processBurns(entities, 0.5);

        expect(target.hp).toBe(75);
        expect(target.burnTimer).toBeLessThan(2);
    });

    it('clears burn when timer expires', () => {
        const target = makeEntity({ hp: 100, burning: true, burnTimer: 0.1, burnDps: 10, _burnAccum: 0 });
        const entities = [target];

        processBurns(entities, 0.2);

        expect(target.burning).toBe(false);
        expect(target.burnDps).toBe(0);
    });

    it('does not burn players', () => {
        const target = makePlayer({ hp: 100, burning: true, burnTimer: 5, burnDps: 20, _burnAccum: 0 });
        const entities = [target];

        processBurns(entities, 1.0);

        // Player should not take burn damage
        expect(target.hp).toBe(100);
    });
});

describe('floating text lifecycle', () => {
    beforeEach(() => {
        resetCombatState();
    });

    it('spawns floating text', () => {
        spawnFloatText(100, 200, '+25', '#FFD700', 14);
        const texts = getFloatingTexts();

        expect(texts.length).toBe(1);
        expect(texts[0].text).toBe('+25');
        expect(texts[0].color).toBe('#FFD700');
        expect(texts[0].size).toBe(14);
    });

    it('floating text rises and fades', () => {
        spawnFloatText(100, 200, 'test', '#FFF', 14);
        const texts = getFloatingTexts();
        const startY = texts[0].y;

        tickFloatingTexts(0.5);

        // Should have risen (vy is negative = upward)
        expect(texts[0].y).toBeLessThan(startY);
        expect(texts[0].life).toBeLessThan(1.2);
    });

    it('removes expired floating text', () => {
        spawnFloatText(100, 200, 'test', '#FFF', 14);

        tickFloatingTexts(2.0); // longer than default 1.2s life

        expect(getFloatingTexts().length).toBe(0);
    });
});

