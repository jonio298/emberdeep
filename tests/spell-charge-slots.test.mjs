import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const SLOT_ACT = ['spell1', 'spell2', 'spell3', 'spell4'];

function boot({ classId = 'wizard', slots = ['wizard_spell1', 'wizard_spell2', 'bolt', 'blink'] } = {}) {
  const calls = { tapAction: [], skillCast: [], texts: [] };
  const p = {
    x: 100, y: 100, r: 8, hp: 100, maxHp: 100, mana: 200, maxMana: 200, level: 30, face: 1, aimX: 1, aimY: 0,
    classId, slots, flags: {}, stats: { dmg: 10, cdr: 0 }, spellNames: ['Fire', 'Frost'],
    cd: { attack: 0, spell1: 0, spell2: 0, dash: 0 },
    cdMax: { attack: .4, spell1: 2.5, spell2: 7, dash: 2.5 },
    cost: { spell1: 20, spell2: 25 }
  };
  const CC = {
    state: { mode: 'dungeon', area: 'forest', player: p },
    Enemies: { list: [] },
    Classes: {
      tapAction(slot) { calls.tapAction.push(slot); if (p.cd[slot] > .001) return false; p.cd[slot] = p.cdMax[slot]; return true; },
      hitEnemy() { return 0; }, status() {}
    },
    Skills: {
      ensure() {},
      cdKey(pl, name) { const id = pl.slots[SLOT_ACT.indexOf(name)]; return /_spell[12]$/.test(id || '') ? id.split('_')[1] : 'ab_' + id; },
      cdMul() { return 1; },
      slotInfo(pl, name) { return { name: pl.slots[SLOT_ACT.indexOf(name)], cost: 24, locked: false, empty: false }; },
      cast(pl, id) { calls.skillCast.push(id); pl.cd['ab_' + id] = 5; return true; }
    },
    fx: { text(x, y, s) { calls.texts.push(s); }, burst() {}, shake() {} },
    Audio: { chargeStart() {}, chargeSet() {}, chargeEnd() {} }
  };
  const window = { CC, console }; window.window = window;
  runInNewContext(readFileSync(new URL('../spell_charge.js', import.meta.url), 'utf8'), window, { filename: 'spell_charge.js' });
  return { CC, SC: CC.SpellCharge, SP: CC.SpellPairs, p, calls };
}

function pair(log, extra = {}) {
  return {
    name: 'ICICLE', color: '#9fe3ff', shape: 'cone', range: 100, radius: 40, cost: 24, cooldown: 5,
    tap(pl, where) { log.tap.push(where); },
    charge(pl, where, power) { log.charge.push({ where, power }); },
    clear() { log.cleared++; },
    ...extra
  };
}
const newLog = () => ({ tap: [], charge: [], cleared: 0 });
const hold = (SC, seconds) => { for (let t = 0; t < seconds - 1e-9; t += .05) SC.update(.05); };

test('registry works for every slot; unregistered abilities cannot charge', () => {
  const { SC, SP } = boot({ slots: ['wizard_spell1', 'bolt', 'orb', 'blink'] });
  const log = newLog();
  assert.equal(SP.register('bolt', pair(log)), true);
  assert.equal(SP.register('orb', pair(log)), true);
  assert.equal(SC.canCharge('spell1'), true, 'original spell charges in slot 1');
  assert.equal(SC.canCharge('spell2'), true, 'registered ability charges in slot 2');
  assert.equal(SC.canCharge('spell3'), true, 'registered ability charges in slot 3');
  assert.equal(SC.canCharge('spell4'), false, 'blink has no registered charge yet');
  assert.equal(SP.register('', {}), false);
  assert.equal(SP.register('x', null), false);
});

test('queued registrations made before the file loaded are drained', () => {
  const log = newLog();
  const CC = { SpellPairs: { _queue: [['bolt', pair(log)]] } };
  const window = { CC }; window.window = window;
  runInNewContext(readFileSync(new URL('../spell_charge.js', import.meta.url), 'utf8'), window);
  assert.equal(CC.SpellPairs.has('bolt'), true);
});

test('tap before 0.25s casts the regular spell with no preview and no charge', () => {
  const { SC, SP, p } = boot();
  const log = newLog();
  SP.register('bolt', pair(log));
  assert.equal(SC.begin('spell3', 0, 0), true);
  hold(SC, .15);
  assert.equal(SC.info().aiming, false);
  assert.equal(SC.release('spell3'), true);
  assert.equal(log.tap.length, 1);
  assert.equal(log.charge.length, 0);
  assert.equal(p.mana, 200 - 24);
  assert.equal(p.cd.ab_bolt, 5);
});

test('tap on an ability without its own tap function uses CC.Skills.cast', () => {
  const { SC, SP, calls } = boot();
  SP.register('bolt', pair(newLog(), { tap: undefined }));
  SC.begin('spell3', 0, 0);
  SC.release('spell3');
  assert.deepEqual(calls.skillCast, ['bolt']);
});

test('hold shows a preview from 0.25s, reaches full charge near 0.9s and release casts the charge', () => {
  const { SC, SP, p } = boot();
  const log = newLog();
  SP.register('bolt', pair(log));
  SC.begin('spell3', 0, 0);
  hold(SC, .3);
  assert.equal(SC.info().aiming, true);
  assert.equal(SC.info().ready, false);
  hold(SC, .65);
  const inf = SC.info();
  assert.equal(inf.ready, true);
  assert.ok(Math.abs(inf.power - 1) < 1e-9);
  assert.equal(SC.release('spell3'), true);
  assert.equal(log.tap.length, 0);
  assert.equal(log.charge.length, 1);
  assert.ok(log.charge[0].power > .99);
  assert.equal(p.mana, 200 - Math.ceil(24 * 1.65), 'charged cast costs more mana than the tap');
});

test('partial charge scales power with the time held', () => {
  const { SC, SP } = boot();
  const log = newLog();
  SP.register('bolt', pair(log));
  SC.begin('spell3', 0, 0);
  hold(SC, .575);
  SC.release('spell3');
  assert.ok(log.charge[0].power > .4 && log.charge[0].power < .6, 'power ' + log.charge[0].power);
});

test('tap and charged cooldowns are independent: the charge is longer and never blocks the tap', () => {
  const { SC, SP, p, calls } = boot();
  const log = newLog();
  SP.register('bolt', pair(log));
  SC.begin('spell3', 0, 0); hold(SC, .9); SC.release('spell3');
  assert.equal(p.cdC.ab_bolt, 5 * 1.75, 'the charged version has its own longer cooldown');
  assert.equal(p.cdCMax.ab_bolt, 5 * 1.75);
  assert.ok(!(p.cd.ab_bolt > 0), 'the tap cooldown is untouched');
  assert.equal(SC.begin('spell3', 0, 0), true, 'the tap is still available');
  SC.release('spell3');
  assert.equal(log.tap.length, 1, 'a tap right after a charge works');
  assert.ok(p.cd.ab_bolt > 0 && p.cd.ab_bolt <= 5, 'and runs the short cooldown');
  p.cd.ab_bolt = 0;
  SC.begin('spell3', 0, 0); hold(SC, .9);
  assert.equal(SC.release('spell3'), false, 'but the charge itself is still recharging');
  assert.equal(log.charge.length, 1);
  p.cdC.ab_bolt = 0;
  SC.begin('spell3', 0, 0); hold(SC, .9);
  assert.equal(SC.release('spell3'), true);
  assert.equal(log.charge.length, 2);
});

test('a tap does not start the charged cooldown, and the original spells keep separate cooldowns too', () => {
  const { SC, p, calls } = boot();
  assert.equal(SC.canCharge('spell1'), true);
  SC.begin('spell1', 0, 0); hold(SC, .9); assert.equal(SC.release('spell1'), true);
  assert.equal(p.cdC.spell1, 2.5 * 2, 'charged flame: 2x the tap cooldown, in its own timer');
  assert.equal(p.cdMax.spell1, 2.5, 'tap base cooldown is untouched');
  assert.ok(!(p.cd.spell1 > 0), 'the tap is free');
  assert.equal(SC.begin('spell1', 0, 0), true);
  SC.release('spell1');
  assert.deepEqual(calls.tapAction, ['spell1'], 'the tap fires the original spell');
  assert.equal(p.mana, 200 - Math.ceil(20 * 1.8), 'legacy mana formula unchanged for the charge');
});

test('an original spell in a different slot taps through its own tap action and charges', () => {
  const { SC, p, calls } = boot({ slots: ['bolt', 'blink', 'wizard_spell2', 'wizard_spell1'] });
  SC.begin('spell3', 0, 0); SC.release('spell3');
  assert.deepEqual(calls.tapAction, ['spell2']);
  p.cd.spell2 = 0;
  assert.equal(SC.canCharge('spell4'), true);
  SC.begin('spell4', 0, 0); hold(SC, .9);
  assert.equal(SC.release('spell4'), true);
  assert.equal(p.cdC.spell1, 5);
});

test('not enough mana for the charge spends nothing, casts nothing and keeps the cooldown free', () => {
  const { SC, SP, p } = boot();
  const log = newLog();
  SP.register('bolt', pair(log));
  p.mana = 30; // tap costs 24, charge costs 40
  SC.begin('spell3', 0, 0); hold(SC, .9);
  assert.equal(SC.release('spell3'), false);
  assert.equal(p.mana, 30);
  assert.equal(log.charge.length, 0);
  assert.equal(p.cd.ab_bolt || 0, 0);
});

test('a charge function that cancels refunds the mana and sets no cooldown', () => {
  const { SC, SP, p } = boot();
  SP.register('bolt', pair(newLog(), { charge() { return false; } }));
  SC.begin('spell3', 0, 0); hold(SC, .9);
  assert.equal(SC.release('spell3'), false);
  assert.equal(p.mana, 200);
  assert.equal(p.cd.ab_bolt || 0, 0);
});

test('a cancelled hold consumes no mana and casts neither tap nor charge', () => {
  const { SC, SP, p } = boot();
  const log = newLog();
  SP.register('bolt', pair(log));
  SC.begin('spell3', 0, 0); hold(SC, .6);
  SC.cancel();
  assert.equal(SC.isActive(), false);
  assert.equal(SC.release('spell3'), false);
  assert.equal(p.mana, 200);
  assert.equal(log.tap.length + log.charge.length, 0);
  assert.equal(p.cd.ab_bolt || 0, 0);
});

test('one press never produces both a tap and a charged cast', () => {
  const { SC, SP } = boot();
  const log = newLog();
  SP.register('bolt', pair(log));
  SC.begin('spell3', 0, 0); hold(SC, .5); SC.release('spell3');
  assert.equal(log.tap.length + log.charge.length, 1);
  assert.equal(log.charge.length, 1);
});

test('changing the equipped ability during a hold does not cast the wrong spell', () => {
  const { SC, SP, p } = boot();
  const log = newLog();
  SP.register('bolt', pair(log));
  SC.begin('spell3', 0, 0); hold(SC, .9);
  p.slots[2] = 'blink';
  assert.equal(SC.release('spell3'), false);
  assert.equal(log.charge.length, 0);
  assert.equal(p.mana, 200);
});

test('death, zone change and clear drop previews and call every module clear hook', () => {
  const { SC, SP, CC, p } = boot();
  const log = newLog();
  SP.register('bolt', pair(log));
  SC.effect('probe', { x: 1, y: 1, life: 5 });
  SC.begin('spell3', 0, 0); hold(SC, .4);
  CC.state.area = 'cave'; SC.update(.05);
  assert.equal(SC.isActive(), false, 'zone change cancels the hold');
  assert.equal(log.cleared, 1, 'zone change clears module state');

  SC.begin('spell3', 0, 0); hold(SC, .4);
  p.hp = 0; SC.update(.05);
  assert.equal(SC.isActive(), false, 'death cancels the hold');
  assert.equal(log.cleared, 2, 'death clears module state');
  SC.update(.05); SC.update(.05);
  assert.equal(log.cleared, 2, 'cleared once, not every frame');

  p.hp = 100; SC.begin('spell3', 0, 0);
  SC.clear();
  assert.equal(SC.isActive(), false);
  assert.equal(log.cleared, 3, 'restart clear() clears module state');
});

test('module drawers render registered effect kinds and a throwing drawer cannot break rendering', () => {
  const { SC, SP } = boot();
  let drawn = 0;
  SP.register('bolt', pair(newLog(), { drawers: { icicle: () => { drawn++; }, broken: () => { throw new Error('x'); } } }));
  SC.effect('icicle', { x: 5, y: 5, life: 1 });
  SC.effect('broken', { x: 5, y: 5, life: 1 });
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  SC.draw(ctx, { x: 0, y: 0 });
  assert.equal(drawn, 1);
});

test('heldInfo lets a registered override rename an original spell', () => {
  const { SC, SP } = boot();
  assert.equal(SC.heldInfo('wizard', 'spell2').name, 'ICICLE BARRAGE');
  SP.register('wizard_spell2', pair(newLog(), { name: 'GLACIAL NOVA', shape: 'circle' }));
  assert.equal(SC.heldInfo('wizard', 'spell2').name, 'GLACIAL NOVA');
});
