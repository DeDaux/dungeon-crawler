// drawBaseDefense.js — Base Defense overlays.
// The dungeon + hero + enemies + projectiles are drawn by the normal renderer
// (render()). This module only adds: the world-space base crystal / build spots
// / towers / range rings / tower projectiles, a compact screen-space wave HUD,
// and the contextual tower panel that appears when a spot or tower is selected.

import { Camera, ZOOM, applyCameraTransform } from '../camera.js';
import { TOWER_TYPES, getTowerConfig, getTowerDamage, getUpgradeCost } from '../config/towers.js';
import { drawPanel, roundRectPath, drawBar, withAlpha } from './ui.js';

const TOWER_ORDER = ['arrow', 'cannon', 'frost', 'magic'];
const DEF_FONT = "'Segoe UI', system-ui, sans-serif";

/** World point → screen pixel (matches applyCameraTransform). */
function worldToScreen(wx, wy) {
    return { x: (wx - Camera.x) * ZOOM, y: (wy - Camera.y) * ZOOM };
}

// ───────────────────────── World-space overlay ─────────────────────────

export function drawDefenseWorld(ctx, dg) {
    ctx.save();
    applyCameraTransform(ctx);

    // Build spots (only the empty ones; occupied ones become towers).
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 500);
    for (let i = 0; i < dg.towerSpots.length; i++) {
        const s = dg.towerSpots[i];
        if (s.occupied) continue;
        const selected = dg.selectedSpotIndex === i;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = selected ? '#FFD54F' : `rgba(180, 200, 255, ${0.35 + pulse * 0.3})`;
        ctx.strokeRect(s.x - 16, s.y - 16, 32, 32);
        ctx.setLineDash([]);
        ctx.fillStyle = selected ? 'rgba(255,213,79,0.18)' : `rgba(120,160,255,${0.06 + pulse * 0.06})`;
        ctx.fillRect(s.x - 16, s.y - 16, 32, 32);
        // little hammer hint
        ctx.fillStyle = selected ? '#FFD54F' : 'rgba(200,215,255,0.7)';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🔨', s.x, s.y);
    }

    // Towers
    for (const t of dg.towers) {
        drawTower(ctx, t);
        if (dg.selectedTower === t) drawRangeRing(ctx, t.x, t.y, t.range);
    }
    // Range preview when a build spot is selected (use the cheapest tower's range as a hint)
    if (dg.selectedSpotIndex !== null && dg.towerSpots[dg.selectedSpotIndex]) {
        const s = dg.towerSpots[dg.selectedSpotIndex];
        drawRangeRing(ctx, s.x, s.y, TOWER_TYPES.arrow.range);
    }

    // Enemy mines / traps
    if (dg.traps) {
        for (const tr of dg.traps) {
            const armed = tr.arm <= 0;
            const blink = armed ? (0.5 + 0.5 * Math.sin(Date.now() / 140)) : 0.25;
            // buried casing
            ctx.fillStyle = '#3a2a1a';
            ctx.beginPath(); ctx.arc(tr.x, tr.y, 7, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#1c140c'; ctx.lineWidth = 1.5; ctx.stroke();
            // spikes
            ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 2;
            for (let a = 0; a < 8; a++) {
                const ang = a / 8 * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(tr.x + Math.cos(ang) * 6, tr.y + Math.sin(ang) * 6);
                ctx.lineTo(tr.x + Math.cos(ang) * 10, tr.y + Math.sin(ang) * 10);
                ctx.stroke();
            }
            // blinking light
            ctx.fillStyle = `rgba(255,60,40,${blink})`;
            ctx.shadowColor = '#ff3d00'; ctx.shadowBlur = armed ? 8 : 2;
            ctx.beginPath(); ctx.arc(tr.x, tr.y, 2.6, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
        }
    }

    // Base crystal
    drawBaseCrystal(ctx, dg.base.x, dg.base.y, dg.base.hp, dg.base.maxHp);

    // Tower projectiles
    for (const p of dg.towerProjectiles) {
        if (!p.alive) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    ctx.restore();
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
}

function drawRangeRing(ctx, x, y, range) {
    ctx.beginPath();
    ctx.arc(x, y, range, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
}

function drawTower(ctx, tower) {
    const x = tower.x, y = tower.y, size = 13;
    const config = tower.config;
    // pedestal — flashes white briefly when the structure is hit
    ctx.fillStyle = (tower.hitFlash > 0) ? '#FFFFFF' : '#3b3b46';
    ctx.fillRect(x - size, y - size * 0.4, size * 2, size * 1.1);
    ctx.strokeStyle = '#1c1c24';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - size, y - size * 0.4, size * 2, size * 1.1);
    // turret
    ctx.fillStyle = config.color || '#FFF';
    ctx.beginPath();
    ctx.arc(x, y - 3, size * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // barrel
    ctx.strokeStyle = config.color || '#FFF';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y - 3);
    ctx.lineTo(tower.facing === 'right' ? x + 11 : x - 11, y - 7);
    ctx.stroke();
    // structure health bar — only when damaged
    if (tower.maxHp && tower.hp < tower.maxHp) {
        const pct = Math.max(0, tower.hp / tower.maxHp);
        const bw = size * 2, bx = x - size, by = y - size - 6;
        ctx.fillStyle = '#222';
        ctx.fillRect(bx, by, bw, 3);
        ctx.fillStyle = pct > 0.5 ? '#8BC34A' : (pct > 0.25 ? '#FF9800' : '#F44336');
        ctx.fillRect(bx, by, bw * pct, 3);
    }
    // level pips
    if (tower.level > 1) {
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`Lv${tower.level}`, x, y - size - 9);
    }
}

function drawBaseCrystal(ctx, x, y, hp, maxHp) {
    const size = 18;
    const pulse = 0.8 + 0.2 * Math.sin(Date.now() / 700);
    ctx.shadowColor = '#9C27B0';
    ctx.shadowBlur = 22 * pulse;
    ctx.beginPath();
    ctx.moveTo(x, y - size * 1.3);
    ctx.lineTo(x + size * 0.8, y);
    ctx.lineTo(x, y + size * 1.3);
    ctx.lineTo(x - size * 0.8, y);
    ctx.closePath();
    const pct = hp / Math.max(maxHp, 1);
    ctx.fillStyle = pct > 0.5 ? '#9C27B0' : (pct > 0.25 ? '#E65100' : '#D50000');
    ctx.fill();
    ctx.strokeStyle = '#CE93D8';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // HP bar above
    const bw = 46, bh = 5;
    ctx.fillStyle = '#222';
    ctx.fillRect(x - bw / 2, y - size * 1.7, bw, bh);
    ctx.fillStyle = pct > 0.5 ? '#4CAF50' : (pct > 0.25 ? '#FF9800' : '#F44336');
    ctx.fillRect(x - bw / 2, y - size * 1.7, bw * pct, bh);
}

// ───────────────────────── Screen-space HUD ─────────────────────────

export function drawDefenseHUD(ctx, dg) {
    const W = ctx.canvas.width;

    // Compact top-center strip (the normal player HUD owns the corners/bottom).
    const stripW = 380, stripH = 32, sx = (W - stripW) / 2, sy = 8;
    drawPanel(ctx, sx, sy, stripW, stripH, { radius: 10, accent: '#FF7043' });

    ctx.textBaseline = 'middle';
    const midY = sy + stripH / 2;

    // Threat level (rises forever — the siege never stops)
    ctx.textAlign = 'left';
    ctx.font = `800 15px ${DEF_FONT}`;
    ctx.fillStyle = '#FF7043';
    ctx.fillText(`☠ Threat ${dg.threat || 1}`, sx + 12, midY);

    // Survival time + kills (center)
    const secs = Math.floor(dg.elapsed || 0);
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    ctx.textAlign = 'center';
    ctx.font = `600 13px ${DEF_FONT}`;
    ctx.fillStyle = '#CFD8DC';
    ctx.fillText(`⏱ ${mm}:${ss}    ⚔ ${dg.kills || 0}`, W / 2, midY);

    // Gold
    ctx.textAlign = 'right';
    ctx.font = `800 15px ${DEF_FONT}`;
    ctx.fillStyle = '#FFD700';
    ctx.fillText(`💰 ${dg.gold}`, sx + stripW - 12, midY);

    // Base HP bar just under the strip
    const bw = 220, bh = 14, bx = (W - bw) / 2, by = sy + stripH + 6;
    const pct = dg.base.hp / Math.max(dg.base.maxHp, 1);
    const hpColor = pct > 0.5 ? '#4CAF50' : (pct > 0.25 ? '#FF9800' : '#F44336');
    drawBar(ctx, bx, by, bw, bh, pct, hpColor, { track: 'rgba(0,0,0,0.5)', radius: 7 });
    ctx.fillStyle = '#FFF';
    ctx.font = `700 10px ${DEF_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏠 Base', W / 2, by + bh / 2 + 0.5);

    // Hint when nothing is selected
    if (dg.selectedSpotIndex === null && !dg.selectedTower) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = `11px ${DEF_FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('Click a 🔨 spot to build a tower', W / 2, by + bh + 16);
    }

    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
}

// ─────────────── Contextual tower panel (shared geometry) ───────────────

/**
 * Returns the screen-space button rects for whichever panel is open
 * (build panel for a selected spot, or upgrade/sell for a selected tower).
 * Used by BOTH the click handler (main.js) and the renderer so geometry and
 * affordability stay in sync. Returns [] when no panel is open.
 * Each button: { x, y, w, h, kind, id?, label, sub, color, disabled }.
 */
export function getDefensePanelButtons(dg, canvas) {
    const cv = canvas || (typeof document !== 'undefined' && document.getElementById('gameCanvas'));
    if (!cv) return [];
    const PW = 168, BH = 34, GAP = 4, PAD = 8, TITLE = 22;

    let anchorWorld = null;
    let rows = [];

    if (dg.selectedSpotIndex !== null && dg.towerSpots[dg.selectedSpotIndex] && !dg.towerSpots[dg.selectedSpotIndex].occupied) {
        const s = dg.towerSpots[dg.selectedSpotIndex];
        anchorWorld = { x: s.x, y: s.y };
        for (const id of TOWER_ORDER) {
            const c = TOWER_TYPES[id];
            rows.push({ kind: 'buy', id, label: `${c.icon} ${c.name}`, sub: `${c.cost}g`, color: c.color, disabled: dg.gold < c.cost });
        }
    } else if (dg.selectedTower) {
        const t = dg.selectedTower;
        anchorWorld = { x: t.x, y: t.y };
        const cost = getUpgradeCost(t);
        const maxed = t.level >= 5;
        rows.push({
            kind: 'upgrade', label: maxed ? 'Max Level' : `⬆ Upgrade`,
            sub: maxed ? `DMG ${getTowerDamage(t)}` : `${cost}g`, color: '#FFD54F',
            disabled: maxed || dg.gold < cost,
        });
        const refund = Math.floor((t.config.cost || 50) * 0.5 * (1 + (t.level - 1) * 0.3));
        rows.push({ kind: 'sell', label: '✖ Sell', sub: `+${refund}g`, color: '#EF9A9A', disabled: false });
    } else {
        return [];
    }

    const panelH = TITLE + rows.length * (BH + GAP) - GAP + PAD * 2;
    const a = worldToScreen(anchorWorld.x, anchorWorld.y);
    // Place above the anchor, clamped on-screen.
    let px = a.x - PW / 2;
    let py = a.y - 40 - panelH;
    px = Math.max(8, Math.min(cv.width - PW - 8, px));
    py = Math.max(54, Math.min(cv.height - panelH - 8, py));

    const buttons = [];
    let by = py + TITLE + PAD;
    for (const r of rows) {
        buttons.push({ ...r, x: px + PAD, y: by, w: PW - PAD * 2, h: BH, _panel: { px, py, pw: PW, ph: panelH } });
        by += BH + GAP;
    }
    return buttons;
}

export function drawDefensePanel(ctx, dg) {
    const buttons = getDefensePanelButtons(dg, ctx.canvas);
    if (buttons.length === 0) return;
    const p = buttons[0]._panel;
    const accent = dg.selectedTower ? '#FFD54F' : '#64B5F6';

    // Polished glass panel.
    drawPanel(ctx, p.px, p.py, p.pw, p.ph, { radius: 10, accent, glow: true });

    // Title
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `700 12px ${DEF_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const title = dg.selectedTower ? 'TOWER' : 'BUILD A TOWER';
    ctx.fillText(title, p.px + p.pw / 2, p.py + 13);

    for (const b of buttons) {
        const btnColor = b.color || '#888';
        // Button body — rounded, tinted by the row colour.
        const grad = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
        if (b.disabled) {
            grad.addColorStop(0, 'rgba(36,38,50,0.92)');
            grad.addColorStop(1, 'rgba(22,24,34,0.92)');
        } else {
            grad.addColorStop(0, withAlpha(btnColor, 0.28));
            grad.addColorStop(1, 'rgba(20,24,38,0.95)');
        }
        roundRectPath(ctx, b.x, b.y, b.w, b.h, 7);
        ctx.fillStyle = grad;
        ctx.fill();
        roundRectPath(ctx, b.x, b.y, b.w, b.h, 7);
        ctx.strokeStyle = b.disabled ? 'rgba(255,255,255,0.08)' : withAlpha(btnColor, 0.7);
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // label (left) + sub (right)
        ctx.textAlign = 'left';
        ctx.font = `600 13px ${DEF_FONT}`;
        ctx.fillStyle = b.disabled ? '#777' : '#FFF';
        ctx.fillText(b.label, b.x + 10, b.y + b.h / 2 + 0.5);
        ctx.textAlign = 'right';
        ctx.font = `800 12px ${DEF_FONT}`;
        ctx.fillStyle = b.disabled ? '#6b5a1f' : '#FFD700';
        ctx.fillText(b.sub, b.x + b.w - 10, b.y + b.h / 2 + 0.5);
    }

    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
}

// ───────────────────────── Game over / victory ─────────────────────────

export function drawBaseDefenseGameOver(ctx, dg) {
    if (dg.state !== 'lost') return;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#F44336';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText('💀 BASE DESTROYED', W / 2, H / 2 - 20);
    const secs = Math.floor(dg.elapsed || 0);
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    ctx.fillStyle = '#CCC';
    ctx.font = '18px sans-serif';
    ctx.fillText(`Held the line for ${mm}:${ss}  ·  ${dg.kills || 0} kills`, W / 2, H / 2 + 24);
    ctx.fillStyle = '#AAA';
    ctx.font = '14px sans-serif';
    ctx.fillText('Press R to restart', W / 2, H / 2 + 54);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
}
