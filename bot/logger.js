// logger.js — bug classification, JSON reporting, and statistics

const SEVERITY = {
    CRITICAL: 'CRITICAL',
    HIGH: 'HIGH',
    MEDIUM: 'MEDIUM',
    LOW: 'LOW',
    INFO: 'INFO',
};

/** Classify a bug report into severity tiers */
export function classifyBug(report, state) {
    const msg = (report || '').toLowerCase();
    if (!msg || msg.length < 5) return null;

    // CRITICAL: crashes, soft-locks, negative HP, NaN values, can't progress
    const critical = [
        'negative hp', 'nan', 'undefined', 'null hp', 'crash', 'soft-lock',
        'cannot descend', 'cannot move', 'stuck forever', 'infinite loop',
        'game state corrupted', 'hp is nan', 'froze', 'frozen',
    ];
    if (critical.some(t => msg.includes(t))) return SEVERITY.CRITICAL;

    // HIGH: enemies don't attack, spells broken, shop broken, gold not awarded, deaths broken
    const high = [
        'enemy standing', 'enemy not attacking', 'enemy stuck', 'won\'t attack',
        'spell not', 'spell broken', 'shop broken', 'shop not open',
        'stairs not working', 'gold not', 'xp not', 'damage zero',
        'regen broken', 'item effect not', 'cooldown stuck',
    ];
    if (high.some(t => msg.includes(t))) return SEVERITY.HIGH;

    // MEDIUM: balance issues, pathfinding issues, UI glitches
    const medium = [
        'balance', 'too weak', 'too strong', 'too much damage',
        'pathfinding', 'walking through', 'collision missing',
        'ui missing', 'hud missing', 'bar not showing',
    ];
    if (medium.some(t => msg.includes(t))) return SEVERITY.MEDIUM;

    // LOW: minor visual glitches, text cut off, etc
    const low = [
        'visual', 'text cut', 'overlay', 'alignment', 'font',
        'pixel', 'artifact',
    ];
    if (low.some(t => msg.includes(t))) return SEVERITY.LOW;

    return SEVERITY.INFO;
}

/** Build a full run report */
export function buildReport(runId, championId, stats, actionLog, bugs) {
    const summary = {
        runId,
        championId,
        timestamp: new Date().toISOString(),
        totalTurns: stats.turns,
        highestFloor: stats.highestFloor,
        totalKills: stats.totalKills,
        totalGold: stats.totalGoldEarned,
        died: stats.died,
        victory: stats.victory,
        totalDamageTaken: stats.totalDamageTaken,
        totalDamageDealt: stats.totalDamageDealt,
        bugsBySeverity: {},
        bugs: [],
    };

    for (const bug of bugs) {
        const sev = bug.severity || 'UNKNOWN';
        summary.bugsBySeverity[sev] = (summary.bugsBySeverity[sev] || 0) + 1;
        summary.bugs.push(bug);
    }

    return summary;
}

/** Save report to disk */
export function saveReport(report, filePath) {
    const fs = require('fs');
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`Report saved to ${filePath}`);
    printReportSummary(report);
}

/** Print a human-readable summary */
function printReportSummary(report) {
    console.log('\n═══════════════════════════════════════════');
    console.log(`  TEST RUN COMPLETE — ${report.runId}`);
    console.log('═══════════════════════════════════════════');
    console.log(`  Champion:     ${report.championId}`);
    console.log(`  Turns:        ${report.totalTurns}`);
    console.log(`  Highest Floor:${report.highestFloor}`);
    console.log(`  Kills:        ${report.totalKills}`);
    console.log(`  Gold Earned:  ${report.totalGold}`);
    console.log(`  Damage Taken: ${report.totalDamageTaken}`);
    console.log(`  Damage Dealt: ${report.totalDamageDealt}`);
    console.log(`  Died:         ${report.died}`);
    console.log(`  Victory:      ${report.victory}`);
    console.log('───────────────────────────────────────────');
    console.log('  BUGS FOUND:');
    for (const [sev, count] of Object.entries(report.bugsBySeverity)) {
        console.log(`    ${sev}: ${count}`);
    }
    console.log('═══════════════════════════════════════════\n');
}

export { SEVERITY };