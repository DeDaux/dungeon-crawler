// Engine.js — shared timing + resize

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

export const Engine = {
    dt: 0,
    time: 0,
    frameCount: 0,
    _lastTime: 0,
};

export function getCanvas() { return canvas; }
export function getCtx() { return ctx; }

export function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

export function tick(timestamp) {
    if (!Engine._lastTime) Engine._lastTime = timestamp;
    Engine.dt = Math.min((timestamp - Engine._lastTime) / 1000, 0.05); // cap at 50ms
    Engine._lastTime = timestamp;
    Engine.time = timestamp / 1000;
    Engine.frameCount++;
}
