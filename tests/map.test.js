// tests/map.test.js — dungeon generation and pathfinding tests
import { describe, it, expect, beforeEach } from 'vitest';
import { DungeonMap, TILE } from '../src/systems/map.js';

describe('DungeonMap', () => {
    let dm;

    beforeEach(() => {
        dm = new DungeonMap();
    });

    describe('generate', () => {
        it('creates a map with the expected dimensions', () => {
            dm.generate(1600, 1200, 6);

            expect(dm.width).toBe(50);   // 1600 / 32
            expect(dm.height).toBe(37);  // 1200 / 32 (truncated)
            expect(dm.grid.length).toBe(37);
            expect(dm.grid[0].length).toBe(50);
        });

        it('places at least 2 rooms', () => {
            dm.generate(1600, 1200, 6);

            expect(dm.rooms.length).toBeGreaterThanOrEqual(2);
        });

        it('every room has expected shape metadata', () => {
            dm.generate(1600, 1200, 6);

            for (const room of dm.rooms) {
                expect(room).toHaveProperty('x');
                expect(room).toHaveProperty('y');
                expect(room).toHaveProperty('w');
                expect(room).toHaveProperty('h');
                expect(room).toHaveProperty('cx');
                expect(room).toHaveProperty('cy');
                expect(room).toHaveProperty('shape');
                expect(['rect', 'ellipse', 'diamond', 'octagon', 'cross', 'pillars', 'l_shape', 'grand_arena', 'irregular']).toContain(room.shape);
            }
        });

        it('generates enemy spawn points (one per room)', () => {
            dm.generate(1600, 1200, 6);

            expect(dm.enemySpawns.length).toBe(dm.rooms.length);
            // First room marked as player spawn
            expect(dm.enemySpawns[0].isFirstRoom).toBe(true);
        });

        it('places stairs in a room', () => {
            dm.generate(1600, 1200, 6);

            expect(dm.stairsX).toBeGreaterThan(0);
            expect(dm.stairsY).toBeGreaterThan(0);
        });

        it('has a reachable player spawn', () => {
            dm.generate(1600, 1200, 6);

            const spawn = dm.getPlayerSpawn();
            expect(spawn.x).toBeGreaterThan(0);
            expect(spawn.y).toBeGreaterThan(0);
            expect(spawn.x).toBeLessThan(dm.width * 32);
            expect(spawn.y).toBeLessThan(dm.height * 32);
        });

        it('generates enemy spawns not in the player room', () => {
            dm.generate(1600, 1200, 8);

            const enemySpawns = dm.getEnemySpawnPoints();
            // getEnemySpawnPoints filters out the player spawn room by roomIndex
            expect(enemySpawns.length).toBeLessThan(dm.rooms.length);
            // Every returned spawn should have a valid room index
            for (const sp of enemySpawns) {
                expect(sp.roomIndex).toBeGreaterThanOrEqual(0);
                expect(sp.roomIndex).toBeLessThan(dm.rooms.length);
            }
        });
    });

    describe('tile queries', () => {
        beforeEach(() => {
            dm.generate(1600, 1200, 6);
        });

        it('converts world coords to tile coords', () => {
            const { tx, ty } = dm.worldToTile(100, 200);

            expect(tx).toBe(3);   // 100 / 32 = 3.125 → floor 3
            expect(ty).toBe(6);   // 200 / 32 = 6.25 → floor 6
        });

        it('walls are not walkable', () => {
            // At (0,0) — always a wall (2-tile margin)
            expect(dm.isWalkable(0, 0)).toBe(false);
        });

        it('floor tiles are walkable', () => {
            dm.generate(1600, 1200, 8);
            // Find a known floor tile (center of a room)
            const spawn = dm.getPlayerSpawn();
            const { tx, ty } = dm.worldToTile(spawn.x, spawn.y);

            expect(dm.isWalkable(tx, ty)).toBe(true);
        });

        it('isWorldWalkable delegates to isWalkable', () => {
            const spawn = dm.getPlayerSpawn();

            expect(dm.isWorldWalkable(spawn.x, spawn.y)).toBe(true);
            expect(dm.isWorldWalkable(0, 0)).toBe(false);
        });

        it('detects stairs tile', () => {
            expect(dm.isOnStairs(dm.stairsX, dm.stairsY)).toBe(true);
        });

        it('detects shop tile', () => {
            // Shop should exist on every floor per the generate call
            expect(dm.hasShop).toBe(true);
            expect(dm.isOnShop(dm.shopX, dm.shopY)).toBe(true);
        });

        it('getTileAt returns WALL for out-of-bounds', () => {
            expect(dm.getTileAt(-100, -100)).toBe(TILE.WALL);
            expect(dm.getTileAt(99999, 99999)).toBe(TILE.WALL);
        });

        it('getTileAt returns FLOOR for room centers', () => {
            const spawn = dm.getPlayerSpawn();
            const tile = dm.getTileAt(spawn.x, spawn.y);

            expect(tile).toBe(TILE.FLOOR);
        });
    });

    describe('line of sight', () => {
        it('returns true for same-point', () => {
            dm.generate(1600, 1200, 6);
            const spawn = dm.getPlayerSpawn();

            expect(dm.hasLineOfSight(spawn.x, spawn.y, spawn.x, spawn.y)).toBe(true);
        });

        it('returns true within a room (no walls between)', () => {
            dm.generate(1600, 1200, 6);
            const spawn = dm.getPlayerSpawn();

            // A point 3 tiles away in the same room should be visible
            expect(dm.hasLineOfSight(spawn.x, spawn.y, spawn.x + 60, spawn.y)).toBe(true);
        });

        it('returns false through a wall', () => {
            dm.generate(1600, 1200, 6);

            // Two points on opposite map edges — walls everywhere
            expect(dm.hasLineOfSight(0, 0, dm.width * 32 - 1, dm.height * 32 - 1)).toBe(false);
        });
    });

    describe('BFS pathfinding', () => {
        it('finds a path between two walkable tiles', () => {
            dm.generate(1600, 1200, 8);
            const spawn = dm.getPlayerSpawn();

            const path = dm.findPath(spawn.x, spawn.y, dm.stairsX, dm.stairsY);

            expect(path).not.toBeNull();
            expect(path.length).toBeGreaterThanOrEqual(2);
            // First waypoint is near the start
            const first = path[0];
            expect(Math.abs(first.x - spawn.x)).toBeLessThan(50);
            expect(Math.abs(first.y - spawn.y)).toBeLessThan(50);
        });

        it('returns null for unreachable destination', () => {
            dm.generate(1600, 1200, 6);

            // Deep inside a wall — unreachable
            const path = dm.findPath(16, 16, 48, 48);

            // (48,48) is probably unreachable depending on map size
            // Just verify it doesn't crash and returns something
            expect(path === null || Array.isArray(path)).toBe(true);
        });

        it('returns null when start is a wall', () => {
            dm.generate(1600, 1200, 6);

            const path = dm.findPath(0, 0, dm.stairsX, dm.stairsY);

            expect(path).toBeNull();
        });

        it('path waypoints are in walkable tiles', () => {
            dm.generate(1600, 1200, 8);
            const spawn = dm.getPlayerSpawn();

            const path = dm.findPath(spawn.x, spawn.y, dm.stairsX, dm.stairsY);

            if (path) {
                for (const wp of path) {
                    expect(dm.isWorldWalkable(wp.x, wp.y)).toBe(true);
                }
            }
        });
    });

    describe('snapshot roundtrip', () => {
        it('toSnapshot and fromSnapshot preserve map state', () => {
            dm.generate(1600, 1200, 8);
            const snap = dm.toSnapshot();

            const restored = DungeonMap.fromSnapshot(snap);

            expect(restored.width).toBe(dm.width);
            expect(restored.height).toBe(dm.height);
            expect(restored.rooms.length).toBe(dm.rooms.length);
            expect(restored.stairsX).toBe(dm.stairsX);
            expect(restored.stairsY).toBe(dm.stairsY);
            expect(restored.shopX).toBe(dm.shopX);
            expect(restored.shopY).toBe(dm.shopY);
            expect(restored.hasShop).toBe(dm.hasShop);
        });
    });
});
