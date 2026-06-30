// webrtc.js — establishes a direct RTCDataChannel between host and guest,
// using an existing WebSocket connection purely for SDP/ICE signaling.

const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // Optional TURN fallback — see §6 of WEBRTC_P2P_PLAN.md.
];

const DATACHANNEL_OPEN_TIMEOUT_MS = 8000;

/**
 * @param {'host'|'guest'} role — host creates the offer, guest answers
 * @param {(msg: object) => void} sendSignal — call to send a signaling message
 *        over the existing WS (network.js wires this to its own WS send)
 * @param {(cb: ((msg: object) => void) | null) => void} onSignalMessage —
 *        register (or unregister with null) a handler for incoming signaling
 *        messages from the relay (rtc-offer/rtc-answer/rtc-ice)
 * @returns {Promise<RTCDataChannel>} resolves when the channel is open,
 *          rejects if P2P could not be established — caller should fall back
 *          to WS-relay transport on rejection.
 */
export function establishP2P(role, sendSignal, onSignalMessage) {
    return new Promise((resolve, reject) => {
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        let dataChannel = null;
        let settled = false;

        const timeout = setTimeout(() => {
            if (!settled) { settled = true; cleanup(); reject(new Error('P2P timeout')); }
        }, DATACHANNEL_OPEN_TIMEOUT_MS);

        // Queue for ICE candidates that arrive before remote description is set
        let pendingIceCandidates = [];
        let remoteDescSet = false;

        function cleanup() {
            clearTimeout(timeout);
            onSignalMessage(null); // unregister
            // Close the peer connection if it hasn't settled successfully
            if (!settled || dataChannel?.readyState !== 'open') {
                try { dataChannel?.close(); } catch {}
                try { pc.close(); } catch {}
            }
        }

        pc.onicecandidate = (e) => {
            if (e.candidate) {
                sendSignal({ type: 'rtc-ice', candidate: e.candidate.toJSON() });
            }
        };

        // Handle incoming signaling messages (offer/answer/ice) from the relay
        onSignalMessage(async (msg) => {
            try {
                if (msg.type === 'rtc-offer') {
                    await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
                    remoteDescSet = true;
                    // Apply any ICE candidates that arrived early
                    for (const c of pendingIceCandidates) {
                        await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
                    }
                    pendingIceCandidates = [];
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    sendSignal({ type: 'rtc-answer', sdp: pc.localDescription.toJSON() });
                } else if (msg.type === 'rtc-answer') {
                    await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
                    remoteDescSet = true;
                    // Apply any ICE candidates that arrived early
                    for (const c of pendingIceCandidates) {
                        await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
                    }
                    pendingIceCandidates = [];
                } else if (msg.type === 'rtc-ice') {
                    if (remoteDescSet) {
                        await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
                    } else {
                        // Buffer candidates that arrive before remote description
                        pendingIceCandidates.push(msg.candidate);
                    }
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
            dc.onerror = (err) => {
                if (!settled) { settled = true; cleanup(); reject(new Error('DataChannel error')); }
            };
        }

        if (role === 'host') {
            // Host creates the data channel and the offer
            wireChannel(pc.createDataChannel('game', { ordered: true }));
            pc.createOffer()
                .then((offer) => pc.setLocalDescription(offer))
                .then(() => sendSignal({ type: 'rtc-offer', sdp: pc.localDescription.toJSON() }))
                .catch((err) => {
                    if (!settled) { settled = true; cleanup(); reject(err); }
                });
        } else {
            // Guest waits for the host's data channel
            pc.ondatachannel = (e) => wireChannel(e.channel);
        }
    });
}
