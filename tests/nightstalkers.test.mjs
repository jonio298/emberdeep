import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

function boot() {
  const world = { console };
  world.window = world;
  const CC = world.CC = {};
  const list = [], shots = [], texts = [];
  const player = { x: 0, y: 0, hp: 100000, maxHp: 100000, armor: 0, invuln: 0, r: 8, level: 12, classId: 'wizard' };
  CC.state = { mode: 'dungeon', area: 'forest', player };
  CC.fx = { text: (x, y, s) => texts.push(s), burst() {}, shake() {}, blood() {} };
  CC.Audio = { fx() {}, event() {} };
  CC.Dungeon = { isSolid: () => false, moveWithCollision(e, dx, dy) { e.x += dx; e.y += dy; return {}; } };
  CC.Loot = { rolls: [], roll(src) { this.rolls.push(src); } };
  CC.Enemies = {
    list, TYPES: {}, _time: 0,
    spawn(type, x, y, lvl) { const T = this.TYPES[type]; const e = { type, x, y, hp: T.hp, maxHp: T.hp, dmg: T.dmg, spd: T.spd, r: T.r, lvl, face: 1, dead: false, asleep: true, flash: 0 }; list.push(e); return e; },
    _think() { throw new Error('the ordinary brain must not run for stalkers'); }, _kill(e) { e.dead = true; e.hp = 0; }, _shoot(e, ang, spd, dmg, col, kind, life) { shots.push({ ang, spd, dmg, col }); },
    update() {}, draw() {}
  };
  CC.Forest = { drawMonster: () => false };
  new Function('window', read('nightstalkers.js'))(world);
  return { CC, NS: CC.NightStalkers, E: CC.Enemies, list, shots, player, texts };
}

test('all nine night stalkers are registered with strong stats and a sprite sheet each', () => {
  const { NS, E } = boot();
  assert.equal(NS.ids.length, 9);
  for (const id of NS.ids) {
    assert.ok(E.TYPES[id].hp >= 330, id + ' is strong');
    assert.ok(Object.keys(NS.DEFS[id].moves).length >= 2, id + ' has several choreographed attacks');
    assert.ok(existsSync(new URL('../assets/night/' + id + '.png', import.meta.url)), id + ' has its atlas');
    for (const m of Object.values(NS.DEFS[id].moves)) for (const st of m.steps) { const f = typeof st.f === 'number' ? st.f : NS.DEFS[id].F[st.f]; assert.ok(f >= 0 && f <= 11, id + ' frame ' + st.f); }
  }
  assert.ok(existsSync(new URL('../art_source/night_monsters/01_grinning_mask_sheet.png', import.meta.url)), 'the renamed originals are in the project');
});

test('each stalker runs its whole choreography: telegraph first, then a strike that hurts, then a recovery', () => {
  for (const id of ['grinmask', 'marionette', 'scytheweaver', 'veiledwidow', 'wailchorus', 'skullbloom', 'cinderhound', 'gloomcrawler', 'gravemaw']) {
    const { NS, E, player, shots, list } = boot();
    const e = E.spawn(id, 140, 0, 12);
    e.ns = { frame: 0, alpha: 1 }; e.nightStalker = true; e.asleep = false;
    const used = new Set(), frames = new Set(); let telegraphed = 0, hurtAt = -1, shotsBefore = 0;
    for (let t = 0; t < 60 * 150; t++) {
      const dx = player.x - e.x, dy = player.y - e.y, d = Math.hypot(dx, dy), ang = Math.atan2(dy, dx), hp = player.hp;
      player.invuln = Math.max(0, player.invuln - 1 / 60);
      E._think = E._think; // (the stalker brain replaces it)
      E._think(e, 1 / 60, player, d, ang, 1);
      if (e.mname) used.add(e.mname);
      frames.add(e.ns.frame);
      if (e.ns.tele) telegraphed++;
      if (player.hp < hp && hurtAt < 0) { hurtAt = t; assert.ok(telegraphed > 6, id + ': a strike is always preceded by a telegraph'); }
      if (e.ns.frame < 0 || e.ns.frame > 11) assert.fail('frame out of range');
      for (const k in e.mcd) e.mcd[k] = Math.max(0, e.mcd[k]);
      if (t % 20 === 0) { player.x = 0; player.y = 0; } // the hero stands her ground
    }
    assert.ok(used.size >= 2, id + ' used several moves: ' + [...used].join(','));
    assert.ok(hurtAt >= 0 || shots.length > 0, id + ' hurt the player or fired');
    assert.ok(frames.size >= 4, id + ' animates through several frames');
  }
});

test('a stalker fades in from the dark first and cannot strike until it is mostly there', () => {
  const { E, player } = boot();
  const e = E.spawn('marionette', 20, 0, 12); e.ns = { frame: 0, alpha: 0 }; e.nightStalker = true;
  const hp = player.hp;
  for (let t = 0; t < 40; t++) E._think(e, 1 / 60, player, 20, Math.PI, 1);
  assert.equal(player.hp, hp, 'harmless while half in the dark');
  assert.ok(e.ns.alpha > 0.4);
});

test('night: stalkers come out of the dark, at most a few at once, and fade away at dawn', () => {
  const { CC, NS, E, list } = boot();
  let night = true;
  CC.DayNight = { isNight: () => night, nightness: () => (night ? 1 : 0) };
  for (let t = 0; t < 400; t++) NS.update(0.5);
  const alive = list.filter(e => e.nightStalker);
  assert.ok(alive.length >= 1 && alive.length <= 3, 'between one and three: ' + alive.length);
  for (const e of alive) {
    const d = Math.hypot(e.x - CC.state.player.x, e.y - CC.state.player.y);
    assert.ok(d > 300, 'they appear out of sight, not next to you: ' + Math.round(d));
    assert.equal(e.asleep, false, 'they hunt at once');
  }
  night = false;
  NS.update(0.5);
  assert.ok(alive.every(e => e.leaving), 'at dawn they slip away');
  alive.forEach(e => { e.ns.alpha = 0; });
  NS.update(0.5);
  assert.equal(list.filter(e => e.nightStalker).length, 0);
  CC.state.area = 'cave';
  night = true;
  for (let t = 0; t < 200; t++) NS.update(0.5);
  assert.equal(list.filter(e => e.nightStalker).length, 0, 'never in caves');
});

test('killing a stalker drops boss-grade loot and a message', () => {
  const { CC, E, texts } = boot();
  const e = E.spawn('gravemaw', 10, 10, 10); e.nightStalker = true;
  E._kill(e);
  assert.ok(CC.Loot.rolls.length >= 2);
  assert.ok(texts.includes('NIGHTMARE SLAIN'));
});

test('night light: ambient class-coloured light around the hero, like a torch in a dark room', () => {
  const world = { console };
  world.window = world;
  world.CC = { state: { mode: 'dungeon', area: 'forest', map: { ambient: '17,25,21,0.4', playerLight: 200, lights: [] }, player: { x: 5, y: 9, classId: 'thief' } }, Enemies: { list: [], update() {}, draw() {} }, Forest: { drawMonster: () => false } };
  new Function('window', read('daynight.js'))(world);
  const CC = world.CC, D = CC.DayNight;
  assert.equal(D.lightColor('swordsman'), '150,200,255');
  assert.equal(D.lightColor('necromancer'), '140,255,170');
  assert.equal(D.lightColor('thief'), '255,115,100');
  assert.equal(D.lightColor('wizard'), '85,115,235');
  D.restore({ t: 610 });
  for (let t = 0; t < 40; t++) CC.Enemies.update(1);
  const lights = CC.state.map.lights;
  assert.equal(lights.length, 2, 'a wide soft spill and a nearer pool, both tinted');
  assert.ok(lights.every(l => l.color === '255,115,100' && l.flat && l.inten >= 0.5), 'the thief light is red-tinted with an even falloff');
  assert.ok(lights[0].r > lights[1].r && lights[1].r > 100 && lights[0].r < 260, 'a modest spill around a pool, not a huge radius');
  assert.ok(CC.state.map.playerLight < 200 && CC.state.map.playerLight > 90, 'the lit circle at night is modest');
  assert.equal(lights[0].x, 5);
  D.restore({ t: 1200 });
  for (let t = 0; t < 40; t++) CC.Enemies.update(1);
  assert.equal(lights[0].inten, 0, 'off by day');
  assert.doesNotMatch(read('main.js'), /Ambience', 'drawGround'/, 'nothing is painted over or under the hero as a ring');
});
