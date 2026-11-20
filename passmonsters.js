/* CC.PassMonsters - the two monsters unique to the Rocky Pass, plus the pass's spawn rules.
 *
 *   Scree Golem  (screegolem)  A heap of boulders that looks like part of the slope until you get close; it rises, then slams the ground
 *                              (shockwave ring), hurls boulders at range and, below half health, throws a shard ring with every slam.
 *                              It deteriorates as it is hurt: cracks spread over the body with amber ember light inside, grit sifts off it, chunks
 *                              (arm, head, leg) tear away leaving glowing stumps, and the core burns through the chest.
 *   Crag Harpy   (cragharpy)   A gaunt, feathered wind-thing that circles above the ledge, dives talons first and fires feather volleys. Its wings
 *                              tear and shed feathers as it loses health, its flight turns ragged, and it bleeds and screams below 40%.
 * Both are registered like the plains monsters (TYPES weight 0, brain through the E._think chain, art through the forest's drawMonster hook, which
 * the cave renderer's default case calls), use the generic dismemberment/wound system (ANATOMY entries live in enemies.js) and bleed or spill grit.
 * The pass spawn rule: groups wake together, golems start dormant.
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, E = CC.Enemies, F = CC.Forest, PI2 = Math.PI * 2, PM = CC.PassMonsters = {};
  if (!E || !E.TYPES || E.TYPES.screegolem) return;
  function R() { return Math.random(); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mv(e, dx, dy) { var D = CC.Dungeon, r = D && D.moveWithCollision ? D.moveWithCollision(e, dx, dy) : (e.x += dx, e.y += dy, null); return !!(r && (r.hitX || r.hitY)); }
  function hurt(p, e, amt) {
    if (!p || p.hp <= 0 || p.invuln > 0) return 0;
    var dmg = Math.max(1, Math.round(amt * 100 / (100 + (p.armor || 0))));
    p.hp -= dmg; p.invuln = 0.45; p.hurtFlash = 0.2;
    if (CC.fx) { if (CC.fx.shake) CC.fx.shake(3); if (CC.fx.text) CC.fx.text(p.x, p.y - 14, '-' + dmg, '#ff5a5a', 12); }
    return dmg;
  }
  function fxb(x, y, c, n, sp) { if (CC.fx && CC.fx.burst) CC.fx.burst(x, y, c, n, sp); }
  function shake(n) { if (CC.fx && CC.fx.shake) CC.fx.shake(n); }
  function fan(e, ang, n, gap, spd, dmg, col, kind, life, r) {
    for (var i = 0; i < n; i++) {
      E._shoot(e, ang + (i - (n - 1) / 2) * gap, spd, dmg, col, kind, life);
      if (r) E.projectiles[E.projectiles.length - 1].r = r;
    }
  }

  E.TYPES.screegolem = { name: 'Scree Golem', hp: 120, spd: 34, dmg: 16, r: 15, xp: 64, color: '#7a7468', w: 0, telRad: 74, blood: '#8a7c64' };
  E.TYPES.cragharpy = { name: 'Crag Harpy', hp: 40, spd: 96, dmg: 10, r: 9, xp: 32, color: '#8e7e72', w: 0, blood: '#7a0e18' };

  /* ---------- brains ---------- */
  var BRAIN = {
    screegolem: function (e, dt, p, d, ang, f, sp) {
      var low = e.hp < e.maxHp * 0.5;
      if (e.dormant) { // a pile of fallen rock until you step close (or hurt it)
        e.grit = (e.grit || 0) - dt;
        if (d < 118 || e.hp < e.maxHp) {
          e.dormant = false; e.state = 'rise'; e.t = 1.25; shake(5);
          fxb(e.x, e.y, '#8a7c64', 18, 110); fxb(e.x, e.y, '#5a554c', 10, 80);
          if (CC.fx && CC.fx.text) CC.fx.text(e.x, e.y - 34, 'THE ROCKS STIR...', '#d8c8a0', 10);
        }
        return;
      }
      if (e.state === 'rise') { if ((e.t -= dt) <= 0) { e.state = 'idle'; e.cd = 0.7; e.rc = 2; shake(4); fxb(e.x, e.y + 6, '#8a7c64', 14, 100); } return; }
      e.grit = (e.grit || 0) - dt;
      if (e.grit <= 0) { e.grit = clamp(0.5 - (1 - e.hp / e.maxHp) * 0.4, 0.1, 0.5); if (e.hp < e.maxHp * 0.85) fxb(e.x + (R() - 0.5) * e.r * 1.4, e.y + (R() - 0.2) * e.r, '#7a7060', 1, 28); } // grit sifts off as it breaks
      if (e.hp < e.maxHp * 0.4 && R() < dt * 2) fxb(e.x + (R() - 0.5) * e.r, e.y - e.r * 0.2, '#ff9a3a', 1, 35); // embers from the burning core
      if (e.state === 'idle') {
        if (d > 56) mv(e, Math.cos(ang) * sp * (low ? 1.25 : 1), Math.sin(ang) * sp * (low ? 1.25 : 1));
        e.rc = (e.rc === undefined ? 2 : e.rc) - dt;
        if (e.rc <= 0 && d > 130 && d < 320 && e.los !== false) {
          this._tele(e, 'hurl', 0.75, ang); e.tele = { kind: 'line', ang: ang, len: 300, max: 0.75 }; e.rc = (low ? 2.4 : 3.6) + R() * 1.6;
        } else if (e.cd <= 0 && d < 86) this._tele(e, 'slam', 0.85, ang);
      } else if (e.state === 'telegraph') {
        if ((e.t -= dt) <= 0) {
          e.tele = null;
          if (e.atk === 'slam') {
            e.state = 'act'; e.t = 0.45; shake(8);
            fxb(e.x, e.y + 4, '#8a7c64', 26, 150); fxb(e.x, e.y + 4, '#5a554c', 14, 110);
            if (CC.Vfx && CC.Vfx.earthSpikes) { /* the engine already draws a ring; spikes would hide the telegraph */ }
            if (d < (e.telRad || 74) + (p.r || 8) && hurt(p, e, e.dmg * 1.2)) mv(p, Math.cos(ang) * 26, Math.sin(ang) * 26);
            E.projectiles.push({ x: e.x, y: e.y, vx: 0, vy: 0, r: 0, life: 0.4, ring: e.telRad || 74, color: '#b8a888', fx: true });
            if (low) fan(e, ang, 8, PI2 / 8, 130, e.dmg * 0.55, '#8a8272', 'orb', 1.3, 5); // below half: a ring of shards flies out with the slam
          } else { // hurl a boulder (a fan of three when hurt)
            e.state = 'recover'; e.t = 0.6; shake(2); fxb(e.x + Math.cos(ang) * e.r, e.y - 4, '#8a7c64', 8, 70);
            fan(e, ang, low ? 3 : 1, 0.25, 150, e.dmg * 1.05, '#9a9282', 'orb', 2.4, 8);
          }
        }
      } else if (e.state === 'act') { e.dangerous = d < e.r + 34; if ((e.t -= dt) <= 0) { e.state = 'recover'; e.t = 0.9; e.dangerous = false; } }
      else if (e.state === 'recover') { if ((e.t -= dt) <= 0) { e.state = 'idle'; e.cd = (low ? 0.8 : 1.3) + R() * 0.8; } }
      else e.state = 'idle';
    },
    cragharpy: function (e, dt, p, d, ang, f, sp) {
      var low = e.hp < e.maxHp * 0.4, ragged = (e.missing && (e.missing.wingLeft || e.missing.wingRight)) ? 0.7 : 1; // a torn wing slows the flight
      if (e.state === 'idle') {
        e.orb = (e.orb === undefined ? R() * PI2 : e.orb) + dt * 1.9 * e.strafe * (low ? 1.3 : 1);
        var rad = 96 + Math.sin(e.anim * 0.7) * 18, ta = Math.atan2(p.y + Math.sin(e.orb) * rad - e.y, p.x + Math.cos(e.orb) * rad - e.x);
        mv(e, Math.cos(ta) * sp * 1.15 * ragged, Math.sin(ta) * sp * 1.15 * ragged);
        if (e.cd <= 0 && d < 230 && e.los !== false) {
          e.volley = (e.volley || 0) + 1;
          if (e.volley % 3 === 0 && d > 70) this._tele(e, 'arrow', 0.65, ang); else this._tele(e, 'dash', 0.4, ang);
        }
      } else if (e.state === 'telegraph') {
        mv(e, Math.cos(ang) * sp * 0.2, Math.sin(ang) * sp * 0.2);
        if ((e.t -= dt) <= 0) {
          e.tele = null;
          if (e.atk === 'arrow') { e.state = 'recover'; e.t = 0.5; fan(e, ang, low ? 5 : 3, 0.2, 215, e.dmg * 0.75, '#cdbfa6', 'arrow', 1.6); fxb(e.x, e.y, '#3a2e2a', 5, 60); }
          else { e.state = 'act'; e.t = 0.38; }
        }
      } else if (e.state === 'act') { e.dangerous = true; mv(e, Math.cos(e.ang) * 340 * f * dt * ragged, Math.sin(e.ang) * 340 * f * dt * ragged); if ((e.t -= dt) <= 0) { e.state = 'recover'; e.t = 0.6; fxb(e.x, e.y, '#3a2e2a', 3, 45); } }
      else if (e.state === 'recover') { mv(e, -Math.cos(ang) * sp * 1.3, -Math.sin(ang) * sp * 1.3); if ((e.t -= dt) <= 0) { e.state = 'idle'; e.cd = (low ? 0.5 : 0.9) + R() * 1.1; e.strafe = R() < 0.5 ? 1 : -1; } }
      else e.state = 'idle';
      if (e.hp < e.maxHp * 0.7 && R() < dt * (low ? 5 : 2)) fxb(e.x + (R() - 0.5) * 12, e.y + (R() - 0.5) * 8, '#3a2e2a', 1, 26); // feathers come loose
      if (low && R() < dt * 3) fxb(e.x, e.y + 3, '#7a0e18', 1, 32);
    }
  };
  var prevThink = E._think;
  E._think = function (e, dt, p, d, ang, f) {
    var fn = BRAIN[e.type];
    if (!fn) return prevThink.apply(this, arguments);
    e.cd -= dt; e.dangerous = false;
    fn.call(this, e, dt, p, d, ang, f, e.spd * f * dt);
  };

  /* ---------- spawning in the pass ---------- */
  var prevSpawn = E.spawnForFloor;
  E.spawnForFloor = function (floor, points) {
    if (!(CC.state && CC.state.area === 'rocky-pass' && CC.RockPass && CC.RockPass.map && CC.Dungeon === CC.RockPass.map)) return prevSpawn.apply(this, arguments);
    this.list.length = 0; this.projectiles.length = 0; this.boss = null; this.zones = []; this.remains = []; if (this.gore) this.gore = [];
    if (CC.Loot && CC.Loot.clear) CC.Loot.clear();
    var grp = 9000, i, k, e, n, lvl = 2;
    for (i = 0; i < points.length; i++) {
      var pt = points[i];
      if (pt.type === 'direwolf' || pt.type === 'crow' || (pt.type === 'cragharpy' && pt.pair)) {
        n = pt.type === 'direwolf' ? 2 : pt.type === 'cragharpy' ? 2 : 3; grp++;
        for (k = 0; k < n; k++) { e = this.spawn(pt.type, pt.x + (R() - 0.5) * 40, pt.y + (R() - 0.5) * 40, lvl); e.group = grp; }
      } else {
        e = this.spawn(pt.type, pt.x, pt.y, lvl);
        if (pt.type === 'screegolem') { e.dormant = true; e.state = 'idle'; }
      }
    }
    return this.list;
  };

  /* ---------- art (ctx is at the monster, +x = facing; the shell already mirrored it) ---------- */
  function lerp(a, b, u) { return a + (b - a) * u; }
  function stone(ctx, x, y, w, h, col, hi, rot, seed) { // a faceted boulder
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0);
    var s = seed || 0.5, j = function (k) { return 0.85 + 0.3 * Math.abs(Math.sin(s * 12.9 + k * 4.1)); };
    ctx.fillStyle = col; ctx.beginPath();
    ctx.moveTo(-w * j(1), h * 0.2); ctx.lineTo(-w * 0.8 * j(2), -h * 0.55 * j(3)); ctx.lineTo(-w * 0.15, -h * j(4)); ctx.lineTo(w * 0.7 * j(5), -h * 0.7 * j(6)); ctx.lineTo(w * j(7), h * 0.1); ctx.lineTo(w * 0.6 * j(8), h * 0.8); ctx.lineTo(-w * 0.55 * j(9), h * 0.85); ctx.closePath(); ctx.fill();
    ctx.fillStyle = hi; ctx.beginPath(); ctx.moveTo(-w * 0.8 * j(2), -h * 0.55 * j(3)); ctx.lineTo(-w * 0.15, -h * j(4)); ctx.lineTo(w * 0.7 * j(5), -h * 0.7 * j(6)); ctx.lineTo(0, -h * 0.2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(10,8,6,0.3)'; ctx.beginPath(); ctx.moveTo(w * 0.7 * j(5), -h * 0.7 * j(6)); ctx.lineTo(w * j(7), h * 0.1); ctx.lineTo(w * 0.6 * j(8), h * 0.8); ctx.lineTo(w * 0.1, h * 0.3); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function glowLine(ctx, pts, w, col, a) {
    ctx.save(); ctx.shadowColor = '#ff8a2a'; ctx.shadowBlur = 6; ctx.strokeStyle = col; ctx.globalAlpha = a; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.stroke(); ctx.restore();
  }
  var DRAW = {
    screegolem: function (ctx, e, r, col, dark, t) {
      var an = e.anim, hi = '#a29a8a', frac = clamp(e.hp / e.maxHp, 0, 1), dam = 1 - frac, tele = e.state === 'telegraph', slam = tele && e.atk === 'slam', act = e.state === 'act';
      var pulse = 0.55 + 0.35 * Math.sin(t * 3 + an), k, mis = e.missing || {};
      if (e.dormant || e.state === 'rise') { // a heap of boulders; as it rises the heap stands up into the body
        var u = e.dormant ? 0 : 1 - clamp(e.t / 1.25, 0, 1), rs = 0.7;
        var parts = [[-0.9, 0.55, 0.55, 0.42], [0.8, 0.6, 0.5, 0.4], [0, 0.3, 0.85, 0.6], [-0.45, -0.1, 0.5, 0.42], [0.5, -0.05, 0.55, 0.45], [0, -0.55, 0.45, 0.4], [-1.1, 0.1, 0.3, 0.28]];
        for (k = 0; k < parts.length; k++) { var q = parts[k]; stone(ctx, q[0] * r * lerp(1, 0.75, u) * 1.1, lerp(q[1], q[1] - 0.35 * (k > 2 ? 1 : 0.2), u) * r + Math.sin(t * 40 + k) * (e.dormant ? 0 : 1.2 * (1 - u)), q[2] * r * 1.05, q[3] * r * 1.05, k % 2 ? col : dark, hi, (k - 3) * 0.18, rs + k * 0.37); }
        ctx.fillStyle = 'rgba(84,112,60,0.7)'; ctx.beginPath(); ctx.ellipse(-r * 0.2, -r * 0.25, r * 0.45, 2.4, 0.1, 0, PI2); ctx.fill(); // moss on top
        if (e.dormant) { glowLine(ctx, [-r * 0.3, r * 0.2, -r * 0.05, r * 0.05, r * 0.25, r * 0.28], 1.2, '#ff9a3a', 0.25 + 0.25 * pulse); } // a faint ember seam between the stones
        return;
      }
      var lift = slam ? -r * 0.6 : act ? r * 0.35 : 0, mis2 = 0, sway = Math.sin(an * 4) * (e.state === 'idle' ? 1.8 : 0.4), step = Math.sin(an * 4) * 3;
      ctx.fillStyle = 'rgba(0,0,0,0.0)';
      // legs: two squat stone pillars
      for (k = -1; k <= 1; k += 2) {
        if (k < 0 && mis.legLeft) { ctx.fillStyle = '#2a2520'; ctx.fillRect(-r * 0.55, r * 0.35, r * 0.34, r * 0.25); glowLine(ctx, [-r * 0.5, r * 0.4, -r * 0.4, r * 0.55, -r * 0.3, r * 0.4], 1.4, '#ffb04a', 0.5 + 0.4 * pulse); continue; }
        var lx = k * r * 0.45, ph = (k > 0 ? 1 : -1) * step;
        stone(ctx, lx, r * 0.72 + ph * 0.4, r * 0.34, r * 0.4, dark, col, 0, 3 + k);
        stone(ctx, lx, r * 1.02 + ph * 0.5, r * 0.4, r * 0.2, dark, col, 0, 5 + k);
      }
      // far arm then torso then near arm (+x is the facing side)
      function arm(sgn, miss) {
        var ax = sgn * r * 1.02, ay = -r * 0.32, raise = slam ? -r * 1.2 : act ? r * 0.55 : Math.sin(an * 4 + (sgn > 0 ? 0 : 2)) * 2;
        if (miss) { ctx.fillStyle = '#2a2520'; ctx.beginPath(); ctx.arc(ax * 0.82, ay + r * 0.15, r * 0.2, 0, PI2); ctx.fill(); glowLine(ctx, [ax * 0.74, ay + r * 0.05, ax * 0.92, ay + r * 0.2, ax * 0.78, ay + r * 0.34], 1.4, '#ffb04a', 0.5 + 0.4 * pulse); return; }
        stone(ctx, ax, ay + raise * 0.4, r * 0.3, r * 0.34, col, hi, sgn * 0.2, 7 + sgn); // shoulder
        stone(ctx, ax + sgn * r * 0.1, ay + r * 0.6 + raise, r * 0.24, r * 0.46, dark, col, 0, 9 + sgn); // forearm
        stone(ctx, ax + sgn * r * 0.13, ay + r * 1.18 + raise, r * 0.4, r * 0.36, col, hi, 0.1 * sgn, 11 + sgn); // fist
      }
      arm(-1, mis.armLeft);
      ctx.save(); ctx.translate(sway * 0.4, lift * 0.3);
      stone(ctx, 0, r * 0.3, r * 0.62, r * 0.55, col, hi, 0, 1.3); // belly
      stone(ctx, 0, -r * 0.38, r * 0.78, r * 0.55, dark, hi, 0.04, 2.1); // chest slab
      stone(ctx, -r * 0.62, -r * 0.6, r * 0.34, r * 0.3, col, hi, -0.3, 4.2); stone(ctx, r * 0.62, -r * 0.62, r * 0.36, r * 0.3, col, hi, 0.3, 5.2); // pauldrons
      ctx.fillStyle = 'rgba(84,112,60,0.65)'; ctx.beginPath(); ctx.ellipse(-r * 0.4, -r * 0.82, r * 0.4, 2.4, -0.2, 0, PI2); ctx.fill(); ctx.beginPath(); ctx.ellipse(r * 0.5, r * 0.45, r * 0.28, 2, 0.1, 0, PI2); ctx.fill(); // moss
      // the core: an ember heart that burns brighter and breaks out as the body cracks
      var hot = tele ? 1 : 0.35 + dam * 0.55, cr = r * (0.22 + dam * 0.14);
      ctx.save(); ctx.shadowColor = '#ff7a1a'; ctx.shadowBlur = 8 + hot * 10; ctx.fillStyle = 'rgba(255,' + Math.floor(120 + 90 * pulse) + ',40,' + (0.55 + 0.35 * hot) + ')';
      ctx.beginPath(); ctx.ellipse(r * 0.05, -r * 0.2, cr, cr * 0.85, 0, 0, PI2); ctx.fill(); ctx.restore();
      ctx.fillStyle = 'rgba(255,240,170,' + (0.5 * hot) + ')'; ctx.beginPath(); ctx.ellipse(r * 0.05, -r * 0.22, cr * 0.45, cr * 0.38, 0, 0, PI2); ctx.fill();
      // cracks spread with damage, each glowing amber, with a few hairline ones always showing
      var nCr = 2 + Math.floor(dam * 9);
      for (k = 0; k < nCr; k++) {
        var ca = k * 2.4 + 0.5, c1 = cr * 0.9, c2 = r * (0.5 + (k % 3) * 0.2), jx = Math.sin(k * 7.3) * 4;
        glowLine(ctx, [r * 0.05 + Math.cos(ca) * c1, -r * 0.2 + Math.sin(ca) * c1 * 0.85, r * 0.05 + Math.cos(ca) * c2 * 0.6 + jx, -r * 0.2 + Math.sin(ca) * c2 * 0.55, r * 0.05 + Math.cos(ca + 0.3) * c2, -r * 0.2 + Math.sin(ca + 0.3) * c2 * 0.8], 0.9 + dam * 1.2, '#ffb04a', 0.35 + 0.5 * dam);
      }
      if (dam > 0.5) { ctx.fillStyle = '#1c1812'; ctx.beginPath(); ctx.moveTo(-r * 0.6, r * 0.05); ctx.lineTo(-r * 0.3, -r * 0.1); ctx.lineTo(-r * 0.4, r * 0.28); ctx.closePath(); ctx.fill(); glowLine(ctx, [-r * 0.6, r * 0.05, -r * 0.4, r * 0.28, -r * 0.3, -r * 0.1], 1.2, '#ff9a3a', 0.7); } // a chunk gone from the belly
      // head: a small craggy skull sunk between the shoulders with two ember eyes
      if (mis.head) { ctx.fillStyle = '#2a2520'; ctx.fillRect(-r * 0.2, -r * 1.05, r * 0.4, r * 0.3); glowLine(ctx, [-r * 0.15, -r * 0.82, 0, -r * 1.05, r * 0.18, -r * 0.82], 1.5, '#ffb04a', 0.6 + 0.4 * pulse); }
      else {
        stone(ctx, r * 0.12, -r * 1.08, r * 0.38, r * 0.34, col, hi, 0.1, 6.3);
        ctx.save(); ctx.shadowColor = '#ff8a2a'; ctx.shadowBlur = 6; ctx.fillStyle = tele ? '#fff4b0' : '#ffb04a'; ctx.fillRect(r * 0.0, -r * 1.14, 3, 2.4); ctx.fillRect(r * 0.3, -r * 1.14, 3, 2.4); ctx.restore();
        ctx.strokeStyle = '#1a1612'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(r * 0.0, -r * 0.94); ctx.lineTo(r * 0.36, -r * 0.96); ctx.stroke(); // a crack of a mouth
      }
      ctx.restore();
      arm(1, mis.armRight);
      if (tele && e.atk === 'hurl') { stone(ctx, r * 1.3, -r * 0.5 + Math.sin(t * 20) * 1.2, r * 0.45, r * 0.4, '#9a9282', '#c4bca8', 0.2, 12.2); } // the boulder in its raised hand
      // loose pebbles fall off it as it breaks
      if (dam > 0.2) { ctx.fillStyle = '#6a6254'; for (k = 0; k < 3; k++) { var ph2 = ((t * 0.9 + k * 0.33 + (e.id || 0) * 0.17) % 1); ctx.globalAlpha = 1 - ph2; ctx.fillRect(-r * 0.6 + k * r * 0.6 + Math.sin(k * 5 + t) * 2, r * 0.1 + ph2 * r * 1.0, 2.2, 2.2); } ctx.globalAlpha = 1; }
    },
    cragharpy: function (ctx, e, r, col, dark, t) {
      var an = e.anim, frac = clamp(e.hp / e.maxHp, 0, 1), dam = 1 - frac, tele = e.state === 'telegraph', dive = e.state === 'act', mis = e.missing || {}, k;
      var beat = dive ? 0.1 : Math.sin(an * (e.hp < e.maxHp * 0.4 ? 22 : 16)) * (0.55 + 0.1 * (1 - dam)), feather = '#3a2e2a', tip = '#cdbfa6', skin = col, ragged = dam > 0.35;
      function wing(sgn, miss) {
        if (miss) { ctx.fillStyle = '#6e1a20'; ctx.beginPath(); ctx.ellipse(sgn * r * 0.8, -r * 0.1, 2.5, 3.4, 0, 0, PI2); ctx.fill(); ctx.strokeStyle = '#d8d4c0'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(sgn * r * 0.8, -r * 0.1); ctx.lineTo(sgn * (r * 0.8 + 6), -r * 0.35); ctx.stroke(); return; } // bare wing bone
        var span = dive ? r * 1.5 : r * (2.1 + beat * 0.3), lift = (dive ? 0.2 : beat) * r * 1.3;
        ctx.save(); ctx.translate(sgn * r * 0.5, -r * 0.25);
        ctx.fillStyle = feather; ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.lineTo(sgn * span * 0.45, -lift * 1.1 - r * 0.55); // the arm of the wing
        for (var f = 0; f < 6; f++) { // primary feathers fanning out; torn ones are short, as damage wears them away
          var u = f / 5, gone = ragged && ((f * 7 + (e.id || 3)) % 5 < Math.floor(dam * 5)), len = gone ? span * 0.35 : span * (1 - u * 0.25), fy = -lift * (1 - u) + u * r * 1.15 + (dive ? u * 4 : 0);
          ctx.lineTo(sgn * (span * 0.45 + len * 0.6), fy - r * 0.35 + (gone ? 4 : 0)); ctx.lineTo(sgn * (span * 0.45 + len * 0.45), fy - r * 0.05);
        }
        ctx.lineTo(sgn * 3, r * 0.5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = tip; for (f = 0; f < 5; f++) { var uu = f / 5; ctx.fillRect(sgn * (span * (0.55 + uu * 0.3)) - 1, -lift * (1 - uu) + uu * r * 1.1 - r * 0.45, 2, 2); } // pale feather tips
        ctx.strokeStyle = 'rgba(10,6,6,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(sgn * span * 0.9, -lift * 0.6 + r * 0.2); ctx.stroke();
        if (dam > 0.2) { ctx.fillStyle = 'rgba(122,14,24,0.8)'; ctx.beginPath(); ctx.ellipse(sgn * span * 0.4, -lift * 0.4 - r * 0.2, 2.6, 1.7, 0.5, 0, PI2); ctx.fill(); } // blood on the wing
        ctx.restore();
      }
      wing(-1, mis.wingLeft);
      // dangling talons (splayed on the dive)
      if (!mis.legLeft) { ctx.strokeStyle = '#6a5a3a'; ctx.lineWidth = 1.6; var sp = dive ? 5 : 2; ctx.beginPath(); ctx.moveTo(-r * 0.2, r * 0.6); ctx.lineTo(-r * 0.3, r * 1.2); ctx.moveTo(-r * 0.3, r * 1.2); ctx.lineTo(-r * 0.3 - sp, r * 1.55); ctx.moveTo(-r * 0.3, r * 1.2); ctx.lineTo(-r * 0.3 + sp, r * 1.55); ctx.stroke(); }
      ctx.strokeStyle = '#6a5a3a'; ctx.lineWidth = 1.6; var sp2 = dive ? 5 : 2; ctx.beginPath(); ctx.moveTo(r * 0.25, r * 0.6); ctx.lineTo(r * 0.3, r * 1.2); ctx.moveTo(r * 0.3, r * 1.2); ctx.lineTo(r * 0.3 - sp2, r * 1.55); ctx.moveTo(r * 0.3, r * 1.2); ctx.lineTo(r * 0.3 + sp2, r * 1.55); ctx.stroke();
      ctx.fillStyle = '#d8d0b0'; ctx.fillRect(r * 0.3 + sp2 - 1, r * 1.5, 1.6, 2.4); ctx.fillRect(r * 0.3 - sp2 - 1, r * 1.5, 1.6, 2.4);
      // body: a gaunt, hunched torso with ribs showing and a ragged feather skirt
      ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.62, r * 0.85, 0, 0, PI2); ctx.fill();
      ctx.fillStyle = feather; ctx.beginPath(); ctx.moveTo(-r * 0.55, r * 0.3); for (k = 0; k < 5; k++) ctx.lineTo(-r * 0.55 + k * r * 0.28, r * 0.5 + (k % 2 ? 5 : 1)); ctx.lineTo(r * 0.55, r * 0.3); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(40,24,20,0.55)'; ctx.lineWidth = 1; for (k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(-r * 0.3, -r * 0.25 + k * 3.2); ctx.lineTo(r * 0.3, -r * 0.2 + k * 3.2); ctx.stroke(); }
      if (dam > 0.15) { ctx.fillStyle = '#7a0e18'; ctx.beginPath(); ctx.ellipse(r * 0.05, r * 0.15, r * 0.28, r * 0.18 + dam * 3, 0.2, 0, PI2); ctx.fill(); ctx.strokeStyle = '#e8e0c8'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-r * 0.12, r * 0.05); ctx.lineTo(r * 0.2, r * 0.1); ctx.moveTo(-r * 0.1, r * 0.18); ctx.lineTo(r * 0.22, r * 0.22); ctx.stroke(); } // torn belly, ribs exposed
      wing(1, mis.wingRight);
      // head: long wild hair, a gaunt face and a hooked beak-like mouth; it opens to scream before a volley
      if (mis.head) { ctx.fillStyle = '#6e1a20'; ctx.beginPath(); ctx.ellipse(r * 0.25, -r * 0.88, 3, 3.6, 0, 0, PI2); ctx.fill(); }
      else {
        var hx = r * 0.28, hy = -r * 0.82;
        ctx.strokeStyle = '#1e1816'; ctx.lineWidth = 1.8; ctx.beginPath(); for (k = 0; k < 6; k++) { ctx.moveTo(hx - r * 0.1, hy - r * 0.1); ctx.quadraticCurveTo(hx - r * 0.7 - k, hy + r * (0.1 + k * 0.14) + Math.sin(t * 5 + k) * 1.2, hx - r * 1.0 - k * 1.2, hy + r * (0.5 + k * 0.1)); } ctx.stroke(); // windblown hair
        ctx.fillStyle = '#b9a99a'; ctx.beginPath(); ctx.ellipse(hx, hy, r * 0.42, r * 0.5, 0, 0, PI2); ctx.fill();
        ctx.fillStyle = '#e0c868'; ctx.fillRect(hx + r * 0.02, hy - r * 0.15, 2.6, 2); ctx.fillRect(hx + r * 0.25, hy - r * 0.15, 2.6, 2); // yellow eyes
        var open = tele ? 3.2 : 0.6; ctx.fillStyle = '#3a0a10'; ctx.beginPath(); ctx.moveTo(hx + r * 0.25, hy + r * 0.1); ctx.lineTo(hx + r * 0.85, hy + r * 0.28 + open * 0.3); ctx.lineTo(hx + r * 0.25, hy + r * 0.3 + open); ctx.closePath(); ctx.fill(); // hooked mouth
        ctx.fillStyle = '#e8e0c8'; for (k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(hx + r * (0.35 + k * 0.14), hy + r * 0.14 + k * 0.4); ctx.lineTo(hx + r * (0.4 + k * 0.14), hy + r * 0.3 + k * 0.4); ctx.lineTo(hx + r * (0.45 + k * 0.14), hy + r * 0.14 + k * 0.4); ctx.fill(); }
        if (dam > 0.3) { ctx.strokeStyle = '#7a0e18'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(hx + r * 0.1, hy + r * 0.3); ctx.lineTo(hx + r * 0.1, hy + r * 0.7 + Math.sin(t * 6) * 1.5); ctx.stroke(); } // blood from the mouth
      }
    }
  };
  if (F && !F._passDraw) {
    F._passDraw = true;
    var prevDraw = F.drawMonster;
    F.drawMonster = function (ctx, e, r, col, dark, t) {
      var fn = DRAW[e.type];
      if (fn) { fn(ctx, e, r, col, dark, t); return true; }
      return prevDraw ? prevDraw.apply(this, arguments) : false;
    };
  }
})(window);
