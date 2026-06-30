# Plan: Rework "Base Defense" mode to reuse the dungeon + full heroes

This is an implementation spec for a coding LLM. The project is a vanilla-JS (ES modules,
HTML5 canvas) action-roguelike. There are two game modes: **Dungeon Crawl** (`gameState === 'playing'`)
and **Base Defense** (`gameState === 'defense'`). The Base Defense mode currently uses a separate
flat arena, a stripped-down player update loop, and a persistent tower-shop bar. We are replacing
that with a version that **reuses the real dungeon and the real hero systems**.

## Goals (what "done" looks like)

1. **Exact same heroes, exact same abilities.** In Base Defense the player champion must behave
   *identically* to Dungeon Crawl: same movement (click-to-move/attack-move), same basic attacks,
   same Q/W/E/R spells, same cooldowns, same leveling/skill points, same items/buffs, same
   collision, same sprite rendering. Do this by **calling the existing dungeon simulation/render
   functions**, not by reimplementing them.
2. **The arena is a real dungeon.** Use the procedural `DungeonMap` (rooms + corridors + the normal
   dungeon tile rendering), not the flat `BaseDefenseMap`. It should look and feel like Dungeon Crawl.
3. **Tower spots are few and explicit.** There should be only a small number of build spots
   (target: **4–6**), placed at sensible chokepoints. The tower buy/upgrade panel must **only appear
   when the player clicks a tower spot** (or an existing tower) — there is **no** persistent bottom bar.
4. Waves of enemies spawn and march to a **base crystal**; if the base HP hits 0 the run is lost.
   Surviving all waves wins.

## Core principle: reuse, don't reimplement

The dungeon-mode per-frame update (`update(dt)` in `src/main.js`, the `gameState === 'playing'`
branch) already runs the entire hero experience:

```
handleInput(localPlayer, entities)      // click move / attack-move / spell cast input
updateCombat(entities, dt, map)         // auto basic-attacks for player AND enemies, LoS-gated
processBurns(entities, dt)
updateAI(entities, players, dt, map)    // enemy AI (we will REPLACE this for defense — see below)
tickEnemyAbilities(entities, dt)
processEnemyAoEZones(entities, dt)
updatePlayerDebuffs(dt)
updateMovement(entities, map, dt)       // moves every entity toward entity.targetX/targetY w/ wall collision
updateBuffs(p, dt) for each player
updateCamera(dt)                        // ALSO feeds Input.mouseWorld — important
updateParticles(dt)
updatePlayerRegen(dt)
updateItemEffects(dt)
tickEntityFrame(entity, dt) for all     // sprite animation
updateProjectiles(projectiles, entities, map, dt)
// then drains getPendingProjectiles()/getPendingEnemyProjectiles() into projectiles[]
```

Dungeon-mode render is a single call: `render(entities, projectiles, map, localPlayer)`
(`src/render/renderer.js`) which draws the dungeon tiles, all entities (sprites + fallback),
projectiles, particles, floating damage text, and the player HUD.

**The Base Defense update/render must be built as a thin layer on top of these**, replacing only:
- enemy targeting/movement goal (march to the base instead of chasing the player), and
- adding towers, the base crystal, wave spawning, and the tower-spot UI.

## Files

- **Modify** `src/main.js` — defense init, defense update loop, defense render, tower-spot click UI.
- **Rewrite** `src/systems/baseDefense.js` — `BaseDefenseGame` controller (waves, towers, base),
  keep `DefenseTower` and `TowerProjectile` largely as-is (they already work).
- **Delete / stop using** `src/systems/baseDefenseMap.js` — replaced by `DungeonMap`.
- **Rewrite** `src/render/drawBaseDefense.js` — only world-space tower/base/spot overlays + a
  small screen-space wave/gold HUD + the contextual tower panel. (The dungeon itself is drawn by
  the normal `render()`.)
- `src/config/towers.js` — unchanged (tower types: arrow/cannon/frost/magic; `getTowerConfig`,
  `getUpgradeCost`, `getTowerDamage`, `getTowerRange`). Reuse as-is.
- `src/screens/modeSelect.js` / mode-select wiring in `start()` — unchanged.

## Relevant existing APIs (use these exact symbols)

- `src/systems/map.js` → `class DungeonMap`:
  - `generate(worldW, worldH, roomCount, hasShop)`, `getPlayerSpawn() -> {x,y}`,
    `getEnemySpawnPoints() -> [{x,y,roomIndex}]`, `worldToTile(wx,wy) -> {tx,ty}`,
    `isWalkable(tx,ty)`, `isWorldWalkable(wx,wy)`, `hasLineOfSight(x1,y1,x2,y2)`,
    `rooms` (array of `{x,y,w,h,cx,cy}` in tiles), `static TILE_SIZE` (=32), `TILE` enum.
  - **`DungeonMap` has NO pathfinding.** You must add a BFS `findPath` (see "Enemy pathing").
- `src/camera.js` → `Camera`, `ZOOM` (1.5), `setFollowTarget(entity)`, `setMapBounds(w,h)`,
  `updateCamera(dt)`, `applyCameraTransform(ctx)`, `shake(i,dur)`.
  - `updateCamera` follows the target, clamps to map bounds, AND sets `Input.mouseWorld`
    (screen→world using `ZOOM` + camera offset). **If you use the normal player-follow camera,
    mouseWorld is correct for free.**
- `src/render/renderer.js` → `render(entities, projectiles, map, player)`.
- `src/entities/factory.js` → `spawnPlayer(championId)`, `spawnEnemy(type, x, y, map, floorNumber)`.
- `src/systems/combat.js` → `dealDamage(target, amount, source, critical?)`, `spawnFloatText`,
  `queueSoundEvent`, `getPendingFloatTexts`, etc.
- `src/input.js` → `Input` with `mouseScreenX/Y`, `mouseWorld` (getter `{x,y}`), `leftClicked`,
  `rightClicked`, `rightClickTarget`, `isKeyPressedThisFrame(code)`, `setMouseWorld(x,y)`,
  `resetFrame()`; plus `pollSpellKeys()`.
- `src/config/towers.js` → `TOWER_TYPES`, `getTowerConfig`, `getUpgradeCost`, `getTowerDamage`,
  `getTowerRange`.

## Data model

Keep a single `defenseGame` instance (already a module-level `let` in main.js). It should hold:

```js
defenseGame = {
  map,                  // a DungeonMap (the SAME object also assigned to the global `map`)
  base: { x, y, hp, maxHp, tileX, tileY },   // crystal; pick a room far from player spawn
  towerSpots: [ { x, y, occupied:false } ],  // FEW (4–6) world-space spots at chokepoints
  towers: [ DefenseTower ],
  towerProjectiles: [ TowerProjectile ],
  currentWave, waveActive, waveTimer, spawnTimer, enemiesToSpawn: [],
  gold,                 // tower currency, starts ~150
  state: 'waiting'|'active'|'won'|'lost',
  // UI:
  selectedSpotIndex: null,   // which spot's buy panel is open (null = closed)
  selectedTower: null,       // which placed tower's upgrade/sell panel is open
}
```

The **player, enemies, and projectiles live in the SAME global `entities`/`projectiles` arrays**
used by dungeon mode (so the normal systems process them). Towers, towerProjectiles, the base, and
tower spots live on `defenseGame` and are updated/drawn separately.

## Implementation steps

### 1. `initDefenseGame(championId)` (in main.js)

Mirror `initGame()` but for defense. Concretely:
- `setPlayersProvider(() => players)`, `resetIdCounter()`, `resetCombatState()`, drain pending
  projectiles.
- `map = new DungeonMap(); map.generate(80*32, 60*32, 8, false);` (no shop). Assign to the global
  `map` (the normal systems read the global `map`).
- `setMapBounds(80*32, 60*32)`.
- `localPlayer = spawnPlayer(championId)`; place at `map.getPlayerSpawn()`. Initialize spell
  cooldown/castTime exactly like `initGame` does.
- `players = [localPlayer]; entities = [localPlayer]; projectiles = [];`
- `setFollowTarget(localPlayer);` (this is what makes the camera + mouseWorld behave like dungeon mode)
- Create `defenseGame = new BaseDefenseGame(championId, players)` and pass it the `map`. Have it:
  - choose the **base** location: the room **farthest** from the player's spawn room
    (`map.rooms`), base at that room center; `hp = maxHp = 500`.
  - choose **4–6 tower spots**: pick walkable tiles near corridor mouths / between the spawn
    rooms and the base. A simple robust heuristic: for each room *other* than spawn/base, take 1
    walkable tile near its entrance; cap at 6. Spots must be on `TILE.FLOOR` and not on the base.
    Convert to world coords (`tileX*32+16`).
  - build wave queue config (reuse the existing `WAVE_CONFIGS` / `getWaveConfig`).
  - `gold = 150; state='waiting'; currentWave=0; waveTimer=10`.
- `gameState = 'defense'; gameMode = 'defense';`
- `startBGM();`

The existing R-to-restart path already calls `initDefenseGame(champId)`; keep that.

### 2. `updateDefense(dt)` (in main.js) — reuse the dungeon pipeline

Replace the current bespoke body with: run the **same systems dungeon mode runs**, except swap enemy
AI for "march to base," and add tower/base/wave/UI logic. Order:

```
if (!defenseGame || !defenseGame.localPlayer) return;

// 0. Game-over gate (R to restart) — keep existing behavior.
if (state==='lost' || state==='won') { if R pressed -> initDefenseGame(); Input.resetFrame(); return; }

// 1. Tower-spot / tower UI input FIRST (so a UI click is consumed and not also treated as a move).
handleDefenseTowerUI();   // see step 4; if it consumes the click, clear Input.leftClicked effect

// 2. Normal hero input + sim (identical calls to the dungeon branch):
handleInput(localPlayer, entities);
updateCombat(entities, dt, map);
processBurns(entities, dt);
updateDefenseEnemies(dt);          // REPLACES updateAI — see step 3
tickEnemyAbilities(entities, dt);  // optional; safe to keep
updateMovement(entities, map, dt);
updateBuffs(localPlayer, dt);
updateCamera(dt);                  // also refreshes Input.mouseWorld
updateParticles(dt);
updatePlayerRegen(dt);
updateItemEffects(dt);
for (e of entities) tickEntityFrame(e, dt);
updateProjectiles(projectiles, entities, map, dt);
for (p of getPendingProjectiles()) projectiles.push(p);
for (p of getPendingEnemyProjectiles()) projectiles.push(p);

// 3. Defense-specific:
defenseGame.update(dt);            // waves, towers, tower projectiles, base damage, win/lose
Input.resetFrame();
```

Notes:
- Do **not** early-return before `updateCamera`; mouseWorld depends on it.
- `handleInput` already implements click-to-move, attack-move, and spell casting using
  `Input.mouseWorld`. Because we use a follow camera, this "just works." **Do not** add a separate
  movement/spell implementation.
- Keep the player fully alive/damageable — enemies will damage the player through the normal
  combat system if they target the player (see step 3 for the aggro rule).

### 3. `updateDefenseEnemies(dt)` — enemies march to the base (replaces updateAI)

For each alive enemy in `entities` (skip players/towers):
- Ensure it has a path to the base. On spawn, compute `enemy._path = map.findPath(enemy.x, enemy.y,
  base.x, base.y)` (BFS, see below) → array of world waypoints; `enemy._pathIdx = 0`.
  - If no path is found, fall back to a 2-point straight line `[start, base]` so the enemy still
    advances (never leave it pathless — that can softlock wave-clear detection).
- **Drive movement via the normal pipeline**: set `enemy.targetX/targetY` to the current waypoint;
  advance `_pathIdx` when within ~6px. `updateMovement` (already called) moves the enemy there with
  wall collision. Do **not** hand-roll position integration — let `updateMovement` do it so behavior
  matches dungeon enemies (speed, wall-slide, separation).
- **Base contact damage**: when the enemy is within ~28px of the base, damage the base
  (`base.hp -= round((enemy.attackDamage||10) * k)`), kill the enemy (set `alive=false`,
  `deathTimer`), spawn particles + shake. (Keep this in `defenseGame.update` if you prefer.)
- **Optional aggro on the hero (recommended, keeps the kit meaningful):** if the player damaged this
  enemy recently (combat.js already sets `enemy._aggroLockedTarget`/`_lastDamageSource` — reuse it),
  let the enemy target and attack the player via the normal combat path for a few seconds, then
  resume marching to the base. If you skip this, enemies ignore the player entirely (pure TD); the
  hero can still freely damage them. Pick the aggro version unless it's risky — it makes tanky/melee
  champions useful.

### 4. Tower-spot UI — click a spot to open the buy panel (NO persistent bar)

This is the key UX change. There is no bottom build bar. Instead:

- **Hit testing** uses `Input.mouseWorld` (world coords; correct because of the follow camera).
- On `Input.leftClicked`:
  1. If a tower-spot buy panel or tower upgrade panel is **open**, first test clicks against the
     panel buttons (these are drawn in **screen space**, so compare against `Input.mouseScreenX/Y`).
     - Buy panel: 4 tower-type buttons (arrow/cannon/frost/magic) with costs. Clicking one with
       enough gold calls `defenseGame.placeTower(typeId, selectedSpotIndex)`, closes the panel.
     - Upgrade panel: "Upgrade (cost)" and "Sell (refund)" buttons → `upgradeTower`/`sellTower`.
     - Clicking outside the panel closes it (set `selectedSpotIndex=null`/`selectedTower=null`) and
       falls through to world handling.
  2. Else, test the world click against tower spots: if within ~24px of an **unoccupied** spot,
     open the buy panel for that spot (`selectedSpotIndex = i`) and **consume the click** (so the
     player doesn't also move there).
  3. Else, test against placed towers (`defenseGame.getTowerAt(worldX,worldY)`): open the
     upgrade/sell panel (`selectedTower = tower`) and consume the click.
  4. Else (empty ground): close any open panel; let `handleInput` treat it as a normal move/attack
     click. **Important:** to avoid double-handling, decide an order — run this tower-UI handler
     *before* `handleInput`, and when it consumes a click, prevent `handleInput` from also acting on
     it that frame (e.g., set a local `clickConsumed` flag and gate the move logic, or zero the
     click). Simplest: call the UI handler first and `return`/skip the rest of click handling when
     it consumes the click.
- Keep `Escape` to close panels.
- Optional convenience: hovering an unoccupied spot shows a subtle "build" pulse (already exists in
  the old code) and hovering/ selecting a tower shows its range ring.

Panel placement: draw the buy panel as a small floating popup near the selected spot's **screen**
position (`spot.x - Camera.x*?`… use the same transform as world→screen: `screenX = (worldX -
Camera.x) * ZOOM`, `screenY = (worldY - Camera.y) * ZOOM` — verify against how `render`/camera
compute it). Clamp the popup to stay on-screen. Show icon, name, cost, and grey out unaffordable
options.

### 5. Enemy pathing — add BFS to `DungeonMap`

Port the BFS from the old `BaseDefenseMap.findPath` into `DungeonMap` (or a helper module). Signature:
`findPath(startWorldX, startWorldY, endWorldX, endWorldY) -> [{x,y}...] | null` returning **world-space**
waypoint centers. Use 8-direction neighbors and `isWalkable`. Cache nothing per-enemy beyond the
returned waypoint list. The dungeon is ~80×60 tiles; BFS per spawned enemy (a handful per second) is
fine. Optionally compute the path **once per wave** from each spawn room to the base and share it
among enemies from that room.

### 6. Render — `renderFrame()` defense branch

```
if (gameState === 'defense') {
  if (!defenseGame || !localPlayer) { clear screen; return; }
  render(entities, projectiles, map, localPlayer);   // dungeon + hero + enemies + projectiles + player HUD
  // world-space overlay (base crystal, tower spots, towers, tower range rings, tower projectiles):
  ctx.save(); applyCameraTransform(ctx); drawDefenseWorld(ctx, defenseGame); ctx.restore();
  // screen-space overlay (wave/gold/base-HP bar, the contextual tower buy/upgrade panel, game over):
  drawDefenseHUD(ctx, defenseGame);
  drawDefenseTowerPanel(ctx, defenseGame);   // only if a spot/tower is selected
  drawBaseDefenseGameOver(ctx, defenseGame);
  drawMuteIndicator();
  return;
}
```

- `drawDefenseWorld` draws in **world coordinates** (the camera transform is applied), so use raw
  `tower.x/tower.y/base.x/base.y/spot.x/spot.y` (no manual `- cam` subtraction). This matches how
  entities are drawn inside `render`.
- Tower projectiles: draw them in `drawDefenseWorld` once. **Do not** also draw them in a second
  pass (the old code drew them twice).
- The base crystal: a diamond with a HP number; pulse glow (reuse old `drawBaseCrystal`).
- Tower spots: small dashed marker when unoccupied; brighter when hovered/selected.
- Wave/gold/base HUD: a compact strip (top-left or top-right) — wave `N/total`, gold, base HP bar.
  Keep it from overlapping the normal player HUD drawn by `render()` (player HP/spells are usually
  bottom/!). Verify positions in-game and nudge.

### 7. `BaseDefenseGame.update(dt)` (controller)

Keep the existing structure but base the map on `DungeonMap`:
- Wave timing/spawn queue: reuse existing logic. Spawn enemies with `spawnEnemy(type, sx, sy, map,
  currentWave)`, apply `hpMult`, push into the **global `entities`** array (pass it in, or expose a
  setter), assign `_path` to base. Spawn at `map.getEnemySpawnPoints()` (rooms) or specifically the
  room(s) nearest the dungeon edges — your call; ensure a path to base exists.
- Tower update: `for (t of towers) t.update(dt, entities, towerProjectiles)` (unchanged — it scans
  `entities` for enemies in range and fires `TowerProjectile`s).
- Tower projectile update: unchanged.
- Base damage on enemy contact (if not done in `updateDefenseEnemies`).
- Win/lose: base.hp<=0 → 'lost'; all waves cleared → 'won'.
- `placeTower(towerId, spotIndex)`, `upgradeTower(index)`, `sellTower(index)`, `getTowerAt(x,y)` —
  reuse existing implementations (they already deduct gold, mark spots occupied, etc.).

## Gotchas (already learned — honor these)

1. **`Input.mouseWorld` only updates inside `updateCamera`, and only when there is a follow target.**
   Using `setFollowTarget(localPlayer)` + calling `updateCamera(dt)` every frame makes all aiming/
   movement/placement correct. Do not skip `updateCamera`.
2. **World vs screen space.** Anything drawn after `applyCameraTransform` uses world coords. The
   tower buy panel and wave HUD are screen-space (no transform). Don't mix them up — the old fixed
   `cam={x:0,y:0}` approach left the base off-screen.
3. **No duplicate draws.** Draw tower projectiles exactly once.
4. **No invalid imports.** (A previous bug imported a non-existent `COLS` from map.js and crashed the
   whole app at module load — ES named-import errors are fatal. Only import symbols that exist.)
5. **Never leave a spawned enemy without a path** — it freezes and the wave-clear check
   (`alive enemies === 0`) never passes → softlock. Always assign at least the straight-line fallback.
6. Spells that take `map` already null-guard it, but here `map` is a real `DungeonMap`, so pass the
   real map into `executeSpell`/`tryCastSpell` (via the normal `handleInput`), not `null`.
7. Keep the base far enough from the player spawn and from tower spots that the dungeon's procedural
   layout still gives enemies a traversable corridor; validate `findPath` returns non-null for every
   spawn point at init (re-generate the floor if any spawn can't reach the base).

## Acceptance criteria / test checklist

- Selecting **Base Defense** from mode select → champion select → starts in a **procedural dungeon**
  that looks like Dungeon Crawl (rooms, corridors, dungeon tiles, sprites).
- The hero plays **identically** to Dungeon Crawl: right-click move, left-click attack/attack-move,
  basic attacks deal damage, Q/W/E/R cast with the same behavior/cooldowns, double-tap-to-rank,
  buffs/items work, the normal player HUD shows.
- A **base crystal** is visible; **waves** of enemies spawn and path through corridors to the base;
  reaching the base reduces base HP; base HP 0 → "GAME OVER" with **R to restart**; clearing all
  waves → "VICTORY".
- Only **4–6 tower spots** exist. **No persistent build bar.** Clicking a spot opens a small buy
  panel; buying places a tower and closes the panel; clicking a placed tower opens upgrade/sell;
  clicking empty ground just moves the hero (does not open any panel).
- Towers fire at and kill enemies; gold is earned per wave and spent on towers; upgrade/sell work.
- No console errors across a full run (start → several waves → win or lose → R restart).
- Camera follows the hero and stays clamped to the dungeon; mouse aiming is accurate everywhere.

## Cleanup

- Remove `src/systems/baseDefenseMap.js` (or leave unused). Remove its import.
- Remove the old persistent tower bottom-bar drawing/handling and the old fixed-camera defense
  render/update code paths that this plan replaces.
- Keep `window.__getDefenseGame`/`__getDefenseCam` debug hooks only if useful; otherwise remove.
