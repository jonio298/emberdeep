/* CC.NightStalkers - the nine things that come out of the dark.
 *
 * At night (see daynight.js) a stalker now and then steps out of the darkness a little way beyond the edge of your light and HUNTS you: it never
 * sleeps, never loses you and is never placed on the map for you to find. They are far stronger than ordinary monsters and each fights with a
 * fixed, telegraphed choreography (a wind-up you can read, then the strike, then a recovery you can punish). At dawn the survivors fade away.
 *
 *   grinmask      The Grinning Mask     floats; lunges through you, fans silver shards, blinks behind you
 *   marionette    The Puppet Butcher    three-cut cleaver combo, then a scissor whirl; or a bloody charge
 *   scytheweaver  The Scythe Weaver     sweeping slash, X-slash, a whirling harvest; enraged below half health
 *   veiledwidow   The Veiled Widow      drifts through walls; reaching snare, sweeping wail
 *   wailchorus    The Wailing Chorus    slow; a scream that rings out, a double lash, a grasp that drags you in
 *   skullbloom    The Skull Bloom       crawls on its roots; bites, lashes a root, spits spores
 *   cinderhound   The Cinderhound       fast; circles, pounces in flames, flurry of claws
 *   gloomcrawler  The Gloom Crawler     stalks half-seen; shadow slashes, leaps on where you stood, a dark pulse
 *   gravemaw      The Gravemaw          huge worm; spits slime, lunges, shakes the ground
 * The sprites are 12-frame sheets (assets/night/<id>.png, art_source/night_monsters/ has the originals).
 * API: DEFS, spawn(id) update(dt) count() clear() drawTele(ctx,cam)
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, E = CC.Enemies, F = CC.Forest, NS = CC.NightStalkers = { DEFS: {}, burns: [] }, PI2 = Math.PI * 2, T = CC.TILE || 32, CELL = 112;
  function R() { return Math.random(); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hero() { return CC.state && CC.state.player; }
  function angd(a, b) { var d = a - b; while (d > Math.PI) d -= PI2; while (d < -Math.PI) d += PI2; return d; }

  /* ---------- the nine ---------- */
  // frames: indexes into the 12-frame sheet. native: which way the art faces ('left' flips it to face right; 'front' is left as drawn)
  var D = NS.DEFS;
  D.grinmask = { name: 'The Grinning Mask', hp: 330, dmg: 22, spd: 96, r: 8, xp: 170, size: 50, native: 'front', fly: true, hover: 10, color: '#c8c4cc', blood: '#8e213c',
    idle: [0, 1, 2, 3], F: { tele: 4, tele2: 5, lunge: 6, sweep: 7, atk: 8, recoil: 9, hover: 10, fade: 11 }, moves: {
      lunge: { range: [60, 270], w: 3, cd: 2.2, steps: [
        { d: 0.55, f: 'tele', lock: 1, tele: { k: 'line', len: 210, w: 34 } },
        { d: 0.24, f: 'lunge', dash: 560, hit: { k: 'line', len: 46, w: 34, dmg: 1.0, kb: 30, path: 1 } },
        { d: 0.2, f: 'atk' }, { d: 0.65, f: 'recoil', v: -0.25 }] },
      fan: { range: [110, 360], w: 2, cd: 4, steps: [
        { d: 0.55, f: 'tele2', lock: 1, tele: { k: 'cone', len: 150, half: 0.5 } },
        { d: 0.28, f: 'lunge', shots: { n: 7, spread: 0.95, spd: 235, dmg: 0.5, col: '#d8dae4', life: 1.7 } },
        { d: 0.75, f: 'hover' }] },
      blink: { range: [30, 400], w: 1.3, cd: 7, steps: [
        { d: 0.4, f: 'fade', fade: 1 }, { d: 0.05, f: 'fade', blink: 'behind' },
        { d: 0.35, f: 'tele', lock: 1, tele: { k: 'cone', len: 75, half: 0.85 }, fadeIn: 1 },
        { d: 0.2, f: 'atk', hit: { k: 'cone', len: 75, half: 0.85, dmg: 1.1, kb: 24 } }, { d: 0.55, f: 'recoil' }] } } };
  D.marionette = { name: 'The Puppet Butcher', hp: 440, dmg: 26, spd: 74, r: 10, xp: 210, size: 68, native: 'front', color: '#8b5a3c', blood: '#7a1818',
    idle: [0, 1, 2, 3], F: { tele: 4, tele2: 5, slash: 6, slash2: 7, big: 8, recoil: 9, drip: 10, down: 11 }, moves: {
      combo: { range: [0, 96], w: 3, cd: 1.6, steps: [
        { d: 0.5, f: 'tele', lock: 1, tele: { k: 'cone', len: 90, half: 0.9 } }, { d: 0.22, f: 'slash', hit: { k: 'cone', len: 90, half: 0.9, dmg: 1.0, at: 0.35 } },
        { d: 0.36, f: 'tele2', lock: 1, tele: { k: 'cone', len: 90, half: 0.9 } }, { d: 0.22, f: 'slash2', hit: { k: 'cone', len: 90, half: 0.9, dmg: 1.1, at: 0.35 } },
        { d: 0.6, f: 'big', lock: 1, tele: { k: 'circle', rad: 78 } }, { d: 0.28, f: 'big', hit: { k: 'circle', rad: 78, dmg: 1.6, kb: 46, at: 0.3 }, fx: 'shake' },
        { d: 0.75, f: 'drip' }] },
      charge: { range: [130, 320], w: 2, cd: 4.5, steps: [
        { d: 0.65, f: 'tele2', lock: 1, tele: { k: 'line', len: 280, w: 36 } },
        { d: 0.5, f: 'big', dash: 430, hit: { k: 'line', len: 50, w: 40, dmg: 1.3, kb: 40, path: 1 }, fx: 'dust' }, { d: 0.7, f: 'recoil' }] } } };
  D.scytheweaver = { name: 'The Scythe Weaver', hp: 480, dmg: 28, spd: 84, r: 11, xp: 240, size: 72, native: 'front', color: '#a8402a', blood: '#7a1818',
    idle: [0, 1, 2, 3], F: { raise: 3, spread: 4, wind: 5, sweep: 6, dbl: 7, spin: 8, recoil: 9, rage: 10, down: 11 }, moves: {
      harvest: { range: [0, 120], w: 3, cd: 1.8, steps: [
        { d: 0.5, f: 'wind', lock: 1, tele: { k: 'cone', len: 112, half: 1.1 } }, { d: 0.24, f: 'sweep', hit: { k: 'cone', len: 112, half: 1.1, dmg: 1.0, at: 0.3 } },
        { d: 0.3, f: 'wind', lock: 1, tele: { k: 'cone', len: 112, half: 1.1 } }, { d: 0.24, f: 'dbl', hit: { k: 'cone', len: 112, half: 1.1, dmg: 1.1, at: 0.3 } },
        { d: 0.5, f: 'spread', tele: { k: 'circle', rad: 100 } },
        { d: 0.9, f: 'spin', ticks: 3, hit: { k: 'circle', rad: 100, dmg: 0.75, kb: 18 }, fx: 'shake' }, { d: 0.75, f: 'recoil' }] },
      leap: { range: [110, 290], w: 2, cd: 4, steps: [
        { d: 0.55, f: 'raise', lock: 1, tele: { k: 'line', len: 270, w: 40 } },
        { d: 0.3, f: 'sweep', dash: 520, hit: { k: 'circle', rad: 64, dmg: 1.3, kb: 40, at: 0.9 }, fx: 'dust' }, { d: 0.7, f: 'recoil' }] },
      roar: { range: [0, 400], w: 0, cd: 12, rage: 1, steps: [
        { d: 0.8, f: 'rage', tele: { k: 'circle', rad: 150 } }, { d: 0.25, f: 'rage', hit: { k: 'circle', rad: 150, dmg: 0.8, kb: 70, at: 0.2 }, fx: 'shake' }, { d: 0.5, f: 'rage' }] } } };
  D.veiledwidow = { name: 'The Veiled Widow', hp: 380, dmg: 24, spd: 66, r: 9, xp: 200, size: 66, native: 'front', fly: true, hover: 6, color: '#8a6a9a', blood: '#6a4a7a',
    idle: [0, 1, 4, 2, 3], F: { glow: 4, arms: 5, spread: 6, reach: 7, sweep: 8, hover: 9, recoil: 10, fade: 11 }, moves: {
      grasp: { range: [30, 170], w: 3, cd: 2.4, steps: [
        { d: 0.5, f: 'arms', lock: 1, tele: { k: 'cone', len: 140, half: 0.5 } },
        { d: 0.22, f: 'reach', hit: { k: 'cone', len: 140, half: 0.5, dmg: 1.0, slow: 1.6, at: 0.4 } },
        { d: 0.35, f: 'spread', lock: 1, tele: { k: 'cone', len: 120, half: 1.3 } },
        { d: 0.3, f: 'sweep', hit: { k: 'cone', len: 120, half: 1.3, dmg: 1.1, kb: 50, at: 0.4 } }, { d: 0.65, f: 'recoil' }] },
      wail: { range: [40, 320], w: 2, cd: 6, steps: [
        { d: 0.85, f: 'hover', tele: { k: 'circle', rad: 135 } }, { d: 0.25, f: 'spread', hit: { k: 'circle', rad: 135, dmg: 0.9, slow: 2, kb: 36, at: 0.2 }, fx: 'shake' }, { d: 0.6, f: 'hover' }] },
      vanish: { range: [30, 420], w: 1.2, cd: 8, steps: [
        { d: 0.45, f: 'fade', fade: 1 }, { d: 0.05, f: 'fade', blink: 'behind' },
        { d: 0.4, f: 'arms', lock: 1, tele: { k: 'cone', len: 100, half: 0.9 }, fadeIn: 1 }, { d: 0.22, f: 'sweep', hit: { k: 'cone', len: 100, half: 0.9, dmg: 1.2, kb: 40, at: 0.3 } }, { d: 0.6, f: 'recoil' }] } } };
  D.wailchorus = { name: 'The Wailing Chorus', hp: 560, dmg: 24, spd: 50, r: 12, xp: 260, size: 76, native: 'front', color: '#a56a6a', blood: '#7a1818',
    idle: [0, 1, 2, 3], F: { spread: 4, grasp: 5, scream: 6, lash: 7, tense: 8, recoil: 9, drool: 10, down: 11 }, moves: {
      scream: { range: [0, 280], w: 2, cd: 5, steps: [
        { d: 0.95, f: 'scream', tele: { k: 'circle', rad: 155 } },
        { d: 0.3, f: 'scream', hit: { k: 'circle', rad: 155, dmg: 1.0, slow: 2.2, kb: 60, at: 0.15 }, shots: { n: 10, spread: PI2, ring: 1, spd: 125, dmg: 0.45, col: '#d88a8a', life: 2.4 }, fx: 'shake' }, { d: 0.8, f: 'drool' }] },
      lash: { range: [0, 165], w: 3, cd: 1.8, steps: [
        { d: 0.5, f: 'spread', lock: 1, tele: { k: 'line', len: 160, w: 44 } }, { d: 0.2, f: 'lash', hit: { k: 'line', len: 160, w: 44, dmg: 1.1, kb: 36, at: 0.35 } },
        { d: 0.4, f: 'spread', lock: 1, tele: { k: 'line', len: 160, w: 44 } }, { d: 0.2, f: 'lash', hit: { k: 'line', len: 160, w: 44, dmg: 1.2, kb: 36, at: 0.35 } }, { d: 0.7, f: 'recoil' }] },
      drag: { range: [90, 290], w: 2, cd: 6, steps: [
        { d: 0.65, f: 'grasp', lock: 1, tele: { k: 'line', len: 300, w: 30 } },
        { d: 0.3, f: 'grasp', hit: { k: 'line', len: 300, w: 30, dmg: 0.9, pull: 90, at: 0.3 } }, { d: 0.5, f: 'tense' }] } } };
  D.skullbloom = { name: 'The Skull Bloom', hp: 400, dmg: 24, spd: 58, r: 10, xp: 190, size: 58, native: 'front', color: '#b0384a', blood: '#6a8a2a',
    idle: [0, 1, 0, 2], F: { open: 3, glow: 4, roots: 5, wind: 6, bite: 7, lash: 8, drool: 9, recoil: 10, wilt: 11 }, moves: {
      bite: { range: [0, 110], w: 3, cd: 1.8, steps: [
        { d: 0.5, f: 'wind', lock: 1, tele: { k: 'circle', rad: 78 } }, { d: 0.18, f: 'bite', hit: { k: 'circle', rad: 78, dmg: 1.2, kb: 26, at: 0.3 } },
        { d: 0.35, f: 'open', tele: { k: 'circle', rad: 78 } }, { d: 0.18, f: 'bite', hit: { k: 'circle', rad: 78, dmg: 1.3, kb: 30, at: 0.3 } }, { d: 0.7, f: 'recoil' }] },
      lash: { range: [90, 290], w: 3, cd: 3, steps: [
        { d: 0.65, f: 'lash', lock: 1, tele: { k: 'line', len: 270, w: 30 } }, { d: 0.25, f: 'lash', hit: { k: 'line', len: 270, w: 30, dmg: 1.1, slow: 1.5, at: 0.35 }, fx: 'dust' }, { d: 0.65, f: 'recoil' }] },
      spit: { range: [120, 340], w: 2, cd: 4.5, steps: [
        { d: 0.6, f: 'drool', lock: 1 }, { d: 0.3, f: 'bite', shots: { n: 3, spread: 0.4, spd: 150, dmg: 0.65, col: '#b6c84a', life: 2.2 } }, { d: 0.8, f: 'drool' }] } } };
  D.cinderhound = { name: 'The Cinderhound', hp: 380, dmg: 25, spd: 150, r: 9, xp: 210, size: 60, native: 'left', color: '#c8501a', blood: '#ff7a1a',
    idle: [0, 1, 0, 1], F: { stalk: 1, stance: 2, eyes: 3, flames: 4, snarl: 5, crouch: 6, claw: 7, lunge: 8, recoil: 9, tired: 10, down: 11 }, moves: {
      pounce: { range: [110, 330], w: 3, cd: 2.5, steps: [
        { d: 0.7, f: 'crouch', lock: 1, tele: { k: 'line', len: 300, w: 38 } },
        { d: 0.34, f: 'lunge', dash: 680, hit: { k: 'line', len: 48, w: 40, dmg: 1.3, burn: 3, kb: 30, path: 1 }, fx: 'dust' }, { d: 0.85, f: 'tired' }] },
      flurry: { range: [0, 100], w: 3, cd: 1.4, steps: [
        { d: 0.35, f: 'snarl', lock: 1, tele: { k: 'cone', len: 82, half: 0.85 } }, { d: 0.18, f: 'claw', hit: { k: 'cone', len: 82, half: 0.85, dmg: 0.85, at: 0.3 } },
        { d: 0.28, f: 'snarl', lock: 1, tele: { k: 'cone', len: 82, half: 0.85 } }, { d: 0.18, f: 'claw', hit: { k: 'cone', len: 82, half: 0.85, dmg: 0.95, at: 0.3 } },
        { d: 0.3, f: 'flames', lock: 1, tele: { k: 'cone', len: 82, half: 0.85 } }, { d: 0.2, f: 'lunge', hit: { k: 'cone', len: 82, half: 0.85, dmg: 1.2, burn: 2, at: 0.3 } }, { d: 0.6, f: 'recoil' }] },
      circle: { range: [130, 360], w: 1.2, cd: 5, steps: [{ d: 1.1, f: 'stalk', orbit: 1 }] } } };
  D.gloomcrawler = { name: 'The Gloom Crawler', hp: 420, dmg: 24, spd: 104, r: 10, xp: 220, size: 62, native: 'front', stealth: true, color: '#6a3a8a', blood: '#6a2a8a',
    idle: [0, 1, 0, 2], F: { creep: 1, stalk: 2, dim: 3, glow: 4, flare: 5, wind: 6, slash: 7, lunge: 8, recoil: 9, pose: 10, melt: 11 }, moves: {
      slash: { range: [0, 125], w: 3, cd: 1.6, steps: [
        { d: 0.5, f: 'wind', lock: 1, tele: { k: 'cone', len: 118, half: 1.25 } }, { d: 0.22, f: 'slash', hit: { k: 'cone', len: 118, half: 1.25, dmg: 1.1, at: 0.3 }, fx: 'dust' },
        { d: 0.3, f: 'wind', lock: 1, tele: { k: 'cone', len: 118, half: 1.25 } }, { d: 0.22, f: 'slash', hit: { k: 'cone', len: 118, half: 1.25, dmg: 1.2, at: 0.3 } }, { d: 0.65, f: 'recoil' }] },
      ambush: { range: [150, 340], w: 3, cd: 4, steps: [
        { d: 0.7, f: 'flare', lockPoint: 1, tele: { k: 'circle', rad: 72, atTarget: 1 } },
        { d: 0.3, f: 'lunge', dashToTarget: 1, hit: { k: 'circle', rad: 72, dmg: 1.4, kb: 40, at: 0.85, atTarget: 1 }, fx: 'dust' }, { d: 0.8, f: 'recoil' }] },
      pulse: { range: [0, 220], w: 1.5, cd: 7, steps: [
        { d: 0.8, f: 'flare', tele: { k: 'circle', rad: 145 } }, { d: 0.25, f: 'glow', hit: { k: 'circle', rad: 145, dmg: 0.85, slow: 1.8, kb: 34, at: 0.2 }, fx: 'shake' }, { d: 0.6, f: 'pose' }] } } };
  D.gravemaw = { name: 'The Gravemaw', hp: 640, dmg: 28, spd: 42, r: 13, xp: 300, size: 74, native: 'left', color: '#7a5a8a', blood: '#a8b030',
    idle: [0, 1, 0, 3], F: { closed: 2, open: 3, wide: 4, power: 5, windup: 6, spit: 7, lunge: 8, recoil: 9, slump: 10, down: 11 }, moves: {
      spit: { range: [140, 360], w: 3, cd: 3.5, steps: [
        { d: 0.65, f: 'windup', lock: 1, tele: { k: 'cone', len: 280, half: 0.35 } }, { d: 0.3, f: 'spit', shots: { n: 3, spread: 0.38, spd: 175, dmg: 0.85, col: '#c0cc3a', life: 2.2 } },
        { d: 0.5, f: 'wide' }, { d: 0.25, f: 'spit', shots: { n: 1, spread: 0, spd: 200, dmg: 1.0, col: '#c0cc3a', life: 2.2 } }, { d: 0.6, f: 'recoil' }] },
      lunge: { range: [0, 170], w: 3, cd: 3, steps: [
        { d: 0.75, f: 'wide', lock: 1, tele: { k: 'line', len: 190, w: 56 } }, { d: 0.34, f: 'lunge', dash: 480, hit: { k: 'line', len: 60, w: 60, dmg: 1.5, kb: 50, path: 1 }, fx: 'dust' }, { d: 1.0, f: 'recoil' }] },
      quake: { range: [0, 400], w: 1.5, cd: 8, steps: [
        { d: 0.9, f: 'power', tele: { k: 'circle', rad: 165 } }, { d: 0.28, f: 'power', hit: { k: 'circle', rad: 165, dmg: 1.1, slow: 1.6, kb: 55, at: 0.2 }, fx: 'shake' }, { d: 0.7, f: 'slump' }] } } };
  // the sprites are drawn small, to sit with the ordinary monsters, so every reach, telegraph and dash is scaled down with them
  var BIG = 1.3, K = 0.72 * BIG; // the stalkers are drawn 30% larger, with their reach, telegraphs and hit circles
  Object.keys(D).forEach(function (id) {
    var def = D[id]; if (def.scaled) return; def.scaled = 1; def.size = Math.round(def.size * BIG); def.r = Math.round(def.r * BIG * 10) / 10; if (def.hover) def.hover *= BIG;
    Object.keys(def.moves).forEach(function (mk) {
      var m = def.moves[mk]; m.range = [m.range[0] * K, m.range[1] * K];
      m.steps.forEach(function (st) {
        if (st.dash) st.dash *= K;
        [st.tele, st.hit].forEach(function (o) { if (!o) return; ['len', 'rad', 'w'].forEach(function (q) { if (o[q]) o[q] *= K; }); });
      });
    });
  });
  var IDS = Object.keys(D);
  NS.ids = IDS;

  /* ---------- sprites ---------- */
  var imgs = {};
  function sprite(id) {
    if (imgs[id] !== undefined) return imgs[id];
    imgs[id] = null;
    if (typeof Image !== 'undefined') { var im = new Image(); im.onload = function () { imgs[id] = im; }; im.onerror = function () { imgs[id] = false; }; im.src = 'assets/night/' + id + '.png'; }
    return imgs[id];
  }
  NS.preload = function () { IDS.forEach(sprite); };

  /* ---------- registration ---------- */
  if (E && E.TYPES) IDS.forEach(function (id) { if (!E.TYPES[id]) E.TYPES[id] = { name: D[id].name, hp: D[id].hp, spd: D[id].spd, dmg: D[id].dmg, r: D[id].r, xp: D[id].xp, color: D[id].color, w: 0, blood: D[id].blood }; });

  /* ---------- fighting helpers ---------- */
  function mv(e, dx, dy, fly) { if (fly) { e.x += dx; e.y += dy; return false; } var Dg = CC.Dungeon, r = Dg && Dg.moveWithCollision ? Dg.moveWithCollision(e, dx, dy) : (e.x += dx, e.y += dy, null); return !!(r && (r.hitX || r.hitY)); }
  function hurt(p, e, amt) {
    if (!p || p.hp <= 0 || p.invuln > 0) return 0;
    var dmg = Math.max(1, Math.round(amt * 100 / (100 + (p.armor || 0))));
    p.hp -= dmg; p.invuln = 0.4; p.hurtFlash = 0.2;
    if (CC.fx) { if (CC.fx.shake) CC.fx.shake(4); if (CC.fx.text) CC.fx.text(p.x, p.y - 14, '-' + dmg, '#ff7a6a', 13); if (CC.fx.blood) CC.fx.blood(p.x, p.y, 6); }
    if (CC.Audio && CC.Audio.fx) CC.Audio.fx('hit', { x: p.x, y: p.y, vol: 0.7, gap: 80 });
    return dmg;
  }
  function inShape(p, e, h, ang) { // is the player inside the strike?
    var ox = h.atTarget && e.tx !== undefined ? e.tx : e.x, oy = h.atTarget && e.ty !== undefined ? e.ty : e.y, dx = p.x - ox, dy = p.y - oy, d = Math.hypot(dx, dy), pr = (p.r || 8) * 0.8;
    if (h.k === 'circle') return d <= h.rad + pr;
    if (h.k === 'cone') return d <= h.len + pr && Math.abs(angd(Math.atan2(dy, dx), ang)) <= h.half + (d > 1 ? Math.atan2(pr, d) : 0);
    var ux = Math.cos(ang), uy = Math.sin(ang), along = dx * ux + dy * uy, side = Math.abs(-dx * uy + dy * ux); // a line
    return along >= -6 && along <= h.len + pr && side <= h.w / 2 + pr;
  }
  function applyHit(e, h, ang, p) {
    if (!p || p.hp <= 0 || !inShape(p, e, h, ang)) return;
    var dealt = hurt(p, e, e.dmg * h.dmg);
    if (!dealt) return;
    var away = Math.atan2(p.y - e.y, p.x - e.x);
    if (h.kb) mv(p, Math.cos(away) * h.kb, Math.sin(away) * h.kb);
    if (h.pull) mv(p, -Math.cos(away) * h.pull, -Math.sin(away) * h.pull);
    if (h.slow && CC.Classes && CC.Classes.status) { try { CC.Classes.status(p, 'slow', h.slow, 0.55); } catch (x) { p.slowT = Math.max(p.slowT || 0, h.slow); } } else if (h.slow) p.slowT = Math.max(p.slowT || 0, h.slow);
    if (h.burn) NS.burns.push({ t: h.burn, dps: e.dmg * 0.22, acc: 0 });
  }
  function shoot(e, s, ang) {
    var n = s.n, i;
    for (i = 0; i < n; i++) { var a = s.ring ? ang + i * PI2 / n : n === 1 ? ang : ang - s.spread / 2 + s.spread * i / (n - 1); E._shoot(e, a, s.spd, e.dmg * s.dmg, s.col, 'orb', s.life); }
  }
  function fxs(e, kind) {
    if (!CC.fx) return;
    if (kind === 'shake' && CC.fx.shake) CC.fx.shake(5);
    if (kind === 'dust' && CC.fx.burst) CC.fx.burst(e.x, e.y + 8, '#8a7a6a', 8, 70);
  }

  /* ---------- the brain: pick a move, then run its steps ---------- */
  function pickMove(e, d, def) {
    var rage = e.hp < e.maxHp * 0.5, total = 0, list = [], k, m;
    for (k in def.moves) { m = def.moves[k]; if ((e.mcd[k] || 0) > 0 || d < m.range[0] || d > m.range[1]) continue; if (m.rage && !rage) continue; var w = m.w || 0.01; if (m.rage && !e.raged) w = 100; if (w > 0) { list.push([k, w]); total += w; } }
    if (!list.length) return null;
    var r = R() * total; for (var i = 0; i < list.length; i++) { r -= list[i][1]; if (r <= 0) return list[i][0]; }
    return list[list.length - 1][0];
  }
  function frameOf(def, key) { return typeof key === 'number' ? key : def.F[key] !== undefined ? def.F[key] : 0; }
  function think(e, dt, p, d, ang, f) {
    var def = D[e.type]; if (!def) return false;
    e.anim = (e.anim || 0) + dt; e.dangerous = false; e.ns = e.ns || { frame: def.idle[0], alpha: 0 };
    var ns = e.ns; e.mcd = e.mcd || {}; for (var kk in e.mcd) if (e.mcd[kk] > 0) e.mcd[kk] -= dt;
    ns.alpha = Math.min(1, ns.alpha + dt / 1.4); // it steps out of the dark
    if (e.leaving) { ns.alpha = Math.max(0, ns.alpha - dt / 1.2 - 0.0001); e.leaving = 1; return true; }
    if (!p || p.hp <= 0) { ns.tele = null; return true; }
    e.face = p.x >= e.x ? 1 : -1; e.asleep = false;
    var sp = e.spd * (f || 1) * dt, step = e.step;
    if (ns.alpha < 0.55) { mv(e, Math.cos(ang) * sp * 0.4, Math.sin(ang) * sp * 0.4, def.fly); ns.frame = def.idle[0]; return true; } // still half in the dark: it drifts closer, harmless
    if (!step) { // between moves: stalk
      ns.tele = null; e.t = 0;
      var raged = e.hp < e.maxHp * 0.5;
      if (e.recov > 0) e.recov -= dt;
      var name = e.mname || e.recov > 0 ? null : pickMove(e, d, def);
      if (name) { e.mname = name; e.si = 0; e.mv = def.moves[name]; e.st = 0; e.mcd[name] = (e.mv.cd || 2) * (raged ? 0.7 : 1); if (e.mv.rage) e.raged = true; step = e.step = e.mv.steps[0]; e.stepStart = true; }
      else {
        var want = def.moves.circle ? 150 : def.fly ? 80 : 40, k2 = d > want ? 1 : -0.2;
        if (def.stealth) ns.alpha = d > 170 ? 0.38 : Math.min(1, ns.alpha + dt * 2);
        e.orbitT = (e.orbitT || 0) + dt;
        mv(e, Math.cos(ang) * sp * k2, Math.sin(ang) * sp * k2, def.fly);
        if (d < 90 && !def.fly) mv(e, Math.cos(ang + 1.57) * sp * 0.5, Math.sin(ang + 1.57) * sp * 0.5);
        var ik = Math.floor(e.anim * 5) % def.idle.length; ns.frame = def.idle[ik]; return true;
      }
    }
    // run the current step
    if (e.stepStart) {
      e.stepStart = false; e.st = 0; e.hitDone = false; e.ticks = 0;
      if (step.lock || step.lockPoint) e.aim = ang;
      if (step.lockPoint) { e.tx = p.x; e.ty = p.y; }
      if (step.blink === 'behind') { var back = Math.atan2(p.y - e.y, p.x - e.x) + Math.PI, a2 = (p.aimX !== undefined ? Math.atan2(p.aimY || 0, p.aimX) : back) + Math.PI; e.x = p.x + Math.cos(back) * 70; e.y = p.y + Math.sin(back) * 70; if (CC.fx && CC.fx.burst) CC.fx.burst(e.x, e.y, '#9a7aba', 10, 80); }
      if (step.shots) { shoot(e, step.shots, e.aim !== undefined ? e.aim : ang); if (CC.Audio && CC.Audio.fx) CC.Audio.fx('wet', { x: e.x, y: e.y, vol: 0.5, gap: 60 }); }
      if (step.fx) fxs(e, step.fx);
      if (e.si === 0 && CC.Audio && CC.Audio.play) CC.Audio.play('stalker_growl' + (1 + Math.floor(R() * 3)), { x: e.x, y: e.y, vol: 0.7, gap: 1500, vary: 0.12 }); // a feral growl as each attack begins
    }
    e.st += dt; var u = clamp(e.st / step.d, 0, 1), aim = e.aim !== undefined ? e.aim : ang;
    ns.frame = frameOf(def, step.f); ns.tele = step.tele ? Object.assign({ ang: aim, u: u, ox: step.tele.atTarget ? e.tx : undefined, oy: step.tele.atTarget ? e.ty : undefined }, step.tele) : null;
    if (step.fade) ns.alpha = Math.max(0.05, 1 - u); if (step.fadeIn) ns.alpha = Math.min(1, 0.1 + u * 1.2);
    e.dangerous = false; // every strike is resolved by the choreography itself (no extra contact damage)
    if (step.dash) { var dd = step.dash * dt; mv(e, Math.cos(aim) * dd, Math.sin(aim) * dd, def.fly); }
    if (step.dashToTarget) { var ddx = e.tx - e.x, ddy = e.ty - e.y, dl = Math.hypot(ddx, ddy), mvd = Math.min(dl, (dl / Math.max(0.05, step.d - e.st + dt)) * dt * 1.4); if (dl > 4) mv(e, ddx / dl * mvd, ddy / dl * mvd); }
    if (step.v) mv(e, Math.cos(ang) * sp * step.v, Math.sin(ang) * sp * step.v, def.fly);
    if (step.orbit) { var orb = ang + 1.57 * (e.orbDir || (e.orbDir = R() < 0.5 ? 1 : -1)); mv(e, Math.cos(orb) * sp * 1.1, Math.sin(orb) * sp * 1.1, def.fly); if (d > 190) mv(e, Math.cos(ang) * sp * 0.4, Math.sin(ang) * sp * 0.4); if (d < 120) mv(e, -Math.cos(ang) * sp * 0.4, -Math.sin(ang) * sp * 0.4); }
    if (step.hit) {
      var at = step.hit.at !== undefined ? step.hit.at : 0.5;
      if (step.hit.path) applyHit(e, step.hit, aim, p); // a charge hurts all along the way
      else if (step.ticks) { var tk = Math.floor(u * step.ticks + 0.001); if (tk > e.ticks) { e.ticks = tk; applyHit(e, step.hit, aim, p); } }
      else if (!e.hitDone && u >= at) { e.hitDone = true; applyHit(e, step.hit, aim, p); if (CC.fx && CC.fx.burst && step.hit.k !== 'line') CC.fx.burst(e.x + Math.cos(aim) * 30, e.y + Math.sin(aim) * 30, '#ff9a8a', 6, 60); }
    }
    if (e.st >= step.d) { e.si++; if (e.si >= e.mv.steps.length) { e.step = null; e.mname = null; ns.tele = null; e.recov = 0.35 + R() * 0.5; } else { e.step = e.mv.steps[e.si]; e.stepStart = true; } }
    return true;
  }
  if (E) {
    var prevThink = E._think;
    E._think = function (e, dt, p, d, ang, f) { if (e.type && D[e.type]) { think(e, dt, p, d, ang, f); return; } return prevThink.apply(this, arguments); };
    var prevSpawn = E.spawn;
    E.spawn = function (type) { var e = prevSpawn.apply(this, arguments); if (e && D[type]) { var def = D[type]; e.miniBoss = true; e.noKnock = true; e.maxHp = e.hp = def.hp * (0.7 + (e.lvl || 3) * 0.1); e.dmg = def.dmg * (0.8 + (e.lvl || 3) * 0.05); e.r = def.r; e.ghost = !!def.fly; e.spd = def.spd; e.nightStalker = true; } return e; };
    var prevKill = E._kill;
    E._kill = function (e) { var was = !!(e && e.dead), r = prevKill.apply(this, arguments); if (e && e.dead && !was && e.nightStalker && !e.leaving) { try { slain(e); } catch (x) { if (root.console) console.error(x); } } return r; };
  }
  function slain(e) {
    var p = hero(); NS.slain = (NS.slain || 0) + 1;
    if (CC.fx) { CC.fx.text(e.x, e.y - 30, 'NIGHTMARE SLAIN', '#ffb0a0', 13); CC.fx.shake && CC.fx.shake(6); }
    if (CC.Loot && CC.Loot.roll) { var lv = Math.max(3, Math.round(((p && p.level) || 3) * 0.7)); CC.Loot.roll({ x: e.x, y: e.y, boss: true }, lv, 4); CC.Loot.roll({ x: e.x, y: e.y, elite: true }, lv, 6); }
  }

  /* ---------- severed parts: a torn, bleeding gap is cut out of the sprite where the limb was (the part itself flies off via Enemies._detach) ---------- */
  var HOLES = { // [x0, y0, x1, y1, the side that is torn] in sprite-cell pixels
    head: [22, -20, 90, 34, 'b'], hornLeft: [-20, -20, 38, 26, 'b'], hornRight: [74, -20, 132, 26, 'b'],
    armLeft: [-20, 34, 32, 84, 'r'], armRight: [80, 34, 132, 84, 'l'],
    legLeft: [-20, 86, 56, 132, 't'], legRight: [56, 86, 132, 132, 't']
  };
  var cutCv = null;
  function jagged(h, seed) { // a rectangle that reaches past the cell, with a ragged torn edge on one side
    var x0 = h[0], y0 = h[1], x1 = h[2], y1 = h[3], side = h[4], pts = [], n = 6, i, j;
    function w(k) { return Math.sin(seed * 12.9 + k * 7.3) * 4.5; }
    if (side === 'b') { pts.push([x0, y0], [x1, y0], [x1, y1]); for (i = n; i >= 0; i--) pts.push([x0 + (x1 - x0) * i / n, y1 + (i % 2 ? 5 : -2) + w(i)]); }
    else if (side === 't') { pts.push([x0, y1], [x1, y1], [x1, y0]); for (i = n; i >= 0; i--) pts.push([x0 + (x1 - x0) * i / n, y0 + (i % 2 ? -5 : 2) + w(i)]); }
    else if (side === 'r') { pts.push([x0, y0], [x0, y1]); for (j = n; j >= 0; j--) pts.push([x1 + (j % 2 ? 5 : -2) + w(j), y0 + (y1 - y0) * (1 - j / n)]); }
    else { pts.push([x1, y0], [x1, y1]); for (j = n; j >= 0; j--) pts.push([x0 + (j % 2 ? -5 : 2) + w(j), y0 + (y1 - y0) * (1 - j / n)]); }
    return pts;
  }
  function carve(im, cx, cy, lost, e) {
    if (!cutCv) { cutCv = document.createElement('canvas'); cutCv.width = cutCv.height = CELL; }
    var c = cutCv.getContext('2d'); if (!c) return null;
    c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, CELL, CELL); c.drawImage(im, cx, cy, CELL, CELL, 0, 0, CELL, CELL);
    var seed = (e.id || e.x * 0.013 + e.y * 0.007) % 97, blood = D[e.type] && D[e.type].blood || '#7a1818', i, k, pts;
    c.globalCompositeOperation = 'destination-out'; c.fillStyle = '#000';
    for (i = 0; i < lost.length; i++) { pts = jagged(HOLES[lost[i]], seed + i); c.beginPath(); for (k = 0; k < pts.length; k++) k ? c.lineTo(pts[k][0], pts[k][1]) : c.moveTo(pts[k][0], pts[k][1]); c.closePath(); c.fill(); }
    c.globalCompositeOperation = 'source-atop'; c.strokeStyle = blood; c.lineWidth = 6; c.lineJoin = 'round'; // wet raw flesh along the tear
    for (i = 0; i < lost.length; i++) { pts = jagged(HOLES[lost[i]], seed + i); c.beginPath(); for (k = 0; k < pts.length; k++) k ? c.lineTo(pts[k][0], pts[k][1]) : c.moveTo(pts[k][0], pts[k][1]); c.closePath(); c.stroke(); }
    c.globalCompositeOperation = 'source-over';
    return cutCv;
  }
  // flying stalkers count as bodies too: the ordinary anatomy code skips ghosts, so it is let through for them
  if (E && E._dismember) { var prevDis = E._dismember; E._dismember = function (e) { if (e && e.nightStalker && e.ghost) { e.ghost = false; try { return prevDis.apply(this, arguments); } finally { e.ghost = true; } } return prevDis.apply(this, arguments); }; }

  /* ---------- drawing ---------- */
  function drawMonster(ctx, e, r, col, dark, t) {
    var def = D[e.type]; if (!def) return false;
    var im = sprite(e.type), ns = e.ns || { frame: def.idle[0], alpha: 1 }, fr = e.dead ? 11 : (e.flash > 0 && !e.step ? def.F.recoil : ns.frame);
    var size = def.size, a = e.dead ? 1 : ns.alpha, bob = def.fly ? Math.sin((e.anim || 0) * 3) * 3 - (def.hover || 0) : 0;
    ctx.save(); ctx.globalAlpha *= Math.max(0, a);
    if (!im) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, -r, r, 0, PI2); ctx.fill(); ctx.restore(); return true; }
    if (def.native === 'left') ctx.scale(-1, 1);
    var cx = (fr % 4) * CELL, cy = Math.floor(fr / 4) * CELL, sc = size / CELL * (def.fly ? 1.0 : 1);
    var src = im, sx0 = cx, sy0 = cy, lost = e.missing && !e.dead ? Object.keys(e.missing).filter(function (k) { return e.missing[k] && HOLES[k]; }) : [];
    if (lost.length && typeof document !== 'undefined') { var cut = carve(im, cx, cy, lost, e); if (cut) { src = cut; sx0 = 0; sy0 = 0; } }
    ctx.drawImage(src, sx0, sy0, CELL, CELL, -size / 2, -size + r * 0.9 + bob, size, size);
    if (e.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 0.35; ctx.drawImage(src, sx0, sy0, CELL, CELL, -size / 2, -size + r * 0.9 + bob, size, size); }
    ctx.restore();
    return true;
  }
  if (F && !F._nsDraw) {
    F._nsDraw = true;
    var prevDraw = F.drawMonster;
    F.drawMonster = function (ctx, e, r, col, dark, t) { if (e.type && D[e.type]) return drawMonster(ctx, e, r, col, dark, t); return prevDraw ? prevDraw.apply(this, arguments) : false; };
  }
  function drawTele(ctx, cam) { // the danger zones, painted red on the ground a moment before they strike
    var list = E && E.list, i, e, tl, x, y, u;
    if (!list) return;
    ctx.save();
    for (i = 0; i < list.length; i++) {
      e = list[i]; if (!e.nightStalker || e.dead || !e.ns || !e.ns.tele) continue;
      tl = e.ns.tele; u = clamp(tl.u, 0, 1); x = (tl.ox !== undefined ? tl.ox : e.x) - cam.x; y = (tl.oy !== undefined ? tl.oy : e.y) - cam.y;
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin((E._time || 0) * 22); ctx.fillStyle = 'rgba(255,40,40,' + (0.12 + 0.22 * u) + ')'; ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = 1.6;
      ctx.save(); ctx.translate(x, y + 4);
      if (tl.k === 'circle') { ctx.beginPath(); ctx.ellipse(0, 0, tl.rad, tl.rad * 0.72, 0, 0, PI2); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.ellipse(0, 0, tl.rad * u, tl.rad * u * 0.72, 0, 0, PI2); ctx.stroke(); }
      else if (tl.k === 'cone') { ctx.rotate(tl.ang); ctx.scale(1, 0.72); ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, tl.len, -tl.half, tl.half); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, tl.len * u, -tl.half, tl.half); ctx.stroke(); }
      else { ctx.rotate(tl.ang); ctx.scale(1, 0.72); ctx.fillRect(0, -tl.w / 2, tl.len, tl.w); ctx.strokeRect(0, -tl.w / 2, tl.len, tl.w); ctx.fillStyle = 'rgba(255,90,70,' + (0.2 + 0.3 * u) + ')'; ctx.fillRect(0, -tl.w / 2, tl.len * u, tl.w); }
      ctx.restore();
    }
    ctx.restore();
  }
  NS.drawTele = drawTele;
  if (E && E.draw) { var prevEDraw = E.draw; E.draw = function (ctx, cam) { if (cam && E.list && E.list.some(function (q) { return q.nightStalker; })) { var r0 = prevEDraw.apply(this, arguments); try { drawTele(ctx, cam); } catch (x) { if (root.console) console.error(x); } return r0; } return prevEDraw.apply(this, arguments); }; }

  /* ---------- the director: who comes out of the dark, and when ---------- */
  var dir = { t: 40, nightFor: 0, announced: false };
  NS.count = function () { var n = 0; (E && E.list || []).forEach(function (e) { if (e.nightStalker && !e.dead && !e.leaving) n++; }); return n; };
  NS.clear = function () { if (E && E.list) for (var i = E.list.length - 1; i >= 0; i--) if (E.list[i].nightStalker) E.list.splice(i, 1); NS.burns.length = 0; dir.t = 40; dir.nightFor = 0; dir.announced = false; };
  var SPAWN_AREAS = { forest: 1, plains: 1, 'rocky-pass': 1, village: 1 };
  function pickType(area) {
    var w = { grinmask: 3, marionette: 3, scytheweaver: 2, veiledwidow: 3, wailchorus: 2, skullbloom: area === 'plains' ? 3 : 1.5, cinderhound: area === 'plains' ? 3 : 1.5, gloomcrawler: 3, gravemaw: area === 'plains' ? 2.5 : 1 };
    var total = 0, k; for (k in w) total += w[k]; var r = R() * total; for (k in w) { r -= w[k]; if (r <= 0) return k; } return 'grinmask';
  }
  NS.spawn = function (type, near) {
    var p = hero(), m = CC.Dungeon; if (!p || !E) return null;
    for (var tries = 0; tries < 24; tries++) {
      var a = R() * PI2, dist = 340 + R() * 110, x = p.x + Math.cos(a) * dist, y = p.y + Math.sin(a) * dist;
      if (near) { x = p.x + Math.cos(a) * 120; y = p.y + Math.sin(a) * 120; }
      if (m && m.isSolid && D[type].fly !== true && m.isSolid(x, y)) continue;
      if (m && m.isSolid && D[type].fly === true && m.isSolidTile && m.isSolidTile(Math.floor(x / T), Math.floor(y / T)) && tries < 20) continue;
      var e = E.spawn(type, x, y, Math.max(3, (p.level || 3)), { awake: true });
      if (!e) return null; e.asleep = false; e.nightStalker = true; e.ns = { frame: D[type].idle[0], alpha: 0 };
      if (CC.fx && CC.fx.burst) CC.fx.burst(x, y, '#2a1a3a', 18, 70);
      if (CC.Audio && CC.Audio.fx) CC.Audio.fx('ghost_moan', { x: x, y: y, vol: 0.5, gap: 200 });
      if (CC.Audio && CC.Audio.play) CC.Audio.play('stalker_growl' + (1 + Math.floor(R() * 3)), { x: x, y: y, vol: 0.6, gap: 400, delay: 0.4 });
      return e;
    }
    return null;
  };
  NS.update = function (dt) {
    var s = CC.state, DN = CC.DayNight; if (!s || s.mode !== 'dungeon' || !DN || !E || s.coop) return;
    var p = hero(), a = s.area, out = !!SPAWN_AREAS[a], night = DN.isNight && DN.isNight() && DN.nightness() > 0.7, i, e;
    // burning
    for (i = NS.burns.length - 1; i >= 0; i--) { var b = NS.burns[i]; b.t -= dt; b.acc += b.dps * dt; if (b.acc >= 1 && p && p.hp > 0) { var n = Math.floor(b.acc); b.acc -= n; p.hp -= n; if (CC.fx && CC.fx.text && Math.random() < 0.5) CC.fx.text(p.x, p.y - 10, '-' + n, '#ff9a3a', 10); } if (b.t <= 0) NS.burns.splice(i, 1); }
    // dawn, or leaving the outdoors: the stalkers slip away
    var keep = out && night;
    for (i = E.list.length - 1; i >= 0; i--) { e = E.list[i]; if (!e.nightStalker) continue; if (!keep && !e.leaving && !e.dead && !e.testSpawn) e.leaving = 1; if (e.leaving && e.ns && e.ns.alpha <= 0.02) E.list.splice(i, 1); }
    if (!keep || !p || p.hp <= 0) { dir.nightFor = 0; dir.announced = false; if (!out) dir.t = 40; return; }
    if (dir.nightFor === 0) dir.t = Math.min(dir.t, 12); // the first one comes out of the dark soon after night falls
    dir.nightFor += dt; dir.t -= dt;
    var cap = dir.nightFor > 150 ? 3 : dir.nightFor > 60 ? 2 : 1;
    if (dir.t <= 0) {
      dir.t = 28 + R() * 40;
      if (NS.count() < cap) { var ne = NS.spawn(pickType(a)); if (ne && !dir.announced) { dir.announced = true; if (CC.fx) CC.fx.text(p.x, p.y - 40, 'SOMETHING STIRS IN THE DARK...', '#c8a0ff', 12); } }
    }
  };
  if (E) { var prevUpdate = E.update; E.update = function (dt) { var r = prevUpdate.apply(this, arguments); try { NS.update(dt); } catch (x) { if (root.console) console.error(x); } return r; }; }
  NS.preload();
})(typeof window !== 'undefined' ? window : globalThis);
