/* Wizard Fireball hold: INFERNO ORB. The tap stays the existing Fireball; holding fires the same fireball much larger and slower,
 * with a heavier explosion and flames that linger on the ground. SpellCharge owns mana, cooldowns and input. */
(function (root) {
  'use strict';
  const CC = root.CC = root.CC || {};
  const TAU = Math.PI * 2, FIRE = '#ff8749';
  const orbs = [], flames = [], fx = [];
  let scene;

  function clear() { orbs.length = flames.length = fx.length = 0; scene = undefined; }
  function sync() {
    const state = CC.state, player = state?.player;
    if (!player || player.hp <= 0 || state.mode !== 'dungeon') { clear(); return false; }
    if (!scene || scene.state !== state || scene.player !== player || scene.area !== state.area || scene.floor !== state.floor) {
      clear();
      scene = { state, player, area: state.area, floor: state.floor };
    }
    return true;
  }
  const solid = (x, y) => CC.Dungeon?.isSolid?.(x, y);
  const enemies = () => (CC.Enemies?.list || []).filter(e => e.hp > 0 && !e.dead && !e.collapsed);
  const nearby = (x, y, r) => enemies().filter(e => Math.hypot(e.x - x, e.y - y) <= r + (e.r || 8));
  const hit = (e, d) => CC.Classes?.hitEnemy?.(e, Math.max(1, d), 'fire', { noCrit: true, attackKind: 'spell', splash: true }) || 0;
  const add = (list, item, cap = 24) => { if (list.length < cap) list.push(item); return item; };

  function inferno({ player, dx, dy, angle, power, id }) {
    const base = (player.stats?.dmg || 10) * (CC.Skills?.dmgMul?.(player, id) || 1);
    add(orbs, { x: player.x + dx * 12, y: player.y + dy * 12 - 3, dx, dy, angle, speed: 150, range: 230, travelled: 0, r: 11 + power * 3,
      damage: base * (3 + power * 0.8) });
    player.castFlash = 0.32;
    CC.fx?.text?.(player.x, player.y - 30, 'INFERNO ORB', FIRE, 11);
    return true;
  }
  function explode(o) {
    const radius = 62 + o.r * 0.5;
    for (const e of nearby(o.x, o.y, radius)) {
      hit(e, o.damage);
      CC.Classes?._h?.ignite?.(e, 3, o.damage * 0.08);
    }
    add(flames, { x: o.x, y: o.y, r: 44, t: 0, life: 3.5, tick: 0.3, damage: o.damage * 0.1, seed: Math.random() * 100 }, 8);
    add(fx, { kind: 'boom', x: o.x, y: o.y, t: 0, life: 0.5, radius });
    CC.fx?.burst?.(o.x, o.y, FIRE, 22, 130);
    CC.fx?.shake?.(5);
  }
  function updateOrb(o, dt) {
    const step = o.speed * dt, sub = Math.max(1, Math.ceil(step / 5));
    for (let i = 0; i < sub; i++) {
      o.x += o.dx * step / sub; o.y += o.dy * step / sub; o.travelled += step / sub;
      if (solid(o.x, o.y) || o.travelled >= o.range || enemies().some(e => Math.hypot(e.x - o.x, e.y - o.y) <= (e.r || 8) + o.r)) { explode(o); o.done = true; return; }
    }
  }
  function updateFlames(f, dt) {
    f.t += dt; f.tick -= dt;
    if (f.t >= f.life) { f.done = true; return; }
    if (f.tick > 0) return;
    f.tick = 0.5;
    for (const e of nearby(f.x, f.y, f.r)) { hit(e, f.damage); CC.Classes?._h?.ignite?.(e, 1.5, f.damage * 0.4); }
  }
  function sweep(list, fn, dt) { for (let i = list.length - 1; i >= 0; i--) { fn(list[i], dt); if (list[i].done) list.splice(i, 1); } }
  function update(dt) {
    if (!sync()) return;
    sweep(orbs, updateOrb, dt);
    sweep(flames, updateFlames, dt);
    for (let i = fx.length - 1; i >= 0; i--) { fx[i].t += dt; if (fx[i].t >= fx[i].life) fx.splice(i, 1); }
  }
  function draw(ctx, cam) {
    if (!orbs.length && !flames.length && !fx.length) return;
    const t = CC.Enemies?._time || 0;
    ctx.save();
    for (const f of flames) {
      const x = f.x - cam.x, y = f.y - cam.y, fade = Math.min(1, (f.life - f.t) / 0.8);
      const g = ctx.createRadialGradient(x, y, 2, x, y, f.r); g.addColorStop(0, 'rgba(255,160,50,' + 0.4 * fade + ')'); g.addColorStop(1, 'rgba(255,60,20,' + 0.1 * fade + ')');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, f.r, f.r * 0.62, 0, 0, TAU); ctx.fill();
      for (let k = 0; k < 7; k++) { // flame tongues
        const a = k * TAU / 7 + f.seed, bx = x + Math.cos(a) * f.r * 0.6, by = y + Math.sin(a) * f.r * 0.38, h = 9 + 6 * Math.sin(t * 9 + k * 2);
        ctx.fillStyle = 'rgba(255,' + (150 + 50 * Math.sin(k)) + ',40,' + 0.75 * fade + ')';
        ctx.beginPath(); ctx.moveTo(bx - 3, by); ctx.quadraticCurveTo(bx, by - h, bx + Math.sin(t * 6 + k) * 2, by - h * 1.2); ctx.quadraticCurveTo(bx + 1, by - h * 0.4, bx + 3, by); ctx.fill();
      }
    }
    for (const o of orbs) {
      const x = o.x - cam.x, y = o.y - cam.y;
      const g = ctx.createRadialGradient(x, y, 1, x, y, o.r * 2.2); g.addColorStop(0, 'rgba(255,240,170,0.95)'); g.addColorStop(0.35, 'rgba(255,140,40,0.85)'); g.addColorStop(1, 'rgba(255,60,10,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, o.r * 2.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff2c0'; ctx.beginPath(); ctx.arc(x, y, o.r * 0.55, 0, TAU); ctx.fill();
      for (let k = 0; k < 5; k++) { const back = (t * 3 + k * 0.4) % 1; ctx.fillStyle = 'rgba(255,' + (120 + k * 20) + ',40,' + 0.7 * (1 - back) + ')'; ctx.beginPath(); ctx.arc(x - o.dx * back * 26 + Math.sin(k * 3 + t * 8) * 3, y - o.dy * back * 26 + Math.cos(k * 3 + t * 8) * 3, 3 * (1 - back) + 1, 0, TAU); ctx.fill(); }
    }
    for (const e of fx) {
      const u = e.t / e.life, x = e.x - cam.x, y = e.y - cam.y; ctx.globalAlpha = Math.max(0, 1 - u);
      ctx.strokeStyle = '#ffb060'; ctx.lineWidth = 4 * (1 - u) + 1; ctx.beginPath(); ctx.ellipse(x, y, e.radius * (0.25 + u * 0.8), e.radius * (0.25 + u * 0.8) * 0.7, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(255,170,60,0.25)'; ctx.fill();
    }
    ctx.restore();
  }
  function register(registry = CC.SpellPairs) {
    if (!registry?.register) return;
    registry.register('wizard_spell1', { name: 'Fireball', chargeName: 'Inferno Orb', tapDesc: 'Hurl an exploding ball of fire.',
      chargeDesc: 'A much larger, slower fireball with a heavier blast and flames that linger.',
      shape: 'line', range: 230, radius: 26, color: FIRE, cost: 20, manaMul: 1.8, cooldown: 2.5, cdMul: 2, clear,
      charge(player, aim = {}, power = 1) {
        if (!sync()) return false;
        const angle = Math.atan2(aim.dy ?? player.aimY ?? 0, aim.dx ?? player.aimX ?? player.face ?? 1);
        player.face = Math.cos(angle) >= 0 ? 1 : -1;
        return inferno({ player, dx: Math.cos(angle), dy: Math.sin(angle), angle, power: Math.max(0, Math.min(1, power)), id: 'wizard_spell1' });
      } });
  }
  const shell = CC.SpellCharge;
  if (shell?.update && shell.draw) {
    const tick = shell.update, paint = shell.draw;
    shell.update = function (dt) { tick.call(this, dt); update(dt); };
    shell.draw = function (ctx, camera) { paint.call(this, ctx, camera); draw(ctx, camera); };
  }
  CC.WizardFireSpells = { register, update, draw, clear, get orbs() { return orbs.slice(); }, get flames() { return flames.slice(); } };
  register();
})(typeof window !== 'undefined' ? window : globalThis);
