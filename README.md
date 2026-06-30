# Dungeon Crawler

A browser-based action dungeon crawler built with vanilla JavaScript and HTML5 Canvas. Pick a champion, fight through procedurally generated floors, and try to survive all 10 floors.

## How to play

This is a static site, but it uses ES modules, so it must be served over HTTP (not opened directly as a `file://` URL).

### Option 1: Node.js

```bash
npm install
npm start
```

Then open `http://localhost:8741` in your browser.

### Option 2: Python

```bash
python -m http.server 8741
```

Then open `http://localhost:8741` in your browser.

## Controls

- **WASD** — Move
- **Q / W / E / R** — Cast spells
- **Double-tap Q/W/E/R** — Rank up a spell (when you have skill points)
- **F / Space** — Interact (open shop, descend stairs)
- **Mouse** — Aim spells / target enemies
