// actions.js — maps action strings to Playwright keyboard/mouse on the canvas

export async function executeAction(page, action, state) {
    const player = state?.player;
    const enemies = state?.enemies || [];
    const canvas = await page.$('#gameCanvas');
    const box = canvas ? await canvas.boundingBox() : null;

    /** Convert world coords to canvas-relative screen coords */
    function worldToScreen(wx, wy) {
        if (!box || !player) return { x: 100, y: 100 };
        // Camera centers on player. Map is 80*32 x 60*32 = 2560 x 1920
        // Canvas viewport shows a window around the player.
        const viewW = 80 * 32; // total world width
        const viewH = 60 * 32;
        const scaleX = box.width / viewW;
        const scaleY = box.height / viewH;
        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        return {
            x: centerX + (wx - player.x) * scaleX,
            y: centerY + (wy - player.y) * scaleY,
        };
    }

    // ---- walk_to(x,y) → right-click on that world coordinate ----
    const walkMatch = action.match(/^walk_to\((\d+),\s*(\d+)\)$/);
    if (walkMatch) {
        const tx = parseInt(walkMatch[1]);
        const ty = parseInt(walkMatch[2]);
        const pos = worldToScreen(tx, ty);
        await page.mouse.click(pos.x, pos.y, { button: 'right' });
        await page.waitForTimeout(100);
        return action;
    }

    // ---- move_toward(x,y) → hold arrow key toward target ----
    const moveMatch = action.match(/^move_toward\((\d+),\s*(\d+)\)$/);
    if (moveMatch) {
        const tx = parseInt(moveMatch[1]);
        const ty = parseInt(moveMatch[2]);
        if (player) {
            const dx = tx - player.x;
            const dy = ty - player.y;
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            // Determine primary direction
            if (absDx > absDy) {
                await page.keyboard.press(dx > 0 ? 'ArrowRight' : 'ArrowLeft');
            } else {
                await page.keyboard.press(dy > 0 ? 'ArrowDown' : 'ArrowUp');
            }
            await page.waitForTimeout(50);
        }
        return action;
    }

    switch (action) {
        // ---- attack_nearest → direct JS API call (bypasses coordinate math entirely) ----
        case 'attack_nearest': {
            const nearest = enemies.filter(e => e.alive).sort((a, b) => a.distance - b.distance)[0];
            if (nearest) {
                // Use window.__attackEnemyById which directly sets player.attackTarget
                const hit = await page.evaluate((id) => {
                    if (window.__attackEnemyById) return window.__attackEnemyById(id);
                    return false;
                }, nearest.id);
                if (!hit && box && player) {
                    // Fallback: click on the canvas at estimated position, then right-click
                    const pos = worldToScreen(nearest.x, nearest.y);
                    await page.mouse.move(pos.x, pos.y);
                    await page.waitForTimeout(30);
                    await page.mouse.click(pos.x, pos.y, { button: 'left' });
                    await page.waitForTimeout(30);
                    // Also try right-click for attack-move behavior
                    await page.mouse.click(pos.x + 5, pos.y + 5, { button: 'right' });
                    await page.waitForTimeout(50);
                }
            }
            return action;
        }

        // ---- Spells ----
        case 'cast_q': case 'cast_w': case 'cast_e': case 'cast_r':
        case 'skill_q': case 'skill_w': case 'skill_e': case 'skill_r': {
            const key = action.replace('cast_', '').replace('skill_', '');
            await page.keyboard.press(key);
            await page.waitForTimeout(50);
            return action;
        }

        case 'interact': await page.keyboard.press('f'); await page.waitForTimeout(50); return action;
        case 'hold_position': return 'hold_position';
        case 'wait': await page.waitForTimeout(300); return action;

        case 'shop_buy_1': case 'shop_buy_2': case 'shop_buy_3':
        case 'shop_buy_4': case 'shop_buy_5': case 'shop_buy_6':
        case 'shop_buy_7': case 'shop_buy_8': {
            await page.keyboard.press(action.replace('shop_buy_', ''));
            return action;
        }
        case 'shop_close': await page.keyboard.press('Escape'); return action;

        default: return action;
    }
}