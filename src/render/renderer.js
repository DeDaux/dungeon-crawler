// renderer.js — render orchestrator: clear → camera → dungeon → entities → HUD

import { getCanvas, getCtx } from '../engine.js';
import { Camera, applyCameraTransform, ZOOM } from '../camera.js';
import { drawEntity } from './drawEntity.js';
import { drawDungeon } from './drawDungeon.js';
import { drawHUD } from './drawHUD.js';
import { drawParticles, drawCastIndicator, drawEnemyAoeZones, drawAmbientParticles, spawnAmbientParticle } from './drawEffects.js';
import { drawProjectile } from '../systems/projectiles.js';
import { getFloatingTexts } from '../systems/combat.js';
import { TILE } from '../systems/map.js';

const canvas = getCanvas();
const ctx = getCtx();

// ── Polished floating-popup text ──────────────────────────────────────────
// Damage numbers, gold, item pickups and callouts all render through this so
// they share one juicy look: a soft coloured glow, a dark contrast outline,
// and a bright top-lit gradient fill. Drawn in WORLD space (inside the camera
// transform) so a popup sits exactly above whatever spawned it.

/** Lighten a #rgb / #rrggbb colour toward white (for the gradient highlight). */
function lightenColor(hex, amt = 0.55) {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(hex) || /^#?([0-9a-fA-F]{3})$/.exec(hex);
    if (!m) return '#ffffff';
    let h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    let r = parseInt(h.slice(0, 2), 16);
    let g = parseInt(h.slice(2, 4), 16);
    let b = parseInt(h.slice(4, 6), 16);
    r = Math.round(r + (255 - r) * amt);
    g = Math.round(g + (255 - g) * amt);
    b = Math.round(b + (255 - b) * amt);
    return `rgb(${r},${g},${b})`;
}

/** easeOutBack — a tiny overshoot that gives popups a satisfying "pop". */
function easeOutBack(t) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/**
 * Draw one popup string centred on a world point.
 * @param plate  when true, paint a soft rounded backdrop (used for loot drops).
 */
function drawPopupText(text, wx, wy, color, size, scale = 1, alpha = 1, plate = false) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(wx, wy);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${size}px "Segoe UI", system-ui, sans-serif`;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;

    if (plate) {
        const w = ctx.measureText(text).width + size * 1.1;
        const h = size * 1.7;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = 'rgba(12,10,22,0.62)';
        roundRect(-w / 2, -h / 2, w, h, h * 0.4);
        ctx.fill();
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = `rgba(${hexToRgb(color)},0.55)`;
        roundRect(-w / 2, -h / 2, w, h, h * 0.4);
        ctx.stroke();
        ctx.restore();
    }

    // Coloured glow halo behind the glyphs.
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.lineWidth = Math.max(3, size * 0.24);
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.strokeText(text, 0, 0);
    ctx.shadowBlur = 0;

    // Top-lit gradient fill for a crisp, dimensional look.
    const grad = ctx.createLinearGradient(0, -size * 0.62, 0, size * 0.62);
    grad.addColorStop(0, lightenColor(color, 0.75));
    grad.addColorStop(0.45, lightenColor(color, 0.2));
    grad.addColorStop(1, color);
    ctx.fillStyle = grad;
    ctx.fillText(text, 0, 0);

    ctx.restore();
}

/** #rgb / #rrggbb → "r,g,b" string (falls back to a neutral grey). */
function hexToRgb(hex) {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(hex) || /^#?([0-9a-fA-F]{3})$/.exec(hex);
    if (!m) return '200,200,200';
    let h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return `${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)}`;
}

/** Trace a rounded rectangle path (caller fills/strokes). */
function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// ── Procedural void backdrop (replaces the old background image) ──
// A fixed star field generated once, tiled with parallax so the abyss beyond
// the dungeon feels deep and alive without any bitmap asset.
const VOID_FIELD = 700;
const VOID_STARS = (() => {
    const arr = [];
    for (let i = 0; i < 190; i++) {
        arr.push({
            x: Math.random() * VOID_FIELD,
            y: Math.random() * VOID_FIELD,
            r: Math.random() * 1.2 + 0.25,
            b: 0.25 + Math.random() * 0.75,   // base brightness
            tw: Math.random() * Math.PI * 2,  // twinkle phase
            c: Math.random(),                 // colour pick
        });
    }
    return arr;
})();

/** Paint the deep, drifting void: dark depth gradient + nebula glow + starfield. */
function drawVoidBackground(cw, ch) {
    // Deep vertical gradient base.
    const bg = ctx.createLinearGradient(0, 0, 0, ch);
    bg.addColorStop(0, '#0b0817');
    bg.addColorStop(0.55, '#0a0a1a');
    bg.addColorStop(1, '#060510');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cw, ch);

    const t = Date.now() / 1000;

    // Soft nebula clouds — screen-anchored with a gentle breathing drift.
    const nebula = [
        { x: 0.24, y: 0.18, r: 0.62, col: '120,60,180' },
        { x: 0.82, y: 0.66, r: 0.72, col: '40,80,160' },
        { x: 0.55, y: 0.92, r: 0.5, col: '150,40,120' },
    ];
    for (const n of nebula) {
        const cx = n.x * cw + Math.sin(t * 0.06 + n.x * 7) * 24;
        const cy = n.y * ch + Math.cos(t * 0.05 + n.y * 5) * 18;
        const rad = n.r * Math.max(cw, ch);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        g.addColorStop(0, `rgba(${n.col},0.11)`);
        g.addColorStop(0.5, `rgba(${n.col},0.04)`);
        g.addColorStop(1, `rgba(${n.col},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, cw, ch);
    }

    // Parallax starfield (distant → moves slowly with the camera), twinkling.
    const ox = ((Camera.x * 0.05) % VOID_FIELD + VOID_FIELD) % VOID_FIELD;
    const oy = ((Camera.y * 0.05) % VOID_FIELD + VOID_FIELD) % VOID_FIELD;
    for (let ty = -1; ty * VOID_FIELD < ch + VOID_FIELD; ty++) {
        for (let tx = -1; tx * VOID_FIELD < cw + VOID_FIELD; tx++) {
            const baseX = tx * VOID_FIELD - ox;
            const baseY = ty * VOID_FIELD - oy;
            for (const s of VOID_STARS) {
                const sx = baseX + s.x, sy = baseY + s.y;
                if (sx < -2 || sx > cw + 2 || sy < -2 || sy > ch + 2) continue;
                const tw = 0.5 + 0.5 * Math.sin(t * 2 + s.tw);
                const a = s.b * (0.35 + 0.65 * tw);
                ctx.fillStyle = s.c > 0.85 ? `rgba(180,205,255,${a})`
                    : s.c > 0.6 ? `rgba(220,185,255,${a})`
                    : `rgba(255,255,255,${a})`;
                ctx.beginPath();
                ctx.arc(sx, sy, s.r * (0.7 + 0.5 * tw), 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
}

/** Mount Olympus sky — a luminous heroic backdrop (sun, gold cloud banks, god
 *  rays, drifting motes) shown beyond the marble halls instead of the void. */
function drawOlympusSky(cw, ch) {
    const t = Date.now() / 1000;
    // Sky gradient: high blue heavens easing down into a golden, sunlit haze.
    const sky = ctx.createLinearGradient(0, 0, 0, ch);
    sky.addColorStop(0, '#2a4f86');
    sky.addColorStop(0.42, '#6f86b0');
    sky.addColorStop(0.72, '#c9a96b');
    sky.addColorStop(1, '#e7c885');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, cw, ch);

    // The sun, high to one side, with a broad warm corona.
    const sunX = cw * 0.74, sunY = ch * 0.2;
    const sun = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, Math.max(cw, ch) * 0.6);
    sun.addColorStop(0, 'rgba(255,248,214,0.95)');
    sun.addColorStop(0.12, 'rgba(255,236,170,0.55)');
    sun.addColorStop(0.4, 'rgba(255,214,130,0.14)');
    sun.addColorStop(1, 'rgba(255,214,130,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, cw, ch);

    // Slow god rays fanning from the sun.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(sunX, sunY);
    for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + t * 0.04;
        ctx.rotate((Math.PI * 2) / 9);
        const ray = ctx.createLinearGradient(0, 0, Math.cos(a) * cw, Math.sin(a) * cw);
        ray.addColorStop(0, 'rgba(255,240,190,0.05)');
        ray.addColorStop(1, 'rgba(255,240,190,0)');
        ctx.fillStyle = ray;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a - 0.06) * cw * 1.4, Math.sin(a - 0.06) * cw * 1.4);
        ctx.lineTo(Math.cos(a + 0.06) * cw * 1.4, Math.sin(a + 0.06) * cw * 1.4);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();

    // Layered golden cloud banks drifting on parallax.
    const clouds = [
        { y: 0.32, r: 0.5, a: 0.18, sp: 14, n: 3 },
        { y: 0.55, r: 0.62, a: 0.22, sp: 9, n: 3 },
        { y: 0.78, r: 0.7, a: 0.26, sp: 5, n: 4 },
    ];
    for (const band of clouds) {
        const drift = (t * band.sp + Camera.x * 0.02) % (cw + 400) - 200;
        for (let i = 0; i < band.n; i++) {
            const cx = ((drift + i * (cw / band.n)) % (cw + 400) + cw + 400) % (cw + 400) - 200;
            const cy = band.y * ch + Math.sin(t * 0.2 + i) * 6;
            const rad = band.r * cw * 0.28;
            const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
            g.addColorStop(0, `rgba(255,243,210,${band.a})`);
            g.addColorStop(0.5, `rgba(255,226,160,${band.a * 0.4})`);
            g.addColorStop(1, 'rgba(255,226,160,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rad, rad * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

// Damage flash overlay timer
let _damageFlashTimer = 0;

/** Contrast + saturation "punch": blending the frame onto itself with the
 *  overlay operator applies a per-channel S-curve — shadows deepen, highlights
 *  lift, and colours saturate — so the whole image reads richer and more
 *  cinematic. Kept subtle so gameplay stays readable. */
let _gradeDisabled = false;
if (typeof window !== 'undefined') window.__setGrade = (on) => { _gradeDisabled = !on; };
function applyTonePunch() {
    if (_gradeDisabled) return;
    if (canvas.width < 4 || canvas.height < 4) return;
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.2;
    ctx.drawImage(canvas, 0, 0);
    ctx.restore();
}

// Per-theme colour grade [topTint, bottomTint] — gives each generated dungeon a
// Per-theme floating-atmosphere particles — embers rise in lava, snow falls in
// frost, spores/fireflies drift in fungal/ruins, sparkles in crystal, dust elsewhere.
const THEME_AMBIENT = {
    lava:    { color: '#ffbe5a', vy: -28, life: 2.2, min: 1, max: 2.8, glow: true,  rate: 0.9,  twinkle: true },
    frost:   { color: '#e3f2ff', vy: 16,  life: 4.5, min: 1, max: 2.4, glow: false, rate: 0.85, twinkle: false },
    fungal:  { color: '#c45aff', vy: -7,  life: 5.0, min: 1, max: 2.2, glow: true,  rate: 0.6,  twinkle: true },
    crystal: { color: '#8fd6ff', vy: -5,  life: 4.5, min: 1, max: 1.8, glow: true,  rate: 0.5,  twinkle: true },
    ruins:   { color: '#a6ff7a', vy: -9,  life: 4.0, min: 1, max: 1.8, glow: true,  rate: 0.45, twinkle: true },
    caverns: { color: '#cdbb9a', vy: -7,  life: 4.5, min: 1, max: 2.4, glow: false, rate: 0.5,  twinkle: false },
    halls:   { color: '#aab0c0', vy: -5,  life: 4.5, min: 1, max: 2.0, glow: false, rate: 0.4,  twinkle: false },
    mixed:   { color: '#b6c0d8', vy: -6,  life: 4.5, min: 1, max: 2.2, glow: false, rate: 0.45, twinkle: false },
    olympus: { color: '#ffe6a6', vy: -10, life: 4.5, min: 1, max: 2.4, glow: true,  rate: 0.7,  twinkle: true },
};

// distinct overall hue (green ruins, red lava, icy frost, violet fungal, …).
const THEME_GRADE = {
    caverns: ['rgba(110,70,30,0.15)', 'rgba(150,95,45,0.13)'],
    crystal: ['rgba(45,80,165,0.16)', 'rgba(90,135,210,0.13)'],
    halls:   ['rgba(80,85,100,0.12)', 'rgba(120,120,135,0.11)'],
    ruins:   ['rgba(45,100,40,0.17)', 'rgba(95,150,60,0.14)'],
    lava:    ['rgba(120,35,18,0.18)', 'rgba(225,90,30,0.18)'],
    frost:   ['rgba(80,150,205,0.17)', 'rgba(160,200,235,0.14)'],
    fungal:  ['rgba(100,40,135,0.17)', 'rgba(155,75,180,0.14)'],
    mixed:   ['rgba(70,95,155,0.13)', 'rgba(195,130,70,0.13)'],
    olympus: ['rgba(255,210,120,0.16)', 'rgba(225,170,80,0.16)'],   // warm heroic gold
};

/** Cinematic colour grade, tinted to the dungeon's theme via soft-light so it
 *  enriches tone (and gives the room its overall colour) without crushing it. */
function applyColorGrade(theme) {
    if (canvas.width < 4 || canvas.height < 4) return;
    const [top, bottom] = THEME_GRADE[theme] || THEME_GRADE.mixed;
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, top);
    g.addColorStop(0.55, 'rgba(30,25,40,0.04)');
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
}

/** Trigger a brief red flash overlay (called externally, e.g. on player hit) */
export function triggerDamageFlash(intensity = 1) {
    _damageFlashTimer = Math.max(_damageFlashTimer, 0.2 * intensity);
}

/** Tick the damage flash timer (called every frame from the main loop) */
export function tickDamageFlash(dt) {
    if (_damageFlashTimer > 0) _damageFlashTimer -= dt;
}

// Jump-scare: a face lunges out of the dark over the whole screen for ~0.5s.
let _jumpScareStart = -10;
export function triggerJumpScare() { _jumpScareStart = Date.now(); }

/** Draw the jump-scare overlay (p = 0..1 progress). */
function drawJumpScare(cw, ch, p) {
    const fade = p < 0.1 ? 1 : (p < 0.65 ? 1 : 1 - (p - 0.65) / 0.35);
    const jx = (Math.random() - 0.5) * 20 * (1 - p);
    const jy = (Math.random() - 0.5) * 20 * (1 - p);
    ctx.save();
    if (p < 0.12) { ctx.fillStyle = `rgba(255,255,255,${1 - p / 0.12})`; ctx.fillRect(0, 0, cw, ch); }
    ctx.fillStyle = `rgba(8,0,2,${0.93 * fade})`;
    ctx.fillRect(0, 0, cw, ch);
    ctx.globalAlpha = fade;
    ctx.translate(cw / 2 + jx, ch / 2 + jy);
    const s = Math.min(cw, ch) * (0.46 + 0.05 * Math.sin(p * 34));
    // gaunt head
    const hg = ctx.createRadialGradient(-s * 0.2, -s * 0.3, s * 0.1, 0, 0, s * 1.2);
    hg.addColorStop(0, '#d9d4cb'); hg.addColorStop(0.7, '#8f897f'); hg.addColorStop(1, '#140f17');
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.ellipse(0, 0, s * 0.8, s * 1.05, 0, 0, Math.PI * 2); ctx.fill();
    // sunken sockets + glowing eyes
    ctx.fillStyle = '#050507';
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.ellipse(d * s * 0.34, -s * 0.28, s * 0.26, s * 0.33, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.shadowColor = '#fff'; ctx.shadowBlur = 34; ctx.fillStyle = '#fafafa';
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.arc(d * s * 0.34, -s * 0.26, s * 0.13, 0, Math.PI * 2); ctx.fill(); }
    ctx.shadowBlur = 0; ctx.fillStyle = '#000';
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.arc(d * s * 0.34, -s * 0.23, s * 0.04, 0, Math.PI * 2); ctx.fill(); }
    // giant jagged grin
    const gw = s * 0.62, gy = s * 0.34, gh = s * 0.15;
    ctx.beginPath();
    ctx.moveTo(-gw, gy - gh * 0.3);
    ctx.quadraticCurveTo(0, gy + gh * 2.4, gw, gy - gh * 0.3);
    ctx.quadraticCurveTo(0, gy + gh * 0.6, -gw, gy - gh * 0.3);
    ctx.closePath();
    ctx.fillStyle = '#0a0406'; ctx.fill(); ctx.save(); ctx.clip();
    const n = 15, tw = (2 * gw) / n;
    ctx.fillStyle = '#e8e4d6';
    for (let i = 0; i < n; i++) {
        const tx = -gw + i * tw;
        ctx.beginPath(); ctx.moveTo(tx, gy - gh); ctx.lineTo(tx + tw, gy - gh); ctx.lineTo(tx + tw / 2, gy + gh * 1.4); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(tx + tw / 2, gy + gh * 2.8); ctx.lineTo(tx + tw * 1.5, gy + gh * 2.8); ctx.lineTo(tx + tw, gy + gh * 0.5); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.restore();
}

/**
 * Main render function — called every frame
 */
export function render(entities, projectiles, map, player) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // --- Backdrop (visible beyond the dungeon map bounds) ---
    if (map && map.theme === 'olympus') {
        drawOlympusSky(canvas.width, canvas.height);
    } else {
        drawVoidBackground(canvas.width, canvas.height);
    }

    // --- World space rendering ---
    ctx.save();
    applyCameraTransform(ctx);

    const viewWidth = canvas.width / ZOOM;
    const viewHeight = canvas.height / ZOOM;

    // Dungeon tiles
    drawDungeon(ctx, map, Camera, viewWidth, viewHeight);

    // Boss ultimate warning rings — ground-level, drawn under entities
    drawEnemyAoeZones(ctx, entities);

    // Sort entities by Y for painter's algorithm (depth).
    // Downed (co-op) players stay rendered even though alive===false.
    const sorted = [...entities].filter(e => e.alive || e.deathTimer > 0 || e.downed);
    sorted.sort((a, b) => (a.y + a.size) - (b.y + b.size));

    // Draw entities
    for (const entity of sorted) {
        drawEntity(ctx, entity, Camera, viewWidth, viewHeight);
    }

    // Draw projectiles
    for (const p of projectiles) {
        drawProjectile(ctx, p, Camera);
    }

    // Draw particles
    drawParticles(ctx, Camera);
    drawAmbientParticles(ctx, Camera);

    // Cast indicator
    if (player && player.castingKey) {
        drawCastIndicator(ctx, player, Camera, entities);
    }

    // --- Floating damage numbers / callouts (drawn at their world source) ---
    const floats = getFloatingTexts();
    for (const ft of floats) {
        const maxLife = ft.maxLife || 1.2;
        const p = Math.max(0, Math.min(1, 1 - ft.life / maxLife)); // 0→1 over life
        // Pop in with a slight overshoot, then settle.
        const pop = easeOutBack(Math.min(1, p / 0.22));
        const scale = 0.45 + pop * 0.55;
        // Quick fade-in, hold, then fade out over the final third.
        const fadeIn = Math.min(1, p / 0.08);
        const fadeOut = Math.min(1, ft.life / (maxLife * 0.35));
        const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
        drawPopupText(ft.text, ft.x, ft.y, ft.color, ft.size, scale, alpha);
    }

    // --- Chest loot text (persistent ~3s display, right above the chest) ---
    for (const e of entities) {
        if (e._lootTextTimer > 0 && e._lootTextItems && e._lootTextItems.length > 0) {
            const itemCount = e._lootTextItems.length;
            // Pop the plate in over the first 0.22s, fade out over the final 0.6s.
            const age = 3.0 - e._lootTextTimer;
            const pop = easeOutBack(Math.min(1, age / 0.22));
            const scale = 0.5 + pop * 0.5;
            const alpha = Math.max(0, Math.min(1, e._lootTextTimer / 0.6, age / 0.12 + 0.001));
            for (let i = 0; i < itemCount; i++) {
                const li = e._lootTextItems[i];
                const offsetY = -e.size * 0.6 - (itemCount - 1 - i) * (li.size + 8) - 10;
                drawPopupText(li.text, e.x, e.y + offsetY, li.color, li.size, scale, alpha, true);
            }
        }
    }

    // --- Last Stand visual (golden glow when below 20% HP) ---
    if (player && player.alive && player.hp < player.maxHp * 0.2 && !player.invisible) {
        const pulse = 0.3 + 0.2 * Math.sin(Date.now() / 400);
        ctx.strokeStyle = `rgba(255, 215, 0, ${pulse})`;
        ctx.lineWidth = 4;
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.size + 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    // --- Theme atmosphere: floating motes drifting through the air ---
    if (player && map && map.grid) {
        const cfg = THEME_AMBIENT[map.theme] || THEME_AMBIENT.mixed;
        // a few spawn attempts per frame, anywhere in view (air particles)
        for (let i = 0; i < 3; i++) {
            if (Math.random() > cfg.rate) continue;
            const wx = Camera.x + Math.random() * viewWidth;
            const wy = Camera.y + Math.random() * viewHeight;
            const sz = cfg.min + Math.random() * (cfg.max - cfg.min);
            spawnAmbientParticle(wx, wy, cfg.color, cfg.life * (0.7 + Math.random() * 0.6), cfg.vy,
                { size: sz, glow: cfg.glow, twinkle: cfg.twinkle, sway: cfg.glow ? 1.3 : 0.6 });
        }
        // brighter embers boil up from torches and lava tiles
        const startTx = Math.max(0, Math.floor(Camera.x / 32));
        const endTx = Math.min(map.width - 1, Math.ceil((Camera.x + viewWidth) / 32));
        const startTy = Math.max(0, Math.floor(Camera.y / 32));
        const endTy = Math.min(map.height - 1, Math.ceil((Camera.y + viewHeight) / 32));
        for (let ty = startTy; ty <= endTy; ty += 2) {
            for (let tx = startTx; tx <= endTx; tx += 2) {
                const tile = map.grid[ty]?.[tx];
                if (tile === TILE.TORCH && Math.random() < 0.35) {
                    spawnAmbientParticle(tx * 32 + 16 + (Math.random() - 0.5) * 16, ty * 32 + 8, '#ffc266', 1.4, -34, { size: 1.6, glow: true });
                } else if (tile === TILE.LAVA && Math.random() < 0.14) {
                    spawnAmbientParticle(tx * 32 + Math.random() * 32, ty * 32 + 20, '#ffce6a', 1.8, -30, { size: 2, glow: true, twinkle: true });
                }
            }
        }
    }

    ctx.restore();

    // ── Atmosphere: warm light + torch glows (additive) then a framing vignette ──
    // Cinematic depth without hiding gameplay: lights brighten, the vignette only
    // darkens the far screen edges (centre stays fully readable).
    {
        const cw = canvas.width, ch = canvas.height;

        // Additive light sources (hero glow + torches + lava).
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        if (player && player.alive) {
            const px = (player.x - Camera.x) * ZOOM;
            const py = (player.y - Camera.y) * ZOOM;
            const r = 240 * ZOOM;
            const grad = ctx.createRadialGradient(px, py, 0, px, py, r);
            grad.addColorStop(0, 'rgba(255, 224, 168, 0.13)');
            grad.addColorStop(0.5, 'rgba(255, 196, 130, 0.06)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, cw, ch);
        }

        if (map && map.grid) {
            const startTx = Math.max(0, Math.floor(Camera.x / 32));
            const endTx = Math.min(map.width - 1, Math.ceil((Camera.x + viewWidth) / 32));
            const startTy = Math.max(0, Math.floor(Camera.y / 32));
            const endTy = Math.min(map.height - 1, Math.ceil((Camera.y + viewHeight) / 32));
            const flicker = 0.85 + 0.15 * Math.sin(Date.now() / 90);
            for (let ty = startTy; ty <= endTy; ty++) {
                for (let tx = startTx; tx <= endTx; tx++) {
                    const t = map.grid[ty]?.[tx];
                    if (t === TILE.TORCH) {
                        const lx = (tx * 32 + 16 - Camera.x) * ZOOM;
                        const ly = (ty * 32 + 10 - Camera.y) * ZOOM;
                        const r = 95 * ZOOM * flicker;
                        const grad = ctx.createRadialGradient(lx, ly, 0, lx, ly, r);
                        grad.addColorStop(0, 'rgba(255, 190, 90, 0.5)');
                        grad.addColorStop(0.5, 'rgba(255, 140, 50, 0.18)');
                        grad.addColorStop(1, 'rgba(0,0,0,0)');
                        ctx.fillStyle = grad;
                        ctx.beginPath(); ctx.arc(lx, ly, r, 0, Math.PI * 2); ctx.fill();
                    } else if (t === TILE.LAVA) {
                        const lx = (tx * 32 + 16 - Camera.x) * ZOOM;
                        const ly = (ty * 32 + 16 - Camera.y) * ZOOM;
                        const r = 55 * ZOOM;
                        const grad = ctx.createRadialGradient(lx, ly, 0, lx, ly, r);
                        grad.addColorStop(0, 'rgba(255, 90, 25, 0.32)');
                        grad.addColorStop(1, 'rgba(0,0,0,0)');
                        ctx.fillStyle = grad;
                        ctx.beginPath(); ctx.arc(lx, ly, r, 0, Math.PI * 2); ctx.fill();
                    }
                }
            }
        }
        ctx.restore();

        // Framing vignette — transparent centre, darkened corners only.
        const cx = cw / 2, cy = ch / 2;
        const vg = ctx.createRadialGradient(cx, cy, Math.min(cw, ch) * 0.36, cx, cy, Math.max(cw, ch) * 0.72);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(0.7, 'rgba(0,0,0,0.18)');
        vg.addColorStop(1, 'rgba(8,6,16,0.55)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, cw, ch);
    }

    // ── Contrast/saturation punch → theme tint (before HUD so UI stays crisp) ──
    // (Bloom glow intentionally disabled — kept the contrast/tone grade only.)
    applyTonePunch();
    applyColorGrade(map && map.theme);

    // ── Suffocating darkness — only a small, flickering pool of light around you.
    //    The dungeon drowns in black so the horrors loom out of nowhere; the
    //    torch breathes, stutters, and rarely cuts out entirely. ──
    if (player) {
        const cw = canvas.width, ch = canvas.height;
        const t = Date.now() / 1000;
        let flicker = 0.9 + 0.08 * Math.sin(t * 8.7) + 0.05 * Math.sin(t * 21.3);
        // rare, brief lights-out for a stab of panic
        if (Math.sin(t * 0.7) * Math.sin(t * 1.39) * Math.sin(t * 2.13) > 0.92) flicker *= 0.22;
        const px = player.alive ? (player.x - Camera.x) * ZOOM : cw / 2;
        const py = player.alive ? (player.y - Camera.y) * ZOOM : ch / 2;
        const lightR = (150 + 26 * Math.sin(t * 2.7)) * ZOOM * flicker;
        const DARK = 0.9;
        const dg = ctx.createRadialGradient(px, py, Math.max(1, lightR * 0.34), px, py, lightR * 2.4);
        dg.addColorStop(0, 'rgba(0,0,0,0)');
        dg.addColorStop(0.5, `rgba(2,1,5,${DARK * 0.5})`);
        dg.addColorStop(1, `rgba(0,0,0,${DARK})`);
        ctx.fillStyle = dg;
        ctx.fillRect(0, 0, cw, ch);
    }

    // ── Dread vignette — the dark closes in when a horror champion hunts you ──
    if (player && player.alive && entities) {
        let nearest = Infinity, hunting = 0;
        for (const e of entities) {
            if (!e.alive || !e._hunter) continue;
            if (e.attackTarget !== player && e.aiState !== 'chase') continue;
            hunting++;
            const d = Math.hypot(e.x - player.x, e.y - player.y);
            if (d < nearest) nearest = d;
        }
        if (hunting > 0) {
            const cw = canvas.width, ch = canvas.height;
            // Proximity dread (0..1) + a slow uneasy breathing pulse.
            const prox = nearest < 420 ? (1 - nearest / 420) : 0;
            const breathe = 0.85 + 0.15 * Math.sin(Date.now() / 700);
            const dark = (0.16 + 0.5 * prox) * breathe;
            const dv = ctx.createRadialGradient(cw / 2, ch / 2, ch * (0.42 - prox * 0.18), cw / 2, ch / 2, ch * 0.82);
            dv.addColorStop(0, 'rgba(0,0,0,0)');
            dv.addColorStop(0.6, `rgba(2,1,4,${dark * 0.5})`);
            dv.addColorStop(1, `rgba(0,0,0,${Math.min(0.92, dark + 0.2)})`);
            ctx.fillStyle = dv;
            ctx.fillRect(0, 0, cw, ch);
            // A sick blood tint bleeds in when one is right on top of you.
            if (prox > 0.55) {
                const blood = (prox - 0.55) * 0.5 * breathe;
                const bg = ctx.createRadialGradient(cw / 2, ch / 2, ch * 0.2, cw / 2, ch / 2, ch * 0.8);
                bg.addColorStop(0, 'rgba(120,0,0,0)');
                bg.addColorStop(1, `rgba(90,0,0,${blood})`);
                ctx.fillStyle = bg;
                ctx.fillRect(0, 0, cw, ch);
            }
        }
    }

    // ── Low-HP vignette ──
    if (player && player.alive && player.hp < player.maxHp * 0.3) {
        const severity = 1 - (player.hp / (player.maxHp * 0.3));
        const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 300);
        const alpha = severity * pulse * 0.5;
        const vignetteGrad = ctx.createRadialGradient(
            canvas.width / 2, canvas.height / 2, canvas.width * 0.35,
            canvas.width / 2, canvas.height / 2, canvas.width * 0.75
        );
        vignetteGrad.addColorStop(0, 'rgba(255, 0, 0, 0)');
        vignetteGrad.addColorStop(1, `rgba(180, 0, 0, ${alpha})`);
        ctx.fillStyle = vignetteGrad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // ── Blood on damage — visceral red creeping from the edges + a hit wash ──
    if (_damageFlashTimer > 0) {
        const cw = canvas.width, ch = canvas.height;
        const a = Math.min(0.6, _damageFlashTimer * 2.4);
        const bg = ctx.createRadialGradient(cw / 2, ch / 2, ch * 0.22, cw / 2, ch / 2, ch * 0.78);
        bg.addColorStop(0, 'rgba(150,0,0,0)');
        bg.addColorStop(0.7, `rgba(110,0,0,${a * 0.55})`);
        bg.addColorStop(1, `rgba(55,0,0,${a})`);
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, cw, ch);
        ctx.fillStyle = `rgba(150,12,12,${a * 0.35})`;
        ctx.fillRect(0, 0, cw, ch);
    }

    // --- Screen space rendering ---
    drawHUD(ctx, player, entities, projectiles, map, Camera, canvas.width, canvas.height);

    // --- Chest hint: "Attack chests to open!" ---
    if (player && player.alive) {
        for (const e of entities) {
            if (e.type === 'chest' && e.alive) {
                const sx = (e.x - Camera.x) * ZOOM;
                const sy = (e.y - Camera.y) * ZOOM;
                if (sx > -50 && sx < canvas.width + 50 && sy > -50 && sy < canvas.height + 50) {
                    ctx.fillStyle = 'rgba(255, 215, 0, 0.6)';
                    ctx.font = '10px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText('💎 ATTACK TO OPEN', sx, sy - e.size - 14);
                    ctx.textAlign = 'start';
                }
            }
        }
    }

    // ── JUMP SCARE — a screaming face lunges over EVERYTHING (incl. HUD) ──
    const jsEl = (Date.now() - _jumpScareStart) / 1000;
    if (jsEl >= 0 && jsEl < 0.5) {
        drawJumpScare(canvas.width, canvas.height, jsEl / 0.5);
    }

    // NOTE: mouse hover/click hit-testing happens in main.js handleInput() —
    // it cannot live here because Input click flags are reset before render runs.
}
