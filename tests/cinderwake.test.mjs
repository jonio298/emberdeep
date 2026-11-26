import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const world = {};
for (const file of ['realm.js', 'cinderwake.js']) {
  const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  new Function('window', source)(world);
}
const { CC } = world;
const { Cinderwake, TILE } = CC;
const seeds = [...Array.from({ length: 32 }, (_, index) => index), 0xffffffff];
const floorNames = ['Ashfall Stair', 'The Slag Warrens', 'The Hearth'];

function tileAt(point) {
  return [Math.floor(point.x / TILE), Math.floor(point.y / TILE)];
}

function reachableTiles(map) {
  const start = tileAt(map.spawn);
  assert.equal(map.isSolidTile(...start), false, 'spawn is walkable');
  const queue = [start];
  const seen = new Set([start.join(',')]);
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

test('Cinderwake connects every chamber and objective on all three floors across 33 seeds', () => {
  const types = new Set();
  for (const seed of seeds) {
    for (const floor of [1, 2, 3]) {
      const map = Cinderwake.generate(floor, seed);
      const label = 'floor ' + floor + ', seed ' + seed;
      const seen = reachableTiles(map);
      const assertReachable = (point, name) => {
        assert.ok(point, name + ' exists on ' + label);
        assert.ok(seen.has(tileAt(point).join(',')), name + ' is reachable on ' + label);
      };
      assert.equal(map.realm, true);
      assert.equal(map.floor, floor);
      assert.equal(map.name, floorNames[floor - 1]);
      assert.equal(map.seed, seed);
      assert.equal(seen.size, map.tiles.filter((tile) => tile === 0).length, label);
      assertReachable(map.ghost, 'ghost');
      const occupied = [map.spawn, map.ghost, ...map.enemySpawns];
      assert.ok(map.enemySpawns.length > 0, label);
      for (const enemy of map.enemySpawns) {
        types.add(enemy.type);
        assertReachable(enemy, enemy.type);
      }

      const bosses = map.enemySpawns.filter((enemy) => enemy.type === 'hearthkeeper');
      if (floor < 3) {
        assertReachable(map.stairs, 'descent');
        occupied.push(map.stairs);
        assert.equal(map.exit, null);
        assert.equal(bosses.length, 0);
        if (floor === 1) {
          assertReachable(map.retreat, 'return stair');
          occupied.push(map.retreat);
        }
      } else {
        assert.equal(bosses.length, 1);
        assert.equal(map.stairs.tx, -1);
        assert.equal(map.nearStairs(map.spawn), false);
        assertReachable(map.exit, 'return to the cellar vault');
        const [reward] = map.chests;
        assertReachable(reward, 'reward chest');
        assert.equal(reward.tier, 3);
        assert.equal(reward.opened, false);
        assert.equal(map.openChest(reward), true);
        assert.equal(map.openChest(reward), false);
        occupied.push(map.exit, reward);
      }
      assert.equal(new Set(occupied.map((point) => tileAt(point).join(','))).size, occupied.length, label);
    }
  }
  assert.deepEqual([...types].sort(), ['candlewraith', 'embermoth', 'hearthkeeper', 'slagcrawler', 'sootwretch']);
});

test('Cinderwake layouts are repeatable and vary by seed', () => {
  for (const floor of [1, 2, 3]) {
    const map = Cinderwake.generate(floor, 42);
    const repeat = Cinderwake.generate(floor, 42);
    assert.deepEqual(repeat.tiles, map.tiles);
    assert.deepEqual(repeat.enemySpawns, map.enemySpawns);
    assert.notDeepEqual(Cinderwake.generate(floor, 43).tiles, map.tiles);
  }
  assert.throws(() => Cinderwake.generate(0, 42), RangeError);
  assert.throws(() => Cinderwake.generate(4, 42), RangeError);
});

test('Cinderwake draws its Realm layers, shows ghost speech, and delegates travel', () => {
  const map = Cinderwake.generate(3, 42);
  const labels = [], dialogue = [];
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({
    globalAlpha: 1,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    fillText(label) { labels.push(label); }
  }, {
    get(target, member) { return target[member] ?? (() => {}); }
  });
  world.document = { createElement: () => ({ getContext: () => ctx }) };
  CC.state = { area: 'village-cellar', player: { ...map.spawn } };
  CC.enterCinderwake = () => {
    Object.assign(CC.state, { area: 'cinderwake', map });
    return true;
  };
  CC.leaveCinderwake = () => {
    CC.state.area = 'village-cellar';
    return true;
  };
  CC.DialogBox = { draw(c, w, h, addHit, speech) { dialogue.push(speech); } };
  assert.equal(Cinderwake.nearAction(), false);
  assert.equal(Cinderwake.interact(), false);
  assert.equal(Cinderwake.enter(), true);
  assert.equal(Cinderwake.nearAction(), false);

  CC.state.player = { ...map.ghost };
  assert.equal(Cinderwake.nearAction(), true);
  assert.equal(Cinderwake.interact(), true);
  const cam = { x: map.ghost.x - 360, y: map.ghost.y - 430, w: 720, h: 560 };
  map.draw(ctx, cam);
  map.drawFront(ctx, cam);
  map.drawLighting(ctx, cam);
  Cinderwake.drawOverlay(ctx, cam.w, cam.h);
  assert.ok(labels.includes('The Cinderwake'));
  assert.ok(labels.includes('The Hearth'));
  assert.equal(dialogue[0].name, 'The Ledger-Clerk');
  assert.match(dialogue[0].text, /Halric/);
  assert.equal(Cinderwake.interact(), true);
  Cinderwake.drawOverlay(ctx, cam.w, cam.h);
  assert.notEqual(dialogue[1].text, dialogue[0].text);

  CC.state.player = { ...map.exit };
  assert.equal(Cinderwake.nearAction(), true);
  assert.equal(Cinderwake.interact(), true);
  assert.equal(CC.state.area, 'village-cellar');
  assert.equal(Cinderwake.nearAction(), false);
  Cinderwake.drawOverlay(ctx, cam.w, cam.h);
  assert.equal(dialogue.length, 2, 'leaving clears speech');
});
