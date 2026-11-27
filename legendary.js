/* CC.Legendary - the engine that makes the legendary weapons DO things (gear update, steps 2-3 of GEAR_PLAN.md).
 *
 * Each legendary weapon has an ability id (item.legendId, from legendary_weapons.js). HANDLERS[id] is a small object with any of these hooks:
 *   dmgMul(X,p,e,dmg,type,ctx)  -> multiplier for the hero's damage to e (before it lands)
 *   forceCrit(X,p,e)            -> true to make this hit a critical
 *   onHit(X,p,e,dealt,type,ctx) after a hit lands (ctx: crit, melee, basic, spell)
 *   onMinionHit(X,p,e,dealt)    after one of your minions hits
 *   onKill(X,p,e)               when anything dies while the weapon is wielded
 *   onCast(X,p,slot)            when spell 1 or spell 2 goes on cooldown (a cast)
 *   onCharge(X,p,power)         when a charged attack is released
 *   onDash(X,p)                 when you dash
 *   onHurt(X,p,amount,src)      -> the (possibly changed) amount of damage you take
 *   tick(X,p,dt)                every frame
 *   mods / flags                permanent bonuses while wielded: p.mods[k] += v, p.flags[k] += v
 * X is a toolbox: X.foes(), X.near(x,y,r,except), X.hurt(e,dmg,type), X.area(x,y,r,mult,type), X.zone(def), X.later(sec,fn), X.heal(p,n),
 * X.stun/slow/chill/ignite/bleed(e,...), X.raise(p,n), X.knock(e,fromX,fromY,dist), X.text/burst/shake, X.now.
 * The hooks sit on CC.Classes.hitEnemy / damage, CC.Enemies._kill / update, and the cast/dash/charge edges read from the hero each frame.
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, LG = CC.Legendary = {}, H = LG.HANDLERS = {}, TAU = Math.PI * 2;
  var now = 0, zones = [], timers = [];
  function R() { return Math.random(); }
  function hero() { var s = CC.state; return s && s.player && s.player.isHero && s.player.stats ? s.player : null; }
  function alive(e) { return !!e && !e.dead && e.hp > 0; }
  function E() { return CC.Enemies; }
  function foes() { var l = E() && E().list; return Array.isArray(l) ? l : []; }
  function idOf(it) { return it && it.legendary ? (it.legendId || (it.effect && it.effect.id)) : null; }
  function weapon(p) { var it = p && p.equipment && p.equipment.weapon; return it && idOf(it) && H[idOf(it)] ? it : null; }
  LG.has = function (id) { var p = hero(), it = weapon(p); return !!it && idOf(it) === id; };
  LG.freezeMul = function () { return LG.has('rimefall') ? 2 : 1; };
  LG.chillFor = function () { return LG.has('rimefall') ? 5 : 3; };

  /* ---------- the toolbox ---------- */
  var X = {
    get now() { return now; },
    foes: foes,
    near: function (x, y, r, except) { return foes().filter(function (f) { return alive(f) && f !== except && !f.asleep && Math.hypot(f.x - x, f.y - y) <= r + (f.r || 8); }); },
    nearest: function (x, y, r, except) { var b = null, bd = r * r; foes().forEach(function (f) { if (!alive(f) || f === except || f.asleep) return; var d = (f.x - x) * (f.x - x) + (f.y - y) * (f.y - y); if (d < bd) { bd = d; b = f; } }); return b; },
    hurt: function (e, dmg, type) { var C = CC.Classes; return alive(e) && C && C.hitEnemy ? C.hitEnemy(e, Math.max(1, Math.round(dmg)), type || 'magic', { noCrit: true, splash: true, _lg: true }) : 0; },
    area: function (x, y, r, mult, type) { var p = hero(), n = 0; if (!p) return 0; X.near(x, y, r).forEach(function (f) { X.hurt(f, p.stats.dmg * mult, type); n++; }); return n; },
    zone: function (z) { z.life = z.t; z.every = z.every || 0.5; z.acc = 0; if (zones.length < 40) zones.push(z); return z; },
    later: function (sec, fn) { timers.push({ t: sec, fn: fn }); },
    heal: function (p, n) { var C = CC.Classes; return C && C.heal ? C.heal(p, n) : 0; },
    stun: function (e, t) { if (alive(e) && !(CC.Frost && CC.Frost.immune(e) && (e.boss))) CC.Classes.status(e, 'stun', e.boss ? Math.min(t, 0.4) : t); },
    slow: function (e, t, m) { if (alive(e)) CC.Classes.status(e, 'slow', t, m); },
    chill: function (e) { if (CC.Frost) CC.Frost.chill(e, LG.chillFor()); else X.slow(e, 3, 0.6); },
    ignite: function (e, t, dps) { var h = CC.Classes && CC.Classes._h; if (alive(e) && h && h.ignite) h.ignite(e, t, Math.max(1, dps), '#ff8a3c', 'fire'); },
    poison: function (e, t, dps) { var h = CC.Classes && CC.Classes._h; if (alive(e) && h && h.ignite) h.ignite(e, t, Math.max(1, dps), '#9aff3a', 'poison'); },
    bleed: function (e, n) { var p = hero(); if (alive(e) && CC.Wounds && p) CC.Wounds.apply(e, { dur: 3, dps: Math.max(2, p.stats.dmg * 0.2) * (n || 1), src: 'blade' }); },
    knock: function (e, fx, fy, dist) { var dx = e.x - fx, dy = e.y - fy, l = Math.hypot(dx, dy) || 1, D = CC.Dungeon; if (D && D.moveWithCollision) { try { D.moveWithCollision(e, dx / l * dist, dy / l * dist); return; } catch (err) { /* fall through */ } } e.x += dx / l * dist; e.y += dy / l * dist; },
    pull: function (e, tx, ty, dist) { X.knock(e, tx, ty, -dist); },
    raise: function (p, n, opts) {
      var m = CC.Classes && CC.Classes.minions; if (!m) return;
      for (var i = 0; i < n && m.length < 14; i++) { var a = R() * TAU, hp = 40 + (p.level || 1) * 4; m.push({ x: p.x + Math.cos(a) * 24, y: p.y + Math.sin(a) * 24, r: 6, hp: hp, maxHp: hp, life: 22, dmg: 5 + p.stats.dmg * 0.42, atkCd: 0, anim: R() * 6, face: 1, spawn: 0.35 }); }
    },
    text: function (x, y, s, c, z) { if (CC.fx && CC.fx.text) CC.fx.text(x, y, s, c || '#ffd36b', z || 11); },
    burst: function (x, y, c, n, sp) { if (CC.fx && CC.fx.burst) CC.fx.burst(x, y, c, n || 10, sp || 100); },
    ring: function (x, y, r, col) { var h = CC.Classes && CC.Classes._h; if (h && h.addFx) h.addFx({ kind: 'ring', x: x, y: y, r: r, t: 0.4, max: 0.4, col: col || '#ffd36b' }); },
    shake: function (v) { if (CC.fx && CC.fx.shake) CC.fx.shake(v); },
    chain: function (pts) { if (CC.Vfx && CC.Vfx.chain) CC.Vfx.chain(pts); },
    behind: function (p, e) { return (p.x - e.x) * (e.face || 1) < 0; },
    st: function (p) { return p._lg || (p._lg = {}); }
  };
  LG.X = X;

  /* ---------- the abilities ---------- */
  // swordsman
  H.burn_on_hit = { onHit: function (X, p, e, d, t, c) { if (c.melee || c.basic) { X.ignite(e, 3, p.stats.dmg * 0.3); e._lgBurn = now + 3; } },
    onKill: function (X, p, e) { if (e._lgBurn > now) { X.area(e.x, e.y, 60, 0.8, 'fire'); X.burst(e.x, e.y, '#ff8a3c', 14, 120); X.ring(e.x, e.y, 60, '#ff8a3c'); } } };
  H.crit_damage = { dmgMul: function (X, p, e, d, t, c) { return c.crit ? 1.6 : 1; }, onHit: function (X, p, e, d, t, c) { if (c.crit) X.near(e.x, e.y, 90, e).forEach(function (f) { X.slow(f, 1.5, 0.5); }); } };
  H.dash_lightning = { onDash: function (X, p) { var a = Math.atan2(p.dashVY, p.dashVX); for (var i = 0; i < 5; i++) X.zone({ x: p.x + Math.cos(a) * 16 * i, y: p.y + Math.sin(a) * 16 * i, r: 24, t: 3, every: 0.3, fn: function (z) { X.near(z.x, z.y, z.r).forEach(function (f) { X.hurt(f, p.stats.dmg * 0.35, 'magic'); }); X.burst(z.x, z.y, '#ffe27a', 2, 40); } }); } };
  H.whirl_double = { onCast: function (X, p, slot) { if (slot === 2 && p.classId === 'swordsman') p.mana = Math.max(0, p.mana - (p.cost.spell2 || 0) * 0.5); },
    tick: function (X, p) { var s = X.st(p); if (p.whirlT > 0 && s.wt !== undefined && s.wt <= 0.03 && p.whirlTick > 0.1) { X.area(p.x, p.y, 34 * (1 + (p.mods.aoePct || 0)), 0.8, 'slash'); } s.wt = p.whirlT > 0 ? p.whirlTick : undefined; } };
  H.slam5 = { onHit: function (X, p, e, d, t, c) { if (!(c.basic && c.melee)) return; var s = X.st(p); s.n = (s.n || 0) + 1; if (s.n >= 5) { s.n = 0; X.area(e.x, e.y, 70, 1.2, 'slash'); X.near(e.x, e.y, 70).forEach(function (f) { X.knock(f, e.x, e.y, 40); }); X.ring(e.x, e.y, 70, '#d8c8a0'); X.shake(5); } } };
  H.bane = { dmgMul: function (X, p, e) { return (e.elite || e.boss || e.miniBoss || e.nightStalker) ? 2 : 0.85; } };
  H.execute = { onHit: function (X, p, e) { if (alive(e) && e.hp <= e.maxHp * (e.boss ? 0.1 : 0.3)) { X.hurt(e, e.hp + 5, 'slash'); X.text(e.x, e.y - 20, 'EXECUTED', '#ff5a4a', 12); } } };
  H.crusher = { onHit: function (X, p, e, d, t) { if (t === 'bash' && alive(e)) { X.stun(e, 1.5); if (e.armored) { e.armored = false; X.later(4, function () { e.armored = true; }); } } } };
  H.ragewind = { onHit: function (X, p, e, d, t, c) { if (!c.basic) return; var s = X.st(p); s.rage = Math.min(8, (s.rage || 0) + 1); s.rageT = 4; },
    tick: function (X, p, dt) { var s = X.st(p); if (s.rageT > 0) { s.rageT -= dt; if (p.cd && p.cd.attack > 0) p.cd.attack = Math.max(0, p.cd.attack - dt * 0.06 * (s.rage || 0)); } else s.rage = 0; } };
  H.bloodmoon = { onKill: function (X, p) { var s = X.st(p); s.ks = (s.ks || []).filter(function (t) { return now - t < 3; }); s.ks.push(now); if (s.ks.length >= 3) { s.fr = 5; s.ks = []; X.text(p.x, p.y - 30, 'BLOOD MOON', '#ff3a4a', 13); } },
    onHit: function (X, p, e, d) { var s = X.st(p); if (s.fr > 0) X.heal(p, d * 0.08); }, tick: function (X, p, dt) { var s = X.st(p); if (s.fr > 0) s.fr -= dt; } };
  H.thunder_ring = { onHit: function (X, p, e, d, t) { var s = X.st(p); if (t !== 'bash' || now - (s.tr || -9) < 0.4) return; s.tr = now; X.near(p.x, p.y, 120).forEach(function (f) { X.hurt(f, p.stats.dmg * 0.7, 'magic'); }); X.ring(p.x, p.y, 120, '#9fd0ff'); X.burst(p.x, p.y, '#cfe8ff', 14, 150); } };
  H.ironvow = { onHurt: function (X, p, amt) { return p.atkAnim > 0 ? amt * 0.75 : amt; } };
  H.sun_column = { onCharge: function (X, p) { var t = X.nearest(p.x, p.y, 230), x = t ? t.x : p.x + (p.aimX || p.face || 1) * 90, y = t ? t.y : p.y + (p.aimY || 0) * 90; X.ring(x, y, 50, '#ffe07a'); X.heal(p, p.maxHp * 0.04); X.zone({ x: x, y: y, r: 50, t: 2.5, every: 0.4, fn: function (z) { X.near(z.x, z.y, z.r).forEach(function (f) { X.hurt(f, p.stats.dmg * 0.9, 'fire'); }); X.burst(z.x, z.y, '#ffe07a', 6, 80); } }); } };
  H.cleave = { dmgMul: function (X, p) { return 1 + 0.01 * (X.st(p).cs || 0); },
    onHit: function (X, p, e, d, t, c) { if (c.basic && c.melee) X.near(e.x, e.y, 50, e).forEach(function (f) { X.hurt(f, d * 0.4, 'slash'); }); },
    onKill: function (X, p) { var s = X.st(p); s.cs = Math.min(30, (s.cs || 0) + 1); }, onHurt: function (X, p, amt) { var s = X.st(p); s.cs = Math.max(0, (s.cs || 0) - 5); return amt; } };
  H.lifesteal_big = { onHit: function (X, p, e, d) { X.heal(p, d * 0.08); } };
  // wizard
  H.spell_pierce = { onHit: function (X, p, e, d, t, c) { if (!c.spell) return; var f = X.nearest(e.x, e.y, 90, e); if (f) { X.hurt(f, d * 0.5, 'magic'); X.chain([{ x: e.x, y: e.y }, { x: f.x, y: f.y }]); } } };
  H.chain_lightning = { onHit: function (X, p, e, d, t, c) { if (!c.basic) return; var a = X.near(e.x, e.y, 110, e).slice(0, 2); a.forEach(function (f) { X.hurt(f, d * 0.5, 'lightning'); }); if (a.length) X.chain([e].concat(a).map(function (f) { return { x: f.x, y: f.y }; })); } };
  H.mana_thorn = { dmgMul: function (X, p) { return p.mana >= p.maxMana * 0.99 ? 1.4 : 1; }, onKill: function (X, p) { p.mana = Math.min(p.maxMana, p.mana + 6); } };
  H.rimefall = {};
  H.twinflame = { onCast: function (X, p, slot) { var h = CC.Classes._h; if (slot !== 1 || p.classId !== 'wizard' || !h || !h.shoot) return; var d = h.aimDir(p, 190); h.shoot(p, d.a + 0.32, 170, 1.2, 2.4, 6, 'fire', 'fire', '#ff8a3c', { aoe: 40, ability: 'spell1' }); } };
  H.cinderspire = { onHit: function (X, p, e, d, t) { var s = X.st(p); if (t !== 'fire' || now - (s.cz || -9) < 0.5) return; s.cz = now; X.zone({ x: e.x, y: e.y, r: 34, t: 4, every: 0.5, fn: function (z) { X.near(z.x, z.y, z.r).forEach(function (f) { X.hurt(f, p.stats.dmg * 0.25, 'fire'); }); X.burst(z.x, z.y, '#ff8a3c', 3, 50); } }); } };
  H.prism = { onCast: function (X, p) { var t = X.nearest(p.x, p.y, 180), k = Math.floor(R() * 4), names = ['FIRE', 'FROST', 'STORM', 'ARCANE'], cols = ['#ff8a3c', '#9fe3ff', '#ffe27a', '#c8a0ff']; X.text(p.x, p.y - 30, names[k], cols[k], 11); if (!t && k !== 3) return;
    if (k === 0) X.ignite(t, 3, p.stats.dmg * 0.4); else if (k === 1) X.near(t.x, t.y, 90).forEach(function (f) { X.chill(f); }); else if (k === 2) { var a = [t].concat(X.near(t.x, t.y, 120, t).slice(0, 2)); a.forEach(function (f) { X.hurt(f, p.stats.dmg * 0.8, 'lightning'); }); X.chain(a.map(function (f) { return { x: f.x, y: f.y }; })); } else p.mana = Math.min(p.maxMana, p.mana + p.maxMana * 0.1); } };
  H.voidlens = { onHit: function (X, p, e, d, t, c) { if (c.spell) X.near(e.x, e.y, 80, e).forEach(function (f) { X.pull(f, e.x, e.y, 22); }); } };
  H.aetherwhip = { onHit: function (X, p) { var s = X.st(p); s.h = (s.h || 0) + 1; if (s.h >= 4) { s.h = 0; if (p.cd) { p.cd.spell1 = Math.max(0, p.cd.spell1 - 1); p.cd.spell2 = Math.max(0, p.cd.spell2 - 1); } X.text(p.x, p.y - 24, '-1s', '#c8a0ff', 9); } } };
  H.glacier = {}; H.vael = {};
  H.starfall = { onCast: function (X, p) { X.later(1, function () { var t = X.nearest(p.x, p.y, 260); if (!t) return; X.area(t.x, t.y, 44, 1.6, 'magic'); X.burst(t.x, t.y, '#fff0a0', 14, 120); X.ring(t.x, t.y, 44, '#fff0a0'); X.shake(3); }); } };
  H.hourglass = { onHurt: function (X, p, amt) { var s = X.st(p); if (p.hp / p.maxHp < 0.4 && now - (s.hg || -99) > 30) { s.hg = now; X.near(p.x, p.y, 170).forEach(function (f) { X.slow(f, 4, 0.35); }); X.text(p.x, p.y - 30, 'TIME SLOWS', '#9fd0ff', 13); X.ring(p.x, p.y, 170, '#9fd0ff'); } return amt; } };
  H.lastword = { dmgMul: function (X, p) { return X.st(p).lw > 0 ? 2 : 1; }, onCast: function (X, p, slot) { var s = X.st(p); s.c = (s.c || 0) + 1; if (s.c >= 10) { s.c = 0; p.mana = Math.min(p.maxMana, p.mana + (p.cost['spell' + slot] || 0)); if (p.cd) p.cd['spell' + slot] = 0; s.lw = 3; X.text(p.x, p.y - 30, 'THE LAST WORD', '#ffd36b', 12); } }, tick: function (X, p, dt) { var s = X.st(p); if (s.lw > 0) s.lw -= dt; } };
  // necromancer
  H.raise_on_kill = { onKill: function (X, p) { if (R() < 0.15) X.raise(p, 1); } };
  H.unearth = { onKill: function (X, p, e) { var Lt = CC.Loot; if (!Lt || !Lt.drops || R() > 0.25) return; Lt.drops.push(Lt._spawn(R() < 0.7 ? 'gold' : 'potion', e.x, e.y, R() < 0.7 ? { amount: 6 + Math.round((e.floor || 1) * 3), color: '#ffd24a' } : { color: '#ff7ad0' })); } };
  H.bonechoir = { tick: function (X, p, dt) { (CC.Classes.minions || []).forEach(function (m) { if (m.atkCd > 0) m.atkCd -= dt * 0.2; }); } };
  H.hexbone = { onHit: function (X, p, e) { e._hex = true; e.vulnT = Math.max(e.vulnT || 0, 6); e.vulnMul = Math.max(e.vulnMul || 1, 1.15); },
    onKill: function (X, p, e) { if (!e._hex) return; var f = X.nearest(e.x, e.y, 140, e); if (f) { f._hex = true; f.vulnT = 6; f.vulnMul = Math.max(f.vulnMul || 1, 1.15); X.chain([{ x: e.x, y: e.y }, { x: f.x, y: f.y }]); } } };
  H.marrow = { onMinionHit: function (X, p) { var s = X.st(p); if (now - (s.ml || -9) < 0.25) return; s.ml = now; X.heal(p, p.maxHp * 0.01); } };
  H.minion_surge = { onCast: function (X, p) { (CC.Classes.minions || []).forEach(function (m) { if (!m._d0) { m._d0 = m.dmg; m.dmg = m._d0 * 1.3; X.later(6, function () { m.dmg = m._d0; m._d0 = 0; }); } }); } };
  H.ghoulpiper = { tick: function (X, p) { (CC.Classes.minions || []).forEach(function (m) { if (!m._gh) { m._gh = 1; m.hp *= 2; m.maxHp *= 2; m.r += 1.5; } }); } };
  H.soulwell = { onHit: function (X, p, e, d, t) { if (t !== 'drain') return; var a = X.near(e.x, e.y, 120, e).slice(0, 2); a.forEach(function (f) { X.hurt(f, d * 0.5, 'drain'); }); if (a.length) X.heal(p, d * 0.2); } };
  H.nightwarden = { onHit: function (X, p, e, d, t) { if (t === 'drain') { e.vulnT = Math.max(e.vulnT || 0, 5); e.vulnMul = Math.max(e.vulnMul || 1, 1.15); } } };
  H.censer = { onHit: function (X, p, e, d, t) { var s = X.st(p); if (t !== 'poison' || now - (s.mz || -9) < 0.8) return; s.mz = now; X.zone({ x: e.x, y: e.y, r: 40, t: 5, every: 0.5, fn: function (z) { X.near(z.x, z.y, z.r).forEach(function (f) { X.hurt(f, p.stats.dmg * 0.2, 'poison'); }); X.burst(z.x, z.y, '#9acd32', 2, 40); } }); } };
  H.sepulcher = { flags: { legionLeg: 1.5 } };
  H.memento = { onKill: function (X, p) { X.st(p).mm = 4; }, dmgMul: function (X, p) { return X.st(p).mm > 0 ? 1.5 : 1; }, onHit: function (X, p) { X.st(p).mm = 0; }, tick: function (X, p, dt) { var s = X.st(p); if (s.mm > 0) s.mm -= dt; } };
  H.lich = { dmgMul: function (X, p) { return X.st(p).lich > 0 ? 1.5 : 1; },
    onHurt: function (X, p, amt) { var s = X.st(p); if (s.lich > 0) return 0; var armor = (p.stats && p.stats.armor) || 0, real = amt * 100 / (100 + armor); if (p.hp - real <= 0 && now - (s.lc || -999) > 90) { s.lc = now; s.lich = 6; p.hp = Math.max(1, p.hp); X.text(p.x, p.y - 34, 'LICH FORM', '#c8a0ff', 14); X.ring(p.x, p.y, 90, '#c8a0ff'); return 0; } return amt; },
    tick: function (X, p, dt) { var s = X.st(p); if (s.lich > 0) { s.lich -= dt; p.hp = Math.max(p.hp, 1); } } };
  H.regalia = { tick: function (X, p) { var s = X.st(p); if (p.hp / p.maxHp < 0.5 && now - (s.rg || -99) > 30) { s.rg = now; X.raise(p, 8); X.text(p.x, p.y - 30, 'THE DEAD RISE', '#c8a0ff', 12); } } };
  // thief
  H.backstab_crit = { dmgMul: function (X, p, e, d, t, c) { return c.melee && X.behind(p, e) ? 1.4 : 1; }, onHit: function (X, p, e, d, t, c) { if (c.melee && X.behind(p, e)) X.bleed(e, 1); } };
  H.locksmith = { tick: function (X, p) { var s = X.st(p), m = CC.state && CC.state.map, D = CC.Dungeon; if (!m || !m.chests || !D || !D.openChest || CC.Loot === undefined) return; m.chests.forEach(function (c) { if (c.opened || Math.hypot(c.x - p.x, c.y - p.y) > 44) return; if (D.openChest(c)) { if (CC.Audio) CC.Audio.event('chest', { x: c.x, y: c.y }); CC.Loot.roll(c, (CC.state.floor || 1), 0); CC.Loot.roll({ x: c.x, y: c.y, tier: 0, opened: true, isChest: true }, (CC.state.floor || 1), 0); X.text(c.x, c.y - 20, 'PICKED', '#ffd36b', 10); } }); } };
  H.kris = { onHit: function (X, p, e) { e._kb = Math.min(3, (e._kb || 0) + 1); X.bleed(e, e._kb); } };
  H.poison_dagger = { onHit: function (X, p, e, d, t, c) { if (c.basic || c.melee) X.poison(e, 3, p.stats.dmg * 0.3); if (c.crit && p.cd) p.cd.dash = 0; } };
  H.cutpurse = { onHit: function (X, p, e, d, t, c) { if (!c.melee || R() > 0.25) return; var g = Math.max(1, Math.round(2 + (p.level || 1) * 0.4)) * (alive(e) && e.hp < e.maxHp * 0.3 ? 3 : 1), s = CC.state; if (s) s.gold = (s.gold || 0) + g; X.text(e.x, e.y - 24, '+' + g + ' G', '#ffd24a', 10); } };
  H.venomtongue = { onHit: function (X, p, e, d, t) { if (t !== 'shard') return; e._ven = Math.min(5, (e._ven || 0) + 1); X.poison(e, 4, p.stats.dmg * 0.15 * e._ven); } };
  H.shiv = { onDash: function (X, p) { X.later(0.22, function () { var t = X.nearest(p.x, p.y, 95); if (!t) return; X.hurt(t, p.stats.dmg * 1.5, 'slash'); X.bleed(t, 1); X.text(t.x, t.y - 20, 'BACKSTAB', '#7de0b8', 10); X.burst(t.x, t.y, '#7de0b8', 8, 90); }); } };
  H.ace = { dmgMul: function (X, p, e) { var heads = R() < 0.5; X.st(p).coin = heads; return heads ? 2 : 0.01; }, onHit: function (X, p, e, d) { var s = X.st(p); X.text(e.x + 6, e.y - 30, s.coin ? 'HEADS' : 'TAILS', s.coin ? '#ffd24a' : '#9aa', 9); if (alive(e) && !e.boss && R() < 0.01) { X.hurt(e, e.hp + 5, 'slash'); X.text(e.x, e.y - 40, 'ACE!', '#ff4a5a', 14); } } };
  H.mirage = { onCast: function (X, p, slot) { if (slot === 2) X.near(p.x, p.y, 130).forEach(function (f) { X.stun(f, 1.5); }); } };
  H.hailstorm = { onCast: function (X, p, slot) { var h = CC.Classes._h; if (slot !== 1 || p.classId !== 'thief' || !h || !h.shoot) return; var d = h.aimDir(p, 170); [-0.75, -0.45, 0.45, 0.75].forEach(function (o) { h.shoot(p, d.a + o, 300, 0.6, 0.8, 3, 'frost', 'knife', '#bfe8ff'); }); } };
  H.eclipse = { onHit: function (X, p, e, d, t) { if (t === 'shadow' && alive(e)) X.hurt(e, d * 0.75, 'shadow'); } };
  H.requiem = { dmgMul: function (X, p) { return (p.ambushT > 0 || p.smokeT > 0) ? 3 : 1; } };
  H.chakram = { onHit: function (X, p, e, d, t, c) { if (!c.basic || R() > 0.3) return; X.later(0.4, function () { if (alive(e)) { X.hurt(e, d * 0.8, 'slash'); X.burst(e.x, e.y, '#cfd8e6', 6, 90); } }); } };
  H.widowmaker = { dmgMul: function (X, p, e) { return 1 + 0.04 * (e._mark || 0); }, onHit: function (X, p, e) { e._mark = Math.min(5, (e._mark || 0) + 1); } };
  // bound to bosses
  H.rictus = { forceCrit: function (X, p) { return X.st(p).rc > 0; }, onKill: function (X, p) { X.st(p).rc = 3; }, onHit: function (X, p, e, d, t, c) { var s = X.st(p); if (s.rc > 0 && c.crit) { s.rc = 0; X.stun(e, 1); } }, tick: function (X, p, dt) { var s = X.st(p); if (s.rc > 0) s.rc -= dt; } };
  H.stitch = { dmgMul: function (X, p) { var s = X.st(p); if (s.sm !== CC.Dungeon) { s.sm = CC.Dungeon; s.kinds = {}; } return 1 + 0.01 * Object.keys(s.kinds || {}).length; }, onKill: function (X, p, e) { var s = X.st(p); if (s.sm !== CC.Dungeon) { s.sm = CC.Dungeon; s.kinds = {}; } s.kinds[e.type] = 1; } };
  H.trident = { dmgMul: function (X, p, e, d, t) { return e._wet > now && (t === 'frost' || t === 'lightning' || t === 'magic') ? 2 : 1; }, onHit: function (X, p, e) { e._wet = now + 5; } };
  H.poker = { onHit: function (X, p, e, d, t, c) { if (c.melee || c.basic) { X.ignite(e, 3, p.stats.dmg * 0.25); var s = X.st(p); if (now - (s.pk || -9) > 0.4) { s.pk = now; X.heal(p, p.maxHp * 0.01); } } } };
  H.brand = { dmgMul: function (X, p, e, d, t) { return t === 'fire' ? 1.3 : 1; }, onHurt: function (X, p, amt) { var s = X.st(p); if (p.hp / p.maxHp < 0.3 && now - (s.bn || -99) > 20) { s.bn = now; X.area(p.x, p.y, 100, 2, 'fire'); X.ring(p.x, p.y, 100, '#ff8a3c'); X.burst(p.x, p.y, '#ff8a3c', 24, 160); X.shake(6); X.text(p.x, p.y - 30, 'EMBERHEART', '#ff8a3c', 13); } return amt; } };
  // bound to night stalkers
  H.rictusfang = { onDash: function (X, p) { var t = X.nearest(p.x, p.y, 240); if (!t) return; var nx = t.x - (t.face || 1) * 22, ny = t.y, D = CC.Dungeon; if (D && D.isSolid && D.isSolid(nx, ny)) return; p.x = nx; p.y = ny; C2(p, t); } };
  function C2(p, t) { CC.Classes.hitEnemy(t, p.stats.dmg * 1.8, 'slash', { preRolledCrit: true, splash: true, _lg: true }); X.text(t.x, t.y - 22, 'FROM BEHIND', '#ff5a4a', 11); X.burst(t.x, t.y, '#ff5a4a', 10, 110); }
  H.hook = { onHit: function (X, p, e, d, t, c) { if (c.melee && R() < 0.1 && alive(e) && !e.boss) { X.pull(e, p.x, p.y, 60); X.stun(e, 0.5); X.chain([{ x: p.x, y: p.y }, { x: e.x, y: e.y }]); } } };
  H.threads = { onHit: function (X, p, e, d, t, c) { if (!c.spell) return; e._th = (e._th || 0) + 1; if (!e._thT) { e._thT = true; X.later(3, function () { var n = e._th || 1; e._th = 0; e._thT = false; if (alive(e)) { X.area(e.x, e.y, 50, 0.6 * n, 'magic'); X.burst(e.x, e.y, '#c8a0ff', 10, 100); } }); } } };
  H.web = { onHit: function (X, p, e) { X.slow(e, 2, 0.6); }, onKill: function (X, p, e) { if (e.slowT > 0 && R() < 0.2) X.raise(p, 1); } };
  H.shriek = { onHit: function (X, p) { var s = X.st(p); s.sh = (s.sh || 0) + 1; if (s.sh >= 8) { s.sh = 0; X.near(p.x, p.y, 90).forEach(function (f) { X.stun(f, 1.2); }); X.ring(p.x, p.y, 90, '#e8c0c0'); X.text(p.x, p.y - 30, 'SHRIEK', '#e8c0c0', 12); } } };
  H.bloom = { onKill: function (X, p, e) { var x = e.x, y = e.y; X.zone({ x: x, y: y, r: 12, t: 3, every: 1, fn: function (z) { X.burst(z.x, z.y, '#c0384a', 3, 40); } }); X.later(3, function () { X.area(x, y, 55, 1.5, 'poison'); X.burst(x, y, '#c0384a', 16, 120); X.ring(x, y, 55, '#c0384a'); }); } };
  H.hound = { mods: { speedPct: 0.2 }, onDash: function (X, p) { var a = Math.atan2(p.dashVY, p.dashVX); for (var i = 0; i < 4; i++) X.zone({ x: p.x + Math.cos(a) * 16 * i, y: p.y + Math.sin(a) * 16 * i, r: 22, t: 2.5, every: 0.4, fn: function (z) { X.near(z.x, z.y, z.r).forEach(function (f) { X.hurt(f, p.stats.dmg * 0.25, 'fire'); }); X.burst(z.x, z.y, '#ff7a1a', 2, 40); } }); } };
  H.gloomreach = { dmgMul: function (X, p, e) { return (e.asleep || (p.x - e.x) * (e.face || 1) < 0) ? 1.8 : 1; } };
  H.maw = { onHit: function (X, p, e, d, t, c) { if (!c.melee) return; X.heal(p, d * 0.03); var s = X.st(p); s.mw = (s.mw || 0) + 1; if (s.mw >= 4) { s.mw = 0; X.area(p.x, p.y, 60, 0.6, 'slash'); X.shake(4); X.ring(p.x, p.y, 60, '#a8b030'); } } };

  /* ---------- the hooks ---------- */
  function ctxOf(opts, type, crit) { var melee = type === 'slash' || type === 'melee' || type === 'physical' || type === 'bash'; return { crit: !!crit, melee: melee, basic: !!(opts && opts.basicAttack), spell: !melee && !(opts && opts.basicAttack) }; }
  if (CC.Classes && CC.Classes.wrapHit) {
    CC.Classes.wrapHit(function (prevHit, e, dmg, type, opts) {
      var p = hero(), it = p && weapon(p), Hd = it && H[idOf(it)];
      if (alive(e) && e.vulnT > 0 && e.vulnMul > 1 && p && !(opts && opts.minion)) dmg *= e.vulnMul; // hexed / marked foes take more damage
      if (!Hd || !p || (opts && opts._lg) || !alive(e)) return prevHit(e, dmg, type, opts);
      opts = opts || {};
      if (opts.minion) { var dm = prevHit(e, dmg, type, opts); if (dm > 0 && Hd.onMinionHit) { try { Hd.onMinionHit(X, p, e, dm); } catch (err) { if (root.console) console.error(err); } } return dm; }
      var crit = false;
      if (!opts.noCrit) { crit = typeof opts.preRolledCrit === 'boolean' ? opts.preRolledCrit : R() < p.stats.crit + (p.smokeT > 0 ? p.smokeCrit || 0 : 0); }
      var ctx = ctxOf(opts, type, crit);
      try {
        if (!opts.noCrit && Hd.forceCrit && Hd.forceCrit(X, p, e)) { crit = true; ctx.crit = true; }
        if (!opts.noCrit && typeof opts.preRolledCrit !== 'boolean' || (crit && opts.preRolledCrit === false)) opts = Object.assign({}, opts, { preRolledCrit: crit });
        if (Hd.dmgMul) dmg *= Math.max(0, Hd.dmgMul(X, p, e, dmg, type, ctx));
      } catch (err) { if (root.console) console.error(err); }
      var dealt = prevHit(e, dmg, type, opts);
      if (dealt > 0 && Hd.onHit) { try { Hd.onHit(X, p, e, dealt, type, ctx); } catch (err2) { if (root.console) console.error(err2); } }
      return dealt;
    });
  }
  function onHurt(p, amount, src) { var it = p === hero() && weapon(p), Hd = it && H[idOf(it)]; if (Hd && Hd.onHurt && amount > 0) { try { amount = Hd.onHurt(X, p, amount, src); } catch (err) { if (root.console) console.error(err); } } return amount; }
  var En = E();
  if (En && En.setHurtHook) En.setHurtHook(onHurt);
  if (CC.Classes && CC.Classes.damage) { // damage that comes in through CC.Classes.damage (hazards, some mini-boss attacks)
    var prevDamage = CC.Classes.damage;
    CC.Classes.damage = function (target, amount, src) { var p = target || hero(); if (p === hero() && amount > 0) { amount = onHurt(p, amount, src); if (!(amount > 0)) return 0; } return prevDamage.call(this, target, amount, src); };
  }
  if (En && En._kill) {
    var prevKill = En._kill;
    En._kill = function (e) {
      var was = e && !e.dead, r = prevKill.apply(this, arguments), p = hero(), it = p && weapon(p), Hd = it && H[idOf(it)];
      if (was && e && e.dead && Hd && Hd.onKill) { try { Hd.onKill(X, p, e); } catch (err) { if (root.console) console.error(err); } }
      return r;
    };
  }
  function applyMods(p, id) { // permanent bonuses while wielded
    var s = X.st(p), old = s.modId, Hd = id && H[id], k;
    if (old === id) return; var Ho = old && H[old], C = CC.Classes;
    if (Ho) { for (k in (Ho.mods || {})) p.mods[k] -= Ho.mods[k]; for (k in (Ho.flags || {})) p.flags[k] = (p.flags[k] || 0) - Ho.flags[k]; }
    if (Hd) { for (k in (Hd.mods || {})) p.mods[k] = (p.mods[k] || 0) + Hd.mods[k]; for (k in (Hd.flags || {})) p.flags[k] = (p.flags[k] || 0) + Hd.flags[k]; }
    s.modId = id; if (C && C.applyItemStats) C.applyItemStats(p);
  }
  function tick(dt) {
    now += dt;
    var p = hero(), i;
    for (i = timers.length - 1; i >= 0; i--) { timers[i].t -= dt; if (timers[i].t <= 0) { var f = timers[i].fn; timers.splice(i, 1); try { f(); } catch (err) { if (root.console) console.error(err); } } }
    for (i = zones.length - 1; i >= 0; i--) { var z = zones[i]; z.t -= dt; z.acc += dt; if (z.acc >= z.every) { z.acc = 0; try { z.fn(z); } catch (err2) { if (root.console) console.error(err2); } } if (z.t <= 0) zones.splice(i, 1); }
    if (!p) return;
    var it = weapon(p), id = it ? idOf(it) : null, Hd = id && H[id], s = X.st(p);
    applyMods(p, id);
    if (!Hd) { s.prev = null; return; }
    if (Hd.tick) { try { Hd.tick(X, p, dt); } catch (err3) { if (root.console) console.error(err3); } }
    // edges: spells going on cooldown, the dash, a charged attack being released
    var pv = s.prev || {}, cd = p.cd || {};
    if (Hd.onCast) { [1, 2].forEach(function (n) { var k = 'spell' + n; if (pv[k] !== undefined && pv[k] <= 0.05 && cd[k] > pv[k] + 0.05) { try { Hd.onCast(X, p, n); } catch (e4) { if (root.console) console.error(e4); } } }); }
    if (Hd.onDash && !(pv.dash > 0) && p.dashT > 0) { try { Hd.onDash(X, p); } catch (e5) { if (root.console) console.error(e5); } }
    var ch = CC.Charge && CC.Charge.state, on = !!(ch && ch.on), tt = ch ? ch.t : 0;
    if (Hd.onCharge && pv.chOn && !on && pv.chT >= 0.4) { try { Hd.onCharge(X, p, Math.min(1, pv.chT / 1.1)); } catch (e6) { if (root.console) console.error(e6); } }
    s.prev = { spell1: cd.spell1, spell2: cd.spell2, dash: p.dashT, chOn: on, chT: tt };
  }
  LG.tick = tick; LG.zones = zones;
  if (En && En.update) { var prevUpdate = En.update; En.update = function (dt) { var r = prevUpdate.apply(this, arguments); try { tick(dt); } catch (err) { if (root.console) console.error(err); } return r; }; }
  LG.ids = function () { return Object.keys(H); };
  LG.reset = function () { zones.length = 0; timers.length = 0; };
})(typeof window !== 'undefined' ? window : globalThis);
