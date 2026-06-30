// drawEffects.js — visual effects: particles, screen shake, death animations
import { SPELLS } from '../config/spells.js';
import { findNearestEnemy } from '../systems/movement.js';

/** Simple hex-color lerp helper */
function _lerpColor(c1, c2, t) {
    const r1 = parseInt(c1.slice(1, 3), 16);
    const g1 = parseInt(c1.slice(3, 5), 16);
    const b1 = parseInt(c1.slice(5, 7), 16);
    const r2 = parseInt(c2.slice(1, 3), 16);
    const g2 = parseInt(c2.slice(3, 5), 16);
    const b2 = parseInt(c2.slice(5, 7), 16);
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return `rgb(${r},${g},${b})`;
}

// Simple particle pool
let particles = [];

// Ambient particles (floating dust, embers — independent of combat)
let ambientParticles = [];

/** Spawn a slow-floating ambient particle (ember / dust / snow / spore / spark). */
export function spawnAmbientParticle(x, y, color = '#B0BEC5', life = 3, vy = -10, opts = {}) {
    ambientParticles.push({
        x, y,
        vx: opts.vx ?? (Math.random() - 0.5) * 8,
        vy: vy + (Math.random() - 0.5) * 4,
        life,
        maxLife: life,
        color,
        size: opts.size ?? (1 + Math.random() * 2),
        glow: !!opts.glow,
        twinkle: !!opts.twinkle,
        sway: opts.sway ?? (0.4 + Math.random() * 1.4),
        phase: Math.random() * Math.PI * 2,
    });
}

/** Tick ambient particles — gentle horizontal sway + lifetime. */
function updateAmbientParticles(dt) {
    for (let i = ambientParticles.length - 1; i >= 0; i--) {
        const p = ambientParticles[i];
        p.life -= dt;
        p.phase += dt * 1.8;
        p.x += (p.vx + Math.cos(p.phase) * p.sway * 6) * dt;
        p.y += p.vy * dt;
        if (p.life <= 0) ambientParticles.splice(i, 1);
    }
    // Cap to prevent unbounded growth
    if (ambientParticles.length > 360) {
        ambientParticles.splice(0, ambientParticles.length - 360);
    }
}

/** Draw ambient particles — soft fade in/out, glowing motes blend additively. */
export function drawAmbientParticles(ctx, camera) {
    ctx.save();
    for (const p of ambientParticles) {
        const sx = p.x - camera.x;
        const sy = p.y - camera.y;
        // fade in from birth, peak mid-life, fade out to death
        let a = Math.sin(Math.min(1, Math.max(0, p.life / p.maxLife)) * Math.PI) * 0.7;
        if (p.twinkle) a *= 0.55 + 0.45 * Math.sin(p.phase * 3);
        if (a <= 0.01) continue;
        ctx.globalAlpha = a;
        if (p.glow) {
            ctx.globalCompositeOperation = 'lighter';
            const r = p.size * 3;
            const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
            g.addColorStop(0, p.color);
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
        } else {
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(sx, sy, p.size, 0, Math.PI * 2); ctx.fill();
        }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
}

// Death ring effects (expanding circles)
let deathRings = [];

// Death flash effects (brief bright flash)
let deathFlashes = [];

// Channeled beam blasts (Kamehameha and similar wide line ultimates)
let beams = [];

/**
 * Spawn a wide instant-blast beam VFX from (x1,y1) to (x2,y2) — a fading
 * glowing rectangle, not a traveling projectile.
 */
export function spawnBeamEffect(x1, y1, x2, y2, width, color, duration = 0.45) {
    beams.push({ x1, y1, x2, y2, width, color, life: duration, maxLife: duration });
}

/**
 * Get enemy-specific death color
 */
function getDeathColor(entity) {
    if (entity.type === 'player') return '#4CAF50';
    switch (entity.enemyType) {
        case 'goblin': return '#8B4513';
        case 'bat': return '#4A148C';
        case 'slime': return '#2E7D32';
        case 'skeleton': return '#BDBDBD';
        case 'boss_dragon': return '#B71C1C';
        default: return '#888';
    }
}

/**
 * Get a secondary/accent death color
 */
function getDeathAccentColor(entity) {
    if (entity.type === 'player') return '#81C784';
    switch (entity.enemyType) {
        case 'goblin': return '#A0522D';
        case 'bat': return '#7B1FA2';
        case 'slime': return '#66BB6A';
        case 'skeleton': return '#EEEEEE';
        case 'boss_dragon': return '#FF5722';
        default: return '#AAA';
    }
}

/**
 * Spawn particles at position
 */
export function spawnParticles(x, y, color, count = 8, speed = 80, sizeMin = 2, sizeMax = 5, shape = null) {
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.5;
        const spd = speed * (0.5 + Math.random());
        particles.push({
            x, y,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            life: 0.3 + Math.random() * 0.3,
            maxLife: 0.6,
            size: sizeMin + Math.random() * (sizeMax - sizeMin),
            color: color,
            colorEnd: null,
            shape: shape || 'square',
        });
    }
}

/**
 * Draw ground warning rings for telegraphed boss AoEs (e.g. dragon meteor).
 * Ring fills in and pulses faster as the impact approaches — the player's
 * cue to step outside the radius before it bursts.
 */
export function drawEnemyAoeZones(ctx, entities) {
    for (const entity of entities) {
        if (!entity._aoeZones || entity._aoeZones.length === 0) continue;

        for (const zone of entity._aoeZones) {
            if (zone.delay === undefined) continue; // lava-pool style zones aren't telegraphed

            const progress = 1 - Math.max(0, zone.delay) / (zone.maxDelay || 1);
            const pulseSpeed = 90 - progress * 60; // pulses faster as it nears impact
            const pulse = 0.5 + 0.5 * Math.sin(Date.now() / pulseSpeed);
            const alpha = 0.3 + progress * 0.4 + pulse * 0.15;

            ctx.save();
            ctx.fillStyle = zone.color || '#D50000';
            ctx.strokeStyle = zone.color || '#D50000';

            ctx.globalAlpha = alpha * 0.3;
            ctx.beginPath();
            ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.globalAlpha = alpha;
            ctx.lineWidth = 3 + progress * 4;
            ctx.beginPath();
            ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
            ctx.stroke();

            ctx.restore();
        }
    }
}

/**
 * Spawn death particles - enhanced with enemy-specific effects
 */
export function spawnDeathParticles(entity) {
    const mainColor = getDeathColor(entity);
    const accentColor = getDeathAccentColor(entity);
    const isBoss = entity.enemyType === 'boss_dragon' || entity.elite;
    const multiplier = isBoss ? 3 : 1;

    // Main burst particles
    spawnParticles(entity.x, entity.y, mainColor, 12 * multiplier, 120 * multiplier, 2, 5);

    // Accent particles (lighter, smaller, spread further)
    spawnParticles(entity.x, entity.y, accentColor, 6 * multiplier, 160 * multiplier, 1, 3);

    // Extra sparkle particles for elites/bosses
    if (isBoss) {
        spawnParticles(entity.x, entity.y, '#FFD700', 10, 200, 2, 4);
        spawnParticles(entity.x, entity.y, '#FFF', 8, 250, 1, 2);
    }

    // Spawn death ring effect
    deathRings.push({
        x: entity.x,
        y: entity.y,
        radius: 0,
        maxRadius: isBoss ? 80 : 40,
        life: 0.6,
        maxLife: 0.6,
        color: mainColor,
        lineWidth: isBoss ? 4 : 2,
    });

    // Spawn death flash
    deathFlashes.push({
        x: entity.x,
        y: entity.y,
        life: 0.15,
        maxLife: 0.15,
        radius: isBoss ? 60 : 30,
        color: isBoss ? '#FFD700' : accentColor,
    });

    // For slime enemies - green goo splatter
    if (entity.enemyType === 'slime') {
        spawnParticles(entity.x, entity.y, '#1B5E20', 8, 60, 3, 6);
        spawnParticles(entity.x, entity.y, '#4CAF50', 12, 100, 2, 4);
    }

    // For skeleton enemies - bone shards
    if (entity.enemyType === 'skeleton' || entity.enemyType === 'goblin') {
        spawnParticles(entity.x, entity.y, '#795548', 6, 90, 3, 5);
        spawnParticles(entity.x, entity.y, '#D7CCC8', 4, 130, 2, 3);
    }

    // For bat enemies - purple mist
    if (entity.enemyType === 'bat') {
        spawnParticles(entity.x, entity.y, '#6A1B9A', 8, 70, 3, 5);
        spawnParticles(entity.x, entity.y, '#CE93D8', 6, 110, 2, 4);
    }
}

/**
 * Spawn a ring effect at a position (can be called externally too)
 */
export function spawnDeathRing(x, y, color, maxRadius = 40, duration = 0.6) {
    deathRings.push({
        x, y,
        radius: 0,
        maxRadius,
        life: duration,
        maxLife: duration,
        color,
        lineWidth: 2,
    });
}

/**
 * Update all particles and effects
 */
export function updateParticles(dt) {
    // Update regular particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 100 * dt; // gravity
        p.life -= dt;
        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }

    // Update ambient particles (dust motes, embers)
    updateAmbientParticles(dt);

    // Update death rings
    for (let i = deathRings.length - 1; i >= 0; i--) {
        const r = deathRings[i];
        r.life -= dt;
        r.radius = r.maxRadius * (1 - r.life / r.maxLife);
        if (r.life <= 0) {
            deathRings.splice(i, 1);
        }
    }

    // Update death flashes
    for (let i = deathFlashes.length - 1; i >= 0; i--) {
        const f = deathFlashes[i];
        f.life -= dt;
        if (f.life <= 0) {
            deathFlashes.splice(i, 1);
        }
    }

    // Update beam blasts
    for (let i = beams.length - 1; i >= 0; i--) {
        const b = beams[i];
        b.life -= dt;
        if (b.life <= 0) {
            beams.splice(i, 1);
        }
    }
}

/**
 * Draw all particles and effects
 */
export function drawParticles(ctx, camera) {
    // Draw death rings
    for (const r of deathRings) {
        const alpha = Math.max(0, r.life / r.maxLife);
        ctx.save();
        ctx.globalAlpha = alpha * 0.6;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = r.lineWidth;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    // Draw death flashes
    for (const f of deathFlashes) {
        const alpha = Math.max(0, f.life / f.maxLife);
        ctx.save();
        ctx.globalAlpha = alpha * 0.3;
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Draw regular particles with shape variety
    for (const p of particles) {
        const alpha = Math.max(0, p.life / p.maxLife);
        ctx.save();
        ctx.globalAlpha = alpha;

        // Color interpolation: fade from color to colorEnd if set
        const t = 1 - (p.life / p.maxLife);
        const col = (p.colorEnd && t > 0)
            ? _lerpColor(p.color, p.colorEnd, Math.min(1, t * 2))
            : p.color;
        ctx.fillStyle = col;

        const sx = p.x - p.size / 2;
        const sy = p.y - p.size / 2;
        const s = p.size;

        switch (p.shape) {
            case 'circle':
                ctx.beginPath();
                ctx.arc(p.x, p.y, s / 2, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'triangle':
                ctx.beginPath();
                ctx.moveTo(p.x, sy);
                ctx.lineTo(sx, sy + s);
                ctx.lineTo(sx + s, sy + s);
                ctx.closePath();
                ctx.fill();
                break;
            case 'star':
                ctx.beginPath();
                for (let i = 0; i < 5; i++) {
                    const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
                    const r = i % 2 === 0 ? s / 2 : s / 4;
                    const px = p.x + Math.cos(a) * r;
                    const py = p.y + Math.sin(a) * r;
                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fill();
                break;
            case 'line':
                ctx.strokeStyle = col;
                ctx.lineWidth = s * 0.4;
                ctx.beginPath();
                ctx.moveTo(p.x - s * 0.7, p.y);
                ctx.lineTo(p.x + s * 0.7, p.y);
                ctx.stroke();
                break;
            default:
                ctx.fillRect(sx, sy, s, s);
        }
        ctx.restore();
    }

    // Draw beam blasts — a wide glowing rectangle with a bright core line
    for (const b of beams) {
        const t = Math.max(0, b.life / b.maxLife);
        const angle = Math.atan2(b.y2 - b.y1, b.x2 - b.x1);
        const len = Math.hypot(b.x2 - b.x1, b.y2 - b.y1);
        ctx.save();
        ctx.translate(b.x1, b.y1);
        ctx.rotate(angle);

        ctx.globalAlpha = t * 0.5;
        ctx.fillStyle = b.color;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 25;
        ctx.fillRect(0, -b.width / 2, len, b.width);

        ctx.globalAlpha = t * 0.9;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, -b.width * 0.15, len, b.width * 0.3);
        ctx.shadowBlur = 0;
        ctx.restore();
    }
}

/**
 * Draw spell cast indicator (circle or line showing where spell goes)
 */
export function drawCastIndicator(ctx, player, camera, entities) {
    if (!player.castingKey) return;
    const key = player.castingKey;
    const tx = player.castingTargetX;
    const ty = player.castingTargetY;

    if (tx === undefined || ty === undefined) return;

    const spell = player.spells[key];
    const config = spell ? SPELLS[spell.id] : null;
    if (!config) return;

    ctx.fillStyle = `rgba(255, 215, 0, ${0.15 + Math.sin(Date.now() * 0.008) * 0.05})`;
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)';
    ctx.lineWidth = 2;

    switch (config.type) {
        case 'cone': {
            // Cone of damage in front of the caster
            const angle = player.facing === 'right' ? 0 : Math.PI;
            const range = config.range || 64;
            const coneAngle = (config.coneAngle || Math.PI / 3) / 2;
            ctx.beginPath();
            ctx.moveTo(player.x, player.y);
            ctx.arc(player.x, player.y, range, angle - coneAngle, angle + coneAngle);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            break;
        }
        case 'heal': {
            // Self-targeted heal — no area, just a self ring
            ctx.beginPath();
            ctx.arc(player.x, player.y, 28, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            break;
        }
        case 'aoe_self':
        case 'holy_nova': {
            // Radius centered on the caster
            const radius = config.radius || 80;
            ctx.beginPath();
            ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            break;
        }
        case 'buff': {
            // Self-targeted — small ring on the caster, no aim needed
            ctx.beginPath();
            ctx.arc(player.x, player.y, 28, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            break;
        }
        case 'dash': {
            // Dash path toward the cursor, clamped to range
            const dx = tx - player.x, dy = ty - player.y;
            const dist = Math.hypot(dx, dy);
            const dashDist = Math.min(dist, config.range || 180);
            const ex = player.x + (dist > 0 ? (dx / dist) * dashDist : 0);
            const ey = player.y + (dist > 0 ? (dy / dist) * dashDist : 0);
            ctx.beginPath();
            ctx.moveTo(player.x, player.y);
            ctx.lineTo(ex, ey);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(ex, ey, 18, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            break;
        }
        case 'beam': {
            // Full-range wide line in the aimed direction — a beam always
            // fires its entire length, it doesn't stop at the cursor.
            const dx = tx - player.x, dy = ty - player.y;
            const dist = Math.hypot(dx, dy) || 1;
            const dirX = dx / dist, dirY = dy / dist;
            const range = config.range || 400;
            const rank = player.spells[key]?.rank || 1;
            const width = (config.beamWidth || 60) + (rank - 1) * (config.rankScaling?.sizePerRank || 0);
            const angle = Math.atan2(dirY, dirX);
            ctx.save();
            ctx.translate(player.x, player.y);
            ctx.rotate(angle);
            ctx.beginPath();
            ctx.rect(0, -width / 2, range, width);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
            break;
        }
        case 'projectile': {
            // Straight shot toward the cursor, clamped to range — shows travel line + impact size
            const dx = tx - player.x, dy = ty - player.y;
            const dist = Math.hypot(dx, dy);
            const range = config.range || 200;
            const shotDist = Math.min(dist, range);
            const ex = player.x + (dist > 0 ? (dx / dist) * shotDist : 0);
            const ey = player.y + (dist > 0 ? (dy / dist) * shotDist : 0);
            ctx.beginPath();
            ctx.moveTo(player.x, player.y);
            ctx.lineTo(ex, ey);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(ex, ey, config.projectileSize || 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            break;
        }
        case 'teleport': {
            // Shows where the caster will land — directly behind their current target
            const target = player.attackTarget;
            const range = config.range || 150;
            if (target && target.alive) {
                const angle = Math.atan2(target.y - player.y, target.x - player.x);
                const behindDist = (target.size || 20) + (player.size || 20);
                const lx = target.x - Math.cos(angle) * behindDist;
                const ly = target.y - Math.sin(angle) * behindDist;
                // Line to target, marker at landing spot behind it
                ctx.beginPath();
                ctx.moveTo(player.x, player.y);
                ctx.lineTo(target.x, target.y);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(lx, ly, 16, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // Highlight the target being struck
                ctx.beginPath();
                ctx.arc(target.x, target.y, (target.size || 20) + 4, 0, Math.PI * 2);
                ctx.stroke();
            } else {
                // No target — teleport toward the cursor, clamped to range
                const dx = tx - player.x, dy = ty - player.y;
                const dist = Math.hypot(dx, dy);
                const tpDist = Math.min(dist, range);
                const ex = player.x + (dist > 0 ? (dx / dist) * tpDist : 0);
                const ey = player.y + (dist > 0 ? (dy / dist) * tpDist : 0);
                ctx.beginPath();
                ctx.moveTo(player.x, player.y);
                ctx.lineTo(ex, ey);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(ex, ey, 16, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }
            break;
        }
        case 'mark': {
            // Single-target — ring on whichever enemy will actually be marked
            const range = config.range || 150;
            let target = player.attackTarget;
            if (!target || !target.alive) target = findNearestEnemy(player, entities || []);
            if (target && target.alive) {
                ctx.beginPath();
                ctx.arc(target.x, target.y, (target.size || 20) + 8, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }
            break;
        }
        case 'ground_aoe': {
            // Ground-targeted hazard line/wall, clamped to cast range
            const wallLength = config.wallLength || 100;
            const range = config.range || 110;
            const dx = tx - player.x, dy = ty - player.y;
            const dist = Math.hypot(dx, dy);
            const clampDist = Math.min(dist, range);
            const wx = player.x + (dist > 0 ? (dx / dist) * clampDist : 0);
            const wy = player.y + (dist > 0 ? (dy / dist) * clampDist : 0);
            const angle = Math.atan2(wy - player.y, wx - player.x);
            const hx = Math.cos(angle) * wallLength / 2;
            const hy = Math.sin(angle) * wallLength / 2;
            ctx.beginPath();
            ctx.moveTo(wx - hx, wy - hy);
            ctx.lineTo(wx + hx, wy + hy);
            ctx.lineWidth = 8;
            ctx.stroke();
            ctx.lineWidth = 2;
            break;
        }
        case 'meteor_storm': {
            // Large impact zone at the cursor, clamped to cast range
            const radius = config.radius || 120;
            const range = config.range || 200;
            const dx = tx - player.x, dy = ty - player.y;
            const dist = Math.hypot(dx, dy);
            const clampDist = Math.min(dist, range);
            const cx = player.x + (dist > 0 ? (dx / dist) * clampDist : 0);
            const cy = player.y + (dist > 0 ? (dy / dist) * clampDist : 0);
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            break;
        }
        default: {
            ctx.beginPath();
            ctx.arc(tx, ty, 60, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
    }
}
