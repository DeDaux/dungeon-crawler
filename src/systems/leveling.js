// leveling.js — XP, level-ups, and stat growth
import { playLevelUp } from '../audio.js';
import { spawnFloatText, queueSoundEvent } from './combat.js';

/**
 * Add XP to the player and check for level ups
 */
export function addXP(player, amount) {
    if (!player || !player.alive) return;
    player.xp += amount;

    while (player.xp >= player.xpToNext) {
        player.xp -= player.xpToNext;
        levelUp(player);
    }
}

/**
 * Perform a single level-up
 */
function levelUp(player) {
    player.level++;

    // Stat growth (League-like modest gains)
    player.maxHp += 10;
    player.hp += 10;
    player.attackDamage += 2;
    player.baseAttackDamage += 2;
    player.armor += 0.5;
    if (player._baseArmor !== undefined) player._baseArmor += 0.5;
    player.magicResist = (player.magicResist || 0) + 0.5;

    // Grant a skill point to rank up a spell
    player.skillPoints++;

    // Recalculate XP threshold for next level
    player.xpToNext = Math.round(100 * Math.pow(1.15, player.level - 1));

    // Feedback
    playLevelUp();
    queueSoundEvent({ type: 'levelUp' });
    spawnFloatText(player.x, player.y - 50, `⬆ LEVEL ${player.level}!`, '#FFD700', 22);
}

/**
 * Bring a player up to a target level silently (no popups/sound) by applying
 * the same per-level stat growth. Used to catch up a late-joining co-op guest
 * so they aren't dead weight. Heals to full afterward.
 */
export function catchUpToLevel(player, targetLevel) {
    while (player.level < targetLevel) {
        player.level++;
        player.maxHp += 10;
        player.attackDamage += 2;
        player.baseAttackDamage += 2;
        player.armor += 0.5;
        if (player._baseArmor !== undefined) player._baseArmor += 0.5;
        player.magicResist = (player.magicResist || 0) + 0.5;
        player.skillPoints++;
    }
    player.xpToNext = Math.round(100 * Math.pow(1.15, player.level - 1));
    player.hp = player.maxHp;
}
