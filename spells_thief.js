/* Thief tap/hold pairs. SpellCharge owns mana, cooldowns and input.
 *   thief_spell1  Throwing Knives  tap: two quick knives         -> hold: KNIFE BARRAGE, rapid knives in a widened aimed cone
 *   thief_spell2  Smoke Bomb       tap (existing smoke cloud)    -> hold: SHADOW SHROUD, the same bomb, larger and longer, with a longer ambush
 *   step          Shadow Step      tap (existing)                -> hold: ASSASSINATION STEP, a longer aimed step to a marked foe with three stabs and a re-vanish
 *   razorwire     Razor Wire       tap: a hooked wire barricade  -> hold: RAZOR WEB, three connected wires, longer, with bleeding
 *   venom         Venom Flask      tap: one flask and a puddle   -> hold: TOXIC DELUGE, a bigger flask that bursts into five connected pools
 */
(function (root) {
  'use strict';
  const CC = root.CC = root.CC || {};
  const TAU = Math.PI * 2;
  const STEEL = '#dfe6f2', VENOM = '#9aff3a', SHADOW = '#a796ce', WIRE = '#f0f4fb';
  const knives = [], flasks = [], pools = [], wires = [], steps = [], timers = [], fx = [];
  let scene;

  function clear() {
    knives.length = flasks.length = pools.length = wires.length = steps.length = timers.length = fx.length = 0;
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
  function enemies() { return (CC.Enemies?.list || []).filter(e => e.hp > 0 && !e.dead && !e.collapsed); }
  function base(player, id) { return (player.stats?.dmg || 10) * (CC.Skills?.dmgMul?.(player, id) || 1); }
  function add(list, item, cap = 60) { if (list.length < cap) list.push(item); return item; }
  function text(x, y, s, c) { CC.fx?.text?.(x, y, s, c, 11); }
  function burst(x, y, c, n) { CC.fx?.burst?.(x, y, c, n, 100); }
  function angleOf(player, aim) { return Math.atan2(aim.dy ?? player.aimY ?? 0, aim.dx ?? player.aimX ?? player.face ?? 1); }
  // spell damage (no crit roll, no splash re-triggers) and knife damage (a real thief hit: crits and backstabs apply)
  function spellHit(e, damage, type = 'poison') {
    return CC.Classes?.hitEnemy?.(e, Math.max(1, damage), type, { noCrit: true, attackKind: 'spell', splash: true }) || 0;
  }
  function knifeHit(e, damage, angle) {
    return CC.Classes?.hitEnemy?.(e, Math.max(1, damage), 'knife', { attackKind: 'projectile', angle, color: STEEL }) || 0;
  }

  /* ---------- 1. Throwing Knives / Knife Barrage ---------- */
  function throwKnife(player, angle, damage, speed = 340, range = 230) {
    add(knives, { x: player.x + Math.cos(angle) * 8, y: player.y + Math.sin(angle) * 8 - 2, dx: Math.cos(angle), dy: Math.sin(angle), angle,
      speed, range, travelled: 0, hitSet: new Set(), damage, spin: Math.random() * TAU }, 40);
  }
  function knivesTap({ player, angle, id }) {
    const dmg = base(player, id) * 0.95;
    throwKnife(player, angle - 0.05, dmg);
    add(timers, { wait: 0.09, fn: () => { if (player.hp > 0) throwKnife(player, angle + 0.05, dmg); } });
    player.castFlash = 0.2;
    return true;
  }
  function knifeBarrage({ player, angle, power, id }) {
    const dmg = base(player, id) * 0.8, count = 9;
    for (let i = 0; i < count; i++) {
      const spread = (i / (count - 1) - 0.5) * (0.5 + power * 0.18); // slightly widened, still aimed
      add(timers, { wait: i * 0.065, fn: () => { if (player.hp > 0) throwKnife(player, angle + spread + (Math.random() - 0.5) * 0.04, dmg, 380, 250); } });
    }
    player.castFlash = 0.35;
    text(player.x, player.y - 30, 'KNIFE BARRAGE', STEEL);
    return true;
  }
  function updateKnife(k, dt) {
    const step = k.speed * dt, sub = Math.max(1, Math.ceil(step / 6));
    for (let i = 0; i < sub; i++) {
      k.x += k.dx * step / sub; k.y += k.dy * step / sub; k.travelled += step / sub; k.spin += 0.5;
      if (solid(k.x, k.y)) { burst(k.x, k.y, STEEL, 3); k.done = true; return; }
      for (const e of enemies()) {
        if (k.hitSet.has(e) || Math.hypot(e.x - k.x, e.y - k.y) > (e.r || 8) + 4) continue;
        k.hitSet.add(e);
        knifeHit(e, k.damage, k.angle);
        burst(k.x, k.y, STEEL, 4);
        k.done = true; return; // a knife stops in the first foe it hits
      }
      if (k.travelled >= k.range) { k.done = true; return; }
    }
  }

  /* ---------- 2. Shadow Shroud ---------- */
  function shadowShroud({ player, x, y }) {
    if (!CC.SmokeBomb?.deploy) return false;
    CC.SmokeBomb.deploy(player, { x, y, charged: true }); // the same bomb: bigger, 7 s, a burst and knives
    player.ambushT = Math.max(player.ambushT || 0, 3.5); // and a longer ambush: the next strike from the smoke is a crit
    text(x, y - 26, 'SHADOW SHROUD', SHADOW);
    return true;
  }

  /* ---------- 3. Assassination Step ---------- */
  function assassinate({ player, angle, id }) {
    // a marked foe: the one closest to the aim line, inside a narrow cone and in line of sight. No marked foe, no step (the mana is refunded).
    let mark, best = 1e9;
    for (const e of enemies()) {
      const dx = e.x - player.x, dy = e.y - player.y, d = Math.hypot(dx, dy);
      if (d > 200 + (e.r || 8) || !clearLine(player.x, player.y, e.x, e.y)) continue;
      const diff = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - angle), Math.cos(Math.atan2(dy, dx) - angle)));
      if (diff > 0.5) continue;
      const score = diff * 120 + d * 0.2;
      if (score < best) { best = score; mark = e; }
    }
    if (!mark) { text(player.x, player.y - 20, 'NO MARK', '#cfc6e8'); return false; }
    const dir = Math.atan2(mark.y - player.y, mark.x - player.x), fromX = player.x, fromY = player.y;
    let tx = mark.x + Math.cos(dir) * ((mark.r || 8) + 9), ty = mark.y + Math.sin(dir) * ((mark.r || 8) + 9);
    if (solid(tx, ty)) { tx = mark.x - Math.cos(dir) * ((mark.r || 8) + 9); ty = mark.y - Math.sin(dir) * ((mark.r || 8) + 9); }
    if (solid(tx, ty)) { text(player.x, player.y - 20, 'NO ROOM', '#cfc6e8'); return false; }
    add(fx, { kind: 'streak', x: fromX, y: fromY, x2: tx, y2: ty, t: 0, life: 0.5 });
    player.x = tx; player.y = ty; player.face = Math.cos(dir) >= 0 ? -1 : 1;
    player.iframes = Math.max(player.iframes || 0, 0.9);
    CC.Classes?.status?.(mark, 'stun', 0.7); // held for the stabs: every one lands from behind
    const dmg = base(player, id) * 1.15;
    for (let i = 0; i < 3; i++) add(timers, { wait: 0.12 + i * 0.13, fn: () => {
      if (!(mark.hp > 0) || mark.dead || player.hp <= 0) return;
      knifeHit(mark, dmg, dir); burst(mark.x, mark.y, '#d6c4ff', 6); CC.fx?.shake?.(2);
      add(fx, { kind: 'stab', x: mark.x, y: mark.y, a: dir + (i - 1) * 0.7, t: 0, life: 0.25 });
    } });
    add(timers, { wait: 0.62, fn: () => { // and gone again
      add(fx, { kind: 'puff', x: player.x, y: player.y, t: 0, life: 0.6 });
      burst(player.x, player.y, SHADOW, 12);
    } });
    text(tx, ty - 26, 'ASSASSINATION STEP', '#d6c4ff');
    return true;
  }

  /* ---------- 4. Razor Wire / Razor Web ---------- */
  function addWire(x1, y1, x2, y2, life, damage, bleed) {
    add(wires, { x1, y1, x2, y2, t: 0, life, damage, bleed, hits: new Map() }, 12);
  }
  function wireTap({ player, dx, dy, angle, id, range }) {
    const d = Math.min(115, Math.max(50, range || 100)), lx = player.x + dx * d, ly = player.y + dy * d;
    let px = lx, py = ly;
    if (solid(px, py)) { px = player.x + dx * 40; py = player.y + dy * 40; }
    const nx = -Math.sin(angle), ny = Math.cos(angle), half = 46;
    addWire(px - nx * half, py - ny * half, px + nx * half, py + ny * half, 5, base(player, id) * 0.5, false);
    add(fx, { kind: 'hook', x: player.x, y: player.y - 4, x2: px, y2: py, t: 0, life: 0.3 });
    player.castFlash = 0.22;
    return true;
  }
  function razorWeb({ player, x, y, angle, power, id }) {
    const cx = Math.hypot(x - player.x, y - player.y) < 140 ? x : player.x + Math.cos(angle) * 100, cy = Math.hypot(x - player.x, y - player.y) < 140 ? y : player.y + Math.sin(angle) * 100;
    const r = 56 + power * 14, dmg = base(player, id) * 0.62;
    for (let k = 0; k < 3; k++) {
      const a1 = angle + k * TAU / 3 + 0.5, a2 = angle + (k + 1) * TAU / 3 + 0.5;
      addWire(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, cx + Math.cos(a2) * r, cy + Math.sin(a2) * r, 7, dmg, true);
    }
    add(fx, { kind: 'hook', x: player.x, y: player.y - 4, x2: cx, y2: cy, t: 0, life: 0.35 });
    text(cx, cy - 24, 'RAZOR WEB', WIRE);
    return true;
  }
  function distToSegment(px, py, x1, y1, x2, y2) {
    const vx = x2 - x1, vy = y2 - y1, l2 = vx * vx + vy * vy || 1;
    const u = Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / l2));
    return Math.hypot(px - (x1 + vx * u), py - (y1 + vy * u));
  }
  function updateWire(w, dt) {
    w.t += dt;
    if (w.t >= w.life) { w.done = true; return; }
    for (const e of enemies()) {
      if (distToSegment(e.x, e.y, w.x1, w.y1, w.x2, w.y2) > (e.r || 8) + 3) continue;
      const last = w.hits.get(e) ?? -1;
      if (w.t - last < 0.45) continue; // a foe is cut at most every 0.45 s per wire
      w.hits.set(e, w.t);
      spellHit(e, w.damage, 'slash');
      CC.Classes?.status?.(e, 'slow', 0.9, 0.5);
      if (w.bleed) CC.Classes?._h?.ignite?.(e, 2.5, w.damage * 0.3, '#c0405a', 'poison');
      burst(e.x, e.y, '#c0405a', 3);
    }
  }

  /* ---------- 5. Venom Flask / Toxic Deluge ---------- */
  function flask({ player, x, y, id, charged, power = 0 }) {
    const d = Math.hypot(x - player.x, y - player.y), max = charged ? 150 : 135;
    const k = d > max ? max / d : 1;
    let tx = player.x + (x - player.x) * k, ty = player.y + (y - player.y) * k;
    if (solid(tx, ty)) { tx = player.x + (tx - player.x) * 0.5; ty = player.y + (ty - player.y) * 0.5; }
    add(flasks, { sx: player.x, sy: player.y - 6, tx, ty, t: 0, life: charged ? 0.55 : 0.45, charged, power, id, damage: base(player, id) });
    player.castFlash = charged ? 0.3 : 0.22;
    return true;
  }
  function addPool(x, y, r, life, damage) { add(pools, { x, y, r, t: 0, life, damage, tick: 0.2, seed: Math.random() * 100 }, 12); }
  function landFlask(f) {
    burst(f.tx, f.ty, VENOM, f.charged ? 16 : 9);
    if (!f.charged) { addPool(f.tx, f.ty, 38, 4.2, f.damage * 0.28); return; }
    const r = 46 + f.power * 8;
    addPool(f.tx, f.ty, r, 6, f.damage * 0.34);
    for (let i = 0; i < 4; i++) { // satellite pools joined to the centre by a trail
      const a = i * TAU / 4 + 0.6 + Math.random() * 0.3, sx = f.tx + Math.cos(a) * (r + 18), sy = f.ty + Math.sin(a) * (r + 18);
      if (!solid(sx, sy)) addPool(sx, sy, 28, 5.2, f.damage * 0.3);
    }
    add(fx, { kind: 'splash', x: f.tx, y: f.ty, t: 0, life: 0.5, radius: r + 20 });
    CC.fx?.shake?.(3);
    text(f.tx, f.ty - 24, 'TOXIC DELUGE', VENOM);
  }
  function updateFlask(f, dt) { f.t += dt; if (f.t >= f.life) { landFlask(f); f.done = true; } }
  function updatePool(p, dt) {
    p.t += dt; p.tick -= dt;
    if (p.t >= p.life) { p.done = true; return; }
    if (p.tick > 0) return;
    p.tick = 0.5;
    for (const e of enemies()) {
      if (Math.hypot(e.x - p.x, e.y - p.y) > p.r + (e.r || 8)) continue;
      spellHit(e, p.damage, 'poison');
      CC.Classes?.status?.(e, 'slow', 0.8, 0.7);
    }
  }

  /* ---------- loop ---------- */
  function sweep(list, fn, dt) { for (let i = list.length - 1; i >= 0; i--) { fn(list[i], dt); if (list[i].done) list.splice(i, 1); } }
  function update(dt) {
    if (!sync()) return;
    sweep(knives, updateKnife, dt);
    sweep(flasks, updateFlask, dt);
    sweep(pools, updatePool, dt);
    sweep(wires, updateWire, dt);
    for (let i = timers.length - 1; i >= 0; i--) {
      timers[i].wait -= dt;
      if (timers[i].wait <= 0) { const t = timers.splice(i, 1)[0]; try { t.fn(); } catch (e) { if (root.console) console.error(e); } }
    }
    for (let i = fx.length - 1; i >= 0; i--) { fx[i].t += dt; if (fx[i].t >= fx[i].life) fx.splice(i, 1); }
  }

  /* ---------- drawing ---------- */
  function draw(ctx, cam) {
    if (!knives.length && !flasks.length && !pools.length && !wires.length && !fx.length) return;
    const t = CC.Enemies?._time || 0;
    ctx.save();
    ctx.lineCap = 'round';
    for (const p of pools) { // bubbling poison puddles
      const x = p.x - cam.x, y = p.y - cam.y, fade = Math.min(1, (p.life - p.t) / 0.8, p.t / 0.15 + 0.2);
      const g = ctx.createRadialGradient(x, y, 2, x, y, p.r);
      g.addColorStop(0, 'rgba(120,255,60,' + 0.42 * fade + ')'); g.addColorStop(1, 'rgba(40,140,30,' + 0.18 * fade + ')');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, p.r, p.r * 0.62, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(170,255,100,' + 0.5 * fade + ')'; ctx.lineWidth = 1.4; ctx.stroke();
      for (let k = 0; k < 5; k++) { const ph = (t * 1.3 + k * 0.37 + p.seed) % 1; ctx.fillStyle = 'rgba(200,255,150,' + 0.6 * fade * (1 - ph) + ')'; ctx.beginPath(); ctx.arc(x + Math.cos(k * 2.4 + p.seed) * p.r * 0.5, y - ph * 10 + Math.sin(k * 2.4) * p.r * 0.2, 1.4 + ph, 0, TAU); ctx.fill(); }
    }
    for (const w of wires) { // taut wires with barbs and anchor stakes
      const fade = Math.min(1, (w.life - w.t) / 0.6), x1 = w.x1 - cam.x, y1 = w.y1 - cam.y, x2 = w.x2 - cam.x, y2 = w.y2 - cam.y;
      ctx.strokeStyle = 'rgba(' + (w.bleed ? '255,150,160' : '240,244,251') + ',' + 0.9 * fade + ')'; ctx.lineWidth = 1.6; ctx.shadowColor = 'rgba(255,255,255,0.7)'; ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.shadowBlur = 0;
      const len = Math.hypot(x2 - x1, y2 - y1), n = Math.floor(len / 9), ux = (x2 - x1) / (len || 1), uy = (y2 - y1) / (len || 1);
      ctx.lineWidth = 1; for (let k = 1; k < n; k++) { const bx = x1 + ux * k * 9, by = y1 + uy * k * 9; ctx.beginPath(); ctx.moveTo(bx - uy * 3, by + ux * 3); ctx.lineTo(bx + uy * 3, by - ux * 3); ctx.stroke(); }
      ctx.fillStyle = '#4a4458'; for (const [sx, sy] of [[x1, y1], [x2, y2]]) { ctx.fillRect(sx - 1.5, sy - 5, 3, 8); }
    }
    for (const k of knives) {
      const x = k.x - cam.x, y = k.y - cam.y;
      ctx.save(); ctx.translate(x, y); ctx.rotate(k.angle + Math.sin(k.spin) * 0.12);
      ctx.strokeStyle = 'rgba(223,230,242,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-16, 0); ctx.stroke();
      ctx.fillStyle = STEEL; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-3, -2.4); ctx.lineTo(-6, 0); ctx.lineTo(-3, 2.4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#6a5a8a'; ctx.fillRect(-9, -1.1, 4, 2.2);
      ctx.restore();
    }
    for (const f of flasks) { // a glass flask lobbed in an arc
      const u = f.t / f.life, x = f.sx + (f.tx - f.sx) * u - cam.x, y = f.sy + (f.ty - f.sy) * u - cam.y - Math.sin(u * Math.PI) * 28;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(f.sx + (f.tx - f.sx) * u - cam.x, f.sy + (f.ty - f.sy) * u - cam.y + 6, 4, 2, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(x, y); ctx.rotate(u * 9);
      ctx.fillStyle = '#c8ffb0'; ctx.beginPath(); ctx.ellipse(0, 1, 4, 5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#68c030'; ctx.beginPath(); ctx.ellipse(0, 2.5, 3, 3, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#6a4a2a'; ctx.fillRect(-1.5, -6, 3, 3); ctx.restore();
    }
    for (const e of fx) {
      const u = e.t / e.life, x = e.x - cam.x, y = e.y - cam.y;
      ctx.globalAlpha = Math.max(0, 1 - u);
      if (e.kind === 'streak') { ctx.strokeStyle = SHADOW; ctx.lineWidth = 6 * (1 - u) + 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(e.x2 - cam.x, e.y2 - cam.y); ctx.stroke(); }
      else if (e.kind === 'hook') { const hx = e.x + (e.x2 - e.x) * Math.min(1, u * 2.4); ctx.strokeStyle = WIRE; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(hx - cam.x, e.y + (e.y2 - e.y) * Math.min(1, u * 2.4) - cam.y); ctx.stroke(); }
      else if (e.kind === 'stab') { ctx.strokeStyle = '#efe6ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - Math.cos(e.a) * 12 * (1 - u), y - Math.sin(e.a) * 12 * (1 - u)); ctx.lineTo(x + Math.cos(e.a) * 12 * (1 - u), y + Math.sin(e.a) * 12 * (1 - u)); ctx.stroke(); }
      else if (e.kind === 'splash') { ctx.strokeStyle = VENOM; ctx.lineWidth = 3 * (1 - u) + 1; ctx.beginPath(); ctx.ellipse(x, y, e.radius * (0.3 + u * 0.8), e.radius * (0.3 + u * 0.8) * 0.62, 0, 0, TAU); ctx.stroke(); }
      else if (e.kind === 'puff') { ctx.fillStyle = 'rgba(120,100,170,0.5)'; ctx.beginPath(); ctx.ellipse(x, y, 10 + u * 22, (10 + u * 22) * 0.7, 0, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
  }

  /* ---------- registration ---------- */
  function register(registry = CC.SpellPairs) {
    if (!registry?.register) return;
    function pair(id, name, chargeName, tapDesc, chargeDesc, target, cost, cooldown, tapFire, chargeFire) {
      function cast(fire, charged) {
        return (player, aim = {}, power = 1) => {
          if (!sync()) return false;
          const angle = angleOf(player, aim);
          player.face = Math.cos(angle) >= 0 ? 1 : -1;
          return fire({ player, id, charged, angle, dx: Math.cos(angle), dy: Math.sin(angle), range: aim.range,
            x: aim.x ?? player.x + Math.cos(angle) * 100, y: aim.y ?? player.y + Math.sin(angle) * 100, power: Math.max(0, Math.min(1, power)) }) !== false;
        };
      }
      const def = { name, chargeName, tapDesc, chargeDesc, ...target, cost: cost[0], manaMul: cost[1] / cost[0],
        cooldown: cooldown[0], cdMul: cooldown[1] / cooldown[0], clear, charge: cast(chargeFire, true) };
      if (tapFire) def.tap = (player, aim) => cast(tapFire, false)(player, aim);
      registry.register(id, def);
    }
    pair('thief_spell1', 'Throwing Knives', 'Knife Barrage', 'Throw two quick knives toward your aim.',
      'A rapid barrage of knives in a slightly wider aimed cone.',
      { shape: 'cone', range: 250, radius: 60, half: 0.34, color: STEEL }, [12, 20], [2.2, 4], knivesTap, knifeBarrage);
    pair('thief_spell2', 'Smoke Bomb', 'Shadow Shroud', 'Throw smoke that blinds and confuses foes and makes every hit a backstab.',
      'The same bomb: larger, lasting longer, with a longer ambush for a crit.',
      { shape: 'circle', range: 142, radius: 80, color: SHADOW }, [20, 33], [8, 14], null, shadowShroud);
    pair('step', 'Shadow Step', 'Assassination Step', 'Vanish and reappear behind a foe with a vicious backstab.',
      'A longer aimed step to a marked foe: three stabs, then vanish again.',
      { shape: 'line', range: 200, radius: 24, color: '#a078ff' }, [18, 30], [6, 11], null, assassinate);
    pair('razorwire', 'Razor Wire', 'Razor Web', 'Hook a short wire barricade that cuts and slows foes crossing it.',
      'Three connected wires, longer lasting, that make foes bleed.',
      { shape: 'circle', range: 130, radius: 60, color: WIRE }, [24, 40], [7, 12], wireTap, razorWeb);
    pair('venom', 'Venom Flask', 'Toxic Deluge', 'Throw a flask that leaves a poison puddle.',
      'A bigger flask that bursts into five connected poison pools over a wider area.',
      { shape: 'circle', range: 150, radius: 72, color: VENOM }, [28, 46], [12, 20], p => flask(p), p => flask({ ...p, charged: true }));
  }

  const shell = CC.SpellCharge;
  if (shell?.update && shell.draw) {
    const tick = shell.update, paint = shell.draw;
    shell.update = function (dt) { tick.call(this, dt); update(dt); };
    shell.draw = function (ctx, camera) { paint.call(this, ctx, camera); draw(ctx, camera); };
  }

  CC.ThiefSpells = { register, update, draw, clear,
    get knives() { return knives.slice(); }, get wires() { return wires.slice(); }, get pools() { return pools.slice(); }, get flasks() { return flasks.slice(); } };
  register();
})(typeof window !== 'undefined' ? window : globalThis);
