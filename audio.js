/* CC.Audio - sound effects (samples borrowed from Chalkboard Dungeon plus synthesised ones) and 8-bit chiptune music, all on Web Audio.
 *
 *   play(name, {vol, rate, x, y, dur, delay})   a sample from assets/sfx (names below), positioned if x/y are given (pan + distance fade)
 *   slash(kind, step, big)                      the synthesised sword slash ('sword' | 'dagger'; step 1-3 of the combo; big = finisher/crit)
 *   fx(name, opts)                              a synthesised effect: hit, crit, cast, zap, throw, caw, eagle, coin, chest, wet, thump, crunch, frost, smoke, bash, whirl, magic, ...
 *   chargeStart() / chargeSet(0..1) / chargeEnd(released)   the charge-up loop that rises in pitch, then the charge blast
 *   music(trackId) / musicState() / update(dt)  chiptune sequencer; update() picks the track from the game state (area, boss, storm...)
 *   setMusic(v), setSfx(v), toggleMusic(), toggleSfx()   volumes (saved in localStorage 'emberdeep-audio')
 * Browsers only start audio after a click or key press: the first one unlocks it. Everything is silent-safe if Web Audio is missing.
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, A = CC.Audio = {}, TAU = Math.PI * 2;
  var duck = 1, ctx = null, master = null, sfxBus = null, musBus = null, noiseBuf = null, bufs = {}, loading = {}, voices = 0, lastPlay = {}, unlocked = false;
  var vol = { music: 0.5, sfx: 0.8, master: 1 }, mute = { music: false, sfx: false };
  try { var sv = JSON.parse(localStorage.getItem('emberdeep-audio') || 'null'); if (sv) { vol.master = sv.v != null ? sv.v : 1; vol.music = sv.m != null ? sv.m : vol.music; vol.sfx = sv.s != null ? sv.s : vol.sfx; mute.music = !!sv.mm; mute.sfx = !!sv.ms; } } catch (e) { /* optional */ }
  function save() { try { localStorage.setItem('emberdeep-audio', JSON.stringify({ v: vol.master, m: vol.music, s: vol.sfx, mm: mute.music, ms: mute.sfx })); } catch (e) { /* optional */ } }
  function R() { return Math.random(); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hero() { var s = CC.state; return s && s.player && !s.player.stub ? s.player : null; }

  var FILES = ['treestab', 'bloodsplatter3', 'thiefknife', 'necrocrithit', 'necrobasic', 'pondspawn', 'critprojectile', 'basicprojectile', 'beargrowl', 'bearroar', 'beardeath', 'newquest', 'levelup', 'levelupvoice', 'thiefcrit', 'blood1', 'swordcrit', 'charge', 'legendarycharge', 'charge_up_boss', 'charge_blast', 'bat_squeak', 'bat_attack', 'explosion', 'splash_explosion', 'thunder_clap', 'enemyhit', 'enemydie', 'player_hit', 'skeleton_attack', 'skeleton_bone_sound', 'skeleton_death', 'ghost_moan', 'ghost_call_2', 'ghost_death', 'level_up', 'item_pickup_gen', 'special_item', 'awesome_legendary', 'door_open', 'door_close', 'door_slam', 'waterdrop1', 'waterdrop2', 'evil_laugh', 'boss_death_scream', 'boss_shot', 'jet_stream_fire', 'friend_summon', 'friend_summon2', 'blob_death', 'blob_hop1', 'radioactive_death', 'splash_hit_1', 'splash_hit_2', 'fountain_entrance', 'powerup', 'legendary'];
  A.names = FILES;

  /* ---------- the context ---------- */
  function init() {
    if (ctx) return true;
    var AC = root.AudioContext || root.webkitAudioContext; if (!AC) return false;
    try { ctx = new AC(); } catch (e) { return false; }
    master = ctx.createGain(); master.gain.value = vol.master;
    var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
    sfxBus = ctx.createGain(); musBus = ctx.createGain(); sfxBus.connect(comp); musBus.connect(comp); comp.connect(master); master.connect(ctx.destination);
    applyVol();
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); var d = noiseBuf.getChannelData(0), b0 = 0, b1 = 0, b2 = 0;
    for (var i = 0; i < d.length; i++) { var w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; } // pink-ish noise
    return true;
  }
  function applyVol() { if (!ctx) return; sfxBus.gain.value = mute.sfx ? 0 : vol.sfx * 1.25; musBus.gain.value = mute.music ? 0 : vol.music * 0.32 * duck; }
  function unlock() {
    if (!init()) return; if (ctx.state === 'suspended') ctx.resume();
    if (!unlocked) { unlocked = true; FILES.forEach(load); }
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { if (root.addEventListener) root.addEventListener(ev, unlock, { passive: true }); });
  function awake(on) { if (!ctx) return; if (on) { if (ctx.state === 'suspended') ctx.resume(); } else if (ctx.state === 'running') ctx.suspend(); }
  if (root.document && root.document.addEventListener) root.document.addEventListener('visibilitychange', function () { awake(!root.document.hidden); });
  if (root.addEventListener) { root.addEventListener('blur', function () { awake(false); }); root.addEventListener('focus', function () { awake(true); }); }
  function load(n) {
    if (bufs[n] || loading[n] || !ctx) return; loading[n] = true;
    fetch('assets/sfx/' + n + '.mp3').then(function (r) { return r.arrayBuffer(); }).then(function (ab) {
      return new Promise(function (res, rej) { ctx.decodeAudioData(ab, res, rej); });
    }).then(function (b) { bufs[n] = b; }).catch(function () { loading[n] = false; });
  }
  A.setMaster = function (v) { vol.master = clamp(v, 0, 1); if (master) master.gain.value = vol.master; save(); };
  A.setMusic = function (v) { vol.music = clamp(v, 0, 1); applyVol(); save(); };
  A.setSfx = function (v) { vol.sfx = clamp(v, 0, 1); applyVol(); save(); };
  A.toggleMusic = function () { mute.music = !mute.music; applyVol(); save(); return !mute.music; };
  A.toggleSfx = function () { mute.sfx = !mute.sfx; applyVol(); save(); return !mute.sfx; };
  A.status = function () { return { ready: !!ctx, state: ctx && ctx.state, loaded: Object.keys(bufs).length, music: !mute.music, sfx: !mute.sfx, track: track && track.id, file: fileKey, vol: vol }; };

  /* ---------- positional helper: pan and fade with distance from the hero ---------- */
  function spatial(o) {
    var p = hero(); if (!o || o.x === undefined || !p) return { g: 1, pan: 0 };
    var dx = o.x - p.x, dy = o.y - p.y, d = Math.hypot(dx, dy);
    return { g: clamp(1 - d / 520, 0, 1), pan: clamp(dx / 260, -0.9, 0.9) };
  }
  function route(node, sp) { var out = node; if (ctx.createStereoPanner && sp.pan) { var pn = ctx.createStereoPanner(); pn.pan.value = sp.pan; node.connect(pn); out = pn; } out.connect(sfxBus); }
  function gate(name, min) { var now = Date.now(); if (lastPlay[name] && now - lastPlay[name] < min) return false; lastPlay[name] = now; return voices < 28; }

  /* ---------- samples ---------- */
  A.play = function (name, o) {
    o = o || {}; if (!ctx || !unlocked || mute.sfx) return null; if (ctx.state === 'suspended') ctx.resume();
    var b = bufs[name]; if (!b) return null; if (!gate(name, o.gap === undefined ? 45 : o.gap)) return null;
    var sp = spatial(o); if (sp.g <= 0.02) return null;
    var src = ctx.createBufferSource(); src.buffer = b; src.playbackRate.value = (o.rate || 1) * (1 + (o.vary === undefined ? 0.05 : o.vary) * (R() * 2 - 1));
    var g = ctx.createGain(), t0 = ctx.currentTime + (o.delay || 0), v = (o.vol === undefined ? 1 : o.vol) * sp.g;
    g.gain.setValueAtTime(v, t0); var dur = o.dur || b.duration / src.playbackRate.value;
    if (o.dur) g.gain.setTargetAtTime(0, t0 + o.dur * 0.7, o.dur * 0.12); // cut a long sample short with a fade
    src.connect(g); route(g, sp); src.start(t0); src.stop(t0 + dur + 0.05); voices++; src.onended = function () { voices--; };
    return src;
  };

  /* ---------- synth helpers ---------- */
  function env(g, t0, a, peak, d, sus, r, len) { g.gain.cancelScheduledValues(t0); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * sus), t0 + a + d); g.gain.exponentialRampToValueAtTime(0.0001, t0 + len + r); }
  function osc(type, f0, f1, t0, len, peak, att, dest, rel) {
    var o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t0); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + len);
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(peak, t0 + (att || 0.004)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + len + (rel || 0.02));
    o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + len + (rel || 0.02) + 0.03); return o;
  }
  function noise(t0, len, peak, filt, f0, f1, q, dest, att) {
    var s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.playbackRate.value = 0.7 + R() * 0.6; var f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = filt || 'bandpass'; f.Q.value = q || 1; f.frequency.setValueAtTime(f0, t0); if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t0 + len);
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(peak, t0 + (att || 0.008)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t0, R() * 1.2); s.stop(t0 + len + 0.05); return s;
  }
  function bus(o) { var g = ctx.createGain(), sp = spatial(o); g.gain.value = (o && o.vol !== undefined ? o.vol : 1) * sp.g; route(g, sp); return sp.g > 0.02 ? g : null; }

  /* ---------- the sword slash: pure air, no tones. A wide rush of noise that swoops up in pitch as the blade comes through and falls away, a hiss of
     cut air on top, a low breathy "fwoomp" under it, and a tiny snick at the moment of the cut ---------- */
  function sweep(t, len, f0, f1, f2, q, peak, out, rise) { // band-passed noise whose centre frequency swoops f0 -> f1 -> f2
    var s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.playbackRate.value = 1 + R() * 0.25; var bp = ctx.createBiquadFilter(), g = ctx.createGain();
    bp.type = 'bandpass'; bp.Q.value = q; bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + len * 0.38); bp.frequency.exponentialRampToValueAtTime(f2, t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + len * (rise || 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(bp); bp.connect(g); g.connect(out); s.start(t, R()); s.stop(t + len + 0.05);
  }
  A.slash = function (kind, step, big, o) {
    if (!ctx || !unlocked || mute.sfx || !gate('slash', 40)) return; if (ctx.state === 'suspended') ctx.resume();
    var out = bus(o); if (!out) return; var t = ctx.currentTime + 0.002, dagger = kind === 'dagger', heavy = !!big || step === 3, v = 0.9 + R() * 0.2, back = step === 2;
    var len = dagger ? 0.13 : heavy ? 0.3 : 0.21;
    if (dagger) sweep(t, len, 1700 * v, 5200 * v, 2600 * v, 1.0, 0.8, out, 0.28);
    else if (back) sweep(t, len, 3000 * v, 1100 * v, 600 * v, 0.9, heavy ? 1.0 : 0.85, out, 0.22); // the backhand rushes the other way: high to low
    else sweep(t, len, 650 * v, 3300 * v, 1300 * v, 0.9, heavy ? 1.0 : 0.85, out, 0.34);
    sweep(t + 0.01, len * 0.8, 2400 * v, 6400 * v, 3400 * v, 0.6, 0.45, out, 0.3); // a second, airier layer for width
    noise(t + len * 0.3, len * 0.5, 0.38, 'highpass', 5200 * v, 9000 * v, 0.7, out, 0.006); // the hiss of the edge cutting air
    noise(t + len * 0.32, 0.03, 0.5, 'highpass', 3800, 6500, 0.8, out, 0.001); // the snick at the point of the cut
    if (!dagger) noise(t, heavy ? 0.22 : 0.15, heavy ? 0.7 : 0.45, 'lowpass', 800, 200, 0.7, out, 0.025); // the low rush of a heavy blade moving the air
    if (big) { sweep(t + 0.02, len * 1.1, 4000, 9000, 5000, 0.7, 0.35, out, 0.35); noise(t, 0.12, 0.35, 'lowpass', 500, 140, 0.8, out, 0.01); }
  };

  /* ---------- other synthesised effects ---------- */
  var FX = {
    hit: function (o, out, t) { // a meaty impact: thwack + a short crack
      noise(t, 0.09, 0.45, 'lowpass', 1400, 300, 0.8, out, 0.002); osc('sine', 220 * (0.9 + R() * 0.3), 70, t, 0.1, 0.4, 0.002, out, 0.02); noise(t, 0.04, 0.3, 'highpass', 3200, 5200, 0.8, out, 0.001);
    },
    crit: function (o, out, t) { FX.hit(o, out, t); osc('square', 880, 1760, t, 0.12, 0.08, 0.004, out, 0.1); osc('sine', 2600, 4400, t + 0.02, 0.25, 0.1, 0.004, out, 0.15); },
    zap: function (o, out, t) { osc('square', 1400, 320, t, 0.12, 0.12, 0.003, out, 0.02); osc('sawtooth', 700, 160, t, 0.14, 0.08, 0.003, out, 0.02); },
    throw: function (o, out, t) { noise(t, 0.12, 0.3, 'bandpass', 2600, 5200, 2, out, 0.004); osc('triangle', 900, 1500, t, 0.08, 0.06, 0.003, out, 0.02); },
    fireball: function (o, out, t) { noise(t, 0.45, 0.5, 'bandpass', 500, 2200, 0.9, out, 0.02); osc('sawtooth', 160, 640, t, 0.3, 0.14, 0.01, out, 0.1); osc('sine', 90, 220, t, 0.25, 0.2, 0.01, out, 0.1); },
    frost: function (o, out, t) { for (var i = 0; i < 5; i++) osc('sine', 1760 * (1 + i * 0.26), 1760 * (1 + i * 0.26) * 0.99, t + i * 0.035, 0.4, 0.09, 0.004, out, 0.2); noise(t, 0.3, 0.16, 'highpass', 6000, 3000, 0.7, out, 0.01); },
    smoke: function (o, out, t) { noise(t, 0.5, 0.3, 'bandpass', 900, 300, 0.6, out, 0.04); osc('triangle', 220, 90, t, 0.35, 0.1, 0.02, out, 0.1); },
    bash: function (o, out, t) { osc('sine', 130, 48, t, 0.22, 0.5, 0.003, out, 0.05); noise(t, 0.1, 0.5, 'bandpass', 1800, 700, 1.2, out, 0.002); osc('square', 620, 300, t, 0.07, 0.12, 0.002, out, 0.02); },
    whirl: function (o, out, t) { noise(t, 0.7, 0.4, 'bandpass', 700, 2800, 1.4, out, 0.1); noise(t, 0.7, 0.2, 'bandpass', 1400, 600, 1.4, out, 0.2); },
    magic: function (o, out, t) { osc('sine', 1568, 3136, t, 0.18, 0.14, 0.004, out, 0.12); osc('sine', 2093, 4186, t + 0.04, 0.2, 0.1, 0.004, out, 0.12); },
    drain: function (o, out, t) { osc('sawtooth', 520, 130, t, 0.5, 0.1, 0.02, out, 0.1); noise(t, 0.4, 0.15, 'bandpass', 600, 200, 1, out, 0.05); },
    caw: function (o, out, t) { var f = 520 + R() * 160; osc('sawtooth', f, f * 0.55, t, 0.16, 0.16, 0.01, out, 0.03); osc('sawtooth', f * 1.5, f * 0.8, t, 0.16, 0.06, 0.01, out, 0.03); noise(t, 0.14, 0.1, 'bandpass', 1500, 900, 2, out, 0.01); },
    eagle: function (o, out, t) { osc('sawtooth', 2100, 1500, t, 0.5, 0.1, 0.02, out, 0.1); osc('sine', 2600, 1900, t, 0.5, 0.1, 0.02, out, 0.1); noise(t, 0.4, 0.1, 'highpass', 4000, 6000, 1, out, 0.02); },
    coin: function (o, out, t) { osc('square', 1318, 1318, t, 0.05, 0.09, 0.002, out, 0.02); osc('square', 1760, 1760, t + 0.06, 0.12, 0.09, 0.002, out, 0.1); },
    chest: function (o, out, t) { noise(t, 0.35, 0.18, 'bandpass', 380, 700, 6, out, 0.03); osc('triangle', 80, 120, t, 0.2, 0.2, 0.01, out, 0.05); osc('sine', 1046, 1046, t + 0.3, 0.2, 0.1, 0.004, out, 0.3); osc('sine', 1568, 1568, t + 0.38, 0.3, 0.1, 0.004, out, 0.4); },
    wet: function (o, out, t) { noise(t, 0.18, 0.3, 'bandpass', 700, 280, 2.5, out, 0.01); osc('sine', 300, 90, t, 0.12, 0.1, 0.004, out, 0.04); },
    thump: function (o, out, t) { osc('sine', 78, 44, t, 0.2, 0.55, 0.004, out, 0.06); osc('sine', 78, 44, t + 0.2, 0.18, 0.4, 0.004, out, 0.06); }, // a heartbeat
    crunch: function (o, out, t) { noise(t, 0.12, 0.5, 'bandpass', 1500, 500, 1.2, out, 0.002); noise(t + 0.05, 0.1, 0.4, 'bandpass', 900, 350, 1.2, out, 0.002); osc('sine', 110, 50, t, 0.14, 0.3, 0.003, out, 0.04); },
    // three plasma hits (wizard and necromancer shots landing): a crackling snap, a sizzle and a low thud, each a little different
    plasma1: function (o, out, t) {
      osc('sawtooth', 1500, 180, t, 0.12, 0.2, 0.002, out, 0.03); osc('square', 2600, 400, t, 0.07, 0.1, 0.002, out, 0.02); noise(t, 0.16, 0.32, 'bandpass', 3200, 800, 1.4, out, 0.002); osc('sine', 110, 48, t, 0.14, 0.34, 0.003, out, 0.05);
    },
    plasma2: function (o, out, t) {
      osc('sine', 2400, 260, t, 0.2, 0.2, 0.002, out, 0.04); osc('sawtooth', 900, 140, t, 0.16, 0.14, 0.002, out, 0.03); noise(t, 0.12, 0.3, 'highpass', 5000, 8000, 1, out, 0.001); noise(t + 0.03, 0.18, 0.2, 'bandpass', 1800, 500, 2, out, 0.01); osc('sine', 85, 45, t, 0.16, 0.3, 0.003, out, 0.05);
    },
    plasma3: function (o, out, t) {
      osc('sawtooth', 700, 80, t, 0.24, 0.22, 0.003, out, 0.05); noise(t, 0.26, 0.3, 'lowpass', 2600, 300, 1.2, out, 0.002); for (var i = 0; i < 4; i++) noise(t + 0.04 + i * 0.04, 0.02, 0.28, 'bandpass', 2500 + R() * 2500, 2000, 3, out, 0.001);
      osc('sine', 70, 38, t, 0.2, 0.38, 0.004, out, 0.06); osc('triangle', 420, 120, t, 0.12, 0.12, 0.002, out, 0.03);
    },
    raise: function (o, out, t) { // earth rumbling, a cold rising breath, then bones knocking together as they pull themselves up
      noise(t, 0.55, 0.32, 'lowpass', 380, 120, 1.2, out, 0.06); osc('sine', 95, 52, t, 0.5, 0.3, 0.04, out, 0.1);
      noise(t + 0.05, 0.5, 0.14, 'bandpass', 900, 2600, 2, out, 0.25);
      for (var i = 0; i < 6; i++) { var tt = t + 0.18 + i * (0.045 + R() * 0.03); noise(tt, 0.03, 0.34, 'bandpass', 1500 + R() * 1500, 1200, 3, out, 0.001); osc('triangle', 260 + R() * 160, 150, tt, 0.05, 0.08, 0.002, out, 0.03); }
      noise(t + 0.55, 0.12, 0.2, 'bandpass', 2400, 1800, 3, out, 0.002);
    },
    dash: function (o, out, t) { // a rush of air, the scuff of boots and a soft thump of weight shifting
      noise(t, 0.24, 0.34, 'bandpass', 800, 5200, 1.1, out, 0.04); noise(t, 0.1, 0.28, 'lowpass', 600, 160, 0.8, out, 0.006); osc('sine', 150, 55, t, 0.13, 0.3, 0.003, out, 0.04);
      noise(t + 0.1, 0.12, 0.14, 'highpass', 4000, 6500, 0.8, out, 0.01);
    },
    jump: function (o, out, t) { osc('square', 300, 700, t, 0.1, 0.06, 0.003, out, 0.03); },
    peck: function (o, out, t) { osc('square', 1900, 900, t, 0.04, 0.12, 0.001, out, 0.02); osc('square', 1700, 800, t + 0.06, 0.04, 0.1, 0.001, out, 0.02); },
    bell: function (o, out, t) { var f = 523 * (o && o.n ? o.n : 1); osc('sine', f, f, t, 0.9, 0.16, 0.004, out, 0.9); osc('sine', f * 2.76, f * 2.76, t, 0.5, 0.06, 0.004, out, 0.5); },
    crackle: function (o, out, t) { for (var i = 0; i < 4; i++) noise(t + R() * 0.25, 0.03, 0.25, 'highpass', 2500 + R() * 3000, 1200, 1, out, 0.001); },
    click: function (o, out, t) { osc('triangle', 780, 1180, t, 0.035, 0.11, 0.002, out, 0.02); noise(t, 0.012, 0.08, 'highpass', 4000, 6000, 0.8, out, 0.001); },
    drawbridge: function (o, out, t) { // chains run out through their pulleys, the timbers groan, then the bridge slams down onto the far bank
      var i, tt = 0; for (i = 0; i < 26; i++) { tt += 0.03 + R() * 0.05; if (tt > 1.5) break; noise(t + tt, 0.022, 0.3, 'bandpass', 2600 + R() * 1800, 3400, 3, out, 0.001); noise(t + tt + 0.012, 0.03, 0.2, 'bandpass', 900 + R() * 400, 800, 4, out, 0.001); }
      var cr = ctx.createOscillator(), cg = ctx.createGain(), lf = ctx.createOscillator(), lg = ctx.createGain(); cr.type = 'sawtooth'; cr.frequency.setValueAtTime(70, t); cr.frequency.linearRampToValueAtTime(110, t + 1.5); lf.frequency.value = 9; lg.gain.value = 14; lf.connect(lg); lg.connect(cr.frequency);
      var cf = ctx.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 220; cf.Q.value = 4; cg.gain.setValueAtTime(0.0001, t); cg.gain.linearRampToValueAtTime(0.12, t + 0.3); cg.gain.setValueAtTime(0.12, t + 1.35); cg.gain.exponentialRampToValueAtTime(0.0001, t + 1.62); cr.connect(cf); cf.connect(cg); cg.connect(out); cr.start(t); lf.start(t); cr.stop(t + 1.7); lf.stop(t + 1.7);
      osc('sine', 66, 34, t + 1.58, 0.35, 0.8, 0.003, out, 0.1); noise(t + 1.58, 0.3, 0.7, 'lowpass', 900, 160, 0.8, out, 0.002); noise(t + 1.6, 0.18, 0.4, 'bandpass', 1800, 700, 1, out, 0.002);
    }
  };
  A.fx = function (name, o) {
    if (!ctx || !unlocked || mute.sfx || !FX[name] || !gate('fx_' + name, (o && o.gap) || 35)) return; if (ctx.state === 'suspended') ctx.resume();
    var out = bus(o); if (!out) return; FX[name](o || {}, out, ctx.currentTime + 0.002 + ((o && o.delay) || 0));
  };

  // blood: one sound, blood1.mp3, played just after the slash. Criticals keep their own intense slashing sounds, so no blood layer goes over them.
  var bloodFlip = 0;
  function nextBlood() { bloodFlip ^= 1; return bloodFlip ? 'blood1' : 'bloodsplatter3'; } // the two splatter sounds take turns
  A.splatter = function (n, x, y) {
    if (!ctx || !unlocked || mute.sfx || n < 2) return;
    if (CC.CriticalScene && CC.CriticalScene.isActive && CC.CriticalScene.isActive()) return;
    A.play(nextBlood(), { x: x, y: y, vol: 0.55 + Math.min(0.35, n * 0.03), vary: 0.06, delay: 0.07, gap: 140 });
  };
  /* ---------- the charge-up loop (rises with power) and its blast ---------- */
  var charging = null;
  A.chargeStart = function (big, level) {
    if (!ctx || !unlocked || mute.sfx || charging) return; var b = bufs.charge; if (!b) return; // one charge-up sound for every charge in the game
    var s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = b; s.loop = true; s.loopStart = Math.min(0.25, b.duration * 0.3); s.loopEnd = b.duration; g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.linearRampToValueAtTime(0.9 * (level === undefined ? 1 : level), ctx.currentTime + 0.08);
    s.connect(g); g.connect(sfxBus); s.start(); charging = { s: s, g: g, t: Date.now() };
  };
  A.chargeSet = function (p) { if (charging) { charging.t = Date.now(); charging.s.playbackRate.setTargetAtTime(0.85 + 0.7 * clamp(p, 0, 1), ctx.currentTime, 0.05); } };
  A.chargeEnd = function (released) {
    if (charging) { var c = charging; charging = null; c.g.gain.setTargetAtTime(0, ctx.currentTime, 0.04); try { c.s.stop(ctx.currentTime + 0.25); } catch (e) { /* stopped */ } }
    if (released) A.play('charge_blast', { vol: 0.95, vary: 0.03 });
  };

  /* ---------- ambience loops: rain and fire ---------- */
  var amb = {};
  function ambience(id, lvl, filt, f0, f1, gain) {
    if (!ctx || !unlocked) return; var a = amb[id];
    if (!a) { if (lvl <= 0.01) return; var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), hp = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noiseBuf; s.loop = true; f.type = 'lowpass'; f.frequency.value = f1; hp.type = 'highpass'; hp.frequency.value = f0; g.gain.value = 0; s.connect(f); f.connect(hp); hp.connect(g); g.connect(sfxBus); s.start(); a = amb[id] = { g: g }; }
    a.g.gain.setTargetAtTime(mute.sfx ? 0 : lvl * gain, ctx.currentTime, 0.4);
  }

  /* ---------- 8-bit music: pulse, triangle and noise channels on a step sequencer ---------- */
  var SC = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11], mixo: [0, 2, 4, 5, 7, 9, 10], harm: [0, 2, 3, 5, 7, 8, 11], locrian: [0, 1, 3, 5, 6, 8, 10] };
  var waves = {};
  function pulse(d) { if (waves.__c !== ctx) waves = { __c: ctx }; var k = 'p' + d; if (waves[k]) return waves[k]; var n = 32, re = new Float32Array(n), im = new Float32Array(n); for (var i = 1; i < n; i++) { re[i] = 2 / (i * Math.PI) * Math.sin(2 * Math.PI * i * d); im[i] = 2 / (i * Math.PI) * (1 - Math.cos(2 * Math.PI * i * d)); } return (waves[k] = ctx.createPeriodicWave(re, im)); }
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  // a track: tempo, key, scale, chord progression (scale degrees, one bar each, repeating), two rhythm shapes for the melody, and feel flags:
  //   pad (soft held chords), echo (dotted-eighth delay on the melody and arpeggio), harm (a second voice a third below in the second half), contour (sigh = falling
  //   phrases, rise, calm), rest (chance to leave a breath out of the melody)
  var TRACKS = {
    title: { bpm: 112, root: 57, scale: 'minor', prog: [0, 5, 2, 6, 0, 3, 4, 0], rhy: ['syncop', 'walk'], bass: 'drive', drums: 'march', arp: true, arpSpeed: 2, duty: 0.25, vib: 1, echo: 0.2, harm: true, contour: 'rise', rest: 0 },
    town: { bpm: 108, root: 60, scale: 'major', prog: [0, 5, 3, 4, 0, 5, 3, 4], rhy: ['town', 'walk'], bass: 'oompah', drums: 'light', arp: true, duty: 0.125, echo: 0.2, harm: true, contour: 'rise', rest: 0.04 },
    forest: { bpm: 124, root: 52, scale: 'minor', prog: [0, 5, 2, 6, 0, 3, 6, 4], rhy: ['syncop', 'walk'], bass: 'drive', drums: 'march', arp: true, arpSpeed: 2, duty: 0.25, echo: 0.22, harm: true, contour: 'rise', rest: 0.04 },
    tunnel: { bpm: 118, root: 50, scale: 'phrygian', prog: [0, 1, 0, 6, 0, 1, 5, 0], rhy: ['syncop', 'fury'], bass: 'pulse', drums: 'march', arp: true, arpSpeed: 2, duty: 0.25, echo: 0.22, harm: true, contour: 'rise', rest: 0.05 },
    ascent: { bpm: 126, root: 62, scale: 'lydian', prog: [0, 1, 4, 5, 0, 1, 3, 4], rhy: ['syncop', 'walk'], bass: 'walk', drums: 'march', arp: true, arpSpeed: 2, duty: 0.125, echo: 0.2, harm: true, contour: 'rise', rest: 0.04 },
    plains: { bpm: 132, root: 55, scale: 'mixo', prog: [0, 6, 3, 0, 0, 6, 4, 0], rhy: ['walk', 'pickup'], bass: 'walk', drums: 'march', arp: true, arpSpeed: 2, duty: 0.25, echo: 0.2, harm: true, contour: 'rise', rest: 0.04 },
    pass: { bpm: 116, root: 50, scale: 'dorian', prog: [0, 4, 6, 3, 0, 4, 6, 0], rhy: ['syncop', 'fury'], bass: 'drive', drums: 'march', arp: true, arpSpeed: 2, duty: 0.25, vib: 1, echo: 0.22, harm: true, contour: 'rise', rest: 0.04 },
    village: { bpm: 54, root: 52, scale: 'phrygian', prog: [0, 0, 1, 0, 0, 6, 1, 0], rhy: ['sparse', 'sparse'], bass: 'drone', drums: 'rain', arp: false, duty: 0.125, layers: 'storm', pad: true, echo: 0.5, contour: 'sigh', rest: 0.3 },
    pond: { bpm: 60, root: 64, scale: 'lydian', prog: [0, 3, 0, 4, 0, 5, 3, 4], rhy: ['pickup', 'sparse'], bass: 'long', drums: 'none', arp: true, duty: 0.125, layers: 'horror', pad: true, echo: 0.5, contour: 'calm', rest: 0.15 },
    cellar: { bpm: 120, root: 45, scale: 'harm', prog: [0, 0, 5, 4, 0, 3, 4, 0], rhy: ['syncop', 'fury'], bass: 'pulse', drums: 'march', arp: true, arpSpeed: 2, duty: 0.25, echo: 0.2, harm: true, contour: 'rise', rest: 0.05 },
    cave: { bpm: 134, root: 48, scale: 'harm', prog: [0, 5, 6, 4, 0, 3, 5, 4], rhy: ['fury', 'syncop'], bass: 'gallop', drums: 'rock', arp: true, arpSpeed: 2, duty: 0.25, vib: 1, echo: 0.18, harm: true, contour: 'rise', rest: 0 },
    battle: { bpm: 138, root: 50, scale: 'harm', prog: [0, 5, 3, 4, 0, 5, 3, 4], rhy: ['syncop', 'walk'], bass: 'gallop', drums: 'rock', arp: true, arpSpeed: 2, duty: 0.25, echo: 0.15, harm: true, contour: 'rise', rest: 0 },
    boss: { bpm: 150, root: 47, scale: 'harm', prog: [0, 0, 5, 6, 0, 3, 5, 4], rhy: ['fury', 'syncop'], bass: 'gallop', drums: 'rock', arp: true, arpSpeed: 2, duty: 0.125, vib: 1, echo: 0.2, harm: true, contour: 'rise', rest: 0 }
  };
  A.TRACKS = TRACKS;
  function rng32(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  var RH = { // which of the 16 steps in a bar carry a melody note, and how long each lasts (in steps)
    walk: [[0, 4], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]], long: [[0, 6], [6, 2], [8, 4], [12, 4]], syncop: [[0, 3], [3, 3], [6, 2], [8, 3], [11, 3], [14, 2]], sparse: [[0, 8], [8, 6]],
    pickup: [[2, 2], [4, 4], [8, 2], [10, 2], [12, 4]], town: [[0, 4], [4, 4], [8, 4], [12, 2], [14, 2]], fury: [[0, 2], [2, 1], [3, 1], [4, 2], [6, 2], [8, 2], [10, 1], [11, 1], [12, 2], [14, 2]], cad: [[0, 4], [4, 4], [8, 8]]
  };
  var song = null, track = null, nextT = 0, step = 0, timer = null, fade = null, trackGain = null, curId = null, leadBus = null, echoNodes = null;
  // snap a scale degree to the nearest chord tone (root, third or fifth, any octave); pref 0 = root only, 1 = third only
  function nearTone(d, ch, pref) {
    var best = d, bd = 99, o, ti, tones = [0, 2, 4];
    for (o = -2; o <= 2; o++) for (ti = 0; ti < 3; ti++) { if (pref !== undefined && ti !== pref) continue; var c = ch + tones[ti] + o * 7, dd = Math.abs(c - d); if (dd < bd) { bd = dd; best = c; } }
    return best;
  }
  // 16 bars in four phrases: A (the theme), A' (the same with small changes and a different ending), B (a lifted, contrasting phrase) and the theme returning.
  // Strong beats land on chord tones, motion is mostly stepwise, every phrase ends on a long note that settles, and some notes are left out so the line breathes.
  function build(tr, id) {
    var rnd = rng32(id.split('').reduce(function (a, c) { return a * 31 + c.charCodeAt(0); }, 7)), sc = SC[tr.scale], lead = [], harm = [], A0 = {}, dir = tr.contour === 'rise' ? 1 : tr.contour === 'calm' ? 0 : -1;
    var rh = [RH[tr.rhy[0]] || RH.walk, RH[tr.rhy[1]] || RH.long], deg = tr.contour === 'rise' ? 7 : 9, bar;
    function note(d) { var o = Math.floor(d / 7), i = ((d % 7) + 7) % 7; return tr.root + 12 + o * 12 + sc[i]; }
    for (bar = 0; bar < 16; bar++) {
      (function (bar) {
        var ph = Math.floor(bar / 4), b = bar % 4, ch = tr.prog[bar % tr.prog.length], tmpl = b === 3 ? RH.cad : rh[b % 2], line = [], hl = [];
        if (ph === 2 && b === 0) deg += 2; // the contrasting phrase lifts
        tmpl.forEach(function (r, ri) {
          var d, strong = r[0] % 8 === 0 || ri === tmpl.length - 1, key = b * 10 + ri;
          if ((ph === 1 || ph === 3) && A0[key] !== undefined) d = A0[key] + (ph === 1 && rnd() < 0.3 ? 1 : 0);
          else { var mv = [-1, -1, -2, 1, 1, 2, 0][Math.floor(rnd() * 7)] + (dir > 0 && rnd() < 0.35 ? 1 : 0) + (dir < 0 && rnd() < 0.35 ? -1 : 0); d = deg + mv; }
          if (strong || ri === 0) d = nearTone(d, ch);
          if (b === 3 && ri === tmpl.length - 1) d = nearTone(d, ch, ph % 2 ? 0 : 1); // a phrase ends settled: on the third (still asking) or the root (answered)
          d = clamp(d, ch - 2, ch + 9); d = clamp(d, 2, 14);
          if (ph === 0) A0[key] = d;
          deg = d;
          if (!(!strong && rnd() < (tr.rest || 0))) { line.push({ s: r[0], l: r[1], m: note(d) }); hl.push({ s: r[0], l: r[1], m: note(d - 2) }); }
        });
        lead.push(line); harm.push(hl);
      })(bar);
    }
    return { lead: lead, harm: harm, bars: 16 };
  }
  function chordNotes(tr, bar) { var sc = SC[tr.scale], ch = tr.prog[bar % tr.prog.length]; function n(d) { var o = Math.floor(d / 7), i = ((d % 7) + 7) % 7; return tr.root + o * 12 + sc[i]; } return { r: n(ch), t: n(ch + 2), f: n(ch + 4), o: n(ch + 7) }; }
  // o: { att, sus } shape the note; the vibrato fades in after the note has started, like a held voice
  function chip(wave, m, t, len, peak, dest, vib, detune, o) {
    var os = ctx.createOscillator(), g = ctx.createGain(), att = (o && o.att) || 0.006, sus = (o && o.sus) || 0.55; if (wave === 'tri') os.type = 'triangle'; else os.setPeriodicWave(pulse(wave));
    os.frequency.setValueAtTime(hz(m), t); if (detune) os.detune.value = detune;
    if (vib) { var l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5.2; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(7, t + Math.min(0.4, len * 0.7)); l.connect(lg); lg.connect(os.detune); l.start(t); l.stop(t + len + 0.05); }
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + att); g.gain.setTargetAtTime(peak * sus, t + att + 0.03, 0.12); g.gain.setTargetAtTime(0.0001, t + len * 0.92, 0.04);
    os.connect(g); g.connect(dest); os.start(t); os.stop(t + len + 0.15);
  }
  function padNote(m, t, len, peak, dest) { // a soft held chord tone: slow swell, slow fade
    var os = ctx.createOscillator(), g = ctx.createGain(); os.type = 'triangle'; os.frequency.setValueAtTime(hz(m), t); os.detune.value = (R() - 0.5) * 8;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + len * 0.35); g.gain.setTargetAtTime(0.0001, t + len * 0.8, len * 0.1);
    os.connect(g); g.connect(dest); os.start(t); os.stop(t + len * 1.2);
  }
  function drum(kind, t, dest) {
    var v = kind === kind.toUpperCase() ? 0.5 : 1; kind = kind.toLowerCase(); // capitals are the soft versions
    if (kind === 'k') { osc('sine', 150, 42, t, 0.14, 0.7 * v, 0.002, dest, 0.03); noise(t, 0.03, 0.2 * v, 'lowpass', 900, 300, 0.7, dest, 0.001); }
    else if (kind === 's') { noise(t, 0.12, 0.38 * v, 'bandpass', 2200, 1600, 0.9, dest, 0.002); osc('triangle', 230, 140, t, 0.07, 0.2 * v, 0.002, dest, 0.02); }
    else if (kind === 'h') noise(t, 0.035, 0.16 * v, 'highpass', 7000, 9000, 0.8, dest, 0.001);
    else if (kind === 't') { osc('sine', 98, 60, t, 0.35, 0.6 * v, 0.004, dest, 0.15); noise(t, 0.12, 0.25 * v, 'lowpass', 500, 200, 0.7, dest, 0.004); }
    else if (kind === 'r') noise(t, 0.09, 0.07 * v, 'highpass', 5000, 7000, 0.6, dest, 0.01);
  }
  var DR = { // 16-step patterns
    light: 'k...h...s...h...', soft: 'K...H...K...H.H.', march: 'k.h.s.h.k.h.s.hh', rock: 'k.hhs.hhk.hhs.kh', heart: 'k.......k..k....', timp: 't.......t..t....', rain: 'r.r.r.r.r.r.r.rr', none: '................'
  };
  function schedule(tr, st, t) {
    var bar = Math.floor(st / 16) % song.bars, sp = st % 16, ch = chordNotes(tr, bar), stepLen = 60 / tr.bpm / 4, mus = musBus2, lb = leadBus || mus, layers = layerState(tr);
    var bass = tr.bass, bm = null;
    if (bass === 'oompah') { if (sp === 0 || sp === 8) bm = ch.r - 12; else if (sp === 4 || sp === 12) bm = ch.f - 12; }
    else if (bass === 'long') { if (sp === 0) bm = ch.r - 12; }
    else if (bass === 'walk') { if (sp % 4 === 0) bm = [ch.r, ch.t, ch.f, ch.t][sp / 4] - 12; }
    else if (bass === 'drive') { if (sp % 2 === 0) bm = ch.r - 12 + (sp === 6 || sp === 14 ? 7 : 0); }
    else if (bass === 'gallop') { if (sp % 4 === 0 || sp % 4 === 2 || sp % 4 === 3) bm = ch.r - 12; }
    else if (bass === 'pulse') { if (sp % 2 === 0) bm = ch.r - 12 + (sp % 8 === 6 ? 1 : 0); }
    else if (bass === 'drone') { if (sp === 0) { chip('tri', ch.r - 12, t, stepLen * 15, 0.38, mus); chip('tri', ch.r - 5 + (bar % 2 ? 1 : 0), t, stepLen * 15, 0.14, mus); } }
    if (bm !== null && layers.bass) chip('tri', bm, t, stepLen * (bass === 'long' ? 14 : bass === 'drive' ? 1.6 : bass === 'oompah' ? 3 : 1.7), 0.4, mus);
    if (tr.pad && sp === 0 && layers.bass) { var pl = stepLen * 16; padNote(ch.r, t, pl, 0.075, mus); padNote(ch.t, t, pl, 0.06, mus); padNote(ch.f, t, pl, 0.06, mus); } // the warmth under everything
    // arpeggio on the second pulse channel, into the echo
    if (tr.arp && layers.arp) { var asp = tr.arpSpeed === 2 ? 1 : 2; if (sp % asp === 0) { var seq = [ch.r, ch.t, ch.f, ch.o, ch.f, ch.t]; var an = seq[(sp / asp) % seq.length] + 12; chip(0.125, an, t, stepLen * asp * 0.8, 0.06, lb, false, horrorDetune(), { sus: 0.4 }); } }
    // the lead, and from the second half a second voice a third below
    if (layers.lead) {
      song.lead[bar].forEach(function (n) { if (n.s === sp) chip(tr.duty, n.m, t, stepLen * n.l * 0.95, tr.id === 'village' ? 0.12 : 0.14, lb, tr.vib, horrorDetune() + (R() - 0.5) * 3, { att: 0.012, sus: 0.62 }); });
      if (tr.harm && bar >= 8) song.harm[bar].forEach(function (n) { if (n.s === sp) chip(0.5, n.m, t, stepLen * n.l * 0.95, 0.06, lb, false, 4, { att: 0.02, sus: 0.6 }); });
    }
    // percussion
    var dk = DR[tr.drums] && layers.drums ? DR[tr.drums].charAt(sp) : '.'; if (dk !== '.') drum(dk, t, mus);
    if (tr.id === 'village' && sp === 8 && layers.bell && R() < 0.5) { var bn = ch.o + 12 + [0, 1, 3, 6][Math.floor(R() * 4)]; chip(0.5, bn, t, stepLen * 6, 0.05, lb); } // a bell that shouldn't be ringing
  }
  var musBus2 = null;
  function horrorDetune() { var s = CC.state, pd = s && s.map && s.map.pond; return track && track.id === 'pond' && pd ? pd.h * 55 : 0; } // the music box drifts out of tune as the horror grows
  function layerState(tr) { // how much of the song plays: the storm and the horror strip it down or build it up
    var s = CC.state, L = { lead: true, arp: true, bass: true, drums: true, bell: true };
    if (tr.layers === 'storm') { var u = s && s.map && s.map.vil ? s.map.vil.u : 0; L.lead = u > 0.12; L.arp = false; L.drums = u > 0.3; L.bell = u > 0.2; }
    if (tr.layers === 'horror') { var pd = s && s.map && s.map.pond, h = pd ? pd.h : 0; L.drums = false; L.bass = h > 0.15; L.arp = h < 0.9 || Math.random() < 0.5; }
    return L;
  }
  function tick() {
    if (!ctx || !track || ctx.state !== 'running') return;
    var stepLen = 60 / track.bpm / 4;
    while (nextT < ctx.currentTime + 0.14) { if (nextT >= ctx.currentTime - 0.05) schedule(track, step, nextT); nextT += stepLen; step++; if (step >= song.bars * 16) step = 0; }
  }
  function synthMusic(id) {
    stopFile(); var tr = TRACKS[id]; if (!tr) return; tr.id = id; curId = id;
    var old = trackGain; if (old) { old.gain.setTargetAtTime(0, ctx.currentTime, 0.25); setTimeout(function () { try { old.disconnect(); } catch (e) { /* gone */ } }, 1800); }
    var oldE = echoNodes; if (oldE) setTimeout(function () { try { oldE.forEach(function (n) { n.disconnect(); }); } catch (e) { /* gone */ } }, 3500);
    trackGain = ctx.createGain(); trackGain.gain.setValueAtTime(0.0001, ctx.currentTime); trackGain.gain.setTargetAtTime(1, ctx.currentTime + 0.3, 0.35); trackGain.connect(musBus); musBus2 = trackGain;
    leadBus = ctx.createGain(); leadBus.connect(trackGain); echoNodes = [leadBus]; // the melody and arpeggio go through a dotted-eighth echo
    if (ctx.createDelay && tr.echo) {
      var dl = ctx.createDelay(2), fb = ctx.createGain(), lp = ctx.createBiquadFilter(), wet = ctx.createGain(); dl.delayTime.value = 60 / tr.bpm * 0.75; fb.gain.value = Math.min(0.6, tr.echo); lp.type = 'lowpass'; lp.frequency.value = 2200; wet.gain.value = 0.55;
      leadBus.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(wet); wet.connect(trackGain); echoNodes = [leadBus, dl, fb, lp, wet];
    }
    track = tr; song = build(tr, id); step = 0; nextT = ctx.currentTime + 0.35; if (!timer) timer = setInterval(tick, 40);
  }

  /* ---------- recorded music: assets/music/<name>.mp3 plays instead of the generated track for these areas (looped, crossfaded) ---------- */
  // a name plays on a loop; a list plays through in turn (each song fades out as it finishes and the next fades in)
  var MUS_FILES = { title: 'theme', town: 'foresttown', forest: 'forest', plains: 'plains', cave: 'cave', tunnel: 'insidetree', ascent: 'insidetree', village: ['ghosttown', 'ghosttown2'], boss: 'bossbattle', cinderwake: 'cave' };
  var FILE_GAIN = 2.4; // the recorded songs are louder than the generated ones, so they are trimmed to sit at the same level
  var musBufs = {}, musWait = {}, fileSrc = null, fileGain = null, fileKey = null, fileList = null, fileTimers = [], fileFading = false;
  function loadMusic(name, cb) {
    if (musBufs[name] !== undefined) return cb(musBufs[name]);
    if (musWait[name]) { musWait[name].push(cb); return; } musWait[name] = [cb];
    fetch('assets/music/' + name + '.mp3').then(function (r) { if (!r.ok) throw new Error('missing'); return r.arrayBuffer(); })
      .then(function (ab) { return new Promise(function (res, rej) { ctx.decodeAudioData(ab, res, rej); }); })
      .then(function (b) { musBufs[name] = b; }).catch(function () { musBufs[name] = false; })
      .then(function () { var l = musWait[name]; delete musWait[name]; l.forEach(function (f) { f(musBufs[name]); }); });
  }
  function fadeOutFile(g, sr, secs) { g.gain.setTargetAtTime(0, ctx.currentTime, secs / 4); setTimeout(function () { try { sr.stop(); g.disconnect(); } catch (e) { /* gone */ } }, secs * 1000 + 600); }
  function stopFile() {
    fileTimers.forEach(clearTimeout); fileTimers = [];
    if (fileGain) fadeOutFile(fileGain, fileSrc, 1.8);
    fileGain = fileSrc = null; fileKey = null; fileList = null; fileFading = false;
  }
  function dropSynth() {
    if (trackGain) { var og = trackGain; og.gain.setTargetAtTime(0, ctx.currentTime, 0.25); setTimeout(function () { try { og.disconnect(); } catch (e) { /* gone */ } }, 1800); trackGain = null; }
    var oe = echoNodes; if (oe) setTimeout(function () { try { oe.forEach(function (n) { n.disconnect(); }); } catch (e) { /* gone */ } }, 3500); echoNodes = null; leadBus = null; track = null;
  }
  // how loud a recorded song plays right now: normally the full level, but the ghost town starts almost silent and swells as you walk in (never past the full level)
  function fileTarget() {
    if (!fileKey || fileKey.indexOf('ghosttown') !== 0) return FILE_GAIN;
    var s = CC.state, vu = s && s.area === 'village' && s.map && s.map.vil ? s.map.vil.u : 0;
    return FILE_GAIN * (0.06 + 0.94 * Math.min(1, Math.max(0, vu)));
  }
  function playFile(list, idx, id, lk) {
    var name = list[idx];
    loadMusic(name, function (b) {
      if (curId !== id || fileList !== lk) return; if (!b) { curId = null; fileList = null; return; } // no file: the next frame falls back to the generated track
      var sr = ctx.createBufferSource(), g = ctx.createGain(), many = list.length > 1; sr.buffer = b; sr.loop = !many; fileKey = name; fileFading = false;
      g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.setTargetAtTime(fileTarget(), ctx.currentTime + 0.1, 0.7); sr.connect(g); g.connect(musBus); sr.start(); fileSrc = sr; fileGain = g;
      if (many) { // fade this one out over its last 4 seconds, then the next fades in
        fileTimers.push(setTimeout(function () { if (fileSrc === sr) { fileFading = true; g.gain.setTargetAtTime(0, ctx.currentTime, 1); } }, Math.max(0, b.duration - 4) * 1000));
        fileTimers.push(setTimeout(function () { if (fileSrc !== sr) return; fadeOutFile(g, sr, 0.5); fileGain = fileSrc = null; playFile(list, (idx + 1) % list.length, id, lk); }, b.duration * 1000));
      }
    });
  }
  A.music = function (id) {
    if (!ctx || !unlocked || id === curId) return;
    var f = MUS_FILES[id], list = f ? (Array.isArray(f) ? f : [f]) : null, lk = list && list.join('|');
    if (list && musBufs[list[0]] !== false) {
      curId = id; if (fileList === lk && (fileSrc || fileTimers.length)) return; // the same music carries on (up the tree and through the tunnel)
      dropSynth(); stopFile(); fileList = lk; playFile(list, 0, id, lk);
      return;
    }
    synthMusic(id);
  };
  A.stopMusic = function () { stopFile(); if (trackGain) trackGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2); track = null; curId = null; };
  A.musicState = function () { return { id: curId, bpm: track && track.bpm }; };

  // pick the track from where you are and what is happening
  var hiddenAt = 0;
  A.update = function (dt) {
    if (!ctx || !unlocked) return; var s = CC.state; if (!s) return;
    if (CC.MonsterSound) CC.MonsterSound.update(dt); // monster voices, ambience, the hero's grunt
    if (charging && Date.now() - charging.t > 450) A.chargeEnd(false); // a charge that was cancelled without telling us
    var area = s.area, mode = s.mode, E = CC.Enemies, id, want = (CC.UI && CC.UI.isOpen && CC.UI.isOpen()) ? 0.45 : 1; if (Math.abs(want - duck) > 0.01) { duck += (want - duck) * Math.min(1, dt * 4); applyVol(); }
    if (mode === 'title') id = 'title'; else if (mode === 'town') id = 'town';
    else if (area === 'forest') id = 'forest'; else if (area === 'tree-tunnel') id = 'tunnel'; else if (area === 'tree-ascent') id = 'ascent';
    else if (area === 'plains') { var pd = s.map && s.map.pond; id = (curId === 'pond' ? pd && pd.h > 0.02 : pd && pd.h > 0.08) ? 'pond' : 'plains'; }
    else if (area === 'rocky-pass') id = 'pass'; else if (area === 'village') id = 'village'; else if (area === 'village-cellar') id = 'cellar'; else if (area === 'cinderwake' || area === 'emberdeep') id = 'cinderwake';
    else if (area === 'defense') id = 'battle'; else if (area === 'testroom') id = null; else id = 'cave';
    if (E && E.bossBar && mode === 'dungeon') id = 'boss';
    if (mode === 'dead') id = null;
    if (id) A.music(id); else if (curId) A.stopMusic();
    if (fileGain && !fileFading) fileGain.gain.setTargetAtTime(fileTarget(), ctx.currentTime, 0.8); // the ghost town swells as you walk in
    // ambience: rain in the storm, the crackle of burning trees
    var vu = area === 'village' && s.map && s.map.vil ? s.map.vil.u : 0; ambience('rain', Math.pow(vu, 1.6), 'x', 700, 4200, 0.2);
    var pdd = area === 'plains' && s.map && s.map.pond; ambience('fire', pdd ? pdd.fire : 0, 'x', 500, 5000, 0.12); if (pdd && pdd.fire > 0.3 && R() < dt * 3 * pdd.fire) A.fx('crackle', { vol: 0.5, gap: 60 });
    if (pdd && pdd.h > 0.3 && R() < dt * 0.6 * pdd.h) A.play(R() < 0.5 ? 'waterdrop1' : 'waterdrop2', { vol: 0.35, rate: 0.7 + R() * 0.4 });
    if (pdd && pdd.ghosts && pdd.ghosts.length && R() < dt * 0.08) A.play(R() < 0.5 ? 'ghost_moan' : 'ghost_call_2', { vol: 0.3, rate: 0.85 });
    var vm = area === 'village' && s.map && s.map.vil; if (vm && vm.wisps && vm.wisps.length && R() < dt * 0.1) A.play(R() < 0.5 ? 'ghost_moan' : 'ghost_call_2', { vol: 0.28, rate: 0.9 });
    if (area === 'village-cellar' && R() < dt * 0.25) A.play(R() < 0.5 ? 'waterdrop1' : 'waterdrop2', { vol: 0.25, rate: 0.9 + R() * 0.3 });
  };

  /* ---------- the vocabulary the game uses (one place to tune the whole mix) ---------- */
  A.event = function (name, d) {
    d = d || {}; var o = { x: d.x, y: d.y };
    switch (name) {
      case 'hit':
        if (d.plasma) A.fx('plasma' + (1 + Math.floor(R() * 3)), { x: d.x, y: d.y, vol: 0.85, gap: 45 }); // wizard and necromancer shots land with plasma
        else if (!d.skip) A.fx(d.crit ? 'crit' : 'hit', { x: d.x, y: d.y, vol: d.crit ? 0.9 : 0.7, gap: 55 });
        if (!d.crit && !d.plasma && R() < 0.5) A.play(R() < 0.5 ? 'splash_hit_1' : 'splash_hit_2', { x: d.x, y: d.y, vol: 0.35, gap: 90 }); // the original Chalkboard Dungeon hit splash, back again
        if (d.slash && !d.crit) A.play(nextBlood(), { x: d.x, y: d.y, vol: 0.8, vary: 0.05, delay: 0.07, gap: 140 }); // the blade, then the blood
        break;
      case 'hurt': break; // no voice-over when you are hit
      case 'drawbridge': A.fx('drawbridge', { vol: 1 }); A.play('door_slam', { vol: 0.45, delay: 1.6, dur: 0.9 }); break;
      case 'levelup': A.play('levelup', { vol: 1, gap: 0, vary: 0 }); A.play('levelupvoice', { vol: 1, gap: 0, vary: 0, delay: 1.55 }); break;
      case 'newquest': A.play('newquest', { vol: 1, gap: 0, vary: 0 }); break;
      case 'pickup': A.play('item_pickup_gen', { vol: 0.8, x: d.x, y: d.y }); break;
      case 'gold': A.fx('coin', { x: d.x, y: d.y, vol: 0.6, gap: 70 }); break;
      case 'rare': A.play('special_item', { vol: 0.9 }); break;
      case 'legendary': A.play('legendary', { vol: 1, gap: 0, vary: 0 }); break; // picking up a legendary item
      case 'powerup': A.play('powerup', { vol: 0.9, gap: 0, vary: 0 }); break; // picking up a power-up
      case 'chest': A.fx('chest', { x: d.x, y: d.y, vol: 0.8 }); break;
      case 'explosion': A.play('explosion', { x: d.x, y: d.y, vol: d.big ? 1 : 0.8, dur: d.big ? 2.2 : 1.1, rate: d.big ? 0.85 : 1.05 }); break;
      case 'splash': A.play('splash_explosion', { x: d.x, y: d.y, vol: 0.8 }); break;
      case 'thunder': A.play('thunder_clap', { vol: d.vol || 0.9, rate: 0.85 + R() * 0.2 }); break;
      case 'door': A.play('door_open', { vol: 0.8 }); break;
      case 'doorclose': A.play('door_close', { vol: 0.7, dur: 1.2 }); break;
      case 'portal': A.play('fountain_entrance', { vol: 0.7, dur: 1.6 }); break;
      case 'summon': A.fx('raise', { vol: 0.9, x: d.x, y: d.y, gap: 90 }); break; // a skeleton clawing up out of the ground
      case 'bat': A.play('bat_squeak', { x: d.x, y: d.y, vol: 0.7, rate: d.rate || 1, gap: 250 }); break;
      case 'batattack': A.play('bat_attack', { x: d.x, y: d.y, vol: 0.8, gap: 200 }); break;
      case 'skelatk': A.play(R() < 0.5 ? 'skeleton_attack' : 'skeleton_bone_sound', { x: d.x, y: d.y, vol: 0.6, gap: 220 }); break;
      case 'ghost': A.play(R() < 0.5 ? 'ghost_moan' : 'ghost_call_2', { x: d.x, y: d.y, vol: 0.6, gap: 800 }); break;
      case 'bossShot': A.play('boss_shot', { x: d.x, y: d.y, vol: 0.7, gap: 120 }); break;
      case 'flame': A.play('jet_stream_fire', { x: d.x, y: d.y, vol: 0.6, gap: 200 }); break;
      case 'laugh': A.play('evil_laugh', { vol: 0.9 }); break;
      case 'bossdie': A.play('boss_death_scream', { vol: 1 }); break;
      case 'die': { var t = d.type || '', f = /skeleton|archer/.test(t) ? 'skeleton_death' : /ghost|horror|merehorror|wraith/.test(t) ? 'ghost_death' : /slime|blob|mawworm/.test(t) ? 'blob_death' : /scorpion|spider|snake/.test(t) ? 'radioactive_death' : 'enemydie'; A.play(f, { x: d.x, y: d.y, vol: 0.75, gap: 70, rate: d.big ? 0.7 : 1 }); break; }
    }
  };

  /* ---------- wrappers: the shared events that need no edits elsewhere ---------- */
  function wrapAll() {
    var E = CC.Enemies, V = CC.Vfx;
    if (E && E._kill && !E._audioKill) { E._audioKill = 1; var ok = E._kill; E._kill = function (e) { var was = e && !e.dead, r = ok.apply(this, arguments); if (was && e) { var big = e.boss || e.miniBoss || e.type === 'merehorror' || e.type === 'grinmask' || e.type === 'screegolem'; A.event(big ? 'bossdie' : 'die', { type: e.type, x: e.x, y: e.y, big: e.r > 14 }); } return r; }; }
    if (E && E._think && !E._audioThink) { // bats squeak, skeletons rattle, ghosts moan, bosses shoot
      E._audioThink = 1; var ot = E._think; E._think = function (e, dt, p, d) {
        var before = e.state, r = ot.apply(this, arguments);
        if (d < 360 && e.state === 'telegraph' && before !== 'telegraph') { var t = e.type; if (t === 'bat' || t === 'raven' || t === 'cragharpy' || t === 'crow') A.event(t === 'crow' ? 'bat' : 'batattack', { x: e.x, y: e.y }); else if (t === 'skeleton' || t === 'archer') A.event('skelatk', { x: e.x, y: e.y }); else if (t === 'ghost') A.event('ghost', { x: e.x, y: e.y }); else if (t === 'cragharpy') A.fx('eagle', { x: e.x, y: e.y, vol: 0.4 }); }
        if (d < 300 && (e.type === 'bat' || e.type === 'raven') && Math.random() < dt * 0.25) A.event('bat', { x: e.x, y: e.y, rate: 0.9 + Math.random() * 0.4 });
        if (d < 280 && e.type === 'slime' && Math.random() < dt * 0.15) A.play('blob_hop1', { x: e.x, y: e.y, vol: 0.4, gap: 300 });
        return r;
      };
    }
    if (V && V.spawn && !V._audioSpawn) { // spell explosions and effects
      V._audioSpawn = 1; var os = V.spawn; V.spawn = function (kind, x, y) {
        var r = os.apply(this, arguments);
        if (kind === 'fireBoom') A.event('explosion', { x: x, y: y }); else if (kind === 'meteorBoom') A.event('explosion', { x: x, y: y, big: true }); else if (kind === 'frostNova') A.fx('frost', { x: x, y: y, vol: 0.8 });
        else if (kind === 'boneNova' || kind === 'plagueNova' || kind === 'venom') A.event('splash', { x: x, y: y }); else if (kind === 'smokeBomb') A.fx('smoke', { x: x, y: y, vol: 0.8 });
        else if (kind === 'bash') A.fx('bash', { x: x, y: y }); else if (kind === 'whirl') A.fx('whirl', { x: x, y: y, vol: 0.8 }); else if (kind === 'raise') A.event('summon', { x: x, y: y });
        else if (kind === 'earthSpikes') A.event('splash', { x: x, y: y }); else if (kind === 'chain' || kind === 'soulSpear') A.fx('zap', { x: x, y: y });
        return r;
      };
    }
  }
  /* offline rendering (tests and previews): run a sound or a stretch of a track into a buffer without touching the speakers */
  A.render = function (what, secs, arg) {
    var OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext; if (!OAC) return Promise.reject(new Error('no offline audio'));
    var sv = { ctx: ctx, master: master, sfxBus: sfxBus, musBus: musBus, noiseBuf: noiseBuf, musBus2: musBus2, leadBus: leadBus, track: track, song: song, step: step, nextT: nextT, unlocked: unlocked, voices: voices, lastPlay: lastPlay, mm: mute.music, ms: mute.sfx };
    var sr = 44100; ctx = new OAC(1, Math.ceil(sr * secs), sr); master = ctx.createGain(); sfxBus = ctx.createGain(); musBus = ctx.createGain(); sfxBus.connect(master); musBus.connect(master); master.connect(ctx.destination);
    musBus.gain.value = 0.25; sfxBus.gain.value = 0.8; unlocked = true; mute.music = mute.sfx = false; lastPlay = {}; voices = 0;
    noiseBuf = ctx.createBuffer(1, sr * 2, sr); var d = noiseBuf.getChannelData(0), b0 = 0, b1 = 0, b2 = 0; for (var i = 0; i < d.length; i++) { var w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
    var done;
    try {
      if (what === 'slash') A.slash(arg && arg.kind || 'sword', arg && arg.step || 1, !!(arg && arg.big));
      else if (what === 'fx') A.fx(arg, {});
      else if (what === 'music') { var tr = TRACKS[arg]; tr.id = arg; track = tr; song = build(tr, arg); musBus2 = musBus; leadBus = null; var stepLen = 60 / tr.bpm / 4, t = 0.05, st = 0; while (t < secs) { schedule(tr, st, t); t += stepLen; st++; if (st >= song.bars * 16) st = 0; } }
    } finally { done = ctx.startRendering(); ctx = sv.ctx; master = sv.master; sfxBus = sv.sfxBus; musBus = sv.musBus; noiseBuf = sv.noiseBuf; musBus2 = sv.musBus2; leadBus = sv.leadBus; track = sv.track; song = sv.song; step = sv.step; nextT = sv.nextT; unlocked = sv.unlocked; voices = sv.voices; lastPlay = sv.lastPlay; mute.music = sv.mm; mute.sfx = sv.ms; }
    return done;
  };
  A.has = function (n) { return !!bufs[n]; };
  A.dur = function (n) { return bufs[n] ? bufs[n].duration : 0; };
  A.kit = { ctx: function () { return ctx; }, osc: osc, noise: noise, R: R };
  A.defineFx = function (n, f) { FX[n] = f; };
  setTimeout(wrapAll, 0);
})(window);
