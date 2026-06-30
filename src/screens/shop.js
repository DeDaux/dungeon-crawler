// shop.js — random dungeon shop screen overlay
import { getCanvas, getCtx, Engine } from '../engine.js';
import { generateShopInventory, applyItemEffect } from '../config/items.js';
import { drawPanel, roundRectPath, withAlpha } from '../render/ui.js';

const SHOP_FONT = "'Segoe UI', system-ui, sans-serif";

let shopOpen = false;
let shopItems = [];
let shopResolve = null;
let stockedFloor = null;
let selectedIndex = 0;
let purchaseMessage = null;
let purchaseMessageTimer = 0;

/** Build a short confirmation summarizing what the purchased item did */
function describePurchaseEffect(item) {
    const e = item.effect || {};
    if (e.heal) return `+${e.heal} HP`;
    if (e.resetCooldowns) return 'Cooldowns reset!';
    if (e.skillPoint) return `+${e.skillPoint} Skill Point${e.skillPoint > 1 ? 's' : ''}`;
    if (e.aoeDamage) return `${e.aoeDamage} AoE damage!`;
    if (e.aoeHeal) return `+${e.aoeHeal} HP (AoE heal)`;
    if (e.buff) return `Buff active for ${e.buff.duration}s`;
    return 'Equipped!';
}

const canvas = getCanvas();
const ctx = getCtx();

/** Open the shop with items for a given floor. Returns promise that resolves when shop closes. */
export function openShop(floorNumber) {
    if (stockedFloor !== floorNumber) {
        shopItems = generateShopInventory(floorNumber, 8);
        stockedFloor = floorNumber;
    }
    selectedIndex = 0;
    shopOpen = true;
    purchaseMessage = null;
    purchaseMessageTimer = 0;
    return new Promise(resolve => {
        shopResolve = resolve;
    });
}

/** Check if shop is currently open */
export function isShopOpen() {
    return shopOpen;
}

/** Get current shop items */
export function getShopItems() {
    return shopItems;
}

/** Select an item by index */
export function selectShopItem(index) {
    if (index >= 0 && index < shopItems.length) {
        selectedIndex = index;
    }
}

/** Move selection up/down */
export function moveShopSelection(direction) {
    const len = shopItems.length;
    if (len === 0) return; // avoid NaN from modulo-by-zero
    selectedIndex = ((selectedIndex + direction) % len + len) % len;
}

/** Buy the currently selected item */
export function buyShopItem(player) {
    if (!shopOpen || selectedIndex < 0 || selectedIndex >= shopItems.length) return false;
    const item = shopItems[selectedIndex];
    if (player.gold < item.cost) return false;

    if (item.type === 'consumable') {
        const slot = player.inventory.findIndex(s => s === null);
        if (slot === -1) return false; // inventory full
        player.gold -= item.cost;
        player.inventory[slot] = { ...item };
        purchaseMessage = `${item.icon || ''} ${item.name} added to slot ${slot + 1}`;
        purchaseMessageTimer = 2.5;
        shopItems.splice(selectedIndex, 1);
        if (selectedIndex >= shopItems.length && shopItems.length > 0) {
            selectedIndex = shopItems.length - 1;
        }
        return true;
    }

    player.gold -= item.cost;
    applyItemEffect(player, item);
    purchaseMessage = `${item.icon || ''} ${item.name} — ${describePurchaseEffect(item)}`;
    purchaseMessageTimer = 2.5;
    // Remove item from shop
    shopItems.splice(selectedIndex, 1);
    if (selectedIndex >= shopItems.length && shopItems.length > 0) {
        selectedIndex = shopItems.length - 1;
    }
    return true;
}

/** Close the shop */
export function closeShop() {
    shopOpen = false;
    if (shopResolve) {
        shopResolve();
        shopResolve = null;
    }
}

/** Render the shop overlay */
export function drawShop(ctx, player) {
    if (!shopOpen) return;

    const cw = canvas.width;
    const ch = canvas.height;

    // Dim + blur-ish vignette behind the shop.
    ctx.fillStyle = 'rgba(4, 5, 12, 0.78)';
    ctx.fillRect(0, 0, cw, ch);

    // Shop panel
    const panelW = 640;
    const panelH = 520;
    const px = (cw - panelW) / 2;
    const py = (ch - panelH) / 2;

    // Polished glass panel with a gold accent.
    drawPanel(ctx, px, py, panelW, panelH, { radius: 16, accent: '#FFD700', glow: true });

    // Header divider line.
    ctx.strokeStyle = 'rgba(255,215,0,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 24, py + 90);
    ctx.lineTo(px + panelW - 24, py + 90);
    ctx.stroke();

    // Header
    ctx.save();
    ctx.shadowColor = 'rgba(255,215,0,0.5)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#FFD700';
    ctx.font = `800 24px ${SHOP_FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('⚒  DUNGEON SHOP  ⚒', px + panelW / 2, py + 38);
    ctx.restore();

    // Gold display pill
    const goldText = `${player.gold || 0}`;
    ctx.font = `700 15px ${SHOP_FONT}`;
    const gw = ctx.measureText(goldText).width + 44;
    roundRectPath(ctx, px + panelW / 2 - gw / 2, py + 52, gw, 24, 12);
    ctx.fillStyle = 'rgba(255,215,0,0.12)';
    ctx.fill();
    roundRectPath(ctx, px + panelW / 2 - gw / 2, py + 52, gw, 24, 12);
    ctx.strokeStyle = 'rgba(255,215,0,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#FFE082';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`💰 ${goldText}`, px + panelW / 2, py + 64);
    ctx.textBaseline = 'alphabetic';

    // Subtitle
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = `12px ${SHOP_FONT}`;
    ctx.fillText('Click an item to buy — ESC or Close to leave', px + panelW / 2, py + 86);

    // Items grid (2 columns x 4 rows)
    const startX = px + 30;
    const startY = py + 95;
    const colW = (panelW - 60) / 2 - 10;
    const rowH = 90;
    const cols = 2;

    for (let i = 0; i < shopItems.length; i++) {
        const item = shopItems[i];
        const col = i % cols;
        const row = Math.floor(i / cols);
        const ix = startX + col * (colW + 20);
        const iy = startY + row * rowH;

        const isSelected = i === selectedIndex;
        const canAfford = player.gold >= item.cost;
        const cardH = rowH - 4;
        const accent = item.color || '#9C8BFF';

        // Card body — rounded glass, brighter when selected.
        const card = ctx.createLinearGradient(0, iy, 0, iy + cardH);
        if (isSelected) {
            card.addColorStop(0, withAlpha(canAfford ? '#FFD700' : '#F44336', 0.22));
            card.addColorStop(1, 'rgba(14,15,26,0.92)');
        } else {
            card.addColorStop(0, 'rgba(34,36,52,0.85)');
            card.addColorStop(1, 'rgba(14,15,26,0.9)');
        }
        roundRectPath(ctx, ix, iy, colW, cardH, 9);
        ctx.fillStyle = card;
        ctx.fill();

        // Left accent bar in the item's color.
        ctx.save();
        roundRectPath(ctx, ix, iy, colW, cardH, 9);
        ctx.clip();
        ctx.fillStyle = withAlpha(accent, isSelected ? 0.95 : 0.6);
        ctx.fillRect(ix, iy, 3.5, cardH);
        ctx.restore();

        // Border
        roundRectPath(ctx, ix, iy, colW, cardH, 9);
        if (isSelected) {
            ctx.strokeStyle = canAfford ? '#FFD700' : '#F44336';
            ctx.lineWidth = 2;
            ctx.shadowColor = withAlpha(canAfford ? '#FFD700' : '#F44336', 0.6);
            ctx.shadowBlur = 10;
        } else {
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 1;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Icon in a tinted circle.
        const iconCx = ix + 26, iconCy = iy + cardH / 2;
        ctx.beginPath();
        ctx.arc(iconCx, iconCy, 16, 0, Math.PI * 2);
        ctx.fillStyle = withAlpha(accent, 0.18);
        ctx.fill();
        ctx.strokeStyle = withAlpha(accent, 0.5);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = item.color || '#FFF';
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.icon || '❓', iconCx, iconCy + 1);
        ctx.textBaseline = 'alphabetic';

        const textX = ix + 50;
        // Name
        ctx.fillStyle = '#FFF';
        ctx.font = `700 14px ${SHOP_FONT}`;
        ctx.textAlign = 'start';
        ctx.fillText(item.name, textX, iy + 22);

        // Description
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = `11px ${SHOP_FONT}`;
        ctx.fillText(item.description, textX, iy + 40);

        // Type badge pill
        const badge = item.type.toUpperCase();
        const badgeColor = item.type === 'equipment' ? '#66BB6A' : '#42A5F5';
        ctx.font = `700 9px ${SHOP_FONT}`;
        const bw = ctx.measureText(badge).width + 12;
        roundRectPath(ctx, textX, iy + cardH - 22, bw, 14, 7);
        ctx.fillStyle = withAlpha(badgeColor, 0.18);
        ctx.fill();
        ctx.fillStyle = badgeColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badge, textX + bw / 2, iy + cardH - 15);
        ctx.textBaseline = 'alphabetic';

        // Gold cost
        ctx.fillStyle = canAfford ? '#FFD700' : '#EF5350';
        ctx.font = `800 14px ${SHOP_FONT}`;
        ctx.textAlign = 'right';
        ctx.fillText(`${item.cost}g`, ix + colW - 12, iy + 24);
        ctx.textAlign = 'start';
    }

    // "No more items" message
    if (shopItems.length === 0) {
        ctx.fillStyle = '#888';
        ctx.font = '18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('All items purchased!', px + panelW / 2, py + panelH / 2);
    }

    // Close button
    const btnX = px + panelW / 2 - 60;
    const btnY = py + panelH - 50;
    const btnGrad = ctx.createLinearGradient(0, btnY, 0, btnY + 30);
    btnGrad.addColorStop(0, 'rgba(70, 74, 96, 0.95)');
    btnGrad.addColorStop(1, 'rgba(40, 43, 60, 0.95)');
    roundRectPath(ctx, btnX, btnY, 120, 30, 8);
    ctx.fillStyle = btnGrad;
    ctx.fill();
    roundRectPath(ctx, btnX, btnY, 120, 30, 8);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#FFF';
    ctx.font = `700 13px ${SHOP_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CLOSE  ·  ESC', btnX + 60, btnY + 15);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'start';

    // Footer hint
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.font = `11px ${SHOP_FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('1-8 to quick-buy  ·  Arrow keys to navigate', px + panelW / 2, py + panelH - 13);
    ctx.textAlign = 'start';

    // Purchase confirmation toast
    if (purchaseMessageTimer > 0 && purchaseMessage) {
        purchaseMessageTimer -= Engine.dt;
        const alpha = Math.min(1, purchaseMessageTimer / 0.5);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#4CAF50';
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(purchaseMessage, px + panelW / 2, py + panelH - 38);
        ctx.restore();
        ctx.textAlign = 'start';
        if (purchaseMessageTimer <= 0) purchaseMessage = null;
    }
}

/** Handle input for the shop (called from main loop) */
export function handleShopInput(player, key, mouseX, mouseY, clicked) {
    if (!shopOpen) return;

    const cw = canvas.width;
    const ch = canvas.height;
    const panelW = 640;
    const panelH = 520;
    const px = (cw - panelW) / 2;
    const py = (ch - panelH) / 2;
    const startX = px + 30;
    const startY = py + 95;
    const colW = (panelW - 60) / 2 - 10;
    const rowH = 90;
    const cols = 2;

    // Keyboard navigation
    if (key === 'Escape' || key === 'KeyC') {
        closeShop();
        return;
    }
    if (key === 'ArrowUp' || key === 'KeyW') {
        moveShopSelection(-2);
        return;
    }
    if (key === 'ArrowDown' || key === 'KeyS') {
        moveShopSelection(2);
        return;
    }
    if (key === 'ArrowLeft' || key === 'KeyA') {
        moveShopSelection(-1);
        return;
    }
    if (key === 'ArrowRight' || key === 'KeyD') {
        moveShopSelection(1);
        return;
    }
    if (key === 'Enter' || key === 'Space') {
        buyShopItem(player);
        return;
    }
    // Number keys for quick buy
    if (key >= 'Digit1' && key <= 'Digit8') {
        const idx = parseInt(key.replace('Digit', '')) - 1;
        if (idx < shopItems.length) {
            selectShopItem(idx);
            buyShopItem(player);
        }
        return;
    }

    // Mouse click handling
    if (clicked) {
        // Check close button
        const btnX = px + panelW / 2 - 60;
        const btnY = py + panelH - 50;
        if (mouseX >= btnX && mouseX <= btnX + 120 && mouseY >= btnY && mouseY <= btnY + 30) {
            closeShop();
            return;
        }

        // Check items
        for (let i = 0; i < shopItems.length; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const ix = startX + col * (colW + 20);
            const iy = startY + row * rowH;
            if (mouseX >= ix && mouseX <= ix + colW && mouseY >= iy && mouseY <= iy + rowH - 4) {
                selectShopItem(i);
                buyShopItem(player);
                return;
            }
        }
    }
}