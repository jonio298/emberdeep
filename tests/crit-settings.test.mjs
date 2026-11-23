import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function boot(saved) {
  const storage = new Map(), stops = [];
  if (saved) storage.set('emberdeep-settings', JSON.stringify(saved));
  const window = {
    CC: {
      state: { mode: 'dungeon' },
      Finisher: { LEN: { swordsman: 3.3 } },
      fx: { hitStop(t) { stops.push(t); } }
    },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, val) => storage.set(key, val)
    }
  };
  window.window = window;
  for (const path of ['critical_scene.js', 'settings.js'])
    runInNewContext(readFileSync(new URL('../' + path, import.meta.url), 'utf8'), window, { filename: path });
  return { CC: window.CC, storage, stops };
}

const hit = { kind: 'slash', x: 30, y: 40, heroClass: 'swordsman',
  targets: [{ id: 1, x: 30, y: 40, r: 8, hp: 0, dead: true }] };

test('surviving criticals get no cutscene; a critical that kills plays the hero kill cutscene', () => {
  const { CC } = boot();
  assert.equal(CC.Settings.get('critMode'), 'kills');
  assert.equal(CC.CriticalScene.trigger(hit), false, 'no critical cinematic for a surviving enemy');
  assert.equal(CC.CriticalScene.trigger({ ...hit, lethal: true }), true);
  const st = CC.CriticalScene.status();
  assert.equal(st.impact, false, 'the full critical cutscene, not a brief freeze');
  assert.equal(st.duration, 1.18, 'the swordsman crit-kill scene');
  for (let i = 0; i < 14; i++) CC.CriticalScene.update(.1);
  assert.equal(CC.CriticalScene.isActive(), false, 'the scene ends');
  assert.equal(CC.CriticalScene.trigger({ ...hit, lethal: true }), true, 'critical kills are not suppressed by any cooldown');
});

test('back-to-back lethal criticals queue instead of being lost', () => {
  const { CC } = boot();
  assert.equal(CC.CriticalScene.trigger({ ...hit, lethal: true }), true);
  assert.equal(CC.CriticalScene.trigger({ ...hit, lethal: true }), true);
  assert.equal(CC.CriticalScene.status().queued, 1);
  for (let i = 0; i < 14; i++) CC.CriticalScene.update(.1);
  assert.equal(CC.CriticalScene.isActive(), true, 'second kill becomes active');
  for (let i = 0; i < 14; i++) CC.CriticalScene.update(.1);
  assert.equal(CC.CriticalScene.isActive(), false);
});

test('Necromancer soul-reaping crit cinematic starts only on a critical kill', () => {
  const { CC } = boot();
  const necro = { ...hit, heroClass: 'necromancer' };
  CC.Settings.set('critMode', 'all');
  assert.equal(CC.CriticalScene.trigger(necro), false, 'surviving necro crits never start a cutscene');
  assert.equal(CC.CriticalScene.trigger({ ...necro, lethal: true }), true);
  assert.equal(CC.CriticalScene.status().impact, false);
  assert.equal(CC.CriticalScene.status().duration, .88);
});

test('a perfect hit that kills plays the perfect-kill cutscene (the long finisher)', () => {
  const { CC } = boot();
  assert.equal(CC.CriticalScene.trigger({ ...hit, finisher: 1, lethal: true }), true);
  assert.equal(CC.CriticalScene.status().duration, 3.3, 'the swordsman perfect slice runs its full length');
});

test('off mode stops the current scene, and all-hits mode remains opt-in', () => {
  const { CC, storage } = boot();
  CC.CriticalScene.trigger({ ...hit, finisher: 1 });
  CC.Settings.set('critMode', 'off');
  assert.equal(CC.CriticalScene.isActive(), false);
  assert.equal(CC.CriticalScene.trigger({ ...hit, finisher: 1 }), false);
  CC.Settings.set('critMode', 'all');
  assert.equal(CC.CriticalScene.trigger(hit), true);
  assert.equal(CC.CriticalScene.status().impact, false);
  assert.equal(JSON.parse(storage.get('emberdeep-settings')).critMode, 'all');
});

test('legacy disabled settings and checkbox toggle migrate to kill-only', () => {
  const { CC } = boot({ critAnimations: false });
  assert.equal(CC.Settings.get('critMode'), 'off');
  assert.equal(CC.CriticalScene.trigger({ ...hit, finisher: 1 }), false);
  CC.Settings.toggle('critAnimations');
  assert.equal(CC.Settings.get('critMode'), 'kills');
  assert.equal(CC.CriticalScene.trigger({ ...hit, finisher: 1 }), true);
  CC.Settings.toggle('critAnimations');
  assert.equal(CC.CriticalScene.isActive(), false);
});
