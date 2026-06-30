// network.js — WebSocket signaling + optional WebRTC P2P transport (star topology)
//
// The host keeps one transport per guest (a direct RTCDataChannel when P2P can
// be established, otherwise the WS relay). Guests keep a single transport to the
// host. Game messages are addressed per-peer so a host on relay never
// double-delivers, and P2P/relay can be mixed across guests.
import { establishP2P } from './webrtc.js';

let socket = null;           // signaling WS (always connected while in MP)
let role = null;             // 'host' | 'guest' | null
let connected = false;       // true while the WS signaling socket is open
let selfId = null;           // this guest's id, assigned by the relay

let hostChannel = null;      // guest side: the single data channel to the host
const peers = new Map();     // host side: peerId -> { dc, attempted, retries }

const listeners = new Map();       // type -> [callbacks]
const signalListeners = new Map(); // key -> cb  (key = peerId on host, 'host' on guest)

const MAX_P2P_RETRIES = 2;
// Above this much buffered data, skip the data channel for this message (falls
// back to relay) rather than letting bufferedAmount grow unbounded.
const P2P_BUFFERED_AMOUNT_LIMIT = 256 * 1024;

export function getRole() { return role; }
export function isConnected() { return connected; }
export function isMultiplayer() { return role !== null; }
export function getSelfId() { return selfId; }

export function isP2P() {
    if (role === 'guest') return !!(hostChannel && hostChannel.readyState === 'open');
    for (const p of peers.values()) if (p.dc && p.dc.readyState === 'open') return true;
    return false;
}

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
        socket.onclose = (e) => {
            console.log(`[network] signaling socket closed (code=${e.code}, reason=${e.reason || 'none'}, clean=${e.wasClean})`);
            connected = false;
            emit('disconnected', {});
        };
        socket.onmessage = (ev) => {
            let msg;
            try { msg = JSON.parse(ev.data); } catch { return; }

            // Signaling: route to the per-peer webrtc handler, never to game code.
            if (msg.type === 'rtc-offer' || msg.type === 'rtc-answer' || msg.type === 'rtc-ice') {
                const key = role === 'host' ? String(msg.from) : 'host';
                const cb = signalListeners.get(key);
                if (cb) cb(msg);
                return;
            }

            if (msg.type === 'joined' && msg.selfId !== undefined) {
                selfId = String(msg.selfId);
            }

            emit(msg.type, msg);

            // Drive P2P negotiation off the relay's membership events.
            if (role === 'host' && msg.type === 'peerJoined' && msg.peerId !== undefined) {
                tryEstablishP2P(String(msg.peerId));
            } else if (role === 'host' && msg.type === 'peerLeft' && msg.peerId !== undefined) {
                closePeer(String(msg.peerId));
            } else if (role === 'guest' && msg.type === 'joined') {
                tryEstablishP2P('host');
            }
        };
    });
}

// Host tags outgoing signals with the target guest id; a guest's signals
// auto-route to the host, so no `to` is needed there.
function makeSignalSender(peerId) {
    return (signalMsg) => {
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        if (role === 'host') socket.send(JSON.stringify({ ...signalMsg, to: peerId }));
        else socket.send(JSON.stringify(signalMsg));
    };
}

function makeRegister(key) {
    return (cb) => {
        if (cb) signalListeners.set(key, cb);
        else signalListeners.delete(key);
    };
}

function tryEstablishP2P(peerId) {
    const key = role === 'host' ? peerId : 'host';
    let peer = peers.get(peerId);
    if (!peer) { peer = { dc: null, attempted: false, retries: 0 }; peers.set(peerId, peer); }
    if (peer.attempted) return;
    peer.attempted = true;

    establishP2P(role, makeSignalSender(peerId), makeRegister(key))
        .then((dc) => {
            if (role === 'guest') hostChannel = dc;
            peer.dc = dc;
            dc.onmessage = (ev) => {
                let m;
                try { m = JSON.parse(ev.data); } catch { return; }
                // Stamp the sender so the host knows which guest a message is from.
                if (role === 'host' && m.from === undefined) m.from = peerId;
                emit(m.type, m);
            };
            dc.onclose = () => {
                console.log(`[network] P2P data channel to ${peerId} closed`);
                if (role === 'guest') hostChannel = null;
                peer.dc = null;
                if (peer.retries < MAX_P2P_RETRIES) {
                    peer.retries++;
                    peer.attempted = false;
                    setTimeout(() => {
                        if (socket && socket.readyState === WebSocket.OPEN && peers.has(peerId)) {
                            tryEstablishP2P(peerId);
                        }
                    }, 3000);
                } else {
                    console.log(`[network] P2P retry limit reached for ${peerId}, staying on relay`);
                }
            };
            peer.retries = 0;
            console.log(`[network] P2P data channel established with ${peerId}`);
        })
        .catch((err) => {
            console.log(`[network] P2P unavailable for ${peerId}, using relay fallback:`, err.message);
            // The peer entry stays (dc=null) so send() routes to it over the relay.
        });
}

function closePeer(peerId) {
    const peer = peers.get(peerId);
    if (peer && peer.dc) { try { peer.dc.close(); } catch {} }
    peers.delete(peerId);
    signalListeners.delete(peerId);
}

export function send(type, data) {
    const base = { type, ...data };

    if (role === 'guest') {
        const payload = JSON.stringify(base);
        if (hostChannel && hostChannel.readyState === 'open'
            && hostChannel.bufferedAmount < P2P_BUFFERED_AMOUNT_LIMIT) {
            try { hostChannel.send(payload); return; } catch (err) {
                console.warn('[network] P2P send failed, falling back to relay:', err);
            }
        }
        if (socket && socket.readyState === WebSocket.OPEN) socket.send(payload);
        return;
    }

    // Host: deliver to each guest over its best available transport. Relay
    // sends are addressed per-peer (`to`) so guests already on P2P don't get a
    // duplicate copy.
    const payload = JSON.stringify(base);
    for (const [peerId, peer] of peers) {
        if (peer.dc && peer.dc.readyState === 'open'
            && peer.dc.bufferedAmount < P2P_BUFFERED_AMOUNT_LIMIT) {
            try { peer.dc.send(payload); continue; } catch (err) {
                console.warn(`[network] P2P send to ${peerId} failed, using relay:`, err);
            }
        }
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ ...base, to: peerId }));
        }
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
    for (const p of peers.values()) { if (p.dc) { try { p.dc.close(); } catch {} } }
    peers.clear();
    if (hostChannel) { try { hostChannel.close(); } catch {} }
    if (socket) { socket.close(); }
    socket = null;
    hostChannel = null;
    role = null;
    connected = false;
    selfId = null;
    listeners.clear();
    signalListeners.clear();
}
