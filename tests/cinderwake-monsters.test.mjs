import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const IDS = ['sootwretch', 'embermoth', 'slagcrawler', 'candlewraith', 'hearthkeeper'];

function fixture() {
  const sandbox = vm.createContext({ console });
  sandbox.window = sandbox;
  sandbox.CC = { Forest: { drawMonster: () => false } };
  for (const file of ['enemies.js', 'cinderwake_monsters.js']) {
    vm.runInContext(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), sandbox, { filename: file });
  }
  const { CC } = sandbox;
  CC.state = { area: 'cinderwake', player: { x: 400, y: 300, hp: 100, armor: 0, invuln: 0, r: 8 } };
  return CC;
}

// a canvas context that accepts any call: methods are no-ops, properties are assignable
function stubCtx() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
      return () => {};
    },
    set(target, key, value) { target[key] = value; return true; }
  });
}

function spawn(CC, type, x = 300, y = 300) {
  const e = CC.Enemies.spawn(type, x, y, 1, { awake: true });
  e.asleep = false;
  return e;
}

function step(CC, e, seconds, dt = 1 / 30) {
  const p = CC.state.player;
  for (let t = 0; t < seconds; t += dt) {
    const d = Math.hypot(p.x - e.x, p.y - e.y), ang = Math.atan2(p.y - e.y, p.x - e.x);
    e.anim += dt; e.los = true;
    CC.Enemies._think(e, dt, p, d, ang, 1);
    p.invuln = Math.max(0, p.invuln - dt);
  }
}

test('all five Cinderwake ids register with positive hp, damage, speed and radius', () => {
  const CC = fixture();
  for (const id of IDS) {
    const t = CC.Enemies.TYPES[id];
    assert.ok(t, id + ' is registered');
    for (const key of ['hp', 'dmg', 'spd', 'r', 'xp']) assert.ok(t[key] > 0, id + '.' + key + ' > 0');
    assert.equal(t.w, 0, id + ' never spawns outside the Cinderwake');
    const e = spawn(CC, id);
    assert.equal(e.type, id);
    assert.ok(e.maxHp > 0 && e.dmg > 0 && e.spd > 0, id + ' spawns with valid live stats');
  }
  assert.ok(CC.Enemies.TYPES.hearthkeeper.hp > 6 * CC.Enemies.TYPES.slagcrawler.hp, 'the boss is far tougher than the rank and file');
  assert.equal(CC.Enemies.spawn('hearthkeeper', 0, 0, 1).miniBoss, true);
});

test('every monster has a draw function that does not throw on a stub canvas', () => {
  const CC = fixture();
  for (const id of IDS) {
    assert.equal(typeof CC.CinderwakeMonsters.draw[id], 'function', id + ' has art');
    const e = spawn(CC, id);
    for (const state of ['idle', 'telegraph', 'act', 'recover']) {
      e.state = state; e.atk = 'slam'; e.exposed = state === 'act' ? 2 : 0;
      for (const hp of [1, 0.5, 0.1]) {
        e.hp = e.maxHp * hp;
        assert.doesNotThrow(() => CC.CinderwakeMonsters.draw[id](stubCtx(), e, e.r, e.color, '#222', 1.5), id + ' ' + state);
        assert.doesNotThrow(() => CC.Forest.drawMonster(stubCtx(), e, e.r, e.color, '#222', 1.5), id + ' via drawMonster hook');
      }
    }
  }
  assert.equal(CC.Forest.drawMonster(stubCtx(), { type: 'bat' }, 6, '#fff', '#000', 0), false, 'other monsters fall through to the previous art');
});

test('each brain runs for several seconds without throwing and acts distinctly', () => {
  const CC = fixture();
  for (const id of IDS) {
    const e = spawn(CC, id);
    assert.doesNotThrow(() => step(CC, e, 6), id + ' brain');
  }
  // sootwretch: a swing leaves an ash puddle behind
  const w = spawn(CC, 'sootwretch', 380, 300); w.cd = 0;
  step(CC, w, 2);
  assert.ok(CC.CinderwakeMonsters.puddles.length > 0, 'the wretch leaves a puddle');
  assert.ok(CC.CinderwakeMonsters.puddles[0].t > 4, 'it lingers for several seconds');
  // slagcrawler: lobs a marked, burning patch
  const s = spawn(CC, 'slagcrawler', 250, 300); s.cd = 0; CC.Enemies.projectiles.length = 0;
  step(CC, s, 1.5);
  assert.ok(CC.Enemies.projectiles.some(pr => pr.kind === 'glob'), 'the crawler spits a molten glob projectile');
});

test('ember moth bursts on death; candlewraith heals neighbours until the candle goes out', () => {
  const CC = fixture(), P = CC.state.player;
  const m = spawn(CC, 'embermoth', P.x + 10, P.y); P.hp = 100; P.invuln = 0;
  CC.Enemies.damage(m, 999, 'melee');
  assert.equal(m.dead, true);
  assert.ok(P.hp < 100 || CC.Enemies.projectiles.some(pr => pr.ring), 'the death blast goes off');

  const c = spawn(CC, 'candlewraith', 200, 300), brute = spawn(CC, 'sootwretch', 230, 300);
  brute.hp = brute.maxHp * 0.5; const before = brute.hp;
  step(CC, c, 3);
  assert.ok(brute.hp > before, 'the candle heals a nearby monster');
  c.hp = c.maxHp * 0.2; brute.hp = brute.maxHp * 0.5; const low = brute.hp;
  step(CC, c, 3);
  assert.equal(c.candle, false, 'the candle gutters when the wraith is nearly dead');
  assert.ok(brute.hp <= low + 0.001, 'a snuffed candle heals nothing');
});

test('slag armour cracks under burst damage; the Hearthkeeper has rings, a charge, moth summons and an exposed coal', () => {
  const CC = fixture(), E = CC.Enemies;
  const a = spawn(CC, 'slagcrawler'), b = spawn(CC, 'slagcrawler');
  const hpA = a.hp, hpB = b.hp;
  E.damage(a, 20, 'melee'); E.damage(b, 17, 'melee');
  assert.ok(hpA - a.hp > (hpB - b.hp) * 1.2, 'a 20-point hit does clearly more than armour allows a 17-point one');

  const h = spawn(CC, 'hearthkeeper', 300, 300); h.cd = 0;
  E.projectiles.length = 0; step(CC, h, 4);
  assert.ok(E.projectiles.filter(p => p.hostile).length >= 10, 'phase 1 fires an ember ring');

  h.hp = h.maxHp * 0.5; h.summonT = 0; h.state = 'idle';
  const moths = () => E.list.filter(e => e.type === 'embermoth').length;
  const n0 = moths(); step(CC, h, 1);
  assert.ok(moths() >= n0 + 3, 'phase 2 summons three moths');
  assert.equal(h.phase, 2);

  h.state = 'telegraph'; h.atk = 'charge'; h.t = 0.01; h.ang = 0; h.dash = false;
  step(CC, h, 1.2);
  assert.ok(h.exposed > 0 || h.state === 'recover', 'the charge ends with the coal exposed');
  h.exposed = 2; const hp0 = h.hp; E.damage(h, 10, 'melee'); const bare = hp0 - h.hp;
  h.exposed = 0; const hp1 = h.hp; E.damage(h, 10, 'melee');
  assert.ok(bare > hp1 - h.hp, 'damage to the bared coal is higher');

  h.hp = h.maxHp * 0.2; h.state = 'idle'; h.seamT = 0; E.zones.length = 0; step(CC, h, 0.2);
  assert.equal(h.phase, 3);
  assert.ok(E.zones.length >= 3, 'phase 3 opens ember seams around the player');
});
