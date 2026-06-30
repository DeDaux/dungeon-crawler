// map.js — procedural dungeon generation with rooms, corridors, stairs, shops,
// environmental hazards, secret rooms, treasure rooms, and boss arenas.
const TILE_SIZE = 32;

export const TILE = {
    FLOOR: 0,
    WALL: 1,
    DOOR: 2,
    STAIRS_DOWN: 3,
    SHOP: 4,
    LAVA: 5,        // damages player on contact
    WATER: 6,       // slows movement
    TRAP: 7,        // one-shot damage tile
    SECRET: 8,      // hidden passage (walkable, visually a wall until nearby)
    TORCH: 9,       // decorative light source (walkable)
    RUBBLE: 10,     // decorative obstruction (not walkable, blocks LoS)
};

const MIN_ROOM_SIZE = 5;
const MAX_ROOM_SIZE = 14;     // was 12 — slightly bigger rooms
const ROOM_PADDING = 2;

// Per-floor theme pools — stronger shape biases for distinct floor identities.
// Each theme also has a floor-tint colour and an enemy-pool overrides map.
const ROOM_THEMES = {
    caverns: {
        shapes: ['ellipse', 'ellipse', 'ellipse', 'octagon', 'rect', 'irregular'],
        floorTint: '#3E2723',     // dark brown
        desc: 'Natural Caverns',
    },
    crystal: {
        shapes: ['diamond', 'diamond', 'cross', 'octagon', 'rect', 'diamond'],
        floorTint: '#1A237E',     // deep blue
        desc: 'Crystal Halls',
    },
    halls: {
        shapes: ['pillars', 'rect', 'rect', 'octagon', 'cross', 'pillars'],
        floorTint: '#424242',     // grey stone
        desc: 'Ancient Halls',
    },
    ruins: {
        shapes: ['octagon', 'rect', 'cross', 'ellipse', 'pillars', 'irregular'],
        floorTint: '#33691E',     // mossy green
        desc: 'Crumbling Ruins',
    },
    lava: {
        shapes: ['irregular', 'ellipse', 'octagon', 'rect', 'irregular', 'cross'],
        floorTint: '#7F1D0A',     // infernal red
        desc: 'Molten Depths',
    },
    frost: {
        shapes: ['diamond', 'rect', 'octagon', 'cross', 'diamond', 'ellipse'],
        floorTint: '#1A4E6E',     // glacial blue
        desc: 'Frozen Caverns',
    },
    fungal: {
        shapes: ['ellipse', 'irregular', 'ellipse', 'octagon', 'rect', 'irregular'],
        floorTint: '#4A1E6E',     // sickly violet
        desc: 'Fungal Hollow',
    },
    mixed: {
        shapes: ['rect', 'ellipse', 'diamond', 'octagon', 'cross', 'pillars', 'irregular'],
        floorTint: '#37474F',     // blue-grey
        desc: 'Twisting Passages',
    },
    olympus: {
        // Classical Greek "Hercules" look: colonnaded marble halls.
        shapes: ['pillars', 'rect', 'octagon', 'pillars', 'cross', 'rect'],
        floorTint: '#C9B27E',     // sunlit marble & gold
        desc: 'Halls of Olympus',
    },
};
const THEME_KEYS = Object.keys(ROOM_THEMES);

// Theme override. null = random dark dungeon themes per floor (suits the horror
// tone). Set to 'olympus' to restore the bright Hercules marble aesthetic.
const FORCED_THEME = null;

export class DungeonMap {
    constructor() {
        this.width = 0;
        this.height = 0;
        this.grid = [];
        this.rooms = [];
        this.enemySpawns = [];
        this.stairsX = 0;
        this.stairsY = 0;
        this.shopX = 0;
        this.shopY = 0;
        this.hasShop = false;
        this.theme = 'mixed';
        this.themeDesc = '';
        this.floorTint = '#37474F';
        this.hazards = [];    // [{ x, y, type }] — world-space hazard positions
        this.treasureRooms = []; // room indices of treasure rooms
        this.secretPassages = []; // [{ tx, ty }] — tile coords of secret walls
    }

    /** Generate a new dungeon with given dimensions and room count */
    generate(width, height, roomCount = 8, hasShop = false, floorNumber = 1) {
        this.width = Math.floor(width / TILE_SIZE);
        this.height = Math.floor(height / TILE_SIZE);
        this.grid = [];
        this.hasShop = hasShop;
        this.hazards = [];
        this.treasureRooms = [];
        this.secretPassages = [];

        // Fill with walls
        for (let y = 0; y < this.height; y++) {
            this.grid[y] = new Array(this.width).fill(TILE.WALL);
        }

        this.rooms = [];
        this.enemySpawns = [];

        // Pick theme (forced to Olympus for the Hercules look; see FORCED_THEME).
        const themeKey = FORCED_THEME || THEME_KEYS[Math.floor(Math.random() * THEME_KEYS.length)];
        const theme = ROOM_THEMES[themeKey];
        const shapePool = theme.shapes;
        this.theme = themeKey;
        this.themeDesc = theme.desc;
        this.floorTint = theme.floorTint;

        // More placement attempts for bigger maps
        const maxAttempts = Math.max(200, roomCount * 15);

        // Place rooms
        let attempts = 0;
        while (this.rooms.length < roomCount && attempts < maxAttempts) {
            attempts++;
            let roomW, roomH;
            // Great halls and arenas — bigger on deeper floors
            if (Math.random() < 0.15 + floorNumber * 0.02) {
                roomW = 14 + Math.floor(Math.random() * 10); // 14..23
                roomH = 10 + Math.floor(Math.random() * 8);  // 10..17
            } else {
                roomW = MIN_ROOM_SIZE + Math.floor(Math.random() * (MAX_ROOM_SIZE - MIN_ROOM_SIZE));
                roomH = MIN_ROOM_SIZE + Math.floor(Math.random() * (MAX_ROOM_SIZE - MIN_ROOM_SIZE));
            }
            const rx = 2 + Math.floor(Math.random() * (this.width - roomW - 4));
            const ry = 2 + Math.floor(Math.random() * (this.height - roomH - 4));

            if (this._canPlaceRoom(rx, ry, roomW, roomH)) {
                const shape = shapePool[Math.floor(Math.random() * shapePool.length)];
                this._carveRoomShaped(rx, ry, roomW, roomH, shape);
            }
        }

        // Safety fallback
        if (this.rooms.length < 2) {
            const fallbacks = [
                { x: 3, y: 3 },
                { x: this.width - 12, y: this.height - 12 },
            ];
            for (const f of fallbacks) {
                if (this.rooms.length >= 2) break;
                this._carveRoomShaped(f.x, f.y, 8, 6, 'rect');
            }
        }

        // ── Corridors: spanning chain + extra loops ────────────────
        for (let i = 1; i < this.rooms.length; i++) {
            const prev = this.rooms[i - 1];
            const curr = this.rooms[i];
            this._carveCorridor(
                Math.floor(prev.cx), Math.floor(prev.cy),
                Math.floor(curr.cx), Math.floor(curr.cy)
            );
        }

        // Extra loop corridors — twice as many for bigger maps
        const extraLinks = Math.max(2, Math.floor(this.rooms.length / 2));
        for (let k = 0; k < extraLinks && this.rooms.length > 2; k++) {
            const a = this.rooms[Math.floor(Math.random() * this.rooms.length)];
            const b = this.rooms[Math.floor(Math.random() * this.rooms.length)];
            if (a === b) continue;
            this._carveCorridor(Math.floor(a.cx), Math.floor(a.cy), Math.floor(b.cx), Math.floor(b.cy));
        }

        // ── Enemy spawns ───────────────────────────────────────────
        for (let i = 0; i < this.rooms.length; i++) {
            const room = this.rooms[i];
            const cx = room.x + Math.floor(room.w / 2);
            const cy = room.y + Math.floor(room.h / 2);
            this.enemySpawns.push({
                x: cx * TILE_SIZE + TILE_SIZE / 2,
                y: cy * TILE_SIZE + TILE_SIZE / 2,
                roomIndex: i,
                isFirstRoom: i === 0,
            });
        }

        // ── Player spawn room ──────────────────────────────────────
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        let spawnRoomIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < this.rooms.length; i++) {
            const room = this.rooms[i];
            const d = Math.hypot(room.cx - centerX, room.cy - centerY);
            if (d < bestDist) { bestDist = d; spawnRoomIdx = i; }
        }
        this._playerSpawnRoomIndex = spawnRoomIdx;
        const spawnRoom = this.rooms[spawnRoomIdx];

        // ── Stairs ─────────────────────────────────────────────────
        let stairsRoomIdx = spawnRoomIdx;
        if (this.rooms.length > 1) {
            let farthestDist = -1;
            for (let i = 0; i < this.rooms.length; i++) {
                if (i === spawnRoomIdx) continue;
                const room = this.rooms[i];
                const d = Math.hypot(room.cx - spawnRoom.cx, room.cy - spawnRoom.cy);
                if (d > farthestDist) { farthestDist = d; stairsRoomIdx = i; }
            }
            const stairsRoom = this.rooms[stairsRoomIdx];
            this.stairsX = (stairsRoom.x + Math.floor(stairsRoom.w / 2)) * TILE_SIZE;
            this.stairsY = (stairsRoom.y + Math.floor(stairsRoom.h / 2)) * TILE_SIZE;
            const stx = stairsRoom.x + Math.floor(stairsRoom.w / 2);
            const sty = stairsRoom.y + Math.floor(stairsRoom.h / 2);
            if (sty >= 0 && sty < this.height && stx >= 0 && stx < this.width &&
                this.grid[sty][stx] === TILE.FLOOR) {
                this.grid[sty][stx] = TILE.STAIRS_DOWN;
            }
        }

        // ── Shop — every floor ─────────────────────────────────────
        this.hasShop = true;
        let shopRoomIdx = spawnRoomIdx;
        if (this.rooms.length > 2) {
            const candidates = [];
            for (let i = 0; i < this.rooms.length; i++) {
                if (i !== spawnRoomIdx && i !== stairsRoomIdx) candidates.push(i);
            }
            shopRoomIdx = candidates.length > 0
                ? candidates[Math.floor(Math.random() * candidates.length)]
                : stairsRoomIdx;
        } else if (this.rooms.length === 2) {
            shopRoomIdx = stairsRoomIdx;
        }
        {
            const shopRoom = this.rooms[shopRoomIdx];
            this.shopX = (shopRoom.x + Math.floor(shopRoom.w / 2)) * TILE_SIZE;
            this.shopY = (shopRoom.y + Math.floor(shopRoom.h / 2)) * TILE_SIZE;
            const shx = shopRoom.x + Math.floor(shopRoom.w / 2);
            const shy = shopRoom.y + Math.floor(shopRoom.h / 2);
            if (shy >= 0 && shy < this.height && shx >= 0 && shx < this.width &&
                this.grid[shy][shx] === TILE.FLOOR) {
                this.grid[shy][shx] = TILE.SHOP;
            }
        }

        // ── Boss arena on boss floors (every 5) ────────────────────
        if (floorNumber % 5 === 0 && this.rooms.length > 2) {
            // Convert the farthest room into a sealed arena
            const arena = this.rooms[stairsRoomIdx];
            // Expand if small
            if (arena.w < 14 || arena.h < 10) {
                // Already carved — just mark it; the stair room on boss floors
                // serves double duty as the boss arena.
            }
            this._bossArenaIdx = stairsRoomIdx;
        }

        // ── Treasure room ──────────────────────────────────────────
        if (this.rooms.length >= 3) {
            const candidates = [];
            for (let i = 0; i < this.rooms.length; i++) {
                if (i === spawnRoomIdx || i === stairsRoomIdx || i === shopRoomIdx) continue;
                candidates.push(i);
            }
            if (candidates.length > 0) {
                const trIdx = candidates[Math.floor(Math.random() * candidates.length)];
                this.treasureRooms.push(trIdx);
            }
        }

        // ── Secret passages ────────────────────────────────────────
        this._placeSecretPassages();

        // ── Environmental hazards ──────────────────────────────────
        this._placeHazards(floorNumber);

        // ── Torches along corridors ────────────────────────────────
        this._placeTorches();

        // ── Decorative rubble ──────────────────────────────────────
        this._placeRubble();

        return this;
    }

    // ── Room carving ───────────────────────────────────────────────

    _canPlaceRoom(rx, ry, rw, rh) {
        for (let y = ry - ROOM_PADDING; y < ry + rh + ROOM_PADDING; y++) {
            for (let x = rx - ROOM_PADDING; x < rx + rw + ROOM_PADDING; x++) {
                if (y < 0 || y >= this.height || x < 0 || x >= this.width) return false;
                if (this.grid[y][x] !== TILE.WALL) return false;
            }
        }
        return true;
    }

    _carveRoomShaped(rx, ry, rw, rh, shape) {
        const inBox = (x, y) => x >= 0 && x < this.width && y >= 0 && y < this.height;
        const carve = (x, y) => { if (inBox(x, y)) this.grid[y][x] = TILE.FLOOR; };
        const carveWall = (x, y) => { if (inBox(x, y) && this.grid[y][x] === TILE.FLOOR) this.grid[y][x] = TILE.WALL; };

        const cx = rx + (rw - 1) / 2;
        const cy = ry + (rh - 1) / 2;
        const ax = Math.max(1, (rw - 1) / 2);
        const ay = Math.max(1, (rh - 1) / 2);
        const cornerCut = Math.min(rw, rh) * 0.32;
        const hBand = Math.max(1, Math.floor(rh * 0.3));
        const vBand = Math.max(1, Math.floor(rw * 0.3));
        const ccx = Math.round(cx), ccy = Math.round(cy);

        for (let y = ry; y < ry + rh; y++) {
            for (let x = rx; x < rx + rw; x++) {
                const ndx = (x - cx) / ax, ndy = (y - cy) / ay;
                const lx = x - rx, ly = y - ry;
                let fill;
                switch (shape) {
                    case 'ellipse':
                        fill = (ndx * ndx + ndy * ndy) <= 1.08;
                        break;
                    case 'diamond':
                        fill = (Math.abs(ndx) + Math.abs(ndy)) <= 1.08;
                        break;
                    case 'octagon':
                        fill = (lx + ly) >= cornerCut &&
                               ((rw - 1 - lx) + ly) >= cornerCut &&
                               (lx + (rh - 1 - ly)) >= cornerCut &&
                               ((rw - 1 - lx) + (rh - 1 - ly)) >= cornerCut;
                        break;
                    case 'cross':
                        fill = Math.abs(y - ccy) <= hBand || Math.abs(x - ccx) <= vBand;
                        break;
                    case 'irregular':
                        // Organic, cave-like: ellipse with noise at the edges
                        {
                            const e = (ndx * ndx + ndy * ndy);
                            const noise = Math.sin(x * 0.7 + y * 0.5) * 0.15 +
                                         Math.cos(y * 0.6 - x * 0.4) * 0.12;
                            fill = e <= 0.9 + noise;
                        }
                        break;
                    case 'rect':
                    case 'pillars':
                    default:
                        fill = true;
                        break;
                }
                if (fill) carve(x, y);
            }
        }

        // Pillared hall
        if (shape === 'pillars') {
            for (let py = ry + 2; py < ry + rh - 2; py += 3) {
                for (let px = rx + 2; px < rx + rw - 2; px += 3) {
                    if (Math.abs(px - ccx) <= 1 || Math.abs(py - ccy) <= 1) continue;
                    carveWall(px, py);
                }
            }
        }

        // Guaranteed central cross for connectivity
        for (let y = ry; y < ry + rh; y++) { carve(ccx - 1, y); carve(ccx, y); carve(ccx + 1, y); }
        for (let x = rx; x < rx + rw; x++) { carve(x, ccy - 1); carve(x, ccy); carve(x, ccy + 1); }

        this.rooms.push({
            x: rx, y: ry, w: rw, h: rh,
            cx: rx + rw / 2, cy: ry + rh / 2,
            shape,
            isTreasure: false,
            isBossArena: false,
        });
    }

    // ── Corridors ──────────────────────────────────────────────────

    /** Carve a 5-tile-wide corridor between two tile coords. */
    _carveCorridor(x1, y1, x2, y2) {
        const carveFloor = (x, y) => {
            if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
                if (this.grid[y][x] === TILE.WALL) this.grid[y][x] = TILE.FLOOR;
            }
        };
        const halfW = 2; // 5-wide total: -2, -1, 0, +1, +2

        let x = x1;
        let y = y1;
        while (x !== x2) {
            for (let dy = -halfW; dy <= halfW; dy++) {
                carveFloor(x, y + dy);
            }
            x += x < x2 ? 1 : -1;
        }
        while (y !== y2) {
            for (let dx = -halfW; dx <= halfW; dx++) {
                carveFloor(x + dx, y);
            }
            y += y < y2 ? 1 : -1;
        }
    }

    // ── Hazards, secrets, torches, rubble ──────────────────────────

    _placeSecretPassages() {
        // Find corridor tiles adjacent to walls, carve a small room behind
        const candidates = [];
        for (let y = 2; y < this.height - 2; y++) {
            for (let x = 2; x < this.width - 2; x++) {
                if (this.grid[y][x] !== TILE.FLOOR) continue;
                // Check if this floor tile has exactly 1 wall neighbor
                const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
                for (const [dx, dy] of dirs) {
                    const nx = x + dx, ny = y + dy;
                    if (this.grid[ny][nx] === TILE.WALL) {
                        // Check there's space behind the wall
                        const bx = x + dx * 2, by = y + dy * 2;
                        if (bx >= 2 && bx < this.width - 2 && by >= 2 && by < this.height - 2 &&
                            this.grid[by][bx] === TILE.WALL &&
                            this.grid[y + dy * -1] && this.grid[y + dy * -1][x + dx * -1] === TILE.FLOOR) {
                            candidates.push({ tx: x + dx, ty: y + dy, bx, by });
                        }
                    }
                }
            }
        }
        if (candidates.length > 0) {
            const pick = candidates[Math.floor(Math.random() * candidates.length)];
            // Mark as secret (walkable but visually wall-like until nearby)
            this.grid[pick.ty][pick.tx] = TILE.SECRET;
            this.secretPassages.push({ tx: pick.tx, ty: pick.ty });
            // Carve a small treasure nook behind the secret wall
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const sx = pick.bx + dx, sy = pick.by + dy;
                    if (sx >= 0 && sx < this.width && sy >= 0 && sy < this.height &&
                        this.grid[sy][sx] === TILE.WALL) {
                        this.grid[sy][sx] = TILE.FLOOR;
                    }
                }
            }
        }
    }

    _placeHazards(floorNumber) {
        // Lava pools: ~15% of rooms get one (more on deeper floors)
        const lavaChance = 0.12 + floorNumber * 0.02;
        // Trap tiles: scattered along corridors
        const trapCount = Math.floor(3 + floorNumber * 0.5);
        // Water pools: ~10% of rooms
        const waterChance = 0.08 + floorNumber * 0.01;

        for (let i = 0; i < this.rooms.length; i++) {
            const room = this.rooms[i];

            // Lava pool in corner of room
            if (Math.random() < lavaChance && room.w >= 6 && room.h >= 6) {
                const lx = room.x + 1 + Math.floor(Math.random() * (room.w - 3));
                const ly = room.y + 1 + Math.floor(Math.random() * (room.h - 3));
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const tx = lx + dx, ty = ly + dy;
                        if (tx >= 0 && tx < this.width && ty >= 0 && ty < this.height &&
                            this.grid[ty][tx] === TILE.FLOOR &&
                            !(tx >= room.x + Math.floor(room.w/2) - 1 && tx <= room.x + Math.floor(room.w/2) + 1 &&
                              ty >= room.y + Math.floor(room.h/2) - 1 && ty <= room.y + Math.floor(room.h/2) + 1)) {
                            this.grid[ty][tx] = TILE.LAVA;
                            this.hazards.push({ x: tx * TILE_SIZE + TILE_SIZE / 2, y: ty * TILE_SIZE + TILE_SIZE / 2, type: 'lava' });
                        }
                    }
                }
            }

            // Water pool
            if (Math.random() < waterChance && room.w >= 5 && room.h >= 5) {
                const wx = room.x + 1 + Math.floor(Math.random() * (room.w - 3));
                const wy = room.y + 1 + Math.floor(Math.random() * (room.h - 3));
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const tx = wx + dx, ty = wy + dy;
                        if (tx >= 0 && tx < this.width && ty >= 0 && ty < this.height &&
                            this.grid[ty][tx] === TILE.FLOOR) {
                            this.grid[ty][tx] = TILE.WATER;
                            this.hazards.push({ x: tx * TILE_SIZE + TILE_SIZE / 2, y: ty * TILE_SIZE + TILE_SIZE / 2, type: 'water' });
                        }
                    }
                }
            }
        }

        // Traps along corridors
        let placed = 0;
        let safety = 0;
        while (placed < trapCount && safety < 200) {
            safety++;
            const tx = 2 + Math.floor(Math.random() * (this.width - 4));
            const ty = 2 + Math.floor(Math.random() * (this.height - 4));
            if (this.grid[ty][tx] === TILE.FLOOR) {
                // Don't place on stairs, shop, or near them
                const nearStairs = Math.abs(tx - Math.floor(this.stairsX / TILE_SIZE)) <= 2 &&
                                   Math.abs(ty - Math.floor(this.stairsY / TILE_SIZE)) <= 2;
                const nearShop = this.hasShop &&
                                 Math.abs(tx - Math.floor(this.shopX / TILE_SIZE)) <= 2 &&
                                 Math.abs(ty - Math.floor(this.shopY / TILE_SIZE)) <= 2;
                if (!nearStairs && !nearShop) {
                    this.grid[ty][tx] = TILE.TRAP;
                    this.hazards.push({ x: tx * TILE_SIZE + TILE_SIZE / 2, y: ty * TILE_SIZE + TILE_SIZE / 2, type: 'trap' });
                    placed++;
                }
            }
        }
    }

    _placeTorches() {
        // Place torches at regular-ish intervals along corridors (every ~8 tiles)
        const freq = 10;
        for (let y = 2; y < this.height - 2; y += freq) {
            for (let x = 2; x < this.width - 2; x += freq) {
                // Shift odd rows
                const tx = x + (y % (freq * 2) === 0 ? 0 : Math.floor(freq / 2));
                const ty = y;
                if (tx >= 0 && tx < this.width && ty >= 0 && ty < this.height &&
                    this.grid[ty][tx] === TILE.FLOOR) {
                    // Only torch if it has a wall neighbor (torches go on walls/floors near walls)
                    let hasWallNeighbor = false;
                    for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
                        const nx = tx + dx, ny = ty + dy;
                        if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height &&
                            this.grid[ny][nx] === TILE.WALL) {
                            hasWallNeighbor = true;
                            break;
                        }
                    }
                    if (hasWallNeighbor) {
                        this.grid[ty][tx] = TILE.TORCH;
                    }
                }
            }
        }
    }

    _placeRubble() {
        // Scatter rubble (impassable decorative walls) in room corners
        for (const room of this.rooms) {
            if (room.shape === 'rect' || room.shape === 'pillars') {
                const count = 2 + Math.floor(Math.random() * 3);
                for (let i = 0; i < count; i++) {
                    const rx = room.x + 1 + Math.floor(Math.random() * (room.w - 2));
                    const ry = room.y + 1 + Math.floor(Math.random() * (room.h - 2));
                    // Avoid centre cross
                    if (Math.abs(rx - Math.round(room.cx)) > 2 || Math.abs(ry - Math.round(room.cy)) > 2) {
                        if (rx >= 0 && rx < this.width && ry >= 0 && ry < this.height &&
                            this.grid[ry][rx] === TILE.FLOOR) {
                            this.grid[ry][rx] = TILE.RUBBLE;
                        }
                    }
                }
            }
        }
    }

    // ── Queries ─────────────────────────────────────────────────────

    worldToTile(wx, wy) {
        return { tx: Math.floor(wx / TILE_SIZE), ty: Math.floor(wy / TILE_SIZE) };
    }

    /** Any non-blocking tile is walkable */
    isWalkable(tx, ty) {
        if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) return false;
        const tile = this.grid[ty][tx];
        return tile !== TILE.WALL && tile !== TILE.RUBBLE;
    }

    isWorldWalkable(wx, wy) {
        const { tx, ty } = this.worldToTile(wx, wy);
        return this.isWalkable(tx, ty);
    }

    /** Is this tile a hazard (lava, water, trap)? */
    isHazard(tx, ty) {
        if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) return false;
        const tile = this.grid[ty][tx];
        return tile === TILE.LAVA || tile === TILE.WATER || tile === TILE.TRAP;
    }

    /** Get the hazard type at a tile, or null */
    getHazardType(tx, ty) {
        if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) return null;
        const tile = this.grid[ty][tx];
        if (tile === TILE.LAVA) return 'lava';
        if (tile === TILE.WATER) return 'water';
        if (tile === TILE.TRAP) return 'trap';
        return null;
    }

    hasLineOfSight(x1, y1, x2, y2) {
        const dist = Math.hypot(x2 - x1, y2 - y1);
        if (dist < 1) return true;
        const steps = Math.ceil(dist / (TILE_SIZE * 0.5));
        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const x = x1 + (x2 - x1) * t;
            const y = y1 + (y2 - y1) * t;
            if (!this.isWorldWalkable(x, y)) return false;
        }
        return true;
    }

    getTileAt(wx, wy) {
        const { tx, ty } = this.worldToTile(wx, wy);
        if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) return TILE.WALL;
        return this.grid[ty][tx];
    }

    findPath(startWX, startWY, endWX, endWY) {
        const sx = Math.floor(startWX / TILE_SIZE);
        const sy = Math.floor(startWY / TILE_SIZE);
        const ex = Math.floor(endWX / TILE_SIZE);
        const ey = Math.floor(endWY / TILE_SIZE);
        if (!this.isWalkable(sx, sy) || !this.isWalkable(ex, ey)) return null;

        const W = this.width;
        const start = sy * W + sx;
        const goal = ey * W + ex;
        const prev = new Int32Array(W * this.height).fill(-1);
        const seen = new Uint8Array(W * this.height);
        const queue = [start];
        seen[start] = 1;
        const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];

        let head = 0, found = false;
        while (head < queue.length) {
            const cur = queue[head++];
            if (cur === goal) { found = true; break; }
            const cx = cur % W, cy = (cur - cx) / W;
            for (const [dx, dy] of dirs) {
                const nx = cx + dx, ny = cy + dy;
                if (nx < 0 || nx >= W || ny < 0 || ny >= this.height) continue;
                const ni = ny * W + nx;
                if (seen[ni] || !this.isWalkable(nx, ny)) continue;
                seen[ni] = 1;
                prev[ni] = cur;
                queue.push(ni);
            }
        }
        if (!found) return null;

        const waypoints = [];
        for (let c = goal; c !== -1; c = prev[c]) {
            const cx = c % W, cy = (c - cx) / W;
            waypoints.push({ x: cx * TILE_SIZE + TILE_SIZE / 2, y: cy * TILE_SIZE + TILE_SIZE / 2 });
            if (c === start) break;
        }
        waypoints.reverse();
        return waypoints;
    }

    isOnStairs(wx, wy) {
        return this.getTileAt(wx, wy) === TILE.STAIRS_DOWN;
    }

    isOnShop(wx, wy) {
        return this.getTileAt(wx, wy) === TILE.SHOP;
    }

    getPlayerSpawn() {
        const cx = this.width / 2;
        const cy = this.height / 2;
        let bestRoom = this.rooms[0];
        let bestDist = Infinity;
        let bestIdx = 0;
        for (let i = 0; i < this.rooms.length; i++) {
            const room = this.rooms[i];
            const d = Math.hypot(room.cx - cx, room.cy - cy);
            if (d < bestDist) { bestDist = d; bestRoom = room; bestIdx = i; }
        }
        this._playerSpawnRoomIndex = bestIdx;
        if (bestRoom) {
            return {
                x: (bestRoom.x + Math.floor(bestRoom.w / 2)) * TILE_SIZE,
                y: (bestRoom.y + Math.floor(bestRoom.h / 2)) * TILE_SIZE,
            };
        }
        return { x: cx * TILE_SIZE, y: cy * TILE_SIZE };
    }

    getEnemySpawnPoints() {
        const skip = this._playerSpawnRoomIndex || 0;
        return this.enemySpawns.filter(s => s.roomIndex !== skip);
    }

    getStairsPosition() {
        return { x: this.stairsX, y: this.stairsY };
    }

    static get TILE_SIZE() { return TILE_SIZE; }

    // ── Snapshot ────────────────────────────────────────────────────

    static fromSnapshot(data) {
        const dm = new DungeonMap();
        dm.width = data.width || 0;
        dm.height = data.height || 0;
        dm.grid = data.grid || [];
        dm.rooms = data.rooms || [];
        dm.enemySpawns = data.enemySpawns || [];
        dm.stairsX = data.stairsX || 0;
        dm.stairsY = data.stairsY || 0;
        dm.shopX = data.shopX || 0;
        dm.shopY = data.shopY || 0;
        dm.hasShop = data.hasShop || false;
        dm.theme = data.theme || 'mixed';
        dm.themeDesc = data.themeDesc || '';
        dm.floorTint = data.floorTint || '#37474F';
        dm.hazards = data.hazards || [];
        dm.treasureRooms = data.treasureRooms || [];
        dm.secretPassages = data.secretPassages || [];
        return dm;
    }

    toSnapshot() {
        return {
            width: this.width,
            height: this.height,
            grid: this.grid,
            rooms: this.rooms,
            enemySpawns: this.enemySpawns,
            stairsX: this.stairsX,
            stairsY: this.stairsY,
            shopX: this.shopX,
            shopY: this.shopY,
            hasShop: this.hasShop,
            theme: this.theme,
            themeDesc: this.themeDesc,
            floorTint: this.floorTint,
            hazards: this.hazards,
            treasureRooms: this.treasureRooms,
            secretPassages: this.secretPassages,
        };
    }
}
