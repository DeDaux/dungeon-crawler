// champSelect.js — champion selection screen

import { CHAMPIONS, CHAMPION_IDS } from '../config/champions.js';
import { SPELLS } from '../config/spells.js';

let selectedChampionId = null;
let resolvePromise = null;

/**
 * Show champion select and return a promise that resolves with the chosen champion ID
 */
export function showChampionSelect() {
    return new Promise((resolve) => {
        resolvePromise = resolve;
        selectedChampionId = null;
        // Hide main menu when showing champion select
        const mainMenu = document.getElementById('mainMenu');
        if (mainMenu) mainMenu.style.display = 'none';
        renderChampionSelect();
    });
}


function renderChampionSelect() {
    const container = document.getElementById('champSelect');
    const grid = document.getElementById('champGrid');
    const startBtn = document.getElementById('startBtn');

    container.style.display = 'flex';
    grid.innerHTML = '';
    startBtn.classList.remove('active');
    startBtn.textContent = 'Enter the Dungeon';

    for (const id of CHAMPION_IDS) {
        const champ = CHAMPIONS[id];
        const card = document.createElement('div');
        card.className = 'champ-card';
        card.dataset.champId = id;

        card.innerHTML = `
            <div class="icon" style="background: ${champ.color}33; border: 2px solid ${champ.color};">
                ${champ.icon}
            </div>
            <h2 style="color: ${champ.color};">${champ.name}</h2>
            <div class="role">${champ.role}</div>
            <div class="spell-list">
                ${champ.spells.map((spellId, i) => {
                    const spell = SPELLS[spellId];
                    const key = ['Q','W','E','R'][i];
                    return `<span>${key}</span> ${spell ? spell.name : spellId} — ${spell ? spell.description : ''}<br>`;
                }).join('')}
            </div>
            <span class="select-arrow">▼ SELECTED</span>
        `;

        card.addEventListener('click', () => {
            // Deselect all
            document.querySelectorAll('.champ-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedChampionId = id;
            startBtn.classList.add('active');
        });

        grid.appendChild(card);
    }

    startBtn.addEventListener('click', () => {
        if (selectedChampionId) {
            container.style.display = 'none';
            if (resolvePromise) {
                resolvePromise(selectedChampionId);
                resolvePromise = null;
            }
        }
    }, { once: true });
}

/**
 * Show game over screen
 */
export function showGameOver(championId, stats) {
    const overlay = document.getElementById('gameOver');
    const statsEl = document.getElementById('deathStats');
    const titleEl = document.getElementById('gameOverTitle');
    const champ = CHAMPIONS[championId];

    overlay.style.display = 'flex';

    if (stats.victory) {
        if (titleEl) titleEl.textContent = '🏆 VICTORY! 🏆';
        if (titleEl) titleEl.style.color = '#FFD700';
        statsEl.innerHTML = `<strong>${champ ? champ.name : 'Unknown'}</strong> conquered all 10 floors!<br>
            💀 Kills: ${stats.kills || 0} &nbsp;|&nbsp; 🏠 Floors: ${stats.floor || 1} &nbsp;|&nbsp; 💰 Gold: ${stats.gold || 0}`;
    } else {
        if (titleEl) titleEl.textContent = stats.disconnected ? 'HOST DISCONNECTED' : 'YOU DIED';
        if (titleEl) titleEl.style.color = stats.disconnected ? '#FF9800' : '#F44336';
        statsEl.innerHTML = `Champion: ${champ ? champ.name : 'Unknown'} &nbsp;|&nbsp; Kills: ${stats.kills || 0} &nbsp;|&nbsp; Floor: ${stats.floor || 1} &nbsp;|&nbsp; 💰 Gold: ${stats.gold || 0}`;
    }

    document.getElementById('restartBtn').onclick = () => {
        overlay.style.display = 'none';
        window.location.reload();
    };
}
