// projectiles.js — projectile movement, collision, ground hazards

import { dealDamage, applyBurn } from './combat.js';
import { addBuff } from '../entities/buffs.js';

/**
 * Update all projectiles and hazards
 */
export function updateProjectiles(projectiles, entities, map, dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];

        if (!p.alive) {
            projectiles.splice(i, 1);
            continue;
        }

        // Hazards (ground AOE, meteors) handle differently
        if (p.type === 'hazard') {
            updateHazard(p, entities, dt);
            if (!p.alive) {
                projectiles.splice(i, 1);
            }
            continue;
        }

        // Move projectile
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // Range check
        const distFromStart = Math.hypot(p.x - p.startX, p.y - p.startY);
        if (distFromStart > p.maxRange) {
            p.alive = false;
            projectiles.splice(i, 1);
            continue;
        }

        // Wall collision
        if (map && !map.isWorldWalkable(p.x, p.y)) {
            // Explosion effect at wall
            if (p.explosionRadius > 0) {
                aoeDamage(p.x, p.y, p.explosionRadius, p.damage, p.source, entities);
            }
            p.alive = false;
            projectiles.splice(i, 1);
            continue;
        }

        // Entity collision (team-aware: enemy shots only hit the player, player shots only hit enemies)
        const isEnemyProj = p.team === 'enemy';

        // Piercing projectile: damage every overlapping target once and keep
        // flying (only walls / max range stop it, handled above).
        if (p.pierce) {
            for (const entity of entities) {
                if (!entity.alive) continue;
                if (entity === p.source) continue;
                if (isEnemyProj && entity.type !== 'player') continue;
                if (!isEnemyProj && entity.type === 'player') continue;
                if (p._hitIds && p._hitIds.has(entity.id)) continue;

                const dx = entity.x - p.x;
                const dy = entity.y - p.y;
                if (Math.hypot(dx, dy) < (entity.size * 0.5 + p.size)) {
                    dealDamage(entity, p.damage, p.source);
                    if (p.slowAmount > 0 && p.slowDuration > 0) {
                        entity.speed *= (1 - p.slowAmount);
                        entity.shadowStrikeSlow = p.slowDuration;
                    }
                    if (p._hitIds) p._hitIds.add(entity.id);
                }
            }
            continue; // never dies on contact
        }

        let hit = false;
        for (const entity of entities) {
            if (!entity.alive) continue;
            if (entity === p.source) continue;
            if (isEnemyProj && entity.type !== 'player') continue;
            if (!isEnemyProj && entity.type === 'player') continue;

            const dx = entity.x - p.x;
            const dy = entity.y - p.y;
            const dist = Math.hypot(dx, dy);

            if (dist < (entity.size * 0.5 + p.size)) {
                // Hit!
                if (p.explosionRadius > 0) {
                    // AOE projectile — damage all in radius
                    aoeDamage(p.x, p.y, p.explosionRadius, p.damage, p.source, entities);
                    // Apply burn from fireball
                    if (p.spellId === 'fireball') {
                        for (const e of entities) {
                            if (e.alive && e.type !== 'player') {
                                const edx = e.x - p.x;
                                const edy = e.y - p.y;
                                if (Math.hypot(edx, edy) <= p.explosionRadius) {
                                    applyBurn(e, 3, 10);
                                }
                            }
                        }
                    }
                } else {
                    // Single target
                    dealDamage(entity, p.damage, p.source);

                    // Slow from Shadow Strike
                    if (p.slowAmount > 0 && p.slowDuration > 0) {
                        entity.speed *= (1 - p.slowAmount);
                        // Restore after duration (simple: just tag it)
                        entity.shadowStrikeSlow = p.slowDuration;
                    }

                    // ── Enemy ability projectile effects ──
                    // Burn (e.g. Fire Blast, Flame Bite)
                    if (p._burnDuration > 0 && p._burnDps > 0) {
                        applyBurn(entity, p._burnDuration, p._burnDps);
                    }
                    // Slow from enemy projectiles (e.g. Web Snare, Trap Arrow)
                    if (p._slowAmount > 0 && p._slowDuration > 0 && entity.type === 'player') {
                        if (!entity._enemySlowTimer || entity._enemySlowTimer <= 0) {
                            entity.speed = Math.max(entity.speed * (1 - p._slowAmount), 30);
                        }
                        entity._enemySlowTimer = Math.max(entity._enemySlowTimer || 0, p._slowDuration);
                    }
                    // Lifesteal for the caster (e.g. Necromancer Life Drain)
                    if (p._lifesteal > 0 && p.source && p.source.alive) {
                        const heal = Math.max(1, Math.round(p.damage * p._lifesteal));
                        p.source.hp = Math.min(p.source.maxHp, p.source.hp + heal);
                    }
                }

                // Explosion on hit (even single-target mode if configured)
                if (p._explosionRadius > 0) {
                    aoeDamage(p.x, p.y, p._explosionRadius, Math.round(p.damage * 0.5), p.source, entities);
                }

                hit = true;
                break;
            }
        }

        if (hit) {
            p.alive = false;
            projectiles.splice(i, 1);
        }
    }

    // Process slow debuffs concurrently
    for (const entity of entities) {
        if (entity.shadowStrikeSlow) {
            entity.shadowStrikeSlow -= dt;
            if (entity.shadowStrikeSlow <= 0) {
                entity.shadowStrikeSlow = 0;
                entity.speed = entity.baseSpeed !== undefined ? entity.baseSpeed : entity.speed;
            }
        }
    }
}

/**
 * AOE damage in a radius
 */
function aoeDamage(cx, cy, radius, damage, source, entities) {
    for (const entity of entities) {
        if (!entity.alive) continue;
        if (entity === source) continue;
        const dx = entity.x - cx;
        const dy = entity.y - cy;
        if (Math.hypot(dx, dy) <= radius) {
            dealDamage(entity, damage, source);
        }
    }
}

/**
 * Update ground hazards (Flame Wall, Meteor impact zones)
 */
function updateHazard(hazard, entities, dt) {
    if (hazard.delay) {
        hazard.delay -= dt;
        if (hazard.delay > 0) return;
    }

    hazard.lifeTimer -= dt;
    if (hazard.lifeTimer <= 0) {
        hazard.alive = false;
        return;
    }

    if (hazard.hazardType === 'flame_wall') {
        // Damage enemies passing through
        const totalDps = hazard.dps || 15;

        for (const entity of entities) {
            if (!entity.alive || entity.type === 'player') continue;

            // Check if entity is within the wall strip
            const dx = entity.x - hazard.x;
            const dy = entity.y - hazard.y;
            // Rotate to wall's orientation
            const cos = Math.cos(hazard.angle);
            const sin = Math.sin(hazard.angle);
            const localX = dx * cos + dy * sin;
            const localY = -dx * sin + dy * cos;

            if (Math.abs(localX) < hazard.wallLength / 2 && Math.abs(localY) < 16) {
                // Accumulate fractional damage — per-frame ticks round to 0 otherwise
                entity._flameAccum = (entity._flameAccum || 0) + totalDps * dt;
                if (entity._flameAccum >= 1) {
                    const dmg = Math.floor(entity._flameAccum);
                    entity._flameAccum -= dmg;
                    dealDamage(entity, dmg, hazard.source);
                }
                applyBurn(entity, 1, 5);
                // Very slight slow while standing in the flames
                addBuff(entity, 'flame_wall_slow', 0.3, { speedMult: 0.97 });
            }
        }
    }

    if (hazard.hazardType === 'meteor') {
        // Impact damage
        aoeDamage(hazard.x, hazard.y, hazard.impactRadius || 30, hazard.damage || 15, hazard.caster, entities);
        hazard.alive = false; // One-shot
    }
}

/**
 * Render a projectile
 * Draws at absolute world coords — camera transform already applied by renderer
 */
export function drawProjectile(ctx, p, camera) {
    if (p.type === 'hazard') {
        if (p.hazardType === 'flame_wall') {
            const cos = Math.cos(p.angle);
            const sin = Math.sin(p.angle);
            const halfLen = p.wallLength / 2;

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.angle);

            // Flame wall visual
            const alpha = Math.min(1, p.lifeTimer / 1);
            const gradient = ctx.createLinearGradient(-halfLen, 0, halfLen, 0);
            gradient.addColorStop(0, `rgba(255, 87, 34, ${alpha * 0.3})`);
            gradient.addColorStop(0.3, `rgba(255, 152, 0, ${alpha})`);
            gradient.addColorStop(0.5, `rgba(255, 193, 7, ${alpha})`);
            gradient.addColorStop(0.7, `rgba(255, 152, 0, ${alpha})`);
            gradient.addColorStop(1, `rgba(255, 87, 34, ${alpha * 0.3})`);

            ctx.fillStyle = gradient;
            ctx.fillRect(-halfLen, -12, p.wallLength, 24);

            // Inner glow
            ctx.fillStyle = `rgba(255, 255, 200, ${alpha * 0.5})`;
            ctx.fillRect(-halfLen + 8, -4, p.wallLength - 16, 8);

            ctx.restore();
            return;
        }
        if (p.hazardType === 'meteor') {
            // Meteor marker
            ctx.fillStyle = p.color || '#F44336';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size || 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#FFEB3B';
            ctx.beginPath();
            ctx.arc(p.x - 3, p.y - 3, (p.size || 12) * 0.4, 0, Math.PI * 2);
            ctx.fill();
            return;
        }
    }

    // ── Arrow (marksman basic) — shaft + steel head + fletching, aimed along flight ──
    if (p.kind === 'arrow') {
        const ang = Math.atan2(p.vy || 0, p.vx || 0);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(ang);
        const L = 11;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#8d6e4f'; ctx.lineWidth = 2;          // shaft
        ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(L * 0.55, 0); ctx.stroke();
        ctx.fillStyle = '#e8eef2';                                // head
        ctx.beginPath(); ctx.moveTo(L + 3, 0); ctx.lineTo(L * 0.55, -3); ctx.lineTo(L * 0.55, 3); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#e57373'; ctx.lineWidth = 1.5;        // fletching
        ctx.beginPath();
        ctx.moveTo(-L, 0); ctx.lineTo(-L - 3, -3);
        ctx.moveTo(-L, 0); ctx.lineTo(-L - 3, 3);
        ctx.stroke();
        ctx.restore();
        return;
    }

    // ── Kunai (ronin basic) — a spinning throwing blade ──
    if (p.kind === 'kunai') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.x + p.y) * 0.4);                            // spin (position-derived = deterministic)
        ctx.fillStyle = '#dfe6ea'; ctx.shadowColor = '#cfd8dc'; ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(0, -3.2); ctx.lineTo(-5, 0); ctx.lineTo(0, 3.2); ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#455a64'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#5d4037'; ctx.fillRect(-8, -1.2, 4, 2.4);
        ctx.restore();
        return;
    }

    // Regular projectile — a glowing head trailing a tapered comet streak.
    const vx = p.vx || 0, vy = p.vy || 0;
    const spd = Math.hypot(vx, vy);
    if (spd > 1) {
        const ux = vx / spd, uy = vy / spd;
        const tlen = Math.min(p.size * 7, 30);
        const grad = ctx.createLinearGradient(p.x, p.y, p.x - ux * tlen, p.y - uy * tlen);
        grad.addColorStop(0, p.color);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = p.size * 1.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - ux * tlen, p.y - uy * tlen);
        ctx.stroke();
    }

    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // bright core
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * 0.4, 0, Math.PI * 2);
    ctx.fill();
}
