// drawEntity.js — SPRITE RENDERER (Phase 2)
// Renders entities using sprite frames from manifest.js
// Falls back to blocky rendering if sprites not loaded

import { CHAMPIONS } from '../config/champions.js';
import { ENEMIES } from '../config/enemies.js';
import { drawCharacterBody } from './drawCharacter.js';

// Frame duration for each animation type (in seconds)
const FRAME_DURATIONS = {
    idle: 0.25,
    walk: 0.15,
    attack: 0.1,
    death: 0.3,
    hurt: 0.1,
};

// State badges for debug (shown when sprites not available)
const STATE_BADGES = {
    idle: 'I', walk: 'W', attack: 'A', hurt: 'H', death: 'X',
    castQ: 'Q', castW: 'W', castE: 'E', castR: 'R',
};

/** Get color for an entity (fallback renderer) */
function getEntityColor(entity) {
    if (entity.hitFlash) return '#FFFFFF';
    if (entity.type === 'player') {
        const champ = CHAMPIONS[entity.championId];
        return champ ? champ.color : '#4CAF50';
    }
    const enemy = ENEMIES[entity.enemyType];
    return enemy ? enemy.color : '#888';
}

/** Get dark outline color (fallback renderer) */
function getEntityColorDark(entity) {
    if (entity.type === 'player') {
        const champ = CHAMPIONS[entity.championId];
        return champ ? champ.colorDark : '#2E7D32';
    }
    const enemy = ENEMIES[entity.enemyType];
    return enemy ? enemy.colorDark : '#555';
}

/**
 * Advance frame animation for an entity
 * Called by the renderer before drawing
 */
export function tickEntityFrame(entity, dt) {
    // frameTimer tracks time spent in the CURRENT state (reset on transition).
    if (entity._lastState !== entity.state) {
        entity._lastState = entity.state;
        entity.frameTimer = 0;
    } else {
        entity.frameTimer = (entity.frameTimer || 0) + dt;
    }

    // The procedural renderer animates from a continuous time clock, so the only
    // job left here is to release the 'attack' lock back to idle a short time
    // after it starts (movement is skipped while in 'attack').
    if (entity.state === 'attack' && entity.alive && entity.frameTimer > 0.32) {
        entity.state = 'idle';
    }
}

/**
 * Draw an entity using its sprite frames
 * Falls back to blocky colored square rendering if sprites not loaded
 */
export function drawEntity(ctx, entity, camera, canvasWidth, canvasHeight) {
    // Cull off-screen entities
    const margin = 80;
    const sx = entity.x - camera.x;
    const sy = entity.y - camera.y;
    if (sx < -margin || sx > canvasWidth + margin ||
        sy < -margin || sy > canvasHeight + margin) return;

    // Don't draw dead entities that finished their death timer (downed/
    // disconnected co-op players stay drawn as ghosts even though alive===false).
    if (!entity.alive && entity.deathTimer <= 0 && !entity.downed && !entity.disconnected) return;

    // Every entity is drawn with the procedural character renderer.
    drawProceduralEntity(ctx, entity);
}

/**
 * Draw an entity: procedural animated body (drawCharacter.js) + all the
 * gameplay overlays (health bar, name, status icons, selection, …).
 */
function drawProceduralEntity(ctx, entity) {
    // Death animation: shrink + fade. A downed (revivable) player stays at
    // full size, just ghosted, so teammates can find and revive them.
    let alpha = 1;
    let scale = 1;
    if (entity.downed || entity.disconnected) {
        alpha = 0.5;
    } else if (!entity.alive) {
        const t = Math.max(0, entity.deathTimer / 0.5);
        alpha = t;
        scale = t;
    }

    // Shaded, animated body (shadow + figure), with hit-flash baked into the figure.
    const flash = entity.hitFlash ? Math.min(0.6, (entity.hitFlashTimer || 0) * 5) : 0;
    drawCharacterBody(ctx, entity, { alpha, scale, flash });

    const displaySize = entity.size * 1.8 * scale; // bounding box for overlays
    const drawX = entity.x - displaySize / 2;
    const drawY = entity.y - displaySize;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Invisible effect (Vanish)
    if (entity.invisible) {
        ctx.fillStyle = 'rgba(180, 140, 255, 0.3)';
        ctx.fillRect(drawX, drawY, displaySize, displaySize);
        ctx.strokeStyle = 'rgba(180, 140, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(drawX - 1, drawY - 1, displaySize + 2, displaySize + 2);
        ctx.setLineDash([]);
    }

    // Shield indicator
    if (entity.shield > 0) {
        ctx.strokeStyle = 'rgba(100, 180, 255, 0.7)';
        ctx.lineWidth = 2;
        ctx.strokeRect(drawX - 2, drawY - 2, displaySize + 4, displaySize + 4);
        ctx.fillStyle = '#64B5F6';
        ctx.font = 'bold 9px monospace';
        ctx.fillText(Math.round(entity.shield), entity.x - 6, entity.y - entity.size * 1.8 - 12);
    }

    // --- Targeting Selection ---
    if (entity.isTargeted) {
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(drawX - 3, drawY - 3, displaySize + 6, displaySize + 6);
        ctx.setLineDash([]);
    }

    // --- Health Bar (6px with trailing damage) ---
    if (entity.maxHp > 0) {
        const barW = displaySize + 4;
        const barH = 6;
        const barX = entity.x - barW / 2;
        const barY = drawY - 10;

        // Background
        ctx.fillStyle = '#222';
        ctx.fillRect(barX, barY, barW, barH);

        // Initialize display HP tracker
        if (entity._displayHp === undefined) entity._displayHp = entity.hp;

        // Lerp display HP toward real HP (fast on damage, slower on heal)
        const lerpSpeed = entity._displayHp > entity.hp ? 12 : 6;
        entity._displayHp += (entity.hp - entity._displayHp) * Math.min(1, lerpSpeed * 0.016);
        if (Math.abs(entity._displayHp - entity.hp) < 0.5) entity._displayHp = entity.hp;

        const hpPct = Math.max(0, entity.hp / entity.maxHp);
        const displayPct = Math.max(0, entity._displayHp / entity.maxHp);

        // Trailing damage bar (yellow — shows where HP was)
        if (displayPct > hpPct + 0.01) {
            ctx.fillStyle = 'rgba(255, 200, 50, 0.6)';
            ctx.fillRect(barX, barY, barW * displayPct, barH);
        }

        // Current HP bar
        ctx.fillStyle = hpPct > 0.5 ? '#4CAF50' : hpPct > 0.25 ? '#FF9800' : '#F44336';
        ctx.fillRect(barX, barY, barW * hpPct, barH);

        // Subtle border
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);
    }

    // --- Player name label + downed/revive overlay (co-op identification) ---
    if (entity.type === 'player') {
        const champ = CHAMPIONS[entity.championId];
        const nm = (champ && champ.name) || entity.name || 'Player';
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.textAlign = 'center';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = (entity.downed || entity.disconnected) ? '#9E9E9E' : (champ ? champ.color : '#FFF');
        ctx.fillText(nm, entity.x, drawY - 16);

        if (entity.disconnected) {
            ctx.fillStyle = '#FFB74D';
            ctx.font = 'bold 11px sans-serif';
            ctx.fillText('RECONNECTING…', entity.x, drawY - 30);
        } else if (entity.downed) {
            ctx.fillStyle = '#FF5252';
            ctx.font = 'bold 12px sans-serif';
            ctx.fillText('DOWNED', entity.x, drawY - 30);
            const rp = entity.reviveProgress || 0;
            if (rp > 0) {
                const cy = entity.y - entity.size * 0.5;
                ctx.strokeStyle = 'rgba(76,175,80,0.9)';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(entity.x, cy, entity.size * 0.95, -Math.PI / 2, -Math.PI / 2 + rp * Math.PI * 2);
                ctx.stroke();
            }
        }
        ctx.textAlign = 'start';
        ctx.restore();
    }

    // --- Death Mark indicator ---
    if (entity.mark) {
        ctx.strokeStyle = '#E040FB';
        ctx.lineWidth = 2;
        ctx.setLineDash([2, 4]);
        ctx.strokeRect(drawX - 4, drawY - 4, displaySize + 8, displaySize + 8);
        ctx.setLineDash([]);
        ctx.fillStyle = '#E040FB';
        ctx.font = 'bold 12px monospace';
        ctx.fillText(Math.ceil(entity.mark.expireTimer), entity.x - 5, drawY - 16);
    }

    // --- Elite golden border ---
    if (entity.elite) {
        const pulse = 0.4 + 0.3 * Math.sin(Date.now() / 600 + entity.id);
        ctx.strokeStyle = `rgba(255, 215, 0, ${pulse})`;
        ctx.lineWidth = 3;
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 12;
        ctx.strokeRect(drawX - 4, drawY - 4, displaySize + 8, displaySize + 8);
        ctx.shadowBlur = 0;
        // Elite name tag with glow
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('★ ELITE', entity.x, drawY - 12);
        ctx.textAlign = 'start';
        ctx.shadowBlur = 0;
    }

    // (Chests are drawn as a proper treasure-chest graphic by drawCharacterBody.)

    // --- Burn indicator (animated flame motes) ---
    if (entity.burning) {
        const now = Date.now();
        // Base glow
        const burnPulse = 0.3 + 0.2 * Math.sin(now / 200 + entity.id);
        ctx.fillStyle = `rgba(255, 87, 34, ${burnPulse * 0.5})`;
        ctx.fillRect(drawX, drawY + displaySize * 0.65, displaySize, displaySize * 0.35);
        // Small flame motes
        for (let i = 0; i < 4; i++) {
            const fx = entity.x + (Math.sin(now / 150 + i * 1.7 + entity.id) * displaySize * 0.3);
            const fy = entity.y + entity.size * 0.3 - (i * 4) + Math.sin(now / 180 + i) * 4;
            const fs = 2 + Math.sin(now / 130 + i) * 1.5;
            ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 180, 50, 0.7)' : 'rgba(255, 100, 20, 0.6)';
            ctx.beginPath();
            ctx.arc(fx, fy, fs, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // --- Aggro indicator ---
    if (entity.type !== 'player' && entity.aiState === 'chase') {
        ctx.fillStyle = '#F44336';
        ctx.beginPath();
        ctx.moveTo(entity.x - 5, drawY - 12);
        ctx.lineTo(entity.x + 5, drawY - 12);
        ctx.lineTo(entity.x, drawY - 18);
        ctx.closePath();
        ctx.fill();
    }

    ctx.restore();
}

/**
 * Fallback blocky renderer (colored squares)
 */
function drawBlockyEntity(ctx, entity) {
    const size = entity.size;

    let alpha = 1;
    let scale = 1;
    if (!entity.alive) {
        const t = Math.max(0, entity.deathTimer / 0.5);
        alpha = t;
        scale = t;
    }

    ctx.save();
    ctx.globalAlpha = alpha;

    // Soft Drop Shadow
    const shadowY2 = entity.y + size * 0.4 * scale;
    const shadowW = size * 0.55 * scale;
    const shadowH = 4 * scale;
    const shadowGrad = ctx.createRadialGradient(
        entity.x, shadowY2, shadowW * 0.15,
        entity.x, shadowY2, shadowW
    );
    shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
    shadowGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.12)');
    shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.ellipse(entity.x, shadowY2, shadowW, shadowH, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body with glow
    const color = getEntityColor(entity);
    const darkColor = getEntityColorDark(entity);
    const drawSize = size * scale;
    const drawX = entity.x - drawSize / 2;
    const drawY = entity.y - drawSize;

    // Outer glow
    if (entity.elite) {
        const pulse = 0.4 + 0.3 * Math.sin(Date.now() / 600 + entity.id);
        ctx.shadowColor = `rgba(255, 215, 0, ${pulse})`;
        ctx.shadowBlur = 10;
    }

    ctx.fillStyle = darkColor;
    ctx.fillRect(drawX - 1, drawY - 1, drawSize + 2, drawSize + 2);

    ctx.fillStyle = color;
    ctx.fillRect(drawX, drawY, drawSize, drawSize);
    ctx.shadowBlur = 0;

    // Hit flash overlay for blocky entities
    if (entity.hitFlash) {
        const flashAlpha = Math.min(0.6, entity.hitFlashTimer * 6);
        ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
        ctx.fillRect(drawX, drawY, drawSize, drawSize);
    }

    // Invisible effect
    if (entity.invisible) {
        ctx.fillStyle = 'rgba(180, 140, 255, 0.3)';
        ctx.fillRect(drawX, drawY, drawSize, drawSize);
        ctx.strokeStyle = 'rgba(180, 140, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(drawX - 1, drawY - 1, drawSize + 2, drawSize + 2);
        ctx.setLineDash([]);
    }

    // Shield indicator
    if (entity.shield > 0) {
        ctx.strokeStyle = 'rgba(100, 180, 255, 0.7)';
        ctx.lineWidth = 2;
        ctx.strokeRect(drawX - 2, drawY - 2, drawSize + 4, drawSize + 4);
        ctx.fillStyle = '#64B5F6';
        ctx.font = 'bold 9px monospace';
        ctx.fillText(Math.round(entity.shield), entity.x - 6, entity.y - size - 12);
    }

    // State badge
    const badge = STATE_BADGES[entity.state] || '?';
    ctx.fillStyle = entity.state.startsWith('cast') ? '#FFD700' : '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(badge, entity.x - 4, entity.y - size - 4);

    // Facing indicator (small triangle pointer)
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    if (entity.facing === 'right') {
        ctx.beginPath();
        ctx.moveTo(drawX + drawSize + 2, drawY + drawSize * 0.5);
        ctx.lineTo(drawX + drawSize + 6, drawY + drawSize * 0.35);
        ctx.lineTo(drawX + drawSize + 6, drawY + drawSize * 0.65);
        ctx.closePath();
        ctx.fill();
    } else {
        ctx.beginPath();
        ctx.moveTo(drawX - 2, drawY + drawSize * 0.5);
        ctx.lineTo(drawX - 6, drawY + drawSize * 0.35);
        ctx.lineTo(drawX - 6, drawY + drawSize * 0.65);
        ctx.closePath();
        ctx.fill();
    }

    // Targeting
    if (entity.isTargeted) {
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(drawX - 3, drawY - 3, drawSize + 6, drawSize + 6);
        ctx.setLineDash([]);
    }

    // Health bar (6px with trailing damage)
    if (entity.maxHp > 0) {
        const barW = drawSize + 4;
        const barH = 6;
        const barX = entity.x - barW / 2;
        const barY = drawY - 10;

        ctx.fillStyle = '#222';
        ctx.fillRect(barX, barY, barW, barH);

        if (entity._displayHp === undefined) entity._displayHp = entity.hp;
        const lerpSpeed = entity._displayHp > entity.hp ? 12 : 6;
        entity._displayHp += (entity.hp - entity._displayHp) * Math.min(1, lerpSpeed * 0.016);
        if (Math.abs(entity._displayHp - entity.hp) < 0.5) entity._displayHp = entity.hp;

        const hpPct = Math.max(0, entity.hp / entity.maxHp);
        const displayPct = Math.max(0, entity._displayHp / entity.maxHp);

        if (displayPct > hpPct + 0.01) {
            ctx.fillStyle = 'rgba(255, 200, 50, 0.6)';
            ctx.fillRect(barX, barY, barW * displayPct, barH);
        }

        ctx.fillStyle = hpPct > 0.5 ? '#4CAF50' : hpPct > 0.25 ? '#FF9800' : '#F44336';
        ctx.fillRect(barX, barY, barW * hpPct, barH);

        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);
    }

    // Death Mark
    if (entity.mark) {
        ctx.strokeStyle = '#E040FB';
        ctx.lineWidth = 2;
        ctx.setLineDash([2, 4]);
        ctx.strokeRect(drawX - 4, drawY - 4, drawSize + 8, drawSize + 8);
        ctx.setLineDash([]);
        ctx.fillStyle = '#E040FB';
        ctx.font = 'bold 12px monospace';
        ctx.fillText(Math.ceil(entity.mark.expireTimer), entity.x - 5, drawY - 16);
    }

    // Burn (animated)
    if (entity.burning) {
        const now = Date.now();
        const burnPulse = 0.3 + 0.2 * Math.sin(now / 200 + entity.id);
        ctx.fillStyle = `rgba(255, 87, 34, ${burnPulse * 0.5})`;
        ctx.fillRect(drawX, drawY + drawSize * 0.65, drawSize, drawSize * 0.35);
        for (let i = 0; i < 3; i++) {
            const fx = entity.x + (Math.sin(now / 150 + i * 2 + entity.id) * drawSize * 0.25);
            const fy = entity.y + size * 0.25 - (i * 4) + Math.sin(now / 180 + i) * 3;
            ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 180, 50, 0.7)' : 'rgba(255, 100, 20, 0.6)';
            ctx.beginPath();
            ctx.arc(fx, fy, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Aggro
    if (entity.type !== 'player' && entity.aiState === 'chase') {
        ctx.fillStyle = '#F44336';
        ctx.beginPath();
        ctx.moveTo(entity.x - 5, drawY - 12);
        ctx.lineTo(entity.x + 5, drawY - 12);
        ctx.lineTo(entity.x, drawY - 18);
        ctx.closePath();
        ctx.fill();
    }

    ctx.restore();
}