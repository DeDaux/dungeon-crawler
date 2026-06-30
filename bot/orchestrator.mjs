// orchestrator.mjs — autonomous game testing bot
// Launches Playwright headless Chromium, runs the game, calls DeepSeek API, dispatches actions

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'url';
import path from 'path';
import { SYSTEM_PROMPT, serializeState } from './prompts.js';
import { executeAction } from './actions.js';
import { classifyBug, buildReport, SEVERITY } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAME_DIR = path.resolve(__dirname, '..');

// DeepSeek API config
const DEEPSEEK_BASE = 'https://api.deepseek.com';
const DEEPSEEK_MODEL = 'deepseek-v4-flash';
function getApiKey() { return process.env['DEEPSEEK_API_KEY'] || ''; }

const PORT = 3099;
const GAME_URL = `http://localhost:${PORT}`;

/** MIME types for static serving */
const MIME = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.png': 'image/png', '.json': 'application/json', '.mjs': 'application/javascript',
};

/** Spin up a mini static file server, return the server instance */
function startGameServer() {
    return new Promise(resolve => {
        const server = createServer((req, res) => {
            let filePath = join(GAME_DIR, req.url === '/' ? 'index.html' : req.url.replace(/^\//, ''));
            if (!existsSync(filePath)) { res.writeHead(404); res.end(); return; }
            const ext = extname(filePath).toLowerCase();
            res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
            res.end(readFileSync(filePath));
        });
        server.listen(PORT, () => { console.log(`   🌐 Game server on port ${PORT}`); resolve(server); });
    });
}

/**
 * Run a single test session for one champion
 */
export async function runTest({ championId, headless = true, maxTurns = 1500, runId }) {
    console.log(`\n🚀 Starting test run: ${runId} | Champion: ${championId}`);
    console.log(`   Headless: ${headless} | Max turns: ${maxTurns}`);

    // Stats trackers
    const stats = {
        turns: 0,
        highestFloor: 1,
        totalKills: 0,
        totalGoldEarned: 0,
        totalDamageTaken: 0,
        totalDamageDealt: 0,
        died: false,
        victory: false,
        startTime: Date.now(),
    };
    let prevHp = null;
    let prevGold = 0;
    let prevKills = 0;

    const actionHistory = [];
    const bugReports = [];
    const fullActionLog = [];

    // Start built-in game server
    const gameServer = await startGameServer();

    // Launch browser
    const browser = await chromium.launch({ headless, args: ['--no-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await context.newPage();

    // Capture console errors from the page
    page.on('console', msg => {
        if (msg.type() === 'error') {
            bugReports.push({
                turn: stats.turns,
                severity: SEVERITY.CRITICAL,
                summary: `Console error: ${msg.text().slice(0, 200)}`,
                timestamp: new Date().toISOString(),
            });
        }
    });

    try {
        // Navigate to game
        console.log('   Loading game...');
        await page.goto(GAME_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Wait for champion select to appear
        await page.waitForSelector('#champSelect', { timeout: 10000 });
        await page.waitForTimeout(500);

        // Use page.evaluate to interact with DOM directly (avoids overlay interception)
        await page.evaluate((targetChampId) => {
            // Select champion card
            const cards = document.querySelectorAll('.champ-card');
            let found = false;
            for (const c of cards) {
                if (c.dataset.champId === targetChampId) {
                    c.click();
                    found = true;
                    break;
                }
            }
            if (!found && cards.length > 0) cards[0].click();

            // Click start after a short delay (champ select uses JS click handlers)
            setTimeout(() => {
                const btn = document.getElementById('startBtn');
                if (btn) btn.click();
            }, 400);
        }, championId);

        console.log(`   Selected champion via DOM: ${championId}`);
        await page.waitForTimeout(1000);

        // Wait for game to load (canvas rendering)
        await page.waitForSelector('#gameCanvas', { timeout: 10000 });
        await page.waitForTimeout(2000); // Let sprites load + first frame

        // ── Main game loop ──
        console.log('   Game started! Entering main loop...\n');

        for (let turn = 0; turn < maxTurns; turn++) {
            stats.turns = turn + 1;

            // Read game state
            const state = await page.evaluate(() => {
                if (window.__getGameState) return window.__getGameState();
                return null;
            });

            // Check for player death
            if (state && !state.player.alive) {
                stats.died = true;
                console.log(`   💀 Player died on turn ${turn + 1}!`);
                // Wait for game over screen
                await page.waitForTimeout(3000);
                break;
            }

            // Track damage taken/gold earned
            if (prevHp !== null && state) {
                const dmgTaken = prevHp - state.player.hp;
                if (dmgTaken > 0) stats.totalDamageTaken += dmgTaken;
                stats.totalDamageDealt += Math.max(0, (state.player.hp - prevHp));
            }
            if (state) {
                prevHp = state.player.hp;
            }
            if (state && state.player.gold > prevGold) {
                stats.totalGoldEarned += state.player.gold - prevGold;
                prevGold = state.player.gold;
            }
            if (state && state.player.floor > stats.highestFloor) {
                stats.highestFloor = state.player.floor;
            }
            if (state) {
                const currentKills = state.summary.kills || 0;
                if (currentKills > prevKills) {
                    stats.totalKills += currentKills - prevKills;
                    prevKills = currentKills;
                }
            }

            // Check victory
            if (state && state.summary.gameState === 'gameOver') {
                stats.victory = true;
                console.log(`   🏆 Victory on turn ${turn + 1}!`);
                break;
            }

            // Check error log (only capture actual errors, not sprite load warnings)
            const errors = await page.evaluate(() => window.__errorLog || []);
            const filtered = errors.filter(e => {
                const m = (e.msg || '').toLowerCase();
                return !m.includes('failed to load sprite') &&
                       !m.includes('sprites loaded') &&
                       !m.includes('preload') &&
                       !m.includes('injected env');
            });
            for (const err of filtered.slice(-5)) {
                bugReports.push({
                    turn: turn + 1,
                    severity: SEVERITY.HIGH,
                    summary: `Engine error: ${err.msg}`,
                    details: err.stack,
                    timestamp: new Date().toISOString(),
                });
            }

            // Check for stuck / no progress
            if (turn > 50 && state) {
                const recentMoves = actionHistory.slice(-30);
                const uniqueMoves = new Set(recentMoves).size;
                if (uniqueMoves <= 2 && recentMoves.length >= 10) {
                    bugReports.push({
                        turn: turn + 1,
                        severity: SEVERITY.HIGH,
                        summary: `Potential soft-lock: only ${uniqueMoves} unique actions in last 30 turns`,
                        timestamp: new Date().toISOString(),
                    });
                    console.log('   ⚠️  Possible soft-lock detected, injecting random moves...');
                    // Inject random cardinal movement to break out
                    const randDirs = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
                    await page.keyboard.down(randDirs[Math.floor(Math.random() * 4)]);
                    await page.waitForTimeout(300);
                    await page.keyboard.up(randDirs[Math.floor(Math.random() * 4)]);
                }
            }

            // Build prompt and call DeepSeek
            const stateText = serializeState(state, turn + 1, actionHistory, bugReports);
            let action = 'wait';

            try {
                const response = await callDeepSeek(stateText, actionHistory);
                const parsed = JSON.parse(response);
                action = parsed.action || 'wait';
                actionHistory.push(action);
                if (actionHistory.length > 100) actionHistory.shift();

                // Log reasoning
                if (parsed.reasoning) {
                    console.log(`   [Turn ${turn + 1}] ${parsed.reasoning.slice(0, 100)}`);
                    console.log(`   → Action: ${action}`);
                }

                // Handle bug report
                if (parsed.bug_report && parsed.bug_report !== 'null') {
                    const severity = classifyBug(parsed.bug_report, state);
                    if (severity) {
                        bugReports.push({
                            turn: turn + 1,
                            severity,
                            summary: parsed.bug_report,
                            state: state ? { hp: state.player.hp, floor: state.player.floor, enemies: state.summary.enemiesAlive } : null,
                            timestamp: new Date().toISOString(),
                        });
                        console.log(`   🐛 BUG [${severity}]: ${parsed.bug_report.slice(0, 120)}`);
                    }
                }
            } catch (e) {
                console.error(`   API call failed: ${e.message}`);
                action = 'wait';
            }

            // Execute action
            await executeAction(page, action, state);

            // Log
            fullActionLog.push({
                turn: turn + 1,
                action,
                playerHp: state?.player?.hp,
                playerFloor: state?.player?.floor,
                enemiesAlive: state?.summary?.enemiesAlive,
                gold: state?.player?.gold,
            });

            // Tick delay (game runs at 60fps, so 0.5s = ~30 frames)
            await page.waitForTimeout(500);
        }

    } catch (e) {
        console.error(`❌ Test run crashed: ${e.message}`);
        bugReports.push({
            turn: stats.turns,
            severity: SEVERITY.CRITICAL,
            summary: `Orchestrator crash: ${e.message}`,
            stack: e.stack?.slice(0, 300),
            timestamp: new Date().toISOString(),
        });
    } finally {
        stats.endTime = Date.now();
        stats.duration = ((stats.endTime - stats.startTime) / 1000).toFixed(1) + 's';

        // Close browser and server
        await browser.close();
        gameServer.close();

        // Build and save report
        const report = buildReport(runId, championId, stats, fullActionLog, bugReports);
        const reportPath = path.resolve(__dirname, 'reports', `${runId}.json`);
        const fs = await import('fs');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
        console.log(`\n📄 Report saved: ${reportPath}`);
        printSummary(report);
    }

    return { stats, bugReports, actionLog: fullActionLog };
}

/**
 * Call DeepSeek API with chat completions
 */
async function callDeepSeek(stateText, actionHistory) {
    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: stateText },
    ];

    const response = await fetch(`${DEEPSEEK_BASE}/v1/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getApiKey()}`,
        },
        body: JSON.stringify({
            model: DEEPSEEK_MODEL,
            messages,
            max_tokens: 200,
            temperature: 0.3,
            stream: false,
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`DeepSeek API ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{"action":"wait"}';

    // Extract JSON from response (may have markdown wrapper)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    return jsonMatch ? jsonMatch[0] : '{"action":"wait"}';
}

function printSummary(report) {
    console.log('\n═══════════════════════════════════════════');
    console.log(`  TEST RUN COMPLETE — ${report.runId}`);
    console.log('═══════════════════════════════════════════');
    console.log(`  Champion:     ${report.championId}`);
    console.log(`  Turns:        ${report.totalTurns}`);
    console.log(`  Highest Floor:${report.highestFloor}`);
    console.log(`  Kills:        ${report.totalKills}`);
    console.log(`  Gold Earned:  ${report.totalGold}`);
    console.log(`  Died:         ${report.died}`);
    console.log(`  Victory:      ${report.victory}`);
    console.log('───────────────────────────────────────────');
    console.log('  BUGS FOUND:');
    for (const [sev, count] of Object.entries(report.bugsBySeverity)) {
        console.log(`    ${sev}: ${count}`);
    }
    console.log('═══════════════════════════════════════════\n');
}