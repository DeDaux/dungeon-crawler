// run.js — CLI entry point for the QA bot
// Usage: node bot/run.js [--champ=orc|elf|pyro|paladin] [--headed] [--max-turns=1500]
//        node bot/run.js --all  (runs all 4 champions sequentially)

import { runTest } from './orchestrator.mjs';

const args = process.argv.slice(2);
const flags = {};
for (const arg of args) {
    if (arg.startsWith('--')) {
        const [key, value] = arg.replace('--', '').split('=');
        flags[key] = value || true;
    }
}

const HEADLESS = !flags.headed;
const MAX_TURNS = parseInt(flags['max-turns'] || '1500', 10);
const champions = ['orc', 'elf', 'pyro', 'paladin'];

async function main() {
    // Load .env FIRST from the Sprites directory (where .env lives)
    try {
        const path = await import('path');
        const { fileURLToPath } = await import('url');
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const dotenv = await import('dotenv');
        dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
    } catch (e) {
        // dotenv not installed, that's ok
    }

    console.log('═══════════════════════════════════════════════');
    console.log('  🎮 DUNGEON CRAWLER QA BOT');
    console.log('  DeepSeek V4 Pro | Playwright');
    console.log('═══════════════════════════════════════════════');

    if (!process.env['DEEPSEEK_API_KEY']) {
        console.error('\n❌ Missing DEEPSEEK_API_KEY environment variable!');
        console.error('   Set it via: set DEEPSEEK_API_KEY=sk-...');
        console.error('   Or create a .env file with DEEPSEEK_API_KEY=sk-...\n');
        process.exit(1);
    }
    console.log('   API key: ' + process.env['DEEPSEEK_API_KEY'].slice(0, 10) + '...\n');

    if (flags.all) {
        console.log(`\n📋 Running ALL 4 champions (${MAX_TURNS} turns each)...\n`);
        const allResults = [];

        for (const champ of champions) {
            const runId = `run-${champ}-${Date.now()}`;
            const result = await runTest({
                championId: champ,
                headless: HEADLESS,
                maxTurns: MAX_TURNS,
                runId,
            });
            allResults.push(result);
            console.log(`\n⏳ Waiting 3 seconds before next champion...\n`);
            await new Promise(r => setTimeout(r, 3000));
        }

        // Print aggregate summary
        console.log('\n═══════════════════════════════════════════════');
        console.log('  📊 AGGREGATE RESULTS (ALL CHAMPIONS)');
        console.log('═══════════════════════════════════════════════');
        let totalBugs = 0;
        const bugSeverities = {};
        for (const r of allResults) {
            console.log(`\n  ${r.stats.champion || r.bugReports[0]?.champion || '?'}:`);
            console.log(`    Floors: ${r.stats.highestFloor} | Kills: ${r.stats.totalKills} | Died: ${r.stats.died} | Victory: ${r.stats.victory}`);
            console.log(`    Bugs: ${r.bugReports.length}`);
            for (const bug of r.bugReports) {
                bugSeverities[bug.severity] = (bugSeverities[bug.severity] || 0) + 1;
                totalBugs++;
            }
        }
        console.log(`\n  TOTAL BUGS: ${totalBugs}`);
        for (const [sev, count] of Object.entries(bugSeverities)) {
            console.log(`    ${sev}: ${count}`);
        }
        console.log('═══════════════════════════════════════════════\n');

    } else {
        const champ = flags.champ || 'orc';
        if (!champions.includes(champ)) {
            console.error(`\n❌ Unknown champion: ${champ}. Options: ${champions.join(', ')}\n`);
            process.exit(1);
        }

        const runId = `run-${champ}-${Date.now()}`;
        await runTest({
            championId: champ,
            headless: HEADLESS,
            maxTurns: MAX_TURNS,
            runId,
        });
    }

    console.log('\n✅ All tests complete!\n');
    process.exit(0);
}

main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});