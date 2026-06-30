// audio.js — Game audio engine
// Uses Web Audio API for synthesized sound effects + HTML5 Audio for background music

let audioCtx = null;
let masterGain = null;
let bgmAudio = null;
let bgmGain = null;
let muted = false;
let initialized = false;

/**
 * Initialize audio context (must be called from user gesture)
 */
export function initAudio() {
    if (initialized) return;
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.4;
        masterGain.connect(audioCtx.destination);
        initialized = true;
        // Browsers create the AudioContext in a "suspended" state and only allow
        // it to start inside a user gesture. initAudio() runs at page load (not a
        // gesture), so without this the context never starts and NOTHING plays.
        // Resume on the first real interaction (menu click, key press, etc.).
        const resumeOnGesture = () => {
            if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        };
        window.addEventListener('pointerdown', resumeOnGesture);
        window.addEventListener('keydown', resumeOnGesture);
        window.addEventListener('click', resumeOnGesture);
    } catch (e) {
        console.warn('Web Audio API not available:', e);
    }
}

/** Resume the audio context if it was suspended (call before starting playback). */
export function ensureAudioResumed() {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

/**
 * Toggle mute
 */
export function toggleMute() {
    muted = !muted;
    if (masterGain) {
        masterGain.gain.value = muted ? 0 : 0.4;
    }
    if (bgmGain) {
        bgmGain.gain.value = muted ? 0 : 0.3;
    }
    return muted;
}

export function isMuted() { return muted; }

/**
 * Start background music from the MP4 file
 */
export function startBGM() {
    if (!audioCtx) return;
    ensureAudioResumed();
    try {
        bgmAudio = new Audio('background music/background music.mp3');
        bgmAudio.loop = true;
        bgmAudio.volume = 0.3;

        // Connect to Web Audio for better control
        const source = audioCtx.createMediaElementSource(bgmAudio);
        bgmGain = audioCtx.createGain();
        bgmGain.gain.value = muted ? 0 : 0.3;
        source.connect(bgmGain);
        bgmGain.connect(audioCtx.destination);

        bgmAudio.play().catch(e => console.warn('BGM autoplay blocked:', e));
    } catch (e) {
        // Fallback: play directly
        try {
            bgmAudio = new Audio('background music/background music.mp3');
            bgmAudio.loop = true;
            bgmAudio.volume = 0.3;
            bgmAudio.play().catch(() => {});
        } catch (e2) {
            console.warn('BGM not available:', e2);
        }
    }
}

// ============================================================
// CHAMPION SOUND EFFECT FILES
// ============================================================

const CHAMPION_SFX = {
    orc: {
        basic: 'Sound effects/Orc/Orc basic attack.mp3',
        q: 'Sound effects/Orc/orc Q.mp3',
        w: 'Sound effects/Orc/orc W.mp3',
        e: 'Sound effects/Orc/orc E.mp3',
        r: 'Sound effects/Orc/orc R.mp3',
        death: 'Sound effects/Orc/orc Death.mp3',
    },
    elf: {
        basic: 'Sound effects/Dark Elf/dark elf basic attack.mp3',
        q: 'Sound effects/Dark Elf/dark elf Q.mp3',
        w: 'Sound effects/Dark Elf/dark elf W.mp3',
        e: 'Sound effects/Dark Elf/dark elf E.mp3',
        r: 'Sound effects/Dark Elf/dark elf R.mp3',
        death: 'Sound effects/Dark Elf/dark elf Death.mp3',
    },
    pyro: {
        basic: 'Sound effects/Pyromancer/pyromancer basic attack.mp3',
        q: 'Sound effects/Pyromancer/pyromancer Q.mp3',
        w: 'Sound effects/Pyromancer/pyromancer W.mp3',
        e: 'Sound effects/Pyromancer/pyromancer E.mp3',
        r: 'Sound effects/Pyromancer/pyromancer R.mp3',
        death: 'Sound effects/Pyromancer/Pyromancer Death.mp3',
    },
    paladin: {
        basic: 'Sound effects/Paladin/paladin basic attack.mp3',
        q: 'Sound effects/Paladin/Paladin Q.mp3',
        w: 'Sound effects/Paladin/Paladin W.mp3',
        e: 'Sound effects/Paladin/Paladin E.mp3',
        r: 'Sound effects/Paladin/Paladin R.mp3',
        death: 'Sound effects/Paladin/Paladin Death.mp3',
    },
    demon_slayer: {
        basic: 'Sound effects/Demon Slayer/Basic attack.mp3',
        q: 'Sound effects/Demon Slayer/Q.mp3',
        w: 'Sound effects/Demon Slayer/W.mp3',
        e: 'Sound effects/Demon Slayer/E.mp3',
        r: 'Sound effects/Demon Slayer/R.mp3',
        death: 'Sound effects/Demon Slayer/Death.mp3',
    },
    saiyan: {
        basic: 'Sound effects/Saiyan/Basic attack.mp3',
        q: 'Sound effects/Saiyan/Q.mp3',
        w: 'Sound effects/Saiyan/W.mp3',
        e: 'Sound effects/Saiyan/E.mp3',
        r: 'Sound effects/Saiyan/R.mp3',
        death: 'Sound effects/Saiyan/Death.mp3',
    },
    shadow_hunter: {
        basic: 'Sound effects/Shadow Hunter/Basic attack.mp3',
        q: 'Sound effects/Shadow Hunter/Q.mp3',
        w: 'Sound effects/Shadow Hunter/W.mp3',
        e: 'Sound effects/Shadow Hunter/E.mp3',
        r: 'Sound effects/Shadow Hunter/R.mp3',
        death: 'Sound effects/Shadow Hunter/Death.mp3',
    },
    ronin: {
        basic: 'Sound effects/Ronin/Basic attack.mp3',
        q: 'Sound effects/Ronin/Q.mp3',
        w: 'Sound effects/Ronin/W.mp3',
        e: 'Sound effects/Ronin/E.mp3',
        r: 'Sound effects/Ronin/R.mp3',
        death: 'Sound effects/Ronin/Death.mp3',
    },
};

/**
 * Play a one-shot sound effect file (HTML5 Audio, independent of Web Audio graph)
 */
function playSfxFile(path, volume = 0.5) {
    if (muted) return;
    try {
        const audio = new Audio(encodeURI(path));
        audio.volume = volume;
        audio.play().catch(() => {});
    } catch (e) {
        // ignore
    }
}

/**
 * Play a champion sound effect — slot is 'basic', 'q', 'w', 'e', 'r', or 'death'
 */
export function playChampionSfx(championId, slot) {
    const champ = CHAMPION_SFX[championId];
    if (!champ || !champ[slot]) return;
    const volume = slot === 'death' ? 0.5 : 0.4;
    playSfxFile(champ[slot], volume);
}

/**
 * Utility: create a gain node that auto-disconnects after duration
 */
function createEnvelope(duration, volume = 1) {
    const env = audioCtx.createGain();
    env.gain.setValueAtTime(volume, audioCtx.currentTime);
    env.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    env.connect(masterGain);
    // Cleanup after duration
    setTimeout(() => {
        try { env.disconnect(); } catch(e) {}
    }, (duration + 0.1) * 1000);
    return env;
}

// ============================================================
// ATTACK SOUNDS — per champion
// ============================================================

/**
 * Orc attack — heavy axe swing
 */
export function playOrcAttack() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const noise = audioCtx.createBufferSource();
    const gain = createEnvelope(0.15, 0.3);

    // Low sweep
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.15);
    osc.connect(gain);

    // Noise burst
    const bufSize = audioCtx.sampleRate * 0.12;
    const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
    }
    noise.buffer = buf;
    const noiseGain = audioCtx.createGain();
    noiseGain.gain.value = 0.2;
    noise.connect(noiseGain);
    noiseGain.connect(gain);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
    noise.start();
    noise.stop(audioCtx.currentTime + 0.12);
}

/**
 * Elf attack — quick dagger slash
 */
export function playElfAttack() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = createEnvelope(0.08, 0.2);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.08);
    osc.connect(gain);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
}

/**
 * Pyro attack — fire whoosh
 */
export function playPyroAttack() {
    if (!audioCtx) return;
    const bufSize = audioCtx.sampleRate * 0.2;
    const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
        const t = i / audioCtx.sampleRate;
        data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 8) * 0.4;
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buf;

    // Lowpass filter sweep
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, audioCtx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.2);

    const gain = createEnvelope(0.25, 0.25);
    noise.connect(filter);
    filter.connect(gain);
    noise.start();
    noise.stop(audioCtx.currentTime + 0.25);
}

/**
 * Paladin attack — holy metallic strike
 */
export function playPaladinAttack() {
    if (!audioCtx) return;
    // Metallic ping
    const osc = audioCtx.createOscillator();
    const gain = createEnvelope(0.2, 0.25);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.2);
    osc.connect(gain);

    // Second harmonic for "clang"
    const osc2 = audioCtx.createOscillator();
    const gain2 = createEnvelope(0.12, 0.1);
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(1600, audioCtx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.12);
    osc2.connect(gain2);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);
    osc2.start();
    osc2.stop(audioCtx.currentTime + 0.12);
}

// ============================================================
// ENEMY ATTACK SOUNDS
// ============================================================

/**
 * Slime attack — gooey squelch
 */
export function playSlimeAttack() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = createEnvelope(0.2, 0.3);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(250, audioCtx.currentTime + 0.1);
    osc.frequency.linearRampToValueAtTime(100, audioCtx.currentTime + 0.2);
    osc.frequency.linearRampToValueAtTime(200, audioCtx.currentTime + 0.3);
    osc.connect(gain);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
}

/**
 * Goblin attack — quick stab
 */
export function playGoblinAttack() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = createEnvelope(0.06, 0.15);
    osc.type = 'square';
    osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.06);
    osc.connect(gain);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.06);
}

/**
 * Skeleton attack — bow twang
 */
export function playSkeletonAttack() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = createEnvelope(0.15, 0.2);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(500, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1000, audioCtx.currentTime + 0.02);
    osc.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.15);
    osc.connect(gain);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
}

/**
 * Bat attack — screech
 */
export function playBatAttack() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = createEnvelope(0.1, 0.15);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(3000, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(500, audioCtx.currentTime + 0.08);
    osc.connect(gain);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
}

/**
 * Boss attack — deep roar
 */
export function playBossAttack() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = createEnvelope(0.4, 0.45);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(120, audioCtx.currentTime + 0.1);
    osc.frequency.linearRampToValueAtTime(60, audioCtx.currentTime + 0.3);
    osc.frequency.linearRampToValueAtTime(100, audioCtx.currentTime + 0.4);
    osc.connect(gain);

    // Sub oscillator
    const osc2 = audioCtx.createOscillator();
    const gain2 = createEnvelope(0.4, 0.2);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(40, audioCtx.currentTime);
    osc2.connect(gain2);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
    osc2.start();
    osc2.stop(audioCtx.currentTime + 0.4);
}

/**
 * Generic enemy attack sound
 */
export function playEnemyAttack(enemyType) {
    if (!audioCtx) return;
    switch (enemyType) {
        case 'slime': playSlimeAttack(); break;
        case 'goblin': playGoblinAttack(); break;
        case 'skeleton': playSkeletonAttack(); break;
        case 'bat': playBatAttack(); break;
        case 'boss_dragon': playBossAttack(); break;
        default: playGoblinAttack(); break;
    }
}

// ============================================================
// HIT / HURT SOUND
// ============================================================

/**
 * Generic hit sound — when damage is dealt
 */
export function playHitSound() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = createEnvelope(0.05, 0.12);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(400, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.05);
    osc.connect(gain);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
}

// ============================================================
// DEATH SOUNDS — per entity type
// ============================================================

/**
 * Slime death — bubbling pop
 */
export function playSlimeDeath() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = createEnvelope(0.3, 0.4);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(400, audioCtx.currentTime + 0.05);
    osc.frequency.linearRampToValueAtTime(50, audioCtx.currentTime + 0.3);
    osc.connect(gain);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
}

/**
 * Goblin death — squeal
 */
export function playGoblinDeath() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = createEnvelope(0.25, 0.3);
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.25);
    osc.connect(gain);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.25);
}

/**
 * Skeleton death — bone rattle
 */
export function playSkeletonDeath() {
    if (!audioCtx) return;
    // Noise burst
    const bufSize = audioCtx.sampleRate * 0.3;
    const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
        const t = i / audioCtx.sampleRate;
        data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 6);
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buf;
    const gain = createEnvelope(0.3, 0.25);

    // Bandpass filter for rattling
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(600, audioCtx.currentTime);
    filter.Q.value = 5;

    noise.connect(filter);
    filter.connect(gain);
    noise.start();
    noise.stop(audioCtx.currentTime + 0.3);
}

/**
 * Bat death — fading screech
 */
export function playBatDeath() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = createEnvelope(0.2, 0.2);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(2000, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.2);
    osc.connect(gain);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);
}

/**
 * Boss death — dramatic explosion
 */
export function playBossDeath() {
    if (!audioCtx) return;
    // Deep rumble
    const osc = audioCtx.createOscillator();
    const gain = createEnvelope(1.0, 0.5);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(60, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(20, audioCtx.currentTime + 1.0);
    osc.connect(gain);

    // Explosion noise
    const bufSize = audioCtx.sampleRate * 0.8;
    const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
        const t = i / audioCtx.sampleRate;
        data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 3);
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buf;
    const noiseGain = createEnvelope(0.8, 0.4);

    // Lowpass for explosion
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, audioCtx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.8);

    noise.connect(filter);
    filter.connect(noiseGain);

    osc.start();
    osc.stop(audioCtx.currentTime + 1.0);
    noise.start();
    noise.stop(audioCtx.currentTime + 0.8);
}

/**
 * Player death — dramatic descent
 */
export function playPlayerDeath() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = createEnvelope(0.8, 0.35);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.8);
    osc.connect(gain);

    // Dissonant second tone
    const osc2 = audioCtx.createOscillator();
    const gain2 = createEnvelope(0.6, 0.15);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(450, audioCtx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(45, audioCtx.currentTime + 0.6);
    osc2.connect(gain2);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.8);
    osc2.start();
    osc2.stop(audioCtx.currentTime + 0.6);
}

/**
 * Replay a sound event relayed from the host in a snapshot (multiplayer guest).
 */
export function playSoundEvent(evt) {
    switch (evt.type) {
        case 'championSfx': playChampionSfx(evt.championId, evt.slot); break;
        case 'enemyAttack': playEnemyAttack(evt.enemyType); break;
        case 'hit': playHitSound(); break;
        case 'death': playDeathSound({ type: evt.entityType, championId: evt.championId, enemyType: evt.enemyType }); break;
        case 'levelUp': playLevelUp(); break;
    }
}

/**
 * Play death sound based on entity type
 */
export function playDeathSound(entity) {
    if (entity.type === 'player') {
        if (entity.championId && CHAMPION_SFX[entity.championId]) {
            playChampionSfx(entity.championId, 'death');
        } else if (audioCtx) {
            playPlayerDeath();
        }
        return;
    }
    if (!audioCtx) return;
    switch (entity.enemyType) {
        case 'slime': playSlimeDeath(); break;
        case 'goblin': playGoblinDeath(); break;
        case 'skeleton': playSkeletonDeath(); break;
        case 'bat': playBatDeath(); break;
        case 'boss_dragon': playBossDeath(); break;
        default: playGoblinDeath(); break;
    }
}

// ============================================================
// UI SOUNDS
// ============================================================

/**
 * Level up / ding sound
 */
export function playLevelUp() {
    if (!audioCtx) return;
    const notes = [523, 659, 784]; // C5, E5, G5
    notes.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = createEnvelope(0.3, 0.15);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + i * 0.08);
        const noteGain = audioCtx.createGain();
        noteGain.gain.setValueAtTime(0, audioCtx.currentTime + i * 0.08);
        noteGain.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + i * 0.08 + 0.02);
        noteGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.08 + 0.3);
        osc.connect(noteGain);
        noteGain.connect(masterGain);
        osc.start(audioCtx.currentTime + i * 0.08);
        osc.stop(audioCtx.currentTime + i * 0.08 + 0.3);
    });
}

/**
 * Gold pickup sound
 */
export function playGoldPickup() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = createEnvelope(0.1, 0.12);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(1320, audioCtx.currentTime + 0.08);
    osc.connect(gain);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
}

// ============================================================
// HORROR ATMOSPHERE — drone, heartbeat, whispers, jump-scares
// ============================================================
const _horror = { active: false, droneGain: null, nodes: [], heartTimer: 0, whisperTimer: 6, prox: 0 };

/** Start the looping dread bed: a low dissonant drone with a slow filter wobble. */
export function startHorrorAmbience() {
    if (!audioCtx || _horror.active) return;
    ensureAudioResumed();
    try {
        const lp = audioCtx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 190; lp.Q.value = 0.8;
        const g = audioCtx.createGain(); g.gain.value = 0.0001;
        lp.connect(g); g.connect(masterGain);

        // Low, slightly detuned cluster = unsettling, never quite in tune.
        for (const f of [38.9, 41.2, 55.0, 55.4]) {
            const o = audioCtx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
            const og = audioCtx.createGain(); og.gain.value = 0.45;
            o.connect(og); og.connect(lp); o.start();
            _horror.nodes.push(o);
        }
        // Slow LFO breathing on the cutoff so the drone "moves".
        const lfo = audioCtx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.06;
        const lfoG = audioCtx.createGain(); lfoG.gain.value = 70;
        lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();
        _horror.nodes.push(lfo);

        _horror.droneGain = g;
        _horror.active = true;
    } catch (e) { /* ignore */ }
}

/**
 * Per-frame horror audio driver. prox 0..1 = how close the nearest hunter is,
 * hunting = how many are actively chasing. Swells the drone, races the
 * heartbeat, and slips in whispers as the dread mounts.
 */
export function updateHorrorAudio(prox, hunting, dt) {
    if (!audioCtx || !_horror.active) return;
    prox = Math.max(0, Math.min(1, prox || 0));
    _horror.prox = prox;

    const target = muted ? 0 : (hunting > 0 ? 0.05 + prox * 0.17 : 0.012);
    if (_horror.droneGain) _horror.droneGain.gain.setTargetAtTime(target, audioCtx.currentTime, 0.4);

    if (hunting > 0) {
        _horror.heartTimer -= dt;
        if (_horror.heartTimer <= 0) {
            _horror.heartTimer = 1.18 - prox * 0.82;          // 1.18s far → 0.36s close
            scheduleHeartbeat(muted ? 0 : 0.1 + prox * 0.42);
        }
    }

    _horror.whisperTimer -= dt;
    if (_horror.whisperTimer <= 0) {
        _horror.whisperTimer = 5 + Math.random() * 8 - prox * 3;
        if (hunting > 0 && !muted) playWhisper(0.08 + prox * 0.2);
    }
}

/** Two-thump "lub-dub" heartbeat. */
function scheduleHeartbeat(vol) {
    if (!audioCtx || vol <= 0) return;
    const thump = (at, v) => {
        const o = audioCtx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(72, at);
        o.frequency.exponentialRampToValueAtTime(33, at + 0.16);
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(v, at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.19);
        o.connect(g); g.connect(masterGain);
        o.start(at); o.stop(at + 0.22);
    };
    const t0 = audioCtx.currentTime;
    thump(t0, vol);
    thump(t0 + 0.17, vol * 0.7);
}

/** A disembodied, panned whisper (filtered noise swell). */
function playWhisper(vol) {
    if (!audioCtx) return;
    const dur = 0.5 + Math.random() * 0.7;
    const n = audioCtx.sampleRate * dur;
    const buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / n);
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const bp = audioCtx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 7;
    bp.frequency.setValueAtTime(800 + Math.random() * 900, audioCtx.currentTime);
    bp.frequency.linearRampToValueAtTime(450 + Math.random() * 500, audioCtx.currentTime + dur);
    const g = audioCtx.createGain(); g.gain.value = vol;
    src.connect(bp); bp.connect(g);
    if (audioCtx.createStereoPanner) {
        const p = audioCtx.createStereoPanner(); p.pan.value = Math.random() * 2 - 1;
        g.connect(p); p.connect(masterGain);
    } else g.connect(masterGain);
    src.start();
}

/** A loud, sharp jump-scare sting — screech cluster + noise stab + sub boom. */
export function playJumpScare() {
    if (!audioCtx || muted) return;
    ensureAudioResumed();
    const t0 = audioCtx.currentTime;
    const out = audioCtx.createGain(); out.gain.value = 0.95;
    out.connect(audioCtx.destination); // bypass master so the scare really hits

    for (const f of [1400, 1660, 1950, 2350]) {
        const o = audioCtx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(f, t0);
        o.frequency.exponentialRampToValueAtTime(f * 0.38, t0 + 0.5);
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
        o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + 0.62);
    }
    const nb = audioCtx.sampleRate * 0.5;
    const buf = audioCtx.createBuffer(1, nb, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < nb; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / nb * 5);
    const noise = audioCtx.createBufferSource(); noise.buffer = buf;
    const ng = audioCtx.createGain(); ng.gain.value = 0.5;
    noise.connect(ng); ng.connect(out); noise.start(t0); noise.stop(t0 + 0.5);

    const sub = audioCtx.createOscillator(); sub.type = 'sine';
    sub.frequency.setValueAtTime(120, t0);
    sub.frequency.exponentialRampToValueAtTime(27, t0 + 0.7);
    const sg = audioCtx.createGain();
    sg.gain.setValueAtTime(0.6, t0);
    sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.8);
    sub.connect(sg); sg.connect(out); sub.start(t0); sub.stop(t0 + 0.82);

    setTimeout(() => { try { out.disconnect(); } catch (e) {} }, 1100);
}

/**
 * Menu click / confirm sound
 */
export function playMenuClick() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = createEnvelope(0.06, 0.1);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(900, audioCtx.currentTime + 0.06);
    osc.connect(gain);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.06);
}
