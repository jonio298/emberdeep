/* Wizard tap/hold pairs. SpellCharge owns mana, cooldowns and input. */
(function (root) {
  'use strict';
  const CC = root.CC = root.CC || {};
  const ICE = '#9feaff';
  const ARCANE = '#c5a5ff';
  const CONE_ANGLE = 55 * Math.PI / 180;
  const SHARDS = 11;           // the charged Icicle Blast: one cone of shards
  const CHARGED_REACH = 170;
  const EMBED_LIMIT = 4;
  const projectiles = [];
  const sequences = [];
  const attachments = [];
  const visuals = [];
  const wards = new Map();
  let scene;
  let frozen = new WeakMap();
  let freezeLock = new WeakMap();
  let time = 0;

  function clear() {
    projectiles.length = sequences.length = attachments.length = visuals.length = 0;
    wards.clear();
    frozen = new WeakMap();
    freezeLock = new WeakMap();
    scene = undefined;
    time = 0;
  }

  function sync() {
    const state = CC.state;
    const player = state?.player;
    if (!player || player.hp <= 0 || state.mode !== 'dungeon') {
      clear();
      return false;
    }
    if (!scene || scene.state !== state || scene.player !== player ||
        scene.area !== state.area || scene.floor !== state.floor) {
      clear();
      scene = { state, player, area: state.area, floor: state.floor };
    }
    return true;
  }

  function enemies() { return CC.Enemies?.list || []; }
  function living(e) { return e.hp > 0 && !e.dead && !e.collapsed; }
  function boss(e) { return e.boss || e.miniBoss; }
  function solid(x, y) { return CC.Dungeon?.isSolid?.(x, y); }

  function clearLine(x, y, tx, ty) {
    const count = Math.max(1, Math.ceil(Math.hypot(tx - x, ty - y) / 5));
    for (let i = 1; i <= count; i++) {
      if (solid(x + (tx - x) * i / count, y + (ty - y) * i / count)) return false;
    }
    return true;
  }

  function nearby(x, y, radius, includeRadius = true) {
    return enemies().filter(e => living(e) &&
      Math.hypot(e.x - x, e.y - y) <= radius + (includeRadius ? e.r || 8 : 0) &&
      clearLine(x, y, e.x, e.y));
  }

  function frost(e, duration, factor) {
    if (!living(e)) return;
    if (boss(e)) {
      duration = Math.min(duration, 0.6);
      factor = Math.max(factor, 0.83);
    }
    if (e.slowT > 0) factor = Math.min(factor, e.slowMul || 1);
    CC.Classes?.status?.(e, 'slow', duration, factor);
  }

  function freeze(e, duration) {
    if (!living(e) || boss(e) || (freezeLock.get(e) || 0) > time) return;
    frozen.set(e, time + duration);
    freezeLock.set(e, time + 3);
    CC.Classes?.status?.(e, 'stun', duration);
  }

  function addVisual(effect) {
    if (visuals.length < 100) visuals.push(effect);
  }

  function ring(x, y, radius, color, life, spikes = false) {
    CC.SpellCharge?.effect?.('wizardImpact', { x, y, radius, color, life });
    addVisual({ kind: 'ring', x, y, radius, color, life, total: life, spikes });
  }

  function fragments(x, y, size, count, angle = 0, gore = false) {
    for (let i = 0; i < count && visuals.length < 100; i++) {
      const a = angle + (i * 2.39996);
      const speed = 28 + (i * 19) % 116;
      const life = 0.27 + (i % 4) * 0.09;
      addVisual({ kind: 'chip', x, y, dx: Math.cos(a) * speed, dy: Math.sin(a) * speed * 0.55,
        angle: a, size: size * (0.25 + (i % 5) * 0.13), life, total: life,
        color: gore && i % 3 === 0 ? '#8e213c' : i % 2 ? ICE : '#eaffff' });
    }
    if (gore) CC.fx?.blood?.(x, y, 12);
  }

  function iceSound(x, y, volume) {
    CC.Audio?.fx?.('crackle', { x, y, vol: volume, gap: 65 });
  }

  function castHit(cast, enemy, damage, type, splash = false) {
    if (cast.visual || !living(enemy) || damage < 1) return 0;
    const wasFrozen = (frozen.get(enemy) || 0) > time ||
      (enemy.stunT > 0 && (enemy.slowT > 0 || enemy.slow > 0));
    const dealt = CC.Classes?.hitEnemy?.(enemy, damage, type,
      { noCrit: true, splash: splash || cast.id === 'bolt', attackKind: 'spell', ability: cast.id,
        angle: cast.angle }) || 0;
    if (type === 'frost' && !living(enemy) && !enemy.collapsed && wasFrozen) {
      fragments(enemy.x, enemy.y, 14, 24, cast.angle, true);
      ring(enemy.x, enemy.y, 29, ICE, 0.25);
      iceSound(enemy.x, enemy.y, 0.75);
    }
    return dealt;
  }

  function marks(player) {
    const rank = id => CC.SkillTree?.rank?.(player, id) || 0;
    const flags = player.flags || {};
    return {
      piercing: !!(flags.deepPiercing || rank('m_deep_piercing')),
      splinter: !!(flags.splinterburst || rank('m_splinterburst')),
      pin: !!(flags.glacialPin || rank('m_glacial_pin')),
      shatter: !!(flags.shatterMastery || rank('m_shatter_mastery')),
      zero: !!(flags.absoluteZero || rank('m_absolute_zero'))
    };
  }

  function embed(projectile, enemy) {
    const count = attachments.reduce((n, shard) => n + (shard.enemy === enemy ? 1 : 0), 0);
    if (count >= EMBED_LIMIT || attachments.length >= 48) return;
    const radius = enemy.r || 8;
    const offset = Math.min(radius * 0.68, 12);
    attachments.push({ enemy, id: enemy.id, dx: -projectile.dx * offset, dy: -projectile.dy * offset,
      angle: projectile.angle, face: enemy.face || 1, life: 0.87 + (projectile.index % 4) * 0.09,
      x: enemy.x, y: enemy.y, cast: projectile.cast });
  }

  function limitDamage(projectile, enemy, requested, direct) {
    const volley = projectile.volley;
    if (!volley) return requested;
    let record = volley.get(enemy);
    if (!record) {
      record = { damage: 0, splash: 0, hits: 0 };
      volley.set(enemy, record);
    }
    // Splash shares this budget across all waves, including targets clipped by earlier waves.
    const cap = projectile.cast.base * (boss(enemy) ? 2.6 : 3.3);
    const splashCap = projectile.cast.base * (boss(enemy) ? 0.24 : 0.65);
    if (direct) {
      record.hits++;
      requested *= Math.max(0.35, 1 - (record.hits - 1) * 0.17);
    }
    let allowed = Math.min(requested, cap - record.damage);
    if (!direct) allowed = Math.min(allowed, splashCap - record.splash);
    allowed = Math.floor(allowed);
    if (allowed < 1) return 0;
    record.damage += allowed;
    if (!direct) record.splash += allowed;
    return allowed;
  }

  function impact(projectile, enemy) {
    const { cast, hitSet } = projectile;
    hitSet.add(enemy);
    if (cast.charged) embed(projectile, enemy);
    const chilled = (frozen.get(enemy) || 0) > time;
    const bonus = chilled && (cast.marks.shatter || cast.marks.zero) ? 1.3 : 1;
    const damage = limitDamage(projectile, enemy, cast.base * bonus *
      (cast.charged ? 0.76 + cast.power * 0.39 : 1.8), true);
    castHit(cast, enemy, damage, 'frost');
    frost(enemy, cast.marks.pin ? 1.45 : 0.78, cast.marks.pin ? 0.54 : 0.73);
    if (cast.charged && cast.marks.zero && projectile.volley.get(enemy).hits >= 3) freeze(enemy, 0.55);
    const radius = cast.marks.splinter ? 22 : 18;
    if (!cast.visual) {
      for (const other of nearby(enemy.x, enemy.y, radius, false)) {
        if (hitSet.has(other) || projectile.splashSet.has(other)) continue;
        projectile.splashSet.add(other);
        const splash = limitDamage(projectile, other, cast.base * (cast.charged ? 0.23 : 0.36), false);
        castHit(cast, other, splash, 'frost', true);
        if (splash >= 1) frost(other, 0.45, 0.83);
      }
    }
    ring(enemy.x, enemy.y, radius, ICE, 0.19);
    fragments(enemy.x, enemy.y, cast.marks.splinter ? 9 : 6, cast.charged ? 5 : 9, projectile.angle);
    iceSound(enemy.x, enemy.y, 0.42);
  }

  function launch(cast, offset, volley, index) {
    if (projectiles.length >= 48) return;
    const angle = cast.angle + offset * Math.PI / 180;
    // shotgun shards leave at slightly different speeds so the blast fans out raggedly instead of as one wall
    const jitter = cast.charged ? 0.88 + (index * 7 % 5) * 0.06 : 1;
    const reach = cast.charged ? (CHARGED_REACH + cast.power * 34) * jitter : 300;
    const speed = (cast.charged ? 540 : 490) * jitter;
    CC.SpellCharge?.effect?.('wizardFlight', { x: cast.x, y: cast.y, angle, speed,
      length: cast.charged ? 14 : 28, life: reach / speed });
    projectiles.push({
      kind: 'icicle', x: cast.x, y: cast.y, angle, dx: Math.cos(angle), dy: Math.sin(angle),
      cast, volley, index, remaining: reach, speed, radius: cast.charged ? 3.2 : 2.5,
      maxHits: (cast.charged ? 2 : 3) + Number(cast.marks.piercing),
      hitSet: new Set(), splashSet: new Set(), trail: 0
    });
  }

  function cannon(cast) {
    if (!cast.charged) {
      // the single icicle homes in on a target: a boss in reach first, otherwise the closest monster (no target: it flies where you aimed)
      if (!cast.visual) {
        const foes = nearby(cast.x, cast.y, 320);
        const pool = foes.some(boss) ? foes.filter(boss) : foes;
        let best = null, bd = Infinity;
        for (const e of pool) { const d = Math.hypot(e.x - cast.x, e.y - cast.y); if (d < bd) { bd = d; best = e; } }
        if (best) { cast.angle = Math.atan2(best.y - cast.y, best.x - cast.x); cast.dx = Math.cos(cast.angle); cast.dy = Math.sin(cast.angle); }
      }
      launch(cast, 0, null, 0);
      return;
    }
    // ICICLE BLAST: one shotgun burst. Every shard leaves at once across the cone and pierces two foes.
    const volley = new Map();
    for (let i = 0; i < SHARDS; i++) launch(cast, (i / (SHARDS - 1) - 0.5) * CONE_ANGLE * 180 / Math.PI, volley, i);
    blast(cast);
    // enemies standing in the cone are frosted at once: little shards stick in them straight away
    if (!cast.visual) {
      const reach = CHARGED_REACH + cast.power * 34;
      for (const e of nearby(cast.x, cast.y, reach)) {
        const a = Math.atan2(e.y - cast.y, e.x - cast.x);
        if (Math.abs(Math.atan2(Math.sin(a - cast.angle), Math.cos(a - cast.angle))) > CONE_ANGLE / 2) continue;
        frost(e, 1.1, 0.7);
      }
    }
  }

  // the icy explosion at the muzzle: a flash wedge, a spiked ring and a spray of shards travelling outwards
  function blast(cast) {
    const reach = CHARGED_REACH + cast.power * 34;
    addVisual({ kind: 'cone', x: cast.x, y: cast.y, angle: cast.angle, radius: reach, life: 0.34, total: 0.34 });
    CC.SpellCharge?.effect?.('wizardBlast', { x: cast.x, y: cast.y, angle: cast.angle, radius: reach, life: 0.34 });
    ring(cast.x + cast.dx * 14, cast.y + cast.dy * 14, 30, ICE, 0.3, true);
    for (let i = 0; i < 26 && visuals.length < 100; i++) {
      const a = cast.angle + ((i * 0.6180339) % 1 - 0.5) * CONE_ANGLE * 1.1;
      const s = 120 + (i * 37) % 170, life = 0.26 + (i % 5) * 0.07;
      addVisual({ kind: 'chip', x: cast.x + cast.dx * 10, y: cast.y + cast.dy * 10, dx: Math.cos(a) * s, dy: Math.sin(a) * s - 20,
        angle: a, size: 4 + (i % 4) * 1.6, life, total: life, color: i % 3 ? ICE : '#ffffff' });
    }
    iceSound(cast.x, cast.y, 0.9);
    CC.fx?.shake?.(4);
  }

  function later(delay, run) {
    if (sequences.length < 24) sequences.push({ at: time + delay, run });
  }

  function nova(cast) {
    const radius = (cast.charged ? 93 + cast.power * 19 : 72) * cast.reach;
    const pulse = (size, power, spikes) => {
      ring(cast.x, cast.y, size, ICE, cast.charged ? 0.46 : 0.35, spikes);
      fragments(cast.x, cast.y, 10, spikes ? 16 : 9);
      iceSound(cast.x, cast.y, spikes ? 0.75 : 0.5);
      if (cast.visual) return;
      for (const e of nearby(cast.x, cast.y, size)) {
        if (cast.charged || cast.effectRank) freeze(e, cast.charged ? 0.42 : 0.28);
        castHit(cast, e, cast.base * power, 'frost');
        frost(e, cast.charged ? 2.7 : 1.8, 0.54);
      }
    };
    pulse(radius, cast.charged ? 1.08 + cast.power * 0.32 : 1, cast.charged);
    if (cast.charged) later(0.28, () => pulse(radius * 1.12, 0.56 + cast.power * 0.28, true));
    CC.fx?.shake?.(cast.charged ? 5 : 3);
  }

  function orb(cast) {
    if (projectiles.length >= 48) return;
    const radius = (cast.charged ? 17 + cast.power * 5 : 12) * cast.reach;
    const speed = cast.charged ? 82 : 95, remaining = cast.charged ? 240 : 220;
    CC.SpellCharge?.effect?.('wizardFlight', { x: cast.x, y: cast.y, angle: cast.angle,
      speed, length: radius, life: remaining / speed, orb: true });
    projectiles.push({ kind: 'orb', x: cast.x, y: cast.y, angle: cast.angle, dx: cast.dx, dy: cast.dy,
      radius, cast, speed, remaining, hitSet: new Set(), trail: 0 });
  }

  function endOrb(projectile) {
    const { cast, x, y } = projectile;
    if (!cast.charged) return;
    const radius = 46 + cast.power * 13;
    ring(x, y, radius, ARCANE, 0.42, true);
    fragments(x, y, 10, 17);
    if (!cast.visual) {
      for (const e of nearby(x, y, radius)) {
        castHit(cast, e, cast.base * (1.45 + cast.power * 0.6), 'orb', true);
      }
    }
    CC.fx?.shake?.(5);
  }

  function pull(projectile, dt) {
    if (projectile.cast.visual || CC.Multiplayer?.isGuest?.()) return;
    for (const e of nearby(projectile.x, projectile.y, 48)) {
      if (boss(e) || e.airborne) continue;
      const dx = projectile.x - e.x, dy = projectile.y - e.y;
      const distance = Math.hypot(dx, dy) || 1;
      const step = Math.min(Math.max(0, distance - 8), (17 + 12 * projectile.cast.power) * dt);
      CC.Dungeon?.moveWithCollision?.(e, dx * step / distance, dy * step / distance);
    }
  }

  function advance(projectile, dt) {
    const { cast } = projectile;
    const distance = Math.min(projectile.remaining, projectile.speed * dt);
    const steps = Math.max(1, Math.ceil(distance / 4));
    const step = distance / steps;
    if (projectile.kind === 'orb' && cast.charged) pull(projectile, dt);
    for (let i = 0; i < steps; i++) {
      const x = projectile.x + projectile.dx * step;
      const y = projectile.y + projectile.dy * step;
      if (solid(x, y)) {
        if (projectile.kind === 'orb') endOrb(projectile);
        else {
          fragments(projectile.x, projectile.y, 7, 9, projectile.angle + Math.PI);
          iceSound(projectile.x, projectile.y, 0.5);
        }
        return false;
      }
      projectile.x = x;
      projectile.y = y;
      if (cast.visual && projectile.kind === 'orb') continue;
      const targets = nearby(x, y, projectile.radius);
      targets.sort((a, b) => (a.x - b.x) * projectile.dx + (a.y - b.y) * projectile.dy);
      for (const e of targets) {
        if (projectile.hitSet.has(e)) continue;
        if (projectile.kind === 'icicle') {
          impact(projectile, e);
          if (projectile.hitSet.size >= projectile.maxHits) return false;
        } else {
          projectile.hitSet.add(e);
          castHit(cast, e, cast.base * (cast.charged ? 1.7 + cast.power * 0.7 : 2.1), 'orb');
          if (cast.effectRank) frost(e, 1.1, 0.75);
        }
      }
    }
    projectile.trail += distance;
    if (projectile.kind === 'icicle' && projectile.trail >= 28) {
      projectile.trail %= 28;
      addVisual({ kind: 'chip', x: projectile.x - projectile.dx * 9, y: projectile.y - projectile.dy * 9,
        dx: 0, dy: 0, angle: projectile.angle, size: 3, life: 0.16, total: 0.16, color: ICE });
    }
    projectile.remaining -= distance;
    if (projectile.remaining > 0) return true;
    if (projectile.kind === 'orb') endOrb(projectile);
    return false;
  }

  function ward(cast) {
    const { player, charged, power } = cast;
    if (!wards.has(player) && wards.size >= 6) return;
    const capacity = (player.maxHp || 55) * (charged ? 0.28 + power * 0.13 : 0.16);
    wards.set(player, { cast, capacity, remaining: capacity, life: charged ? 3.4 + power : 2.4 });
    ring(player.x, player.y, charged ? 28 : 18, ARCANE, 0.28);
  }

  // Incoming damage hooks call this with damage remaining after armor.
  function absorb(player, amount) {
    if (!(amount > 0) || !sync()) return amount;
    const shield = wards.get(player);
    if (!shield || shield.cast.visual) return amount;
    const blocked = Math.min(amount, shield.remaining);
    shield.remaining -= blocked;
    fragments(player.x, player.y - 7, 7, 4);
    if (shield.remaining <= 0) {
      wards.delete(player);
      if (shield.cast.charged) {
        const radius = 64 + shield.cast.power * 16;
        ring(player.x, player.y, radius, ARCANE, 0.43, true);
        fragments(player.x, player.y, 10, 18);
        for (const e of nearby(player.x, player.y, radius)) {
          castHit(shield.cast, e, shield.cast.base * (1.35 + shield.cast.power * 0.45), 'orb', true);
        }
        CC.fx?.shake?.(4);
      }
    }
    return amount - blocked;
  }

  function update(dt) {
    if (!sync()) return;
    time += dt;
    for (let i = visuals.length - 1; i >= 0; i--) {
      const effect = visuals[i];
      effect.life -= dt;
      if (effect.life <= 0) { visuals.splice(i, 1); continue; }
      if (effect.kind === 'chip') {
        effect.x += effect.dx * dt;
        effect.y += effect.dy * dt;
        effect.dy += 100 * dt;
        effect.angle += 5 * dt;
      }
    }
    for (let i = projectiles.length - 1; i >= 0; i--) {
      if (!advance(projectiles[i], dt)) projectiles.splice(i, 1);
    }
    for (let i = 0; i < sequences.length;) {
      const effect = sequences[i];
      if (effect.at <= time + 1e-8) {
        sequences.splice(i, 1);
        effect.run();
      } else i++;
    }
    const currentEnemies = new Set(enemies());
    const deathBursts = new Set();
    for (let i = attachments.length - 1; i >= 0; i--) {
      const shard = attachments[i], e = shard.enemy;
      const present = currentEnemies.has(e) && shard.id === e.id;
      shard.life -= dt;
      if (present && living(e)) {
        const flip = (e.face || 1) === shard.face ? 1 : -1;
        shard.x = e.x + shard.dx * flip;
        shard.y = e.y + shard.dy;
        shard.drawAngle = flip === 1 ? shard.angle : Math.PI - shard.angle;
        if (shard.life > 0) continue;
        fragments(shard.x, shard.y, 6, 4, shard.drawAngle);
        iceSound(shard.x, shard.y, 0.23);
      } else if (!living(e) && !deathBursts.has(e)) {
        deathBursts.add(e);
        const { cast } = shard;
        const gore = !e.collapsed && (frozen.get(e) || 0) > time;
        fragments(e.x, e.y, gore ? 13 : 9, gore ? 18 : 9, shard.angle, gore);
        if (cast.marks.shatter && !cast.visual && !e.collapsed) {
          for (const other of nearby(e.x, e.y, 18, false).slice(0, 3)) {
            castHit(cast, other, cast.base * 0.23, 'shatter', true);
          }
        }
      }
      attachments.splice(i, 1);
    }
    for (const [player, shield] of wards) {
      shield.life -= dt;
      if (shield.life <= 0 || player.hp <= 0) wards.delete(player);
    }
  }

  function crystal(ctx, x, y, angle, length, width, alpha = 1, color = ICE) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-length * 0.72, -width);
    ctx.lineTo(-length, 0);
    ctx.lineTo(-length * 0.66, width);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#effdff';
    ctx.globalAlpha *= 0.85;
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-length * 0.72, -width);
    ctx.lineTo(-length * 0.63, 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function draw(ctx, camera) {
    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    for (const q of projectiles) {
      if (q.kind === 'icicle') crystal(ctx, q.x, q.y - 3, q.angle, q.cast.charged ? 17 : 28, q.cast.charged ? 3 : 4);
      else {
        ctx.strokeStyle = ARCANE;
        ctx.fillStyle = q.cast.charged ? '#361e67' : '#7051ac';
        ctx.lineWidth = q.cast.charged ? 3 : 2;
        ctx.beginPath();
        ctx.arc(q.x, q.y - 3, q.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(q.x, q.y - 3, q.radius * 0.96, q.radius * 0.40,
          time * 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    for (const shard of attachments) {
      if (!living(shard.enemy)) continue;
      crystal(ctx, shard.x, shard.y - 4, shard.drawAngle ?? shard.angle, 14, 2.5, Math.min(1, shard.life * 10));
    }
    for (const v of visuals) {
      const alpha = v.life / v.total;
      if (v.kind === 'chip') {
        crystal(ctx, v.x, v.y - 3, v.angle, v.size, v.size / 2, alpha, v.color);
        continue;
      }
      if (v.kind === 'cone') { coneFlash(ctx, v.x, v.y, v.angle, v.radius, 1 - alpha); continue; }
      const radius = 5 + (1 - alpha) * v.radius;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = v.color;
      ctx.lineWidth = v.spikes ? 3 : 2;
      ctx.beginPath();
      ctx.ellipse(v.x, v.y, radius, radius * 0.78, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (v.spikes) {
        ctx.fillStyle = v.color;
        for (let i = 0; i < 12; i++) {
          const a = i * Math.PI / 6, dx = Math.cos(a), dy = Math.sin(a);
          const x = v.x + dx * radius, y = v.y + dy * radius * 0.78;
          ctx.beginPath();
          ctx.moveTo(x - 5, y + 1);
          ctx.lineTo(x + dx * 5, y - (i % 3 + 1) * 6 * alpha);
          ctx.lineTo(x + 5, y + 1);
          ctx.fill();
        }
      }
      ctx.restore();
    }
    for (const [p, q] of wards) {
      const radius = q.cast.charged ? 27 : 18;
      ctx.save();
      ctx.globalAlpha = 0.43 + 0.4 * q.remaining / q.capacity;
      ctx.strokeStyle = ARCANE;
      ctx.fillStyle = '#723bc644';
      ctx.lineWidth = q.cast.charged ? 3 : 2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3 + time * 0.55;
        const x = p.x + Math.cos(a) * radius, y = p.y - 7 + Math.sin(a) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  // the blast wedge: a pale cone that races outwards and fades, with a bright edge
  function coneFlash(ctx, x, y, angle, radius, progress) {
    const r = radius * (0.35 + progress * 0.75), a = 1 - progress;
    ctx.save();
    ctx.globalAlpha = a * 0.55;
    const g = ctx.createRadialGradient(x, y, 4, x, y, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#bfeeff'); g.addColorStop(1, 'rgba(120,200,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, y - 3);
    ctx.arc(x, y - 3, r, angle - CONE_ANGLE / 2, angle + CONE_ANGLE / 2);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = a;
    ctx.strokeStyle = '#effdff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function drawCharge(ctx, camera, info) {
    const { dx, dy, power } = info;
    const angle = Math.atan2(dy, dx);
    const x = info.originX - camera.x, y = info.originY - camera.y;
    const range = CHARGED_REACH + 34 * power;
    ctx.strokeStyle = info.affordable ? ICE : '#e07e85';
    ctx.fillStyle = '#53b6f128';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, range, angle - CONE_ANGLE / 2, angle + CONE_ANGLE / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    for (let i = -2; i <= 2; i++) {
      const a = angle + i * 0.16;
      const distance = 20 + 11 * power + Math.sin(time * 23 + i) * power * 2;
      crystal(ctx, x + Math.cos(a) * distance, y + Math.sin(a) * distance - 4,
        a, 8 + power * 11, 1.5 + power * 1.6, 0.55 + power * 0.45);
    }
  }

  const drawers = {
    wizardFlight(ctx, e, x, y) {
      if (!e.visual) return;
      const dx = Math.cos(e.angle), dy = Math.sin(e.angle);
      const distance = e.speed * e.t;
      if (!clearLine(e.x, e.y, e.x + dx * distance, e.y + dy * distance)) return;
      if (!e.orb) crystal(ctx, x + dx * distance, y + dy * distance - 3, e.angle, e.length, 3);
      else {
        ctx.fillStyle = '#7051ac';
        ctx.strokeStyle = ARCANE;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x + dx * distance, y + dy * distance - 3, e.length, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    },
    wizardBlast(ctx, e, x, y, progress) {
      if (!e.visual) return;
      coneFlash(ctx, x, y, e.angle, e.radius, progress);
    },
    wizardImpact(ctx, e, x, y, progress) {
      if (!e.visual) return;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y, 6 + e.radius * progress, 4 + e.radius * progress * 0.78, 0, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        crystal(ctx, x + Math.cos(a) * e.radius * progress, y + Math.sin(a) * e.radius * progress,
          a, 6, 1.5, 1 - progress, e.color);
      }
    }
  };

  function register(registry = CC.SpellPairs) {
    if (!registry?.register) return;
    // own: false = the tap stays the existing spell (Frost Nova / Arcane Orb keep their current tap and upgrades);
    // only the charged version comes from this module. cost/cooldown null = use the ability's own values.
    function pair(id, name, chargeName, tapDesc, chargeDesc, target, cost, cooldown, fire, own = true) {
      function cast(charged) {
        return (player, aim = {}, power = 1) => {
          if (!sync()) return false;
          const angle = Math.atan2(aim.dy ?? player.aimY ?? 0, aim.dx ?? player.aimX ?? player.face ?? 1);
          const dx = Math.cos(angle), dy = Math.sin(angle);
          player.castFlash = charged ? 0.32 : 0.21;
          player.face = dx >= 0 ? 1 : -1;
          fire({ player, x: player.x, y: player.y, dx, dy, angle, id, charged, visual: false,
            power: Math.max(0, Math.min(1, power)), marks: marks(player),
            base: (player.stats?.dmg || 10) * (CC.Skills?.dmgMul?.(player, id) || 1),
            reach: CC.Skills?.radMul?.(player, id) || 1,
            effectRank: CC.Skills?.effRank?.(player, id) || 0 });
          return true;
        };
      }
      const def = { name, chargeName, tapDesc, chargeDesc, ...target, clear, drawers,
        charge: cast(true), preview: id === 'bolt' ? drawCharge : undefined };
      if (own) def.tap = (player, aim) => cast(false)(player, aim);
      if (cost) { def.cost = cost[0]; def.manaMul = cost[1] / cost[0]; } else def.manaMul = 1.68;
      if (typeof cooldown === 'function') { def.cooldown = cooldown; def.cdMul = 1.75; }
      else if (cooldown) { def.cooldown = cooldown[0]; def.cdMul = cooldown[1] / cooldown[0]; }
      else def.cdMul = 1.75;
      registry.register(id, def);
    }
    pair('bolt', 'Icicle Cannon', 'Icicle Blast',
      'Fire a long icicle that pierces three foes and splinters on each hit.',
      'A shotgun blast of ice shards in a cone. Each shard pierces two foes and sticks in them.',
      { shape: 'cone', range: 225, radius: 105, half: CONE_ANGLE / 2, color: ICE },
      [24, 42], [5, 10], cannon);
    // Registered over wizard_spell2: the tap stays the existing Frost Nova, the hold becomes Glacial Nova.
    pair('wizard_spell2', 'Glacial Nova', 'Glacial Nova', 'Release a circular blast of frost.',
      'Release two larger frost pulses that erupt into jagged ice.',
      { shape: 'circle', range: 0, radius: 112, color: ICE }, null, null, nova, false);
    pair('orb', 'Arcane Orb', 'Gravity Orb', 'Send a slow piercing arcane orb forward.',
      'Launch a larger orb that pulls foes inward and detonates.',
      { shape: 'line', range: 240, radius: 22, color: ARCANE }, null,
      p => p.cdMax?.ab_orb || 8, orb, false);
    pair('arcaneward', 'Arcane Ward', 'Arcane Fortress', 'Raise a brief shield that absorbs incoming damage.',
      'Raise a stronger shield that releases a shockwave when depleted.',
      { shape: 'circle', range: 0, radius: 28, color: ARCANE }, [26, 44], [10, 17], ward);
  }

  // Incoming damage reaches the player through CC.Classes.damage; the ward soaks it before armor and health.
  function hookDamage() {
    const classes = CC.Classes;
    if (!classes?.damage || classes.damage.wardHooked) return;
    const original = classes.damage;
    classes.damage = function (p, amount, src) {
      const target = p || CC.state?.player;
      if (amount > 0 && target && target.hp > 0 && !(target.invuln > 0) && !(target.iframes > 0) &&
          wards.has(target)) {
        amount = absorb(target, amount);
        if (amount <= 0) return 0;
      }
      return original.call(this, p, amount, src);
    };
    classes.damage.wardHooked = true;
  }

  // The dispatcher draws above the pond fog and clears registered pairs with its existing lifecycle.
  const shell = CC.SpellCharge;
  if (shell?.update && shell.draw) {
    const tick = shell.update, paint = shell.draw;
    shell.update = function (dt) { tick.call(this, dt); update(dt); };
    shell.draw = function (ctx, camera) { paint.call(this, ctx, camera); draw(ctx, camera); };
  }

  hookDamage();
  CC.WizardSpells = { register, update, draw, clear, absorb, hookDamage,
    get projectiles() { return projectiles.slice(); },
    get attachments() { return attachments.slice(); },
    get visuals() { return visuals.slice(); } };
  register();
})(typeof window !== 'undefined' ? window : globalThis);
