/* CC.MonsterSound - synthesised voices for every monster, and the hero's "UGH!" when he is hit.
 *
 * Each monster belongs to a voice FAMILY (bear, wolf, bat, bone, ghost ...) and every family has the same set of sounds:
 *   amb   atmosphere: played now and then while the monster is on screen or just off it (bears grunt)
 *   atk   its attack (melee swing, bite, claw, strike)
 *   cast  its spell or ranged attack (arrow, spit, wail, fire breath, spore pop ...)
 *   roar  a big roar (the bear's roar attack; other families fall back to cast)
 *   die   its death
 * A sound is a short list of layers: v = a throaty voice (saw -> formant filter, with roughness and vibrato), n = filtered noise, o = oscillator
 * sweep, c = a run of clicks. Pitch scales with the monster's size, with a little difference between individuals.
 *
 * update(dt) is called by audio.js each frame. It watches every monster's state (telegraph / act), plays ambience, and notices when the hero loses health
 * (nearest monster gets the attack sound if it had not made one, and the hero grunts). _kill and _shoot are wrapped once for deaths and spells.
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, MS = CC.MonsterSound = {}, A = CC.Audio;
  if (!A || !A.kit) return;
  var K = A.kit, R = K.R;
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ---------- layers ---------- */
  function voice(out, t, P, k) {
    var c = K.ctx(), f = P.f, len = P.len, o = c.createOscillator(), g = c.createGain(), flt = c.createBiquadFilter(), n = f.length;
    var f0 = f[0] * k, f1 = f[n - 1] * k; o.type = P.type || 'sawtooth'; o.frequency.setValueAtTime(f0, t);
    if (n > 2) o.frequency.exponentialRampToValueAtTime(f[1] * k, t + len * 0.4);
    o.frequency.exponentialRampToValueAtTime(f1, t + len);
    flt.type = 'lowpass'; flt.frequency.value = (P.ff || 800) * Math.min(1.5, k); flt.Q.value = P.q || 2.5;
    var pk = P.pk, att = P.att || 0.03; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(pk, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    if (P.r) { var lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = P.rt || 30; lg.gain.value = pk * P.r * 0.6; lfo.connect(lg); lg.connect(g.gain); lfo.start(t); lfo.stop(t + len + 0.05); }
    if (P.vib) { var v = c.createOscillator(), vg = c.createGain(); v.frequency.value = 5 + R() * 1.5; vg.gain.value = f0 * P.vib; v.connect(vg); vg.connect(o.frequency); v.start(t); v.stop(t + len + 0.05); }
    o.connect(flt); flt.connect(g); g.connect(out); o.start(t); o.stop(t + len + 0.05);
    if (P.nz) K.noise(t, len, pk * P.nz, 'bandpass', (P.ff || 800) * 0.9, (P.ff || 800) * 0.5, 1.2, out, 0.05); // breath
  }
  function layer(L, out, t, k) {
    var P = L[1], rep = P.rep || 1, gp = P.gap || 0.1, i, tt, kk, f = P.f || [1000, 1000], f0, f1;
    for (i = 0; i < rep; i++) {
      tt = t + (P.d || 0) + i * gp; kk = k * (1 - 0.035 * i) * (0.96 + R() * 0.08); f0 = f[0]; f1 = f[f.length - 1];
      if (L[0] === 'v') voice(out, tt, P, kk);
      else if (L[0] === 'n') K.noise(tt, P.len, P.pk * 1.6, P.ft || 'bandpass', f0, f1, P.q || 1, out, P.att || 0.008);
      else if (L[0] === 'o') K.osc(P.type || 'sine', f0 * kk, f1 * kk, tt, P.len, P.pk, P.att || 0.004, out, P.rel || 0.03);
      else if (L[0] === 'c') { var j; for (j = 0; j < (P.n || 3); j++) K.noise(tt + j * (P.cg || 0.05) * (0.8 + R() * 0.4), 0.025, P.pk * 5, 'bandpass', f0 * (0.8 + R() * 0.5), f1, P.q || 3, out, 0.001); }
    }
  }

  /* ---------- the families ---------- */
  function V(f, len, pk, ff, r, rt, nz, x) { var P = { f: f, len: len, pk: pk, ff: ff, r: r, rt: rt, nz: nz }; if (x) for (var q in x) P[q] = x[q]; return ['v', P]; }
  function N(f, len, pk, ft, q, x) { var P = { f: f, len: len, pk: pk, ft: ft, q: q }; if (x) for (var z in x) P[z] = x[z]; return ['n', P]; }
  function O(f, len, pk, type, x) { var P = { f: f, len: len, pk: pk, type: type }; if (x) for (var z in x) P[z] = x[z]; return ['o', P]; }
  function C(f, n, cg, pk, x) { var P = { f: f, n: n, cg: cg, pk: pk }; if (x) for (var z in x) P[z] = x[z]; return ['c', P]; }
  var BEARROAR = [V([120, 230, 100], 1.5, 0.6, 650, 0.9, 26, 0.35), N([900, 300], 1.5, 0.2, 'lowpass', 0.8)];
  var HOWL = [V([380, 560, 420], 1.6, 0.3, 900, 0.05, 5, 0, { vib: 0.015, type: 'triangle' })];
  var SQUISH = [N([900, 200], 0.2, 0.4, 'lowpass', 3), O([260, 90], 0.18, 0.3)];
  var SPIT = [O([500, 120], 0.25, 0.35), N([900, 400], 0.15, 0.2, 'bandpass', 1)];
  var LAUGH = function (n, f) { return V([f, f * 0.85], 0.12, 0.25, 1100, 0.2, 8, 0, { rep: n, gap: 0.17, type: 'square' }); };
  var FAM = {
    bear: { amb: [V([95, 70], 0.45, 0.5, 400, 0.7, 34, 0.12)], atk: [N([1800, 900], 0.08, 0.3, 'bandpass', 2), V([150, 90], 0.35, 0.55, 600, 0.8, 40, 0.3)], cast: BEARROAR, roar: BEARROAR, die: [V([170, 60], 1.1, 0.55, 500, 0.8, 22, 0.2)] },
    wolf: { amb: [V([120, 90], 0.7, 0.35, 500, 0.8, 40, 0.3)], atk: [V([260, 160], 0.22, 0.55, 900, 0.6, 55, 0.3), N([2500, 1200], 0.06, 0.25, 'bandpass', 2)], cast: HOWL, roar: HOWL, die: [V([700, 300], 0.5, 0.45, 1100, 0.2, 14, 0), V([420, 160], 0.5, 0.35, 900, 0.3, 14, 0, { d: 0.15 })] },
    goblin: { amb: [V([330, 250], 0.1, 0.3, 1100, 0.3, 40, 0, { rep: 3, gap: 0.14 })], atk: [V([260, 200], 0.3, 0.5, 1200, 0.4, 30, 0.3)], cast: [V([240, 380, 300], 0.8, 0.55, 1100, 0.5, 28, 0.3)], die: [V([330, 120], 0.6, 0.5, 1000, 0.5, 18, 0.2)] },
    demon: { amb: [V([70, 55], 0.9, 0.4, 300, 0.8, 18, 0.2), C([3000, 3000], 4, 0.09, 0.08, { d: 0.1 })], atk: [V([110, 70], 0.35, 0.55, 450, 0.9, 30, 0.4), N([1500, 600], 0.2, 0.25, 'bandpass', 1)], cast: [N([400, 2500], 0.7, 0.35, 'bandpass', 0.7), V([90, 140], 0.6, 0.3, 350, 0.9, 25, 0.2)], die: [V([140, 45], 1.4, 0.6, 350, 0.9, 20, 0.4), C([2500, 2500], 6, 0.08, 0.08)] },
    dragon: { amb: [V([50, 40], 1.2, 0.5, 220, 0.6, 8, 0.25), N([400, 250], 1.2, 0.15, 'lowpass', 0.8, { att: 0.3 })], atk: [V([90, 60], 0.6, 0.65, 400, 0.9, 25, 0.5)], cast: [N([300, 2200, 700], 1.4, 0.5, 'bandpass', 0.6, { att: 0.15 }), V([60, 110], 1.2, 0.4, 300, 0.8, 22, 0.3)], die: [V([130, 40], 2, 0.7, 300, 0.9, 16, 0.5)] },
    bat: { amb: [O([4200, 6200], 0.05, 0.15, 'sine', { rep: 2, gap: 0.09 }), C([6000, 7000], 3, 0.04, 0.05)], atk: [O([3000, 5200], 0.12, 0.22, 'sawtooth'), N([5000, 7000], 0.1, 0.15, 'highpass', 1)], cast: [O([2000, 5000], 0.5, 0.2, 'sine', { att: 0.05 }), O([2100, 5200], 0.5, 0.12, 'sawtooth')], die: [O([5500, 900], 0.35, 0.25, 'sine')] },
    bird: { amb: [V([520, 300], 0.22, 0.32, 1500, 0.4, 70, 0, { rep: 2, gap: 0.3 })], atk: [V([700, 380], 0.2, 0.38, 1700, 0.5, 70, 0)], cast: [V([560, 320], 0.18, 0.32, 1500, 0.4, 70, 0, { rep: 3, gap: 0.2 })], die: [V([600, 150], 0.5, 0.35, 1400, 0.5, 60, 0)] },
    harpy: { amb: [V([1800, 1300], 0.4, 0.14, 2500, 0.2, 40, 0)], atk: [V([1400, 2200], 0.3, 0.3, 2500, 0.5, 60, 0)], cast: [V([1200, 2600, 1500], 0.8, 0.3, 2800, 0.3, 40, 0.1)], die: [V([2200, 500], 0.6, 0.3, 2500, 0.4, 40, 0)] },
    slime: { amb: [O([110, 220], 0.15, 0.3, 'sine'), O([300, 500], 0.08, 0.15, 'sine', { d: 0.12 })], atk: SQUISH, cast: SPIT, die: [N([2000, 200], 0.45, 0.5, 'lowpass', 1), O([300, 60], 0.4, 0.35, 'sine')] },
    worm: { amb: [V([60, 48], 0.8, 0.4, 200, 0.9, 12, 0.3)], atk: [N([700, 150], 0.3, 0.45, 'lowpass', 2), V([90, 55], 0.3, 0.4, 300, 0.8, 20, 0.2)], cast: SPIT, die: [V([110, 35], 1, 0.5, 250, 0.9, 14, 0.3), N([900, 150], 0.7, 0.3, 'lowpass', 2)] },
    bone: { amb: [C([2500, 2500], 3, 0.07, 0.22)], atk: [N([3000, 1500], 0.06, 0.4, 'bandpass', 3), C([1800, 1800], 2, 0.05, 0.3, { d: 0.05 })], cast: [O([420, 160], 0.14, 0.3, 'triangle'), N([3000, 4000], 0.05, 0.2, 'highpass', 1)], die: [C([1200, 1200], 9, 0.045, 0.3), N([400, 300], 0.3, 0.2, 'lowpass', 1)] },
    spider: { amb: [C([3500, 3500], 5, 0.04, 0.15)], atk: [N([6000, 3500], 0.2, 0.3, 'highpass', 1), C([2800, 2800], 2, 0.05, 0.35)], cast: [N([2500, 700], 0.25, 0.3, 'bandpass', 1.5)], die: [O([3000, 400], 0.35, 0.25, 'sine'), C([1500, 1500], 4, 0.05, 0.25)] },
    snake: { amb: [N([5500, 4500], 1, 0.13, 'highpass', 1, { att: 0.3 })], atk: [N([6500, 4000], 0.25, 0.4, 'highpass', 1), O([200, 120], 0.1, 0.15, 'sawtooth')], cast: [N([3000, 1200], 0.2, 0.3, 'bandpass', 1)], die: [N([6000, 2500], 0.8, 0.3, 'highpass', 1)] },
    ghoul: { amb: [V([110, 80], 0.9, 0.35, 500, 0.6, 14, 0.3)], atk: [V([260, 150], 0.35, 0.5, 900, 0.7, 45, 0.4)], cast: [V([240, 400, 200], 0.7, 0.45, 900, 0.7, 30, 0.4)], die: [V([200, 70], 1, 0.45, 600, 0.6, 14, 0.3)] },
    ghost: { amb: [V([420, 380, 460], 1.3, 0.2, 900, 0.1, 5, 0.1, { vib: 0.02, type: 'triangle', att: 0.3 })], atk: [V([700, 1400], 0.5, 0.3, 1800, 0.3, 50, 0.1)], cast: [V([400, 900], 1, 0.28, 1200, 0.1, 5, 0.1, { vib: 0.02, type: 'triangle', att: 0.2 })], die: [V([600, 120], 1.2, 0.28, 800, 0.1, 5, 0.1, { vib: 0.02, type: 'triangle' })] },
    spore: { amb: [N([500, 250], 0.25, 0.2, 'lowpass', 1), O([200, 150], 0.15, 0.1, 'sine')], atk: [N([900, 400], 0.15, 0.3, 'bandpass', 1)], cast: [O([300, 700], 0.08, 0.3, 'sine'), N([2500, 3500], 0.12, 0.2, 'highpass', 1)], die: [N([1200, 150], 0.5, 0.35, 'lowpass', 1), O([240, 70], 0.45, 0.25, 'sine')] },
    plant: { amb: [V([70, 110, 75], 0.9, 0.25, 300, 0.9, 14, 0.2)], atk: [N([3500, 800], 0.12, 0.4, 'bandpass', 1.5), O([200, 90], 0.15, 0.2, 'sawtooth')], cast: [N([1200, 2200], 0.5, 0.22, 'bandpass', 1, { att: 0.15 })], die: [C([900, 900], 3, 0.05, 0.35), V([120, 50], 0.9, 0.4, 300, 0.8, 16, 0.3, { d: 0.1 })] },
    horror: { amb: [N([2500, 3500, 2000], 1, 0.13, 'bandpass', 5, { att: 0.25 }), O([90, 86], 1, 0.08, 'sine')], atk: [V([320, 180], 0.4, 0.4, 1500, 0.6, 45, 0.4)], cast: [O([200, 1800], 0.4, 0.25, 'sine'), N([4000, 8000], 0.5, 0.2, 'bandpass', 1)], die: [V([500, 100], 0.9, 0.35, 900, 0.5, 30, 0.3)] },
    scarecrow: { amb: [N([3000, 2000], 0.5, 0.15, 'bandpass', 0.8, { att: 0.1 }), V([55, 70], 0.6, 0.15, 250, 0.7, 9, 0)], atk: [N([2500, 3000], 0.15, 0.3, 'highpass', 1), V([480, 260], 0.2, 0.3, 1400, 0.4, 70, 0)], cast: [V([500, 300], 0.18, 0.3, 1400, 0.4, 70, 0, { rep: 3, gap: 0.2 })], die: [N([3000, 1200], 0.8, 0.2, 'bandpass', 0.8), V([180, 60], 0.9, 0.3, 400, 0.6, 14, 0.2)] },
    mask: { amb: [LAUGH(4, 300)], atk: [V([500, 200], 0.3, 0.4, 1400, 0.7, 50, 0.3)], cast: [LAUGH(6, 340)], die: [V([450, 90], 1, 0.35, 1100, 0.5, 28, 0.2), LAUGH(3, 220)] },
    golem: { amb: [N([300, 200], 1, 0.3, 'lowpass', 2), V([45, 38], 1, 0.35, 150, 0.5, 7, 0)], atk: [O([110, 40], 0.3, 0.6, 'sine'), N([1200, 200], 0.25, 0.45, 'lowpass', 1)], cast: [V([50, 70, 45], 1, 0.4, 200, 0.6, 9, 0.2), N([400, 150], 0.9, 0.25, 'lowpass', 2)], die: [C([500, 500], 12, 0.06, 0.3), N([600, 200], 1.2, 0.3, 'lowpass', 1)] },
    mere: { amb: [V([55, 45], 1, 0.4, 180, 0.9, 10, 0.3), N([500, 300], 0.8, 0.15, 'lowpass', 1)], atk: [V([100, 60], 0.5, 0.55, 350, 0.9, 30, 0.45)], cast: [V([200, 520, 180], 1.4, 0.4, 700, 0.5, 20, 0.2, { vib: 0.015 })], die: [V([150, 40], 2, 0.6, 300, 0.8, 12, 0.3)] },
    weasel: { amb: [V([700, 900], 0.07, 0.2, 2000, 0.2, 40, 0, { rep: 5, gap: 0.06 })], atk: [V([900, 1800], 0.3, 0.38, 2200, 0.5, 55, 0.2)], cast: [V([400, 1400], 0.8, 0.4, 2000, 0.4, 35, 0.2)], die: [V([1600, 300], 1, 0.4, 2000, 0.5, 30, 0.2)] }
  };
  var TYPE_FAM = { bear: 'bear', direwolf: 'wolf', charger: 'goblin', goblin: 'goblin', demon: 'demon', dragon: 'dragon', bat: 'bat', raven: 'bird', crow: 'bird', cragharpy: 'harpy', slime: 'slime', mawworm: 'worm',
    archer: 'bone', skeleton: 'bone', horrorHead: 'ghost', spider: 'spider', scorpion: 'spider', snake: 'snake', ghoul: 'ghoul', ghost: 'ghost', spitter: 'spore', sporeling: 'spore', vine: 'plant', rootling: 'plant',
    mosslurker: 'plant', heartroot: 'plant', horror: 'horror', scarecrow: 'scarecrow', grinmask: 'mask', screegolem: 'golem', merehorror: 'mere', weaselDemon: 'weasel' };
  var PITCH = { mosslurker: 0.8, heartroot: 0.55, rootling: 1.3, scorpion: 0.8, horrorHead: 0.8, sporeling: 0.9, crow: 1.15, direwolf: 1 };
  MS.FAM = FAM; MS.TYPE_FAM = TYPE_FAM;

  var KINDS = ['amb', 'atk', 'cast', 'roar', 'die'];
  Object.keys(FAM).forEach(function (fam) {
    KINDS.forEach(function (kind) {
      var def = FAM[fam][kind] || FAM[fam].cast; if (!def) return;
      A.defineFx('m_' + fam + '_' + kind, function (o, out, t) { def.forEach(function (L) { layer(L, out, t, o.k || 1); }); });
    });
  });

  /* ---------- the hero's grunts: three takes, a little higher for the thief, lower for the necromancer ---------- */
  var UGH = [
    function (out, t, k) { voice(out, t, { f: [210, 120], len: 0.2, pk: 0.5, ff: 900, r: 0.3, rt: 40, nz: 0.25, att: 0.01 }, k); },
    function (out, t, k) { K.noise(t, 0.08, 0.2, 'bandpass', 900, 500, 1, out, 0.02); voice(out, t + 0.05, { f: [170, 95], len: 0.27, pk: 0.5, ff: 700, r: 0.4, rt: 33, nz: 0.3, att: 0.02 }, k); },
    function (out, t, k) { voice(out, t, { f: [150, 230, 110], len: 0.3, pk: 0.45, ff: 1000, r: 0.25, rt: 28, nz: 0.2, att: 0.02, type: 'square' }, k); }
  ];
  UGH.forEach(function (fn, i) { A.defineFx('ugh' + (i + 1), function (o, out, t) { fn(out, t, o.k || 1); }); });
  var lastUgh = -1, KCLASS = { thief: 1.25, wizard: 1.1, necromancer: 0.85, swordsman: 1 };
  MS.ugh = function (p) { var i; do { i = Math.floor(R() * 3); } while (i === lastUgh); lastUgh = i; A.fx('ugh' + (i + 1), { k: (KCLASS[p && p.classId] || 1) * (0.95 + R() * 0.1), vol: 0.9, gap: 220 }); };

  /* ---------- playing a monster sound ---------- */
  function famOf(e) { return TYPE_FAM[e.type] || TYPE_FAM[e.look] || (e.boss ? 'bear' : 'goblin'); }
  function pitchOf(e) {
    var k = clamp(1.2 - ((e.r || 10) - 8) * 0.025, 0.55, 1.4) * (PITCH[e.type] || 1) * (e.boss ? 0.8 : 1);
    return k * (0.93 + ((e.id || 0) % 7) * 0.022);
  }
  var GAP = { amb: 260, atk: 90, cast: 120, roar: 200, die: 60 }, VOL = { amb: 0.5, atk: 0.85, cast: 0.9, roar: 1, die: 1 };
  var SAMPLE = { bear: { amb: 'beargrowl', roar: 'bearroar', cast: 'bearroar', die: 'beardeath' } }; // recorded sounds win over the synthesised voice when present
  // crowd control: at most 3 monster voices at a time, and never the same voice twice at once. Deaths and roars may bump an ambient sound out.
  var live = [], EST = { amb: 1.0, atk: 0.5, cast: 1.0, roar: 2.5, die: 1.2 };
  function admit(name, kind, dur) {
    var now = Date.now(), i; live = live.filter(function (v) { return v.until > now; });
    for (i = 0; i < live.length; i++) if (live[i].name === name) return false;
    if (live.length >= 3) { var amb = -1; if (kind === 'die' || kind === 'roar') for (i = 0; i < live.length; i++) if (live[i].kind === 'amb') { amb = i; break; } if (amb < 0) return false; live.splice(amb, 1); }
    live.push({ name: name, kind: kind, until: now + dur * 1000 }); return true;
  }
  MS.play = function (e, kind) {
    if (!e || !A) return;
    var sm = SAMPLE[famOf(e)] && SAMPLE[famOf(e)][kind];
    if (sm && A.has(sm)) { var mm = e._ms || (e._ms = { s: null, amb: 2 + R() * 6 }); if (!admit(sm, kind, A.dur(sm))) return; A.play(sm, { x: e.x, y: e.y, vol: VOL[kind] * 0.6, gap: kind === 'amb' ? 500 : 250, vary: 0.05 }); return; } // bear sounds are 40% quieter var fam = famOf(e), name = 'm_' + fam + '_' + kind, now = Date.now(), m = e._ms || (e._ms = { s: null, amb: 2 + R() * 6 });
    var fam = famOf(e), name = 'm_' + fam + '_' + kind, now = Date.now(), m = e._ms || (e._ms = { s: null, amb: 2 + R() * 6 });
    if (kind !== 'die' && kind !== 'amb' && m['t_' + kind] && now - m['t_' + kind] < 230) return; m['t_' + kind] = now;
    if (!FAM[fam]) return;
    if (!admit(name, kind, EST[kind])) return;
    A.fx(name, { x: e.x, y: e.y, k: pitchOf(e), vol: VOL[kind] * (e.boss ? 1.2 : 1), gap: GAP[kind] });
  };

  var wrapped = null, prevHp = null, prevFlash = 0, ambBudget = 0, AMB_R = 430;
  function wrapEnemies(E) {
    if (wrapped === E || !E) return; wrapped = E;
    var k0 = E._kill, s0 = E._shoot;
    if (k0) E._kill = function (e) { var was = e && !e.dead; var r = k0.apply(this, arguments); if (was && e && e.dead) MS.play(e, 'die'); return r; };
    if (s0) E._shoot = function (e) { if (e && e.type) MS.play(e, 'cast'); return s0.apply(this, arguments); };
  }
  MS.update = function (dt) {
    var s = CC.state, p = s && s.player; if (!s || s.mode !== 'dungeon' || !p || p.stub) { prevHp = null; return; }
    var E = CC.Enemies; wrapEnemies(E); if (!E || !E.list) return;
    var hurt = false, i, e, d, m;
    if (prevHp !== null && p.hp < prevHp - 0.01 && (p.hurtFlash || 0) >= 0.15 && prevFlash < (p.hurtFlash || 0)) hurt = true;
    prevHp = p.hp; prevFlash = p.hurtFlash || 0;
    ambBudget = Math.min(2, ambBudget + dt * 2.2);
    var near = null, nd = 1e9, crit = CC.CriticalScene && CC.CriticalScene.isActive && CC.CriticalScene.isActive();
    for (i = 0; i < E.list.length; i++) {
      e = E.list[i]; if (!e || e.dead || e.hp <= 0) continue;
      d = Math.hypot(e.x - p.x, e.y - p.y); if (d > AMB_R + 200) continue;
      m = e._ms || (e._ms = { s: e.state, amb: 2 + R() * 6, atk: e.atk });
      if (e.state !== m.s) {
        if (e.state === 'telegraph' && e.atk === 'roar') MS.play(e, 'roar');
        else if (e.state === 'act' && e.atk !== 'roar') MS.play(e, 'atk');
        m.s = e.state;
      }
      if (d < nd) { nd = d; near = e; }
      if (d < (e.type === 'bear' ? 280 : AMB_R) && !crit && (m.amb -= dt) <= 0) { m.amb = (e.boss ? 3 : 5) + R() * 8; if (ambBudget >= 1 && !e.asleep) { ambBudget -= 1; MS.play(e, 'amb'); } }
    }
    if (hurt) { MS.ugh(p); if (near && nd < 90 && !(near._ms && near._ms.t_atk && Date.now() - near._ms.t_atk < 400)) MS.play(near, 'atk'); }
  };
})(window);
