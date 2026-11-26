import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const world = { console };
world.window = world;
for (const f of ['realm.js', 'emberdeep.js']) new Function('window', read(f))(world);
const { CC } = world, EM = CC.Emberdeep, T = CC.TILE || 32;
const tile = p => [Math.floor(p.x / T), Math.floor(p.y / T)];

function reach(map, from) {
  const seen = new Set([from.join(',')]), q = [from];
  for (let i = 0; i < q.length; i++) { const [x, y] = q[i]; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (x + dx) + ',' + (y + dy); if (seen.has(k) || map.isSolidTile(x + dx, y + dy)) continue; seen.add(k); q.push([x + dx, y + dy]); } }
  return seen;
}

test('the Boiling Descent is connected, has lava, geysers and a way down for many seeds', () => {
  for (const seed of [1, 2, 3, 5, 8, 13, 21, 34, 55]) {
    const map = EM.generate(1, seed);
    assert.equal(map.name, 'The Boiling Descent');
    const seen = reach(map, tile(map.spawn));
    assert.ok(seen.has(tile(map.stairs).join(',')), 'stairs reachable, seed ' + seed);
    assert.ok(seen.has(tile(map.retreat).join(',')), 'return stair reachable');
    for (const e of map.enemySpawns) assert.ok(seen.has(tile(e).join(',')), e.type + ' reachable');
    for (const c of map.chests) assert.ok(seen.has(tile(c).join(',')), 'chest reachable');
    assert.ok(map.geysers.length >= 4);
    assert.ok(map.kind.some(k => k === 5), 'lava pools');
    for (let i = 0; i < map.kind.length; i++) if (map.kind[i] === 5) assert.equal(map.tiles[i], 1, 'lava is impassable');
  }
});

test('the Core: a lava ring crossed by causeways leads to the island with the Emberheart', () => {
  for (const seed of [1, 7, 99]) {
    const map = EM.generate(2, seed);
    assert.equal(map.name, 'The Core');
    const seen = reach(map, tile(map.spawn));
    assert.ok(seen.has(tile(map.bossPoint).join(',')), 'the island is reachable over the causeways');
    assert.deepEqual(map.enemySpawns.map(e => e.type), ['emberheart']);
    const ring = map.kind.reduce((n, k) => n + (k === 5 ? 1 : 0), 0);
    assert.ok(ring > 150, 'a ring of lava: ' + ring);
  }
  assert.throws(() => EM.generate(3, 1), RangeError);
});

test('hazards are telegraphed before they hurt, and the curse flag saves', () => {
  EM.setCursed(false);
  assert.equal(EM.isCursed(), false);
  EM.setCursed(true);
  assert.equal(EM.serialize(), 1);
  EM.reset();
  assert.equal(EM.isCursed(), false);
  EM.burst(0, 0, 30, 0.9, 10);
  assert.equal(EM.hazards.length, 1);
  assert.equal(EM.hazards[0].done, false);
});

test('the shell is wired: scripts, travel, quest and the open furnace door', () => {
  const html = read('index.html'), main = read('main.js'), story = read('cinderwake_story.js');
  assert.ok(html.indexOf('emberdeep.js') > html.indexOf('cinderwake_story.js') && html.indexOf('emberdeep.js') < html.indexOf('"main.js"'));
  assert.match(main, /CC\.enterEmberdeep/);
  assert.match(main, /CC\.leaveEmberdeep/);
  assert.match(story, /Emberdeep\.enter/);
  assert.match(read('questnav.js'), /THE SOURCE OF THE CURSE/);
});
