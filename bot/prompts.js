// prompts.js — compact system prompt + state serializer

export const SYSTEM_PROMPT = `You play a 2D dungeon crawler as a QA bot. Controls:
- walk_to(X,Y) = right-click world coords to move there
- attack_nearest = attack closest enemy (must be within ~50 range or it won't hit)
- cast_Q / cast_W / cast_E / cast_R = cast spell toward enemies
- skill_Q / skill_W / skill_E / skill_R = unlock/rank up a spell (costs 1 SP)
- interact = press F on stairs or shop tile
- shop_buy_1..8 = buy shop item | shop_close = close shop ESC
- wait = do nothing 0.5s

CRITICAL PLAY STYLE:
1. If enemy >80 away: use walk_to(enemyX, enemyY) to approach first. Never attack from far.
2. If enemy <60 away: use attack_nearest to fight.
3. If spell off cooldown AND enemy in range: cast it.
4. If 0 enemies remain: walk_to stairs coords then interact.
5. If on shop: interact then buy items, then close, then continue.

YOU MUST WALK TOWARD ENEMIES FIRST. Never spam attack_nearest from across the map.
Reply ONLY with JSON: {"reasoning":"...","action":"...","bug_report":null}`;

export function serializeState(state, turnNumber, actionHistory, bugReports) {
    if (!state) return 'No state yet. Use wait.';
    const p = state.player;
    const alive = state.enemies.filter(e => e.alive);
    return `Turn ${turnNumber} Floor ${p.floor} HP ${p.hp}/${p.maxHp} Gold ${p.gold}
Pos:(${p.x},${p.y}) SP:${p.skillPoints}
Spells:Q:${p.spells.q?.id||'-'}(${p.spells.q?.cooldown||0}s) W:${p.spells.w?.id||'-'}(${p.spells.w?.cooldown||0}s) E:${p.spells.e?.id||'-'}(${p.spells.e?.cooldown||0}s) R:${p.spells.r?.id||'-'}(${p.spells.r?.cooldown||0}s)
Enemies:${state.summary.enemiesAlive}/${state.summary.enemiesTotal} Kills:${state.summary.kills}
${alive.slice(0,8).map(e=>` ${e.name}#${e.id} (${e.x},${e.y}) dist=${e.distance} hp=${e.hp}/${e.maxHp}`).join('\n')||' none'}
Stairs@(${state.map.stairsX},${state.map.stairsY}) on=${state.map.onStairs} Shop@(${state.map.shopX},${state.map.shopY}) on=${state.map.onShop} open=${state.summary.shopOpen}
Recent:${actionHistory.slice(-6).join(',')||'none'}`;
}