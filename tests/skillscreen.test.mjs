import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

function boot(classId = 'wizard', level = 20) {
  const world = { performance, console };
  world.window = world;
  for (const file of ['skilltree.js', 'abilities.js', 'skillscreen.js']) new Function('window', read(file))(world);
  const CC = world.CC;
  const texts = [], hits = [];
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({
    canvas: {}, createLinearGradient: () => gradient, createRadialGradient: () => gradient, createPattern: () => ({}),
    measureText: s => ({ width: String(s).length * 5 }), fillText(s) { texts.push(String(s)); }
  }, { get(t, m) { return m in t ? t[m] : () => {}; }, set(t, m, v) { t[m] = v; return true; } });
  const player = { classId, level, x: 0, y: 0, mods: {}, flags: {}, stats: { dmg: 10 }, color: '#7fb4ff', skills: { ranks: {}, spent: 0 } };
  CC.state = { player };
  CC.Classes = { applyItemStats() {}, _h: {} };
  CC.fx = { text() {}, burst() {} };
  const hit = (x, y, w, h, cb) => hits.push({ x, y, w, h, cb });
  const draw = () => { texts.length = 0; hits.length = 0; CC.SkillScreen.draw(ctx, hit, 0, 0, 420, 560, player, { mouse: { x: -1, y: -1 }, clock: 0 }); };
  const tap = (px, py) => { const h = hits.filter(q => px >= q.x && px < q.x + q.w && py >= q.y && py < q.y + q.h).pop(); if (h) h.cb(); return !!h; };
  return { CC, player, draw, tap, texts, hits };
}

test('Roman numerals', () => {
  const { CC } = boot();
  const r = CC.SkillScreen.roman;
  assert.deepEqual([0, 1, 4, 9, 14, 19, 24, 26, 40, 49, 99, 100].map(r), ['0', 'I', 'IV', 'IX', 'XIV', 'XIX', 'XXIV', 'XXVI', 'XL', 'XLIX', 'XCIX', 'C']);
});

test('every rune is line art that draws', () => {
  const { CC } = boot();
  assert.equal(CC.SkillScreen.RUNE_NAMES.length, 24);
  const lines = [];
  const ctx = new Proxy({}, { get: (t, m) => (...a) => { if (m === 'lineTo') lines.push(a); } });
  for (const name of CC.SkillScreen.RUNE_NAMES) CC.SkillScreen.rune(ctx, name, 10, 10, 12, '#fff');
  assert.ok(lines.length > 24);
});

test('three tablets (Passives, Abilities, Charges) draw for every class, with the level in Roman numerals', () => {
  for (const cls of ['swordsman', 'wizard', 'necromancer', 'thief']) {
    const env = boot(cls, 30);
    for (const tab of ['passives', 'abilities', 'charges']) {
      env.CC.SkillScreen.setTab(tab);
      env.draw();
      assert.ok(env.texts.includes('PASSIVES') && env.texts.includes('ABILITIES') && env.texts.includes('CHARGES'), cls + ' ' + tab);
      assert.ok(env.texts.includes('LEVEL XXX'), cls + ' ' + tab);
    }
  }
});

test('passives: tap a rune to read it, tap it again to inscribe it', () => {
  const env = boot('wizard', 12);
  env.CC.SkillScreen.setTab('passives');
  env.draw();
  assert.ok(env.texts.includes('TAP A RUNE TO READ ITS INSCRIPTION'));
  const tr = env.CC.SkillTree;
  assert.equal(tr.canBuy(env.player, 'might').ok, true);
  const nodes = env.hits.filter(h => h.w > 20 && h.w < 60 && h.h > 30 && h.h < 70).sort((a, b) => a.y - b.y || a.x - b.x);
  env.tap(nodes[0].x + 2, nodes[0].y + 2); // the first Offense rune: Might
  assert.deepEqual(env.CC.SkillScreen.state().sel, { k: 'n', id: 'might' });
  env.draw();
  assert.ok(env.texts.includes('MIGHT') && env.texts.includes('INSCRIBE'));
  const before = tr.points(env.player);
  env.tap(nodes[0].x + 2, nodes[0].y + 2);
  assert.equal(tr.rank(env.player, 'might'), 1);
  assert.equal(tr.points(env.player), before - 1);
});

test('abilities: choose an ability, tap a seal to bind it, buy an upgrade rune', () => {
  const env = boot('wizard', 30);
  const Sk = env.CC.Skills;
  env.CC.SkillScreen.setTab('abilities');
  Sk.ensure(env.player);
  env.CC.SkillScreen.state().ab = 'orb';
  env.draw();
  const seals = env.hits.filter(h => h.h === 52);
  assert.equal(seals.length, 4);
  env.tap(seals[0].x + 4, seals[0].y + 4);
  assert.equal(env.player.slots[0], 'orb');
  const before = env.CC.SkillTree.points(env.player);
  env.draw();
  const plus = env.hits.filter(h => h.w === 44 && h.h === 22);
  assert.ok(plus.length > 0, 'upgrade + buttons are offered');
  plus[0].cb();
  assert.equal(env.CC.SkillTree.points(env.player), before - 1);
});

test('charges: bind an unlocked charge attack; locked ones stay locked', () => {
  const env = boot('wizard', 12);
  env.CC.SkillScreen.setTab('charges');
  env.draw();
  assert.ok(env.texts.includes('CHARGE ATTACK  ·  HOLD THE ATTACK BUTTON'));
  assert.ok(env.texts.some(t => /OPENS AT LVL XX/.test(t)), 'level-20 charge is shown locked in numerals');
  const tiles = env.hits.filter(h => h.h === 50);
  assert.equal(tiles.length, 4);
  env.tap(tiles[1].x + 3, tiles[1].y + 3);
  assert.equal(env.CC.SkillTree.chargeSelected(env.player), 1);
  env.tap(tiles[3].x + 3, tiles[3].y + 3);
  assert.equal(env.CC.SkillTree.chargeSelected(env.player), 1, 'a locked charge cannot be bound');
});

test('keys 1, 2, 3 switch tablets', () => {
  const { CC } = boot();
  assert.equal(CC.SkillScreen.key('Digit2'), true);
  assert.equal(CC.SkillScreen.state().tab, 'abilities');
  assert.equal(CC.SkillScreen.key('Digit3'), true);
  assert.equal(CC.SkillScreen.state().tab, 'charges');
  assert.equal(CC.SkillScreen.key('KeyQ'), false);
});

test('the shell uses it: script order, hub frame, hub tabs, key hook', () => {
  const html = read('index.html'), ui = read('ui.js');
  assert.ok(html.indexOf('skillscreen.js') > 0 && html.indexOf('skillscreen.js') < html.indexOf('"ui.js"'));
  assert.match(ui, /CC\.SkillScreen\.draw/);
  assert.match(ui, /CC\.SkillScreen\.hubFrame/);
  assert.match(ui, /CC\.SkillScreen\.hubTab/);
  assert.match(ui, /CC\.SkillScreen\.key/);
});
