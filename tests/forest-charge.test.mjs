import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function bootForest() {
  const spawns = [];
  const CC = {
    TILE: 32,
    Realm: {
      hash(x, y) { const z = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return z - Math.floor(z); },
      create(o) { return { ...o, openChest(c) { if (!c || c.opened) return false; c.opened = true; return true; } }; }
    },
    Enemies: {
      TYPES: { scarecrow: { name: 'Scarecrow Horror' } },
      list: [], projectiles: [],
      _think() {}, spawnForFloor() {},
      spawn(type, x, y, floor, opts) {
        const e = { type, x, y, floor, ...opts }; spawns.push(e); return e;
      }
    }
  };
  const window = { CC }; window.window = window;
  let source = readFileSync(new URL('../forest.js', import.meta.url), 'utf8');
  source = source
    .replace("if (trails.length < 3) return null;", "if (trails.length < 3) { F._rejects.push('trails'); return null; }")
    .replace("if (!trapShack) return null;", "if (!trapShack) { F._rejects.push('shack'); return null; }")
    .replace("if(!side)return null;", "if(!side){ F._rejects.push('ascent'); return null; }")
    .replace("if (!ok) return null;", "if (!ok) { F._rejects.push('reachability'); return null; }");
  runInNewContext(source, window, { filename: 'forest.js' });
  return { CC, spawns };
}

test('Giant Forest always creates a roadside shack with a reachable trapped chest', () => {
  for (const seed of [101, 202, 303]) {
    const { CC, spawns } = bootForest();
    CC.Forest._rejects = [];
    let map;
    try { map = CC.Forest.generate(seed); }
    catch (e) { throw new Error('Forest seed ' + seed + ' failed: ' + CC.Forest._rejects.join(', '), { cause: e }); }
    const traps = map.chests.filter(c => c.forestScarecrowTrap);
    assert.equal(traps.length, 1, 'exactly one shack trap per map');
    assert.equal(map.trapShack.w, 5);
    assert.equal(map.trapShack.h, 4);
    const chest = traps[0];
    assert.equal(map.openChest(chest), true);
    assert.equal(map.openChest(chest), false);
    assert.equal(spawns.length, 1, 'spawns once on opening');
    assert.equal(spawns[0].type, 'scarecrow');
    assert.equal(spawns[0].dormant, false);
    assert.equal(spawns[0].asleep, false);
  }
});

function bootThief(ranks = 0, perk = false) {
  const hits = [], rings = [], knives = [];
  const player = { isHero: true, classId: 'thief', x: 20, y: 20, face: 1,
    stats: { dmg: 20 }, maxMana: 100, mana: 100, hp: 60,
    level: 1, chargeSel: 0, flags: perk ? { shadowchain: 1 } : {} };
  const enemies = [60, 90, 112, 132, 157].map((x, i) => ({ id: i, x, y: 20, r: 8, hp: 1000 }));
  const CC = {
    state: { mode: 'dungeon', player },
    Enemies: { list: enemies },
    Classes: { hitEnemy(e) { hits.push(e.id); return 1; },
      _h: { shoot(...args) { knives.push(args); } } },
    SkillTree: {
      chargeSelected() { return 0; },
      chargeSkills() { return [{ name: 'Shadow Flurry' }]; },
      rank(p, id) { return id === 'm_cutthroat' ? ranks : 0; }
    }
  };
  const window = { CC }; window.window = window;
  runInNewContext(readFileSync(new URL('../charge.js', import.meta.url), 'utf8'), window, { filename: 'charge.js' });
  const ctx = {
    save() {}, restore() {}, translate() {}, rotate() {}, beginPath() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {},
    ellipse() {}, fillRect() {}, arc(x, y, r) { if (this.strokeStyle === '#ff3b4e' || this.strokeStyle === '#e85d69') rings.push({ x, y, r }); }
  };
  return { CC, player, hits, rings, knives, ctx };
}

test('first-level Shadow Flurry marks exactly one enemy and only strikes that enemy', () => {
  const b = bootThief();
  b.CC.Charge.update(0.23, true);
  b.CC.Charge.update(0.6, true);
  b.CC.Charge.draw(b.ctx, { x: 0, y: 0 });
  assert.ok(b.rings.some(r => r.x === 60 && r.y === 20), 'red lock circle follows the nearest enemy');
  assert.ok(!b.rings.some(r => r.x === 90), 'second enemy is not marked');
  b.CC.Charge.update(0.02, false);
  assert.deepEqual(b.hits, [0]);
  assert.equal(b.knives.length, 2, 'two knives are fired on landing');
  assert.equal(b.knives[0][6], 'shard');
  assert.equal(b.knives[1][7], 'knife');
  assert.equal(b.player.mana, 70);
});

test('Cutthroat skill ranks and Shadow Chain perk expand the marked-target cap', () => {
  for (const [ranks, perk, expected] of [[1, false, 2], [2, false, 3], [2, true, 5]]) {
    const b = bootThief(ranks, perk);
    b.CC.Charge.update(0.23, true);
    b.CC.Charge.update(0.6, true);
    b.CC.Charge.update(0.02, false);
    assert.equal(b.hits.length, expected);
    assert.equal(new Set(b.hits).size, expected);
  }
});
