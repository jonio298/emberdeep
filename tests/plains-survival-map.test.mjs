import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function fixture() {
  const sandbox = vm.createContext({ console });
  sandbox.window = sandbox;
  for (const file of ['realm.js', 'plains.js']) {
    vm.runInContext(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), sandbox, { filename: file });
  }
  return sandbox.CC;
}

const SEEDS = [1, 7, 42, 1234, 99999, 2026, 0xdeadbeef];
const T = 32;

function reachable(map) {
  const { w, h, tiles } = map;
  const sx = Math.floor(map.spawn.x / T), sy = Math.floor(map.spawn.y / T);
  const seen = new Uint8Array(w * h), queue = [sy * w + sx];
  seen[queue[0]] = 1;
  for (let i = 0; i < queue.length; i++) {
    const x = queue[i] % w, y = (queue[i] / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, n = ny * w + nx;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[n] || tiles[n]) continue;
      seen[n] = 1; queue.push(n);
    }
  }
  return seen;
}

test('arena is smaller than the campaign, with a walkable centre and reachable spawn candidates', () => {
  const CC = fixture();
  for (const seed of SEEDS) {
    const map = CC.Plains.generateSurvival(seed);
    assert.ok(map.w < 200 && map.h < 112, `seed ${seed}: ${map.w}x${map.h}`);
    assert.equal(map.tiles.length, map.w * map.h);
    assert.equal(map.isSolid(map.spawn.x, map.spawn.y), false);
    assert.equal(map.spawn.tx, map.w >> 1);
    assert.equal(map.spawn.ty, map.h >> 1);
    assert.ok(map.enemySpawns.length >= 16, `seed ${seed}: ${map.enemySpawns.length} spawns`);
    const seen = reachable(map);
    for (const sp of map.enemySpawns) {
      assert.equal(map.isSolid(sp.x, sp.y), false, `seed ${seed}: spawn in a wall`);
      assert.equal(seen[Math.floor(sp.y / T) * map.w + Math.floor(sp.x / T)], 1, `seed ${seed}: unreachable spawn`);
      assert.ok(Math.hypot(sp.x - map.spawn.x, sp.y - map.spawn.y) >= 20 * T);
    }
    // kiting room: most of the interior is open
    let open = 0;
    for (let i = 0; i < map.tiles.length; i++) if (!map.tiles[i]) open++;
    assert.ok(open / map.tiles.length > 0.8, `seed ${seed}: open ${open / map.tiles.length}`);
  }
});

test('the same seed reproduces terrain, centre and spawn candidates; different seeds differ', () => {
  const CC = fixture();
  const a = CC.Plains.generateSurvival(555), b = CC.Plains.generateSurvival(555), c = CC.Plains.generateSurvival(556);
  assert.deepEqual(Array.from(a.tiles), Array.from(b.tiles));
  assert.deepEqual(Array.from(a.kind), Array.from(b.kind));
  assert.equal(JSON.stringify(a.spawn), JSON.stringify(b.spawn));
  assert.equal(JSON.stringify(a.enemySpawns), JSON.stringify(b.enemySpawns));
  assert.equal(a.seed, 555);
  assert.notDeepEqual(Array.from(a.tiles), Array.from(c.tiles));
});

test('boundary is solid and the arena has no exits, NPCs, chests or quest triggers', () => {
  const CC = fixture();
  for (const seed of SEEDS) {
    const map = CC.Plains.generateSurvival(seed);
    for (let x = 0; x < map.w; x++) for (let t = 0; t < 2; t++) {
      assert.equal(map.tiles[t * map.w + x], 1);
      assert.equal(map.tiles[(map.h - 1 - t) * map.w + x], 1);
    }
    for (let y = 0; y < map.h; y++) for (let t = 0; t < 2; t++) {
      assert.equal(map.tiles[y * map.w + t], 1);
      assert.equal(map.tiles[y * map.w + map.w - 1 - t], 1);
    }
    assert.equal(map.isSolid(-50, -50), true);
    assert.ok(map.stairs.tx < 0 && map.stairs.x < 0, 'no stairs / exits');
    assert.equal(map.npcs.length, 0);
    assert.equal(map.chests.length, 0);
    assert.equal(map.camp, undefined);
    assert.equal(map.passGate, undefined);
    assert.equal(map.slide, undefined);
    assert.equal(map.pond, undefined);
    assert.equal(map.props.some(p => p.npc || p.talk), false);
    assert.equal(map.survival, true);
    assert.ok(map.landmarks.length >= 5);
  }
});

test('creating an arena leaves the active campaign map and quest state intact', () => {
  const CC = fixture();
  const campaign = CC.Plains.generate(31337);
  const camp = { tiles: Array.from(campaign.tiles), npcs: campaign.npcs.length, chests: campaign.chests.length, spawns: JSON.stringify(campaign.enemySpawns), seed: campaign.seed };
  const quest = { area: 'plains', quests: { eggs: { hatched: true }, plains: { stage: 2 } }, flags: ['a', 'b'] };
  CC.state = JSON.parse(JSON.stringify(quest));
  CC.Dungeon = campaign;
  const before = JSON.stringify(CC.state);
  const title = CC.Plains.titleStart, speech = CC.Plains.speech;
  const colour = campaign.tiles.length; // campaign shading must survive too: sample a tile's ground before and after
  const arena = CC.Plains.generateSurvival(31337);
  assert.notEqual(arena, campaign);
  assert.equal(CC.Plains.map, campaign);
  assert.equal(CC.Dungeon, campaign);
  assert.equal(JSON.stringify(CC.state), before);
  assert.equal(CC.Plains.titleStart, title);
  assert.equal(CC.Plains.speech, speech);
  assert.equal(campaign.tiles.length, colour);
  assert.deepEqual(Array.from(campaign.tiles), camp.tiles);
  assert.equal(campaign.npcs.length, camp.npcs);
  assert.equal(campaign.chests.length, camp.chests);
  assert.equal(JSON.stringify(campaign.enemySpawns), camp.spawns);
  assert.equal(campaign.seed, camp.seed);
  assert.equal(campaign.w, 200);
  assert.equal(campaign.h, 112);
});
