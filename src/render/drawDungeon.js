// drawDungeon.js — tile map rendering with stairs, shop, hazards, and environment tiles
import { DungeonMap, TILE } from '../systems/map.js';

const TILE_SIZE = DungeonMap.TILE_SIZE;

// Theme color palettes for floor tiles — each dungeon picks one at generation,
// so floors read clearly as a colour (earthy, blue, green, red, icy, violet…).
const THEME_FLOORS = {
    caverns:  ['#2a2014', '#281e16', '#2d2317', '#241c12'],   // earthy brown
    crystal:  ['#172a4a', '#193050', '#142544', '#1d3358'],   // deep blue
    halls:    ['#2a2a2e', '#2c2c30', '#262629', '#303034'],   // grey stone
    ruins:    ['#1b2e16', '#192c14', '#1f3219', '#16270f'],   // mossy green
    lava:     ['#3a160d', '#421a10', '#33130b', '#451f12'],   // infernal red
    frost:    ['#163445', '#193c50', '#142e3e', '#1d4258'],   // glacial blue
    fungal:   ['#281840', '#2c1c48', '#221432', '#301f50'],   // sickly violet
    mixed:    ['#252030', '#22202d', '#282335', '#1f1d2a'],   // neutral
    olympus:  ['#b6a274', '#c2b081', '#ab9869', '#cdbb8b'],   // sunlit marble
};

const THEME_WALLS = {
    caverns:  '#1a1208',
    crystal:  '#10203a',
    halls:    '#1c1c20',
    ruins:    '#11200c',
    lava:     '#24100a',
    frost:    '#0e2230',
    fungal:   '#180f28',
    mixed:    '#181825',
    olympus:  '#5b4f33',     // warm marble-block stone
};

const WALL_EDGE_COLOR = '#252540';

/** Stable 0..1 hash per tile — deterministic so detail doesn't flicker per frame. */
function tileHash(x, y) {
    let h = (x * 374761393 + y * 668265263) ^ 0x9e3779b9;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const isWallLike = (t) => t === TILE.WALL || t === TILE.SECRET_WALL;
const isFloorLike = (t) => t !== undefined && !isWallLike(t);

/** Scatter occasional environmental detail on a floor tile (deterministic by pv).
 *  Adds life to the dungeon: scattered bones, rubble, puddles, glowing fungi. */
function drawFloorProp(ctx, px, py, pv, theme) {
    const cx = px + 16, cy = py + 16;
    // Olympus gets its own classical decals (no skulls/rubble/puddles).
    if (theme === 'olympus') {
        if (pv > 0.95) {
            // toppled fluted marble column drum
            ctx.fillStyle = 'rgba(232,222,196,0.5)';
            ctx.strokeStyle = 'rgba(120,100,60,0.4)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.ellipse(cx, cy, 11, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.strokeStyle = 'rgba(150,128,80,0.35)'; ctx.lineWidth = 1;
            for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(cx + i * 3.5, cy - 5); ctx.lineTo(cx + i * 3.5, cy + 5); ctx.stroke(); }
        } else if (pv > 0.905) {
            // golden laurel leaves
            ctx.strokeStyle = 'rgba(201,165,84,0.6)'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.arc(cx, cy + 4, 7, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
            ctx.fillStyle = 'rgba(180,150,72,0.55)';
            for (let i = 0; i < 5; i++) {
                const a = Math.PI * (1.2 + i * 0.16);
                const lx = cx + Math.cos(a) * 7, ly = cy + 4 + Math.sin(a) * 7;
                ctx.beginPath(); ctx.ellipse(lx, ly, 2.2, 1.1, a, 0, Math.PI * 2); ctx.fill();
            }
        }
        return;
    }
    if (pv > 0.982) {
        // skull + crossed bones
        ctx.strokeStyle = 'rgba(210,205,188,0.38)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx - 8, cy + 5); ctx.lineTo(cx + 8, cy - 3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - 7, cy - 4); ctx.lineTo(cx + 7, cy + 6); ctx.stroke();
        ctx.fillStyle = 'rgba(216,210,194,0.46)';
        ctx.beginPath(); ctx.arc(cx - 2, cy - 1, 4.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(15,15,15,0.55)';
        ctx.fillRect(cx - 3.6, cy - 1.6, 1.6, 1.8); ctx.fillRect(cx - 0.6, cy - 1.6, 1.6, 1.8);
    } else if (pv > 0.945) {
        // rubble pile
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        for (let i = 0; i < 4; i++) { const a = i * 1.7; ctx.fillRect(cx + Math.cos(a) * 6 - 2, cy + Math.sin(a) * 5 - 2, 3 + (i % 2), 3); }
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(cx - 3, cy - 3, 3, 2);
    } else if (pv > 0.915) {
        // shallow puddle with a faint reflective sheen
        ctx.fillStyle = 'rgba(10,16,30,0.5)';
        ctx.beginPath(); ctx.ellipse(cx, cy, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(120,150,200,0.2)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(cx, cy, 9, 5, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(150,180,230,0.13)';
        ctx.beginPath(); ctx.ellipse(cx - 2, cy - 1, 4, 1.5, 0, 0, Math.PI * 2); ctx.fill();
    } else if (pv > 0.885) {
        // theme-specific glowing accent decal
        const fungi = (cap) => {
            for (let i = 0; i < 3; i++) {
                const mx = cx + (i - 1) * 5, my = cy + (i % 2) * 3;
                ctx.fillStyle = 'rgba(190,200,210,0.4)';
                ctx.fillRect(mx - 0.5, my, 1, 4);
                ctx.fillStyle = cap; ctx.shadowColor = cap; ctx.shadowBlur = 6;
                ctx.beginPath(); ctx.arc(mx, my, 2.3, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
            }
        };
        if (theme === 'lava') {
            // glowing ember crack
            ctx.strokeStyle = 'rgba(255,95,25,0.75)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
            ctx.shadowColor = '#ff5a14'; ctx.shadowBlur = 7;
            ctx.beginPath();
            ctx.moveTo(cx - 7, cy - 4); ctx.lineTo(cx - 1, cy + 2); ctx.lineTo(cx + 6, cy - 1); ctx.lineTo(cx + 9, cy + 5);
            ctx.stroke(); ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(255,190,70,0.7)';
            ctx.beginPath(); ctx.arc(cx - 1, cy + 2, 1.7, 0, Math.PI * 2); ctx.fill();
        } else if (theme === 'frost') {
            ctx.fillStyle = 'rgba(185,228,255,0.55)'; ctx.shadowColor = '#bfe6ff'; ctx.shadowBlur = 5;
            for (const d of [[-4, 3, -2, -5], [3, 4, 5, -3], [-1, 5, 0, -1]]) {
                ctx.beginPath(); ctx.moveTo(cx + d[0] - 1.5, cy + d[1]); ctx.lineTo(cx + d[2], cy + d[3]); ctx.lineTo(cx + d[0] + 1.5, cy + d[1]); ctx.closePath(); ctx.fill();
            }
            ctx.shadowBlur = 0;
        } else if (theme === 'fungal') {
            fungi('rgba(195,95,235,0.6)');
        } else if (theme === 'crystal') {
            ctx.fillStyle = 'rgba(120,180,255,0.6)'; ctx.shadowColor = '#5a9cff'; ctx.shadowBlur = 6;
            for (const d of [[0, -1, 4], [-4, 2, 3], [4, 2, 3]]) {
                ctx.beginPath(); ctx.moveTo(cx + d[0], cy + d[1] - d[2]); ctx.lineTo(cx + d[0] - 2, cy + d[1] + 2); ctx.lineTo(cx + d[0] + 2, cy + d[1] + 2); ctx.closePath(); ctx.fill();
            }
            ctx.shadowBlur = 0;
        } else if (theme === 'caverns' || theme === 'ruins') {
            fungi('rgba(120,205,255,0.55)');
        } else {
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            ctx.fillRect(cx - 4, cy + 2, 2, 2); ctx.fillRect(cx + 3, cy - 3, 2, 2); ctx.fillRect(cx, cy + 4, 2, 2);
        }
    }
}

/** A glowing warp gate marking the exit to the next floor (replaces the ▼). */
function drawWarpGate(ctx, px, py) {
    const T = TILE_SIZE;
    const cx = px + T / 2, cy = py + T / 2;
    const t = Date.now() / 1000;
    const R = T * 0.46;
    const pulse = 0.75 + 0.25 * Math.sin(t * 3);

    // darken the pad beneath the gate
    ctx.fillStyle = '#0b0b16';
    ctx.fillRect(px, py, T, T);

    // glowing portal disc
    const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, R);
    grad.addColorStop(0, `rgba(205,245,255,${pulse})`);
    grad.addColorStop(0.45, `rgba(90,160,255,${0.75 * pulse})`);
    grad.addColorStop(0.8, `rgba(135,70,235,${0.5 * pulse})`);
    grad.addColorStop(1, 'rgba(30,10,60,0)');
    ctx.fillStyle = grad;
    ctx.shadowColor = '#6aa0ff'; ctx.shadowBlur = 14 * pulse;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    // rotating energy swirl (three spiral arms)
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(t * 1.6);
    ctx.strokeStyle = `rgba(225,245,255,${0.5 * pulse})`; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
        ctx.rotate((Math.PI * 2) / 3);
        ctx.beginPath();
        for (let a = 0; a <= 1.01; a += 0.12) {
            const rr = R * 0.92 * (1 - a), ang = a * 5;
            const x = Math.cos(ang) * rr, y = Math.sin(ang) * rr;
            a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
    }
    ctx.restore();

    // stone ring frame around the portal
    ctx.lineWidth = R * 0.18; ctx.strokeStyle = '#3c4a66';
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.02, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(155,185,235,0.7)';
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.09, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();

    // bright core
    ctx.fillStyle = `rgba(255,255,255,${0.7 * pulse})`;
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.14 * pulse, 0, Math.PI * 2); ctx.fill();
}

/** A little merchant stall marking the shop (replaces the 💰). */
function drawShopStall(ctx, px, py) {
    const T = TILE_SIZE, x = px, y = py;
    const t = Date.now() / 1000;

    // ground pad
    ctx.fillStyle = '#241c14';
    ctx.fillRect(x, y, T, T);

    // counter body + wood grain
    ctx.fillStyle = '#6d4c33';
    ctx.fillRect(x + 3, y + T * 0.46, T - 6, T * 0.48);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(x + 3, y + T * 0.46 + i * T * 0.12); ctx.lineTo(x + T - 3, y + T * 0.46 + i * T * 0.12); ctx.stroke();
    }
    // counter top
    ctx.fillStyle = '#8a6240'; ctx.fillRect(x + 1, y + T * 0.44, T - 2, T * 0.06);

    // support posts
    ctx.fillStyle = '#4a3422';
    ctx.fillRect(x + 3, y + T * 0.18, 2.5, T * 0.3);
    ctx.fillRect(x + T - 5.5, y + T * 0.18, 2.5, T * 0.3);

    // striped awning
    const awY = y + T * 0.12, awH = T * 0.16, n = 5, sw = (T - 2) / n;
    for (let i = 0; i < n; i++) {
        ctx.fillStyle = i % 2 ? '#e8e8e8' : '#c0392b';
        ctx.fillRect(x + 1 + i * sw, awY, sw + 0.5, awH);
    }
    // scalloped awning edge
    for (let i = 0; i < n; i++) {
        ctx.fillStyle = i % 2 ? '#e8e8e8' : '#c0392b';
        ctx.beginPath();
        ctx.moveTo(x + 1 + i * sw, awY + awH);
        ctx.lineTo(x + 1 + (i + 0.5) * sw, awY + awH + 4);
        ctx.lineTo(x + 1 + (i + 1) * sw, awY + awH);
        ctx.closePath(); ctx.fill();
    }

    // glowing wares (potions) on the counter
    const wares = ['#4caf50', '#42a5f5', '#ffca28'];
    for (let i = 0; i < 3; i++) {
        const wx = x + T * (0.3 + i * 0.2), wy = y + T * 0.4;
        ctx.fillStyle = wares[i]; ctx.shadowColor = wares[i]; ctx.shadowBlur = 5;
        ctx.beginPath(); ctx.arc(wx, wy, 2.3, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(230,230,230,0.6)'; ctx.fillRect(wx - 0.6, wy - 4, 1.2, 2.5);
    }

    // hanging glowing coin sign
    const bob = Math.sin(t * 2) * 0.6;
    const cgl = 0.6 + 0.4 * Math.sin(t * 3);
    ctx.fillStyle = '#FFD700'; ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 7 * cgl;
    ctx.beginPath(); ctx.arc(x + T * 0.5, y + T * 0.33 + bob, 3.6, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#7a5e08'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('$', x + T * 0.5, y + T * 0.33 + bob + 0.5);
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}

/** Draw the dungeon tile map */
export function drawDungeon(ctx, map, camera, canvasWidth, canvasHeight) {
    if (!map || !map.grid) return;

    const startTileX = Math.max(0, Math.floor(camera.x / TILE_SIZE));
    const startTileY = Math.max(0, Math.floor(camera.y / TILE_SIZE));
    const endTileX = Math.min(map.width - 1, Math.ceil((camera.x + canvasWidth) / TILE_SIZE));
    const endTileY = Math.min(map.height - 1, Math.ceil((camera.y + canvasHeight) / TILE_SIZE));

    const theme = map.theme || 'mixed';
    const floorColors = THEME_FLOORS[theme] || THEME_FLOORS.mixed;
    const wallColor = THEME_WALLS[theme] || THEME_WALLS.mixed;

    for (let ty = startTileY; ty <= endTileY; ty++) {
        for (let tx = startTileX; tx <= endTileX; tx++) {
            const tile = map.grid[ty]?.[tx];
            if (tile === undefined) continue;

            const px = tx * TILE_SIZE;
            const py = ty * TILE_SIZE;

            switch (tile) {
                case TILE.FLOOR: {
                    // Procedural worn-flagstone floor (deterministic per tile).
                    const v = tileHash(tx, ty);
                    const v2 = tileHash(tx * 3 + 1, ty * 7 + 2);
                    ctx.fillStyle = floorColors[(tx * 2 + ty) % floorColors.length];
                    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                    // worn centre (faint bevel highlight)
                    ctx.fillStyle = `rgba(255,255,255,${0.015 + v * 0.025})`;
                    ctx.fillRect(px + 3, py + 3, TILE_SIZE - 6, TILE_SIZE - 6);
                    // grout: recessed top/left, lit bottom/right
                    ctx.fillStyle = 'rgba(0,0,0,0.22)';
                    ctx.fillRect(px, py, TILE_SIZE, 1.5);
                    ctx.fillRect(px, py, 1.5, TILE_SIZE);
                    ctx.fillStyle = 'rgba(255,255,255,0.03)';
                    ctx.fillRect(px, py + TILE_SIZE - 1.5, TILE_SIZE, 1.5);
                    ctx.fillRect(px + TILE_SIZE - 1.5, py, 1.5, TILE_SIZE);
                    // pebble speckles
                    if (v > 0.55) {
                        ctx.fillStyle = 'rgba(0,0,0,0.12)';
                        ctx.fillRect(px + 5 + v * 18, py + 5 + v2 * 18, 2, 2);
                        if (v2 > 0.5) ctx.fillRect(px + TILE_SIZE - 6 - v2 * 8, py + TILE_SIZE - 8, 2, 2);
                    }
                    // occasional crack
                    if (v2 > 0.9) {
                        ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(px + 5, py + 8); ctx.lineTo(px + 13, py + 15); ctx.lineTo(px + 10, py + 24);
                        ctx.stroke();
                    }
                    // rare moss tuft in damp themes
                    if (v > 0.93 && (theme === 'ruins' || theme === 'caverns')) {
                        ctx.fillStyle = 'rgba(80,140,60,0.22)';
                        ctx.beginPath(); ctx.arc(px + TILE_SIZE * 0.62, py + TILE_SIZE * 0.6, 4, 0, Math.PI * 2); ctx.fill();
                    }
                    // Olympus marble: a warm top sheen + cool base (cheap flat
                    // fills, no per-tile gradient), gold seams, and an occasional
                    // gilded vein running through the slab.
                    if (theme === 'olympus') {
                        ctx.fillStyle = 'rgba(255,248,224,0.07)';
                        ctx.fillRect(px + 2, py + 2, TILE_SIZE - 4, (TILE_SIZE - 4) * 0.5);
                        ctx.fillStyle = 'rgba(120,95,50,0.06)';
                        ctx.fillRect(px + 2, py + TILE_SIZE * 0.55, TILE_SIZE - 4, TILE_SIZE * 0.43);
                        ctx.fillStyle = 'rgba(214,178,94,0.32)';      // gold seam, lower/right
                        ctx.fillRect(px, py + TILE_SIZE - 1.5, TILE_SIZE, 1.5);
                        ctx.fillRect(px + TILE_SIZE - 1.5, py, 1.5, TILE_SIZE);
                        if (v2 > 0.86) {                              // gilded vein
                            ctx.strokeStyle = 'rgba(201,165,84,0.5)'; ctx.lineWidth = 1.2;
                            ctx.beginPath();
                            ctx.moveTo(px + 4, py + 6 + v * 8);
                            ctx.quadraticCurveTo(px + 16, py + 14, px + TILE_SIZE - 5, py + 9 + v2 * 10);
                            ctx.stroke();
                        }
                    }
                    break;
                }

                case TILE.WALL: {
                    // Procedural dark stone brickwork (no bitmap asset).
                    const v = tileHash(tx, ty);
                    ctx.fillStyle = wallColor;
                    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                    // per-block tonal variation
                    ctx.fillStyle = v > 0.5 ? `rgba(255,255,255,${(v - 0.5) * 0.08})`
                        : `rgba(0,0,0,${(0.5 - v) * 0.24})`;
                    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                    // mortar seams — offset rows give a running-bond brick pattern
                    ctx.fillStyle = 'rgba(0,0,0,0.42)';
                    ctx.fillRect(px, py + TILE_SIZE / 2 - 1, TILE_SIZE, 2);
                    const off = (ty % 2) ? TILE_SIZE / 2 : 0;
                    ctx.fillRect(px + off, py, 2, TILE_SIZE / 2);
                    ctx.fillRect(px + ((off + TILE_SIZE / 2) % TILE_SIZE), py + TILE_SIZE / 2, 2, TILE_SIZE / 2);
                    // brick catch-lights (top of each course)
                    ctx.fillStyle = 'rgba(255,255,255,0.05)';
                    ctx.fillRect(px + 2, py + 2, TILE_SIZE - 4, 2);
                    ctx.fillRect(px + 2, py + TILE_SIZE / 2 + 2, TILE_SIZE - 4, 2);
                    // occasional crack for character
                    if (v > 0.92) {
                        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(px + 6, py + 5); ctx.lineTo(px + 12, py + 14); ctx.lineTo(px + 9, py + 24);
                        ctx.stroke();
                    }
                    break;
                }

                case TILE.DOOR:
                    ctx.fillStyle = '#2a2a3a';
                    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                    ctx.strokeStyle = '#4a4a5a';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE * 0.6, TILE_SIZE * 0.3, 0, Math.PI, true);
                    ctx.stroke();
                    break;

                // ── LAVA — glowing orange hazard ──
                // ── LAVA — glowing molten rock with dark crust ──
                case TILE.LAVA: {
                    const tt = Date.now() / 600;
                    const v = tileHash(tx, ty);
                    ctx.fillStyle = '#1c0d06';
                    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                    const pulse = 0.6 + 0.4 * Math.sin(tt + tx * 0.5 + ty * 0.3);
                    const g = ctx.createRadialGradient(px + 16, py + 16, 2, px + 16, py + 16, 22);
                    g.addColorStop(0, `rgba(255,190,60,${0.9 * pulse})`);
                    g.addColorStop(0.5, `rgba(255,95,20,${0.7 * pulse})`);
                    g.addColorStop(1, 'rgba(110,18,0,0.55)');
                    ctx.fillStyle = g;
                    ctx.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
                    // floating dark crust blobs
                    ctx.fillStyle = 'rgba(18,7,3,0.72)';
                    for (let k = 0; k < 3; k++) {
                        const a = v * 6.28 + k * 2.1;
                        ctx.beginPath(); ctx.arc(px + 16 + Math.cos(a) * 8, py + 16 + Math.sin(a) * 8, 4 + (k % 2) * 2, 0, Math.PI * 2); ctx.fill();
                    }
                    // bright bubbling speck
                    const bx = px + 10 + Math.sin(tt * 1.3 + tx) * 6, by = py + 12 + Math.cos(tt + ty) * 6;
                    ctx.fillStyle = `rgba(255,235,150,${pulse})`;
                    ctx.beginPath(); ctx.arc(bx, by, 1.8 * pulse, 0, Math.PI * 2); ctx.fill();
                    break;
                }

                // ── WATER — cool blue reflective pool with caustics ──
                case TILE.WATER: {
                    const tt = Date.now() / 700;
                    ctx.fillStyle = '#08111f';
                    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                    ctx.fillStyle = 'rgba(28,86,156,0.55)';
                    ctx.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
                    // moving caustic ripples
                    ctx.lineWidth = 1;
                    for (let k = 0; k < 2; k++) {
                        const yy = py + 8 + k * 12 + Math.sin(tt * 1.5 + tx + k) * 2;
                        ctx.strokeStyle = `rgba(150,200,255,${0.16 + 0.1 * Math.sin(tt + tx + k)})`;
                        ctx.beginPath();
                        ctx.moveTo(px + 3, yy);
                        ctx.quadraticCurveTo(px + 16, yy + Math.sin(tt * 2 + ty + k) * 3, px + TILE_SIZE - 3, yy);
                        ctx.stroke();
                    }
                    // glinting highlight
                    const gl = 0.5 + 0.5 * Math.sin(tt * 2 + tx + ty);
                    ctx.fillStyle = `rgba(220,240,255,${0.3 * gl})`;
                    ctx.beginPath(); ctx.arc(px + 10 + Math.sin(tt + tx) * 5, py + 14, 1.5, 0, Math.PI * 2); ctx.fill();
                    break;
                }

                // ── TRAP — barely-visible floor with spike dots ──
                case TILE.TRAP:
                    ctx.fillStyle = floorColors[(tx + ty) % floorColors.length];
                    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                    const trapPulse = 0.1 + 0.05 * Math.sin(Date.now() / 300);
                    ctx.fillStyle = `rgba(255, 50, 50, ${trapPulse})`;
                    ctx.fillRect(px + 10, py + 12, 4, 4);
                    ctx.fillRect(px + 18, py + 12, 4, 4);
                    ctx.fillRect(px + 14, py + 18, 4, 4);
                    break;

                // ── SECRET_WALL — looks like wall but slightly different ──
                case TILE.SECRET_WALL:
                    ctx.fillStyle = wallColor;
                    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                    // Subtle crack pattern hint
                    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(px + 4, py + 8);
                    ctx.lineTo(px + TILE_SIZE - 4, py + TILE_SIZE - 8);
                    ctx.stroke();
                    break;

                // ── TORCH — floor tile with flame particle ──
                case TILE.TORCH:
                    ctx.fillStyle = floorColors[(tx + ty) % floorColors.length];
                    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                    // Torch post
                    ctx.fillStyle = '#5D4037';
                    ctx.fillRect(px + 14, py + 12, 4, 14);
                    // Flame glow
                    const flamePulse = 0.3 + 0.2 * Math.sin(Date.now() / 200 + tx);
                    ctx.fillStyle = `rgba(255, 180, 50, ${flamePulse})`;
                    ctx.beginPath();
                    ctx.arc(px + 16, py + 10, 6, 0, Math.PI * 2);
                    ctx.fill();
                    // Flame core
                    ctx.fillStyle = `rgba(255, 255, 200, ${flamePulse * 0.5})`;
                    ctx.beginPath();
                    ctx.arc(px + 16, py + 9, 3, 0, Math.PI * 2);
                    ctx.fill();
                    break;

                // ── BOUNTY — golden floor with coin sparkle ──
                case TILE.BOUNTY:
                    ctx.fillStyle = '#2a2a20';
                    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                    const bountyPulse = 0.3 + 0.2 * Math.sin(Date.now() / 350);
                    ctx.fillStyle = `rgba(255, 215, 0, ${bountyPulse})`;
                    ctx.fillRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
                    ctx.fillStyle = '#FFD700';
                    ctx.font = '18px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText('💰', px + TILE_SIZE / 2, py + TILE_SIZE / 2 + 6);
                    ctx.textAlign = 'start';
                    break;

                case TILE.STAIRS_DOWN:
                    drawWarpGate(ctx, px, py);
                    break;

                case TILE.SHOP:
                    drawShopStall(ctx, px, py);
                    break;
            }
        }
    }

    // ── Depth pass: ambient occlusion + wall bevels ──
    // Layered on top of the tiles to give the dungeon real sense of depth:
    // floors darken where they meet walls (AO), walls get a lit top cap and a
    // shadowed base, and floors get subtle deterministic value variation so the
    // repeating tile texture doesn't read as flat.
    const g = map.grid;
    for (let ty = startTileY; ty <= endTileY; ty++) {
        const row = g[ty];
        if (!row) continue;
        for (let tx = startTileX; tx <= endTileX; tx++) {
            const tile = row[tx];
            if (tile === undefined) continue;
            const px = tx * TILE_SIZE;
            const py = ty * TILE_SIZE;

            if (isWallLike(tile)) {
                // Treat each wall mass as an extruded block: the top-most course
                // gets a bright lit "cap", and the bottom-most course (where floor
                // sits below) gets a gradient "front face" — so walls read as solid
                // 3-D blocks rising off the floor rather than flat dark tiles.
                const exposedTop = !isWallLike(g[ty - 1]?.[tx]); // top of a wall mass (or map edge)
                const floorBelow = isFloorLike(g[ty + 1]?.[tx]);
                // Olympus walls are gilded marble — the cap catches a gold lustre.
                const goldCap = theme === 'olympus';

                if (exposedTop) {
                    // Bright bevelled cap: a crisp top hairline over a softer band.
                    ctx.fillStyle = goldCap ? 'rgba(238,205,128,0.55)' : 'rgba(255,255,255,0.14)';
                    ctx.fillRect(px, py, TILE_SIZE, 2);
                    ctx.fillStyle = goldCap ? 'rgba(214,178,94,0.22)' : 'rgba(255,255,255,0.07)';
                    ctx.fillRect(px, py + 2, TILE_SIZE, 3);
                } else {
                    ctx.fillStyle = goldCap ? 'rgba(214,178,94,0.10)' : 'rgba(255,255,255,0.04)';
                    ctx.fillRect(px, py, TILE_SIZE, 2);
                }

                if (floorBelow) {
                    // Shaded front face → the block has visible height.
                    const faceH = 14;
                    const fg = ctx.createLinearGradient(0, py + TILE_SIZE - faceH, 0, py + TILE_SIZE);
                    fg.addColorStop(0, 'rgba(0,0,0,0)');
                    fg.addColorStop(1, 'rgba(0,0,0,0.5)');
                    ctx.fillStyle = fg;
                    ctx.fillRect(px, py + TILE_SIZE - faceH, TILE_SIZE, faceH);
                    // a thin lit lip where the cap meets the face catches the light
                    ctx.fillStyle = 'rgba(255,255,255,0.05)';
                    ctx.fillRect(px, py + TILE_SIZE - faceH - 1, TILE_SIZE, 1);
                }
                continue;
            }

            // Floor-like tile: deterministic value variation to break up tiling.
            const v = tileHash(tx, ty);
            if (v > 0.78) {
                ctx.fillStyle = `rgba(0,0,0,${0.06 + (v - 0.78) * 0.5})`;
                ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            } else if (v < 0.1) {
                ctx.fillStyle = 'rgba(255,255,255,0.025)';
                ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            }

            // Ambient occlusion: shade edges next to walls. Light-from-top-left
            // convention → top/left walls cast stronger shadows than bottom/right.
            const AO = 8;
            if (isWallLike(g[ty - 1]?.[tx])) {                       // wall above → soft cast shadow
                const sg = ctx.createLinearGradient(0, py, 0, py + 16);
                sg.addColorStop(0, 'rgba(0,0,0,0.4)');
                sg.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = sg;
                ctx.fillRect(px, py, TILE_SIZE, 16);
            }
            if (isWallLike(row[tx - 1])) {                          // wall left
                ctx.fillStyle = 'rgba(0,0,0,0.11)'; ctx.fillRect(px, py, AO * 2, TILE_SIZE);
                ctx.fillStyle = 'rgba(0,0,0,0.20)'; ctx.fillRect(px, py, AO, TILE_SIZE);
            }
            if (isWallLike(g[ty + 1]?.[tx])) {                       // wall below
                ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(px, py + TILE_SIZE - AO, TILE_SIZE, AO);
            }
            if (isWallLike(row[tx + 1])) {                          // wall right
                ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(px + TILE_SIZE - AO, py, AO, TILE_SIZE);
            }

            // Scatter occasional environmental props (only on plain floor tiles).
            if (tile === TILE.FLOOR) {
                const pv = tileHash(tx * 5 + 3, ty * 11 + 7);
                if (pv > 0.885) drawFloorProp(ctx, px, py, pv, theme);
            }
        }
    }

    // Draw room name labels
    if (map.roomNames && map.rooms) {
        for (let i = 0; i < map.rooms.length; i++) {
            const room = map.rooms[i];
            const name = map.roomNames[i];
            if (!name) continue;
            const cx = room.x * TILE_SIZE + (room.w * TILE_SIZE) / 2;
            const cy = room.y * TILE_SIZE + (room.h * TILE_SIZE) / 2;
            if (cx < camera.x - 200 || cx > camera.x + canvasWidth + 200 ||
                cy < camera.y - 200 || cy > camera.y + canvasHeight + 200) continue;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
            ctx.font = 'italic 13px serif';
            ctx.textAlign = 'center';
            ctx.fillText(name, cx, cy + 5);
            ctx.textAlign = 'start';
        }
    }
}
