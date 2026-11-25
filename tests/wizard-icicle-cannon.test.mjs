import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../spells_wizard.js', import.meta.url), 'utf8');

function setup() {
  const player = { x: 0, y: 0, hp: 100, maxHp: 100, stats: { dmg: 20 }, flags: {} };
  const list = [], hits = [], pairs = new Map();
  const CC = {
    state: { mode: 'dungeon', area: 'forest', player }, Enemies: { list },
    SpellPairs: { register: (id, pair) => pairs.set(id, pair) },
    Classes: {
      hitEnemy(e, damage) { hits.push({ e, damage }); e.hp -= damage; return damage; },
      status(e, kind, duration) { e[kind + 'T'] = duration; }
    },
    Dungeon: { isSolid: () => false, moveWithCollision(e, dx, dy) { e.x += dx; e.y += dy; } }
  };
  runInNewContext(source, { CC });
  const enemy = (x, y = 0, extras = {}) => {
    const e = { id: list.length + 1, x, y, r: 4, hp: 2000, ...extras };
    list.push(e);
    return e;
  };
  const step = (seconds, dt = 0.01) => {
    while (seconds > 1e-9) { CC.WizardSpells.update(Math.min(dt, seconds)); seconds -= dt; }
  };
  return { player, list, CC, pairs, hits, enemy, step, wizard: CC.WizardSpells };
}

test('tap pierces three distinct enemies and does not splash its direct targets', () => {
  const { player, enemy, hits, pairs, wizard, step } = setup();
  const first = enemy(42), second = enemy(90), third = enemy(138), fourth = enemy(186);
  const splash = enemy(42, 15);
  pairs.get('bolt').tap(player, { dx: 1, dy: 0 });
  assert.equal(wizard.projectiles.length, 1);
  step(0.4);
  for (const e of [first, second, third]) {
    assert.deepEqual(hits.filter(hit => hit.e === e).map(hit => hit.damage), [36]);
  }
  const splashHits = hits.filter(hit => hit.e === splash);
  assert.equal(splashHits.length, 1);
  assert.ok(Math.abs(splashHits[0].damage - 7.2) < 1e-8);
  assert.ok(!hits.some(hit => hit.e === fourth));
  assert.equal(wizard.projectiles.length, 0);
});

test('icicles shatter against walls before hitting foes behind them', () => {
  const { CC, player, enemy, hits, pairs, wizard, step } = setup();
  CC.Dungeon.isSolid = x => x >= 24 && x < 28;
  enemy(31, 0, { r: 10 });
  pairs.get('bolt').tap(player, { dx: 1, dy: 0 });
  step(0.25);
  assert.equal(hits.length, 0);
  assert.equal(wizard.projectiles.length, 0);
});

test('charge fires nine independent icicles in three timed forward waves', () => {
  const { player, pairs, wizard, step } = setup();
  const angle = Math.PI / 4;
  const pair = pairs.get('bolt');
  assert.equal(pair.cost, 24);
  assert.equal(pair.cost * pair.manaMul, 42);
  assert.equal(pair.cooldown, 5);
  assert.equal(pair.cooldown * pair.cdMul, 10);
  pair.charge(player, { dx: Math.cos(angle), dy: Math.sin(angle) }, 1);
  assert.equal(wizard.projectiles.length, 3);
  step(0.08);
  assert.equal(wizard.projectiles.length, 3);
  step(0.01);
  assert.equal(wizard.projectiles.length, 6);
  step(0.09);
  assert.equal(wizard.projectiles.length, 9);
  assert.equal(new Set(wizard.projectiles.map(q => q.hitSet)).size, 9);
  const spread = Array.from(wizard.projectiles, q => (q.angle - angle) * 180 / Math.PI);
  assert.ok(Math.abs(Math.max(...spread) - Math.min(...spread) - 55) < 1e-8);
});

test('the complete volley caps damage and embedded shards on a large boss', () => {
  const { player, enemy, hits, pairs, wizard, step } = setup();
  const boss = enemy(52, 0, { r: 34, boss: true });
  const other = enemy(47, 16, { r: 1 });
  pairs.get('bolt').charge(player, { dx: 1, dy: 0 }, 1);
  step(0.45);
  const damage = hits.filter(hit => hit.e === boss).reduce((n, hit) => n + hit.damage, 0);
  assert.ok(damage >= 40 && damage <= 52, 'boss damage must use one volley budget');
  assert.ok(hits.some(hit => hit.e === other), 'the volley still hits nearby foes');
  assert.equal(wizard.attachments.filter(shard => shard.enemy === boss).length, 4);
  assert.equal(boss.stunT, undefined);
});

test('shards follow moving enemies, expire, and clear on death, zone change and reset', () => {
  const { player, CC, enemy, pairs, wizard, step } = setup();
  const target = enemy(42, 0, { r: 26 });
  const charge = () => { pairs.get('bolt').charge(player, { dx: 1, dy: 0 }, 1); step(0.26); };
  charge();
  const shard = wizard.attachments[0];
  assert.ok(shard && shard.life > 0.55 && shard.life <= 1.2);
  target.x += 30;
  target.y += 13;
  step(0.01);
  assert.ok(Math.abs(shard.x - (target.x + shard.dx)) < 1e-8);
  assert.ok(Math.abs(shard.y - (target.y + shard.dy)) < 1e-8);
  step(0.95);
  assert.equal(wizard.attachments.length, 0);

  target.x = 42; target.y = 0;
  charge();
  assert.ok(wizard.attachments.length > 0);
  target.dead = true;
  step(0.01);
  assert.equal(wizard.attachments.length, 0);

  target.dead = false;
  charge();
  assert.ok(wizard.attachments.length > 0);
  CC.state.area = 'mountain';
  step(0.01);
  assert.equal(wizard.attachments.length + wizard.projectiles.length, 0);

  charge();
  assert.ok(wizard.attachments.length > 0);
  pairs.get('bolt').clear();
  assert.equal(wizard.attachments.length + wizard.projectiles.length, 0);

  charge();
  player.hp = 0;
  step(0.01);
  assert.equal(wizard.attachments.length + wizard.projectiles.length, 0);
});

test('Glacial Nova is a second radial pulse, and Gravity Orb pulls and detonates', () => {
  const { player, enemy, hits, pairs, wizard, step } = setup();
  const north = enemy(0, 88), south = enemy(0, -88), side = enemy(19, 30);
  pairs.get('wizard_spell2').charge(player, { dx: 1, dy: 0 }, 1);
  step(0.31);
  for (const e of [north, south]) assert.equal(hits.filter(hit => hit.e === e).length, 2);
  pairs.get('orb').charge(player, { dx: 1, dy: 0 }, 1);
  assert.ok(wizard.projectiles[0].radius > 12, 'charged orb is larger than the 12px tap orb');
  step(0.35);
  assert.ok(side.y < 30);
  const end = enemy(251, 33);
  step(3);
  assert.equal(wizard.projectiles.length, 0);
  assert.ok(hits.some(hit => hit.e === end));
});

test('charged ward absorbs more damage and shocks nearby enemies once on exhaustion', () => {
  const { player, enemy, hits, pairs, wizard, step } = setup();
  const foe = enemy(38);
  const ward = pairs.get('arcaneward');
  ward.tap(player);
  assert.equal(wizard.absorb(player, 20), 4);
  assert.equal(hits.length, 0);
  ward.charge(player, undefined, 1);
  step(2.6);
  assert.equal(wizard.absorb(player, 30), 0);
  assert.ok(Math.abs(wizard.absorb(player, 15) - 4) < 1e-8);
  assert.ok(wizard.absorb(player, 15) === 15);
  assert.equal(hits.filter(hit => hit.e === foe).length, 1);
});

test('registration: Icicle Cannon names, original Frost Nova and Arcane Orb taps are kept', () => {
  const { pairs } = setup();
  assert.equal(pairs.get('bolt').name, 'Icicle Cannon');
  assert.equal(pairs.get('bolt').chargeName, 'Icicle Barrage');
  for (const id of ['wizard_spell2', 'orb']) {
    assert.equal(pairs.get(id).tap, undefined, id + ' keeps its existing tap spell');
    assert.equal(typeof pairs.get(id).charge, 'function');
  }
  assert.equal(pairs.get('wizard_spell2').chargeName, 'Glacial Nova');
  assert.equal(pairs.get('orb').chargeName, 'Gravity Orb');
  assert.equal(pairs.get('orb').cooldown({ cdMax: {} }), 8);
  assert.equal(pairs.get('orb').cooldown({ cdMax: { ab_orb: 6 } }), 6);
  assert.equal(pairs.get('arcaneward').chargeName, 'Arcane Fortress');
  assert.ok(pairs.get('arcaneward').manaMul >= 1.5 && pairs.get('arcaneward').manaMul <= 1.8);
  assert.equal(pairs.has('wizard_spell1'), false, 'Fireball/Flamethrower are never registered');
});

test('the ward soaks damage that goes through CC.Classes.damage and the fortress shocks on exhaustion', () => {
  const { CC, player, enemy, hits, pairs, wizard } = setup();
  let reached = 0;
  CC.Classes.damage = (p, amount) => { reached += amount; return amount; };
  wizard.hookDamage();
  const near = enemy(30);
  pairs.get('arcaneward').charge(player, {}, 1);
  CC.Classes.damage(player, 10);
  assert.equal(reached, 0, 'small hit fully absorbed');
  CC.Classes.damage(player, 500);
  assert.ok(reached > 0 && reached < 500, 'overflow passes through after the shield breaks: ' + reached);
  assert.ok(hits.some(hit => hit.e === near), 'shockwave hit the nearby enemy');
  const before = hits.length;
  CC.Classes.damage(player, 5);
  assert.equal(hits.length, before, 'shockwave only once');
  wizard.hookDamage();
  assert.equal(CC.Classes.damage.wardHooked, true);
});
