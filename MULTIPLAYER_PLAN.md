# Multiplayer Implementation Plan — Phase 1 (Shared World, Position Sync)

**Audience:** This document is a implementation brief for an engineer (or AI coding agent)
picking up this task cold. It assumes familiarity with JS/Canvas but NOT with this
specific codebase's internals — file paths, function names, and exact call sites are
given so the work can start immediately.

**Goal of Phase 1:** Two players (host + 1 guest) on the same LAN can connect, see the
same dungeon floor, see each other's character moving/animating/attacking around the
map, and both interact with the world (enemies, chests, stairs, shop) — but only the
**host** runs the authoritative simulation (AI, combat resolution, RNG, spell logic,
loot, floor generation). The guest is a thin client: it sends inputs, receives state
snapshots, and renders.

This avoids desync entirely (no lockstep RNG, no rollback) at the cost of the guest
having ~1 network RTT of input latency on their own actions. That tradeoff is correct
for a co-op dungeon crawler and is the standard "host-authoritative" pattern.

Phases 2 (full combat/loot sync — mostly already covered by the snapshot approach
below) and 3 (polish: reconnects, per-player shops, latency smoothing) are sketched
at the end but Phase 1 already delivers "both players visible, moving, fighting on
the same map," which is the core ask.

---

## 0. Current Architecture (read this first)

- **Project type:** Vanilla ES modules, no build step. Served via `http-server -p 8741 -c-1 .` (see `package.json`).
- **Entry point:** `src/main.js` — owns all top-level mutable state:
  - `let player = null` — the single player entity
  - `let entities = []` — player + enemies + chests, flat array
  - `let projectiles = []`
  - `let map = null` — `DungeonMap` instance (`src/systems/map.js`)
  - `let currentFloor = 1`
  - `gameLoop()` calls `tick()` → `update(dt)` → `renderFrame()` via `requestAnimationFrame`
- **Entities** are plain JS objects created by `src/entities/factory.js`:
  - `spawnPlayer(championId)` → player entity (see fields below)
  - `spawnEnemy(type, x, y, map, floorNumber)`
  - `spawnChest(x, y, floorNumber)`
  - All entities share a `nextId()` counter (`_idCounter`, reset via `resetIdCounter()`).
- **Systems** (`src/systems/`) operate on the flat `entities` array each frame:
  - `updateAI(entities, player, dt)` — `src/systems/ai.js` — **hardcoded to a single `player` reference**, every enemy behavior targets `player.x/.y` directly. This is the biggest refactor point (see §4).
  - `updateMovement(entities, map, dt)` — `src/systems/movement.js`
  - `updateCombat(entities, dt)` — `src/systems/combat.js` — generic over `entities`, handles auto-attacks for any entity with `attackTarget` set (including `type === 'player'`), so a second player entity mostly "just works" here.
  - `updateProjectiles(projectiles, entities, map, dt)` — `src/systems/projectiles.js`
  - `tryCastSpell` / `executeSpell` — `src/systems/spellcast.js`
- **Input** (`src/input.js`) — captures mouse/keyboard into a global `Input` object (`Input.mouseWorld`, `Input.leftClicked`, `Input.rightClicked`, `Input.rightClickTarget`, `Input.spellKey`, `Input.isKeyPressedThisFrame(k)`, etc.), reset each frame via `Input.resetFrame()`.
- **Rendering** (`src/render/renderer.js`, `drawHUD.js`, `drawEffects.js`, `drawEntity.js`) — draws everything in `entities`/`projectiles` relative to `Camera` (`src/camera.js`, single `_followTarget`).
- **Map generation** (`src/systems/map.js`) — `DungeonMap.generate(width, height, roomCount, hasShop)` uses `Math.random()` directly (not seeded). Produces `grid` (2D tile array), `rooms`, `stairsX/Y`, `shopX/Y`, `enemySpawns`.
- **Champion select** (`src/screens/champSelect.js`) — `showChampionSelect()` returns a Promise resolving to a `championId` string before `initGame()` runs.

### Player entity shape (from `factory.js spawnPlayer`)
Key fields you'll need to sync: `id, type:'player', championId, name, alive, state, facing, frame, animTimer, hp, maxHp, x, y, targetX, targetY, attackTarget, buffs, hitFlash, hitFlashTimer, attackCooldown, level, xp, xpToNext, skillPoints, spells {q,w,e,r}, kills, gold, inventory[8], size, color, colorDark, sprite, shield, castingKey, castingTargetX/Y, castingTimer`.

---

## 1. Architecture Decision

**Host-authoritative LAN multiplayer over WebSockets.**

- One player starts the game normally → becomes **Host**. A tiny Node WebSocket
  relay/lobby server runs locally (or on the host's machine, reachable on the LAN).
- The second player (**Guest**) connects to the host's IP, joins the same session,
  picks a champion, and gets a second player entity spawned into the host's world.
- **Host simulates everything**: map gen, AI, combat math, spells, loot, RNG, floor
  transitions. Host broadcasts a **state snapshot** ~15-20 times/sec.
- **Guest sends only intents** (inputs): mouse-world position, clicks, key presses —
  same shape as the local `Input` object. Host applies guest inputs to the guest's
  player entity exactly like it applies local `Input` to the host's player entity.
- **Guest renders** from the latest snapshot, with simple linear interpolation between
  snapshots for smooth motion (snapshots arrive every ~50-66ms; render at 60fps).

This means **no changes to game logic for correctness** — `updateCombat`, `updateAI`,
`updateMovement`, `spellcast`, etc. keep running once, on the host, over an `entities`
array that now contains 2 player entities + enemies + chests. The guest's copy of
these systems **does not run at all** — the guest is purely a renderer + input sender.

### Why not peer-to-peer / lockstep / deterministic sim on both sides?
`Math.random()` is used unseeded everywhere (AI jitter, crit rolls, loot rolls, map
gen). Making this deterministic across two JS runtimes would require threading a
seeded PRNG through ~10 files and is a much bigger, more error-prone change for no
real benefit in a 2-player co-op game. Host-authoritative is simpler, ships faster,
and is the correct architecture here.

---

## 2. New Components

### 2.1 `server/index.js` (new file, new `server/` directory)

A minimal Node WebSocket relay using the `ws` package (add to `package.json`
`dependencies`). Responsibilities:

- Listen on a configurable port (default `8742`).
- Maintain a single "room" (Phase 1 = 1 room, 2 players max; can generalize later).
- Relay JSON messages between connected clients **without inspecting game content** —
  it's a dumb pipe. The host's browser tab IS the authority; the Node server just
  forwards bytes between host ⟷ guest.
- Track which connected client is "host" (first to connect / first to send
  `{type:'hello', role:'host'}`) vs "guest".
- On guest disconnect: notify host (`{type:'peerLeft'}`). On host disconnect: notify
  guest (`{type:'hostLeft'}`) so the guest can show "Host disconnected" and return to
  menu.

```js
// server/index.js — minimal WS relay
import { WebSocketServer } from 'ws';

const PORT = process.env.MP_PORT || 8742;
const wss = new WebSocketServer({ port: PORT });

let host = null;
let guest = null;

wss.on('connection', (ws) => {
    ws.on('message', (data) => {
        let msg;
        try { msg = JSON.parse(data); } catch { return; }

        if (msg.type === 'hello') {
            if (msg.role === 'host') {
                host = ws;
                ws._role = 'host';
            } else {
                if (host == null) {
                    ws.send(JSON.stringify({ type: 'error', message: 'No host available' }));
                    ws.close();
                    return;
                }
                guest = ws;
                ws._role = 'guest';
                host.send(JSON.stringify({ type: 'peerJoined' }));
                ws.send(JSON.stringify({ type: 'joined' }));
            }
            return;
        }

        // Relay everything else to the other side
        const target = ws._role === 'host' ? guest : host;
        if (target && target.readyState === target.OPEN) {
            target.send(data); // forward raw string, no re-parse needed
        }
    });

    ws.on('close', () => {
        if (ws === host) {
            host = null;
            if (guest) guest.send(JSON.stringify({ type: 'hostLeft' }));
        } else if (ws === guest) {
            guest = null;
            if (host) host.send(JSON.stringify({ type: 'peerLeft' }));
        }
    });
});

console.log(`Multiplayer relay listening on ws://0.0.0.0:${PORT}`);
```

Add npm script: `"mp-server": "node server/index.js"`. Add `"ws": "^8.18.0"` to
`dependencies`. The host player runs `npm run mp-server` in a second terminal (or it
can be auto-spawned — see §6 Future Work) alongside `npm start`.

> **LAN-only note:** for play across the same WiFi/LAN, the guest connects to
> `ws://<host-LAN-IP>:8742`. For play over the internet, the host would need port
> forwarding or a relay with a public address — out of scope for Phase 1, call this
> out to the user explicitly when Phase 1 ships.

### 2.2 `src/network.js` (new file, client-side)

Exports a small pub/sub networking module used by both host and guest tabs:

```js
// src/network.js — WebSocket client wrapper for host/guest roles
let socket = null;
let role = null; // 'host' | 'guest' | null
let connected = false;
const listeners = new Map(); // type -> [callbacks]

export function getRole() { return role; }
export function isConnected() { return connected; }
export function isMultiplayer() { return role !== null; }

export function connect(url, asRole) {
    return new Promise((resolve, reject) => {
        socket = new WebSocket(url);
        role = asRole;
        socket.onopen = () => {
            socket.send(JSON.stringify({ type: 'hello', role }));
            connected = true;
            resolve();
        };
        socket.onerror = (e) => reject(e);
        socket.onclose = () => {
            connected = false;
            emit('disconnected', {});
        };
        socket.onmessage = (ev) => {
            let msg;
            try { msg = JSON.parse(ev.data); } catch { return; }
            emit(msg.type, msg);
        };
    });
}

export function send(type, data) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type, ...data }));
}

export function on(type, cb) {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(cb);
}

function emit(type, msg) {
    for (const cb of listeners.get(type) || []) cb(msg);
}

export function disconnect() {
    if (socket) socket.close();
    socket = null;
    role = null;
    connected = false;
}
```

---

## 3. Network Protocol (message types)

All messages are JSON objects with a `type` field, sent over the single WS connection
(relayed host↔guest by `server/index.js`).

### Guest → Host

| type | payload | sent when |
|---|---|---|
| `join` | `{ championId }` | once, after guest picks champion in champ-select |
| `input` | `{ seq, mouseWorld:{x,y}, leftClicked, rightClicked, rightClickTarget:{x,y}\|null, isAttackMove, attackMoveTarget:{x,y}\|null, spellKey:'q'\|'w'\|'e'\|'r'\|null, clickedEntityId:number\|null, keysDown:string[] (for digits 1-8, 'm', 'f', ' ') }` | every guest frame (~60Hz), throttled to ~30Hz on the wire is fine |

### Host → Guest

| type | payload | sent when |
|---|---|---|
| `mapData` | `{ floor, width, height, grid:number[][] (or RLE/base64-packed), rooms, stairsX, stairsY, shopX, shopY, hasShop }` | on game start and every floor transition |
| `spawnAssign` | `{ playerId, championId, spawnX, spawnY }` | once, after `join`, tells guest which entity id is "their" player |
| `snapshot` | see §3.1 below | ~15-20Hz |
| `event` | `{ kind: 'floatText'\|'deathParticles'\|'shake'\|..., ...kindSpecificData }` | as one-off VFX events occur (so guest plays the same particle bursts/screen shake the host sees) |
| `floorBanner` | `{ floor }` | on `descendFloor()` |
| `shopOpen` / `shopClose` | `{ playerId, items? }` | when either player opens/closes the shop (Phase 1: shop is host-only convenience; Phase 3 makes it per-player) |
| `gameOver` | `{ playerId, victory, kills, floor, gold }` | when a player entity dies / win condition |

### 3.1 `snapshot` payload (the core sync message)

Sent by the host every ~50-66ms. Contains **everything the guest needs to render**:

```js
{
  type: 'snapshot',
  tick: number,           // monotonically increasing host tick counter
  players: [
    {
      id, championId, x, y, facing, state, frame,
      hp, maxHp, shield, level, gold, kills, currentFloor,
      castingKey, castingTargetX, castingTargetY, castingTimer,
      spells: { q: {id,cooldown,maxCooldown,rank}|null, w:..., e:..., r:... },
      skillPoints, xp, xpToNext, inventory: [...8 slots...],
      buffs: [{id, duration, maxDuration}],
      isTargeted, attackTargetId, hitFlash,
    },
    // ... one entry per player (host + guest)
  ],
  enemies: [
    { id, enemyType, name, elite, x, y, facing, state, frame, hp, maxHp,
      alive, deathTimer, isTargeted, attackTargetId, hitFlash, mark: {...}|null }
  ],
  chests: [
    { id, x, y, alive, deathTimer, _isChest: true }
  ],
  projectiles: [
    { id, type, x, y, color, size, hazardType?, wallLength?, angle?, lifeTimer? }
  ],
  floatingTexts: [ { x, y, text, color, size, life } ], // from getFloatingTexts()
  comboCount: number,
}
```

**Important:** the guest does NOT need `vx/vy`/internal AI fields — only what's needed
to draw. Keep this payload lean; it's sent ~20x/sec.

---

## 4. File-by-File Changes

### 4.1 `src/entities/factory.js`
- No structural change to `spawnPlayer` — it already returns a self-contained entity.
- Add an optional `id` override param so the host can assign the **guest's player
  entity an id that matches across host/guest** (the guest needs to know "which
  entity in the snapshot is me"). Simplest: host calls `spawnPlayer(championId)`
  for the guest too (host generates the id via its own `nextId()` counter), then
  sends that id back to the guest in `spawnAssign`.

### 4.2 `src/main.js` — the big one

Replace the single `let player = null` model with:

```js
let localPlayer = null;   // the entity THIS browser tab controls/follows
let players = [];         // all player-type entities (1 in solo, 2 in MP)
let entities = [];         // localPlayer/players + enemies + chests (unchanged shape)
```

In **solo mode**, `players = [localPlayer]` and everything behaves exactly as today.

#### Host-specific changes
1. After `initGame(championId)`:
   - If `network.getRole() === 'host'`, send `mapData` (serialize `map.grid`,
     `map.rooms`, `stairsX/Y`, `shopX/Y`, `hasShop`, `currentFloor`).
   - Wait for `join` from guest (or allow solo-start and hot-join later — Phase 1
     can require both players present before `initGame` runs, simplest).
   - On `join`: `const guestPlayer = spawnPlayer(guestChampionId); guestPlayer.x = spawn.x; guestPlayer.y = spawn.y; entities.push(guestPlayer); players.push(guestPlayer);`
     then `network.send('spawnAssign', { playerId: guestPlayer.id, championId, spawnX, spawnY })`.
2. Each frame, in `update(dt)`:
   - Build the **guest's `Input`-equivalent** from the latest `input` message
     received over the network (buffer the latest one per tick — don't queue/replay,
     just use most-recent — this is fine for a real-time game).
   - Call a refactored `handleInput(playerEntity, inputSource)` once for
     `localPlayer` (with `inputSource = Input`, the real global) and once for the
     guest's entity (with `inputSource = latestGuestInput`).
   - `handleInput` must be refactored to take `inputSource` instead of reading the
     global `Input` directly (see §4.4).
3. `updateAI`, `updateCombat`, `updateMovement`, `updateProjectiles`, etc. already
   iterate `entities` — just make sure `entities` includes both player entities.
   **`updateAI` needs the multi-player refactor (§4.5)**.
4. At the end of `update(dt)`, if host: build and `network.send('snapshot', {...})`
   from `entities`/`projectiles`/`getFloatingTexts()`/`getComboCount()`. Throttle to
   every 3rd frame (~20Hz at 60fps).
5. Floor transitions (`descendFloor`): after regenerating, re-send `mapData` and
   reposition the guest's entity to `spawn` too, include in next snapshot.
6. Shop: Phase 1 — only host can open shop (guest sees a "host is shopping" message
   or shop is simply local-only and doesn't block guest). Defer per-player shop to
   Phase 3.

#### Guest-specific changes
1. Guest's `start()` flow: after champion select, **don't call `initGame()`**.
   Instead: `network.send('join', { championId })`, wait for `mapData` +
   `spawnAssign`, construct a local `map` from the received grid (just enough to
   render tiles + run `setMapBounds`/`setFollowTarget` — guest's `DungeonMap` can be
   a lightweight object with just `grid`, `width`, `height`, `rooms`, `stairsX/Y`,
   `shopX/Y`, `isOnStairs/isOnShop/getTileAt` methods reading from `grid`).
2. Guest's `entities`/`projectiles`/etc. arrays are **replaced wholesale** each time
   a `snapshot` arrives (or interpolated — see §5). Guest's `localPlayer` is
   `entities.find(e => e.id === assignedPlayerId)`.
3. Guest's `update(dt)`:
   - Skip ALL simulation calls (`updateCombat`, `updateAI`, `updateMovement`,
     `updateProjectiles`, `tryCastSpell/executeSpell`, regen, item effects, mark
     handling, death/loot cleanup — none of it runs on guest).
   - Still run: `Input` polling → build an input packet → `network.send('input', {...})`
     every frame (or every other frame).
   - Still run: `updateCamera(dt)` (follows guest's own `localPlayer`),
     `updateParticles(dt)` (for locally-spawned VFX from `event` messages),
     `tickEntityFrame` is **not needed** if the host sends `frame`/`state` directly
     in the snapshot (simplest — avoids re-deriving animation state).
   - Apply `event` messages (floatText, deathParticles, shake) by calling the same
     `spawnFloatText`/`spawnDeathParticles`/`shake` functions the host calls, so VFX
     looks identical.
4. Guest's `renderFrame()` — unchanged, just renders whatever is in
   `entities`/`projectiles`/`map` (which now come from the network instead of local
   sim).
5. Guest's HUD (`drawHUD`) renders `localPlayer` (the guest's own entity from the
   snapshot) — already works since `drawHUD(ctx, player, ...)` just reads fields.

#### New: connection/lobby screen
Add `src/screens/mpLobby.js` (modeled on `champSelect.js`'s overlay pattern):
- After champion select, show "Host Game" / "Join Game" / "Play Solo" buttons.
- Host Game → `network.connect('ws://localhost:8742', 'host')`, show "Waiting for
  player... your IP is shown in console / share with your brother", proceed to
  `initGame()` immediately on host side (host can play solo until guest joins —
  guest entity is added dynamically on `join`).
- Join Game → prompt for host IP (text input or just default `ws://<lan-ip>:8742`),
  `network.connect(url, 'guest')`, then wait for `mapData`+`spawnAssign`.
- Play Solo → current behavior, `network` module never connects, `isMultiplayer()`
  is false everywhere, zero behavior change.

### 4.3 `src/systems/map.js` — guest-side lightweight map
Add a static/alt constructor path: `DungeonMap.fromSnapshot(data)` that sets
`grid, width, height, rooms, stairsX, stairsY, shopX, shopY, hasShop` directly from
the `mapData` payload (skip `generate()` entirely). All the read-only methods
(`isWalkable`, `isWorldWalkable`, `getTileAt`, `isOnStairs`, `isOnShop`,
`worldToTile`) work unchanged since they only read `this.grid`/`this.width`/etc.

`grid` is `number[][]` — JSON-serializable as-is. For a 80x60 tile map that's ~4800
numbers (~15-20KB as JSON) — fine to send once per floor, not per-frame.

### 4.4 `src/main.js` — `handleInput` refactor
Current signature: `function handleInput()` reads the global `Input` and mutates the
global `player`. New signature:

```js
function handleInput(playerEntity, inputSource, entityList, mapRef) {
    // body is the same as today's handleInput, but:
    //   - every `player.` becomes `playerEntity.`
    //   - every `Input.` becomes `inputSource.`
    //   - every `entities` becomes `entityList`
    //   - every `map` becomes `mapRef`
}
```

Call sites:
- Host, local player: `handleInput(localPlayer, Input, entities, map)`
- Host, guest player: `handleInput(guestPlayer, latestGuestInput, entities, map)`
- Guest: not called at all (guest doesn't simulate).

`latestGuestInput` must have the **same shape** as `Input` for the fields `handleInput`
reads: `spellKey`, `mouseWorld`, `leftClicked`, `rightClicked`, `rightClickTarget`,
`clickedEntity` (note: this one is an **entity reference** locally — over the network
it's an id, so the host must resolve `clickedEntityId` → `entities.find(e=>e.id===...)`
before constructing `latestGuestInput`), `isAttackMove`, `attackMoveTarget`,
`isKeyPressedThisFrame(k)` (implement as `(k) => latestGuestInputRaw.keysDown.includes(k)`).

Build a small adapter:
```js
function makeRemoteInputSource(raw, entities) {
    return {
        spellKey: raw.spellKey,
        mouseWorld: raw.mouseWorld,
        leftClicked: raw.leftClicked,
        rightClicked: raw.rightClicked,
        rightClickTarget: raw.rightClickTarget,
        clickedEntity: raw.clickedEntityId != null ? entities.find(e => e.id === raw.clickedEntityId) : null,
        isAttackMove: raw.isAttackMove,
        attackMoveTarget: raw.attackMoveTarget,
        isKeyPressedThisFrame: (k) => (raw.keysDown || []).includes(k),
    };
}
```

Also check `setHoveredEntity`/`setClickedEntity` (from `src/input.js`) — these mutate
global `Input` state and are called inside `handleInput` for the **local** hover
hit-test. For the remote player's input source, the hover hit-test inside
`handleInput` (lines ~504-519 in current `main.js`) would incorrectly call
`setHoveredEntity`/`setClickedEntity` (global, meant for local UI). **Guard this
block**: only run the hover hit-test + `setHoveredEntity`/`setClickedEntity` calls
when `inputSource === Input` (i.e., for the local player). The guest's
`clickedEntityId` is computed guest-side (the guest DOES run its own hover hit-test
against its locally-rendered `entities` for cursor feedback) and sent as part of the
`input` packet — host just resolves the id, doesn't need to re-hit-test.

### 4.5 `src/systems/ai.js` — multi-player targeting refactor
Currently every behavior function signature is `function behaviorX(entity, player, dt, ...)`
and reads `player.x/.y` directly. `updateAI(entities, player, dt)` is called once from
`main.js` with the single global `player`.

**Minimal viable change** (avoid touching every behavior function body):
- Change `updateAI(entities, players, dt)` to accept the **array** of player
  entities.
- At the top of `updateAI`, for each enemy entity, compute
  `const target = nearestAlivePlayer(entity, players);` (helper: filter
  `players.filter(p=>p.alive)`, pick min `Math.hypot(p.x-entity.x, p.y-entity.y)`,
  fall back to `players[0]` if all dead — combat will be moot at that point anyway).
- Pass `target` into the existing per-behavior functions **in place of** `player`.
  Since every behavior function already takes a `player` param and only reads
  `.x/.y/.alive` etc. off it, **renaming the call-site argument from `player` to
  `target` requires zero changes inside the behavior functions** — they're generic
  over "the thing with x/y/alive" already. Just change the call sites inside
  `updateAI` from `behaviorX(entity, player, dt)` to `behaviorX(entity, target, dt)`.
- `main.js` call site becomes `updateAI(entities, players, dt)` where
  `players = entities.filter(e => e.type === 'player')`.

This means: each enemy independently targets whichever player is closer. Good enough
for Phase 1 co-op. (A "taunt"/aggro-lock system is a nice-to-have for later, not
required.)

**Verify**: grep `ai.js` for any place that assumes `entities` contains exactly one
player when filtering (e.g. `entities.find(e => e.type === 'player')` instead of
using the passed-in `player`/`target`) — fix any such spots to use the
nearest-player logic too. (From the earlier grep, lines 32 and 69 just *exclude*
player entities from enemy-vs-enemy loops — those are fine as-is, `e.type==='player'`
correctly excludes BOTH player entities.)

### 4.6 `src/systems/combat.js`, `movement.js`, `projectiles.js`, `spellcast.js`
- `updateCombat(entities, dt)`: generic, iterates all entities with `attackTarget` —
  works for 2 players unchanged. Double-check `_comboCount`/`_comboTimer` (module-level
  globals, shared "combo" state) — decide if combo tracking should be per-player. For
  Phase 1, leave as a shared/host-global stat (cosmetic only); revisit in Phase 3 if
  it looks wrong with 2 players attacking simultaneously.
- `updateMovement`, `updateProjectiles`: generic over `entities`/`projectiles`,
  should work unchanged.
- `tryCastSpell`/`executeSpell`: take `caster` as a param already (not a global) —
  confirm by reading `src/systems/spellcast.js` signatures; should be fine to call
  once per player per frame on the host.
- `getPendingProjectiles()` / `getPendingEnemyProjectiles()`: module-level queues
  drained once per frame — fine, host drains them once after processing both
  players' casts.

### 4.7 `src/render/renderer.js`, `drawHUD.js`, `drawEntity.js`
- `render(entities, projectiles, map, player)` — the `player` param is used for
  camera-relative stuff / HUD. Change to `render(entities, projectiles, map,
  localPlayer)` — i.e., always pass the **local** player (whichever entity this tab
  controls), not "the host's player". HUD continues to show only `localPlayer`'s
  stats/spells/inventory — correct, each tab shows its own HUD.
- The other player's entity is just another entry in `entities` and should already
  render via the normal entity-drawing path (sprite, hp bar, name) — verify
  `drawEntity.js` doesn't special-case "skip if entity === player" in a way that
  would hide the second player. If it does (e.g. to avoid double-drawing the local
  player's own healthbar redundantly with the HUD), make sure that special-case is
  keyed off `entity === localPlayer`, not `entity.type === 'player'`.
- `drawEnemyBars` / minimap (`drawMinimap`) — confirm they iterate `entities` for
  enemies and won't choke on a second player entity (they filter `type !== 'player'`
  already per earlier reads — should be fine, just double check the minimap doesn't
  *also* need to show the teammate's blip — nice-to-have: add a small colored dot for
  the other player on the minimap using their `color` field).

### 4.8 `src/camera.js`
No change needed — each browser tab has its own `Camera` singleton and its own
`setFollowTarget(localPlayer)`. Host follows host's entity, guest follows guest's
entity. Confirmed `Camera` is a plain exported singleton object, not tied to a
specific entity id.

---

## 5. Snapshot Interpolation (guest-side smoothness)

Snapshots arrive ~every 50-66ms but the guest renders at 60fps (~16ms). Two options,
pick the simpler for Phase 1:

**Option A (simplest, do this first):** Guest directly sets entity positions from
the latest snapshot (no interpolation). At 20Hz updates this produces visible
"stepping" for fast-moving entities but is correct and trivial. Ship this first,
verify everything else works, THEN consider Option B if motion looks too choppy.

**Option B (nice-to-have polish):** Buffer the last 2 snapshots
(`prevSnapshot`, `nextSnapshot` with timestamps), and each render frame compute
`t = (now - nextSnapshot.recvTime) / snapshotInterval`, lerp `x/y` between
`prevSnapshot` and `nextSnapshot` positions per-entity-id. This is the standard
"entity interpolation" technique — implement as a pure function
`interpolateEntities(prev, next, t)` returning a synthetic `entities` array for
rendering only (the "real" `entities` from `nextSnapshot` is what `localPlayer`
input/camera logic uses).

Phase 1 acceptance: ship with Option A. Note Option B as a follow-up.

---

## 6. Implementation Order (step-by-step)

1. **`server/index.js`** + add `ws` dependency + npm script. Test standalone with
   `wscat` or a tiny test script (2 connections, verify relay).
2. **`src/network.js`** — connect/send/on/disconnect. Unit-test in browser console
   against the running relay (two tabs, manually `connect()`, `send()`, observe
   relay).
3. **Refactor `main.js`: introduce `players` array and `localPlayer`**, but keep
   solo mode working identically (`players = [player]`, `localPlayer = player`,
   everything else unchanged). Run the game solo, confirm no regressions. **This is
   the safest checkpoint — commit here.**
4. **Refactor `handleInput` to take `(playerEntity, inputSource, entityList, mapRef)`**
   per §4.4, update the solo call site to `handleInput(localPlayer, Input, entities, map)`.
   Confirm solo still works identically. **Commit.**
5. **`ai.js` multi-player targeting** per §4.5. Since solo mode has `players.length
   === 1`, "nearest player" degenerates to the same single target — confirm solo
   behavior is byte-identical (enemies still chase/attack the one player). **Commit.**
6. **`DungeonMap.fromSnapshot()`** in `map.js` — write it, but it's unused until step 8.
7. **Lobby screen** (`src/screens/mpLobby.js`) wired into `start()` after champion
   select — "Solo" path is default/unchanged; "Host"/"Join" paths just call
   `network.connect()` and set `role`. For now, Host/Join can be stubbed to fall
   through to solo if you want to land this incrementally.
8. **Host-side networking**: serialize `mapData` on `initGame`/`descendFloor`, handle
   `join` → spawn guest entity, handle `input` messages → feed into
   `handleInput(guestPlayer, makeRemoteInputSource(...), entities, map)`, build +
   send `snapshot` at ~20Hz.
9. **Guest-side networking**: on `mapData`/`spawnAssign`, construct `map` via
   `fromSnapshot`, set `localPlayer = entities.find(...)`, set up `setFollowTarget`,
   skip all sim calls in `update(dt)`, send `input` packets, apply `snapshot` →
   replace `entities`/`projectiles`, apply `event` messages.
10. **`event` messages for VFX parity** — wrap `spawnFloatText`, `spawnDeathParticles`,
    `shake` call sites on the host so they also `network.send('event', {...})`; guest
    listens and replays them locally.
11. **End-to-end test**: two browser windows on the same machine (or two machines on
    same LAN), one Host one Join, walk around, fight enemies, open chests, descend
    stairs, confirm both views stay in sync and both players are visible/animated to
    each other.

---

## 7. Edge Cases & Open Questions for Phase 1

- **Guest joins mid-floor with enemies already engaged**: `mapData` + a full
  `snapshot` immediately after `join` should be enough — the guest just starts
  rendering whatever state exists.
- **Host dies / guest dies**: Phase 1 — if either player dies, do NOT end the whole
  session (current solo code sets `gameState = 'gameOver'` on `!player.alive`). For
  MP, change the death check to only trigger `gameOver` for `localPlayer`'s own
  death on each tab independently, OR (simpler for Phase 1) require BOTH players
  dead before `gameOver`. Decide and document; either is acceptable for v1 — flag
  this explicitly in the PR description.
- **Stairs/floor transition**: only the host should be able to trigger
  `descendFloor()` (avoid both players triggering it independently and double-
  advancing). Guest pressing F/Space on stairs sends the input, but
  `descendFloor()` itself only runs in the host's `update()` — guest's "press F"
  just becomes a no-op input flag that the host's copy of the floor-transition
  check (currently keyed off `Input.isKeyPressedThisFrame`) should also check for
  the guest's player standing on stairs. Simplest v1: **either player on the stairs
  tile + either player presses F** → host descends, repositions BOTH players, and
  re-sends `mapData`.
- **Shop**: Phase 1 — host-only (guest sees nothing special, or a small "🛒 Host is
  shopping" toast via an `event` message). Phase 3: proper per-player shop overlay
  driven by `shopOpen`/`shopClose`/item-purchase messages.
- **Disconnect mid-game**: guest disconnect → host keeps playing solo (remove guest
  entity from `entities`/`players`, or freeze it in place — freezing is simpler and
  lets the guest reconnect and resume... but reconnection/session-resume is Phase 3.
  For Phase 1, on `peerLeft`, host removes the guest's entity from `entities`).
  Host disconnect → guest gets `hostLeft`, show a message, return to menu.

---

## 8. Testing Checklist

- [ ] Solo mode (no network) is pixel-identical to pre-change behavior after each of
      steps 3-5 above (regression check).
- [ ] Two tabs on `localhost` (host on `ws://localhost:8742`, guest on
      `ws://localhost:8742`) — both spawn on the same floor, see each other.
- [ ] Guest movement (right-click move, attack-move, attack-click on enemy) is
      reflected on host's view within ~1 snapshot interval.
- [ ] Guest's spell casts (Q/W/E/R) show correct cast indicators + effects on both
      tabs.
- [ ] Enemies correctly choose to chase/attack whichever player is closer.
- [ ] Chest loot, gold, kills, XP/level-up apply to the correct player only.
- [ ] Floor transition moves both players to the new floor's spawn and both receive
      the new `mapData`.
- [ ] Closing the guest tab doesn't crash the host; host can continue playing.
- [ ] Two machines on the same WiFi: guest connects to host's LAN IP successfully.

---

## 9. Explicitly Out of Scope for Phase 1

- Internet play without manual port forwarding / external relay.
- More than 2 players.
- Per-player shops/inventories shown simultaneously (host-only shop for now).
- Reconnect/resume after disconnect.
- Entity interpolation (Option B in §5) — only if time permits after Option A ships
  and feels choppy.
- Voice/text chat.
- Anti-cheat / input validation on the host (trusting the LAN peer is fine for
  co-op with your brother).

---

## Appendix: Cloud Deployment (Play Over the Internet)

By default `DEFAULT_SERVER` in `src/screens/mpLobby.js` is `ws://localhost:8742`,
which only works on the same LAN. To play with someone remote, deploy the relay
(`server/index.js`) to a free Render Web Service:

1. Push this repo to GitHub (already done).
2. On https://render.com, click **New > Web Service**, connect this repo. Render
   will detect `render.yaml` and use it automatically (build: `npm install`,
   start: `npm run mp-server`).
3. Render assigns a public URL like `https://dungeon-crawler-relay.onrender.com`
   and injects `PORT` — `server/index.js` already reads `process.env.PORT`.
4. In the game's multiplayer lobby, both host and guest enter the relay's `wss://`
   address in the server URL field, e.g.
   `wss://dungeon-crawler-relay.onrender.com` (note `wss`, not `ws`, since Render
   terminates TLS).
5. Note: Render's free tier spins down after inactivity — the first connection
   after idling may take ~30s while it wakes up.
