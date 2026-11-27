import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const proxyCtx = () => new Proxy({ measureText: s => ({ width: String(s).length * 5 }), createRadialGradient: () => ({ addColorStop() {} }), createLinearGradient: () => ({ addColorStop() {} }) }, { get: (t, m) => (m in t ? t[m] : () => {}), set: () => true });

function dayNight(area = 'forest') {
  const world = { performance, console };
  world.window = world;
  const CC = world.CC = {};
  const list = [];
  CC.state = { mode: 'dungeon', area, map: { ambient: '17,25,21,0.40', playerLight: 200 }, player: { x: 0, y: 0 } };
  CC.Enemies = { list, _time: 0, update() {}, draw() {} };
  CC.Forest = { drawMonster: () => false };
  new Function('window', read('daynight.js'))(world);
  const step = (sec, dt = 1) => { for (let t = 0; t < sec; t += dt) CC.Enemies.update(dt); };
  return { CC, D: CC.DayNight, list, step };
}

test('it starts at day and switches every 10 minutes, fading over about half a minute', () => {
  const { D, step } = dayNight();
  assert.equal(D.isNight(), false);
  step(595);
  assert.equal(D.isNight(), false);
  step(5 + 40);
  assert.equal(D.isNight(), true, 'night after 10 minutes');
  assert.equal(D.nightness(), 1);
  step(600);
  assert.equal(D.isNight(), false, 'and back to day 10 minutes later');
});

test('night darkens the forest map and the monsters get +15% health and +20% damage, undone at dawn', () => {
  const { CC, D, list, step } = dayNight('forest');
  const wolf = { type: 'direwolf', hp: 40, maxHp: 40, dmg: 10, r: 11 };
  list.push(wolf);
  step(5);
  assert.equal(wolf.maxHp, 40);
  D.restore({ t: 600 });
  step(40);
  assert.ok(Math.abs(wolf.maxHp - 46) < 1e-9 && Math.abs(wolf.hp - 46) < 1e-9 && Math.abs(wolf.dmg - 12) < 1e-9);
  assert.ok(Math.abs(+CC.state.map.ambient.split(',')[3] - 0.66) < 0.04, 'night is deep but the world beyond your light stays faintly visible');
  assert.ok(CC.state.map.playerLight < 200 && CC.state.map.playerLight > 90, 'a modest lit circle at night');
  D.restore({ t: 1200 });
  step(40);
  assert.ok(Math.abs(wolf.maxHp - 40) < 1e-9 && Math.abs(wolf.dmg - 10) < 1e-9);
  assert.equal(CC.state.map.ambient, '17,25,21,0.400');
});

test('caves and the Cinderwake are never affected', () => {
  const { D, list, step, CC } = dayNight('cave');
  const bat = { type: 'bat', hp: 10, maxHp: 10, dmg: 5, r: 8 };
  list.push(bat);
  D.restore({ t: 600 });
  step(40);
  assert.equal(bat.maxHp, 10);
  assert.equal(CC.state.map.ambient, '17,25,21,0.400');
});

test('sleeping in the tent skips the night; the clock saves and loads', () => {
  const { D, step } = dayNight();
  D.restore({ t: 700 });
  step(35);
  assert.equal(D.isNight(), true);
  assert.equal(D.skipToMorning(), true);
  assert.equal(D.serialize().t, 1200);
  step(40);
  assert.equal(D.isNight(), false);
  assert.equal(D.skipToMorning(), false, 'nothing to skip in the daytime');
});

test('scarier eyes and werewolves draw at night without error', () => {
  const { CC, D, list, step } = dayNight('plains');
  list.push({ type: 'bat', x: 50, y: 50, r: 6, face: 1, hp: 5 }, { type: 'skeleton', x: 80, y: 60, r: 9, face: -1, hp: 5 }, { type: 'direwolf', x: 100, y: 80, r: 11, face: 1, hp: 5, anim: 1 });
  D.restore({ t: 600 });
  step(40);
  CC.Enemies.draw(proxyCtx(), { x: 0, y: 0, w: 300, h: 300 });
  assert.equal(CC.Forest.drawMonster(proxyCtx(), list[2], 11, '#555', '#222', 0), true, 'a dire wolf is drawn as a werewolf at night');
  D.restore({ t: 0 });
  step(40);
  assert.equal(CC.Forest.drawMonster(proxyCtx(), list[2], 11, '#555', '#222', 0), false, 'by day the normal art is used');
  D.drawHud(proxyCtx(), 360, 640);
});

test('the dialog box is painted last and a tap runs onTap', () => {
  const world = { console };
  world.window = world;
  new Function('window', read('dialogbox.js'))(world);
  const D = world.CC.DialogBox, drawn = [];
  const ctx = proxyCtx();
  const orig = ctx.fillText;
  let tapped = 0;
  D.draw(ctx, 360, 640, () => {}, { name: 'Ghost', text: 'Hello there', low: true, onTap() { tapped++; } });
  assert.equal(D.hasTap(), false, 'nothing is shown until the frame is flushed');
  D.flush(ctx, () => {});
  assert.equal(D.hasTap(), true);
  assert.equal(D.tap(), true);
  assert.equal(tapped, 1);
  assert.equal(D.tap(), false, 'one tap per prompt');
});

function pass() {
  const world = { console };
  world.window = world;
  for (const f of ['realm.js', 'rockpass.js']) new Function('window', read(f))(world);
  return world.CC;
}

test('the Rocky Pass is a long maze with dead ends and a solvable sunbeam puzzle behind a thornwall', () => {
  const CC = pass(), RP = CC.RockPass;
  for (const seed of [1, 2, 3, 7, 11, 19, 33]) {
    const map = RP.generate(seed);
    assert.ok(map.w >= 140 && map.h >= 120, 'a big map');
    const pz = map.puzzle, h = pz.hollow;
    assert.equal(RP.traceBeam(h).hit, false, 'scrambled at the start');
    const before = h.mirrors.map(m => m.o);
    h.mirrors.forEach(m => { if (!m.decoy) m.o = m.want; });
    assert.equal(RP.traceBeam(h).hit, true, 'solvable by turning the mirrors');
    h.mirrors.forEach((m, i) => { m.o = before[i]; });
    const solid = (tx, ty) => map.isSolidTile(tx, ty);
    const bfs = () => {
      const T = 32, sx = Math.floor(map.spawn.x / T), sy = Math.floor(map.spawn.y / T), dist = new Map([[sx + ',' + sy, 0]]), q = [[sx, sy]];
      for (let i = 0; i < q.length; i++) { const [x, y] = q[i]; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (x + dx) + ',' + (y + dy); if (dist.has(k) || solid(x + dx, y + dy)) continue; dist.set(k, dist.get(x + ',' + y) + 1); q.push([x + dx, y + dy]); } }
      return dist;
    };
    const closed = bfs(), gk = Math.floor(map.passExit.x / 32) + ',' + Math.floor(map.passExit.y / 32);
    assert.equal(closed.has(gk), false, 'the thornwall seals the way to the village');
    const station = [pz.spring, pz.stagnant, pz.elder, h.bed, map.caveEntrance];
    for (const s of station) assert.ok(closed.has(Math.floor(s.x / 32) + ',' + Math.floor(s.y / 32)), 'every station is reachable before the thornwall opens');
    RP.debugSolve(map);
    const open = bfs();
    assert.ok(open.has(gk), 'open: the village gate is reachable');
    assert.ok(open.get(gk) > 400, 'a long way: ' + open.get(gk) + ' steps');
    RP.reset();
  }
});

test('when night falls the title card fades in and out; none at game start in daylight or when loading into the night', () => {
  const { D, step } = dayNight('forest');
  step(10);
  assert.equal(D.bannerActive(), false);
  step(595);
  assert.equal(D.bannerActive(), true, 'the card appears the moment night falls');
  D.drawBanner(proxyCtx(), 360, 640);
  step(8);
  assert.equal(D.bannerActive(), false, 'and fades away');
  const again = dayNight('forest');
  again.D.restore({ t: 700 });
  again.step(5);
  assert.equal(again.D.bannerActive(), false, 'loading a save already at night does not replay it');
  const cave = dayNight('cave');
  cave.step(605);
  assert.equal(cave.D.bannerActive(), false, 'not shown down in a cave');
  cave.CC.state.area = 'forest';
  cave.step(1);
  assert.equal(cave.D.bannerActive(), true, 'but shown once you climb back under the night sky');
});
