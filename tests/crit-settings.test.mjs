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

test('surviving criticals do not freeze; critical kills freeze for 100ms', () => {
  const { CC, stops } = boot();
  assert.equal(CC.Settings.get('critMode'), 'kills');
  assert.equal(CC.CriticalScene.trigger(hit), false, 'no critical cinematic for surviving enemy');
  assert.equal(CC.CriticalScene.trigger({ ...hit, finisher: 1 }), true);
  assert.equal(CC.CriticalScene.status().impactType, 'normal');
  assert.equal(stops[0], .10);
  assert.equal(CC.CriticalScene.rate(), 1, 'no additional world slowdown');
  for (let i = 0; i < 4; i++) CC.CriticalScene.update(.1);
  assert.equal(CC.CriticalScene.isActive(), false, 'impact expires promptly');
  assert.equal(CC.CriticalScene.trigger({ ...hit, finisher: 1 }), false, '3s cooldown');
  for (let i = 0; i < 32; i++) CC.CriticalScene.update(.1);
  assert.equal(CC.CriticalScene.trigger({ ...hit, finisher: 1 }), true);
});

test('elite and boss critical kills have 150ms and 200ms freezes', () => {
  for (const [attrs, delay] of [[{ elite: true }, .15], [{ boss: true }, .20]]) {
    const { CC, stops } = boot();
    assert.equal(CC.CriticalScene.trigger({ ...hit, ...attrs, finisher: 1 }), true);
    assert.equal(stops[0], delay);
  }
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
