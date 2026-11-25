/* Necromancer tap/hold pairs. SpellCharge owns mana, cooldowns and input.
 *   necromancer_spell1  Raise Skeleton  tap (existing) -> hold: BONE GUARDIAN, one large skeletal guardian instead of several skeletons
 *   necromancer_spell2  Life Drain      tap (existing) -> hold: SOUL SIPHON, a heavy channel that branches to nearby foes (capped)
 *   spear               Bone Spear      tap (existing) -> hold: IMPALING LANCE, a larger spear that pierces more and bursts into splinters
 *   blast               Corpse Blast    tap (existing) -> hold: CORPSE CHAIN, the blast jumps to up to two more corpses with falloff
 *   curse               Hex of Weakness tap (existing) -> hold: WITHERING CURSE, a wider hex that also rots its victims
 * The taps stay the abilities' own casts, so every existing upgrade keeps working. Only the charged versions live here.
 * Corpses: dead foes leave a short-lived corpse token (never a reference to the dead enemy); Corpse Blast uses them, or a living foe if there are none.
 */
(function (root) {
  'use strict';
  const CC = root.CC = root.CC || {};
  const TAU = Math.PI * 2;
  const GREEN = '#9aff7a', BONE = '#f0e8d0', VIOLET = '#b06aff';
  const corpses = [], lances = [], siphons = [], hexes = [], blasts = [], fx = [];
  let scene;

  function restoreHexed() {
    for (const h of hexes) {
      const e = h.enemy;
      if (e && h.dmg !== undefined) { e.dmg = h.dmg; if (h.spd !== undefined) e.spd = h.spd; }
    }
  }
  function clear() {
    restoreHexed();
    corpses.length = lances.length = siphons.length = hexes.length = blasts.length = fx.length = 0;
    scene = undefined;
  }
  function sync() {
    const state = CC.state, player = state?.player;
    if (!player || player.hp <= 0 || state.mode !== 'dungeon') { clear(); return false; }
    if (!scene || scene.state !== state || scene.player !== player || scene.area !== state.area || scene.floor !== state.floor) {
      clear();
      scene = { state, player, area: state.area, floor: state.floor };
    }
    return true;
  }
  function solid(x, y) { return CC.Dungeon?.isSolid?.(x, y); }
  function clearLine(x, y, tx, ty) {
    const count = Math.max(1, Math.ceil(Math.hypot(tx - x, ty - y) / 6));
    for (let i = 1; i <= count; i++) if (solid(x + (tx - x) * i / count, y + (ty - y) * i / count)) return false;
    return true;
  }
  function enemies() {
    return (CC.Enemies?.list || []).filter(e => e.hp > 0 && !e.dead && !e.collapsed);
  }
  function nearby(x, y, radius) {
    return enemies().filter(e => Math.hypot(e.x - x, e.y - y) <= radius + (e.r || 8) && clearLine(x, y, e.x, e.y));
  }
  function hit(e, damage, type = 'bone') {
    return CC.Classes?.hitEnemy?.(e, Math.max(1, damage), type, { noCrit: true, attackKind: 'spell', splash: true }) || 0;
  }
  function base(player, id) { return (player.stats?.dmg || 10) * (CC.Skills?.dmgMul?.(player, id) || 1); }
  function text(x, y, s, c) { CC.fx?.text?.(x, y, s, c, 11); }
  function burst(x, y, c, n) { CC.fx?.burst?.(x, y, c, n, 100); }
  function add(list, item, cap = 48) { if (list.length < cap) list.push(item); return item; }
  function angleOf(player, aim) { return Math.atan2(aim.dy ?? player.aimY ?? 0, aim.dx ?? player.aimX ?? player.face ?? 1); }

  /* ---------- corpse tokens: a dead foe leaves a short-lived marker, so a corpse can never be hit twice or kept alive by a stale reference ---------- */
  const E = CC.Enemies;
  if (E && typeof E._kill === 'function' && !E._corpseHooked) {
    const kill = E._kill;
    E._kill = function (enemy) {
      const result = kill.apply(this, arguments);
      if (enemy && enemy.dead && !enemy.boss && (enemy.r || 8) < 26 && corpses.length < 24 && sync())
        corpses.push({ x: enemy.x, y: enemy.y, r: enemy.r || 8, t: 14 });
      return result;
    };
    E._corpseHooked = true;
  }
  function nearestCorpse(x, y, range, skip) {
    let best, bd = range * range;
    for (const c of corpses) {
      if (skip?.has(c)) continue;
      const d = (c.x - x) ** 2 + (c.y - y) ** 2;
      if (d <= bd) { bd = d; best = c; }
    }
    return best;
  }

  /* ---------- 1. Bone Guardian ---------- */
  function boneGuardian({ player, x, y, power }) {
    const minions = CC.Classes?.minions;
    if (!minions) return false;
    const cap = 3 + Math.floor((player.level || 1) / 5) + 2 * (player.flags?.legion || 0);
    while (minions.length && minions.length > Math.max(0, cap - 3)) minions.shift(); // the guardian takes the place of up to three skeletons
    const gx = Math.hypot(x - player.x, y - player.y) < 150 ? x : player.x + (x - player.x) * 0.5;
    const gy = Math.hypot(x - player.x, y - player.y) < 150 ? y : player.y + (y - player.y) * 0.5;
    const hp = (33 + (player.level || 1) * 3.4) * (3.2 + power * 0.6) * (1 + 0.4 * (player.flags?.sturdy || 0));
    minions.push({ x: solid(gx, gy) ? player.x : gx, y: solid(gx, gy) ? player.y : gy, r: 10, hp, maxHp: hp, life: 22, atkCd: 0,
      dmg: (5 + (player.stats?.dmg || 10) * 0.62) * (2 + power * 0.4), anim: 0, face: 1, spawn: 0.6, charged: true, guardian: true });
    add(fx, { kind: 'guardian', x: gx, y: gy, t: 0, life: 0.9 });
    text(gx, gy - 24, 'BONE GUARDIAN', BONE);
    burst(gx, gy, BONE, 22);
    CC.fx?.shake?.(4);
    return true;
  }

  /* ---------- 2. Soul Siphon ---------- */
  function soulSiphon({ player, angle, power, id }) {
    const foes = enemies().filter(e => {
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      const a = Math.atan2(e.y - player.y, e.x - player.x), diff = Math.abs(Math.atan2(Math.sin(a - angle), Math.cos(a - angle)));
      return d <= 190 + (e.r || 8) && diff < 0.75 && clearLine(player.x, player.y, e.x, e.y);
    }).sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y));
    if (!foes.length) return false;
    siphons.length = 0; // one channel at a time
    add(siphons, { player, id, primary: foes[0], t: 0, life: 1.8, tick: 0, power, healed: 0, branches: [], base: base(player, id) });
    text(player.x, player.y - 30, 'SOUL SIPHON', GREEN);
    return true;
  }
  function updateSiphon(s, dt) {
    const { player } = s;
    s.t += dt; s.tick -= dt;
    if (s.t >= s.life || !player || player.hp <= 0 || !(s.primary.hp > 0) || s.primary.dead) { s.done = true; return; }
    if (s.tick > 0) return;
    s.tick = 0.2;
    const dealt = hit(s.primary, s.base * (0.5 + s.power * 0.25), 'drain');
    s.branches = nearby(s.primary.x, s.primary.y, 95).filter(e => e !== s.primary).slice(0, 2); // branches are capped at two foes
    let total = dealt;
    for (const e of s.branches) total += hit(e, s.base * 0.28, 'drain');
    const room = player.maxHp * 0.25 - s.healed; // the whole channel can heal at most a quarter of max health
    const heal = Math.max(0, Math.min(room, total * 0.2));
    if (heal > 0 && CC.Classes?.heal) { CC.Classes.heal(player, heal); s.healed += heal; }
    burst(s.primary.x, s.primary.y, GREEN, 3);
  }

  /* ---------- 3. Impaling Lance ---------- */
  function lance({ player, dx, dy, angle, power, id }) {
    add(lances, { x: player.x + dx * 10, y: player.y + dy * 10 - 2, dx, dy, angle, speed: 330, range: 300 + power * 40, travelled: 0,
      pierce: Math.min(7, 5 + (CC.Skills?.effRank?.(player, id) || 0)), hitSet: new Set(), damage: base(player, id) * (2.5 + power * 0.7), id });
    player.castFlash = 0.3;
    return true;
  }
  function lanceBurst(l, why) {
    for (let i = 0; i < 7; i++) {
      const a = l.angle + (i / 6 - 0.5) * 2.4;
      add(fx, { kind: 'splinter', x: l.x, y: l.y, a, t: 0, life: 0.5, len: 14 });
    }
    for (const e of nearby(l.x, l.y, 44)) if (!l.hitSet.has(e)) hit(e, l.damage * 0.32, 'bone');
    burst(l.x, l.y, BONE, 10);
    CC.fx?.shake?.(why === 'wall' ? 2 : 3);
  }
  function updateLance(l, dt) {
    const step = l.speed * dt, sub = Math.max(1, Math.ceil(step / 6));
    for (let i = 0; i < sub; i++) {
      l.x += l.dx * step / sub; l.y += l.dy * step / sub; l.travelled += step / sub;
      if (solid(l.x, l.y)) { lanceBurst(l, 'wall'); l.done = true; return; }
      for (const e of enemies()) {
        if (l.hitSet.has(e) || Math.hypot(e.x - l.x, e.y - l.y) > (e.r || 8) + 7) continue;
        l.hitSet.add(e);
        hit(e, l.damage, 'bone');
        CC.Classes?.status?.(e, 'slow', 1.2, 0.5);
        burst(e.x, e.y, BONE, 5);
        if (l.hitSet.size >= l.pierce) { lanceBurst(l, 'foe'); l.done = true; return; }
      }
      if (l.travelled >= l.range) { lanceBurst(l, 'range'); l.done = true; return; }
    }
  }

  /* ---------- 4. Corpse Chain ---------- */
  function detonate(x, y, damage, radius, color) {
    for (const e of nearby(x, y, radius)) {
      hit(e, damage, 'bone');
      CC.Classes?.status?.(e, 'slow', 1.2, 0.6);
    }
    add(fx, { kind: 'blast', x, y, t: 0, life: 0.55, radius, color });
    burst(x, y, color, 14);
    CC.fx?.shake?.(3);
  }
  function corpseChain({ player, x, y, power, id }) {
    const dmg = base(player, id) * (1.9 + power * 0.4);
    let first = nearestCorpse(x, y, 150);
    let at;
    if (first) at = { x: first.x, y: first.y };
    else { // no corpse around: a living foe is the fallback
      const living = nearby(x, y, 110).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
      if (!living) return false;
      at = { x: living.x, y: living.y };
    }
    const used = new Set();
    if (first) { used.add(first); corpses.splice(corpses.indexOf(first), 1); }
    detonate(at.x, at.y, dmg, 52, GREEN);
    let from = at;
    for (let hop = 1; hop <= 2; hop++) {
      const next = nearestCorpse(from.x, from.y, 118, used);
      if (!next) break;
      used.add(next);
      add(blasts, { x: next.x, y: next.y, fromX: from.x, fromY: from.y, wait: 0.22 * hop, damage: dmg * (hop === 1 ? 0.7 : 0.5), corpse: next });
      from = next;
    }
    return true;
  }

  /* ---------- 5. Withering Curse ---------- */
  function withering({ player, x, y, power, id }) {
    const radius = 78 + power * 24, foes = nearby(x, y, radius);
    add(fx, { kind: 'hex', x, y, t: 0, life: 1.1, radius });
    if (!foes.length) { text(x, y - 18, 'WITHERING CURSE', VIOLET); return true; }
    const dps = base(player, id) * 0.34;
    for (const e of foes) {
      let h = hexes.find(q => q.enemy === e);
      if (!h) {
        if (hexes.length >= 40) continue;
        h = { enemy: e, t: 0, life: 6, tick: 0.5, dmg: e.dmg, dps };
        if (!e.boss && !e.miniBoss && !e.stitched) { h.spd = e.spd; e.spd = e.spd * 0.72; }
        e.dmg = Math.max(1, Math.round(e.dmg * (e.boss ? 0.85 : 0.65)));
        hexes.push(h);
      }
      h.t = 0; h.life = 6; h.dps = Math.max(h.dps, dps);
    }
    text(x, y - 18, 'WITHERING CURSE', VIOLET);
    return true;
  }
  function updateHex(h, dt) {
    h.t += dt; h.tick -= dt;
    const e = h.enemy;
    if (!e || e.dead || e.hp <= 0) { h.done = true; return; }
    if (h.tick <= 0) { h.tick = 0.5; hit(e, h.dps * 0.5, 'curse'); } // the rot: damage over time (capped by its short life)
    if (h.t >= h.life) {
      e.dmg = h.dmg;
      if (h.spd !== undefined) e.spd = h.spd;
      h.done = true;
    }
  }

  /* ---------- loop ---------- */
  function sweep(list, fn, dt) {
    for (let i = list.length - 1; i >= 0; i--) { fn(list[i], dt); if (list[i].done) list.splice(i, 1); }
  }
  function update(dt) {
    if (!sync()) return;
    for (let i = corpses.length - 1; i >= 0; i--) if ((corpses[i].t -= dt) <= 0) corpses.splice(i, 1);
    sweep(lances, updateLance, dt);
    sweep(siphons, updateSiphon, dt);
    sweep(hexes, updateHex, dt);
    sweep(blasts, (b, d) => {
      b.wait -= d;
      if (b.wait > 0) return;
      const i = corpses.indexOf(b.corpse);
      if (i >= 0) corpses.splice(i, 1);
      detonate(b.x, b.y, b.damage, 48, GREEN);
      b.done = true;
    }, dt);
    for (let i = fx.length - 1; i >= 0; i--) { fx[i].t += dt; if (fx[i].t >= fx[i].life) fx.splice(i, 1); }
  }

  /* ---------- drawing (world space, above the ground fx) ---------- */
  function draw(ctx, cam) {
    if (!lances.length && !siphons.length && !fx.length && !hexes.length && !blasts.length) return;
    const t = (CC.Enemies?._time || 0);
    ctx.save();
    ctx.lineCap = 'round';
    for (const l of lances) { // a long bone spear with notches and a green glow
      const x = l.x - cam.x, y = l.y - cam.y;
      ctx.save(); ctx.translate(x, y); ctx.rotate(l.angle);
      ctx.fillStyle = 'rgba(154,255,122,0.22)'; ctx.beginPath(); ctx.ellipse(-8, 0, 30, 6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = BONE; ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(1, -4); ctx.lineTo(-24, -2.2); ctx.lineTo(-24, 2.2); ctx.lineTo(1, 4); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#8c7e66'; ctx.lineWidth = 1; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(-4 - k * 5, -3); ctx.lineTo(-6 - k * 5, 3); ctx.stroke(); }
      ctx.restore();
    }
    for (const s of siphons) { // jagged green channels with skulls drifting up them
      const pts = [[s.player.x, s.player.y - 4, s.primary.x, s.primary.y - 4, 3.2], ...s.branches.map(b => [s.primary.x, s.primary.y - 4, b.x, b.y - 4, 1.8])];
      for (const [x1, y1, x2, y2, w] of pts) {
        ctx.strokeStyle = 'rgba(154,255,122,' + (0.5 + 0.25 * Math.sin(t * 20)) + ')'; ctx.lineWidth = w; ctx.beginPath();
        ctx.moveTo(x1 - cam.x, y1 - cam.y);
        for (let k = 1; k <= 6; k++) { const u = k / 6, j = Math.sin(t * 25 + k * 2) * 3 * (1 - Math.abs(u - 0.5) * 2); ctx.lineTo(x1 + (x2 - x1) * u - cam.x + j, y1 + (y2 - y1) * u - cam.y - j); }
        ctx.stroke();
        const m = ((t * 1.6) % 1); ctx.fillStyle = '#e8ffd8'; ctx.beginPath(); ctx.arc(x1 + (x2 - x1) * m - cam.x, y1 + (y2 - y1) * m - cam.y, 2.2, 0, TAU); ctx.fill();
      }
    }
    for (const h of hexes) { // a rotting rune over each cursed foe
      const e = h.enemy; if (!e) continue;
      const x = e.x - cam.x, y = e.y - cam.y - (e.r || 8) - 10, a = 0.55 + 0.25 * Math.sin(t * 6 + h.t);
      ctx.strokeStyle = 'rgba(176,106,255,' + a + ')'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.moveTo(x - 3, y - 3); ctx.lineTo(x + 3, y + 3); ctx.moveTo(x + 3, y - 3); ctx.lineTo(x - 3, y + 3); ctx.stroke();
    }
    for (const b of blasts) { // the green thread running to the next corpse
      const p = Math.min(1, 1 - b.wait / (0.22 * 2));
      ctx.strokeStyle = 'rgba(154,255,122,' + (0.6 * p) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(b.fromX - cam.x, b.fromY - cam.y); ctx.lineTo(b.x - cam.x, b.y - cam.y); ctx.stroke();
    }
    for (const e of fx) {
      const u = e.t / e.life, x = e.x - cam.x, y = e.y - cam.y;
      ctx.globalAlpha = Math.max(0, 1 - u);
      if (e.kind === 'blast') {
        ctx.strokeStyle = e.color; ctx.lineWidth = 3 * (1 - u) + 1; ctx.beginPath(); ctx.ellipse(x, y, e.radius * (0.3 + u * 0.8), e.radius * (0.3 + u * 0.8) * 0.7, 0, 0, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(154,255,122,0.18)'; ctx.fill();
      } else if (e.kind === 'guardian') {
        ctx.strokeStyle = BONE; ctx.lineWidth = 2; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(x, y + 6, 12 + u * 26 + k * 6, (12 + u * 26 + k * 6) * 0.45, 0, 0, TAU); ctx.stroke(); }
        ctx.fillStyle = BONE; for (let k = 0; k < 8; k++) { const a = k * TAU / 8; ctx.fillRect(x + Math.cos(a) * (10 + u * 24), y - u * 20 + Math.sin(a) * 4, 2, 3 + u * 4); }
      } else if (e.kind === 'splinter') {
        ctx.strokeStyle = BONE; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x + Math.cos(e.a) * u * 20, y + Math.sin(e.a) * u * 20); ctx.lineTo(x + Math.cos(e.a) * (u * 34 + e.len), y + Math.sin(e.a) * (u * 34 + e.len)); ctx.stroke();
      } else if (e.kind === 'hex') {
        ctx.strokeStyle = VIOLET; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, e.radius * (0.4 + u * 0.6), e.radius * (0.4 + u * 0.6) * 0.62, 0, 0, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(176,106,255,0.16)'; ctx.fill();
        for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + u * 3; ctx.fillStyle = '#e4ccff'; ctx.fillRect(x + Math.cos(a) * e.radius * 0.7 * (1 - u * 0.3) - 1, y + Math.sin(a) * e.radius * 0.45 - u * 14 - 1, 2, 2); }
      }
    }
    ctx.restore();
  }

  /* ---------- registration ---------- */
  function register(registry = CC.SpellPairs) {
    if (!registry?.register) return;
    function pair(id, name, chargeName, tapDesc, chargeDesc, target, cost, cooldown, fire) {
      registry.register(id, { name, chargeName, tapDesc, chargeDesc, ...target, cost: cost[0], manaMul: cost[1] / cost[0],
        cooldown: cooldown[0], cdMul: cooldown[1] / cooldown[0], clear,
        charge(player, aim = {}, power = 1) {
          if (!sync()) return false;
          const angle = angleOf(player, aim);
          player.face = Math.cos(angle) >= 0 ? 1 : -1;
          return fire({ player, x: aim.x ?? player.x + Math.cos(angle) * 60, y: aim.y ?? player.y + Math.sin(angle) * 60, id,
            dx: Math.cos(angle), dy: Math.sin(angle), angle, power: Math.max(0, Math.min(1, power)) }) !== false;
        } });
    }
    pair('necromancer_spell1', 'Raise Skeleton', 'Bone Guardian', 'Raise skeleton warriors to fight for you.',
      'Raise ONE large, tough bone guardian instead of several skeletons.',
      { shape: 'circle', range: 130, radius: 32, color: BONE }, [25, 42], [5, 9], boneGuardian);
    pair('necromancer_spell2', 'Life Drain', 'Soul Siphon', 'Drain life from a nearby foe.',
      'Channel a heavy drain that branches to two nearby foes. Healing is capped.',
      { shape: 'cone', range: 190, radius: 60, half: 0.75, color: GREEN }, [15, 26], [4, 7], soulSiphon);
    pair('spear', 'Bone Spear', 'Impaling Lance', 'Throw a bone spear through a line of foes.',
      'Throw a much larger spear that pierces more foes and bursts into splinters.',
      { shape: 'line', range: 330, radius: 20, color: BONE }, [20, 34], [4.5, 8], lance);
    pair('blast', 'Corpse Blast', 'Corpse Chain', 'Detonate a corpse (or a living foe) and poison the area.',
      'The blast jumps to up to two nearby corpses with falloff.',
      { shape: 'circle', range: 150, radius: 52, color: GREEN }, [28, 46], [7, 12], corpseChain);
    pair('curse', 'Hex of Weakness', 'Withering Curse', 'Curse foes: they hit weaker and move slower.',
      'A wider curse that also rots foes for damage over time.',
      { shape: 'circle', range: 140, radius: 90, color: VIOLET }, [30, 50], [14, 24], withering);
  }

  const shell = CC.SpellCharge;
  if (shell?.update && shell.draw) {
    const tick = shell.update, paint = shell.draw;
    shell.update = function (dt) { tick.call(this, dt); update(dt); };
    shell.draw = function (ctx, camera) { paint.call(this, ctx, camera); draw(ctx, camera); };
  }

  CC.NecromancerSpells = { register, update, draw, clear,
    get corpses() { return corpses.slice(); }, get lances() { return lances.slice(); },
    get siphons() { return siphons.slice(); }, get hexes() { return hexes.slice(); } };
  register();
})(typeof window !== 'undefined' ? window : globalThis);
