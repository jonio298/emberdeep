/* Shared Endless lifecycle. Directors own mode-specific maps, entities and queues. */
(function (root) {
  'use strict';
  const CC = root.CC = root.CC || {};
  const modes = { plains: 'Plains Survival', catacombs: 'Catacombs Exploration' };
  const directors = new Map();
  const worldFields = {
    Enemies: ['list', 'remains', 'gore', 'piles', 'projectiles', 'zones', 'boss', 'bossBar', '_floor'],
    Loot: ['drops', '_floor', '_t'],
    Plains: ['map']
  };
  let session = null;
  let rewardAdapter = null;
  let network = null;
  let selector = null;
  let nextId = 0;

  const E = CC.Endless = {
    state: null,
    TUNING: {
      darkness: { minimumRadius: 110, accessibleLevel: 3 },
      catacombs: { healthPerFloor: 0.18, damagePerFloor: 0.10, speedPerFloor: 0.02, speedCap: 0.35 },
      coop: { enemyCount: 1.7, enemyHealth: 1.25 }
    }
  };

  E.registerDirector = function (mode, director) {
    if (!Object.hasOwn(modes, mode) || typeof director?.start !== 'function') {
      throw new TypeError('Invalid Endless director');
    }
    directors.set(mode, director);
  };
  E.setRewardAdapter = function (adapter) { rewardAdapter = adapter; };
  E.setNetworkAdapter = function (adapter) { network = adapter; };
  E.active = function () { return E.state?.phase === 'playing'; };
  E.inSession = function () { return session !== null; };
  E.isGuest = function () { return E.active() && E.state.role === 'guest'; };

  function detachWorld() {
    const dungeon = CC.Dungeon;
    const cave = CC.CaveDungeon;
    const focus = CC.camFocus;
    CC.camFocus = null;
    if (cave) CC.Dungeon = CC.CaveDungeon = Object.create(cave);
    const fields = [];
    for (const [module, keys] of Object.entries(worldFields)) {
      const target = CC[module];
      if (!target) continue;
      for (const key of keys) {
        fields.push([target, key, target[key]]);
        target[key] = Array.isArray(target[key]) ? [] : key === '_t' ? 0 : null;
      }
    }
    return function () {
      CC.Dungeon = dungeon;
      CC.CaveDungeon = cave;
      CC.camFocus = focus;
      for (const [target, key, value] of fields) target[key] = value;
    };
  }

  function clearActors() {
    for (const [module, keys] of Object.entries(worldFields)) {
      for (const key of keys) {
        if (Array.isArray(CC[module]?.[key])) CC[module][key].length = 0;
      }
    }
  }

  function resetPresentation() {
    CC.closeEndlessOverlays?.();
  }

  function setDepth(depth) {
    const run = E.state;
    if (!run || !depth) return;
    if (Number.isFinite(depth.floor)) {
      run.floor = Math.max(1, Math.floor(depth.floor));
      if (run.mode === 'catacombs') {
        CC.state.floor = run.floor;
        if (CC.Loot) CC.Loot._floor = run.floor;
      }
    }
    if (Number.isFinite(depth.level)) run.level = Math.max(0, Math.floor(depth.level));
    if (typeof depth.label === 'string') run.depthLabel = depth.label;
  }

  function remoteHeroes() {
    if (!E.state || E.state.role === 'solo') return [];
    return network?.heroes?.() || CC.state.party || [];
  }

  E.livingHeroes = function () {
    return [...new Set([CC.state.player, ...remoteHeroes()])].filter(hero => hero && hero.hp > 0 && !hero.down);
  };

  function context() {
    return {
      run: E.state,
      world: CC.state,
      livingHeroes: E.livingHeroes,
      setDepth,
      clearActors,
      setMap(map, area, dungeon = map) {
        CC.state.area = area;
        CC.state.map = map;
        CC.Dungeon = dungeon;
        if (CC.Loot) CC.Loot._floor = CC.state.floor;
        const spawn = map?.spawn || map?.start;
        if (spawn) Object.assign(CC.state.player, { x: spawn.x, y: spawn.y });
        CC.snapCamera?.();
      },
      block: E.block,
      send(event, data) { network?.send?.(event, data); }
    };
  }

  // Director methods receive this context. update and kill are host/solo only.
  // draw, drawHud and blocked may also run on guests. depth returns {floor,level,label}.
  // A blocking director can animate via updateBlocked without advancing world time.
  E.start = function (options) {
    if (session && E.state.phase !== 'summary') return false;
    const director = directors.get(options.mode);
    if (!director || (!options.slot && !Object.hasOwn(CC.Classes.DEFS, options.classId))) return false;
    const saved = options.slot ? CC.SaveGame.getCharacter(options.slot) : null;
    const source = options.slot ? saved?.data : CC.SaveGame.makeCharacterData(options.classId);
    const setup = source && CC.SaveGame.restoreCharacterSnapshot(source);
    if (!setup) return false;

    if (!session) session = { previous: CC.state };
    const role = options.role || 'solo';
    session.options = { ...options, role };
    session.snapshot = CC.SaveGame.characterSnapshot(setup);
    session.identity = {
      slot: saved?.slot || 0,
      id: saved ? 'slot:' + saved.slot : options.characterId || 'fresh:' + (root.crypto?.randomUUID?.() || Date.now() + ':' + ++nextId),
      name: setup.charName,
      classId: setup.classId,
      level: setup.player.level
    };
    session.options.characterId = session.identity.id;
    session.director = director;
    session.restoreWorld = detachWorld();
    CC.state = {
      ...setup, mode: 'dungeon', floor: 1, bestFloor: 1, map: null,
      area: options.mode === 'plains' ? 'plains' : 'cave', kills: 0, runGold: 0,
      coop: role !== 'solo', party: []
    };
    E.state = {
      phase: 'playing', mode: options.mode, role, seconds: 0, floor: 1, level: 0,
      kills: 0, biggestHit: 0, blocks: new Set(), retiring: false,
      id: options.runId || root.crypto?.randomUUID?.() || Date.now() + ':' + ++nextId,
      seed: options.seed ?? Math.floor(Math.random() * 0x100000000)
    };
    resetPresentation();
    session.ctx = context();
    try {
      if (role === 'guest') director.startGuest?.(session.ctx);
      else director.start(session.ctx);
      setDepth(director.depth?.(session.ctx));
    } catch (error) {
      try { cleanup(); }
      finally { CC.state = session.previous; session = null; E.state = null; }
      throw error;
    }
    if (role === 'host') network?.send?.('started', E.progress());
    return true;
  };

  E.block = function (reason, blocked = true) {
    if (!E.active()) return;
    if (blocked) E.state.blocks.add(reason);
    else E.state.blocks.delete(reason);
  };

  function canPresent(flags) {
    return E.active() && !E.state.retiring &&
      !flags.paused && !flags.inventory && !flags.perk && !flags.chest &&
      !flags.transition && !flags.disconnect && !CC.state.player?.perkOpen &&
      !CC.UI?.isOpen?.() && (E.state.role === 'solo' || !network?.blocked?.());
  }

  E.canUpdate = function (flags = {}) {
    return canPresent(flags) && E.state.blocks.size === 0 && !session.director.blocked?.(session.ctx);
  };

  E.updateBlocked = function (dt, flags = {}) {
    if (canPresent(flags) && !E.isGuest()) session.director.updateBlocked?.(dt, session.ctx);
  };

  E.update = function (dt, flags) {
    if (!Number.isFinite(dt) || dt <= 0 || !E.canUpdate(flags)) return false;
    if (E.isGuest()) return true;
    E.state.seconds += dt;
    session.director.update?.(dt, session.ctx);
    if (E.active()) {
      setDepth(session.director.depth?.(session.ctx));
      if (E.state.role === 'host') network?.progress?.(E.progress());
    }
    return true;
  };

  E.checkDeath = function () {
    if (E.active() && !E.isGuest() && !E.livingHeroes().length) E.end('death');
  };

  E.progress = function () {
    const { id, mode, seed, seconds, floor, level, kills, depthLabel, biggestHit } = E.state;
    return { id, mode, seed, seconds, floor, level, kills, depthLabel, biggestHit };
  };

  E.sync = function (progress) {
    if (!E.isGuest() || progress.id !== E.state.id || progress.mode !== E.state.mode || progress.seconds < E.state.seconds) return false;
    setDepth(progress);
    if (Number.isFinite(progress.seconds)) E.state.seconds = Math.max(E.state.seconds, progress.seconds);
    if (Number.isFinite(progress.kills)) E.state.kills = Math.max(E.state.kills, progress.kills);
    if (Number.isFinite(progress.biggestHit)) E.state.biggestHit = Math.max(E.state.biggestHit, progress.biggestHit);
    session.director.syncGuest?.(progress, session.ctx);
    return true;
  };

  E.finishGuest = function (progress, reason) {
    if (E.sync(progress)) return E.end(reason);
    return false;
  };

  E.interact = function () {
    if (!E.canUpdate()) return false;
    if (E.isGuest()) return !!network?.interact?.(session.ctx);
    if (session.director.interact?.(session.ctx)) return true;
    const { player, map, floor } = CC.state;
    const near = (point, radius) => point && Math.hypot(player.x - point.x, player.y - point.y) <= radius;
    if (near(map?.stairs, 26)) return E.stairs();
    const chest = map?.chests?.find(item => !item.opened && near(item, 32));
    if (chest && CC.Dungeon?.openChest?.(chest)) {
      CC.Audio?.event?.('chest', chest);
      CC.Loot?.roll?.(chest, floor, 0);
      return true;
    }
    return !!CC.Loot?.pickupNear?.(player);
  };

  E.stairs = function () {
    if (!E.canUpdate() || E.isGuest()) return false;
    const moved = session.director.stairs?.(session.ctx);
    setDepth(session.director.depth?.(session.ctx));
    return !!moved;
  };

  E.onKill = function (enemy) {
    if (!E.active() || E.isGuest()) return;
    E.state.kills++;
    session.director.kill?.(enemy, session.ctx);
  };

  E.usesInstantXp = function () {
    return !E.active() || !session.director.replacesInstantXp;
  };

  E.onHit = function (amount) {
    if (E.active() && Number.isFinite(amount)) E.state.biggestHit = Math.max(E.state.biggestHit, amount);
  };

  E.ambient = function (levels, level) {
    const cap = CC.Settings?.get?.('reduceDarkness') ? E.TUNING.darkness.accessibleLevel : levels.length - 1;
    return levels[Math.max(0, Math.min(Math.floor(level), cap, levels.length - 1))] ?? 1;
  };

  E.drawLighting = function (ctx, cam) {
    if (!E.active()) return;
    const light = session.director.lighting?.(session.ctx);
    if (light) CC.Vfx?.drawEndlessDarkness?.(ctx, cam, E.ambient(light.levels, light.level), Math.max(E.TUNING.darkness.minimumRadius, light.radius || 0));
  };

  E.draw = function (ctx, cam) {
    if (E.active()) session.director.draw?.(ctx, cam, session.ctx);
  };

  E.drawOverlay = function (ctx, W, H, button) {
    if (E.active()) session.director.drawOverlay?.(ctx, W, H, button, session.ctx);
  };

  function cleanup() {
    try { session.director.cleanup?.(session.ctx); }
    finally {
      clearActors();
      resetPresentation();
      session.restoreWorld();
      session.restoreWorld = null;
      session.ctx = null;
      session.snapshot = null;
    }
  }

  E.end = function (reason = 'death') {
    if (!E.active()) return false;
    const active = E.state;
    const restored = CC.SaveGame.restoreCharacterSnapshot(session.snapshot);
    const result = Object.freeze({
      ...E.progress(), elapsedSeconds: active.seconds, reason,
      character: Object.freeze({ ...session.identity, level: restored.player.level })
    });
    const destination = CC.SaveGame.endlessRewardDestination(result.character, restored);
    // Set the phase before callbacks so re-entrant or repeated end messages cannot pay twice.
    E.state = { phase: 'summary', result, reward: null };
    try { cleanup(); }
    finally {
      CC.state = { ...restored, mode: 'endless-summary', map: null, party: [], floor: 1, kills: 0 };
    }
    E.state.reward = (rewardAdapter || CC.EndlessRewards)?.finalize?.(result, destination) || null;
    if (active.role === 'host') network?.send?.('ended', { progress: result, reason });
    return true;
  };

  E.retire = function (confirmed) {
    if (!E.active()) return false;
    if (confirmed === undefined) {
      E.state.retiring = true;
      return true;
    }
    if (!E.state.retiring) return false;
    E.state.retiring = false;
    if (!confirmed) return true;
    if (E.isGuest()) {
      network?.send?.('retireRequested', E.progress());
      return true;
    }
    return E.end('retire');
  };

  E.retry = function () {
    if (E.state?.phase !== 'summary' || E.state.reward?.pending) return false;
    const { runId, seed, characterId, ...options } = session.options;
    if (options.role !== 'solo') return network?.retry?.(options) || false;
    return E.start(options);
  };

  E.exit = function () {
    if (!session || E.state.reward?.pending) return false;
    const previous = session.previous;
    const role = session.options.role;
    try {
      if (E.active()) cleanup();
      if (role !== 'solo') network?.exit?.();
    } finally {
      session = null;
      E.state = null;
      CC.state = previous;
    }
    return true;
  };

  E.formatTime = function (seconds) {
    const n = Math.max(0, Math.floor(seconds + 1e-8));
    const mm = String(Math.floor(n / 60) % 60).padStart(2, '0');
    const ss = String(n % 60).padStart(2, '0');
    return (n >= 3600 ? Math.floor(n / 3600) + ':' : '') + mm + ':' + ss;
  };

  function depthLabel(run) {
    return run.depthLabel || (run.mode === 'plains' ? 'NIGHTFALL ' + run.level : 'FLOOR ' + run.floor);
  }

  function text(ctx, value, x, y, size, color = '#f5e9d4') {
    ctx.font = 'bold ' + size + 'px Georgia, serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
  }

  E.drawHud = function (ctx, W, H, button) {
    if (!E.active()) return;
    const run = E.state;
    ctx.save();
    ctx.fillStyle = 'rgba(13,8,23,0.88)';
    ctx.fillRect(W / 2 - 71, 5, 142, 48);
    text(ctx, E.formatTime(run.seconds), W / 2, 20, 22, '#ffe3a2');
    text(ctx, depthLabel(run) + '  •  Kills ' + run.kills, W / 2, 41, 11);
    ctx.restore();
    session.director.drawHud?.(ctx, W, H, button, session.ctx);
  };

  E.drawRetire = function (ctx, W, H, button) {
    if (!E.active() || !E.state.retiring) return false;
    ctx.fillStyle = 'rgba(8,4,16,0.9)';
    ctx.fillRect(0, 0, W, H);
    text(ctx, 'Retire from this run?', W / 2, H / 2 - 42, 22);
    button(W / 2 - 118, H / 2, 112, 40, 'Cancel', '#4a3a6a', () => E.retire(false));
    button(W / 2 + 6, H / 2, 112, 40, 'Retire', '#723634', () => E.retire(true));
    return true;
  };

  E.openSelector = function () {
    const slots = CC.SaveGame.slots().filter(slot => slot.info);
    selector = { mode: 'plains', players: 'solo', kind: slots.length ? 'saved' : 'new', slot: slots[0]?.n, classId: Object.keys(CC.Classes.DEFS)[0], error: '' };
  };

  E.drawSelector = function (ctx, W, H, button, back) {
    if (!selector) E.openSelector();
    const s = selector;
    const width = Math.min(W - 24, 400);
    const left = (W - width) / 2;
    const gap = 8;
    const half = (width - gap) / 2;
    const line = Math.min(34, Math.max(22, (H - 38) / 10));
    let y = Math.min(92, Math.max(28, H - line * 10 - 12));
    const stage = (value, size = 13) => { text(ctx, value, W / 2, y + line / 2, size); y += line; };
    function pair(key, a, b) {
      [a, b].forEach(([value, label], index) => {
        button(left + index * (half + gap), y, half, line - 4, label, s[key] === value ? '#725432' : '#382d48', () => { s[key] = value; s.error = ''; });
      });
      y += line;
    }
    button(W - 84, 5, 72, 24, 'Back', '#463645', back);
    stage('ENDLESS', 18);
    pair('mode', ['plains', modes.plains], ['catacombs', modes.catacombs]);
    pair('players', ['solo', 'Solo'], ['coop', 'Co-op']);
    pair('kind', ['saved', 'Use My Character'], ['new', 'New Character']);
    const choices = s.kind === 'saved'
      ? CC.SaveGame.slots().filter(slot => slot.info).map(slot => [slot.n, slot.info.name + ' · Lv ' + slot.info.level])
      : Object.entries(CC.Classes.DEFS).map(([id, hero]) => [id, hero.name + ' · Lv 1']);
    const key = s.kind === 'saved' ? 'slot' : 'classId';
    const index = Math.max(0, choices.findIndex(choice => choice[0] === s[key]));
    if (choices.length) {
      const cycle = direction => { s[key] = choices[(index + choices.length + direction) % choices.length][0]; };
      button(left, y, 38, line - 4, '‹', '#382d48', () => cycle(-1));
      text(ctx, choices[index][1], W / 2, y + line / 2, 13);
      button(left + width - 38, y, 38, line - 4, '›', '#382d48', () => cycle(1));
      y += line;
    } else stage('No saved characters');
    stage('Difficulty · ' + (CC.Difficulty?.PRESETS?.[CC.Difficulty.mode()]?.name || 'Normal'));
    const best = (rewardAdapter || CC.EndlessRewards)?.best?.(s.mode);
    stage(best ? 'Best · ' + E.formatTime(best.bestSeconds || 0) + ' · ' + depthLabel({ mode: s.mode, floor: best.bestFloor, level: best.bestLevel }) + ' · Kills ' + (best.kills || 0) : 'No runs recorded');
    button(left, y, width, line - 4, 'START', '#725432', () => {
      if (!choices.length) return;
      const options = { mode: s.mode, [key]: choices[index][0] };
      if (!directors.has(s.mode)) s.error = 'This mode is unavailable.';
      else if (s.players === 'coop') {
        if (!network?.openLobby?.(options)) s.error = 'Endless co-op is unavailable.';
      } else if (!E.start(options)) s.error = 'Could not start this hero.';
    });
    y += line;
    if (s.error) stage(s.error);
  };

  E.drawSummary = function (ctx, W, H, button) {
    if (E.state?.phase !== 'summary') return;
    const { result, reward } = E.state;
    ctx.fillStyle = '#120d20';
    ctx.fillRect(0, 0, W, H);
    const mid = W / 2;
    const y = Math.max(30, H / 2 - 135);
    text(ctx, 'RUN SUMMARY', mid, y, 25, '#ffe3a2');
    text(ctx, E.formatTime(result.seconds) + '  •  ' + depthLabel(result) + '  •  Kills ' + result.kills, mid, y + 43, 16);
    text(ctx, result.character.name + '  •  Lv ' + result.character.level + ' ' + result.character.classId, mid, y + 75, 15);
    text(ctx, 'Biggest hit ' + Math.round(result.biggestHit), mid, y + 100, 13);
    if (reward?.personalBest) text(ctx, 'New personal best', mid, y + 126, 14, '#ffe3a2');
    if (reward?.draw?.(ctx, W, H, button)) return;
    button(mid - 118, y + 156, 112, 40, 'Retry', '#725432', E.retry);
    button(mid + 6, y + 156, 112, 40, 'Exit', '#4a3a6a', E.exit);
  };
})(window);
