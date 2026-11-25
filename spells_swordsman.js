/* Swordsman tap/hold pairs. SpellCharge owns mana, cooldowns and input. */
(function (root) {
  'use strict';
  const CC = root.CC = root.CC || {};
  const effects = [];
  const GOLD = '#fbc67d';
  const STEEL = '#b9e4ff';
  let scene;

  function clear() {
    effects.length = 0;
    scene = undefined;
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

  function add(effect) {
    if (effects.length < 48) effects.push(effect);
  }

  function solid(x, y) { return CC.Dungeon?.isSolid?.(x, y); }

  function clearLine(x, y, tx, ty) {
    const count = Math.max(1, Math.ceil(Math.hypot(tx - x, ty - y) / 6));
    for (let i = 1; i <= count; i++) {
      if (solid(x + (tx - x) * i / count, y + (ty - y) * i / count)) return false;
    }
    return true;
  }

  function move(entity, dx, dy) {
    if (CC.Dungeon?.moveWithCollision) CC.Dungeon.moveWithCollision(entity, dx, dy);
    else if (!solid(entity.x + dx, entity.y + dy)) {
      entity.x += dx;
      entity.y += dy;
    }
  }

  function enemies() {
    return (CC.Enemies?.list || []).filter(enemy =>
      enemy.hp > 0 && !enemy.dead && !enemy.collapsed);
  }

  function nearby(x, y, radius) {
    return enemies().filter(enemy => Math.hypot(enemy.x - x, enemy.y - y) <= radius + (enemy.r || 8) &&
      clearLine(x, y, enemy.x, enemy.y));
  }

  function boss(enemy) { return enemy.boss || enemy.miniBoss; }

  function hit(cast, enemy, multiplier, type = 'slash') {
    if (cast.visual) return;
    const bonus = CC.Skills?.dmgMul?.(cast.player, cast.id) || 1;
    CC.Classes?.hitEnemy?.(enemy, cast.player.stats.dmg * bonus * multiplier, type,
      { noCrit: true, splash: true, attackKind: 'spell', ability: cast.id, angle: cast.angle });
    CC.fx?.burst?.(enemy.x, enemy.y, type === 'bash' ? STEEL : GOLD, cast.charged ? 8 : 4, 100);
    if (cast.charged && (enemy.dead || enemy.hp <= 0) && !enemy.collapsed) {
      CC.fx?.blood?.(enemy.x, enemy.y, 9, cast.dx, cast.dy, enemy.blood);
      CC.fx?.burst?.(enemy.x, enemy.y, '#d7c2a2', 6, 170);
    }
  }

  function stagger(cast, enemy, duration) {
    if (!cast.visual && enemy.hp > 0 && !boss(enemy)) CC.Classes?.status?.(enemy, 'stun', duration);
  }

  function animate(cast, length) {
    if (cast.visual) return;
    cast.player.swingAng = cast.angle;
    cast.player.atkAnim = length;
    cast.player.castFlash = length;
    cast.player.face = cast.dx >= 0 ? 1 : -1;
  }

  function ring(x, y, radius, color, life) {
    CC.SpellCharge?.effect?.('swordsmanEcho', { x, y, radius, color, life, width: 3 });
    add({ kind: 'ring', x, y, radius, color, life, total: life });
  }

  function shieldBash(cast) {
    const p = cast.player;
    const seen = new Set();
    const hitFront = (x, y, reach) => {
      for (const enemy of nearby(x, y, reach)) {
        const side = Math.abs((enemy.x - x) * cast.dy - (enemy.y - y) * cast.dx);
        const forward = (enemy.x - x) * cast.dx + (enemy.y - y) * cast.dy;
        if (forward < -4 || side > reach * 0.66 + (enemy.r || 8) || seen.has(enemy)) continue;
        seen.add(enemy);
        hit(cast, enemy, cast.charged ? 1.65 + cast.power * 0.7 : 1.3, 'bash');
        stagger(cast, enemy, cast.charged ? 0.6 + cast.power * 0.45 : 1);
        if (cast.charged && !cast.visual && enemy.hp > 0) {
          // Vulnerability offsets the armor multiplier using the existing pre-hit hook.
          enemy.vulnT = Math.max(enemy.vulnT || 0, 4);
          enemy.vulnMul = Math.max(enemy.vulnMul || 1, enemy.armored ? 1.28 : 1.12);
        }
      }
    };
    animate(cast, 0.27);
    CC.Vfx?.spawn?.('bash', p.x, p.y, cast.charged ? 50 : 38, { a: cast.angle });
    hitFront(p.x, p.y, 38);
    if (cast.charged) {
      add({ kind: 'rush', cast, hitFront, life: 0.18, speed: (54 + 29 * cast.power) / 0.18 });
    }
    CC.fx?.shake?.(cast.charged ? 5 : 2);
  }

  function spin(cast) {
    const p = cast.player;
    const radius = cast.charged ? 57 + cast.power * 13 : 52;
    for (const enemy of nearby(p.x, p.y, radius)) {
      if (cast.charged && !cast.visual && !boss(enemy)) {
        const dx = p.x - enemy.x, dy = p.y - enemy.y;
        const distance = Math.hypot(dx, dy) || 1;
        const step = Math.min(7, Math.max(0, distance - 18));
        move(enemy, dx * step / distance, dy * step / distance);
      }
      hit(cast, enemy, cast.charged ? 0.75 + cast.power * 0.27 : 1.65);
    }
    CC.SpellCharge?.effect?.('swordsmanEcho', { x: p.x, y: p.y, radius, angle: cast.angle,
      life: 0.19, color: GOLD, spin: true, width: 5 });
    CC.Vfx?.spawn?.('bladeStorm', p.x, p.y, radius, { local: true });
    add({ kind: 'spin', player: p, radius, life: 0.19, total: 0.19, angle: cast.angle });
    CC.fx?.shake?.(cast.charged ? 3 : 2);
  }

  function whirlwind(cast) {
    animate(cast, 0.24);
    spin(cast);
    if (cast.charged) add({ kind: 'sequence', cast, life: 0.44, time: 0, next: 0.19, left: 2 });
  }

  function leapSlam(cast) {
    const p = cast.player;
    const maximum = cast.charged ? 135 + cast.power * 42 : 88;
    const reach = Math.min(maximum, cast.range > 0 ? cast.range : maximum);
    animate(cast, 0.33);
    const duration = cast.charged ? 0.26 : 0.19;
    if (!cast.visual) p.iframes = Math.max(p.iframes || 0, duration);
    add({ kind: 'leap', cast, life: duration, total: duration, speed: reach / duration,
      x: p.x, y: p.y });
  }

  function land(effect) {
    const { cast, x, y } = effect;
    const radius = cast.charged ? 81 + cast.power * 19 : 58;
    for (const enemy of nearby(x, y, radius)) {
      hit(cast, enemy, cast.charged ? 2.2 + cast.power * 0.85 : 1.8, 'physical');
      stagger(cast, enemy, cast.charged ? 0.75 : 0.35);
    }
    ring(x, y, radius, GOLD, 0.4);
    CC.fx?.burst?.(x, y, '#c99f72', cast.charged ? 24 : 12, 130);
    if (cast.charged) {
      for (let i = 0; i < 5; i++) {
        const a = cast.angle + i * Math.PI * 2 / 5;
        CC.Vfx?.spawn?.('earthSpikes', x, y, radius, { a });
      }
    }
    CC.fx?.shake?.(cast.charged ? 7 : 4);
  }

  function bladeWave(cast) {
    const p = cast.player;
    animate(cast, 0.23);
    const life = cast.charged ? 1.04 + cast.power * 0.18 : 0.75;
    const width = cast.charged ? 19 + cast.power * 4 : 11;
    const speed = cast.charged ? 280 : 250;
    CC.SpellCharge?.effect?.('swordsmanEcho', { x: p.x, y: p.y, angle: cast.angle,
      radius: width, color: STEEL, life, speed, width: cast.charged ? 5 : 3 });
    add({ kind: 'wave', cast, x: p.x, y: p.y, seen: new Set(), life, width, speed });
  }

  function advanceWave(effect, dt) {
    const { cast, seen, speed, width } = effect;
    const steps = Math.max(1, Math.ceil(speed * dt / 5));
    for (let i = 0; i < steps; i++) {
      const x = effect.x + cast.dx * speed * dt / steps;
      const y = effect.y + cast.dy * speed * dt / steps;
      if (solid(x, y)) { effect.life = 0; return; }
      effect.x = x;
      effect.y = y;
      if (cast.visual) continue;
      for (const enemy of nearby(x, y, width)) {
        if (seen.has(enemy)) continue;
        seen.add(enemy);
        hit(cast, enemy, cast.charged ? 1.9 + cast.power * 0.7 : 1.6, 'wave');
        if (cast.charged) stagger(cast, enemy, 0.5);
      }
    }
  }

  function warCry(cast) {
    const p = cast.player;
    if (!cast.visual) {
      p.skBuff = {
        t: cast.charged ? 11 + cast.power * 3 : 8,
        dmg: cast.charged ? 0.31 + cast.power * 0.06 : 0.25,
        spd: cast.charged ? 0.21 : 0.15,
        resistance: cast.charged ? 0.25 : 0
      };
      const rank = CC.Skills?.effRank?.(p, 'cry') || 0;
      if (rank > 0) CC.Classes?.heal?.(p, p.maxHp * 0.06 * rank);
    }
    ring(p.x, p.y, cast.charged ? 102 : 66, GOLD, 0.5);
    if (cast.charged) ring(p.x, p.y, 68, '#ffeed0', 0.31);
    CC.fx?.burst?.(p.x, p.y, GOLD, cast.charged ? 25 : 14, 130);
    CC.fx?.shake?.(cast.charged ? 5 : 2);
  }

  function update(dt) {
    if (!sync()) return;
    for (const effect of effects.slice()) {
      const step = Math.min(effect.life, dt);
      effect.life -= dt;
      const { cast } = effect;
      if (effect.kind === 'sequence') {
        effect.time += dt;
        while (effect.left > 0 && effect.time >= effect.next) {
          spin(cast);
          effect.next += 0.19;
          effect.left--;
        }
      } else if (effect.kind === 'rush' || effect.kind === 'leap') {
        const p = cast.player;
        const target = cast.visual || effect.kind === 'leap' ? effect : p;
        if (effect.kind === 'rush' && cast.visual && effect.x === undefined) {
          effect.x = p.x;
          effect.y = p.y;
        }
        const dx = cast.dx * effect.speed * step, dy = cast.dy * effect.speed * step;
        const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 5));
        for (let i = 0; i < steps; i++) {
          if (target === p) move(p, dx / steps, dy / steps);
          else if (clearLine(target.x, target.y, target.x + dx / steps, target.y + dy / steps)) {
            target.x += dx / steps;
            target.y += dy / steps;
          }
          if (effect.kind === 'rush') effect.hitFront(target.x, target.y, 29);
        }
        if (effect.kind === 'leap') {
          if (!cast.visual) move(p, effect.x - p.x, effect.y - p.y);
          if (effect.life <= 0) {
            if (!cast.visual) Object.assign(effect, { x: p.x, y: p.y });
            land(effect);
          }
        }
      } else if (effect.kind === 'wave') advanceWave(effect, step);
    }
    for (let i = effects.length - 1; i >= 0; i--) {
      if (effects[i].life <= 0) effects.splice(i, 1);
    }
  }

  function draw(ctx, camera) {
    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    for (const effect of effects) {
      ctx.save();
      ctx.beginPath();
      if (effect.kind === 'wave') {
        ctx.translate(effect.x, effect.y);
        ctx.rotate(effect.cast.angle);
        ctx.strokeStyle = STEEL;
        ctx.lineWidth = effect.cast.charged ? 5 : 2.8;
        ctx.ellipse(-4, 0, 11, effect.width, 0, -1.42, 1.42);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#f6ffff';
        ctx.stroke();
      } else if (effect.kind === 'ring') {
        const progress = 1 - effect.life / effect.total;
        ctx.globalAlpha = 1 - progress;
        ctx.strokeStyle = effect.color;
        ctx.lineWidth = 3;
        ctx.ellipse(effect.x, effect.y, 6 + effect.radius * progress, 4 + effect.radius * progress * 0.8,
          0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (effect.kind === 'spin') {
        const progress = 1 - effect.life / effect.total;
        ctx.globalAlpha = 1 - progress;
        ctx.strokeStyle = '#fff4ca';
        ctx.lineWidth = 5;
        ctx.ellipse(effect.player.x, effect.player.y - 4, effect.radius, effect.radius * 0.75,
          0, effect.angle + progress * 6, effect.angle + progress * 6 + 2.5);
        ctx.stroke();
      } else if (effect.kind === 'leap') {
        const lift = 22 * Math.sin(Math.PI * effect.life / effect.total);
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 3;
        ctx.moveTo(effect.x - 10, effect.y - lift - 11);
        ctx.lineTo(effect.x + 9, effect.y - lift + 1);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  const drawers = {
    swordsmanEcho(ctx, e, x, y, progress) {
      if (!e.visual) return;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = e.width;
      ctx.beginPath();
      if (e.speed) {
        ctx.translate(x + Math.cos(e.angle) * e.speed * e.t, y + Math.sin(e.angle) * e.speed * e.t);
        ctx.rotate(e.angle);
        ctx.ellipse(-4, 0, 11, e.radius, 0, -1.42, 1.42);
      } else {
        const r = e.radius * (0.25 + progress * 0.75);
        const angle = e.spin ? e.angle + progress * 6 : 0;
        ctx.ellipse(x, y, r, r * 0.8, 0, angle, angle + (e.spin ? 2.5 : Math.PI * 2));
      }
      ctx.stroke();
    }
  };

  function register(registry = CC.SpellPairs) {
    if (!registry?.register) return;
    function pair(id, name, tapDesc, chargeDesc, target, cost, cooldown, fire) {
      function cast(charged) {
        return (player, aim = {}, power = 1) => {
          if (!sync()) return false;
          const dx = aim.dx ?? player.aimX ?? player.face ?? 1;
          const dy = aim.dy ?? player.aimY ?? 0;
          const angle = Math.atan2(dy, dx);
          fire({ player, dx: Math.cos(angle), dy: Math.sin(angle), angle, id, charged,
            range: aim.range, power: Math.max(0, Math.min(1, power)), visual: false });
          return true;
        };
      }
      registry.register(id, { name, tapDesc, chargeDesc, ...target, cost: cost[0], manaMul: cost[1] / cost[0],
        cooldown: cooldown[0], cdMul: cooldown[1] / cooldown[0], clear, drawers,
        tap: (player, aim) => cast(false)(player, aim), charge: cast(true) });
    }
    pair('swordsman_spell1', 'Shield Breaker', 'Bash and stun foes directly ahead.',
      'Rush forward, staggering several foes and weakening their armor.',
      { shape: 'cone', range: 90, radius: 43, color: STEEL }, [8, 14], [4, 7], shieldBash);
    pair('swordsman_spell2', 'Blade Storm', 'Cut surrounding foes with a single spin.',
      'Draw nearby foes inward with three successive spins.',
      { shape: 'circle', range: 0, radius: 70, color: GOLD }, [18, 30], [7, 12], whirlwind);
    pair('leap', 'Earthshaker', 'Leap and stagger foes where you land.',
      'Leap farther and drive fissures outward from the landing.',
      { shape: 'circle', range: 177, radius: 100, color: GOLD }, [22, 37], [9, 15], leapSlam);
    pair('wave', 'Great Cleave', 'Fire a piercing crescent of steel.',
      'Fire a larger, longer-ranged crescent that staggers foes.',
      { shape: 'line', range: 342, radius: 23, color: STEEL }, [20, 34], [6, 10], bladeWave);
    pair('cry', 'Battle Roar', 'Briefly boost damage and movement speed.',
      'Extend the rally and reduce incoming damage.',
      { shape: 'circle', range: 0, radius: 102, color: GOLD }, [30, 50], [22, 35], warCry);
  }

  const shell = CC.SpellCharge;
  if (shell?.update && shell.draw) {
    const tick = shell.update, paint = shell.draw;
    shell.update = function (dt) { tick.call(this, dt); update(dt); };
    shell.draw = function (ctx, camera) { paint.call(this, ctx, camera); draw(ctx, camera); };
  }

  CC.SwordsmanSpells = { register, update, draw, clear };
  register();
})(typeof window !== 'undefined' ? window : globalThis);
