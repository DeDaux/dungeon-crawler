// drawHUD.js — player HP bar, spell HUD, minimap, gold, floor, kills
import { CHAMPIONS } from '../config/champions.js';
import { SPELLS } from '../config/spells.js';
import { DungeonMap } from '../systems/map.js';
import { ZOOM } from '../camera.js';
import { drawPanel, roundRectPath as roundRect, drawStatIcon, drawBar, withAlpha } from './ui.js';

const TILE_SIZE = DungeonMap.TILE_SIZE;
const FONT = "'Segoe UI', system-ui, sans-serif";

export function drawHUD(ctx, player, entities, projectiles, map, camera, canvasWidth, canvasHeight) {
    if (!player) return;
    drawPlayerInfo(ctx, player, canvasWidth);
    drawStatsPanel(ctx, player);
    drawActiveBuffs(ctx, player);
    drawSpellHUD(ctx, player, canvasWidth, canvasHeight);
    drawInventoryBar(ctx, player, canvasWidth, canvasHeight);
    drawMinimap(ctx, player, entities, map, camera, canvasWidth, canvasHeight);
    drawEnemyBars(ctx, entities, camera, canvasWidth, canvasHeight);
}

/** Compact panel of core combat stats, below the player info box */
function drawStatsPanel(ctx, player) {
    const x = 16;
    const y = 184;
    const w = 150;
    const rowH = 22;
    const padX = 10;
    const padTop = 30;
    const padBottom = 8;

    const stats = [
        ['attack', 'Attack', Math.round(player.attackDamage), '#FF8A65'],
        ['armor', 'Armor', Math.round(player.armor), '#90CAF9'],
        ['speed', 'Speed', Math.round(player.speed), '#A5D6A7'],
        ['atkspd', 'Atk Spd', (player.attackSpeed || 1).toFixed(2), '#FFE082'],
    ];

    const h = padTop + stats.length * rowH + padBottom;

    drawPanel(ctx, x, y, w, h, { radius: 10 });

    // Title
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `700 12px ${FONT}`;
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('STATS', x + padX, y + 19);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + padX, y + 26);
    ctx.lineTo(x + w - padX, y + 26);
    ctx.stroke();

    for (let i = 0; i < stats.length; i++) {
        const [iconName, label, value, color] = stats[i];
        const ly = y + padTop + i * rowH + rowH / 2;

        // Vector icon in a subtly tinted rounded chip.
        const chip = 18;
        roundRect(ctx, x + padX, ly - chip / 2, chip, chip, 5);
        ctx.fillStyle = withAlpha(color, 0.14);
        ctx.fill();
        drawStatIcon(ctx, iconName, x + padX + chip / 2, ly, chip * 0.42, color);

        ctx.textAlign = 'start';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = `12px ${FONT}`;
        ctx.fillText(label, x + padX + chip + 8, ly);

        ctx.fillStyle = color;
        ctx.font = `700 13px ${FONT}`;
        ctx.textAlign = 'right';
        ctx.fillText(String(value), x + w - padX, ly);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
    }
}

/** Consumable inventory bar — slots 1-8, used with number keys */
function drawInventoryBar(ctx, player, canvasWidth, canvasHeight) {
    const inventory = player.inventory || [];
    const slotSize = 40;
    const gap = 6;
    const totalW = 8 * slotSize + 7 * gap;
    const startX = (canvasWidth - totalW) / 2;
    const spellHudY = canvasHeight - 56 - 22;
    const y = spellHudY - 16 - slotSize;

    for (let i = 0; i < 8; i++) {
        const x = startX + i * (slotSize + gap);
        const item = inventory[i];

        // Background plate — layered glass, tinted with the item's color when filled
        const slotBg = ctx.createLinearGradient(0, y, 0, y + slotSize);
        slotBg.addColorStop(0, 'rgba(38, 40, 56, 0.82)');
        slotBg.addColorStop(1, 'rgba(12, 13, 24, 0.88)');
        roundRect(ctx, x, y, slotSize, slotSize, 6);
        ctx.fillStyle = slotBg;
        ctx.fill();

        if (item) {
            ctx.save();
            roundRect(ctx, x, y, slotSize, slotSize, 6);
            ctx.clip();
            ctx.globalAlpha = 0.2;
            ctx.fillStyle = item.color || '#FFD700';
            ctx.fillRect(x, y, slotSize, slotSize);
            ctx.globalAlpha = 1;
            const sheen = ctx.createLinearGradient(0, y, 0, y + slotSize * 0.5);
            sheen.addColorStop(0, 'rgba(255,255,255,0.12)');
            sheen.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = sheen;
            ctx.fillRect(x, y, slotSize, slotSize * 0.5);
            ctx.restore();
        }

        roundRect(ctx, x, y, slotSize, slotSize, 6);
        ctx.strokeStyle = item ? 'rgba(255,215,120,0.6)' : 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        if (item) {
            ctx.font = '20px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = item.color || '#fff';
            ctx.fillText(item.icon || '❓', x + slotSize / 2, y + slotSize / 2 + 1);
            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = 'start';
        }

        // Key number badge, top-left corner
        ctx.fillStyle = item ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.35)';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'start';
        ctx.fillText(String(i + 1), x + 3, y + 11);
        ctx.textAlign = 'start';
    }
}

/** Display info for buffs that aren't tied to a spell (potions/elixirs/scrolls) */
const ITEM_BUFF_DISPLAY = {
    rebirth: { name: 'Rebirth', icon: '🔥', color: '#FF6F00' },
    poison_aura: { name: 'Poison', icon: '☠️', color: '#7CB342' },
    speed_elixir: { name: 'Speed Elixir', icon: '💨', color: '#00BCD4' },
    might_elixir: { name: 'Might Elixir', icon: '💪', color: '#FF9800' },
    iron_elixir: { name: 'Iron Elixir', icon: '🛡️', color: '#607D8B' },
    scroll_shield: { name: 'Protection', icon: '📜', color: '#42A5F5' },
    shadow_cloak: { name: 'Cloaked', icon: '🌑', color: '#B39DDB' },
    divine_light_hot: { name: 'Divine Light', icon: '✨', color: '#FFD700' },
};

/** Active buff icons with countdown timers (left side, below player info) */
function drawActiveBuffs(ctx, player) {
    if (!player.buffs || player.buffs.length === 0) return;

    const x = 16;
    let y = 142;
    const w = 150;
    const h = 20;
    const gap = 4;

    for (const buff of player.buffs) {
        const spellInfo = SPELLS[buff.id];
        const itemInfo = ITEM_BUFF_DISPLAY[buff.id];
        const name = spellInfo ? spellInfo.name : itemInfo ? itemInfo.name : buff.id.replace(/_/g, ' ');
        const icon = itemInfo ? itemInfo.icon : '✦';
        const color = spellInfo ? spellInfo.color : itemInfo ? itemInfo.color : '#CCCCCC';

        // Rounded glass chip with a depleting duration fill behind the text.
        roundRect(ctx, x, y, w, h, 5);
        ctx.fillStyle = 'rgba(12, 13, 24, 0.7)';
        ctx.fill();

        const pct = buff.maxDuration > 0 ? Math.max(0, buff.duration / buff.maxDuration) : 0;
        if (pct > 0) {
            ctx.save();
            roundRect(ctx, x, y, w, h, 5);
            ctx.clip();
            const g = ctx.createLinearGradient(x, y, x + w, y);
            g.addColorStop(0, withAlpha(color, 0.5));
            g.addColorStop(1, withAlpha(color, 0.18));
            ctx.fillStyle = g;
            ctx.fillRect(x, y, w * pct, h);
            ctx.restore();
        }

        roundRect(ctx, x, y, w, h, 5);
        ctx.strokeStyle = withAlpha(color, 0.65);
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.font = `600 11px ${FONT}`;
        ctx.textAlign = 'start';
        ctx.fillText(`${icon} ${name}`, x + 6, y + h / 2 + 0.5);

        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(`${Math.ceil(buff.duration)}s`, x + w - 6, y + h / 2 + 0.5);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';

        y += h + gap;
    }
}

/** Player info panel with gold and floor */
function drawPlayerInfo(ctx, player, canvasWidth) {
    const barW = 240;
    const barH = 14;
    const x = 16;
    const y = 16;
    const padding = 10;

    const headerH = 22;
    const hpGap = 6;
    const xpH = 6;
    const xpGap = 8;
    const footerH = 16;
    const totalH = headerH + barH + hpGap + xpH + xpGap + footerH;

    const champ = CHAMPIONS[player.championId];
    drawPanel(ctx, x - padding, y - padding, barW + padding * 2, totalH + padding * 0.5, {
        radius: 10,
        accent: champ ? champ.color : '#4CAF50',
    });

    // Champion name + level + floor
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = champ ? champ.color : '#4CAF50';
    ctx.font = `700 14px ${FONT}`;
    ctx.fillText(`${champ ? champ.name : 'Player'}`, x, y + 13);

    const nameW = ctx.measureText(`${champ ? champ.name : 'Player'}`).width;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = `12px ${FONT}`;
    ctx.fillText(`Lv ${player.level}  ·  Floor ${player.currentFloor || 1}`, x + nameW + 8, y + 13);

    // Skill points badge
    if (player.skillPoints > 0) {
        const text = `+${player.skillPoints} SP`;
        ctx.font = `700 11px ${FONT}`;
        const tw = ctx.measureText(text).width;
        const bx = x + barW - (tw + 14);
        roundRect(ctx, bx, y, tw + 14, 16, 8);
        ctx.fillStyle = 'rgba(255, 215, 0, 0.15)';
        ctx.fill();
        roundRect(ctx, bx, y, tw + 14, 16, 8);
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#FFD700';
        ctx.textAlign = 'center';
        ctx.fillText(text, bx + (tw + 14) / 2, y + 12);
        ctx.textAlign = 'start';
    }

    // HP bar
    const hpY = y + headerH;
    const hpPct = Math.max(0, player.hp / player.maxHp);
    const hpColor = hpPct > 0.5 ? '#4CAF50' : hpPct > 0.25 ? '#FF9800' : '#F44336';
    drawBar(ctx, x, hpY, barW, barH, hpPct, hpColor, { radius: 6 });
    if (player.shield > 0) {
        const shieldPct = Math.min(player.shield / player.maxHp, 1 - Math.min(hpPct, 1));
        ctx.save();
        roundRect(ctx, x, hpY, barW, barH, 6);
        ctx.clip();
        ctx.fillStyle = 'rgba(100, 180, 255, 0.45)';
        ctx.fillRect(x + barW * Math.min(hpPct, 1), hpY, barW * shieldPct, barH);
        ctx.restore();
    }

    // XP bar
    const xpY = hpY + barH + hpGap;
    const xpPct = player.xpToNext > 0 ? player.xp / player.xpToNext : 0;
    drawBar(ctx, x, xpY, barW, xpH, xpPct, '#7C4DFF', { radius: 3 });

    // Footer row: kills + gold
    const footerY = xpY + xpH + xpGap + 11;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `12px ${FONT}`;
    ctx.fillText(`⚔ Kills: ${player.kills || 0}`, x, footerY);

    ctx.fillStyle = '#FFD700';
    ctx.font = `700 12px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(`💰 ${player.gold || 0}`, x + barW, footerY);
    ctx.textAlign = 'start';
}

/** Spell HUD bar (bottom-center) — League-style transparent rounded icons */
function drawSpellHUD(ctx, player, canvasWidth, canvasHeight) {
    const spellKeys = ['q', 'w', 'e', 'r'];
    const spellNames = { q: 'Q', w: 'W', e: 'E', r: 'R' };
    const iconSize = 56;
    const gap = 10;
    const totalW = spellKeys.length * iconSize + (spellKeys.length - 1) * gap;
    const startX = (canvasWidth - totalW) / 2;
    const y = canvasHeight - iconSize - 22;

    const champ = CHAMPIONS[player.championId];

    for (let i = 0; i < spellKeys.length; i++) {
        const key = spellKeys[i];
        const spell = player.spells[key];
        const x = startX + i * (iconSize + gap);
        const spellId = champ ? champ.spells[i] : null;
        const spellConfig = spell ? SPELLS[spell.id] : (spellId ? SPELLS[spellId] : null);

        const isOnCooldown = spell && spell.cooldown > 0;
        const isMissing = !spell;
        const canRankUp = spell && player.skillPoints > 0 && (spell.rank || 0) < 5;
        const canUnlock = isMissing && player.skillPoints > 0;
        const accentColor = spellConfig ? spellConfig.color : '#888';

        // Background plate — layered glass, tinted with the spell's color
        const plate = ctx.createLinearGradient(0, y, 0, y + iconSize);
        plate.addColorStop(0, 'rgba(40, 43, 60, 0.92)');
        plate.addColorStop(1, 'rgba(12, 13, 24, 0.95)');
        roundRect(ctx, x, y, iconSize, iconSize, 8);
        ctx.fillStyle = isMissing ? 'rgba(18, 18, 26, 0.5)' : plate;
        ctx.fill();

        // Color wash + top sheen so each ability reads at a glance
        if (!isMissing) {
            ctx.save();
            roundRect(ctx, x, y, iconSize, iconSize, 8);
            ctx.clip();
            ctx.globalAlpha = 0.2;
            ctx.fillStyle = accentColor;
            ctx.fillRect(x, y, iconSize, iconSize);
            ctx.globalAlpha = 1;
            const sheen = ctx.createLinearGradient(0, y, 0, y + iconSize * 0.5);
            sheen.addColorStop(0, 'rgba(255,255,255,0.14)');
            sheen.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = sheen;
            ctx.fillRect(x, y, iconSize, iconSize * 0.5);
            ctx.restore();
        }

        // Border — gold glow when actionable, subtle otherwise
        if (canUnlock || canRankUp) {
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 2;
            ctx.shadowColor = '#FFD700';
            ctx.shadowBlur = 8;
        } else {
            ctx.strokeStyle = isMissing ? 'rgba(255,255,255,0.12)' : 'rgba(255,215,120,0.5)';
            ctx.lineWidth = 1.5;
        }
        roundRect(ctx, x, y, iconSize, iconSize, 8);
        ctx.stroke();
        ctx.shadowBlur = 0;

        if (spell) {
            // Centered spell glyph (first letter of the spell name, large)
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.font = 'bold 22px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const glyph = spellNames[key];
            ctx.fillText(glyph, x + iconSize / 2, y + iconSize / 2 - 4);
            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = 'start';

            // Rank pips along the bottom
            const rank = spell.rank || 1;
            const pipR = 2.5;
            const pipGap = 7;
            const pipsW = pipGap * 4;
            const pipStartX = x + iconSize / 2 - pipsW / 2 + pipGap / 2;
            for (let p = 0; p < 5; p++) {
                ctx.beginPath();
                ctx.arc(pipStartX + p * pipGap, y + iconSize - 7, pipR, 0, Math.PI * 2);
                ctx.fillStyle = p < rank ? (rank >= 5 ? '#FFD700' : accentColor) : 'rgba(255,255,255,0.2)';
                ctx.fill();
            }
        } else if (canUnlock && spellId) {
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 9px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('UNLOCK', x + iconSize / 2, y + iconSize / 2 + 3);
            ctx.textAlign = 'start';
        } else {
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.font = 'bold 9px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('LOCKED', x + iconSize / 2, y + iconSize / 2 + 3);
            ctx.textAlign = 'start';
        }

        // Cooldown sweep overlay + countdown number
        if (spell && spell.cooldown > 0 && spell.maxCooldown > 0) {
            const pct = spell.cooldown / spell.maxCooldown;
            ctx.save();
            roundRect(ctx, x, y, iconSize, iconSize, 8);
            ctx.clip();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
            const cx = x + iconSize / 2, cy = y + iconSize / 2;
            const radius = iconSize;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            ctx.fillStyle = '#fff';
            ctx.font = 'bold 17px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(Math.ceil(spell.cooldown), x + iconSize / 2, y + iconSize / 2 - 4);
            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = 'start';
        }

        // Key-bind tab below the icon
        const tabH = 16;
        roundRect(ctx, x + iconSize / 2 - 12, y + iconSize + 3, 24, tabH, 4);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#eee';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(spellNames[key], x + iconSize / 2, y + iconSize + 3 + tabH - 4);
        ctx.textAlign = 'start';
    }

    // Rank-up hint when the player has skill points to spend
    if (player.skillPoints > 0) {
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Double-tap Q/W/E/R to rank up', startX + totalW / 2, y - 8);
        ctx.textAlign = 'start';
    }
}

/** Minimap */
function drawMinimap(ctx, player, entities, map, camera, canvasWidth, canvasHeight) {
    if (!map || !map.grid) return;

    const mmSize = 150;
    const pad = 8;
    const mmX = canvasWidth - mmSize - 20;
    const mmY = canvasHeight - mmSize - 20;
    const scaleX = mmSize / (map.width * TILE_SIZE);
    const scaleY = mmSize / (map.height * TILE_SIZE);
    const scale = Math.min(scaleX, scaleY);

    // Glass frame around the map.
    drawPanel(ctx, mmX - pad, mmY - pad, mmSize + pad * 2, mmSize + pad * 2, { radius: 10 });

    // Clip the map content to a rounded rect so tiles never spill the frame.
    ctx.save();
    roundRect(ctx, mmX, mmY, mmSize, mmSize, 6);
    ctx.clip();
    ctx.fillStyle = 'rgba(6, 8, 16, 0.92)';
    ctx.fillRect(mmX, mmY, mmSize, mmSize);

    for (let ty = 0; ty < map.height; ty++) {
        for (let tx = 0; tx < map.width; tx++) {
            const tile = map.grid[ty]?.[tx];
            if (tile === undefined) continue;
            const tileX = mmX + tx * TILE_SIZE * scale;
            const tileY = mmY + ty * TILE_SIZE * scale;
            const ts = Math.max(1, TILE_SIZE * scale);

            if (tile === 1) {
                ctx.fillStyle = '#2b2f44';
                ctx.fillRect(tileX, tileY, ts, ts);
            } else if (tile === 3) {
                ctx.fillStyle = '#FFD54F';
                ctx.fillRect(tileX, tileY, ts, ts);
            } else if (tile === 4) {
                ctx.fillStyle = '#CE93D8';
                ctx.fillRect(tileX, tileY, ts, ts);
            } else if (tile === 0) {
                ctx.fillStyle = '#4a5170';
                ctx.fillRect(tileX, tileY, ts, ts);
            }
        }
    }

    // Viewport rectangle.
    const vpX = mmX + camera.x * scale;
    const vpY = mmY + camera.y * scale;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(vpX, vpY, (canvasWidth / ZOOM) * scale, (canvasHeight / ZOOM) * scale);

    // Enemy blips with a soft glow.
    ctx.shadowColor = '#F44336';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#FF5A4D';
    for (const entity of entities) {
        if (entity.type === 'player' || !entity.alive) continue;
        ctx.beginPath();
        ctx.arc(mmX + entity.x * scale, mmY + entity.y * scale, 1.8, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Player blip — a pulsing green dot with a ring.
    const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 300);
    const pbx = mmX + player.x * scale, pby = mmY + player.y * scale;
    ctx.strokeStyle = `rgba(120, 230, 140, ${0.4 * pulse})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(pbx, pby, 4.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowColor = '#4CAF50';
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#7CFF9A';
    ctx.beginPath();
    ctx.arc(pbx, pby, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
}

/** Enemy HP bars */
function drawEnemyBars(ctx, entities, camera, canvasWidth, canvasHeight) {
    for (const entity of entities) {
        if (entity.type === 'player' || !entity.alive) continue;
        if (!entity.isTargeted && entity.hp > entity.maxHp * 0.8) continue;

        const sx = (entity.x - camera.x) * ZOOM;
        const sy = (entity.y - camera.y) * ZOOM;
        if (sx < -50 || sx > canvasWidth + 50 || sy < -50 || sy > canvasHeight + 50) continue;

        const barW = (entity.size + 10) * ZOOM;
        const barH = 5;
        const barX = sx - barW / 2;
        const barY = sy - entity.size * ZOOM - 12;
        const hpPct = entity.hp / entity.maxHp;
        const hpColor = hpPct > 0.5 ? '#5BD66A' : hpPct > 0.25 ? '#FFA726' : '#F4493B';

        drawBar(ctx, barX, barY, barW, barH, hpPct, hpColor, {
            track: 'rgba(0,0,0,0.6)', radius: 2.5,
        });

        if (entity.isTargeted) {
            const nm = entity.name || entity.enemyType;
            ctx.font = `700 11px ${FONT}`;
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillText(nm, sx, barY - 5);   // shadow
            ctx.fillStyle = '#FFD54F';
            ctx.fillText(nm, sx, barY - 6);
            ctx.textAlign = 'start';
        }
    }
}