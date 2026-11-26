/* CC.CinderwakeMonsters - the four monsters and the boss of the Cinderwake, the furnace-dark area under the ruined chapel.
 *
 *   Soot Wretch  (sootwretch)    A villager the furnace kept warm until only soot was left. Slow; each swing leaves an ash puddle that burns for 6s.
 *   Ember Moth   (embermoth)     A fast, erratic flier that comes in groups of three; it bursts into a small blast when it dies (and singles out its friends).
 *   Slag Crawler (slagcrawler)   Armoured, low and wide; lobs molten globs that land as a burning patch. Burst damage (big single hits) cracks the armour.
 *   Candlewraith (candlewraith)  A ghost with a lit candle that heals every monster near it while the candle burns. It keeps its distance; the candle
 *                                gutters when it is badly hurt and goes out when it dies.
 *   The Hearthkeeper (hearthkeeper)  Warden Halric Vane, fused to the furnace door. Ember rings with a gap that turns, a ledger slam, then a charge
 *                                that leaves burning ash and exposes his coal for 2s, moth summons below 60%, and "the Collection" below 30%.
 * Registered like the Rocky Pass monsters (TYPES weight 0, brain through the E._think chain, art through the forest's drawMonster hook, death
 * effects through the E.damage chain). The Hearthkeeper is a miniBoss (no E.boss / boss bar here: the area shell can set one if it wants).
 * Spawn rule: in the 'cinderwake' area spawn points carry a `type`; moths wake as a group of three.
 * Design: emberdeep_cinderwake.md.
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, E = CC.Enemies, F = CC.Forest, PI2 = Math.PI * 2, CW = CC.CinderwakeMonsters = { puddles: [] };
  if (!E || !E.TYPES || E.TYPES.sootwretch) return;
  function R() { return Math.random(); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mv(e, dx, dy) { var D = CC.Dungeon, r = D && D.moveWithCollision ? D.moveWithCollision(e, dx, dy) : (e.x += dx, e.y += dy, null); return !!(r && (r.hitX || r.hitY)); }
  function hurt(p, e, amt) {
    if (!p || p.hp <= 0 || p.invuln > 0) return 0;
    var dmg = Math.max(1, Math.round(amt * 100 / (100 + (p.armor || 0))));
    p.hp -= dmg; p.invuln = 0.45; p.hurtFlash = 0.2;
    if (CC.fx) { if (CC.fx.shake) CC.fx.shake(3); if (CC.fx.text) CC.fx.text(p.x, p.y - 14, '-' + dmg, '#ff9a3a', 12); }
    return dmg;
  }
  function fxb(x, y, c, n, sp) { if (CC.fx && CC.fx.burst) CC.fx.burst(x, y, c, n, sp); }
  function shake(n) { if (CC.fx && CC.fx.shake) CC.fx.shake(n); }
  function say(e, s, col) { if (CC.fx && CC.fx.text) CC.fx.text(e.x, e.y - e.r - 24, s, col || '#ffb04a', 10); }

  E.TYPES.sootwretch = { name: 'Soot Wretch', hp: 44, spd: 40, dmg: 10, r: 11, xp: 16, color: '#3a3330', w: 0, telRad: 50, blood: '#2a2320' };
  E.TYPES.embermoth = { name: 'Ember Moth', hp: 8, spd: 108, dmg: 5, r: 6, xp: 4, color: '#d8782a', w: 0, fire: true, blood: '#ff9a3a' };
  E.TYPES.slagcrawler = { name: 'Slag Crawler', hp: 52, spd: 46, dmg: 11, r: 12, xp: 22, color: '#5a3a30', w: 0, armored: true, fire: true, blood: '#ff7a1a' };
  E.TYPES.candlewraith = { name: 'Candlewraith', hp: 18, spd: 56, dmg: 6, r: 9, xp: 20, color: '#c8c0b8', w: 0, ghost: true, blood: '#e8d8b0' };
  E.TYPES.hearthkeeper = { name: 'The Hearthkeeper', hp: 420, spd: 44, dmg: 15, r: 20, xp: 240, color: '#2a2426', w: 0, telRad: 70, fire: true, bone: true, blood: '#ff7a1a' };

  /* ---------- ash puddles: a ring decal (a projectile with `ring`) plus our own damage tick ---------- */
  function puddle(x, y, rad, life, dmg) {
    if (CW.puddles.length >= 18) CW.puddles.shift();
    CW.puddles.push({ x: x, y: y, rad: rad, t: life, tick: 0, dmg: dmg });
  }
  function drawPuddles(ctx, cam) { // persistent ground hazards are drawn here: the engine's ring effect only supports a 0.35s life
    var i, q, sx, sy, u;
    for (i = 0; i < CW.puddles.length; i++) {
      q = CW.puddles[i]; sx = q.x - cam.x; sy = q.y - cam.y; u = clamp(q.t / 1.5, 0, 1);
      ctx.save(); ctx.globalAlpha = 0.55 * u;
      ctx.fillStyle = '#2a2220'; ctx.beginPath(); ctx.ellipse(sx, sy, Math.max(1, q.rad), Math.max(1, q.rad * 0.6), 0, 0, PI2); ctx.fill();
      ctx.globalAlpha = 0.35 * u; ctx.strokeStyle = '#ff8a2a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(sx, sy, Math.max(1, q.rad * 0.8), Math.max(1, q.rad * 0.48), 0, 0, PI2); ctx.stroke();
      ctx.restore();
    }
  }
  function tickPuddles(dt) {
    var p = CC.state && CC.state.player, i, q;
    for (i = CW.puddles.length - 1; i >= 0; i--) {
      q = CW.puddles[i];
      if ((q.t -= dt) <= 0) { CW.puddles.splice(i, 1); continue; }
      if (R() < dt * 2) fxb(q.x + (R() - 0.5) * q.rad, q.y + (R() - 0.5) * q.rad, '#ff9a3a', 1, 18);
      if (p && p.hp > 0 && Math.hypot(p.x - q.x, p.y - q.y) < q.rad && (q.tick -= dt) <= 0) { q.tick = 0.5; hurt(p, null, q.dmg); }
    }
  }

  /* ---------- brains (this = E; same signature as the other area monsters) ---------- */
  function lob(e, p, dmg) { // a visible molten glob travels to where the player stood and lands as a burning patch (see the E.update hook)
    var dx = p.x - e.x, dy = p.y - e.y, dist = Math.hypot(dx, dy) || 1, spd = 150, q;
    E._shoot(e, Math.atan2(dy, dx), spd, dmg, '#ff7a1a', 'glob', Math.min(dist / spd, 2.2));
    q = E.projectiles[E.projectiles.length - 1]; q.r = 7; q.glob = true; q.owner = e;
    fxb(e.x, e.y - 4, '#ff7a1a', 6, 70);
  }
  function landGlobs(dt) { // a glob that reaches the end of its flight splashes into a patch (a direct hit is handled by the engine)
    var i, q;
    for (i = 0; i < E.projectiles.length; i++) {
      q = E.projectiles[i];
      if (!q.glob) continue;
      if (R() < dt * 30) fxb(q.x, q.y, '#ff7a1a', 1, 14); // a trail of drips
      if (q.life <= dt * 1.5) { q.glob = false; q.life = 0; E._zone(q.x, q.y, 34, 0.5, q.dmg * 0.75, q.owner, 'blast'); fxb(q.x, q.y, '#ff7a1a', 10, 80); }
    }
  }
  function ring(e, n, spd, dmg, gapIdx) {
    var base = R() * 0.2;
    for (var i = 0; i < n; i++) if (i !== gapIdx) E._shoot(e, base + i * PI2 / n, spd, dmg, '#ff8a2a', 'orb', 2.6);
  }
  function mothCount() { var n = 0; for (var i = 0; i < E.list.length; i++) if (E.list[i].type === 'embermoth' && !E.list[i].dead) n++; return n; }

  var BRAIN = {
    sootwretch: function (e, dt, p, d, ang, f, sp) {
      if (e.state === 'idle') {
        if (d > 40) mv(e, Math.cos(ang) * sp, Math.sin(ang) * sp);
        if (R() < dt * 3) fxb(e.x, e.y - 2, '#2a2320', 1, 20); // soot sifts off it
        if (e.cd <= 0 && d < 64) this._tele(e, 'slam', 0.6, ang);
      } else if (e.state === 'telegraph') {
        if ((e.t -= dt) <= 0) {
          e.tele = null; e.state = 'act'; e.t = 0.3;
          var sx = e.x + Math.cos(ang) * 30, sy = e.y + Math.sin(ang) * 30;
          fxb(sx, sy, '#3a3330', 12, 90); shake(3);
          if (Math.hypot(p.x - sx, p.y - sy) < 40 + (p.r || 8)) hurt(p, e, e.dmg * 1.1);
          puddle(sx, sy, 38, 6, e.dmg * 0.2); // lingers 6s
        }
      } else if (e.state === 'act') { e.dangerous = d < e.r + 40; if ((e.t -= dt) <= 0) { e.state = 'recover'; e.t = 0.7; e.dangerous = false; } }
      else if (e.state === 'recover') { if ((e.t -= dt) <= 0) { e.state = 'idle'; e.cd = 1.1 + R() * 0.8; } }
      else e.state = 'idle';
    },
    embermoth: function (e, dt, p, d, ang, f, sp) {
      // erratic flutter: the heading wobbles hard, and it closes in a spiral
      var wob = Math.sin(e.anim * 7 + (e.id || 0)) * 1.1, a = ang + wob * (d > 60 ? 0.6 : 1.2);
      mv(e, Math.cos(a) * sp, Math.sin(a) * sp);
      if (R() < dt * 6) fxb(e.x, e.y, '#ff9a3a', 1, 16);
    },
    slagcrawler: function (e, dt, p, d, ang, f, sp) {
      if (e.state === 'idle') {
        if (d > 190) mv(e, Math.cos(ang) * sp, Math.sin(ang) * sp);
        else if (d < 110) mv(e, -Math.cos(ang) * sp * 0.6, -Math.sin(ang) * sp * 0.6);
        else mv(e, Math.cos(ang + 1.57 * e.strafe) * sp * 0.4, Math.sin(ang + 1.57 * e.strafe) * sp * 0.4);
        if (e.cd <= 0 && d < 280 && e.los !== false) this._tele(e, 'spit', 0.6, ang);
      } else if (e.state === 'telegraph') {
        if ((e.t -= dt) <= 0) { e.tele = null; e.state = 'recover'; e.t = 0.6; lob(e, p, e.dmg * 0.8); }
      } else if (e.state === 'recover') { if ((e.t -= dt) <= 0) { e.state = 'idle'; e.cd = 1.8 + R() * 0.8; e.strafe = R() < 0.5 ? 1 : -1; } }
      else e.state = 'idle';
      if (R() < dt * 2) fxb(e.x, e.y + 4, '#ff7a1a', 1, 14); // cooling slag drips
    },
    candlewraith: function (e, dt, p, d, ang, f, sp) {
      var lit = e.hp > e.maxHp * 0.35; e.candle = lit;
      e.heal = (e.heal || 0) - dt;
      if (lit && e.heal <= 0) { // the candle mends everything near it, except the dead and itself
        e.heal = 0.5;
        for (var i = 0; i < E.list.length; i++) {
          var o = E.list[i];
          if (o === e || o.dead || o.hp >= o.maxHp || Math.hypot(o.x - e.x, o.y - e.y) > 120) continue;
          o.hp = Math.min(o.maxHp, o.hp + 1.5); if (R() < 0.4) fxb(o.x, o.y - o.r, '#ffe08a', 1, 14);
        }
      }
      if (e.state === 'idle') {
        var ta = d < 100 ? ang + Math.PI : d > 170 ? ang : ang + 1.57 * e.strafe, k = d < 100 || d > 170 ? 1 : 0.5;
        mv(e, Math.cos(ta) * sp * k, Math.sin(ta) * sp * k);
        if (e.cd <= 0 && d < 240 && e.los !== false) this._tele(e, 'wail', 0.7, ang);
      } else if (e.state === 'telegraph') {
        if ((e.t -= dt) <= 0) { e.tele = null; e.state = 'recover'; e.t = 0.5; E._shoot(e, ang, 130, e.dmg, '#ffe08a', 'orb', 2); }
      } else if (e.state === 'recover') { if ((e.t -= dt) <= 0) { e.state = 'idle'; e.cd = 2.2 + R() * 1.2; e.strafe = R() < 0.5 ? 1 : -1; } }
      else e.state = 'idle';
    },
    hearthkeeper: function (e, dt, p, d, ang, f, sp) {
      var fr = e.hp / e.maxHp, ph = fr < 0.3 ? 3 : fr < 0.6 ? 2 : 1;
      if (e.exposed > 0) e.exposed -= dt;
      e.phase = ph; e.summonT = (e.summonT === undefined ? 6 : e.summonT) - dt; e.seamT = (e.seamT === undefined ? 3 : e.seamT) - dt;
      if (R() < dt * 4) fxb(e.x + (R() - 0.5) * e.r, e.y - e.r * 0.2, '#ff9a3a', 1, 24); // embers from the coal
      if (ph >= 2 && e.summonT <= 0 && mothCount() < 6) { // the summon phase: three moths every 12s
        e.summonT = 12; say(e, 'THE BOOK MUST BALANCE', '#ffb04a'); shake(4);
        for (var k = 0; k < 3; k++) { var m = E.spawn('embermoth', e.x + Math.cos(k * 2.1) * 40, e.y + Math.sin(k * 2.1) * 40, e.floor || 1, { awake: true }); m.asleep = false; m.group = 9500; }
      }
      if (ph === 3 && e.seamT <= 0 && e.state !== 'act') { // the Collection: ember seams open in the floor around the player
        e.seamT = 2.2;
        for (var s = 0; s < 3; s++) E._zone(p.x + (R() - 0.5) * 150, p.y + (R() - 0.5) * 150, 30, 1.0, e.dmg * 0.7, e, 'blast');
      }
      if (e.state === 'idle') {
        if (d > 52) mv(e, Math.cos(ang) * sp, Math.sin(ang) * sp);
        if (e.cd <= 0) {
          e.n = (e.n || 0) + 1;
          if (d < 80) this._tele(e, 'slam', 0.9, ang);
          else if (ph >= 2 && e.n % 3 === 0) { this._tele(e, 'charge', 0.8, ang); e.tele = { kind: 'line', ang: ang, len: 260, max: 0.8 }; }
          else this._tele(e, 'ring', 0.8, ang);
        }
      } else if (e.state === 'telegraph') {
        if ((e.t -= dt) <= 0) {
          e.tele = null;
          if (e.atk === 'slam') {
            e.state = 'act'; e.t = 0.4; shake(8); fxb(e.x, e.y + 4, '#ff7a1a', 22, 140);
            if (d < (e.telRad || 70) + (p.r || 8) && hurt(p, e, e.dmg * 1.2)) mv(p, Math.cos(ang) * 24, Math.sin(ang) * 24);
            E.projectiles.push({ x: e.x, y: e.y, vx: 0, vy: 0, r: 0, life: 0.35, ring: e.telRad || 70, color: '#ff9a3a', fx: true }); // the engine's ring effect is 0.35s long
          } else if (e.atk === 'charge') { e.state = 'act'; e.t = 0.6; e.dash = true; }
          else { // the ember ring: 12 shots (14 in phase 3) with a gap that turns each cast
            e.state = 'recover'; e.t = 0.7; e.gap = ((e.gap === undefined ? -1 : e.gap) + 3) % 12;
            ring(e, ph === 3 ? 14 : 12, 105, e.dmg * 0.6, ph === 3 ? -1 : e.gap); shake(3); fxb(e.x, e.y, '#ff9a3a', 14, 100);
          }
        }
      } else if (e.state === 'act') {
        if (e.dash) { // the charge leaves burning ash behind it
          mv(e, Math.cos(e.ang) * 300 * f * dt, Math.sin(e.ang) * 300 * f * dt); e.dangerous = true;
          e.trailT = (e.trailT || 0) - dt; if (e.trailT <= 0) { e.trailT = 0.12; puddle(e.x, e.y, 26, 4, e.dmg * 0.15); }
          if (d < e.r + 14) hurt(p, e, e.dmg * 1.3);
        } else e.dangerous = d < e.r + 40;
        if ((e.t -= dt) <= 0) {
          e.state = 'recover'; e.dangerous = false;
          if (e.dash) { e.dash = false; e.exposed = 2; e.t = 1.4; say(e, 'THE COAL', '#fff4b0'); } else e.t = 0.9; // the coal in his chest is bare for 2s
        }
      } else if (e.state === 'recover') { if ((e.t -= dt) <= 0) { e.state = 'idle'; e.cd = (ph === 3 ? 0.6 : ph === 2 ? 1.0 : 1.4) + R() * 0.6; } }
      else e.state = 'idle';
    }
  };
  var prevThink = E._think;
  E._think = function (e, dt, p, d, ang, f) {
    var fn = BRAIN[e.type];
    if (!fn) return prevThink.apply(this, arguments);
    e.cd -= dt; e.dangerous = false;
    fn.call(this, e, dt, p, d, ang, f, e.spd * f * dt);
  };

  /* ---------- damage rules and death effects ---------- */
  function died(e) { // runs once per monster, from the shared E._kill path (direct hits and burn deaths both end there)
    if (e._cwDied) return; e._cwDied = true;
    if (e.type === 'embermoth' && !e._blasted) {
      e._blasted = true; E._blast(e.x, e.y, 40, e.dmg * 1.2); fxb(e.x, e.y, '#ff9a3a', 14, 110);
      for (var i = 0; i < E.list.length; i++) { var o = E.list[i]; if (o !== e && !o.dead && o.type !== 'hearthkeeper' && Math.hypot(o.x - e.x, o.y - e.y) < 44) E.damage(o, 6, 'fire'); } // it singes its friends
    } else if (e.type === 'candlewraith') { e.candle = false; say(e, 'the candle goes out', '#e8d8b0'); }
    else if (e.type === 'hearthkeeper') { CW.puddles.length = 0; shake(10); say(e, 'The book... does not balance.', '#ffb04a'); }
  }
  var prevDamage = E.damage;
  E.damage = function (e, amount, type) {
    if (!e || e.dead) return prevDamage.apply(this, arguments);
    if (e.type === 'slagcrawler' && (type === 'burst' || amount >= 18)) amount *= 1.5; // burst damage cracks the slag armour (armour cuts normal hits by 35%)
    if (e.type === 'hearthkeeper' && e.exposed > 0) amount *= 1.5; // the bared coal
    return prevDamage.call(this, e, amount, type);
  };
  var prevKill = E._kill;
  E._kill = function (e) { // burn damage calls _kill directly, so the death effects hang here rather than on E.damage
    var wasDead = !!(e && e.dead), r = prevKill.apply(this, arguments);
    if (e && e.dead && !wasDead) died(e);
    return r;
  };
  var prevSpawnOne = E.spawn;
  E.spawn = function (type) {
    var e = prevSpawnOne.apply(this, arguments);
    if (type === 'hearthkeeper') e.miniBoss = true; // the generic spurt/special AI stays off; the brain above runs it
    return e;
  };
  var prevUpdate = E.update;
  E.update = function (dt) { landGlobs(dt); var r = prevUpdate.apply(this, arguments); tickPuddles(dt); return r; };
  var prevEDraw = E.draw;
  E.draw = function (ctx, cam) { if (CW.puddles.length && cam) drawPuddles(ctx, cam); return prevEDraw.apply(this, arguments); };

  /* ---------- spawning in the Cinderwake ---------- */
  var prevSpawn = E.spawnForFloor;
  E.spawnForFloor = function (floor, points) {
    if (!(CC.state && CC.state.area === 'cinderwake')) return prevSpawn.apply(this, arguments);
    this.list.length = 0; this.projectiles.length = 0; this.boss = null; this.zones = []; this.remains = []; if (this.gore) this.gore = [];
    CW.puddles.length = 0;
    if (CC.Loot && CC.Loot.clear) CC.Loot.clear();
    var grp = 9100, lvl = 3 + (floor || 1), i, k, e, pt;
    for (i = 0; i < points.length; i++) {
      pt = points[i];
      if (pt.type === 'embermoth') { grp++; for (k = 0; k < 3; k++) { e = this.spawn('embermoth', pt.x + (R() - 0.5) * 40, pt.y + (R() - 0.5) * 40, lvl); e.group = grp; } }
      else this.spawn(pt.type, pt.x, pt.y, lvl);
    }
    return this.list;
  };

  /* ---------- art (ctx is at the monster, +x = facing; the shell already mirrored it) ---------- */
  function ember(ctx, x, y, rr, a) { ctx.save(); ctx.shadowColor = '#ff7a1a'; ctx.shadowBlur = 8; ctx.fillStyle = 'rgba(255,170,60,' + a + ')'; ctx.beginPath(); ctx.arc(x, y, rr, 0, PI2); ctx.fill(); ctx.restore(); }
  function seam(ctx, pts, w, a) {
    ctx.save(); ctx.shadowColor = '#ff7a1a'; ctx.shadowBlur = 5; ctx.strokeStyle = '#ffa040'; ctx.globalAlpha = a; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.stroke(); ctx.restore();
  }
  var DRAW = {
    sootwretch: function (ctx, e, r, col, dark, t) { // a hunched, sagging figure of soot with two ember eyes and glowing cracks
      var an = e.anim, tele = e.state === 'telegraph', act = e.state === 'act', k, bob = Math.sin(an * 3) * 1.4, raise = tele ? -r * 0.9 : act ? r * 0.5 : 0;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, r * 0.95, r * 0.9, r * 0.3, 0, 0, PI2); ctx.fill();
      ctx.fillStyle = dark; for (k = -1; k <= 1; k += 2) ctx.fillRect(k * r * 0.4 - 2.5, r * 0.4, 5, r * 0.55); // stumpy legs
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, bob, r * 0.8, r * 0.95, 0, 0, PI2); ctx.fill(); // sagging body
      ctx.fillStyle = 'rgba(90,76,68,0.55)'; ctx.beginPath(); ctx.ellipse(-r * 0.2, -r * 0.3 + bob, r * 0.35, r * 0.25, 0, 0, PI2); ctx.fill();
      for (k = 0; k < 3; k++) { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(-r * 0.4 + k * r * 0.4, r * 0.85 + (k % 2) * 2, 3, 5, 0, 0, PI2); ctx.fill(); } // drips of soot
      seam(ctx, [-r * 0.2, -r * 0.1 + bob, 0, r * 0.2 + bob, r * 0.3, r * 0.05 + bob], 1, 0.4 + 0.3 * Math.sin(t * 3 + an)); // a seam of ember inside
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(r * 0.3, -r * 0.2 + raise); ctx.lineTo(r * 1.25, r * 0.2 + raise * 0.5 + (act ? r * 0.5 : 0)); ctx.lineTo(r * 0.9, r * 0.55 + raise * 0.4); ctx.lineTo(r * 0.2, r * 0.3); ctx.closePath(); ctx.fill(); // the heavy arm
      ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(r * 1.1, r * 0.3 + raise * 0.5 + (act ? r * 0.5 : 0), r * 0.32, 0, PI2); ctx.fill();
      ctx.fillStyle = tele ? '#fff4b0' : '#ff9a3a'; ctx.fillRect(r * 0.1, -r * 0.55 + bob, 3, 2.4); ctx.fillRect(r * 0.45, -r * 0.55 + bob, 3, 2.4); // eyes
    },
    embermoth: function (ctx, e, r, col, dark, t) { // a small furred body, ember-lit wings that beat too fast to follow
      var an = e.anim, beat = Math.sin(an * 30) * 0.8, k;
      ctx.save(); ctx.shadowColor = '#ff7a1a'; ctx.shadowBlur = 10;
      for (k = -1; k <= 1; k += 2) {
        ctx.fillStyle = 'rgba(214,120,42,0.85)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(k * r * 1.9, -r * (0.9 + beat)); ctx.lineTo(k * r * 1.5, r * (0.4 - beat * 0.3)); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,208,110,0.6)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(k * r * 1.2, -r * (0.55 + beat * 0.6)); ctx.lineTo(k * r * 1.0, r * 0.15); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = '#4a3226'; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.55, r * 0.85, 0, 0, PI2); ctx.fill(); // the body
      ctx.strokeStyle = '#7a5a3a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(r * 0.2, -r * 0.8); ctx.lineTo(r * 0.5, -r * 1.3); ctx.moveTo(-r * 0.1, -r * 0.8); ctx.lineTo(-r * 0.2, -r * 1.3); ctx.stroke(); // feelers
      ember(ctx, r * 0.2, -r * 0.3, 1.4, 0.9);
    },
    slagcrawler: function (ctx, e, r, col, dark, t) { // a low, wide shell of cooled slag on six legs, glowing in the seams, with a spitting maw
      var an = e.anim, tele = e.state === 'telegraph', k, hot = tele ? 1 : 0.4 + 0.2 * Math.sin(t * 3 + an);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, r * 0.7, r * 1.2, r * 0.3, 0, 0, PI2); ctx.fill();
      ctx.strokeStyle = dark; ctx.lineWidth = 2.2; ctx.beginPath(); for (k = 0; k < 3; k++) { var ph = Math.sin(an * 5 + k * 2.1) * 3, lx = -r * 0.7 + k * r * 0.7; ctx.moveTo(lx, r * 0.2); ctx.lineTo(lx - 4, r * 0.8 + ph); ctx.moveTo(lx, r * 0.2); ctx.lineTo(lx + 4, r * 0.8 - ph); } ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.15, r * 0.7, 0, Math.PI, 0); ctx.lineTo(r * 1.15, r * 0.25); ctx.lineTo(-r * 1.15, r * 0.25); ctx.closePath(); ctx.fill(); // the shell
      ctx.fillStyle = '#7a5242'; ctx.beginPath(); ctx.ellipse(-r * 0.2, -r * 0.35, r * 0.7, r * 0.25, -0.1, 0, PI2); ctx.fill();
      seam(ctx, [-r * 0.9, -r * 0.05, -r * 0.4, -r * 0.3, 0, -r * 0.05, r * 0.5, -r * 0.35, r * 0.95, -r * 0.05], 1.4, hot);
      ctx.fillStyle = '#1a1210'; ctx.beginPath(); ctx.ellipse(r * 1.0, r * 0.05, r * 0.32, r * (tele ? 0.4 : 0.22), 0, 0, PI2); ctx.fill(); // the maw
      if (tele) ember(ctx, r * 1.05, r * 0.05, r * 0.28, 0.95); // a glob gathering
      ctx.fillStyle = '#ffd890'; ctx.fillRect(r * 0.55, -r * 0.2, 2.6, 2.2);
    },
    candlewraith: function (ctx, e, r, col, dark, t) { // a pale shrouded figure holding up a candle, which lights its face and tints the air around it
      var an = e.anim, lit = e.candle !== false && e.hp > e.maxHp * 0.35, fl = 0.6 + 0.4 * Math.sin(t * 9 + an * 2), k;
      ctx.save(); ctx.globalAlpha = 0.85;
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-r * 0.7, r * 0.95); for (k = 0; k < 5; k++) ctx.lineTo(-r * 0.7 + k * r * 0.35 + 2, r * 0.95 + (k % 2 ? 5 : 1) + Math.sin(an * 4 + k)); ctx.lineTo(r * 0.7, r * 0.95); ctx.quadraticCurveTo(r * 0.8, -r * 0.5, 0, -r * 0.85); ctx.quadraticCurveTo(-r * 0.8, -r * 0.5, -r * 0.7, r * 0.95); ctx.fill();
      ctx.fillStyle = '#2a2220'; ctx.beginPath(); ctx.ellipse(r * 0.1, -r * 0.35, r * 0.34, r * 0.4, 0, 0, PI2); ctx.fill(); // the hollow face
      ctx.fillStyle = lit ? '#ffe08a' : '#6a6460'; ctx.fillRect(r * 0.0, -r * 0.45, 2.4, 2.4); ctx.fillRect(r * 0.3, -r * 0.45, 2.4, 2.4);
      ctx.restore();
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(r * 0.4, r * 0.1); ctx.lineTo(r * 0.95, -r * 0.45); ctx.stroke(); // the raised arm
      ctx.fillStyle = '#e8dcc0'; ctx.fillRect(r * 0.95 - 1.6, -r * 0.45 - 6, 3.2, 7); // the candle
      if (lit) { ember(ctx, r * 0.95, -r * 0.45 - 9, 2.6 * fl + 1, 0.95); ctx.save(); ctx.globalAlpha = 0.12 * fl; ctx.fillStyle = '#ffb04a'; ctx.beginPath(); ctx.arc(r * 0.95, -r * 0.45 - 8, 30, 0, PI2); ctx.fill(); ctx.restore(); }
      else { ctx.strokeStyle = 'rgba(190,190,190,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(r * 0.95, -r * 0.45 - 7); ctx.quadraticCurveTo(r * 0.95 + 3, -r * 0.45 - 14, r * 0.95 - 2, -r * 0.45 - 20); ctx.stroke(); } // a thread of smoke
    },
    hearthkeeper: function (ctx, e, r, col, dark, t) { // a tall figure of black iron and ash with a coal for a heart and a chained ledger
      var an = e.anim, tele = e.state === 'telegraph', act = e.state === 'act', ex = e.exposed > 0, ph = e.phase || 1, k;
      var bob = Math.sin(an * 3) * 1.5, pulse = 0.55 + 0.35 * Math.sin(t * 3 + an), hot = ex ? 1 : tele ? 0.9 : 0.4 + 0.1 * ph;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, r * 1.05, r * 1.1, r * 0.3, 0, 0, PI2); ctx.fill();
      ctx.fillStyle = dark; for (k = -1; k <= 1; k += 2) ctx.fillRect(k * r * 0.4 - 4, r * 0.5, 8, r * 0.55); // iron legs
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-r * 0.8, r * 0.6 + bob); ctx.lineTo(-r * 0.55, -r * 0.7 + bob); ctx.lineTo(r * 0.55, -r * 0.7 + bob); ctx.lineTo(r * 0.8, r * 0.6 + bob); ctx.closePath(); ctx.fill(); // the torso
      ctx.fillStyle = '#403638'; for (k = 0; k < 3; k++) ctx.fillRect(-r * 0.6 + k * 2, -r * 0.5 + k * r * 0.4 + bob, r * 1.2 - k * 4, 3); // iron bands
      ctx.save(); ctx.shadowColor = '#ff7a1a'; ctx.shadowBlur = 8 + hot * 12; ctx.fillStyle = 'rgba(255,' + Math.floor(120 + 90 * pulse) + ',40,' + (0.5 + 0.45 * hot) + ')'; // the coal, wider when bared
      ctx.beginPath(); ctx.ellipse(0, -r * 0.1 + bob, r * (ex ? 0.5 : 0.32), r * (ex ? 0.5 : 0.3), 0, 0, PI2); ctx.fill(); ctx.restore();
      ctx.fillStyle = 'rgba(255,240,170,' + (0.45 * hot) + ')'; ctx.beginPath(); ctx.ellipse(0, -r * 0.12 + bob, r * 0.15, r * 0.13, 0, 0, PI2); ctx.fill();
      for (k = 0; k < 2 + ph * 2; k++) seam(ctx, [Math.cos(k * 2.4) * r * 0.3, -r * 0.1 + Math.sin(k * 2.4) * r * 0.3 + bob, Math.cos(k * 2.4) * r * 0.65, -r * 0.1 + Math.sin(k * 2.4) * r * 0.6 + bob], 1, 0.4 + 0.1 * ph); // cracks widen with each phase
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(r * 0.05, -r * 0.95 + bob, r * 0.38, 0, PI2); ctx.fill(); // the head: a hood of iron
      ctx.fillStyle = '#120c0c'; ctx.beginPath(); ctx.ellipse(r * 0.12, -r * 0.92 + bob, r * 0.24, r * 0.26, 0, 0, PI2); ctx.fill();
      ctx.fillStyle = tele ? '#fff4b0' : '#ff9a3a'; ctx.fillRect(r * 0.05, -r * 0.98 + bob, 3, 2.4); ctx.fillRect(r * 0.24, -r * 0.98 + bob, 3, 2.4);
      var ay = act ? r * 0.7 : tele ? -r * 0.9 : r * 0.1; // the ledger arm: raised before a slam, down on it
      ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(r * 0.5, -r * 0.4 + bob); ctx.lineTo(r * 1.15, ay); ctx.stroke();
      ctx.fillStyle = '#3a2418'; ctx.fillRect(r * 1.0, ay - 2, r * 0.55, r * 0.7); ctx.strokeStyle = '#ffb04a'; ctx.lineWidth = 1; ctx.strokeRect(r * 1.0, ay - 2, r * 0.55, r * 0.7); // the ledger
      ctx.strokeStyle = '#6a6460'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(r * 1.2, ay + r * 0.7); ctx.quadraticCurveTo(r * 1.0, r * 1.0, r * 0.7, r * 0.9); ctx.stroke(); // its chain
      ctx.fillStyle = col; ctx.fillRect(-r * 1.0, -r * 0.5 + bob, r * 0.35, r * 0.9); // the far arm
    }
  };
  if (F && !F._cinderDraw) {
    F._cinderDraw = true;
    var prevDraw = F.drawMonster;
    F.drawMonster = function (ctx, e, r, col, dark, t) {
      var fn = DRAW[e.type];
      if (fn) { fn(ctx, e, r, col, dark, t); return true; }
      return prevDraw ? prevDraw.apply(this, arguments) : false;
    };
  }
  CW.draw = DRAW; CW.brain = BRAIN;
})(window);
