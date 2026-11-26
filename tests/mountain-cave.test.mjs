import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const world = {};
for (const file of ['realm.js', 'rockpass.js', 'mountain_cave.js']) {
  const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  new Function('window', source)(world);
}
const { MountainCave, RockPass, TILE } = world.CC;
const seeds = [...Array.from({ length: 32 }, (_, index) => index), 0xffffffff];

function tileAt(point) {
  return [Math.floor(point.x / TILE), Math.floor(point.y / TILE)];
}

function reachableTiles(map) {
  const tile = tileAt(map.spawn);
  assert.equal(map.isSolidTile(...tile), false, 'spawn is walkable');
  const queue = [tile];
  const seen = new Set([tile.join(',')]);
  for (let index = 0; index < queue.length; index++) {
    const [x, y] = queue[index];
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const next = [x + dx, y + dy];
      const key = next.join(',');
      if (map.isSolidTile(...next) || seen.has(key)) continue;
      queue.push(next);
      seen.add(key);
    }
  }
  return seen;
}

function assertReachable(seen, point, label) {
  assert.ok(point, label + ' exists');
  assert.ok(seen.has(tileAt(point).join(',')), label + ' is reachable');
}

test('Rocky Pass keeps the village road open and marks a separate, walkable cave mouth', () => {
  for (const seed of seeds) {
    const pass = RockPass.generate(seed);
    RockPass.debugSolve(pass); // the thornwall plugs the last passage until the puzzle is solved
    const seen = reachableTiles(pass);
    assertReachable(seen, pass.passExit, 'village gate for seed ' + seed);
    assertReachable(seen, pass.caveEntrance, 'cave entrance for seed ' + seed);
    assert.ok(Math.hypot(pass.caveEntrance.x - pass.passExit.x, pass.caveEntrance.y - pass.passExit.y) > 6 * TILE);
    const marker = pass.props.find(prop => prop.x === pass.caveEntrance.x && prop.y === pass.caveEntrance.y);
    assert.ok(marker, 'the cave entrance has a visible marker');
    const labels = [];
    const ctx = new Proxy({ fillText(label) { labels.push(label); } }, {
      get(target, member) { return target[member] ?? (() => {}); }
    });
    marker.draw(ctx, 0, 0);
    assert.deepEqual(labels, ['MOUNTAIN CAVE']);
  }
});

test('the first two floors descend and only the third floor has the reward and return point', () => {
  for (const seed of seeds) {
    for (const floor of [1, 2, 3]) {
      const map = MountainCave.generate(floor, seed);
      assert.equal(map.floor, floor);
      const seen = reachableTiles(map);
      const walkableCount = map.tiles.reduce((count, tile) => count + (tile === 0 ? 1 : 0), 0);
      assert.equal(seen.size, walkableCount, 'all chambers and passages are connected');
      assert.ok(map.enemySpawns.length > 0);
      for (const enemy of map.enemySpawns) assertReachable(seen, enemy, enemy.type);
      const occupied = [map.spawn, ...map.enemySpawns];
      if (floor < 3) {
        assertReachable(seen, map.stairs, 'descent on floor ' + floor);
        assert.equal(map.exit, null);
        assert.deepEqual(map.chests, []);
        occupied.push(map.stairs);
      } else {
        // Realm's off-map stairs sentinel leaves ordinary interaction and rendering disabled.
        assert.equal(map.stairs.tx, -1);
        assert.equal(map.stairs.ty, -1);
        assert.equal(map.nearStairs(map.spawn), false);
        assertReachable(seen, map.exit, 'return to Rocky Pass');
        assert.equal(map.chests.length, 1);
        const [reward] = map.chests;
        assertReachable(seen, reward, 'final loot chest');
        assert.ok(reward.tier > 0);
        assert.equal(reward.opened, false);
        assert.equal(map.openChest(reward), true);
        assert.equal(map.openChest(reward), false);
        occupied.push(reward, map.exit);
      }
      assert.equal(new Set(occupied.map(point => tileAt(point).join(','))).size, occupied.length);
    }
  }
  assert.throws(() => MountainCave.generate(4, 10), RangeError);
});

function layout(map) {
  const { tiles, kind, spawn, stairs, enemySpawns, chests, exit, floor, seed } = map;
  return { tiles, kind, spawn, stairs, enemySpawns, chests, exit, floor, seed };
}

test('each floor has its own repeatable layout with variation between seeds', () => {
  const maps = [1, 2, 3].map(floor => MountainCave.generate(floor, 42));
  for (const map of maps) {
    assert.deepEqual(layout(map), layout(MountainCave.generate(map.floor, 42)));
    assert.notDeepEqual(map.tiles, MountainCave.generate(map.floor, 43).tiles);
  }
  assert.equal(new Set(maps.map(map => map.tiles.join(''))).size, 3);
});
