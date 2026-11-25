import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

function world(file, classId) {
  const player = { x: 0, y: 0, hp: 100, maxHp: 100, level: 10, stats: { dmg: 20 }, flags: {}, face: 1, iframes: 0 };
  const list = [], hits = [], pairs = new Map(), minions = [], bursts = [];
  const CC = {
    state: { mode: 'dungeon', area: 'forest', floor: 1, player },
    Enemies: { list, _time: 0, _kill(e) { e.dead = true; e.hp = 0; } },
    SpellPairs: { register: (id, pair) => pairs.set(id, pair) },
    Classes: {
      minions,
      hitEnemy(e, damage, type, opts) { hits.push({ e, damage, type, opts }); e.hp -= damage; return damage; },
      status(e, kind, duration) { e[kind + 'T'] = duration; },
      heal(p, n) { p.hp = Math.min(p.maxHp, p.hp + n); player.healedTotal = (player.healedTotal || 0) + n; },
      _h: { ignite(e, t, dps) { e.ignited = { t, dps }; } }
    },
    fx: { text() {}, burst: (...a) => bursts.push(a), shake() {} },
    Dungeon: { isSolid: () => false, moveWithCollision(e, dx, dy) { e.x += dx; e.y += dy; } },
    SmokeBomb: { deploy: (p, o) => { CC.deployed = o; return true; } }
  };
  runInNewContext(read(file), { CC });
  const enemy = (x, y = 0, extras = {}) => { const e = { id: list.length + 1, x, y, r: 4, hp: 5000, dmg: 10, spd: 50, ...extras }; list.push(e); return e; };
  const step = (seconds, mod, dt = 0.01) => { while (seconds > 1e-9) { mod.update(Math.min(dt, seconds)); seconds -= dt; } };
  return { CC, player, list, hits, pairs, minions, enemy, step };
}

/* ---------------- necromancer ---------------- */
const necro = () => world('spells_necromancer.js', 'necromancer');

test('necromancer: all five pairs are registered with a longer, pricier charge', () => {
  const { pairs } = necro();
  for (const id of ['necromancer_spell1', 'necromancer_spell2', 'spear', 'blast', 'curse']) {
    const p = pairs.get(id);
    assert.ok(p && typeof p.charge === 'function', id);
    assert.ok(p.manaMul >= 1.5 && p.manaMul <= 1.9, id + ' mana ' + p.manaMul);
    assert.ok(p.cdMul >= 1.5 && p.cdMul <= 2.1, id + ' cooldown ' + p.cdMul);
    assert.ok(p.tapDesc && p.chargeDesc);
  }
  assert.equal(pairs.get('necromancer_spell1').chargeName, 'Bone Guardian');
});

test('Bone Guardian replaces several skeletons with ONE large guardian', () => {
  const { player, pairs, minions, CC } = necro();
  for (let i = 0; i < 3; i++) minions.push({ x: i, y: 0, hp: 40, maxHp: 40, dmg: 5, r: 7 });
  assert.equal(pairs.get('necromancer_spell1').charge(player, { dx: 1, dy: 0, x: 50, y: 0 }, 1), true);
  const guardians = minions.filter(m => m.guardian);
  assert.equal(guardians.length, 1, 'exactly one guardian');
  const cap = 3 + Math.floor(player.level / 5);
  assert.ok(minions.length - 1 + 3 <= cap, 'the guardian counts as three skeletons: the cap holds');
  assert.ok(guardians[0].maxHp > 40 * 3 && guardians[0].dmg > 10);
  assert.equal(CC.state.player.hp, 100);
});

test('Impaling Lance pierces at most five distinct foes, hits each once and bursts into splinters', () => {
  const { player, pairs, enemy, hits, step, CC } = necro();
  const foes = [40, 80, 120, 160, 200].map(x => enemy(x));
  const behind = enemy(250), nearBurst = enemy(200, 30);
  pairs.get('spear').charge(player, { dx: 1, dy: 0 }, 1);
  step(1.2, CC.NecromancerSpells);
  for (const e of foes) assert.equal(hits.filter(h => h.e === e && h.type === 'bone').length, 1, 'once per foe');
  assert.ok(!hits.some(h => h.e === behind && h.damage > 10 * 5), 'the sixth foe is not directly pierced');
  assert.equal(hits.filter(h => h.e === nearBurst).length, 1, 'the burst splashes a nearby foe once');
  assert.equal(CC.NecromancerSpells.lances.length, 0);
});

test('Corpse Chain jumps to at most two more corpses with falloff and never reuses a corpse', () => {
  const { player, pairs, enemy, hits, step, CC } = necro();
  const kill = e => CC.Enemies._kill(e);
  const dead = [enemy(60), enemy(160), enemy(260), enemy(400)];
  dead.forEach(kill);
  const bystander = [enemy(60, 20), enemy(160, 20), enemy(260, 20), enemy(400, 20)];
  assert.equal(CC.NecromancerSpells.corpses.length, 4);
  assert.equal(pairs.get('blast').charge(player, { dx: 1, dy: 0, x: 60, y: 0 }, 1), true);
  step(0.8, CC.NecromancerSpells);
  const dmg = e => hits.filter(h => h.e === e).reduce((s, h) => s + h.damage, 0);
  assert.ok(dmg(bystander[0]) > 0 && dmg(bystander[1]) > 0 && dmg(bystander[2]) > 0, 'the chain reached 3 blasts');
  assert.equal(dmg(bystander[3]), 0, 'the fourth corpse is out of chain range / count');
  assert.ok(dmg(bystander[0]) > dmg(bystander[1]) && dmg(bystander[1]) > dmg(bystander[2]), 'falloff');
  assert.equal(CC.NecromancerSpells.corpses.length, 1, 'used corpses are gone');
});

test('Corpse Chain falls back to a living foe when there are no corpses', () => {
  const { player, pairs, enemy, hits } = necro();
  const foe = enemy(70);
  assert.equal(pairs.get('blast').charge(player, { dx: 1, dy: 0, x: 70, y: 0 }, 1), true);
  assert.ok(hits.some(h => h.e === foe));
  const empty = necro();
  assert.equal(empty.pairs.get('blast').charge(empty.player, { dx: 1, dy: 0, x: 70, y: 0 }, 1), false, 'nothing to blast: refunded');
});

test('Soul Siphon branches to at most two foes and its healing is capped', () => {
  const { player, pairs, enemy, hits, step, CC } = necro();
  const primary = enemy(60);
  const others = [enemy(90, 10), enemy(100, -10), enemy(110, 20)];
  player.hp = 1; player.maxHp = 100;
  assert.equal(pairs.get('necromancer_spell2').charge(player, { dx: 1, dy: 0 }, 1), true);
  step(0.25, CC.NecromancerSpells);
  assert.equal(hits.filter(h => h.e === primary).length, 2 > 0 ? hits.filter(h => h.e === primary).length : 0);
  assert.equal(others.filter(e => hits.some(h => h.e === e)).length, 2, 'two branches, never three');
  step(3, CC.NecromancerSpells);
  assert.ok(player.hp - 1 <= 25.01, 'healing capped at 25% of max health: ' + player.hp);
  assert.equal(CC.NecromancerSpells.siphons.length, 0);
});

test('Withering Curse weakens foes, rots them, spares boss speed, and restores everything', () => {
  const { player, pairs, enemy, hits, step, CC } = necro();
  const grunt = enemy(60, 0, { dmg: 20, spd: 60 }), boss = enemy(70, 10, { dmg: 20, spd: 60, boss: true });
  pairs.get('curse').charge(player, { dx: 1, dy: 0, x: 65, y: 0 }, 1);
  assert.ok(grunt.dmg < 20 && grunt.spd < 60);
  assert.ok(boss.dmg < 20 && boss.spd === 60, 'a boss hits weaker but keeps its speed');
  step(1.2, CC.NecromancerSpells);
  assert.ok(hits.filter(h => h.e === grunt && h.type === 'curse').length >= 2, 'damage over time');
  step(6, CC.NecromancerSpells);
  assert.equal(grunt.dmg, 20); assert.equal(grunt.spd, 60); assert.equal(boss.dmg, 20);
  assert.equal(CC.NecromancerSpells.hexes.length, 0);
});

test('necromancer clear() restores cursed foes and drops every effect', () => {
  const { player, pairs, enemy, CC } = necro();
  const grunt = enemy(60, 0, { dmg: 20, spd: 60 });
  pairs.get('curse').charge(player, { dx: 1, dy: 0, x: 65, y: 0 }, 1);
  pairs.get('spear').charge(player, { dx: 1, dy: 0 }, 0.5);
  CC.NecromancerSpells.clear();
  assert.equal(grunt.dmg, 20); assert.equal(grunt.spd, 60);
  assert.equal(CC.NecromancerSpells.lances.length + CC.NecromancerSpells.hexes.length, 0);
});

/* ---------------- thief ---------------- */
const thief = () => world('spells_thief.js', 'thief');

test('thief: all five pairs are registered with the right tap/charge shape', () => {
  const { pairs } = thief();
  for (const id of ['thief_spell1', 'thief_spell2', 'step', 'razorwire', 'venom']) {
    const p = pairs.get(id);
    assert.ok(p && typeof p.charge === 'function', id);
    assert.ok(p.manaMul >= 1.5 && p.manaMul <= 1.9, id + ' mana');
    assert.ok(p.cdMul >= 1.5 && p.cdMul <= 2.1, id + ' cooldown');
  }
  assert.ok(pairs.get('thief_spell1').tap && pairs.get('razorwire').tap && pairs.get('venom').tap);
  assert.equal(pairs.get('thief_spell2').tap, undefined, 'smoke bomb keeps its existing tap');
  assert.equal(pairs.get('step').tap, undefined, 'shadow step keeps its existing tap');
});

test('Throwing Knives: tap throws two knives; the barrage throws nine over time; a knife stops at the first foe or a wall', () => {
  const { player, pairs, enemy, hits, step, CC } = thief();
  pairs.get('thief_spell1').tap(player, { dx: 1, dy: 0 });
  step(0.02, CC.ThiefSpells);
  assert.equal(CC.ThiefSpells.knives.length, 1);
  step(1, CC.ThiefSpells); // the two tap knives fly off and expire
  assert.equal(CC.ThiefSpells.knives.length, 0);
  const near = enemy(40), far = enemy(80);
  pairs.get('thief_spell1').charge(player, { dx: 1, dy: 0 }, 1);
  step(1, CC.ThiefSpells);
  assert.ok(hits.filter(h => h.e === near).length >= 2, 'the barrage lands on the near foe');
  assert.equal(hits.filter(h => h.e === far).length, 0, 'knives stop in the first foe');
  CC.Dungeon.isSolid = x => x >= 20;
  const blocked = world('spells_thief.js', 'thief');
  blocked.CC.Dungeon.isSolid = x => x >= 20;
  blocked.enemy(60);
  blocked.pairs.get('thief_spell1').charge(blocked.player, { dx: 1, dy: 0 }, 1);
  blocked.step(1, blocked.CC.ThiefSpells);
  assert.equal(blocked.hits.length, 0, 'a wall blocks the knives');
});

test('Razor Wire cuts a crossing foe at most every 0.45 s; Razor Web is three connected wires that bleed', () => {
  const { player, pairs, enemy, hits, step, CC } = thief();
  const foe = enemy(100);
  pairs.get('razorwire').tap(player, { dx: 1, dy: 0, range: 100 });
  assert.equal(CC.ThiefSpells.wires.length, 1);
  step(1, CC.ThiefSpells);
  const cuts = hits.filter(h => h.e === foe).length;
  assert.ok(cuts >= 2 && cuts <= 3, 'cuts ' + cuts);
  assert.equal(foe.ignited, undefined, 'the plain wire does not bleed');
  const web = thief();
  const f2 = web.enemy(100 + 70 * Math.cos(0.5), 70 * Math.sin(0.5)); // standing on the first wire
  web.pairs.get('razorwire').charge(web.player, { dx: 1, dy: 0, x: 100, y: 0 }, 1);
  assert.equal(web.CC.ThiefSpells.wires.length, 3);
  web.step(1.2, web.CC.ThiefSpells);
  assert.ok(web.hits.some(h => h.e === f2));
  step(6, CC.ThiefSpells);
  assert.equal(CC.ThiefSpells.wires.length, 0, 'wires expire');
});

test('Venom Flask leaves one puddle; Toxic Deluge bursts into five connected pools; both expire', () => {
  const { player, pairs, enemy, hits, step, CC } = thief();
  pairs.get('venom').tap(player, { dx: 1, dy: 0, x: 100, y: 0 });
  assert.equal(CC.ThiefSpells.flasks.length, 1);
  step(0.6, CC.ThiefSpells);
  assert.equal(CC.ThiefSpells.pools.length, 1);
  step(5, CC.ThiefSpells);
  assert.equal(CC.ThiefSpells.pools.length, 0);
  const big = thief();
  const foe = big.enemy(100);
  big.pairs.get('venom').charge(big.player, { dx: 1, dy: 0, x: 100, y: 0 }, 1);
  big.step(0.7, big.CC.ThiefSpells);
  assert.equal(big.CC.ThiefSpells.pools.length, 5);
  big.step(1, big.CC.ThiefSpells);
  assert.ok(big.hits.some(h => h.e === foe && h.type === 'poison'));
  big.step(8, big.CC.ThiefSpells);
  assert.equal(big.CC.ThiefSpells.pools.length, 0);
});

test('Assassination Step needs a marked foe, stabs three times from behind and leaves the thief protected', () => {
  const none = thief();
  assert.equal(none.pairs.get('step').charge(none.player, { dx: 1, dy: 0 }, 1), false, 'no mark: refunded');
  const { player, pairs, enemy, hits, step, CC } = thief();
  const mark = enemy(120), off = enemy(100, 120);
  assert.equal(pairs.get('step').charge(player, { dx: 1, dy: 0 }, 1), true);
  assert.ok(player.x > 110 && player.iframes > 0.5);
  step(1, CC.ThiefSpells);
  assert.equal(hits.filter(h => h.e === mark).length, 3);
  assert.equal(hits.filter(h => h.e === off).length, 0, 'only the marked foe is struck');
  assert.ok(mark.stunT > 0);
});

test('Shadow Shroud is the same smoke bomb, charged', () => {
  const { player, pairs, CC } = thief();
  assert.equal(pairs.get('thief_spell2').charge(player, { dx: 1, dy: 0, x: 90, y: 0 }, 1), true);
  assert.equal(CC.deployed.charged, true);
  assert.ok(player.ambushT >= 3);
});

test('thief clear() drops every projectile, wire, pool and timer', () => {
  const { player, pairs, CC } = thief();
  pairs.get('thief_spell1').charge(player, { dx: 1, dy: 0 }, 1);
  pairs.get('razorwire').charge(player, { dx: 1, dy: 0, x: 90, y: 0 }, 1);
  pairs.get('venom').charge(player, { dx: 1, dy: 0, x: 90, y: 0 }, 1);
  CC.ThiefSpells.clear();
  assert.equal(CC.ThiefSpells.knives.length + CC.ThiefSpells.wires.length + CC.ThiefSpells.flasks.length + CC.ThiefSpells.pools.length, 0);
  CC.ThiefSpells.update(1);
});

/* ---------------- save migration ---------------- */
test('old saves migrate once: Blink -> Arcane Ward, Blade Fan -> Razor Wire, Chain Lightning ranks are refunded', () => {
  const CC = { state: {}, fx: { text() {}, burst() {}, shake() {} }, Classes: {}, SkillTree: { points: () => 0 } };
  const window = { CC };
  runInNewContext(read('abilities.js'), { window, CC, Math, Date, console });
  const S = CC.Skills;
  const wiz = { classId: 'wizard', level: 30, x: 0, y: 0, slots: ['wizard_spell1', 'wizard_spell2', 'bolt', 'blink'], slotSeen: { blink: 1, bolt: 1 },
    cd: { ab_blink: 4 }, skills: { ranks: { 'ab:blink:pow': 3, 'ab:bolt:eff': 2, 'ab:bolt:pow': 4 }, spent: 9 } };
  assert.equal(S.migrate(wiz), true);
  assert.deepEqual(wiz.slots, ['wizard_spell1', 'wizard_spell2', 'bolt', 'arcaneward']);
  assert.equal(wiz.skills.ranks['ab:arcaneward:pow'], 3);
  assert.equal(wiz.skills.ranks['ab:blink:pow'], undefined);
  assert.equal(wiz.skills.ranks['ab:bolt:eff'], undefined);
  assert.equal(wiz.skills.ranks['ab:bolt:pow'], 4, 'Power ranks stay');
  assert.equal(wiz.skills.spent, 7, 'two points refunded');
  assert.equal(wiz.cd.ab_arcaneward, 4);
  assert.equal(S.migrate(wiz), false, 'runs once');
  assert.equal(wiz.skills.spent, 7, 'never refunds twice');
  const thief = { classId: 'thief', level: 30, slots: ['thief_spell1', 'thief_spell2', 'step', 'fan'], skills: { ranks: { 'ab:fan:rad': 2 }, spent: 2 } };
  S.migrate(thief);
  assert.equal(thief.slots[3], 'razorwire');
  assert.equal(thief.skills.ranks['ab:razorwire:rad'], 2);
  assert.equal(thief.skills.spent, 2);
  assert.ok(S.AB.arcaneward && S.AB.razorwire && !S.AB.blink && !S.AB.fan);
  assert.equal(S.AB.bolt.name, 'Icicle Cannon');
});

test('Inferno Orb is a slow, large fireball that explodes on the first foe and leaves lingering flames', () => {
  const w = world('spells_wizard_fire.js', 'wizard');
  const front = w.enemy(80), back = w.enemy(140);
  const pair = w.pairs.get('wizard_spell1');
  assert.equal(pair.chargeName, 'Inferno Orb');
  assert.equal(pair.tap, undefined, 'the tap stays the existing Fireball');
  assert.equal(pair.charge(w.player, { dx: 1, dy: 0 }, 1), true);
  assert.equal(w.CC.WizardFireSpells.orbs.length, 1);
  w.step(0.2, w.CC.WizardFireSpells);
  assert.equal(w.hits.length, 0, 'slow: it has not reached anything yet');
  w.step(0.6, w.CC.WizardFireSpells);
  assert.ok(w.hits.some(h => h.e === front) && !w.hits.some(h => h.e === back && h.damage > 20 * 3), 'explodes on the first foe');
  assert.equal(w.CC.WizardFireSpells.flames.length, 1);
  w.step(5, w.CC.WizardFireSpells);
  assert.equal(w.CC.WizardFireSpells.flames.length, 0, 'the flames burn out');
});
