/* The Grinning Mask: a golden-framed porcelain mask that haunts the Giant Forest.
 * Art: assets/mask_atlas.png (idle, enrage, attack and death rows cut from the supplied sprite sheet).
 *
 *  - Its grin widens as it is hurt (the 8 enrage frames follow its health), cracks spread, blood weeps from its eyes, and
 *    the porcelain breaks away to show the red meat and brain underneath (chips fly off with every hit).
 *  - It hits harder and faster the more it is hurt.
 *  - Attacks: Mirror Shatter (a fan of crystal shards), Hex Mirrors (orbiting crystals that are flung one by one),
 *    Shrieking Grin (a scream that throws you back and bursts into shards), Grin Rush (a blood-slashing lunge, twice when badly hurt)
 *    and, at one third health, PSYCHIC GRIP: it seizes you from across the room, crushes you, then slams you away stunned.
 *  - Its own death: it convulses, the face cracks open and bursts, the halves fly apart on a spray of blood and brain, a screaming
 *    skull is left that rattles and dissolves into smoke and rising souls.
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, E = CC.Enemies, TAU = Math.PI * 2;
  if (!E || !E.TYPES) return;
  function R() { return Math.random(); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  var DEATH_LEN = 2.7, SCALE = 0.84;

  E.TYPES.grinmask = { name: 'The Grinning Mask', hp: 380, spd: 46, dmg: 11, r: 16, xp: 150, color: '#d8cdc4', w: 0, blood: '#8a0f1c' };

  /* ---------- atlas ---------- */
  var atlas = new Image(), ready = false;
  atlas.onload = function () { ready = true; };
  atlas.src = 'assets/mask_atlas.png';
  var ROW = {
    idle: { y: 0, w: 79, h: 79, n: 6, cx: 39.5, cy: 39 },
    enrage: { y: 80, w: 68, h: 83, n: 8, cx: 34, cy: 44 },
    attack: { y: 164, w: 91, h: 73, n: 6, cx: 55, cy: 38 },
    death: { y: 238, w: 46, h: 61, n: 6, cx: 23, cy: 30 }
  };
  function frame(c, row, i, x, y, k, alpha) { // draw one atlas frame centred on its mask
    var q = ROW[row]; i = clamp(i | 0, 0, q.n - 1);
    if (!ready) return false;
    if (alpha !== undefined) c.globalAlpha *= alpha;
    c.drawImage(atlas, i * q.w, q.y, q.w, q.h, x - q.cx * k, y - q.cy * k, q.w * k, q.h * k);
    if (alpha !== undefined) c.globalAlpha /= (alpha || 1);
    return true;
  }
  function stageOf(e) { return clamp(Math.floor((1 - clamp(e.hp / e.maxHp, 0, 1)) * 8), 0, 7); }

  /* ---------- procedural gore laid over the sprite (sprite-pixel units, origin = middle of the mask) ---------- */
  function L(c, x0, y0, x1, y1) { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
  function brain(c, x, y, rx, ry, t, glisten) {
    c.save(); c.translate(x, y);
    c.fillStyle = '#2a0409'; c.beginPath(); c.ellipse(0, 0, rx + 1.6, ry + 1.6, 0.2, 0, TAU); c.fill(); // dark cavity
    c.fillStyle = '#c98a93'; c.beginPath(); c.ellipse(0, 0, rx, ry, 0.2, 0, TAU); c.fill();
    c.fillStyle = '#dfa6ad'; c.beginPath(); c.ellipse(-rx * 0.25, -ry * 0.3, rx * 0.55, ry * 0.45, 0.2, 0, TAU); c.fill();
    c.strokeStyle = '#8f4a58'; c.lineWidth = 1; c.lineCap = 'round'; // gyri: wandering folds
    for (var i = 0; i < 4; i++) {
      var ox = -rx * 0.6 + i * rx * 0.4;
      c.beginPath(); c.moveTo(ox, -ry * 0.8); c.bezierCurveTo(ox + rx * 0.3, -ry * 0.3, ox - rx * 0.3, ry * 0.2, ox + rx * 0.1, ry * 0.8); c.stroke();
    }
    c.beginPath(); c.moveTo(-rx * 0.85, 0); c.quadraticCurveTo(0, -ry * 0.25, rx * 0.85, ry * 0.05); c.stroke();
    c.strokeStyle = '#a3182a'; c.lineWidth = 0.8; // tiny veins
    for (i = 0; i < 3; i++) L(c, -rx * 0.5 + i * rx * 0.5, -ry * 0.6, -rx * 0.35 + i * rx * 0.5, ry * 0.5);
    if (glisten) { c.fillStyle = 'rgba(255,235,238,.75)'; c.fillRect(-rx * 0.4, -ry * 0.55, 2, 1.2); c.fillRect(rx * 0.2, ry * 0.1, 1.5, 1); }
    c.restore();
    // blood welling over the lip and running down
    c.strokeStyle = '#a30f20'; c.lineWidth = 1.5;
    var run = 5 + 4 * (0.5 + 0.5 * Math.sin(t * 2 + x));
    L(c, x - rx * 0.4, y + ry * 0.7, x - rx * 0.45, y + ry + run); L(c, x + rx * 0.3, y + ry * 0.8, x + rx * 0.35, y + ry + run * 0.7);
    c.fillStyle = '#a30f20'; c.beginPath(); c.arc(x - rx * 0.45, y + ry + run + 1, 1.3, 0, TAU); c.fill();
  }
  function goreOverlay(c, e, st, frac, t) {
    var an = e.anim, wound = 1 - frac;
    c.lineCap = 'round'; c.lineJoin = 'round';
    // more and more cracks, scored in dark and glowing red
    var cracks = [
      [[-3, -27], [-5, -18], [-2, -9], [-6, 2], [-4, 14]],
      [[6, -26], [9, -16], [5, -8], [10, 3], [8, 15]],
      [[-18, -8], [-11, -6], [-7, 0], [0, 4]],
      [[17, -5], [10, -3], [5, 4], [-1, 8]],
      [[-9, 22], [-4, 15], [0, 20]]
    ];
    var shown = Math.min(cracks.length, Math.floor(wound * 6.5));
    for (var ci = 0; ci < shown; ci++) {
      var cr = cracks[ci], glow = 0.55 + 0.35 * Math.sin(an * 3 + ci);
      c.strokeStyle = 'rgba(30,4,8,.9)'; c.lineWidth = 2.1; c.beginPath(); c.moveTo(cr[0][0], cr[0][1]); for (var k = 1; k < cr.length; k++) c.lineTo(cr[k][0], cr[k][1]); c.stroke();
      c.strokeStyle = 'rgba(214,40,56,' + glow.toFixed(2) + ')'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(cr[0][0], cr[0][1]); for (k = 1; k < cr.length; k++) c.lineTo(cr[k][0], cr[k][1]); c.stroke();
    }
    // blood weeps from the eyes and the corners of the grin
    var drip = (an * 16) % 16;
    c.strokeStyle = '#a30f20'; c.lineWidth = 1.5;
    L(c, -9, 1, -11, 13 + st); L(c, 9, 1, 12, 14 + st);
    c.fillStyle = '#c4162c'; c.beginPath(); c.arc(-11, 14 + st + drip * 0.4, 1.4, 0, TAU); c.arc(12, 15 + st + ((drip + 7) % 16) * 0.4, 1.2, 0, TAU); c.fill();
    if (wound > 0.25) { c.lineWidth = 1.3; L(c, -15, 14, -17, 20 + st); L(c, 15, 14, 17, 19 + st); }
    // the red meat and brain beneath the broken porcelain
    if (wound > 0.28) {
      c.fillStyle = '#3a0610'; c.beginPath(); c.moveTo(3, -26); c.quadraticCurveTo(12, -27, 16, -20); c.quadraticCurveTo(19, -12, 11, -9); c.quadraticCurveTo(7, -8, 6, -14); c.quadraticCurveTo(7, -20, 3, -26); c.fill();
      c.fillStyle = '#a3182c'; c.beginPath(); c.moveTo(6, -24); c.quadraticCurveTo(12, -24, 14, -18); c.quadraticCurveTo(14, -13, 9, -12); c.quadraticCurveTo(7, -17, 6, -24); c.fill();
    }
    if (wound > 0.42) brain(c, 10, -16, 6.5 + wound * 3.5, 5 + wound * 3, t, true);
    if (wound > 0.66) {
      c.fillStyle = '#3a0610'; c.beginPath(); c.moveTo(-14, -14); c.quadraticCurveTo(-9, -19, -4, -16); c.quadraticCurveTo(-1, -9, -5, -5); c.quadraticCurveTo(-11, -3, -14, -14); c.fill();
      brain(c, -9, -10, 5 + wound * 2.4, 4 + wound * 2, t + 1, false);
    }
    if (wound > 0.5) { // torn gum and teeth hang loose; a ragged gash splits the jaw
      c.strokeStyle = '#2a0508'; c.lineWidth = 2; L(c, -14, 18, -3, 25); c.strokeStyle = '#d4283c'; c.lineWidth = 0.9; L(c, -14, 18, -3, 25);
    }
  }

  /* ---------- the living mask ---------- */
  function drawAlive(c, e, r, col, dark, t) {
    var frac = clamp(e.hp / e.maxHp, 0, 1), st = stageOf(e), an = e.anim, k = SCALE, act = e.state === 'act', tele = e.state === 'telegraph';
    var bob = Math.sin(an * 2.6) * 2.4 - 8, jx = tele ? (R() - 0.5) * 2 : 0;
    var rage = 1 - frac, atk = e.atk;
    c.save(); c.translate(jx, bob);
    // an aura that curdles from violet to blood-red as it is hurt
    var rr = Math.round(110 + 120 * rage), gg = Math.round(40 - 20 * rage), bb = Math.round(150 - 110 * rage);
    var ag = c.createRadialGradient(0, 0, 4, 0, 0, 46 + 6 * Math.sin(an * 3));
    ag.addColorStop(0, 'rgba(' + rr + ',' + gg + ',' + bb + ',' + (0.22 + 0.2 * rage).toFixed(2) + ')'); ag.addColorStop(1, 'rgba(' + rr + ',' + gg + ',' + bb + ',0)');
    c.fillStyle = ag; c.fillRect(-52, -52, 104, 104);
    // pick a frame
    var drewAtk = false;
    if (atk === 'lunge' && (tele || act)) {
      var ai = tele ? (e.t > 0.28 ? 0 : 1) : e.t > 0.3 ? 2 : e.t > 0.17 ? 3 : 4; // wind up, stretch, streak, snarl
      drewAtk = frame(c, 'attack', ai, 0, 0, k);
    } else if (atk === 'lunge' && e.state === 'recover' && e.t > 0.4) drewAtk = frame(c, 'attack', 5, 0, 0, k);
    if (!drewAtk) {
      if (act && (atk === 'wail')) frame(c, 'enrage', Math.min(7, st + 3), 0, 0, k * (1 + 0.06 * Math.sin(an * 40)));
      else if (st < 1) frame(c, 'idle', (an * 7) % 6, 0, 0, k);
      else frame(c, 'enrage', st, 0, 0, k);
    }
    // eyes flare for the magic: psychic grip glares white-red
    var eyeHot = e.mkGrip ? 1 : tele ? 0.6 : 0.25 + 0.2 * rage;
    c.save(); c.scale(k, k); c.globalCompositeOperation = 'lighter';
    var eg = c.createRadialGradient(0, 0, 0, 0, 0, 9);
    eg.addColorStop(0, 'rgba(255,60,60,' + (0.55 * eyeHot).toFixed(2) + ')'); eg.addColorStop(1, 'rgba(255,0,0,0)');
    c.fillStyle = eg; c.save(); c.translate(-9, -3); c.fillRect(-9, -9, 18, 18); c.restore(); c.save(); c.translate(9, -3); c.fillRect(-9, -9, 18, 18); c.restore();
    c.globalCompositeOperation = 'source-over';
    if (e.flash > 0) { c.globalAlpha = 0.5; c.globalCompositeOperation = 'lighter'; if (!drewAtk) frame(c, st < 1 ? 'idle' : 'enrage', st < 1 ? 0 : st, 0, 0, 1); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; }
    if (!drewAtk) goreOverlay(c, e, st, frac, t);
    c.restore();
    // hex mirrors orbiting the mask
    if (e.orbs) for (var i = 0; i < e.orbs.length; i++) {
      var o = e.orbs[i], oa = o.a + an * 3.4, ox = Math.cos(oa) * 27, oy = Math.sin(oa) * 14 - 2, pr = 0.5 + 0.5 * Math.sin(an * 9 + i);
      c.save(); c.translate(ox, oy); c.rotate(oa);
      c.shadowColor = '#ff4a6a'; c.shadowBlur = 7;
      c.fillStyle = '#ffd4dc'; c.beginPath(); c.moveTo(0, -6); c.lineTo(3.4, 0); c.lineTo(0, 6); c.lineTo(-3.4, 0); c.closePath(); c.fill();
      c.shadowBlur = 0; c.fillStyle = '#ff6a82'; c.beginPath(); c.moveTo(0, -6); c.lineTo(3.4, 0); c.lineTo(0, 0); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,255,255,' + (0.5 + 0.5 * pr).toFixed(2) + ')'; c.fillRect(-0.6, -3, 1.2, 4);
      c.restore();
    }
    c.restore();
  }

  /* ---------- its own death ---------- */
  var V = function () { return CC.Vfx; };
  function shardBurst(x, y, n, spd) {
    var v = V(); if (!v) return;
    for (var i = 0; i < n; i++) { var a = R() * TAU, s = spd * (0.4 + R() * 0.8); v.emit({ kind: 'shard', x: x, y: y - 6, vx: Math.cos(a) * s, vy: Math.sin(a) * s - spd * 0.5, ay: 300, life: 0.7 + R() * 0.6, size: 1.8 + R() * 2.6, col: '#e6dcd2', col2: '#ffffff', vr: (R() - 0.5) * 16, rot: R() * 6 }); }
  }
  function drawDeath(c, e, r, t) {
    var u = clamp((e.mT || 0) / DEATH_LEN, 0, 1), tm = e.mT || 0, k = SCALE * 1.04, st = 7;
    c.save(); c.translate(0, -8);
    // phases: convulse (0-.13), burst (.13-.3), skull (.3-.62), dissolve (.62-1)
    if (u < 0.13) {
      var sh = 2.6 * ease(u / 0.13) + 0.6;
      c.translate((R() - 0.5) * sh * 2, (R() - 0.5) * sh * 2);
      frame(c, 'enrage', 7, 0, 0, k * (1 + 0.04 * Math.sin(tm * 70)));
      c.save(); c.scale(k, k); c.globalCompositeOperation = 'lighter';
      var fl = ease(u / 0.13), hg = c.createRadialGradient(0, -2, 2, 0, -2, 26); hg.addColorStop(0, 'rgba(255,225,225,' + (0.7 * fl).toFixed(2) + ')'); hg.addColorStop(1, 'rgba(255,60,70,0)'); c.fillStyle = hg; c.fillRect(-30, -32, 60, 60); c.globalCompositeOperation = 'source-over';
      c.strokeStyle = 'rgba(255,60,70,' + (0.6 + 0.4 * fl).toFixed(2) + ')'; c.lineWidth = 1.4; c.lineCap = 'round'; // light bleeds through the cracks
      L(c, -3, -28, -5, -14); L(c, -5, -14, -2, -2); L(c, -2, -2, -7, 12); L(c, 7, -27, 9, -12); L(c, 9, -12, 4, 0); L(c, 4, 0, 10, 16); L(c, -18, -8, -4, 4); L(c, 17, -5, 2, 6);
      c.restore();
    } else {
      var b = (u - 0.13) / 0.87;
      // the skull underneath grows out of the broken mask
      var skullA = clamp((u - 0.15) / 0.14, 0, 1) * (1 - clamp((u - 0.78) / 0.2, 0, 1));
      var rattle = u > 0.3 && u < 0.7 ? Math.sin(tm * 55) * 1.3 : 0;
      c.save(); c.translate(rattle, 0);
      if (skullA > 0) {
        c.globalAlpha *= skullA; frame(c, 'death', u < 0.46 ? 2 : 3, 0, 4 + (u > 0.46 ? Math.min(7, (u - 0.46) * 40) : 0), k * (1.2 + 0.18 * ease((u - 0.15) / 0.3)));
        // red eye-fire gutters out
        var eyeA = clamp(1 - (u - 0.4) / 0.35, 0, 1) * (0.6 + 0.4 * Math.sin(tm * 30));
        c.save(); c.scale(k, k); c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(255,50,50,' + (0.7 * eyeA).toFixed(2) + ')';
        c.beginPath(); c.arc(-6, 2, 4.5, 0, TAU); c.arc(6, 2, 4.5, 0, TAU); c.fill(); c.globalCompositeOperation = 'source-over'; c.restore();
        c.globalAlpha /= skullA || 1;
      }
      c.restore();
      // the two halves of the face fly apart
      var sep = ease(clamp((u - 0.13) / 0.2, 0, 1)), fall = clamp((u - 0.3) / 0.35, 0, 1), faceA = 1 - clamp((u - 0.5) / 0.14, 0, 1);
      if (faceA > 0) for (var side = -1; side <= 1; side += 2) {
        c.save(); c.globalAlpha *= faceA;
        c.translate(side * (4 + 34 * sep), -6 * sep + 38 * fall * fall); c.rotate(side * (0.08 + 0.42 * sep + 0.3 * fall));
        c.beginPath(); if (side < 0) c.rect(-60, -60, 60, 120); else c.rect(0, -60, 60, 120); c.clip();
        frame(c, 'death', 1, 0, 0, k * 1.02);
        c.restore();
      }
      // a fountain of blood from the split
      if (u > 0.13 && u < 0.48 && E._gorePart) {
        e._pour = (e._pour || 0) - 1;
        if (e._pour <= 0) {
          e._pour = 2;
          for (var i = 0; i < 3; i++) { var a = -Math.PI / 2 + (R() - 0.5) * 1.9, sp = 70 + R() * 110; E._gorePart(e.x + (R() - 0.5) * 8, e.y - 8, Math.cos(a) * sp, Math.sin(a) * sp * 0.6, 90 + R() * 90, R() < 0.2 ? 'chunk' : 'blood', R() < 0.2 ? '#c98a93' : '#9c0f1e', 0.8 + R() * 0.9, R() < 0.3 ? 3 : 0); }
        }
      }
      // smoke curls up as the skull dissolves
      var smA = clamp((u - 0.62) / 0.2, 0, 1) * (1 - clamp((u - 0.9) / 0.1, 0, 1));
      if (smA > 0) {
        var wi = 4 + Math.floor((u - 0.62) * 6) % 2;
        c.globalAlpha *= smA; frame(c, 'death', wi, 0, -6 - 12 * (u - 0.62), k * 1.3); c.globalAlpha /= smA || 1;
      }
    }
    c.restore();
    // one-shot beats: the burst, the skull's scream, the final soul release
    var vv = V();
    if (!e._b1 && u >= 0.13) { e._b1 = 1; shardBurst(e.x, e.y, 26, 220); if (vv) { vv.skyFlash('#ff5a5a', 0.22, 0.28); vv.spawn('frostNova', e.x, e.y, 0, { local: true }); } if (CC.fx) { CC.fx.shake(10); if (CC.fx.text) CC.fx.text(e.x, e.y - 40, 'THE GRIN BREAKS!', '#ffb0b8', 14); if (CC.fx.blood) CC.fx.blood(e.x, e.y, 16, 0, -1, '#9c0f1e'); } }
    if (!e._b2 && u >= 0.34) { e._b2 = 1; if (CC.fx) { CC.fx.shake(6); if (CC.fx.text) CC.fx.text(e.x, e.y - 32, 'AAAAHHH...', '#e8d8f0', 11); } shardBurst(e.x, e.y, 10, 120); }
    if (vv && u > 0.45 && u < 0.95 && Math.random() < 0.5) vv.emit({ kind: 'smoke', x: e.x + (R() - 0.5) * 14, y: e.y - 8, vx: (R() - 0.5) * 20, vy: -22 - R() * 22, life: 1, size: 7, grow: 9, col: R() < 0.5 ? '#2a1830' : '#4a2a50', alpha: 0.65 });
    if (vv && u > 0.6 && u < 0.98 && Math.random() < 0.18) vv.emit({ kind: 'soul', add: true, x: e.x + (R() - 0.5) * 10, y: e.y - 8, vx: (R() - 0.5) * 18, vy: -45 - R() * 30, life: 1.1, size: 2.4, col: '#e8b8ff' });
    if (!e._b3 && u >= 0.9) { e._b3 = 1; if (vv) { vv.emit({ kind: 'star', add: true, x: e.x, y: e.y - 10, life: 0.5, size: 8, col: '#ff6a7a', vr: 4 }); for (var q = 0; q < 8; q++) vv.emit({ kind: 'soul', add: true, x: e.x, y: e.y - 8, vx: Math.cos(q * 0.785) * 40, vy: -50 + Math.sin(q * 0.785) * 20, life: 1.3, size: 2.6, col: '#d8a0ff' }); } if (CC.fx && CC.fx.shake) CC.fx.shake(5); }
  }

  /* ---------- hook the renderer ---------- */
  var F = CC.Forest;
  var origDraw = F && F.drawMonster;
  if (F) F.drawMonster = function (ctx, e, r, col, dark, t) {
    if (e.type === 'grinmask') { if (e.dead) drawDeath(ctx, e, r, t); else drawAlive(ctx, e, r, col, dark, t); return true; }
    return origDraw ? origDraw.apply(this, arguments) : false;
  };
  var WA = CC.WoundArt;
  if (WA) {
    var oImpact = WA.impact;
    WA.impact = function (e, angle, type) { // every landed hit knocks a visible chunk of porcelain off the face
      if (!e || e.type !== 'grinmask') return oImpact.apply(this, arguments);
      if (e.dead) return;
      e.hitWounds = e.hitWounds || []; e.hitIndex = (e.hitIndex || 0) + 1;
      var i = e.hitIndex, a = i * 2.4 + (angle || 0) * 0.3;
      e.hitWounds.push({ x: Math.cos(a) * 9 * SCALE, y: -6 + Math.sin(a) * 9, r: (2 + R() * 2.2) * SCALE, seed: i, age: 0, side: i % 2 ? 1 : -1, angle: a, type: type, mask: 1 });
      if (e.hitWounds.length > 6) e.hitWounds.shift();
      var n = 3;
      for (var j = 0; j < n; j++) { var ang = a + (R() - 0.5) * 1.8, sp = 70 + R() * 120; var q = E._gorePart(e.x, e.y - 8, Math.cos(ang) * sp, Math.sin(ang) * sp, 80 + R() * 80, j === 0 && i % 3 === 0 ? 'chunk' : 'chunk', j === 0 && i % 3 === 0 ? '#c98a93' : '#e2d8ce', 0.5 + R() * 0.5, 0); if (q) { q.source = 'grinmask'; q.nopile = true; } }
      shardBurst(e.x, e.y, 3, 120);
    };
  }

  /* ---------- the mind of the mask ---------- */
  function mv(e, dx, dy) { var D = CC.Dungeon; if (D && D.moveWithCollision) { var r = D.moveWithCollision(e, dx, dy); return !!(r && (r.hitX || r.hitY)); } e.x += dx; e.y += dy; return false; }
  function seeing(a, b) { var D = CC.Dungeon; if (!D || !D.isSolid) return true; var n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 14); for (var i = 1; i < n; i++) if (D.isSolid(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n)) return false; return true; }
  function isRemote(p) { var M = CC.Multiplayer; return !!(M && M.remote && p === M.remote); }
  function hurt(p, amt, e) { if (CC.Classes && CC.Classes.damage) return CC.Classes.damage(p, amt, e); return 0; }
  function shove(p, ang, power) { if (isRemote(p)) return; if (CC.movePlayer) CC.movePlayer(p, Math.cos(ang) * power, Math.sin(ang) * power); }
  function ringFx(e, rad, col) { E.projectiles.push({ x: e.x, y: e.y, vx: 0, vy: 0, r: 0, life: 0.35, ring: rad, color: col || '#d9b0ff', fx: true }); }
  function txt(e, s, col, sz) { if (CC.fx && CC.fx.text) CC.fx.text(e.x, e.y - 40, s, col || '#e8c8ff', sz || 11); }
  function shoot(e, a, spd, dmg, r) { E._shoot(e, a, spd, dmg, '#ffd4dc', 'crystal', 2.4); var q = E.projectiles[E.projectiles.length - 1]; if (q) { q.r = r || 4; q.x = e.x + Math.cos(a) * 14; q.y = e.y + Math.sin(a) * 14 - 8; } return q; }
  function sendGrip(p, o) { var M = CC.Multiplayer; if (M && M.sendFx && isRemote(p)) M.sendFx('gp', o); }
  function releaseGrip(e) {
    var p = e.gripP || (CC.state && CC.state.player);
    if (e.mkGrip && p && !isRemote(p)) { p.psyPull = null; p.psyT = Math.min(p.psyT || 0, 0.01); }
    e.mkGrip = false; e.gripP = null;
  }
  var ATK_NAME = { shards: 'MIRROR SHATTER', orbs: 'HEX MIRRORS', wail: 'SHRIEKING GRIN', lunge: 'GRIN RUSH', grip: 'PSYCHIC GRIP!' };

  function begin(e, kind, ang, p) {
    var st = stageOf(e), t = kind === 'shards' ? 0.7 : kind === 'orbs' ? 1.0 : kind === 'wail' ? 0.8 : kind === 'lunge' ? 0.62 : 0.95;
    e.state = 'telegraph'; e.atk = kind; e.ang = ang; e.t = t; e.lastAtk = kind;
    e.tele = kind === 'wail' ? { kind: 'circle', rad: 140, max: t } : kind === 'lunge' ? { kind: 'line', ang: ang, len: 215, max: t } : kind === 'shards' ? { kind: 'line', ang: ang, len: 230, max: t } : kind === 'grip' ? { kind: 'circle', rad: 62, max: t } : null;
    txt(e, ATK_NAME[kind], kind === 'grip' ? '#ff7a8a' : '#e8c8ff', kind === 'grip' ? 14 : 11);
    if (kind === 'orbs') { e.orbs = []; var n = 3 + (st >= 4 ? 1 : 0) + (st >= 6 ? 1 : 0); for (var i = 0; i < n; i++) e.orbs.push({ a: i * TAU / n }); }
    if (kind === 'grip') { e.mkFx = 0.95; if (CC.fx && CC.fx.shake) CC.fx.shake(4); }
  }
  function mind(e, dt, p, d, ang, f) {
    var frac = clamp(e.hp / e.maxHp, 0, 1), st = stageOf(e), wound = 1 - frac;
    e.baseDmg = e.baseDmg || e.dmg;
    e.dmg = Math.round(e.baseDmg * (1 + 1.5 * wound)); // the more it is hurt, the harder it hits
    e.cd = Math.max(0, (e.cd || 0) - dt);
    e.gripCd = Math.max(0, (e.gripCd === undefined ? 5 : e.gripCd) - dt);
    e.mkFx = Math.max(0, (e.mkFx || 0) - dt);
    e.dangerous = false;
    var spd = e.spd * f * (1 + 0.55 * wound) * dt, cx = Math.cos(ang), cy = Math.sin(ang);
    if (!e.enraged && frac <= 1 / 3) { // a third left: the calm is gone
      e.enraged = true; e.spd *= 1.18; txt(e, 'IT SEES YOU NOW', '#ff6a7a', 13);
      if (CC.fx) { if (CC.fx.shake) CC.fx.shake(8); if (CC.fx.burst) CC.fx.burst(e.x, e.y, '#c4162c', 22, 150); }
      ringFx(e, 120, '#ff5a6a'); e.gripCd = Math.min(e.gripCd, 1.2);
    }
    var seen = p.hp > 0 && seeing(e, p);
    if (e.state === 'idle') {
      var want = d > 175 ? 1 : d < 90 ? -0.85 : 0.05;
      mv(e, cx * spd * want, cy * spd * want);
      mv(e, -cy * spd * 0.55 * (e.strafe || 1) * Math.sin(e.anim * 0.8 + 1), cx * spd * 0.55 * (e.strafe || 1) * Math.sin(e.anim * 0.8 + 1));
      if (e.volley > 0) { e.volley -= dt; if (e.volley <= 0) { fan(e, ang, st, 0.7); } }
      if (e.cd <= 0 && p.hp > 0) {
        if (!seen) { mv(e, cx * spd * 0.8, cy * spd * 0.8); return; }
        var pick = null;
        if (frac <= 1 / 3 && e.gripCd <= 0 && d < 300) pick = 'grip';
        else {
          var opts = [];
          if (d < 320) opts.push(['shards', 3]);
          if (d > 60 && d < 280) opts.push(['lunge', 2 + (d > 120 ? 1 : 0)]);
          if (d < 150) opts.push(['wail', 3]);
          if (d < 320 && st >= 1) opts.push(['orbs', 2]);
          var tot = 0, i; opts.forEach(function (o) { if (o[0] === e.lastAtk) o[1] *= 0.35; tot += o[1]; });
          var r = R() * tot; for (i = 0; i < opts.length; i++) { r -= opts[i][1]; if (r < 0) { pick = opts[i][0]; break; } }
        }
        if (pick) begin(e, pick, ang, p);
      }
    } else if (e.state === 'telegraph') {
      if (e.atk === 'lunge' && e.t > 0.2) { e.ang = ang; if (e.tele) e.tele.ang = ang; } // tracks you until the last instant
      if (e.atk === 'grip' && p.hp > 0 && e.mkFx > 0 && d > 360) { e.state = 'idle'; e.tele = null; e.cd = 1; return; }
      if ((e.t -= dt) <= 0) {
        e.tele = null;
        if (e.atk === 'shards') { fan(e, e.ang, st, 1); e.volley = st >= 4 ? 0.5 : 0; e.state = 'recover'; e.t = 0.6; }
        else if (e.atk === 'orbs') { e.state = 'act'; e.t = 1.1; e.fired = 0; }
        else if (e.atk === 'wail') {
          ringFx(e, 140, '#d9b0ff'); if (CC.fx) { if (CC.fx.shake) CC.fx.shake(6); if (CC.fx.burst) CC.fx.burst(e.x, e.y, '#e8d8ff', 16, 120); }
          if (p.hp > 0 && d < 145) { hurt(p, e.dmg * 0.9, e); shove(p, ang, 70 + 20 * wound); p.slowT = Math.max(p.slowT || 0, 0.7); }
          if (CC.Vfx) CC.Vfx.spawn('frostNova', e.x, e.y, 70, { local: true });
          var n = 8 + st; for (var i = 0; i < n; i++) shoot(e, i * TAU / n + 0.2, 125, e.dmg * 0.5, 3.4);
          e.state = 'recover'; e.t = 0.95;
        } else if (e.atk === 'lunge') { e.state = 'act'; e.t = 0.42; e.trail = []; e.chain = st >= 5 ? 1 : 0; e.hitDone = false; }
        else if (e.atk === 'grip') {
          if (p.hp > 0 && d < 330 && seen) {
            e.state = 'act'; e.t = st >= 6 ? 2.1 : 1.7; e.mkGrip = true; e.gripP = p; e.gripA = Math.atan2(p.y - e.y, p.x - e.x); e.gripTick = 0.5;
            if (!isRemote(p)) p.psyT = e.t + 0.2; else sendGrip(p, { t: e.t + 0.2, x: Math.round(e.x + cx * 34), y: Math.round(e.y + cy * 34 - 4) });
            txt(e, 'SEIZED!', '#ff8a9a', 13);
            if (CC.fx && CC.fx.burst) CC.fx.burst(p.x, p.y, '#c43a6a', 14, 90);
          } else { e.state = 'recover'; e.t = 0.6; }
        }
        e.cd = Math.max(0.35, 1.5 - 0.8 * wound);
      }
    } else if (e.state === 'act') {
      if (e.atk === 'lunge') {
        e.dangerous = true; var wall = mv(e, Math.cos(e.ang) * 330 * f * (1 + 0.3 * wound) * dt, Math.sin(e.ang) * 330 * f * (1 + 0.3 * wound) * dt);
        e.trail = e.trail || []; e.trail.push({ x: e.x, y: e.y, t: 0 }); if (e.trail.length > 12) e.trail.shift();
        if (CC.Vfx && Math.random() < 0.5) CC.Vfx.emit({ kind: 'drop', x: e.x, y: e.y, vx: (R() - 0.5) * 40, vy: 10 + R() * 30, ay: 220, life: 0.5, size: 1.6, col: '#a30f20' });
        if (wall) { e.t = 0; if (CC.fx && CC.fx.shake) CC.fx.shake(3); }
        if ((e.t -= dt) <= 0) {
          if (e.chain > 0) { e.chain--; e.state = 'telegraph'; e.atk = 'lunge'; e.ang = ang; e.t = 0.42; e.tele = { kind: 'line', ang: ang, len: 215, max: 0.42 }; txt(e, 'AGAIN!', '#ff8a9a', 12); }
          else { e.state = 'recover'; e.t = 0.85; }
        }
      } else if (e.atk === 'orbs') {
        e.t -= dt;
        var total = e.orbs ? e.orbs.length : 0, due = Math.floor((1.1 - e.t) / 0.15) - 2;
        while (e.fired < total && due > e.fired) { var o = e.orbs[e.fired], oa = o.a + e.anim * 3.4, ox = e.x + Math.cos(oa) * 27, oy = e.y + Math.sin(oa) * 14 - 8; var a2 = Math.atan2(p.y - oy, p.x - ox); var q = shoot(e, a2, 175 + 12 * st, e.dmg * 0.85, 4.6); if (q) { q.x = ox; q.y = oy; q.ghost = false; } o.gone = true; e.fired++; }
        if (e.orbs) e.orbs = e.orbs.filter(function (o) { return !o.gone; });
        if (e.t <= 0) { e.orbs = null; e.state = 'recover'; e.t = 0.6; }
      } else if (e.atk === 'grip') {
        var gp = e.gripP || p;
        if (!gp || gp.hp <= 0) { releaseGrip(e); e.state = 'recover'; e.t = 0.7; return; }
        e.t -= dt;
        var tx = e.x + Math.cos(e.gripA) * 34, ty = e.y + Math.sin(e.gripA) * 34 - 4;
        if (isRemote(gp)) { e._gs = (e._gs || 0) - dt; if (e._gs <= 0) { e._gs = 0.25; sendGrip(gp, { t: 0.5, x: Math.round(tx), y: Math.round(ty) }); } }
        else { gp.psyT = Math.max(gp.psyT || 0, 0.25); gp.psyPull = { x: tx, y: ty }; }
        e.gripTick -= dt;
        if (e.gripTick <= 0) { // the crush
          e.gripTick = 0.42; hurt(gp, e.dmg * 0.34, e);
          if (CC.fx) { if (CC.fx.shake) CC.fx.shake(3); if (CC.fx.burst) CC.fx.burst(gp.x, gp.y, '#c43a6a', 8, 70); }
        }
        if (e.t <= 0) { // slam: thrown back, stunned
          var away = Math.atan2(gp.y - e.y, gp.x - e.x);
          hurt(gp, e.dmg * 0.95, e); shove(gp, away, 115);
          if (isRemote(gp)) sendGrip(gp, { t: 0.95, x: 0, y: 0, n: 1 }); else { gp.psyPull = null; gp.psyT = 0.95; gp.slowT = Math.max(gp.slowT || 0, 0.8); }
          ringFx(e, 110, '#ff6a8a'); if (CC.fx) { if (CC.fx.shake) CC.fx.shake(9); if (CC.fx.burst) CC.fx.burst(gp.x, gp.y, '#ff7a8a', 18, 130); }
          e.mkGrip = false; e.gripP = null; e.gripCd = 9 - 3 * wound; e.state = 'recover'; e.t = 1.0;
        }
      } else { e.state = 'recover'; e.t = 0.4; }
    } else if (e.state === 'recover') {
      if (e.volley > 0) { e.volley -= dt; if (e.volley <= 0) fan(e, ang, st, 0.7); }
      if ((e.t -= dt) <= 0) e.state = 'idle';
    } else e.state = 'idle';
  }
  function fan(e, a, st, scale) {
    var n = (st >= 5 ? 9 : st >= 2 ? 7 : 5), gap = 0.2 - 0.008 * st;
    for (var i = 0; i < n; i++) shoot(e, a + (i - (n - 1) / 2) * gap, 185 + 8 * st, e.dmg * 0.7 * scale, 3.6);
  }

  var oThink = E._think;
  E._think = function (e, dt, p, d, ang, f) {
    if (e.type !== 'grinmask') return oThink.apply(this, arguments);
    mind(e, dt, p, d, ang, f);
  };
  var oKill = E._kill;
  E._kill = function (e) {
    if (e && e.type === 'grinmask' && !e.dead) {
      releaseGrip(e);
      var p = CC.state && CC.state.player; if (p && p.psyT > 0 && !p.stunLock) { p.psyPull = null; p.psyT = 0; }
      e.mT = 0; e.orbs = null; e.tele = null; e.dangerous = false;
    }
    var res = oKill.apply(this, arguments);
    if (e && e.type === 'grinmask' && e.dead) {
      e.deadT = 0;
      E._addRemain('skull', e.x + 2, e.y + 3, 1.3, '#e8e2d4');
      for (var i = 0; i < 5; i++) E._addRemain('splat', e.x + (R() - 0.5) * 36, e.y + (R() - 0.5) * 30, 2 + R() * 3, '#8a0f1c');
      if (CC.Loot && CC.Loot.roll) { CC.Loot.roll(e, e.floor, 0); CC.Loot.roll(e, e.floor, 0); } // a proper reward on top of the normal drop
    }
    return res;
  };
  // the dying mask stays on screen for its death scene
  var oUpdate = E.update;
  E.update = function (dt) {
    var i, m, live = null;
    for (i = 0; i < this.list.length; i++) {
      m = this.list[i];
      if (m.type !== 'grinmask') continue;
      if (m.dead) { m.mT = (m.mT || 0) + dt; m.deadT = m.mT >= DEATH_LEN ? 1 : 0; }
    }
    var res = oUpdate.apply(this, arguments);
    for (i = 0; i < this.list.length; i++) { m = this.list[i]; if (m.type === 'grinmask' && !m.dead && !m.asleep && m.hp > 0) { live = m; m.mkSt = stageOf(m); } }
    if (live && !(this.boss && !this.boss.dead)) { // one boss bar for the mask
      this.bossBar = { name: 'The Grinning Mask', pct: clamp(live.hp / live.maxHp, 0, 1), phase: live.enraged ? 2 : 1, kind: 'grinmask', color: '#c9b8c0', intro: 0 };
    }
    return res;
  };
  // the grin widens, and its attention sharpens, with every wound
  var oDamage = E.damage;
  E.damage = function (e, amount, type) {
    var before = e && e.type === 'grinmask' ? stageOf(e) : 0, res = oDamage.apply(this, arguments);
    if (e && e.type === 'grinmask' && !e.dead && e.hp > 0) {
      var after = stageOf(e);
      if (after > before) {
        txt(e, after >= 6 ? 'THE GRIN SPLITS' : after >= 3 ? 'THE GRIN WIDENS' : 'IT SMILES WIDER', '#ffb0b8', after >= 6 ? 13 : 11);
        if (CC.fx) { if (CC.fx.shake) CC.fx.shake(3 + after * 0.5); if (CC.fx.burst) CC.fx.burst(e.x, e.y - 6, '#c4162c', 8 + after * 2, 100); }
        shardBurst(e.x, e.y, 5 + after, 150);
      }
      e.mkSt = after;
    }
    return res;
  };
  // pieces break away at each sixth of its health: shards of porcelain, a lump of brain, and a gout of blood
  var oDism = E._dismember;
  E._dismember = function (e) {
    if (!e || e.type !== 'grinmask') return oDism.apply(this, arguments);
    if (e.dead || e.hp <= 0) return;
    var want = Math.min(6, Math.floor((1 - e.hp / e.maxHp) * 7));
    e.lostN = e.lostN || 0;
    while (e.lostN < want) {
      e.lostN++;
      for (var i = 0; i < 4; i++) { var a = R() * TAU, sp = 70 + R() * 110; var q = this._gorePart(e.x, e.y - 8, Math.cos(a) * sp, Math.sin(a) * sp, 100 + R() * 80, 'chunk', i === 0 ? '#c98a93' : '#e2d8ce', 0.9 + R() * 0.6, 0); if (q) { q.source = 'grinmask'; q.nopile = true; } }
      this._spurt(e, R() * TAU, 6, 130, '#8a0f1c');
      shardBurst(e.x, e.y, 9, 170);
    }
  };

  /* ---------- world-space extras: tethers, the clutching hand, blood slashes ---------- */
  var oEDraw = E.draw;
  E.draw = function (ctx, cam) {
    var res = oEDraw.apply(this, arguments);
    var hero = CC.state && CC.state.player, tt = this._time;
    for (var i = 0; i < this.list.length; i++) {
      var e = this.list[i];
      if (e.type !== 'grinmask' || e.dead) continue;
      var ex = e.x - cam.x, ey = e.y - cam.y - 8;
      if (ex < -200 || ey < -200 || ex > cam.w + 200 || ey > cam.h + 200) continue;
      ctx.save();
      if (e.trail && e.trail.length && (e.state === 'act' || e.state === 'recover')) { // blood-red slash arcs along the rush
        for (var k = 1; k < e.trail.length; k += 2) {
          var q = e.trail[k], qa = k / e.trail.length;
          ctx.globalAlpha = 0.5 * qa; ctx.strokeStyle = '#d4283c'; ctx.lineWidth = 3; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.arc(q.x - cam.x, q.y - cam.y - 6, 8 + (1 - qa) * 12, e.ang - 1.2, e.ang + 1.2); ctx.stroke();
        }
      }
      if (e.mkGrip && hero) {
        var gp = e.gripP || hero, px = gp.x - cam.x, py = gp.y - cam.y, pulse = 0.5 + 0.5 * Math.sin(tt * 18);
        ctx.shadowColor = '#e8368a'; ctx.shadowBlur = 8; ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(230,60,130,.85)'; ctx.lineWidth = 2.5 + pulse;
        ctx.beginPath(); ctx.moveTo(ex, ey); for (var s = 1; s <= 8; s++) { var u = s / 8; ctx.lineTo(ex + (px - ex) * u + Math.sin(tt * 20 + s * 1.7) * 5 * Math.sin(u * Math.PI), ey + (py - ey) * u + Math.cos(tt * 18 + s) * 4 * Math.sin(u * Math.PI)); } ctx.stroke();
        ctx.shadowBlur = 0;
        // a ghostly hand closing around the hero
        var close = clamp(1 - (e.t || 0) / 2, 0, 1) * 0.5 + 0.35;
        ctx.strokeStyle = 'rgba(255,170,210,.8)'; ctx.lineWidth = 3;
        for (var fng = 0; fng < 5; fng++) {
          var fa = -2.6 + fng * 1.05 + Math.sin(tt * 6 + fng) * 0.05, fr = 20 * (1.25 - 0.5 * close);
          ctx.beginPath(); ctx.moveTo(px + Math.cos(fa) * (fr + 12), py + Math.sin(fa) * (fr + 12) - 4); ctx.quadraticCurveTo(px + Math.cos(fa + 0.5) * fr, py + Math.sin(fa + 0.5) * fr - 4, px + Math.cos(fa + 0.95) * (fr - 4), py + Math.sin(fa + 0.95) * (fr - 4) - 4); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(255,90,140,' + (0.4 + 0.3 * pulse).toFixed(2) + ')'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(px, py - 2, 16 + 4 * pulse, 0, TAU); ctx.stroke();
        for (var sh = 0; sh < 4; sh++) { var sa = tt * 5 + sh * 1.57; ctx.fillStyle = '#ffd4dc'; ctx.save(); ctx.translate(px + Math.cos(sa) * 20, py - 2 + Math.sin(sa) * 11); ctx.rotate(sa); ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(2, 0); ctx.lineTo(0, 4); ctx.lineTo(-2, 0); ctx.closePath(); ctx.fill(); ctx.restore(); }
      }
      ctx.restore();
    }
    return res;
  };

  /* ---------- a screen veil while seized ---------- */
  var Vf = CC.Vfx;
  if (Vf && Vf.drawScreen) {
    var oScreen = Vf.drawScreen;
    Vf.drawScreen = function (c, W, H) {
      oScreen.apply(this, arguments);
      var p = CC.state && CC.state.player;
      if (p && p.psyT > 0 && p.psyPull) {
        var a = 0.28 + 0.1 * Math.sin(performance.now() / 120);
        var g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7);
        g.addColorStop(0, 'rgba(80,0,40,0)'); g.addColorStop(1, 'rgba(170,20,80,' + a.toFixed(2) + ')');
        c.save(); c.fillStyle = g; c.fillRect(0, 0, W, H); c.restore();
      }
    };
  }

  /* ---------- where it lives: the Giant Forest ---------- */
  if (CC.Forest) {
    var oSpawn = E.spawnForFloor;
    E.spawnForFloor = function (floor, points) {
      var res = oSpawn.apply(this, arguments);
      if (!(CC.state && CC.state.area === 'forest' && CC.Forest.map && CC.Dungeon === CC.Forest.map)) return res;
      var sp = CC.Forest.map.spawn || { x: 0, y: 0 }, far = (points || []).slice().sort(function (a, b) { return Math.hypot(b.x - sp.x, b.y - sp.y) - Math.hypot(a.x - sp.x, a.y - sp.y); }), placed = [], i, n = 2;
      for (i = 0; i < far.length && placed.length < n; i++) {
        var pt = far[i];
        if (Math.hypot(pt.x - sp.x, pt.y - sp.y) < 700) break;
        if (placed.some(function (q) { return Math.hypot(q.x - pt.x, q.y - pt.y) < 650; })) continue;
        placed.push(pt);
      }
      placed.forEach(function (pt) { var m = E.spawn('grinmask', pt.x, pt.y, 1); if (m) { m.miniBoss = true; m.cd = 1.2; } });
      return res;
    };
  }
  CC.GrinMask = { stage: stageOf };
})(window);
