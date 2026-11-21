import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function boot(saved) {
  const storage = new Map();
  if (saved) storage.set('emberdeep-settings', JSON.stringify(saved));
  const window = {
    CC: { state: { mode: 'dungeon' }, Finisher: {} },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, val) => storage.set(key, val)
    }
  };
  window.window = window;
  for (const path of ['critical_scene.js', 'settings.js'])
    runInNewContext(readFileSync(new URL('../' + path, import.meta.url), 'utf8'), window, { filename: path });
  return { CC: window.CC, storage };
}

const hit = { kind: 'slash', x: 30, y: 40, heroClass: 'swordsman',
  targets: [{ id: 1, x: 30, y: 40, r: 8, hp: 10 }] };

test('critical animations are enabled by default and can be turned off immediately', () => {
  const { CC, storage } = boot();
  assert.equal(CC.Settings.get('critAnimations'), true);
  assert.equal(CC.CriticalScene.trigger(hit), true);
  CC.Settings.toggle('critAnimations');
  assert.equal(CC.CriticalScene.isActive(), false);
  assert.equal(CC.CriticalScene.trigger(hit), false);
  assert.equal(CC.CriticalScene.canFinish(), true, 'perfect critical gameplay is unchanged');
  assert.equal(JSON.parse(storage.get('emberdeep-settings')).critAnimations, false);
  CC.Settings.toggle('critAnimations');
  assert.equal(CC.CriticalScene.trigger(hit), true);
});

test('critical animations respect the saved disabled state', () => {
  const { CC } = boot({ critAnimations: false });
  assert.equal(CC.Settings.get('critAnimations'), false);
  assert.equal(CC.CriticalScene.trigger(hit), false);
});
