// mpLobby.js — multiplayer lobby / connection screen
// Presents IP/port input and role selection, then returns connection params.
// Champion select is handled after connection (host picks first, guest picks via host snapshot).

import { CHAMPIONS, CHAMPION_IDS } from '../config/champions.js';

const DEFAULT_SERVER = 'ws://89.167.28.98:8742';

let resolvePromise = null;

/**
 * Show multiplayer lobby.
 * Returns a promise that resolves with { role: 'host'|'guest', wsUrl: string }
 * or null if cancelled.
 */
export function showMultiplayerLobby() {
    return new Promise((resolve) => {
        resolvePromise = resolve;
        const container = document.getElementById('mpLobby');
        container.style.display = 'flex';

        // Show the connection panel
        document.getElementById('mpConnectPanel').style.display = 'block';
        document.getElementById('mpWaitPanel').style.display = 'none';
        document.getElementById('mpChampSelectPanel').style.display = 'none';
        document.getElementById('mpStatus').textContent = '';
        document.getElementById('mpServerUrl').value = DEFAULT_SERVER;
    });
}

function hide() {
    document.getElementById('mpLobby').style.display = 'none';
}

export function hideMpLobby() {
    hide();
}

/**
 * Show the champion-select grid inside the multiplayer lobby.
 * Returns a promise that resolves with the chosen championId once
 * the player picks a champion and clicks Confirm.
 */
export function showMpChampSelect(title) {
    return new Promise((resolve) => {
        const container = document.getElementById('mpLobby');
        container.style.display = 'flex';
        document.getElementById('mpConnectPanel').style.display = 'none';
        document.getElementById('mpWaitPanel').style.display = 'none';

        const panel = document.getElementById('mpChampSelectPanel');
        panel.style.display = 'block';
        document.getElementById('mpChampTitle').textContent = title;

        const grid = document.getElementById('mpChampGrid');
        grid.innerHTML = '';
        const confirmBtn = document.getElementById('mpChampStartBtn');
        confirmBtn.classList.remove('active');

        let selectedId = null;

        for (const id of CHAMPION_IDS) {
            const champ = CHAMPIONS[id];
            const card = document.createElement('div');
            card.className = 'champ-card';
            card.innerHTML = `
                <div class="icon" style="background: ${champ.color}33; border: 2px solid ${champ.color};">
                    ${champ.icon}
                </div>
                <h2 style="color: ${champ.color};">${champ.name}</h2>
                <div class="role">${champ.role}</div>
                <span class="select-arrow">▼ SELECTED</span>
            `;
            card.addEventListener('click', () => {
                grid.querySelectorAll('.champ-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                selectedId = id;
                confirmBtn.classList.add('active');
            });
            grid.appendChild(card);
        }

        confirmBtn.onclick = () => {
            if (!selectedId) return;
            panel.style.display = 'none';
            resolve(selectedId);
        };
    });
}

/**
 * Show a waiting screen inside the multiplayer lobby.
 * opts.status: secondary status line text.
 * opts.onStart: if provided, shows a "Start Game" button that calls
 *   onStart() when clicked. opts.startEnabled controls whether it's clickable.
 * Returns a control object to update the status text / enable the start button.
 */
export function showMpWaiting(message, opts = {}) {
    const container = document.getElementById('mpLobby');
    container.style.display = 'flex';
    document.getElementById('mpConnectPanel').style.display = 'none';
    document.getElementById('mpChampSelectPanel').style.display = 'none';

    document.getElementById('mpWaitPanel').style.display = 'block';
    document.getElementById('mpWaitMsg').textContent = message;
    document.getElementById('mpWaitStatus').textContent = opts.status || '';

    const startBtn = document.getElementById('mpHostStartBtn');
    if (opts.onStart) {
        startBtn.style.display = 'inline-block';
        startBtn.classList.toggle('active', !!opts.startEnabled);
        startBtn.onclick = () => {
            hide();
            opts.onStart();
        };
    } else {
        startBtn.style.display = 'none';
    }

    return {
        setStatus(text) {
            document.getElementById('mpWaitStatus').textContent = text;
        },
        enableStart() {
            startBtn.classList.add('active');
        },
    };
}

// ── Wire up buttons ──
// This module is dynamically imported (long after DOMContentLoaded has
// already fired), so listeners must be attached directly, not deferred.

// Host button
document.getElementById('mpHostBtn').addEventListener('click', () => {
    const url = document.getElementById('mpServerUrl').value.trim() || DEFAULT_SERVER;
    hide();
    if (resolvePromise) {
        resolvePromise({ role: 'host', wsUrl: url });
        resolvePromise = null;
    }
});

// Guest button
document.getElementById('mpGuestBtn').addEventListener('click', () => {
    const url = document.getElementById('mpServerUrl').value.trim() || DEFAULT_SERVER;
    hide();
    if (resolvePromise) {
        resolvePromise({ role: 'guest', wsUrl: url });
        resolvePromise = null;
    }
});

// Back button
document.getElementById('mpBackBtn').addEventListener('click', () => {
    hide();
    if (resolvePromise) {
        resolvePromise(null);
        resolvePromise = null;
    }
});
