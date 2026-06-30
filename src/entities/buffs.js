// buffs.js — buff/debuff system for temporary stat modifications
// Supports both items system keys and spell system keys

/**
 * Add a buff to an entity
 */
export function addBuff(entity, id, duration, stats = {}, flags = {}) {
    entity.buffs = entity.buffs.filter(b => b.id !== id);
    entity.buffs.push({
        id,
        duration,
        maxDuration: duration,
        stats,
        flags,
    });
    applyBuffStats(entity);
}

/** Remove a buff by ID */
export function removeBuff(entity, id) {
    entity.buffs = entity.buffs.filter(b => b.id !== id);
    applyBuffStats(entity);
}

/** Check if entity has buff */
export function hasBuff(entity, id) {
    return entity.buffs.some(b => b.id === id);
}

/** Update all buffs on entity (call each frame with dt) */
export function updateBuffs(entity, dt) {
    if (!entity.buffs || entity.buffs.length === 0) return;

    for (let i = entity.buffs.length - 1; i >= 0; i--) {
        const buff = entity.buffs[i];
        buff.duration -= dt;

        // Heal-over-time buffs (Divine Light)
        if (buff.stats && buff.stats.hotHealPerSec && entity.alive && entity.hp < entity.maxHp) {
            buff._hotAccum = (buff._hotAccum || 0) + buff.stats.hotHealPerSec * dt;
            if (buff._hotAccum >= 1) {
                const heal = Math.floor(buff._hotAccum);
                buff._hotAccum -= heal;
                entity.hp = Math.min(entity.maxHp, entity.hp + heal);
            }
        }

        if (buff.duration <= 0) {
            entity.buffs.splice(i, 1);
        }
    }

    applyBuffStats(entity);
}

/** Recalculate entity stats from all active buffs */
function applyBuffStats(entity) {
    // Reset to base stats
    if (entity.baseSpeed !== undefined) entity.speed = entity.baseSpeed;
    if (entity.baseAttackDamage !== undefined) entity.attackDamage = entity.baseAttackDamage;
    entity.attackSpeed = entity.baseAttackSpeed || entity.attackSpeed;
    // Armor resets to base (original armor is stored as _baseArmor)
    if (entity._baseArmor === undefined) entity._baseArmor = entity.armor;
    entity.armor = entity._baseArmor;
    entity.invisible = false;

    for (const buff of entity.buffs) {
        const s = buff.stats;

        // Speed modifiers (support both naming conventions)
        if (s.speedFlat !== undefined) entity.speed += s.speedFlat;
        if (s.speedMultiplier !== undefined) entity.speed *= s.speedMultiplier;
        if (s.speedMult !== undefined) entity.speed *= s.speedMult;

        // Damage modifiers
        if (s.attackDamageFlat !== undefined) entity.attackDamage += s.attackDamageFlat;
        if (s.damageMultiplier !== undefined) entity.attackDamage *= s.damageMultiplier;
        if (s.damageMult !== undefined) entity.attackDamage *= s.damageMult;

        // Attack speed modifiers
        if (s.attackSpeedFlat !== undefined) entity.attackSpeed += s.attackSpeedFlat;
        if (s.attackSpeedMultiplier !== undefined) entity.attackSpeed *= s.attackSpeedMultiplier;

        // Armor modifiers
        if (s.armorFlat !== undefined) entity.armor += s.armorFlat;
        if (s.bonusArmor !== undefined) entity.armor += s.bonusArmor;

        // Invisibility flag (flags may be absent on item-granted buffs)
        if (buff.flags && buff.flags.invisible) entity.invisible = true;
    }
}