/* difficulty.js - the game's difficulty modes: EASY, NORMAL, HARD, and a DEV mode for the developer.
 *
 *   mode     enemy health  enemy damage  aiming
 *   EASY     0.70x         0.60x         smart auto-aim
 *   NORMAL   1.00x         1.00x         smart auto-aim (the baseline every other number in the game is tuned against)
 *   HARD     1.25x         1.35x         NO auto-aim: every attack and spell goes exactly where you aim (mouse / dragging the ATK button / your move direction)
 *   DEV      the HARDEST, the one the developer plays on: no auto-aim, 1.60x health, 1.80x damage at the slider's 100% mark; the slider at the top middle scales that
 *            from 25% to 200% of it. Only offered when the page is opened with ?dev=1
 *
 * HARD gives enemies more health and damage because you lose the auto-aim: a player who has to aim every shot lands fewer hits, so the creatures get a little tougher
 * to keep the fights equally long, not easier. The choice is remembered. CC.Difficulty: mode(), setMode(m), modes(), autoAim(), hpMul(), dmgMul(), devAvailable(),
 * get()/set() (the dev slider), draw(ctx,W,H,push).
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, KEY = 'emberdeep-difficulty', MKEY = 'emberdeep-difficulty-mode', DKEY = 'emberdeep-dev';
  var PRESETS = {
    easy:   { name: 'EASY',   hp: 0.70, dmg: 0.60, aim: true,  desc: 'Enemies have 30% less health and hit 40% softer.' },
    normal: { name: 'NORMAL', hp: 1.00, dmg: 1.00, aim: true,  desc: 'The intended game.' },
    hard:   { name: 'HARD',   hp: 1.25, dmg: 1.35, aim: false, desc: 'No auto-aim: aim every shot yourself. Enemies have 25% more health and hit 35% harder.' },
    dev:    { name: 'DEV',    hp: 1.60, dmg: 1.80, aim: false, desc: 'The hardest: no auto-aim, 60% more health, 80% more damage. Slider tunes it.' }
  };
  var level = 1, md = 'normal', dev = false;
  try { if (/[?&]dev=1/.test(root.location.search)) root.localStorage.setItem(DKEY, '1'); dev = root.localStorage.getItem(DKEY) === '1'; } catch (_) { dev = /[?&]dev=1/.test((root.location && root.location.search) || ''); }
  try { var sv = parseFloat(root.localStorage.getItem(KEY)); if (isFinite(sv)) level = Math.max(0, Math.min(2, sv)); var m0 = root.localStorage.getItem(MKEY); if (PRESETS[m0] && (m0 !== 'dev' || dev)) md = m0; } catch (_) { /* optional */ }
  function slider() { return level <= 1 ? 0.25 + 0.75 * level : level; }
  function hpMul() { return md === 'dev' ? PRESETS.dev.hp * slider() : PRESETS[md].hp; }
  function dmgMul() { return md === 'dev' ? PRESETS.dev.dmg * slider() : PRESETS[md].dmg; }
  function setMode(m) { if (!PRESETS[m] || (m === 'dev' && !dev)) return; md = m; try { root.localStorage.setItem(MKEY, m); } catch (_) { /* optional */ } }
  function set(v) { level = Math.max(0, Math.min(2, Math.round(v * 20) / 20)); try { root.localStorage.setItem(KEY, String(level)); } catch (_) { /* optional */ } }
  // Enemies lose less health per hit when difficulty is high: damage dealt to them is divided by the multiplier (so 0.7x health = they take 1/0.7 as much).
  function wrapEnemies() {
    var E = CC.Enemies; if (!E || !E.damage || E._diffWrapped) return;
    var base = E.damage; E._diffWrapped = true;
    E.damage = function (e, amount, type) { return base.call(E, e, amount / hpMul(), type); };
  }
  function pill(c, x, y, w, h) { c.beginPath(); c.moveTo(x + 5, y); c.arcTo(x + w, y, x + w, y + h, 6); c.arcTo(x + w, y + h, x, y + h, 6); c.arcTo(x, y + h, x, y, 6); c.arcTo(x, y, x + w, y, 6); c.closePath(); }
  function draw(c, W, H, push) {
    wrapEnemies();
    var mm = CC.Minimap, left = mm ? mm.margin + mm.size + 8 : 12, right = Math.min(214, Math.max(150, W - 8 - left)) + 8;
    var avail = W - left - right - 12;
    if (md !== 'dev') { // a small badge for the modes that change the game; Normal stays out of the way
      if (md === 'normal') return;
      var bw = 64, bx = Math.round(W / 2 - bw / 2); if (bx < left) bx = left;
      c.save(); pill(c, bx, 8, bw, 16); c.fillStyle = 'rgba(10,6,14,0.7)'; c.fill(); c.lineWidth = 1.2; c.strokeStyle = md === 'hard' ? '#a43a3a' : '#4a8a62'; c.stroke();
      c.font = 'bold 9px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = md === 'hard' ? '#f0a0a0' : '#a8e0b8'; c.fillText(PRESETS[md].name, bx + bw / 2, 16.5); c.restore();
      return;
    }
    var w = Math.max(92, Math.min(190, avail)), x = Math.round(W / 2 - w / 2), y = 8, h = 26;
    if (x < left) x = left;
    var tx = x + 10, tw = w - 20, ty = y + 18, fx = level / 2, col = level > 1.33 ? '#e0584a' : level > 0.66 ? '#e0a84a' : '#6cc98a';
    c.save(); pill(c, x, y, w, h);
    c.fillStyle = 'rgba(10,6,14,0.78)'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#5a4630'; c.stroke();
    c.font = 'bold 9px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillStyle = '#d9c7a0';
    c.fillText('DEV DIFFICULTY ' + Math.round(level * 100) + '%', x + w / 2, y + 12);
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(tx, ty - 1.5, tw, 3);
    c.fillStyle = col; c.fillRect(tx, ty - 1.5, tw * fx, 3);
    c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillRect(tx + tw / 2 - 0.5, ty - 4, 1, 8); // the 100% mark, in the middle
    c.beginPath(); c.arc(tx + tw * fx, ty, 4.2, 0, 6.2832); c.fillStyle = '#f4ead0'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = col; c.stroke();
    c.restore();
    if (push) push(x, y, w, h + 4, function (px) { set(2 * (px - tx) / tw); });
  }
  wrapEnemies(); // installed at load (toughfliers.js, loaded just before, sits inside it), and again on first draw in case the enemy module arrived late
  CC.Difficulty = {
    PRESETS: PRESETS, mode: function () { return md; }, setMode: setMode, devAvailable: function () { return dev; },
    modes: function () { return dev ? ['easy', 'normal', 'hard', 'dev'] : ['easy', 'normal', 'hard']; },
    autoAim: function () { return PRESETS[md].aim; },
    get: function () { return level; }, set: set, hpMul: hpMul, dmgMul: dmgMul, draw: draw, wrap: wrapEnemies
  };
})(window);
