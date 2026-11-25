/* Run-local pickups for Endless Plains. Gameplay timers follow the active run clock. */
(function (root) {
  'use strict';
  const CC = root.CC;
  const TAU = Math.PI * 2;
  const POWERS = {
    rapid: { name: 'RAPID FIRE + PIERCING', icon: '»', color: '#ffd84a', duration: 12 }, // the same effect as the Town Defense power-up: faster basic attacks that pierce
    shield: { name: 'Shield', icon: '◈', color: '#91dcff', duration: 8 },
    bomb: { name: 'Bomb', icon: '✦', color: '#ff9c78' },
    xp: { name: 'Double XP', icon: 'XP', color: '#9be7a3', duration: 20 },
    damage: { name: 'Double Damage', icon: '2×', color: '#ffadb0', duration: 12 },
    guardian: { name: 'Guardian', icon: '◇', color: '#c7b2ff', duration: 20 }
  };
  const kinds = Object.keys(POWERS);
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function create(run, map, random, clearPath) {
    const pickups = [];
    const effects = new Map();
    const visuals = [];
    const bag = [];
    const nextThreshold = () => 12 + Math.floor(random() * 9);
    let killsUntilDrop = nextThreshold();
    let nextDropAt = 0;
    let detonating = false;

    function onKill(enemy) {
      if (detonating) return;
      killsUntilDrop = Math.max(0, killsUntilDrop - 1);
      if (killsUntilDrop || run.seconds < nextDropAt || pickups.length >= 5) return;
      let point = enemy;
      if (map.isSolid(point.x, point.y)) {
        point = map.enemySpawns.find(candidate => distance(candidate, enemy) <= 48 &&
          !map.isSolid(candidate.x, candidate.y));
        if (!point) return;
      }
      if (!bag.length) bag.push(...kinds);
      const [kind] = bag.splice(Math.floor(random() * bag.length), 1);
      pickups.push({ kind, x: point.x, y: point.y, expires: run.seconds + 24 });
      killsUntilDrop = nextThreshold();
      nextDropAt = run.seconds + 5;
    }

    function active(kind, hero) {
      return effects.get(hero)?.[kind]?.expires > run.seconds;
    }

    function collect(pickup, hero) {
      const { kind } = pickup;
      const { name, color, duration } = POWERS[kind];
      CC.fx?.text?.(hero.x, hero.y - 28, name, color, 12);
      CC.Audio?.event?.('powerup');
      if (kind === 'bomb') {
        detonating = true;
        try {
          CC.Enemies.clearForPlainsBomb();
        } finally {
          detonating = false;
        }
        visuals.push({ x: hero.x, y: hero.y, radius: 115, color, duration: 0.5, expires: run.seconds + 0.5 });
        return;
      }
      const powers = effects.get(hero) || {};
      const timer = powers[kind] || { x: hero.x, y: hero.y, nextBolt: 0, nextSpell: 0 };
      timer.expires = run.seconds + duration;
      powers[kind] = timer;
      effects.set(hero, powers);
      if (kind === 'rapid') { // the shared power-up state classes.js reads: piercing basic shots / waves
        hero.pw = hero.pw || { rapid: 0, explode: 0, shield: 0, shieldBase: 0 };
        hero.pw.rapid = duration;
        CC.fx?.burst?.(hero.x, hero.y, color, 16, 110);
      }
      if (kind === 'shield') {
        hero._poison = null;
        hero.wound = null;
      }
    }

    function* targets(origin, range) {
      for (const enemy of CC.Enemies.list) {
        if (enemy.dead || enemy.hp <= 0 || enemy.collapsed || (enemy.boss && enemy.invuln > 0)) continue;
        const reach = distance(origin, enemy);
        if (reach <= range && clearPath(map, origin, enemy, reach)) yield { enemy, reach };
      }
    }

    function nearest(origin, range) {
      let closest = null;
      for (const candidate of targets(origin, range)) {
        if (!closest || candidate.reach < closest.reach) closest = candidate;
      }
      return closest?.enemy;
    }

    function hit(enemy, damage, type) {
      CC.Endless.onHit(CC.Enemies.damage(enemy, damage, type));
    }

    function fire(origin, enemy, damage, type, color, lift = 0) {
      visuals.push({ x: origin.x, y: origin.y - lift, tx: enemy.x, ty: enemy.y - 4, color,
        duration: 0.12, expires: run.seconds + 0.12 });
      hit(enemy, damage, type);
    }

    function updateGuardian(guardian, hero, dt) {
      const drift = run.seconds * 1.65;
      const offset = { x: hero.x + Math.cos(drift) * 22, y: hero.y + Math.sin(drift) * 15 };
      const follow = Math.min(1, dt * 10);
      guardian.x += (offset.x - guardian.x) * follow;
      guardian.y += (offset.y - guardian.y) * follow;
      if (map.isSolid(guardian.x, guardian.y)) {
        guardian.x = hero.x;
        guardian.y = hero.y;
      }
      if (run.seconds < guardian.nextBolt) return;
      const target = nearest(guardian, 195);
      if (!target) {
        guardian.nextBolt = run.seconds + 0.15;
        return;
      }
      if (run.seconds >= guardian.nextSpell) {
        const center = { x: target.x, y: target.y };
        guardian.nextSpell = run.seconds + 3.2;
        guardian.nextBolt = run.seconds + 0.45;
        for (const { enemy } of targets(center, 42)) hit(enemy, hero.stats.dmg * 0.7, 'frost');
        visuals.push({ ...center, radius: 40, color: '#9ee9ff', duration: 0.35, expires: run.seconds + 0.35 });
      } else {
        guardian.nextBolt = run.seconds + 0.65;
        fire(guardian, target, hero.stats.dmg * 0.65, 'arcane', POWERS.guardian.color, 14);
      }
    }

    function update(dt, heroes) {
      for (let i = pickups.length - 1; i >= 0; i--) {
        const pickup = pickups[i];
        const hero = pickup.expires > run.seconds && heroes.find(candidate => distance(candidate, pickup) <= 21);
        if (hero || pickup.expires <= run.seconds) pickups.splice(i, 1);
        if (hero) collect(pickup, hero);
      }
      for (const [hero, powers] of effects) {
        for (const kind of Object.keys(powers)) if (!active(kind, hero)) delete powers[kind];
        if (!powers.rapid && hero.pw) hero.pw.rapid = 0;
        if (!heroes.includes(hero) || !Object.keys(powers).length) {
          effects.delete(hero);
          continue;
        }
        const { rapid, guardian } = powers;
        if (rapid && hero.pw) { // exactly the Town Defense rapid fire: the attack cooldown drains 1.6x faster
          hero.pw.rapid = Math.max(0.01, rapid.expires - run.seconds);
          if (hero.cd && hero.cd.attack > 0) hero.cd.attack = Math.max(0, hero.cd.attack - dt * 1.6);
        }
        if (guardian) updateGuardian(guardian, hero, dt);
      }
      for (let i = visuals.length - 1; i >= 0; i--) if (visuals[i].expires <= run.seconds) visuals.splice(i, 1);
    }

    function drawGuardian(canvas, guardian, cam) {
      const x = guardian.x - cam.x;
      const y = guardian.y - cam.y - 14 + Math.sin(run.seconds * 5) * 2;
      canvas.save();
      canvas.translate(x, y);
      canvas.fillStyle = '#242039';
      canvas.strokeStyle = '#b9a7eb';
      canvas.lineWidth = 1.3;
      // An obsidian mask with swept horns and small floating mantle plates.
      canvas.beginPath();
      canvas.moveTo(-9, -1); canvas.lineTo(-13, -10); canvas.lineTo(-5, -7);
      canvas.lineTo(5, -7); canvas.lineTo(13, -10); canvas.lineTo(9, -1);
      canvas.lineTo(6, 5); canvas.lineTo(0, 9); canvas.lineTo(-6, 5);
      canvas.closePath(); canvas.fill(); canvas.stroke();
      canvas.fillStyle = '#bcefdc';
      canvas.fillRect(-5, -2, 3, 2); canvas.fillRect(2, -2, 3, 2);
      canvas.fillStyle = '#8a76bb';
      for (const side of [-1, 1]) {
        canvas.beginPath();
        canvas.moveTo(side * 10, 2); canvas.lineTo(side * 17, 6);
        canvas.lineTo(side * 10, 10); canvas.closePath(); canvas.fill();
      }
      canvas.restore();
    }

    function draw(canvas, cam) {
      canvas.save();
      canvas.textAlign = 'center';
      canvas.textBaseline = 'middle';
      canvas.font = 'bold 10px sans-serif';
      for (const pickup of pickups) {
        const { color, icon } = POWERS[pickup.kind];
        const x = pickup.x - cam.x;
        const y = pickup.y - cam.y - 5 + Math.sin(run.seconds * 3 + pickup.x) * 2;
        canvas.fillStyle = '#241a2b';
        canvas.strokeStyle = color;
        canvas.lineWidth = 2;
        canvas.beginPath();
        canvas.arc(x, y, 10, 0, TAU); canvas.fill(); canvas.stroke();
        canvas.fillStyle = color;
        canvas.fillText(icon, x, y + 0.5);
      }
      for (const [hero, powers] of effects) {
        if (powers.guardian) drawGuardian(canvas, powers.guardian, cam);
        if (powers.rapid) { // the same golden ground ring as in Town Defense
          canvas.globalAlpha = 0.5; canvas.strokeStyle = '#ffd84a'; canvas.lineWidth = 1.6; canvas.beginPath();
          canvas.ellipse(hero.x - cam.x, hero.y - cam.y + 9, 17 + Math.sin(run.seconds * 12) * 2, 6.5, 0, 0, TAU); canvas.stroke(); canvas.globalAlpha = 1;
        }
        if (!powers.shield) continue;
        canvas.strokeStyle = '#91dcff';
        canvas.globalAlpha = 0.54;
        canvas.lineWidth = 1.5;
        canvas.beginPath();
        canvas.ellipse(hero.x - cam.x, hero.y - cam.y - 5, 16, 19, 0, 0, TAU); canvas.stroke();
        canvas.globalAlpha = 1;
      }
      for (const effect of visuals) {
        const remaining = (effect.expires - run.seconds) / effect.duration;
        canvas.globalAlpha = Math.min(0.7, remaining);
        canvas.strokeStyle = effect.color;
        canvas.lineWidth = 2;
        canvas.beginPath();
        if (effect.radius) canvas.arc(effect.x - cam.x, effect.y - cam.y, effect.radius * (1 - remaining), 0, TAU);
        else {
          canvas.moveTo(effect.x - cam.x, effect.y - cam.y);
          canvas.lineTo(effect.tx - cam.x, effect.ty - cam.y);
        }
        canvas.stroke();
      }
      canvas.restore();
    }

    function drawHud(canvas, width, hero) {
      const powers = effects.get(hero);
      if (!powers) return;
      canvas.save();
      canvas.font = 'bold 10px sans-serif';
      canvas.textAlign = 'center';
      const badges = Object.entries(powers);
      const left = CC.Minimap ? CC.Minimap.margin + CC.Minimap.size + 8 : 8;
      const badgeWidth = Math.min(60, (width - left - 8) / badges.length);
      const start = Math.max(left, (width - badges.length * badgeWidth) / 2);
      for (let i = 0; i < badges.length; i++) {
        const [kind, timer] = badges[i];
        const x = start + i * badgeWidth;
        canvas.fillStyle = 'rgba(20, 12, 26, 0.84)';
        canvas.fillRect(x, 73, badgeWidth - 3, 18);
        canvas.fillStyle = POWERS[kind].color;
        canvas.fillText(POWERS[kind].icon + ' ' + Math.ceil(timer.expires - run.seconds) + 's', x + (badgeWidth - 3) / 2, 85);
      }
      canvas.restore();
    }
    return { active, onKill, update, draw, drawHud };
  }

  CC.PlainsPowerups = { create };
})(window);
