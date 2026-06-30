// drawCharacter.js — procedural, animated character art.
// Replaces the image-sprite renderer: every hero and enemy is drawn entirely
// from canvas primitives with shading, outlines, and a live walk/idle/attack
// animation, so the cast looks "finished" without any sprite sheets.

import { CHAMPIONS } from '../config/champions.js';
import { ENEMIES } from '../config/enemies.js';

/** Resolve an entity's base colours + role from the config (entities don't carry them). */
function resolveLook(e) {
    if (e.type === 'player') {
        const c = CHAMPIONS[e.championId] || {};
        return { color: c.color || '#4CAF50', dark: c.colorDark || '#2E7D32', role: c.role || '' };
    }
    if (e.enemyType === 'chest' || e._isChest) return { color: '#FFD54A', dark: '#8a6a18', role: '' };
    const en = ENEMIES[e.enemyType] || {};
    return { color: en.color || '#888', dark: en.colorDark || '#555', role: '' };
}

// ── colour helpers ──────────────────────────────────────────────────
function hexToRgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** f>1 lightens toward white, f<1 darkens toward black. */
function shade(hex, f) {
    let [r, g, b] = hexToRgb(hex);
    if (f >= 1) { const t = f - 1; r += (255 - r) * t; g += (255 - g) * t; b += (255 - b) * t; }
    else { r *= f; g *= f; b *= f; }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
}

/** Thick round-capped line = a rounded limb, drawn outlined + shaded + sheened. */
function limb(ctx, x1, y1, x2, y2, w, color) {
    ctx.lineCap = 'round';
    // dark outline
    ctx.strokeStyle = shade(color, 0.45);
    ctx.lineWidth = w + 2.2;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    // limb body
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    // sheen along the top half
    ctx.strokeStyle = shade(color, 1.3);
    ctx.lineWidth = Math.max(1, w * 0.28);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 + (x2 - x1) * 0.55, y1 + (y2 - y1) * 0.55); ctx.stroke();
}

// ── archetype mapping ────────────────────────────────────────────────
function getKind(e) {
    if (e.type === 'player') return 'hero';
    if (e.enemyType === 'chest' || e._isChest) return 'chest';
    if (e._horror) return 'horror';
    switch (e.enemyType) {
        case 'slime': return 'slime';
        case 'bat': return 'bat';
        case 'giant_spider': return 'spider';
        case 'demon_hound': return 'hound';
        case 'fire_elemental': return 'elemental';
        case 'boss_dragon': return 'dragon';
        default: return 'humanoid';
    }
}

/** Per-entity feature set used by the humanoid drawer. */
function featuresFor(e) {
    const look = resolveLook(e);
    const color = look.color;
    const dark = look.dark;
    const base = {
        skin: color, skinHi: shade(color, 1.28), skinLo: dark,
        cloth: shade(color, 0.7), clothHi: shade(color, 0.95),
        metal: '#9aa4b2', metalHi: '#d7dde6', metalLo: '#566072',
        weapon: 'sword', helmet: false, hood: false, robe: false,
        ears: false, tusks: false, skull: false, horns: false, bulk: 1,
    };
    if (e.type === 'player') {
        const role = look.role.toLowerCase();
        if (role.includes('tank')) return { ...base, weapon: 'shieldsword', helmet: true, bulk: 1.1, skin: '#e8b98f', skinHi: '#ffd9b0', skinLo: '#a9744a', cloth: shade(color, 0.85) };
        if (role.includes('assassin')) return { ...base, weapon: 'dagger', hood: true, bulk: 0.9 };
        if (role.includes('marksman') || role.includes('ranged') && role.includes('mark')) return { ...base, weapon: 'bow', hood: true, bulk: 0.92 };
        if (role.includes('mage')) return { ...base, weapon: 'staff', hood: true, robe: true };
        if (role.includes('caster') || role.includes('ninja')) return { ...base, weapon: 'dagger', hood: true };
        if (role.includes('bruiser') || role.includes('brawler')) return { ...base, weapon: 'axe', bulk: 1.12, skin: '#7CB342', skinHi: '#9CCC65', skinLo: '#558B2F', tusks: true };
        return { ...base, weapon: 'sword', bulk: 1 };
    }
    switch (e.enemyType) {
        case 'goblin': return { ...base, weapon: 'club', ears: true, bulk: 0.82, skin: '#7d9e3a', skinHi: '#a4c45a', skinLo: '#4e6322' };
        case 'orc_warrior': return { ...base, weapon: 'axe', tusks: true, bulk: 1.18, skin: '#6f7f3e', skinHi: '#93a356', skinLo: '#3e4f1e' };
        case 'skeleton': return { ...base, weapon: 'bow', skull: true, bulk: 0.95, skin: '#e6e6dc', skinHi: '#ffffff', skinLo: '#9a9a90' };
        case 'skeleton_minion': return { ...base, weapon: 'club', skull: true, bulk: 0.8, skin: '#e6e6dc', skinHi: '#ffffff', skinLo: '#9a9a90' };
        case 'dark_knight': return { ...base, weapon: 'shieldsword', helmet: true, bulk: 1.18, metal: '#2b2b34', metalHi: '#54545f', metalLo: '#101015', skin: '#2b2b34' };
        case 'necromancer': return { ...base, weapon: 'staff', hood: true, robe: true, skin: '#b39ddb', skinHi: '#d1c4e9', skinLo: '#4527a0' };
        default: return base;
    }
}

// ── shadow ───────────────────────────────────────────────────────────
function drawShadow(ctx, e, scale) {
    const w = e.size * 0.62 * scale;
    // Light comes from the top-left, so the contact shadow pools slightly to the
    // lower-right of the feet. A darker, tighter core grounds the figure firmly.
    const cx = e.x + w * 0.08, cy = e.y + 3;
    const g = ctx.createRadialGradient(cx, cy, w * 0.06, cx, cy, w);
    g.addColorStop(0, 'rgba(0,0,0,0.5)');
    g.addColorStop(0.45, 'rgba(0,0,0,0.26)');
    g.addColorStop(0.75, 'rgba(0,0,0,0.1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, w, w * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
}

// ── animation phase ──────────────────────────────────────────────────
function anim(e) {
    const now = Date.now();
    // Real delta between frames (clamped). Multiple anim() calls in one frame see
    // dt≈0, so the phase only advances once per frame.
    const dt = e._animT ? Math.min(0.05, (now - e._animT) / 1000) : 0;
    e._animT = now;

    const moving = e.state === 'walk';
    const atk = e.state === 'attack' || String(e.state || '').startsWith('cast');

    // ACCUMULATE the gait phase so changing cadence (idle↔walk) never snaps the
    // cycle to a new position — this was the main source of "clunky" walking.
    if (e._animPhase === undefined) e._animPhase = (e.id || 0) * 1.7;
    const freq = moving ? 7.0 : 2.2;            // rad/s
    // ease the amplitude in/out so steps don't pop on start/stop
    const targetAmp = moving ? 1 : 0.16;
    e._animAmp = e._animAmp === undefined ? targetAmp : e._animAmp + (targetAmp - e._animAmp) * Math.min(1, 12 * dt);
    e._animPhase += freq * dt;
    const ph = e._animPhase;
    const amp = e._animAmp;

    const swing = Math.sin(ph) * amp;
    // Gentle vertical bob, two beats per stride, scaled by how much we're moving.
    const bob = -Math.abs(Math.cos(ph)) * amp * e.size * 0.03;

    // One-shot attack thrust 0→1→0 with a brief wind-up. frameTimer resets on
    // every state change (tickEntityFrame), so this fires once per swing.
    let attack = 0, windup = 0;
    if (atk) {
        const prog = Math.min(1, (e.frameTimer || 0) / 0.3);
        attack = Math.sin(prog * Math.PI);
        windup = prog < 0.25 ? (1 - prog / 0.25) : 0;
    }
    return { swing, bob, attack, windup, moving, t: now / 1000, ph, amp };
}

// ── humanoid (heroes, goblins, orcs, skeletons, knights, mages) ──────
function drawHumanoid(ctx, e, f) {
    const s = e.size;
    const { swing, bob, attack, ph, amp } = anim(e);
    const cx = 0;                       // local origin = feet centre, +x forward
    const feet = 0;
    const hipY = -s * 0.74 + bob;
    const shoY = -s * 1.22 + bob;
    const headY = -s * 1.46 + bob;
    const headR = s * 0.25;
    const shoW = s * 0.34 * f.bulk;
    const hipW = s * 0.2 * f.bulk;
    const outline = shade(f.skinLo, 0.6);

    ctx.lineJoin = 'round';

    // ── legs (behind body) ──
    if (!f.robe) {
        const legW = s * 0.17 * f.bulk;
        const A = s * 0.19 * amp;     // stride length
        const L = s * 0.13 * amp;     // step height
        // Each foot swings fore/aft (sin) and LIFTS only while travelling forward
        // (cos>0) — opposite phase per leg, so one steps while the other plants.
        const cph = Math.cos(ph), sph = Math.sin(ph);
        const frontX = cx + hipW + sph * A, frontLift = Math.max(0, cph) * L;
        const backX = cx - hipW - sph * A, backLift = Math.max(0, -cph) * L;
        // back leg first (behind body)
        limb(ctx, cx - hipW, hipY, backX, feet - backLift, legW, shade(f.cloth, 0.8));
        // front leg
        limb(ctx, cx + hipW, hipY, frontX, feet - frontLift, legW, f.cloth);
        // feet
        ctx.fillStyle = shade(f.cloth, 0.6);
        ctx.beginPath(); ctx.ellipse(backX + s * 0.04, feet - backLift, s * 0.12, s * 0.06, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(frontX + s * 0.04, feet - frontLift, s * 0.12, s * 0.06, 0, 0, Math.PI * 2); ctx.fill();
    } else {
        // robe: a flowing trapezoid skirt instead of legs
        const sway = swing * s * 0.1;
        const g = ctx.createLinearGradient(0, shoY, 0, feet);
        g.addColorStop(0, f.clothHi); g.addColorStop(1, shade(f.cloth, 0.7));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(cx - hipW * 0.6, hipY);
        ctx.lineTo(cx + hipW * 0.6, hipY);
        ctx.lineTo(cx + s * 0.34 + sway, feet);
        ctx.quadraticCurveTo(cx, feet + s * 0.06, cx - s * 0.34 + sway, feet);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = outline; ctx.lineWidth = 1.5; ctx.stroke();
    }

    // ── back arm ──
    const armW = s * 0.13 * f.bulk;
    const backHandX = cx - shoW - swing * s * 0.16;
    limb(ctx, cx - shoW, shoY + s * 0.04, backHandX, hipY + s * 0.05, armW, shade(f.skin, 0.78));

    // ── torso ──
    const tg = ctx.createLinearGradient(0, shoY, 0, hipY);
    tg.addColorStop(0, f.skinHi);
    tg.addColorStop(1, f.skinLo);
    ctx.fillStyle = (f.robe || f.helmet) ? f.cloth : tg;
    ctx.beginPath();
    ctx.moveTo(cx - shoW, shoY);
    ctx.lineTo(cx + shoW, shoY);
    ctx.lineTo(cx + hipW, hipY);
    ctx.lineTo(cx - hipW, hipY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = outline; ctx.lineWidth = 1.5; ctx.stroke();

    // chest detailing
    if (f.helmet) { // armour plates
        ctx.fillStyle = f.metalHi;
        ctx.fillRect(cx - shoW * 0.7, shoY + s * 0.06, shoW * 1.4, s * 0.08);
        ctx.fillStyle = f.metalLo;
        ctx.fillRect(cx - shoW * 0.5, shoY + s * 0.22, shoW, s * 0.06);
    } else if (f.skull) { // ribcage
        ctx.strokeStyle = shade(f.skinLo, 0.9); ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            const ry = shoY + s * 0.12 + i * s * 0.12;
            ctx.beginPath(); ctx.moveTo(cx - shoW * 0.6, ry); ctx.quadraticCurveTo(cx, ry + s * 0.05, cx + shoW * 0.6, ry); ctx.stroke();
        }
    } else if (!f.robe) { // belt + tunic highlight
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.beginPath(); ctx.moveTo(cx - shoW, shoY); ctx.lineTo(cx, shoY); ctx.lineTo(cx - hipW, hipY); ctx.closePath(); ctx.fill();
        ctx.fillStyle = shade(f.cloth, 0.55);
        ctx.fillRect(cx - hipW * 1.1, hipY - s * 0.06, hipW * 2.2, s * 0.06);
    }

    // ── head (radial gradient: lit top-left → shaded chin) ──
    const hg = ctx.createRadialGradient(cx - headR * 0.35, headY - headR * 0.4, headR * 0.15, cx, headY + headR * 0.2, headR * 1.15);
    hg.addColorStop(0, f.skinHi);
    hg.addColorStop(0.65, f.skin);
    hg.addColorStop(1, f.skinLo);
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(cx, headY, headR, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = outline; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(cx, headY, headR, 0, Math.PI * 2); ctx.stroke();

    if (f.ears) { // pointed goblin ears
        ctx.fillStyle = f.skin;
        for (const d of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(cx + d * headR * 0.8, headY - headR * 0.1);
            ctx.lineTo(cx + d * headR * 1.7, headY - headR * 0.6);
            ctx.lineTo(cx + d * headR * 0.7, headY + headR * 0.3);
            ctx.closePath(); ctx.fill();
        }
    }
    if (f.hood) { // hood over the head
        ctx.fillStyle = f.cloth;
        ctx.beginPath();
        ctx.arc(cx, headY - headR * 0.1, headR * 1.25, Math.PI * 0.95, Math.PI * 2.05);
        ctx.lineTo(cx + headR * 1.1, headY + headR * 0.5);
        ctx.lineTo(cx - headR * 1.1, headY + headR * 0.5);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = outline; ctx.lineWidth = 1.2; ctx.stroke();
    }
    if (f.helmet) { // metal helm with visor slit
        ctx.fillStyle = f.metal;
        ctx.beginPath(); ctx.arc(cx, headY, headR * 1.08, Math.PI, Math.PI * 2); ctx.fill();
        ctx.fillStyle = f.metalLo;
        ctx.fillRect(cx - headR, headY - headR * 0.1, headR * 2, headR * 0.5);
        ctx.fillStyle = '#ffd54f'; // glowing eye slit
        ctx.fillRect(cx - headR * 0.6, headY + headR * 0.05, headR * 1.2, headR * 0.16);
    }
    // eyes (skip if helmeted)
    if (!f.helmet) {
        const eyeColor = f.skull ? '#1a1a1a' : (e.enemyType ? '#ffe082' : '#1c2a33');
        const glow = !!e.enemyType;
        ctx.fillStyle = eyeColor;
        if (glow) { ctx.shadowColor = eyeColor; ctx.shadowBlur = 4; }
        ctx.beginPath(); ctx.arc(cx + headR * 0.42, headY + headR * 0.05, headR * 0.16, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx - headR * 0.18, headY + headR * 0.05, headR * 0.16, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
    }
    if (f.tusks) {
        ctx.fillStyle = '#fff8e1';
        for (const d of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(cx + d * headR * 0.35, headY + headR * 0.5);
            ctx.lineTo(cx + d * headR * 0.5, headY + headR * 0.95);
            ctx.lineTo(cx + d * headR * 0.15, headY + headR * 0.6);
            ctx.closePath(); ctx.fill();
        }
    }

    // ── front arm + weapon (animates on attack) ──
    const reach = attack;
    const shoFX = cx + shoW * 0.7;
    const handX = shoFX + s * (0.18 + reach * 0.5);
    const handY = hipY + s * 0.02 - reach * s * 0.5 + swing * s * 0.1;
    limb(ctx, shoFX, shoY + s * 0.04, handX, handY, armW, f.skin);
    drawWeapon(ctx, f.weapon, handX, handY, s, reach, f);
}

function drawWeapon(ctx, type, hx, hy, s, reach, f) {
    ctx.save();
    ctx.translate(hx, hy);
    const ang = -0.5 + reach * 1.4; // raise/swing forward on attack
    ctx.rotate(ang);
    const metal = f.metal, metalHi = f.metalHi, wood = '#6d4c33';
    switch (type) {
        case 'axe':
            limb(ctx, 0, 0, 0, -s * 0.85, s * 0.07, wood);
            ctx.fillStyle = metal;
            ctx.beginPath();
            ctx.moveTo(0, -s * 0.85); ctx.quadraticCurveTo(s * 0.45, -s * 0.78, s * 0.34, -s * 0.5);
            ctx.quadraticCurveTo(s * 0.1, -s * 0.6, 0, -s * 0.62); ctx.closePath(); ctx.fill();
            ctx.fillStyle = metalHi; ctx.fillRect(-s * 0.02, -s * 0.85, s * 0.04, s * 0.2);
            break;
        case 'club':
            limb(ctx, 0, 0, 0, -s * 0.7, s * 0.08, wood);
            ctx.fillStyle = shade(wood, 1.1);
            ctx.beginPath(); ctx.arc(0, -s * 0.75, s * 0.18, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#cfcfcf';
            for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; ctx.beginPath(); ctx.arc(Math.cos(a) * s * 0.14, -s * 0.75 + Math.sin(a) * s * 0.14, s * 0.03, 0, Math.PI * 2); ctx.fill(); }
            break;
        case 'sword':
        case 'shieldsword':
            limb(ctx, 0, 0, 0, -s * 0.95, s * 0.05, metal);
            ctx.strokeStyle = metalHi; ctx.lineWidth = s * 0.02; ctx.beginPath(); ctx.moveTo(0, -s * 0.1); ctx.lineTo(0, -s * 0.9); ctx.stroke();
            ctx.fillStyle = '#caa24a'; ctx.fillRect(-s * 0.12, -s * 0.12, s * 0.24, s * 0.05); // crossguard
            break;
        case 'dagger':
            limb(ctx, 0, 0, 0, -s * 0.5, s * 0.045, metal);
            ctx.fillStyle = '#3a2a1a'; ctx.fillRect(-s * 0.05, 0, s * 0.1, s * 0.05);
            break;
        case 'staff':
            limb(ctx, 0, 0, 0, -s * 1.0, s * 0.05, wood);
            ctx.fillStyle = shade(f.skin, 1.2);
            ctx.shadowColor = f.skin; ctx.shadowBlur = 10;
            ctx.beginPath(); ctx.arc(0, -s * 1.05, s * 0.13, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
            break;
        case 'bow':
            ctx.strokeStyle = wood; ctx.lineWidth = s * 0.05;
            ctx.beginPath(); ctx.arc(0, -s * 0.35, s * 0.5, -Math.PI * 0.55, Math.PI * 0.55); ctx.stroke();
            ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(s * 0.0, -s * 0.78); ctx.lineTo(s * 0.0, s * 0.08); ctx.stroke();
            break;
    }
    ctx.restore();
    // shield on the off-hand for shieldsword
    if (type === 'shieldsword') {
        ctx.save();
        ctx.fillStyle = f.metalLo;
        ctx.beginPath();
        ctx.ellipse(-hx * 0 - s * 0.0, hy * 0, 1, 1, 0, 0, Math.PI * 2); // noop keep transform clean
        ctx.restore();
    }
}

// ── slime ────────────────────────────────────────────────────────────
function drawSlime(ctx, e, f) {
    const s = e.size;
    const t = Date.now() / 600 + (e.id || 0);
    // gentle idle wobble + a hard squash-and-stretch when it lunges to bite
    const att = anim(e).attack;
    const squish = 1 + Math.sin(t) * 0.08 - att * 0.28;
    const w = s * 0.7 / squish, h = s * 0.7 * squish;
    const g = ctx.createRadialGradient(-s * 0.2, -h * 0.9, s * 0.1, 0, -h * 0.6, w);
    g.addColorStop(0, f.skinHi); g.addColorStop(0.7, f.skin); g.addColorStop(1, f.skinLo);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-w, 0);
    ctx.quadraticCurveTo(-w, -h * 1.5, 0, -h * 1.5);
    ctx.quadraticCurveTo(w, -h * 1.5, w, 0);
    ctx.quadraticCurveTo(0, h * 0.18, -w, 0);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = shade(f.skinLo, 0.7); ctx.lineWidth = 1.5; ctx.stroke();
    // glossy highlight
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath(); ctx.ellipse(-w * 0.3, -h * 1.05, w * 0.22, h * 0.3, -0.4, 0, Math.PI * 2); ctx.fill();
    // eyes
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-w * 0.28, -h * 0.8, s * 0.1, 0, Math.PI * 2); ctx.arc(w * 0.28, -h * 0.8, s * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(-w * 0.24, -h * 0.78, s * 0.05, 0, Math.PI * 2); ctx.arc(w * 0.32, -h * 0.78, s * 0.05, 0, Math.PI * 2); ctx.fill();
}

// ── bat ──────────────────────────────────────────────────────────────
function drawBat(ctx, e, f) {
    const s = e.size;
    const t = Date.now() / 1000;
    const flap = Math.sin(t * 18 + (e.id || 0));
    const cy = -s * 0.7;
    // wings
    ctx.fillStyle = f.skin;
    for (const d of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.quadraticCurveTo(d * s * 0.9, cy - s * 0.3 - flap * s * 0.25, d * s * 1.1, cy + s * 0.1 - flap * s * 0.1);
        ctx.quadraticCurveTo(d * s * 0.7, cy + s * 0.15, d * s * 0.5, cy + s * 0.2);
        ctx.quadraticCurveTo(d * s * 0.6, cy + s * 0.05, 0, cy);
        ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = shade(f.skinLo, 0.7); ctx.lineWidth = 1; ctx.stroke();
    // body
    ctx.fillStyle = f.skinLo;
    ctx.beginPath(); ctx.ellipse(0, cy, s * 0.22, s * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    // ears
    ctx.beginPath(); ctx.moveTo(-s * 0.1, cy - s * 0.25); ctx.lineTo(-s * 0.18, cy - s * 0.5); ctx.lineTo(-s * 0.02, cy - s * 0.3); ctx.fill();
    ctx.beginPath(); ctx.moveTo(s * 0.1, cy - s * 0.25); ctx.lineTo(s * 0.18, cy - s * 0.5); ctx.lineTo(s * 0.02, cy - s * 0.3); ctx.fill();
    // eyes
    ctx.fillStyle = '#ff5252'; ctx.shadowColor = '#ff5252'; ctx.shadowBlur = 4;
    ctx.beginPath(); ctx.arc(-s * 0.08, cy, s * 0.05, 0, Math.PI * 2); ctx.arc(s * 0.08, cy, s * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
}

// ── spider ───────────────────────────────────────────────────────────
function drawSpider(ctx, e, f) {
    const s = e.size;
    const t = Date.now() / 1000;
    const step = (e.state === 'walk') ? Math.sin(t * 14 + (e.id || 0)) : 0;
    const cy = -s * 0.4;
    ctx.strokeStyle = f.skinLo; ctx.lineWidth = s * 0.05; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
        const sp = (i - 1.5) * 0.35;
        const lift = Math.sin(t * 14 + i) * s * 0.06;
        for (const d of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(0, cy);
            ctx.lineTo(d * s * 0.4, cy - s * 0.1 + sp * s * 0.3);
            ctx.lineTo(d * s * 0.7, cy + s * 0.25 - lift + step * d * s * 0.05);
            ctx.stroke();
        }
    }
    // abdomen + head
    const g = ctx.createRadialGradient(-s * 0.1, cy - s * 0.1, s * 0.05, 0, cy, s * 0.4);
    g.addColorStop(0, f.skinHi); g.addColorStop(1, f.skinLo);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, cy + s * 0.05, s * 0.32, s * 0.28, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.28, cy - s * 0.02, s * 0.16, 0, Math.PI * 2); ctx.fill();
    // eyes cluster
    ctx.fillStyle = '#ff5252'; ctx.shadowColor = '#ff1744'; ctx.shadowBlur = 4;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(s * (0.3 + (i % 2) * 0.08), cy - s * 0.08 + Math.floor(i / 2) * s * 0.08, s * 0.03, 0, Math.PI * 2); ctx.fill(); }
    ctx.shadowBlur = 0;
}

// ── demon hound ──────────────────────────────────────────────────────
function drawHound(ctx, e, f) {
    const s = e.size;
    const t = Date.now() / 1000;
    const run = (e.state === 'walk') ? Math.sin(t * 13 + (e.id || 0)) : Math.sin(t * 3) * 0.2;
    const backY = -s * 0.5;
    // legs
    ctx.strokeStyle = f.skinLo; ctx.lineWidth = s * 0.1; ctx.lineCap = 'round';
    limb(ctx, -s * 0.3, backY, -s * 0.3 - run * s * 0.2, 0, s * 0.1, f.skinLo);
    limb(ctx, s * 0.35, backY, s * 0.35 + run * s * 0.2, 0, s * 0.1, f.skinLo);
    limb(ctx, -s * 0.2, backY, -s * 0.2 + run * s * 0.2, 0, s * 0.1, f.skin);
    limb(ctx, s * 0.25, backY, s * 0.25 - run * s * 0.2, 0, s * 0.1, f.skin);
    // body
    const g = ctx.createLinearGradient(0, backY - s * 0.2, 0, 0);
    g.addColorStop(0, f.skinHi); g.addColorStop(1, f.skinLo);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, backY, s * 0.45, s * 0.25, 0, 0, Math.PI * 2); ctx.fill();
    // head
    ctx.beginPath(); ctx.ellipse(s * 0.45, backY - s * 0.08, s * 0.2, s * 0.16, 0, 0, Math.PI * 2); ctx.fill();
    // snapping jaws — they gape open on a bite
    const bite = anim(e).attack;
    if (bite > 0.1) {
        ctx.fillStyle = 'rgba(50,0,0,0.85)';
        ctx.beginPath(); ctx.moveTo(s * 0.58, backY - s * 0.02); ctx.lineTo(s * 0.78, backY + s * 0.01); ctx.lineTo(s * 0.58, backY + s * 0.05); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = f.skinLo;
    ctx.beginPath(); ctx.moveTo(s * 0.6, backY - s * 0.05); ctx.lineTo(s * 0.78, backY - bite * s * 0.06); ctx.lineTo(s * 0.6, backY + s * 0.005); ctx.closePath(); ctx.fill(); // upper jaw
    ctx.beginPath(); ctx.moveTo(s * 0.6, backY + s * 0.025); ctx.lineTo(s * 0.76, backY + s * 0.04 + bite * s * 0.08); ctx.lineTo(s * 0.6, backY + s * 0.08); ctx.closePath(); ctx.fill(); // lower jaw
    // ears
    ctx.beginPath(); ctx.moveTo(s * 0.38, backY - s * 0.2); ctx.lineTo(s * 0.3, backY - s * 0.4); ctx.lineTo(s * 0.46, backY - s * 0.22); ctx.fill();
    // glowing eye + fiery mane
    ctx.fillStyle = '#ffca28'; ctx.shadowColor = '#ff6d00'; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(s * 0.5, backY - s * 0.08, s * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ff6d00'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) { const fx = -s * 0.3 + i * s * 0.18; ctx.beginPath(); ctx.moveTo(fx, backY - s * 0.22); ctx.lineTo(fx + Math.sin(t * 6 + i) * s * 0.06, backY - s * 0.42); ctx.stroke(); }
}

// ── fire elemental ───────────────────────────────────────────────────
function drawElemental(ctx, e, f) {
    const s = e.size;
    const t = Date.now() / 1000;
    const cy = -s * 0.8;
    // layered flame body
    const layers = [['#ff3d00', 1], ['#ff9100', 0.78], ['#ffd54f', 0.5]];
    for (const [col, sc] of layers) {
        ctx.fillStyle = col;
        ctx.shadowColor = '#ff6d00'; ctx.shadowBlur = 12;
        ctx.beginPath();
        const w = s * 0.5 * sc;
        ctx.moveTo(0, -s * 1.5 * sc);
        for (let a = 0; a <= 12; a++) {
            const ang = a / 12 * Math.PI * 2;
            const wob = 1 + Math.sin(t * 6 + a + (e.id || 0)) * 0.16;
            const rx = Math.cos(ang) * w * wob;
            const ry = cy + Math.sin(ang) * w * 1.4 * wob - (Math.sin(ang) > 0 ? 0 : s * 0.3);
            ctx.lineTo(rx, ry);
        }
        ctx.closePath(); ctx.fill();
    }
    ctx.shadowBlur = 0;
    // eyes
    ctx.fillStyle = '#fff8e1';
    ctx.beginPath(); ctx.arc(-s * 0.12, cy, s * 0.07, 0, Math.PI * 2); ctx.arc(s * 0.12, cy, s * 0.07, 0, Math.PI * 2); ctx.fill();
}

// ── dragon boss ──────────────────────────────────────────────────────
function drawDragon(ctx, e, f) {
    const s = e.size;
    const t = Date.now() / 1000;
    const flap = Math.sin(t * 4 + (e.id || 0));
    const bodyY = -s * 0.7;
    // wings
    ctx.fillStyle = shade(f.skinLo, 0.85);
    for (const d of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, bodyY - s * 0.2);
        ctx.quadraticCurveTo(d * s * 1.1, bodyY - s * 0.7 - flap * s * 0.3, d * s * 1.3, bodyY + s * 0.1);
        ctx.quadraticCurveTo(d * s * 0.8, bodyY + s * 0.1, d * s * 0.3, bodyY);
        ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = shade(f.skinLo, 0.6); ctx.lineWidth = 2; ctx.stroke();
    // legs
    limb(ctx, -s * 0.2, bodyY + s * 0.1, -s * 0.28, 0, s * 0.16, f.skinLo);
    limb(ctx, s * 0.3, bodyY + s * 0.1, s * 0.36, 0, s * 0.16, f.skinLo);
    // body
    const g = ctx.createLinearGradient(0, bodyY - s * 0.4, 0, 0);
    g.addColorStop(0, f.skinHi); g.addColorStop(1, f.skinLo);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, bodyY, s * 0.5, s * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    // belly
    ctx.fillStyle = 'rgba(255,220,150,0.35)';
    ctx.beginPath(); ctx.ellipse(0, bodyY + s * 0.12, s * 0.3, s * 0.24, 0, 0, Math.PI * 2); ctx.fill();
    // neck + head
    ctx.fillStyle = f.skin;
    ctx.beginPath(); ctx.moveTo(s * 0.3, bodyY - s * 0.2); ctx.quadraticCurveTo(s * 0.7, bodyY - s * 0.6, s * 0.85, bodyY - s * 0.45); ctx.lineTo(s * 0.7, bodyY - s * 0.1); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(s * 0.85, bodyY - s * 0.5, s * 0.22, s * 0.16, -0.4, 0, Math.PI * 2); ctx.fill();
    // horns
    ctx.strokeStyle = '#fff3e0'; ctx.lineWidth = s * 0.05; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(s * 0.82, bodyY - s * 0.62); ctx.lineTo(s * 0.7, bodyY - s * 0.85); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 0.95, bodyY - s * 0.6); ctx.lineTo(s * 0.92, bodyY - s * 0.85); ctx.stroke();
    // eye + fiery breath glow
    ctx.fillStyle = '#ffeb3b'; ctx.shadowColor = '#ff3d00'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(s * 0.92, bodyY - s * 0.5, s * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    // spinal ridges
    ctx.fillStyle = shade(f.skinLo, 0.7);
    for (let i = 0; i < 5; i++) { const rx = -s * 0.4 + i * s * 0.18; ctx.beginPath(); ctx.moveTo(rx, bodyY - s * 0.38); ctx.lineTo(rx + s * 0.08, bodyY - s * 0.58); ctx.lineTo(rx + s * 0.16, bodyY - s * 0.38); ctx.closePath(); ctx.fill(); }
}

// ── treasure chest ───────────────────────────────────────────────────
function drawChest(ctx, e) {
    const s = e.size;
    const t = Date.now() / 1000;
    const w = s * 0.92, h = s * 0.7;
    const x0 = -w / 2;
    const bodyTop = -h * 0.52;               // where the base box meets the lid
    const wood = '#7a5430', woodLo = '#4a3218', band = '#caa24a', bandLo = '#8a6a20';

    // base box
    ctx.fillStyle = wood;
    ctx.fillRect(x0, bodyTop, w, h * 0.52);
    ctx.strokeStyle = woodLo; ctx.lineWidth = 2; ctx.strokeRect(x0, bodyTop, w, h * 0.52);

    // curved lid
    ctx.fillStyle = '#8a6038';
    ctx.beginPath();
    ctx.moveTo(x0, bodyTop);
    ctx.lineTo(x0 + w, bodyTop);
    ctx.lineTo(x0 + w, bodyTop - h * 0.04);
    ctx.quadraticCurveTo(0, bodyTop - h * 0.6, x0, bodyTop - h * 0.04);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = woodLo; ctx.stroke();
    // lid highlight
    ctx.strokeStyle = 'rgba(255,235,190,0.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x0 + 2, bodyTop - h * 0.06); ctx.quadraticCurveTo(0, bodyTop - h * 0.52, x0 + w - 2, bodyTop - h * 0.06); ctx.stroke();

    // metal corner bands
    ctx.fillStyle = band;
    for (const bx of [x0 + w * 0.16, x0 + w * 0.78]) ctx.fillRect(bx, bodyTop - h * 0.42, w * 0.06, h * 0.92);
    ctx.fillStyle = bandLo;
    ctx.fillRect(x0, bodyTop + h * 0.18, w, 2);

    // glowing lock
    const gl = 0.6 + 0.4 * Math.sin(t * 3 + (e.id || 0));
    ctx.fillStyle = '#ffd84a'; ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 6 * gl;
    ctx.beginPath(); ctx.arc(0, bodyTop + h * 0.04, s * 0.11, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#5a3d1a'; ctx.fillRect(-1.2, bodyTop + h * 0.04, 2.4, s * 0.09);

    // occasional sparkle on the lid
    const spk = Math.sin(t * 4 + (e.id || 0) * 2);
    if (spk > 0.6) {
        ctx.fillStyle = `rgba(255,255,225,${(spk - 0.6) * 2.5})`;
        ctx.beginPath(); ctx.arc(x0 + w * 0.32, bodyTop - h * 0.22, 1.6, 0, Math.PI * 2); ctx.fill();
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  HORROR CHAMPIONS — procedural nightmare renderer
// ═══════════════════════════════════════════════════════════════════════
// Per-champion look spec. body: 'tall' | 'float' | 'crawl' | 'blob'.
const HORROR_LOOKS = {
    smiler:  { body: 'tall',  skin: '#ededed', robe: '#15151b', eye: 'big',     mouth: 'grin',  tall: 1.15, accent: '#ffffff', arms: 'long' },
    nun:     { body: 'float', skin: '#d6d0c6', robe: '#14101a', eye: 'hollow',  mouth: 'none',  veil: true, tall: 1.1, accent: '#6a2da8' },
    crawler: { body: 'crawl', skin: '#c2a079', eye: 'pin',      mouth: 'maw',   accent: '#caa15a' },
    weeper:  { body: 'tall',  skin: '#cfe0ea', robe: '#33424d', eye: 'weep',    mouth: 'none',  tall: 0.78, accent: '#90caf9', arms: 'long' },
    butcher: { body: 'tall',  skin: '#caa38c', robe: '#5e2222', eye: 'pin',     mouth: 'stitch', tall: 1.08, bulk: 1.5, accent: '#b71c1c', arms: 'long', weapon: 'cleaver' },
    hollow:  { body: 'tall',  skin: '#e9e9ee', robe: '#08080c', eye: 'none',    mouth: 'none',  tall: 1.4,  accent: '#0d0d12', arms: 'many' },
    wraith:  { body: 'float', skin: '#a9dbe2', robe: '#10303a', eye: 'hollow',  mouth: 'maw',   tall: 1.1,  accent: '#26c6da', ghost: true },
    effigy:  { body: 'tall',  skin: '#b89360', robe: '#5a4322', eye: 'pin',     mouth: 'stitch', tall: 1.05, accent: '#ff7043', arms: 'long', straw: true },
    doll:    { body: 'tall',  skin: '#e8dccb', robe: '#3a2c44', eye: 'doll',    mouth: 'grin',  tall: 0.95, accent: '#cfd8dc', cracks: true, arms: 'long' },
    leech:   { body: 'blob',  skin: '#8e2447', eye: 'many',     mouth: 'maw',   accent: '#ad1457' },
    wraithling: { body: 'float', skin: '#6a5a82', robe: '#1a1226', eye: 'hollow', mouth: 'none', tall: 0.6, accent: '#7e57c2', ghost: true },
};

/** A wide, jagged ear-to-ear grin — the signature horror element. */
function drawGrin(ctx, cx, cy, w, h) {
    ctx.save();
    // Mouth interior: a lens that curves UP at the corners (unsettling smile).
    ctx.beginPath();
    ctx.moveTo(cx - w, cy - h * 0.2);
    ctx.quadraticCurveTo(cx, cy + h * 1.7, cx + w, cy - h * 0.2);
    ctx.quadraticCurveTo(cx, cy + h * 0.35, cx - w, cy - h * 0.2);
    ctx.closePath();
    ctx.fillStyle = '#070406';
    ctx.fill();
    ctx.clip();
    // Jagged teeth: interlocking triangles from top and bottom.
    const n = Math.max(7, Math.round(w / 2.4));
    const tw = (2 * w) / n;
    ctx.fillStyle = '#e9e6d8';
    for (let i = 0; i < n; i++) {
        const tx = cx - w + i * tw;
        ctx.beginPath();                                   // top tooth (points down)
        ctx.moveTo(tx, cy - h);
        ctx.lineTo(tx + tw, cy - h);
        ctx.lineTo(tx + tw / 2, cy + h * 0.9);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();                                   // bottom tooth (points up)
        ctx.moveTo(tx + tw / 2, cy + h * 1.9);
        ctx.lineTo(tx + tw * 1.5, cy + h * 1.9);
        ctx.lineTo(tx + tw, cy + h * 0.4);
        ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // grim shadow line at the seam
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - w, cy - h * 0.2);
    ctx.quadraticCurveTo(cx, cy + h * 1.7, cx + w, cy - h * 0.2);
    ctx.stroke();
}

/** Eyes for a horror face, by style. */
function drawHorrorEyes(ctx, cx, ey, r, look) {
    const ex = r * 0.62;
    const accent = look.accent || '#fff';
    const style = look.eye;
    if (style === 'none') return;
    if (style === 'big' || style === 'doll') {
        for (const d of [-1, 1]) {
            const x = cx + d * ex;
            ctx.fillStyle = style === 'doll' ? '#f3efe6' : '#f6f6f6';
            ctx.shadowColor = accent; ctx.shadowBlur = style === 'doll' ? 0 : 8;
            ctx.beginPath(); ctx.arc(x, ey, r * 0.42, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
            // tiny black pupil — a pinprick stare
            ctx.fillStyle = style === 'doll' ? '#1b2b3a' : '#0a0a0a';
            ctx.beginPath(); ctx.arc(x + d * r * 0.06, ey + r * 0.04, r * 0.1, 0, Math.PI * 2); ctx.fill();
        }
        return;
    }
    if (style === 'hollow' || style === 'weep') {
        for (const d of [-1, 1]) {
            const x = cx + d * ex;
            ctx.fillStyle = '#040406';                       // sunken socket
            ctx.beginPath(); ctx.ellipse(x, ey, r * 0.34, r * 0.46, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = accent; ctx.shadowColor = accent; ctx.shadowBlur = 7;
            ctx.beginPath(); ctx.arc(x, ey - r * 0.05, r * 0.13, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
            if (style === 'weep') {                          // black tears
                ctx.strokeStyle = 'rgba(10,10,14,0.7)'; ctx.lineWidth = r * 0.12; ctx.lineCap = 'round';
                ctx.beginPath(); ctx.moveTo(x, ey + r * 0.3); ctx.lineTo(x + d * r * 0.05, ey + r * 1.5); ctx.stroke();
            }
        }
        return;
    }
    // 'pin' / 'many' → small glowing pinpricks in shadow
    const eyes = style === 'many' ? 5 : 2;
    ctx.fillStyle = accent; ctx.shadowColor = accent; ctx.shadowBlur = 6;
    for (let i = 0; i < eyes; i++) {
        const d = eyes === 2 ? (i === 0 ? -1 : 1) : (i - 2) * 0.5;
        ctx.beginPath(); ctx.arc(cx + d * ex, ey + (i % 2) * r * 0.2, r * 0.1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;
}

/** Tall / floating nightmare humanoid (elongated, dangling clawed arms). */
function drawHorrorTall(ctx, e, look) {
    const s = e.size;
    const a = anim(e);
    const tall = look.tall || 1;
    const bulk = look.bulk || 1;
    const float = look.body === 'float';
    const t = a.t;
    const fb = float ? Math.sin(t * 1.4 + (e.id || 0)) * s * 0.07 : 0;   // float bob
    const sway = Math.sin(t * 0.9 + (e.id || 0)) * 0.04 + a.swing * 0.03;
    const tilt = Math.sin(t * 0.5 + (e.id || 0) * 1.7) * 0.14;          // head tilt

    const feet = -fb;
    const hipY = -s * 0.8 * tall - fb;
    const shoY = -s * 1.34 * tall - fb;
    const headY = -s * 1.66 * tall - fb;
    const headR = s * (look.eye === 'big' ? 0.24 : 0.2);
    const shoW = s * 0.3 * bulk;
    const hipW = s * 0.16 * bulk;
    const robe = look.robe || shade(look.skin, 0.55);
    const outline = shade(robe, 0.5);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    // ── lower body ──
    if (float) {
        // ragged, tapering wisp instead of legs
        const g = ctx.createLinearGradient(0, shoY, 0, feet + s * 0.4);
        g.addColorStop(0, robe);
        g.addColorStop(1, look.ghost ? 'rgba(0,0,0,0)' : shade(robe, 0.4));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-shoW, shoY);
        ctx.lineTo(shoW, shoY);
        const tails = 5;
        for (let i = tails; i >= 0; i--) {
            const fx = shoW - (i / tails) * shoW * 2;
            const wob = Math.sin(t * 3 + i + (e.id || 0)) * s * 0.07;
            ctx.lineTo(fx, feet + s * 0.35 + wob);
            ctx.lineTo(fx - shoW / tails, feet + s * 0.1);
        }
        ctx.closePath(); ctx.fill();
    } else {
        const legW = s * 0.1 * bulk;
        const A = s * 0.15 * a.amp, sph = Math.sin(a.ph);
        limb(ctx, -hipW, hipY, -hipW - sph * A, feet, legW, shade(robe, 0.75));
        limb(ctx, hipW, hipY, hipW + sph * A, feet, legW, robe);
    }

    // ── back arm (long, dangling, clawed) ──
    const armW = s * 0.1 * bulk;
    const reach = a.attack;
    const drawArm = (side, fwd) => {
        const shx = side * shoW * 0.9;
        const elbowY = shoY + s * 0.4 * tall;
        const handX = shx + side * s * 0.1 + fwd * s * 0.55 + sway * s * 2 * side;
        const handY = hipY + s * 0.3 * tall - fwd * s * 0.5;
        limb(ctx, shx, shoY + s * 0.05, shx + side * s * 0.05, elbowY, armW, shade(look.skin, 0.7));
        limb(ctx, shx + side * s * 0.05, elbowY, handX, handY, armW * 0.85, look.skin);
        // claw fingers
        ctx.strokeStyle = shade(look.skin, 0.6); ctx.lineWidth = Math.max(1, s * 0.03);
        for (let f = -1; f <= 1; f++) {
            ctx.beginPath();
            ctx.moveTo(handX, handY);
            ctx.lineTo(handX + f * s * 0.06, handY + s * 0.16);
            ctx.stroke();
        }
    };
    drawArm(-1, reach * 0.4);

    // ── torso (robe / gown) ──
    const tg = ctx.createLinearGradient(0, shoY, 0, hipY + s * 0.2);
    tg.addColorStop(0, shade(robe, 1.25));
    tg.addColorStop(1, shade(robe, 0.7));
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(-shoW, shoY);
    ctx.lineTo(shoW, shoY);
    ctx.lineTo(hipW * (float ? 2.4 : 1.4), hipY + (float ? s * 0.1 : 0));
    ctx.lineTo(-hipW * (float ? 2.4 : 1.4), hipY + (float ? s * 0.1 : 0));
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = outline; ctx.lineWidth = 1.3; ctx.stroke();
    // gaunt sternum shadow
    ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, shoY + s * 0.08); ctx.lineTo(0, hipY); ctx.stroke();

    if (look.straw) { // effigy: straw poking from collar/cuffs
        ctx.strokeStyle = '#d8b25a'; ctx.lineWidth = 1;
        for (let i = 0; i < 6; i++) { const ax = -shoW + i * (shoW * 2 / 5); ctx.beginPath(); ctx.moveTo(ax, shoY); ctx.lineTo(ax + (Math.random() - 0.5) * 4, shoY - 6 - (i % 2) * 3); ctx.stroke(); }
    }

    // ── neck + head (tilted) ──
    ctx.save();
    ctx.translate(0, shoY);
    ctx.rotate(tilt);
    ctx.translate(0, headY - shoY);
    // gaunt neck
    ctx.strokeStyle = shade(look.skin, 0.8); ctx.lineWidth = s * 0.1;
    ctx.beginPath(); ctx.moveTo(0, headR * 0.8); ctx.lineTo(0, s * 0.28 * tall); ctx.stroke();
    // head
    const hg = ctx.createRadialGradient(-headR * 0.3, -headR * 0.4, headR * 0.1, 0, headR * 0.2, headR * 1.3);
    hg.addColorStop(0, shade(look.skin, 1.18));
    hg.addColorStop(0.7, look.skin);
    hg.addColorStop(1, shade(look.skin, 0.45));
    ctx.fillStyle = (look.eye === 'none' && !look.robe) ? look.skin : hg;
    ctx.beginPath(); ctx.ellipse(0, 0, headR * 0.92, headR * 1.18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = shade(look.skin, 0.4); ctx.lineWidth = 1.2; ctx.stroke();
    // sunken cheek shadows
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(-headR * 0.5, headR * 0.35, headR * 0.28, headR * 0.45, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(headR * 0.5, headR * 0.35, headR * 0.28, headR * 0.45, -0.3, 0, Math.PI * 2); ctx.fill();

    if (look.cracks) { // porcelain doll cracks
        ctx.strokeStyle = 'rgba(40,30,30,0.5)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(headR * 0.2, -headR); ctx.lineTo(headR * 0.05, 0); ctx.lineTo(headR * 0.3, headR * 0.5); ctx.stroke();
    }

    drawHorrorEyes(ctx, 0, -headR * 0.15, headR, look);
    if (look.mouth === 'grin') drawGrin(ctx, 0, headR * 0.5, headR * 0.78, headR * 0.2);
    else if (look.mouth === 'maw') {
        ctx.fillStyle = '#070406';
        ctx.beginPath(); ctx.ellipse(0, headR * 0.55, headR * 0.35, headR * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    } else if (look.mouth === 'stitch') {
        ctx.strokeStyle = shade(look.skin, 0.4); ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(-headR * 0.5, headR * 0.55); ctx.lineTo(headR * 0.5, headR * 0.55); ctx.stroke();
        for (let i = -2; i <= 2; i++) { const sx = i * headR * 0.22; ctx.beginPath(); ctx.moveTo(sx, headR * 0.42); ctx.lineTo(sx, headR * 0.68); ctx.stroke(); }
    }

    if (look.veil) { // nun's draped veil framing the void-face
        ctx.fillStyle = look.robe;
        ctx.beginPath();
        ctx.moveTo(-headR * 1.5, headR * 0.4);
        ctx.quadraticCurveTo(-headR * 1.7, -headR * 1.7, 0, -headR * 1.7);
        ctx.quadraticCurveTo(headR * 1.7, -headR * 1.7, headR * 1.5, headR * 0.4);
        ctx.quadraticCurveTo(headR * 1.2, -headR * 0.2, 0, -headR * 0.1);
        ctx.quadraticCurveTo(-headR * 1.2, -headR * 0.2, -headR * 1.5, headR * 0.4);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = shade(look.robe, 1.5); ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();

    // ── front arm (animates on attack) ──
    drawArm(1, 0.3 + reach * 0.7);
    if (look.arms === 'many') { drawArm(1, -0.2 + reach * 0.3); drawArm(-1, -0.3); }
    if (look.weapon === 'cleaver') {
        const hx = shoW + s * 0.5 + reach * s * 0.4, hy = hipY - reach * s * 0.4;
        ctx.fillStyle = '#9aa4b2';
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + s * 0.32, hy - s * 0.05); ctx.lineTo(hx + s * 0.3, hy + s * 0.28); ctx.lineTo(hx, hy + s * 0.22); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(150,20,20,0.6)'; ctx.fillRect(hx + s * 0.05, hy + s * 0.05, s * 0.22, 2);
    }
}

/** Contorted quadruped crawler (the body bent the wrong way). */
function drawHorrorCrawler(ctx, e, look) {
    const s = e.size;
    const a = anim(e), t = a.t;
    const run = (e.state === 'walk') ? Math.sin(t * 12 + (e.id || 0)) : Math.sin(t * 2) * 0.3;
    const backY = -s * 0.62;
    // spindly, over-jointed limbs splayed high
    ctx.strokeStyle = shade(look.skin, 0.55); ctx.lineWidth = s * 0.07; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
        const side = i < 2 ? -1 : 1;
        const px = side * (s * 0.18 + (i % 2) * s * 0.18);
        const knee = backY - s * 0.42 - (i % 2) * s * 0.1;       // knees jut ABOVE the back — wrong
        const footX = px + side * s * 0.3 + run * side * s * 0.12 * ((i % 2) ? 1 : -1);
        ctx.beginPath();
        ctx.moveTo(px * 0.4, backY);
        ctx.lineTo(px, knee);
        ctx.lineTo(footX, 0);
        ctx.stroke();
    }
    // torso (inverted, dragging)
    const g = ctx.createLinearGradient(0, backY - s * 0.2, 0, 0);
    g.addColorStop(0, shade(look.skin, 1.1)); g.addColorStop(1, shade(look.skin, 0.5));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, backY + s * 0.05, s * 0.34, s * 0.26, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = shade(look.skin, 0.4); ctx.lineWidth = 1; ctx.stroke();
    // spine knobs
    ctx.fillStyle = shade(look.skin, 0.6);
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(-s * 0.25 + i * s * 0.16, backY - s * 0.18, s * 0.04, 0, Math.PI * 2); ctx.fill(); }
    // head lolling forward/down
    const hx = s * 0.32, hy = backY + s * 0.18 + Math.sin(t * 2) * s * 0.03;
    ctx.fillStyle = look.skin;
    ctx.beginPath(); ctx.ellipse(hx, hy, s * 0.16, s * 0.13, 0.3, 0, Math.PI * 2); ctx.fill();
    drawHorrorEyes(ctx, hx, hy - s * 0.02, s * 0.16, look);
    ctx.fillStyle = '#070406';                                    // gaping maw
    ctx.beginPath(); ctx.ellipse(hx + s * 0.06, hy + s * 0.08, s * 0.07, s * 0.05, 0.3, 0, Math.PI * 2); ctx.fill();
}

/** Writhing fleshy mass of mouths (the parasite). */
function drawHorrorBlob(ctx, e, look) {
    const s = e.size;
    const t = Date.now() / 500 + (e.id || 0);
    const att = anim(e).attack;
    const squish = 1 + Math.sin(t) * 0.08 - att * 0.2;
    const w = s * 0.7 / squish, h = s * 0.62 * squish;
    const g = ctx.createRadialGradient(-s * 0.1, -h * 0.7, s * 0.1, 0, -h * 0.5, w);
    g.addColorStop(0, shade(look.skin, 1.3)); g.addColorStop(0.7, look.skin); g.addColorStop(1, shade(look.skin, 0.5));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-w, 0);
    for (let i = 0; i <= 10; i++) {
        const ang = Math.PI + (i / 10) * Math.PI;
        const wob = 1 + Math.sin(t * 2 + i) * 0.1;
        ctx.lineTo(Math.cos(ang) * w * wob, -h + Math.sin(ang) * h * wob);
    }
    ctx.quadraticCurveTo(0, h * 0.2, -w, 0);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = shade(look.skin, 0.45); ctx.lineWidth = 1.4; ctx.stroke();
    // scattered toothy mouths
    for (let i = 0; i < 4; i++) {
        const mx = Math.sin(t * 0.7 + i * 2) * w * 0.5;
        const my = -h * (0.4 + (i % 2) * 0.5);
        ctx.fillStyle = '#070406';
        ctx.beginPath(); ctx.ellipse(mx, my, s * 0.1, s * 0.06, i, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#e9e6d8'; ctx.lineWidth = 1;
        for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(mx + k * s * 0.03, my - s * 0.05); ctx.lineTo(mx + k * s * 0.03, my + s * 0.05); ctx.stroke(); }
    }
    // glowing eye specks
    drawHorrorEyes(ctx, 0, -h * 0.9, s * 0.22, look);
}

function drawHorror(ctx, e) {
    const look = HORROR_LOOKS[e._horror] || HORROR_LOOKS.smiler;
    if (look.body === 'crawl') return drawHorrorCrawler(ctx, e, look);
    if (look.body === 'blob') return drawHorrorBlob(ctx, e, look);
    return drawHorrorTall(ctx, e, look);
}

// ── public entry point ───────────────────────────────────────────────
/**
 * Draw the animated, shaded character body for an entity (shadow + figure).
 * Overlays (health bar, name, status icons) remain in drawEntity.js.
 */
function rgba(hex, a) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
}

export function drawCharacterBody(ctx, e, opts = {}) {
    const alpha = opts.alpha ?? 1;
    const scale = opts.scale ?? 1;
    drawShadow(ctx, e, scale);

    ctx.save();
    ctx.globalAlpha *= alpha;
    const dir = e.facing === 'left' ? -1 : 1;
    ctx.translate(e.x, e.y);
    ctx.scale(dir * scale, scale);

    // Universal attack motion: a brief pull-back (windup) then a forward lunge,
    // so EVERY unit — humanoids and creatures alike — visibly strikes.
    const a = anim(e);
    if (a.attack > 0 || a.windup > 0) {
        const lunge = a.attack * e.size * 0.3 - a.windup * e.size * 0.12;
        ctx.translate(lunge, -a.attack * e.size * 0.05);
    }

    const f = featuresFor(e);
    switch (getKind(e)) {
        case 'slime': drawSlime(ctx, e, f); break;
        case 'bat': drawBat(ctx, e, f); break;
        case 'spider': drawSpider(ctx, e, f); break;
        case 'hound': drawHound(ctx, e, f); break;
        case 'elemental': drawElemental(ctx, e, f); break;
        case 'dragon': drawDragon(ctx, e, f); break;
        case 'chest': drawChest(ctx, e); break;
        case 'horror': drawHorror(ctx, e); break;
        default: drawHumanoid(ctx, e, f); break;
    }

    // Top-left rim light — clipped to the figure (source-atop) so every unit
    // catches a soft key light and reads as a sculpted form, not a flat shape.
    ctx.globalCompositeOperation = 'source-atop';
    const rim = ctx.createLinearGradient(-e.size * 0.7, -e.size * 1.65, e.size * 0.5, -e.size * 0.2);
    rim.addColorStop(0, 'rgba(255,248,225,0.20)');
    rim.addColorStop(0.55, 'rgba(255,248,225,0)');
    ctx.fillStyle = rim;
    ctx.fillRect(-e.size * 2, -e.size * 2.2, e.size * 4, e.size * 2.4);

    // Hit flash — tint only the figure's own pixels so it reads as the
    // character flashing white rather than a square overlay.
    if (opts.flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${Math.min(0.7, opts.flash)})`;
        const r = e.size * 2.2;
        ctx.fillRect(-r, -r * 1.4, r * 2, r * 1.6);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
}
