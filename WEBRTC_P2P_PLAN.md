# WebRTC P2P Networking — Implementation Plan

**Audience:** This document is an implementation brief for an AI coding agent
(e.g. DeepSeek Reasoner) picking up this task cold. It assumes familiarity with
JS and WebRTC APIs but NOT with this specific codebase — file paths, function
names, message types, and exact call sites are given so work can start
immediately. Read this whole document before editing anything.

**Goal:** Replace the current "every message round-trips through a cloud relay"
transport with a **direct WebRTC `RTCDataChannel`** between the host's and
guest's browsers, while keeping the existing WS relay around as a tiny
**signaling server only**. This removes the relay from the game's hot path
(`input` → host → `snapshot` → guest), cutting latency from "relay RTT" down to
"direct internet RTT between the two players" — typically a large improvement,
especially when the relay is a free-tier cloud host far from both players.

**Non-goal:** This is NOT a rewrite of the game's networking *protocol*. The
message types (`hello`, `input`, `snapshot`, `mapData`, `champSelect`,
`peerJoined`, `joined`, `peerLeft`, `hostLeft`, `error`, etc.) and their
payloads stay exactly as they are. Only the **transport** underneath
`send()`/`on()` in `src/network.js` changes. `src/main.js` and every other
game-logic file should require **zero changes**.

---

## 0. Current Architecture (read this first)

- `server/index.js` — a Node WebSocket relay (`ws` package). Tracks one `host`
  and one `guest` socket. On `{type:'hello', role:'host'|'guest'}` it tags the
  socket. For any other message, it does `target.send(JSON.stringify(msg))`
  where `target` is "the other side" — i.e. it's a **dumb bidirectional pipe**
  that re-stringifies JSON so it's always a text frame. This relay is deployed
  to Render at `wss://dungeon-crawler-waht.onrender.com` (see `render.yaml`)
  and can also run locally via `npm run mp-server` (`ws://localhost:8742`).

- `src/network.js` — the **only** module `main.js` talks to for networking.
  Public API (must be preserved exactly):
  ```js
  export function getRole()        // 'host' | 'guest' | null
  export function isConnected()    // boolean
  export function isMultiplayer()  // role !== null
  export function connect(url, asRole)  // returns Promise, resolves on open
  export function send(type, data)      // sends {type, ...data} as JSON
  export function on(type, cb)           // subscribe to message type
  export function off(type, cb)          // unsubscribe
  export function disconnect()
  ```
  Internally today it's ~50 lines wrapping a single `WebSocket`.

- `src/main.js` calls `connect()`, `send()`, `on()`, `isConnected()`,
  `getRole()`, `isMultiplayer()`, `disconnect()` — see grep results below for
  every call site (line numbers approximate, re-grep before editing):
  - `connect(wsUrl, 'host')` / `connect(wsUrl, 'guest')` — once, in
    `startMultiplayerHost()` / `startMultiplayerGuest()`.
  - `on('peerJoined', ...)`, `on('champSelect', ...)`, `on('input', ...)`,
    `on('peerLeft', ...)` — host side.
  - `on('mapData', ...)`, `on('snapshot', ...)`, `on('hostLeft', ...)`,
    `on('joined', ...)` — guest side.
  - `send('mapData', ...)`, `send('champSelect', ...)`, `send('input', ...)`
    (x2, guest), `send('snapshot', ...)` (host, ~15Hz).
  - `isConnected()` guards around `mpIsHost`/`mpIsGuest` sends.

- `src/screens/mpLobby.js` — lobby UI. `DEFAULT_SERVER` constant holds the
  relay URL (`wss://dungeon-crawler-waht.onrender.com`). User can override it
  in a text field. Returns `{ role, wsUrl }`.

**Key insight:** because `network.js` is a thin abstraction with a tiny,
already-decoupled API, the entire WebRTC migration can happen **inside
`network.js` alone**, plus a new helper module for the WebRTC plumbing, plus a
handful of new "signaling" message types that pass through the *existing*
relay unchanged (it already relays "everything else" generically — no server
code changes are needed for basic signaling).

---

## 1. Target Architecture

```
┌─────────┐   1. WS signaling (small, rare)   ┌─────────┐
│  Host   │ ───────────────────────────────► │  Relay  │
│ browser │ ◄─────────────────────────────── │ (Render │
└────┬────┘                                   │ or LAN) │
     │                                        └────┬────┘
     │ 2. SDP offer/answer + ICE candidates         │
     │    relayed via WS (steps above)              │
     │                                               │
     │         3. Direct RTCDataChannel             │
     └──────────────◄────────────────────►─────────┘
              (input / snapshot / champSelect / mapData
               — ALL game traffic, once established)
```

1. Both peers connect to the WS relay as today (`hello` handshake — unchanged).
2. Once both are present (`peerJoined`/`joined`), they perform a WebRTC
   offer/answer + ICE candidate exchange **using the WS relay purely as a
   signaling channel** (new message types `rtc-offer`, `rtc-answer`,
   `rtc-ice` — these just flow through the relay's existing generic
   "relay everything else" branch, no server changes required).
3. Once the `RTCDataChannel` opens on both sides, `network.js` **switches its
   internal transport** from the WebSocket to the data channel. All subsequent
   `send()` calls for game messages (`input`, `snapshot`, `mapData`,
   `champSelect`, etc.) go directly peer-to-peer.
4. The WS connection to the relay is **kept open** (don't call
   `ws.close()`) for:
   - Detecting peer disconnect (`peerLeft`/`hostLeft` — relay still sees the
     socket close even if P2P is the active transport).
   - ICE restart / renegotiation if the P2P link drops mid-game.
   - **Fallback**: if the data channel never reaches `open` within a timeout
     (symmetric NAT, no TURN — see §6), keep using the WS relay as transport,
     exactly like today. The game must work identically in this case — P2P is
     a pure optimization, never a hard requirement.

---

## 2. New Module: `src/webrtc.js`

Create this file. It owns the `RTCPeerConnection` and `RTCDataChannel`, and
exposes a minimal interface to `network.js`. It does **not** know about game
message types — it's a generic "give me a reliable ordered data channel
between these two WS-connected peers" helper.

```js
// webrtc.js — establishes a direct RTCDataChannel between host and guest,
// using an existing WebSocket connection purely for SDP/ICE signaling.

const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // Optional TURN fallback — see §6. Leave empty array if not configured.
];

const DATACHANNEL_OPEN_TIMEOUT_MS = 8000;

/**
 * @param {WebSocket} signalingSocket - already-open WS to the relay
 * @param {'host'|'guest'} role - host creates the offer, guest answers
 * @param {(msg: any) => void} sendSignal - call to send a signaling message
 *        over the existing WS (network.js wires this to its own send-on-ws)
 * @returns {Promise<RTCDataChannel>} resolves when the channel is open,
 *          rejects (or times out) if P2P could not be established —
 *          caller should fall back to WS-relay transport on rejection.
 */
export function establishP2P(role, sendSignal, onSignalMessage) {
    return new Promise((resolve, reject) => {
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        let dataChannel = null;
        let settled = false;

        const timeout = setTimeout(() => {
            if (!settled) { settled = true; cleanup(); reject(new Error('P2P timeout')); }
        }, DATACHANNEL_OPEN_TIMEOUT_MS);

        function cleanup() {
            clearTimeout(timeout);
            onSignalMessage(null); // unregister
        }

        pc.onicecandidate = (e) => {
            if (e.candidate) sendSignal({ type: 'rtc-ice', candidate: e.candidate });
        };

        // Handle incoming signaling messages (offer/answer/ice) from the relay
        onSignalMessage(async (msg) => {
            try {
                if (msg.type === 'rtc-offer') {
                    await pc.setRemoteDescription(msg.sdp);
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    sendSignal({ type: 'rtc-answer', sdp: pc.localDescription });
                } else if (msg.type === 'rtc-answer') {
                    await pc.setRemoteDescription(msg.sdp);
                } else if (msg.type === 'rtc-ice') {
                    await pc.addIceCandidate(msg.candidate).catch(() => {});
                }
            } catch (err) {
                if (!settled) { settled = true; cleanup(); reject(err); }
            }
        });

        function wireChannel(dc) {
            dataChannel = dc;
            dc.onopen = () => {
                if (!settled) { settled = true; cleanup(); resolve(dc); }
            };
            dc.onerror = () => {
                if (!settled) { settled = true; cleanup(); reject(new Error('DataChannel error')); }
            };
        }

        if (role === 'host') {
            // Host creates the data channel and the offer
            wireChannel(pc.createDataChannel('game', { ordered: true }));
            pc.createOffer()
                .then((offer) => pc.setLocalDescription(offer))
                .then(() => sendSignal({ type: 'rtc-offer', sdp: pc.localDescription }))
                .catch(reject);
        } else {
            // Guest waits for the host's data channel
            pc.ondatachannel = (e) => wireChannel(e.channel);
        }
    });
}
```

Notes / things to get right:
- `sdp: pc.localDescription` — `RTCSessionDescription` objects serialize fine
  via `JSON.stringify` (they're plain-ish objects with `type`/`sdp` strings),
  but double-check in testing; if not, send `{ type: desc.type, sdp: desc.sdp }`
  explicitly and reconstruct with `new RTCSessionDescription(...)` on the
  receiving end.
- `RTCIceCandidate` objects similarly — may need
  `new RTCIceCandidate(msg.candidate)` on the receiving end before
  `addIceCandidate`.
- ICE candidates can arrive *before* `setRemoteDescription` has been called
  (race between offer/answer and ICE messages relayed over WS, which has its
  own latency). Buffer candidates that arrive too early and apply them after
  `setRemoteDescription` resolves. (Standard "perfect negotiation" pattern —
  keep it simple: a small queue is enough for a 2-peer game, full perfect
  negotiation with renegotiation is overkill here.)
- `onSignalMessage(cb)` — the design above uses a single-slot callback
  registration (`network.js` calls it once to register, and once with `null`
  to unregister after settling). This keeps `webrtc.js` from needing its own
  event-listener bookkeeping.

---

## 3. Changes to `src/network.js`

This is the core of the migration. The public API (listed in §0) must not
change. Internally:

```js
// network.js — WebSocket signaling + optional WebRTC P2P transport
import { establishP2P } from './webrtc.js';

let socket = null;          // signaling WS (always connected while in MP)
let dataChannel = null;      // RTCDataChannel, once P2P established (or null)
let role = null;
let connected = false;        // true once EITHER transport is usable
let p2pActive = false;        // true once dataChannel is open and in use
const listeners = new Map();
const signalListeners = new Map(); // for rtc-offer/answer/ice passthrough

export function getRole() { return role; }
export function isConnected() { return connected; }
export function isMultiplayer() { return role !== null; }
export function isP2P() { return p2pActive; } // NEW — useful for UI/debug

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
            p2pActive = false;
            emit('disconnected', {});
        };
        socket.onmessage = (ev) => {
            let msg;
            try { msg = JSON.parse(ev.data); } catch { return; }

            // Signaling messages: route to webrtc.js's handler if one is
            // registered, never to game listeners.
            if (msg.type === 'rtc-offer' || msg.type === 'rtc-answer' || msg.type === 'rtc-ice') {
                const cb = signalListeners.get('signal');
                if (cb) cb(msg);
                return;
            }

            emit(msg.type, msg);

            // Once both peers have acknowledged each other's presence,
            // kick off P2P negotiation (see §3.1 for trigger choice).
            if (msg.type === 'peerJoined' || msg.type === 'joined') {
                tryEstablishP2P();
            }
        };
    });
}

function tryEstablishP2P() {
    if (p2pActive || !role) return;
    establishP2P(
        role,
        (signalMsg) => socket && socket.send(JSON.stringify(signalMsg)), // sendSignal over WS
        (cb) => { // onSignalMessage register/unregister
            if (cb) signalListeners.set('signal', cb);
            else signalListeners.delete('signal');
        },
    ).then((dc) => {
        dataChannel = dc;
        dataChannel.onmessage = (ev) => {
            let msg;
            try { msg = JSON.parse(ev.data); } catch { return; }
            emit(msg.type, msg);
        };
        dataChannel.onclose = () => {
            p2pActive = false;
            dataChannel = null;
            // Fall back to WS transport silently — connected stays true
            // as long as the WS signaling socket is still open.
        };
        p2pActive = true;
        console.log('[network] P2P data channel established');
    }).catch((err) => {
        console.log('[network] P2P unavailable, using relay fallback:', err.message);
        // Stay on WS transport — no further action needed.
    });
}

export function send(type, data) {
    const payload = JSON.stringify({ type, ...data });
    if (p2pActive && dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(payload);
        return;
    }
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
    }
}

export function on(type, cb) {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(cb);
}

export function off(type, cb) {
    const cbs = listeners.get(type);
    if (cbs) listeners.set(type, cbs.filter(c => c !== cb));
}

function emit(type, msg) {
    for (const cb of listeners.get(type) || []) cb(msg);
}

export function disconnect() {
    if (dataChannel) { try { dataChannel.close(); } catch {} }
    if (socket) socket.close();
    socket = null;
    dataChannel = null;
    role = null;
    connected = false;
    p2pActive = false;
    listeners.clear();
    signalListeners.clear();
}
```

### 3.1 When to trigger P2P negotiation

The relay already sends:
- `peerJoined` → to the **host**, when the guest connects.
- `joined` → to the **guest**, confirming it connected (sent right after
  `peerJoined` is sent to host).

Both arrive at roughly the same time on each side, which is the natural
trigger point — both peers are confirmed present on the relay, so it's safe to
start the offer/answer dance. This is what `tryEstablishP2P()` hooks into
above. No changes needed to `server/index.js` for this trigger — it already
sends both messages today.

### 3.2 Message ordering / race conditions

`main.js` calls `send('mapData', ...)`, `send('champSelect', ...)` etc.
**immediately** after `peerJoined`/`joined` fire (see `main.js` lines ~1054 and
~1122 per the grep in §0). P2P negotiation is asynchronous (offer/answer/ICE
takes anywhere from ~50ms to a few seconds). This means:

- Early game messages (`champSelect`, `mapData`) will very likely be sent over
  the **WS relay** (because `p2pActive` is still `false` at that point) — this
  is **fine and correct**, they're one-shot/rare messages.
- Once P2P comes up mid-flight, `send()` automatically switches to the data
  channel for everything after — including the ~15Hz `snapshot`/`input`
  stream, which is exactly the traffic we want off the relay.
- **No message ordering guarantee is needed across the transport switch** —
  game messages are either idempotent snapshots/inputs (order within a single
  transport is preserved by both WS and an `ordered: true` RTCDataChannel,
  which is all the game logic relies on) or one-shot handshake messages sent
  before the switch happens. Do not add complexity to "migrate in-flight
  messages" — there's nothing to migrate.

---

## 4. Changes to `server/index.js`

**Minimal — likely none required for the core flow**, because the relay
already does `target.send(JSON.stringify(msg))` for "everything else" — i.e.
`rtc-offer`/`rtc-answer`/`rtc-ice` messages will be relayed automatically by
the existing generic branch (lines ~35-42 in the current file).

Double-check one thing while implementing: the relay does
`JSON.parse(data)` then `JSON.stringify(msg)` — i.e. it round-trips through a
parsed object, not a raw passthrough. As long as `RTCSessionDescriptionInit`
and `RTCIceCandidateInit` payloads are plain JSON-serializable objects (they
are, per MDN — `{type, sdp}` and
`{candidate, sdpMid, sdpMLineIndex, usernameFragment}`), this round-trip is
lossless. **No server code changes needed.** If testing reveals an issue,
the only acceptable fix is adding `rtc-offer`/`rtc-answer`/`rtc-ice` to a
passthrough allowlist if one ever gets added — but today's relay has no such
allowlist, so this should just work.

---

## 5. Changes to `src/main.js`

**Goal: zero changes.** Verify this assumption by checking every `network.js`
call site still behaves correctly:

- `connect(wsUrl, 'host'|'guest')` — unchanged signature/behavior (still
  resolves once WS signaling connects; P2P upgrade happens later,
  asynchronously, transparently).
- `send(type, data)` — unchanged signature; internally may route to data
  channel instead of WS, but callers don't care.
- `on(type, cb)` / `off(type, cb)` — unchanged; `emit()` is called from either
  `socket.onmessage` or `dataChannel.onmessage`, both feeding the same
  `listeners` map.
- `isConnected()` — unchanged meaning ("can I send messages right now").
- `isMultiplayer()`, `getRole()`, `disconnect()` — unchanged.

If, during implementation, you find a call site in `main.js` that assumes
something WS-specific (e.g. inspecting `socket.readyState` directly, or
relying on message ordering *across* the WS↔P2P transition in a way not
covered by §3.2), **fix it in `network.js`'s abstraction**, not by special-
casing `main.js`. The whole point of this plan is that `main.js` stays
untouched.

**Optional nice-to-have** (only if trivial): expose `isP2P()` from
`network.js` and show a small "P2P ⚡" / "Relay 🌐" indicator in the HUD or
lobby waiting screen (`src/screens/mpLobby.js`'s `showMpWaiting` status line)
so players can see whether the direct connection succeeded. This is cosmetic —
do it last, after the core transport works, and only if it doesn't risk the
rest of the plan.

---

## 6. NAT Traversal: STUN, TURN, and the Fallback Path

This is the part that determines whether P2P actually establishes for a given
pair of players:

- **STUN** (`stun:stun.l.google.com:19302` and similar free Google STUN
  servers) is enough for most home routers (full-cone / restricted-cone NAT) —
  both peers discover their public IP:port and can connect directly. This
  covers a large majority of residential connections.
- **Symmetric NAT** (common on some mobile carriers, CGNAT, restrictive
  corporate/university networks) — STUN-discovered addresses won't work for a
  direct connection. WebRTC needs a **TURN** relay server in this case, which
  is itself a relay (defeating the latency goal, but only for the unlucky
  pairing — and TURN relay servers are usually geographically closer / lower
  latency than a single fixed cloud relay, plus only the connection-setup
  fails over, not the whole game).
- **This plan does NOT require setting up a TURN server.** Leave
  `ICE_SERVERS` STUN-only initially. The `DATACHANNEL_OPEN_TIMEOUT_MS = 8000`
  timeout in `webrtc.js` ensures that if P2P can't establish (symmetric NAT on
  either side, no TURN), the game **falls back to the existing WS relay
  transport automatically** — i.e. **today's behavior, unchanged**. Players
  who can't do direct P2P are no worse off than before; players who can get a
  free latency win.
- **Optional follow-up** (explicitly out of scope for the initial
  implementation, document but do not build): a free TURN tier exists (e.g.
  Open Relay Project, or Twilio's free STUN/TURN, or self-hosting `coturn` on
  the same Render instance / a cheap VPS). If added later, just append entries
  to `ICE_SERVERS` in `webrtc.js` — no other code changes needed, by design.

---

## 7. Implementation Order (step-by-step)

1. **Read `src/network.js`, `src/main.js` (grep all `network`/`send`/`on`/
   `connect`/`isConnected` call sites), and `server/index.js`** in full to
   confirm the current behavior matches §0. Re-confirm line numbers (they will
   have drifted from this doc).
2. **Create `src/webrtc.js`** per §2. Write it as a standalone module with no
   dependency on `network.js` internals — it should be unit-testable in
   isolation (e.g. two `RTCPeerConnection`s in the same JS context wired
   directly together, bypassing the WS signaling, as a sanity test of the
   offer/answer/ICE/datachannel logic before integrating).
3. **Modify `src/network.js`** per §3. Keep a feature flag if useful during
   development (e.g. `const ENABLE_P2P = true;` at the top) so you can
   A/B test WS-only vs. P2P behavior without reverting code.
4. **Local two-tab test** (same machine, same browser, `ws://localhost:8742`
   relay via `npm run mp-server`): open host tab, open guest tab, confirm in
   devtools console that `[network] P2P data channel established` logs on
   both sides, and that gameplay (movement, spells, snapshots — per
   `MULTIPLAYER_PLAN.md`'s existing testing checklist) still works correctly.
   At this point P2P on `localhost` is technically host-candidate-only (no
   STUN needed) — this mainly validates the signaling/datachannel plumbing,
   not real NAT traversal.
5. **Two-machine LAN test**: same as above but on two physical machines on the
   same Wi-Fi. STUN should still resolve quickly (local network addresses).
   Confirm `isP2P()` becomes true and gameplay works.
6. **Two-machine internet test** (the real target scenario): host and guest on
   different networks (e.g. one on home Wi-Fi, one on mobile hotspot), both
   pointed at the existing Render relay URL for signaling. Confirm:
   - Signaling still works through the relay (it's small/rare traffic, the
     free-tier cold-start delay only affects this initial handshake, not
     ongoing gameplay).
   - P2P establishes (`isP2P() === true`) when both NATs are STUN-friendly.
   - If P2P fails (one or both behind symmetric NAT), confirm the game
     **silently falls back to relay transport** and remains fully playable —
     this is the critical regression check.
7. **Add the optional `isP2P()` UI indicator** (§5) once the above all pass.
8. **Update `MULTIPLAYER_PLAN.md` and the README/lobby help text** to mention
   that direct P2P is attempted automatically and the relay is now only a
   signaling fallback — players should understand why latency varies between
   sessions (depends on their NAT type).
9. **Commit and push** with a descriptive message, following this repo's
   existing workflow (small, focused commits — e.g. one for `webrtc.js`, one
   for `network.js`, one for docs/UI).

---

## 8. Testing Checklist

- [ ] Solo mode (no `connect()` ever called) — completely unaffected, `role`
      stays `null`, `isMultiplayer()` false, no `RTCPeerConnection` created.
- [ ] Host+guest on `localhost` via local relay — P2P establishes, gameplay
      identical to pre-change (movement, spell casts, rank-ups, snapshots).
- [ ] Host+guest on same LAN, two machines — P2P establishes.
- [ ] Host+guest on different networks (internet), both STUN-friendly NATs —
      P2P establishes; verify via `isP2P()` and/or by checking
      `RTCPeerConnection.getStats()` shows a `candidate-pair` with
      `nominated: true` and non-relay `candidateType` (`host` or `srflx`, not
      `relay`).
- [ ] Simulate P2P failure (e.g. block UDP outbound on one machine via
      firewall, or force `ICE_SERVERS = []`) — confirm `tryEstablishP2P()`
      rejects/times out within `DATACHANNEL_OPEN_TIMEOUT_MS`, and the game
      continues working over the WS relay exactly as before this change.
- [ ] Mid-game P2P drop (kill one peer's network briefly, or close the data
      channel manually via devtools) — confirm `dataChannel.onclose` sets
      `p2pActive = false` and subsequent `send()` calls fall back to WS
      without throwing or hanging. (Reconnection of the P2P link mid-game is
      explicitly out of scope — falling back to relay for the rest of the
      session is an acceptable outcome.)
- [ ] Guest disconnect / host disconnect (`peerLeft`/`hostLeft`) still fire
      correctly — these come from the WS relay, which stays connected
      regardless of P2P state.
- [ ] All existing multiplayer functionality from `MULTIPLAYER_PLAN.md`'s
      testing checklist still passes (movement, spells/rank-ups, combat,
      floor transitions, etc.) — this plan changes transport only, never game
      logic.

---

## 9. Explicitly Out of Scope

- TURN server setup (documented as a future follow-up in §6, not implemented).
- ICE restart / renegotiation after a mid-game P2P drop (falls back to relay
  for the remainder of the session instead).
- More than 2 players (the existing architecture is 1 host + 1 guest; this
  plan doesn't change that).
- Any change to game logic, message payloads, or `main.js`.
- Encryption/security beyond what WebRTC provides by default (DTLS on data
  channels is mandatory and automatic — no extra work needed, but don't build
  additional auth/encryption layers either).
