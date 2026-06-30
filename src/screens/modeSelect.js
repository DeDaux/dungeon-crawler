// modeSelect.js — Mode selection screen between main menu and champion select
// Lets the player choose between "Dungeon Crawl" (traditional) and "Base Defense"

let resolvePromise = null;

/**
 * Show the game mode selection screen.
 * Returns a promise that resolves with 'dungeon' or 'baseDefense',
 * or null if cancelled (back to main menu).
 */
export function showModeSelect(title = 'Select Game Mode') {
    return new Promise((resolve) => {
        resolvePromise = resolve;
        const container = document.getElementById('modeSelect');
        container.style.display = 'flex';
        document.getElementById('modeSelectTitle').textContent = title;
        document.getElementById('modeSelectStatus').textContent = '';
    });
}

export function hideModeSelect() {
    document.getElementById('modeSelect').style.display = 'none';
}

// ── Wire up buttons ──

document.getElementById('modeDungeonBtn').addEventListener('click', () => {
    hideModeSelect();
    if (resolvePromise) {
        resolvePromise('dungeon');
        resolvePromise = null;
    }
});

document.getElementById('modeDefenseBtn').addEventListener('click', () => {
    hideModeSelect();
    if (resolvePromise) {
        resolvePromise('baseDefense');
        resolvePromise = null;
    }
});

document.getElementById('modeBackBtn').addEventListener('click', () => {
    hideModeSelect();
    if (resolvePromise) {
        resolvePromise(null);
        resolvePromise = null;
    }
});
