/* smokebomb.js - the thief's Smoke Bomb.
 *   TAP:     a smoke cloud on the thief that lasts 5 s (+0.4 s per Reach rank, +0.8 s per Effect rank).
 *   CHARGED: thrown where you aim, 20% bigger and lasting 7 s; it bursts with splash damage in the middle and three knives fly out in different directions.
 * Inside the smoke: foes (not bosses) are blinded and confused: they stumble about at random and cannot attack. The thief gets +7% crit chance (+1% per Effect rank,
 * +0.5% per Power rank), cannot be hurt by melee blows or projectiles (only splash/area damage gets through; boss attacks too), and every hit on a foe in the smoke is a backstab.
 * CC.SmokeBomb: deploy(p,{x,y,charged}), update(dt), drawBack(ctx,cam), drawFront(ctx,cam), inSmoke(e), clear().
 * The smoke itself is a layered, animated cloud: swirling dark and pale billows, rising spiral wisps, a turning ritual circle on the ground, twinkling glints, and
 * dizzy "?" marks circling the confused foes' heads.
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, TAU = Math.PI * 2, zones = [], knives = [], sprites = null, clock = 0, E = CC.Enemies;
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function hero() { var s = CC.state; return s && s.mode === 'dungeon' && s.player && s.player.hp > 0 ? s.player : null; }
  function foes() { return (CC.Enemies && CC.Enemies.list) || []; }
  function alive(e) { return e && !e.dead && e.hp > 0 && !e.collapsed; }
  function immune(e) { return !!(e.boss || e.miniBoss || e.stitched); }
  function ease(u) { return 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3); }
  function rank(p, k) { return CC.Skills && CC.Skills.rank ? CC.Skills.rank(p, 'spell2', k) || 0 : 0; }

  /* ---------- scaling ---------- */
  function stats(p, charged) {
    var rr = rank(p, 'rad'), ef = rank(p, 'eff') + (rank(p, 'ult') ? 2 : 0), pw = rank(p, 'pow');
    return { dur: (charged ? 7 : 5) + 0.4 * rr + 0.8 * ef, rad: (charged ? 74 : 62) * (1 + 0.08 * rr) * (1 + (p.mods && p.mods.aoePct || 0)), crit: 0.07 + 0.01 * ef + 0.005 * pw, dmg: (CC.Skills && CC.Skills.dmgMul ? CC.Skills.dmgMul(p, 'spell2') : 1) };
  }

  /* ---------- cloud sprites: soft irregular billows in three shades ---------- */
  function makeSprites() {
    var shades = [[[28, 22, 48], [10, 8, 22]], [[96, 86, 132], [40, 34, 70]], [[196, 188, 232], [120, 108, 170]]], out = [], s, v, i;
    for (s = 0; s < 3; s++) {
      out[s] = [];
      for (v = 0; v < 3; v++) {
        var cv = document.createElement('canvas'); cv.width = cv.height = 128; var c = cv.getContext('2d');
        for (i = 0; i < 7; i++) {
          var a = rnd(0, TAU), d = i ? rnd(8, 26) : 0, x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d, r = i ? rnd(26, 44) : 52;
          var g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(' + shades[s][0].join(',') + ',0.78)'); g.addColorStop(0.55, 'rgba(' + shades[s][1].join(',') + ',0.36)'); g.addColorStop(1, 'rgba(' + shades[s][1].join(',') + ',0)');
          c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
        }
        out[s].push(cv);
      }
    }
    return out;
  }

  /* ---------- deploying ---------- */
  function deploy(p, o) {
    o = o || {}; if (!p) return null; if (!sprites) sprites = makeSprites();
    var charged = !!o.charged, st = stats(p, charged), x = Number.isFinite(o.x) ? o.x : p.x, y = Number.isFinite(o.y) ? o.y : p.y, i;
    var z = { x: x, y: y, r: st.rad, life: st.dur, max: st.dur, t: 0, charged: charged, crit: st.crit, seed: Math.random() * 100, puffs: [], wisps: [], glints: [] };
    for (i = 0; i < 40; i++) z.puffs.push({ a: rnd(0, TAU), d: Math.sqrt(Math.random()), sz: rnd(0.3, 0.55), spd: rnd(0.25, 0.8) * (i % 2 ? 1 : -1), h: rnd(0, 1), ph: rnd(0, TAU), layer: i < 16 ? 0 : i < 30 ? 1 : 2, v: i % 3 });
    for (i = 0; i < 7; i++) z.wisps.push({ a: rnd(0, TAU), spd: rnd(0.4, 0.9) * (i % 2 ? 1 : -1), ph: rnd(0, TAU), len: rnd(0.7, 1.15) });
    for (i = 0; i < 16; i++) z.glints.push({ a: rnd(0, TAU), d: rnd(0.2, 0.95), ph: rnd(0, TAU), spd: rnd(0.5, 1.4) });
    zones.push(z); if (zones.length > 4) zones.shift();
    if (CC.fx) { if (CC.fx.shake) CC.fx.shake(charged ? 5 : 3); if (CC.fx.burst) CC.fx.burst(x, y, '#8a7ec0', charged ? 22 : 14, 110); }
    if (charged) { // the burst in the middle and three knives flying out in different directions
      var c = CC.Classes, base = rnd(0, TAU), L = foes();
      for (i = 0; i < L.length; i++) { var e = L[i]; if (!alive(e) || e.asleep) continue; var d = Math.hypot(e.x - x, e.y - y); if (d <= st.rad * 0.62 + (e.r || 8) && c && c.hitEnemy) { c.hitEnemy(e, Math.max(1, p.stats.dmg * 1.9 * st.dmg), 'blast', { noCrit: true, attackKind: 'spell', splash: true }); if (!immune(e)) { var dx = e.x - x, dy = e.y - y, dl = Math.hypot(dx, dy) || 1; if (CC.Dungeon && CC.Dungeon.moveWithCollision) CC.Dungeon.moveWithCollision(e, dx / dl * 14, dy / dl * 14); } } }
      for (i = 0; i < 3; i++) knives.push({ x: x, y: y, a: base + i * TAU / 3 + rnd(-0.12, 0.12), spd: 330, life: 0.6, max: 0.6, dmg: p.stats.dmg * 1.3 * st.dmg, spin: rnd(0, TAU), hit: [] });
      if (CC.Audio && CC.Audio.fx) CC.Audio.fx('crunch', { vol: 0.6, gap: 0 });
    }
    if (CC.Audio && CC.Audio.fx) CC.Audio.fx('whoosh', { vol: 0.5, gap: 40 });
    return z;
  }
  function inZone(z, x, y, pad) { var k = ease(z.t / 0.5); return Math.hypot(x - z.x, y - z.y) <= z.r * (0.35 + 0.65 * k) * 0.97 + (pad || 0); }
  function inSmoke(e) { for (var i = 0; i < zones.length; i++) if (zones[i].t < zones[i].max && inZone(zones[i], e.x, e.y, 0)) return true; return false; }

  /* ---------- the effects of the smoke ---------- */
  function update(dt) {
    clock += dt; var p = hero(), i, j;
    if (!(CC.state && CC.state.mode === 'dungeon')) { zones.length = 0; knives.length = 0; return; }
    if (p && p.smokeT > 0) p.smokeT = Math.max(0, p.smokeT - dt);
    for (i = zones.length - 1; i >= 0; i--) {
      var z = zones[i]; z.t += dt; if (z.t >= z.max + 0.9) { zones.splice(i, 1); continue; }
      if (z.t >= z.max) continue; // dissolving: no more effects
      var L = foes();
      for (j = 0; j < L.length; j++) {
        var e = L[j]; if (!alive(e) || e.asleep || !inZone(z, e.x, e.y, e.r || 0)) continue;
        if (!immune(e)) { e.confuseT = 0.5; e.blindT = 0.5; }
        if (CC.Classes && CC.Classes.status) CC.Classes.status(e, 'slow', 0.5, immune(e) ? 0.8 : 0.55);
      }
      if (p && inZone(z, p.x, p.y, 0)) { p.smokeT = 0.25; p.smokeCrit = Math.max(p.smokeCrit || 0, z.crit); }
    }
    for (i = knives.length - 1; i >= 0; i--) {
      var k = knives[i]; k.life -= dt; k.x += Math.cos(k.a) * k.spd * dt; k.y += Math.sin(k.a) * k.spd * dt; k.spin += dt * 22;
      if (k.life <= 0 || (CC.Dungeon && CC.Dungeon.isSolid && CC.Dungeon.isSolid(k.x, k.y))) { knives.splice(i, 1); continue; }
      var F = foes();
      for (j = 0; j < F.length; j++) { var f = F[j]; if (!alive(f) || f.asleep || k.hit.indexOf(f) >= 0) continue; if (Math.hypot(f.x - k.x, f.y - k.y) <= (f.r || 8) + 4) { k.hit.push(f); if (CC.Classes && CC.Classes.hitEnemy) CC.Classes.hitEnemy(f, Math.max(1, k.dmg), 'knife', { attackKind: 'projectile', angle: k.a, color: '#dfe6f2' }); if (CC.fx && CC.fx.burst) CC.fx.burst(k.x, k.y, '#dfe6f2', 5, 70); } }
    }
  }
  // blinded, confused foes stumble about at random and cannot attack (bosses and the Patchwork Horror shrug it off)
  if (E && E._think) {
    var oldThink = E._think;
    E._think = function (e, dt) {
      if (e && e.confuseT > 0 && !immune(e) && alive(e)) {
        e.confuseT -= dt || 0.016; e.wanderT = (e.wanderT || 0) - (dt || 0.016);
        if (e.wanderT <= 0) { e.wanderT = rnd(0.25, 0.65); e.wanderA = rnd(0, TAU); }
        var sp = (e.spd || 60) * 0.7 * (dt || 0.016), D = CC.Dungeon, mx = Math.cos(e.wanderA) * sp, my = Math.sin(e.wanderA) * sp;
        if (D && D.moveWithCollision) D.moveWithCollision(e, mx, my); else { e.x += mx; e.y += my; }
        e.state = 'idle'; e.cd = Math.max(e.cd || 0, 0.6); e.dangerous = false; e.tele = null; if (typeof e.face === 'number') e.face = Math.cos(e.wanderA) >= 0 ? 1 : -1;
        return;
      }
      return oldThink.apply(this, arguments);
    };
  }

  /* ---------- drawing ---------- */
  function puffAt(c, z, pf, R, f, layerAlpha) {
    var a = pf.a + clock * pf.spd * (0.5 + 0.5 * (1 - pf.d)), d = R * pf.d * (0.88 + 0.12 * Math.sin(clock * 0.9 + pf.ph)), s = R * pf.sz * (0.92 + 0.12 * Math.sin(clock * 1.3 + pf.ph)) * 2.2;
    var rise = pf.layer === 0 ? 0 : pf.h * R * 0.34 + Math.sin(clock * 1.1 + pf.ph) * 3, px = z.x + Math.cos(a) * d, py = z.y + Math.sin(a) * d * 0.62 - rise;
    c.globalAlpha = Math.max(0, layerAlpha * f * (0.55 + 0.45 * Math.sin(clock * 0.8 + pf.ph * 2)));
    c.drawImage(sprites[pf.layer][pf.v], px - s / 2, py - s / 2, s, s);
  }
  function drawBack(c, cam) {
    if (!zones.length) return; if (!sprites) sprites = makeSprites();
    c.save(); c.translate(-cam.x, -cam.y);
    for (var zi = 0; zi < zones.length; zi++) {
      var z = zones[zi], k = ease(z.t / 0.5), R = z.r * (0.35 + 0.65 * k), f = z.t > z.max ? Math.max(0, 1 - (z.t - z.max) / 0.9) : 1, i;
      // the ground: a dark pool and a turning ritual circle of knives
      var gg = c.createRadialGradient(z.x, z.y + 3, 0, z.x, z.y + 3, R * 1.1); gg.addColorStop(0, 'rgba(8,6,20,' + 0.62 * f + ')'); gg.addColorStop(0.7, 'rgba(14,10,32,' + 0.4 * f + ')'); gg.addColorStop(1, 'rgba(14,10,32,0)');
      c.fillStyle = gg; c.beginPath(); c.ellipse(z.x, z.y + 3, R * 1.1, R * 0.7, 0, 0, TAU); c.fill();
      c.save(); c.translate(z.x, z.y + 3); c.scale(1, 0.58); c.globalCompositeOperation = 'lighter';
      c.strokeStyle = 'rgba(150,120,255,' + 0.55 * f + ')'; c.lineWidth = 1.6; c.setLineDash([9, 6]); c.lineDashOffset = -clock * 22; c.beginPath(); c.arc(0, 0, R * 0.9, 0, TAU); c.stroke();
      c.setLineDash([]); c.strokeStyle = 'rgba(210,190,255,' + 0.4 * f + ')'; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, R * 0.74, 0, TAU); c.stroke();
      c.rotate(clock * 0.5); c.strokeStyle = 'rgba(180,150,255,' + 0.5 * f + ')'; c.lineWidth = 1.2;
      for (i = 0; i < 3; i++) { var ra = i * TAU / 3; c.beginPath(); c.moveTo(Math.cos(ra) * R * 0.74, Math.sin(ra) * R * 0.74); c.lineTo(Math.cos(ra + 2.094) * R * 0.74, Math.sin(ra + 2.094) * R * 0.74); c.stroke(); c.save(); c.translate(Math.cos(ra) * R * 0.9, Math.sin(ra) * R * 0.9); c.rotate(ra); c.beginPath(); c.moveTo(-4, 0); c.lineTo(4, -2); c.lineTo(4, 2); c.closePath(); c.fillStyle = 'rgba(210,190,255,' + 0.7 * f + ')'; c.fill(); c.restore(); }
      c.restore();
      // the dark body of the cloud, swirling
      c.save(); c.globalCompositeOperation = 'source-over';
      for (i = 0; i < z.puffs.length; i++) if (z.puffs[i].layer === 0) puffAt(c, z, z.puffs[i], R, f, 0.9);
      c.restore(); c.globalAlpha = 1;
    }
    c.restore();
  }
  function star(c, x, y, s) { c.beginPath(); c.moveTo(x, y - s); c.lineTo(x + s * 0.22, y - s * 0.22); c.lineTo(x + s, y); c.lineTo(x + s * 0.22, y + s * 0.22); c.lineTo(x, y + s); c.lineTo(x - s * 0.22, y + s * 0.22); c.lineTo(x - s, y); c.lineTo(x - s * 0.22, y - s * 0.22); c.closePath(); c.fill(); }
  function drawFront(c, cam) {
    if (!zones.length && !knives.length) return; if (!sprites) sprites = makeSprites();
    c.save(); c.translate(-cam.x, -cam.y); var p = hero(), zi, i, j;
    for (zi = 0; zi < zones.length; zi++) {
      var z = zones[zi], k = ease(z.t / 0.5), R = z.r * (0.35 + 0.65 * k), f = z.t > z.max ? Math.max(0, 1 - (z.t - z.max) / 0.9) : 1;
      // pale billows over the top, lighter so everyone inside stays visible
      for (i = 0; i < z.puffs.length; i++) { var pf = z.puffs[i]; if (pf.layer > 0) puffAt(c, z, pf, R, f, pf.layer === 1 ? 0.5 : 0.32); }
      c.globalAlpha = 1;
      // spiral wisps rising off the cloud
      c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
      for (i = 0; i < z.wisps.length; i++) {
        var w = z.wisps[i], steps = 14, prevX = 0, prevY = 0;
        for (j = 0; j <= steps; j++) {
          var u = j / steps, aa = w.a + clock * w.spd + u * 2.6 * (w.spd > 0 ? 1 : -1), dd = R * (0.25 + 0.6 * (1 - u * 0.5)) * (0.9 + 0.1 * Math.sin(clock + w.ph)), wx = z.x + Math.cos(aa) * dd, wy = z.y + Math.sin(aa) * dd * 0.62 - u * R * 0.7 * w.len;
          if (j) { c.strokeStyle = 'rgba(176,156,255,' + (0.34 * (1 - u) * f) + ')'; c.lineWidth = 3.4 * (1 - u) + 0.5; c.beginPath(); c.moveTo(prevX, prevY); c.lineTo(wx, wy); c.stroke(); }
          prevX = wx; prevY = wy;
        }
      }
      // glow, halo and twinkling glints
      var cg = c.createRadialGradient(z.x, z.y - R * 0.1, 0, z.x, z.y - R * 0.1, R); cg.addColorStop(0, 'rgba(160,120,255,' + (0.2 + 0.08 * Math.sin(clock * 2)) * f + ')'); cg.addColorStop(1, 'rgba(120,80,220,0)');
      c.fillStyle = cg; c.beginPath(); c.ellipse(z.x, z.y - R * 0.1, R, R * 0.7, 0, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(190,170,255,' + (0.3 + 0.15 * Math.sin(clock * 3)) * f + ')'; c.lineWidth = 2; c.beginPath(); c.ellipse(z.x, z.y, R * (0.98 + 0.02 * Math.sin(clock * 3)), R * 0.64, 0, 0, TAU); c.stroke();
      for (i = 0; i < z.glints.length; i++) { var gl = z.glints[i], tw = Math.max(0, Math.sin(clock * gl.spd * 4 + gl.ph)), ga = gl.a + clock * 0.3 * gl.spd; if (tw > 0.2) { c.fillStyle = 'rgba(235,225,255,' + tw * 0.9 * f + ')'; star(c, z.x + Math.cos(ga) * R * gl.d, z.y + Math.sin(ga) * R * gl.d * 0.62 - 4 - (1 - gl.d) * R * 0.2, 1.5 + tw * 2.2); } }
      if (z.t < 0.3) { var sw = z.t / 0.3; c.strokeStyle = 'rgba(255,255,255,' + 0.85 * (1 - sw) + ')'; c.lineWidth = 3 * (1 - sw) + 1; c.beginPath(); c.ellipse(z.x, z.y, z.r * 1.35 * sw + 4, z.r * 1.35 * sw * 0.64 + 3, 0, 0, TAU); c.stroke(); c.fillStyle = 'rgba(200,180,255,' + 0.25 * (1 - sw) + ')'; c.fill(); }
      c.restore();
      // dizzy marks round the heads of confused foes inside
      if (z.t < z.max) {
        var L = foes();
        for (i = 0; i < L.length; i++) {
          var e = L[i]; if (!alive(e) || !(e.confuseT > 0) || immune(e) || !inZone(z, e.x, e.y, e.r || 0)) continue;
          var hy = e.y - (e.r || 8) - 12;
          c.save(); c.font = 'bold 9px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
          for (j = 0; j < 3; j++) { var oa = clock * 4 + j * TAU / 3, ox = e.x + Math.cos(oa) * 9, oy = hy + Math.sin(oa) * 3.2; c.globalAlpha = 0.55 + 0.45 * Math.sin(oa + 1); c.lineWidth = 2.4; c.strokeStyle = 'rgba(30,10,60,0.9)'; c.strokeText(j === 1 ? '*' : '?', ox, oy); c.fillStyle = j === 1 ? '#ffe27a' : '#d9c4ff'; c.fillText(j === 1 ? '*' : '?', ox, oy); }
          c.restore();
        }
        if (p && inZone(z, p.x, p.y, 0)) { // the thief in the smoke: a faint shimmering veil
          c.save(); c.globalCompositeOperation = 'lighter'; var sh = 0.35 + 0.2 * Math.sin(clock * 6); c.strokeStyle = 'rgba(190,160,255,' + sh + ')'; c.lineWidth = 1.4; c.beginPath(); c.ellipse(p.x, p.y - 4, 15 + Math.sin(clock * 4), 20, 0, 0, TAU); c.stroke();
          c.strokeStyle = 'rgba(255,255,255,' + sh * 0.6 + ')'; c.beginPath(); c.arc(p.x, p.y - 4, 13, clock * 2, clock * 2 + 1.4); c.stroke(); c.restore();
        }
      }
    }
    // the three knives of the charged bomb: spinning silver blades with a streak behind
    for (i = 0; i < knives.length; i++) {
      var kn = knives[i];
      c.save(); c.translate(kn.x, kn.y); c.globalCompositeOperation = 'lighter'; var tl = c.createLinearGradient(0, 0, -Math.cos(kn.a) * 30, -Math.sin(kn.a) * 30); tl.addColorStop(0, 'rgba(220,230,255,0.7)'); tl.addColorStop(1, 'rgba(160,140,255,0)'); c.strokeStyle = tl; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, 0); c.lineTo(-Math.cos(kn.a) * 30, -Math.sin(kn.a) * 30); c.stroke(); c.globalCompositeOperation = 'source-over';
      c.rotate(kn.a + kn.spin * 0.0); c.rotate(Math.sin(kn.spin) * 0.15); c.fillStyle = '#e8eef8'; c.beginPath(); c.moveTo(9, 0); c.lineTo(-3, -2.6); c.lineTo(-6, 0); c.lineTo(-3, 2.6); c.closePath(); c.fill(); c.fillStyle = '#7a5aa8'; c.fillRect(-9, -1.2, 4, 2.4); c.fillStyle = 'rgba(255,255,255,0.8)'; c.fillRect(1, -0.8, 5, 0.9);
      c.restore();
    }
    c.restore();
  }
  function clear() { zones.length = 0; knives.length = 0; }
  CC.SmokeBomb = { deploy: deploy, update: update, drawBack: drawBack, drawFront: drawFront, inSmoke: inSmoke, clear: clear, zones: function () { return zones; }, stats: stats };
})(window);
