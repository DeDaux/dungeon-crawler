// server/index.js — minimal WS relay for multiplayer (star topology)
// One host, many guests. The host is authoritative; guests only ever talk to
// the host. Messages are routed by peer id:
//   • host → guest:  message carries `to: <guestId>`  (targeted)
//   • host → all:     message has no `to`              (broadcast)
//   • guest → host:   relay tags it with `from: <guestId>` so the host knows
//                     which player it came from
// Signaling (rtc-offer/answer/ice) uses the same routing.
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || process.env.MP_PORT || 8742;
const wss = new WebSocketServer({ port: PORT });

let host = null;
const guests = new Map(); // id -> ws
let nextId = 1;

function broadcastToGuests(obj) {
    const s = JSON.stringify(obj);
    for (const g of guests.values()) {
        if (g.readyState === g.OPEN) g.send(s);
    }
}

wss.on('connection', (ws) => {
    ws._id = String(nextId++);
    ws._role = null;

    ws.on('message', (data) => {
        let msg;
        try { msg = JSON.parse(data); } catch { return; }

        if (msg.type === 'hello') {
            if (msg.role === 'host') {
                host = ws;
                ws._role = 'host';
                console.log('Host connected');
                // Re-announce any guests that joined before the host (rare, but
                // keeps the host's peer list authoritative after a reconnect).
                for (const id of guests.keys()) {
                    host.send(JSON.stringify({ type: 'peerJoined', peerId: id }));
                }
            } else {
                if (host == null) {
                    ws.send(JSON.stringify({ type: 'error', message: 'No host available' }));
                    ws.close();
                    return;
                }
                ws._role = 'guest';
                guests.set(ws._id, ws);
                console.log(`Guest ${ws._id} connected (${guests.size} total)`);
                host.send(JSON.stringify({ type: 'peerJoined', peerId: ws._id }));
                ws.send(JSON.stringify({ type: 'joined', selfId: ws._id }));
            }
            return;
        }

        if (ws._role === 'host') {
            // Targeted (to a single guest) when `to` is set, else broadcast.
            if (msg.to !== undefined && msg.to !== null) {
                const g = guests.get(String(msg.to));
                if (g && g.readyState === g.OPEN) {
                    const { to, ...rest } = msg;
                    g.send(JSON.stringify({ ...rest, from: 'host' }));
                }
            } else {
                broadcastToGuests(msg);
            }
        } else if (ws._role === 'guest') {
            // Guest → host, tagged with the sender's id.
            if (host && host.readyState === host.OPEN) {
                host.send(JSON.stringify({ ...msg, from: ws._id }));
            }
        }
    });

    ws.on('close', (code, reason) => {
        if (ws === host) {
            host = null;
            console.log(`Host disconnected (code=${code}, reason=${reason || 'none'})`);
            broadcastToGuests({ type: 'hostLeft' });
        } else if (guests.has(ws._id)) {
            guests.delete(ws._id);
            console.log(`Guest ${ws._id} disconnected (code=${code}, reason=${reason || 'none'})`);
            if (host && host.readyState === host.OPEN) {
                host.send(JSON.stringify({ type: 'peerLeft', peerId: ws._id }));
            }
        }
    });
});

console.log(`Multiplayer relay listening on ws://0.0.0.0:${PORT}`);
