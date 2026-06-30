// ui.js — shared, procedurally-drawn UI primitives for every on-canvas panel.
// One consistent "dark glass" look (layered gradient, inner highlight, drop
// shadow, optional accent edge) plus hand-drawn vector icons so panels never
// depend on bitmap assets.

/** Trace a rounded-rectangle path (caller fills/strokes). */
export function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

/** "#rgb" / "#rrggbb" → "r,g,b" (passes through anything else as a grey). */
function rgbTriplet(color) {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(color) || /^#?([0-9a-fA-F]{3})$/.exec(color);
    if (!m) return null;
    let h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return `${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)}`;
}

/** Apply an alpha to any hex colour; falls back to a neutral tint if unparseable. */
export function withAlpha(color, a) {
    const t = rgbTriplet(color);
    return t ? `rgba(${t},${a})` : `rgba(220,220,230,${a})`;
}

/**
 * Draw a polished "dark glass" panel.
 * opts: { radius, accent, glow, alpha, fill }
 *   accent — colour for the top hairline + tinted border (and glow if set)
 *   glow   — outer coloured glow using the accent colour
 */
export function drawPanel(ctx, x, y, w, h, opts = {}) {
    const { radius = 12, accent = null, glow = false, alpha = 1 } = opts;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Soft drop shadow cast by the panel body.
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 7;
    roundRectPath(ctx, x, y, w, h, radius);
    ctx.fillStyle = 'rgba(8,9,16,0.55)';
    ctx.fill();
    ctx.restore();

    // Layered glass body — lighter at the top, deep at the base.
    const body = ctx.createLinearGradient(0, y, 0, y + h);
    body.addColorStop(0, 'rgba(38,41,58,0.94)');
    body.addColorStop(0.5, 'rgba(23,25,40,0.93)');
    body.addColorStop(1, 'rgba(12,13,24,0.95)');
    roundRectPath(ctx, x, y, w, h, radius);
    ctx.fillStyle = body;
    ctx.fill();

    // Faint accent wash so themed panels read at a glance.
    if (accent) {
        ctx.save();
        roundRectPath(ctx, x, y, w, h, radius);
        ctx.clip();
        const wash = ctx.createLinearGradient(0, y, 0, y + h);
        wash.addColorStop(0, withAlpha(accent, 0.16));
        wash.addColorStop(0.6, withAlpha(accent, 0));
        ctx.fillStyle = wash;
        ctx.fillRect(x, y, w, h);
        ctx.restore();
    }

    // Glossy top highlight (specular sheen on the upper edge).
    ctx.save();
    roundRectPath(ctx, x, y, w, h, radius);
    ctx.clip();
    const sheenH = Math.min(h * 0.55, 42);
    const sheen = ctx.createLinearGradient(0, y, 0, y + sheenH);
    sheen.addColorStop(0, 'rgba(255,255,255,0.12)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(x, y, w, sheenH);
    ctx.restore();

    // Border (tinted to the accent when present), with optional outer glow.
    roundRectPath(ctx, x, y, w, h, radius);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = accent ? withAlpha(accent, 0.55) : 'rgba(255,255,255,0.14)';
    if (glow && accent) {
        ctx.shadowColor = withAlpha(accent, 0.9);
        ctx.shadowBlur = 16;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Crisp accent hairline along the very top.
    if (accent) {
        ctx.save();
        roundRectPath(ctx, x, y, w, h, radius);
        ctx.clip();
        ctx.fillStyle = withAlpha(accent, 0.85);
        ctx.fillRect(x + radius * 0.4, y, w - radius * 0.8, 2);
        ctx.restore();
    }

    ctx.restore();
}

/**
 * Hand-drawn vector stat/utility icons centred on (cx, cy), spanning ~2*r.
 * names: attack, armor, speed, atkspd, health, gold.
 */
export function drawStatIcon(ctx, name, cx, cy, r, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (name === 'attack') {
        // Sword: blade from lower-left to upper-right, crossguard, pommel.
        ctx.lineWidth = Math.max(2, r * 0.34);
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.5, cy + r * 0.7);
        ctx.lineTo(cx + r * 0.78, cy - r * 0.8);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.78, cy + r * 0.15);
        ctx.lineTo(cx - r * 0.02, cy + r * 0.85);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx - r * 0.7, cy + r * 0.72, r * 0.17, 0, Math.PI * 2);
        ctx.fill();
    } else if (name === 'armor') {
        // Heraldic shield with a centre seam.
        ctx.beginPath();
        ctx.moveTo(cx, cy - r * 0.88);
        ctx.lineTo(cx + r * 0.82, cy - r * 0.5);
        ctx.lineTo(cx + r * 0.82, cy + r * 0.18);
        ctx.quadraticCurveTo(cx + r * 0.82, cy + r * 0.78, cx, cy + r * 0.98);
        ctx.quadraticCurveTo(cx - r * 0.82, cy + r * 0.78, cx - r * 0.82, cy + r * 0.18);
        ctx.lineTo(cx - r * 0.82, cy - r * 0.5);
        ctx.closePath();
        ctx.globalAlpha = 0.9;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = Math.max(1, r * 0.16);
        ctx.beginPath();
        ctx.moveTo(cx, cy - r * 0.6);
        ctx.lineTo(cx, cy + r * 0.72);
        ctx.stroke();
    } else if (name === 'speed') {
        // Three forward chevrons (motion / haste).
        ctx.lineWidth = Math.max(2, r * 0.3);
        for (let i = 0; i < 3; i++) {
            const ox = cx - r * 0.72 + i * r * 0.6;
            ctx.globalAlpha = 0.55 + i * 0.22;
            ctx.beginPath();
            ctx.moveTo(ox, cy - r * 0.62);
            ctx.lineTo(ox + r * 0.46, cy);
            ctx.lineTo(ox, cy + r * 0.62);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    } else if (name === 'atkspd') {
        // Lightning bolt.
        ctx.beginPath();
        ctx.moveTo(cx + r * 0.18, cy - r * 0.92);
        ctx.lineTo(cx - r * 0.52, cy + r * 0.12);
        ctx.lineTo(cx - r * 0.02, cy + r * 0.12);
        ctx.lineTo(cx - r * 0.22, cy + r * 0.92);
        ctx.lineTo(cx + r * 0.56, cy - r * 0.22);
        ctx.lineTo(cx + r * 0.06, cy - r * 0.22);
        ctx.closePath();
        ctx.fill();
    } else if (name === 'health') {
        // Heart.
        ctx.beginPath();
        ctx.moveTo(cx, cy + r * 0.85);
        ctx.bezierCurveTo(cx - r * 1.1, cy - r * 0.2, cx - r * 0.5, cy - r * 0.98, cx, cy - r * 0.32);
        ctx.bezierCurveTo(cx + r * 0.5, cy - r * 0.98, cx + r * 1.1, cy - r * 0.2, cx, cy + r * 0.85);
        ctx.closePath();
        ctx.fill();
    } else if (name === 'gold') {
        // Coin with inner ring.
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.86, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = Math.max(1, r * 0.16);
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.54, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.restore();
}

/**
 * A filled rounded bar (track + clipped progress fill + hairline border),
 * with an optional inner gradient sheen on the fill for a glossy look.
 */
export function drawBar(ctx, x, y, w, h, pct, fillColor, opts = {}) {
    const { track = 'rgba(255,255,255,0.06)', radius = h / 2, gloss = true } = opts;
    pct = Math.max(0, Math.min(1, pct));

    roundRectPath(ctx, x, y, w, h, radius);
    ctx.fillStyle = track;
    ctx.fill();

    if (pct > 0) {
        ctx.save();
        roundRectPath(ctx, x, y, w, h, radius);
        ctx.clip();
        ctx.fillStyle = fillColor;
        ctx.fillRect(x, y, w * pct, h);
        if (gloss) {
            const g = ctx.createLinearGradient(0, y, 0, y + h);
            g.addColorStop(0, 'rgba(255,255,255,0.28)');
            g.addColorStop(0.5, 'rgba(255,255,255,0.05)');
            g.addColorStop(1, 'rgba(0,0,0,0.18)');
            ctx.fillStyle = g;
            ctx.fillRect(x, y, w * pct, h);
        }
        ctx.restore();
    }

    roundRectPath(ctx, x, y, w, h, radius);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
}
