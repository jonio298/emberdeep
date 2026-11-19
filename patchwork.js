/* Emberdeep: rare patchwork mini-boss assembled from battlefield remains.
 * Uses existing Enemies AI, movement, gore, bone piles and combat interactions.
 */
(function () {
  'use strict';
  var CC = window.CC = window.CC || {}, E = CC.Enemies;
  if (!E) return;
  var random = Math.random, cooldown = 12, timer = 0, seq = 900000;
  var partTypes = { limb:1, head:1, horn:1, hoof:1, chunk:1, bone:1, skull:1 };
  var originalRemains = E._remains, originalDetach = E._detach, originalLand = E._land;
  function sourcePart(m, from) { if (m && !m.source && from) m.source = from; }
  E._remains = function (e, bonesOnly) {
    var count = this.remains.length, value = originalRemains.apply(this, arguments);
    for (var i = count; i < this.remains.length; i++) sourcePart(this.remains[i], e.type);
    return value;
  };
  E._detach = function (e, slot) {
    var start = this.gore.length, result = originalDetach.apply(this, arguments);
    for (var i = start; i < this.gore.length; i++)
      if (this.gore[i].kind !== 'blood') this.gore[i].source = e.type;
    return result;
  };
  E._land = function (q) {
    var count = this.remains.length, value = originalLand.apply(this, arguments);
    for (var i = count; i < this.remains.length; i++) sourcePart(this.remains[i], q.source);
    return value;
  };
  var oldSpawn = E.spawnForFloor;
  E.spawnForFloor = function () {
    cooldown = 12; timer = 0;
    return oldSpawn.apply(this, arguments);
  };
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function free(x, y) {
    var d = CC.Dungeon;
    if (!d || !d.isSolid) return true;
    return !d.isSolid(x, y) && !d.isSolid(x - 13, y) && !d.isSolid(x + 13, y) &&
      !d.isSolid(x, y - 13) && !d.isSolid(x, y + 13);
  }
  function monster(type, x, y, floor) {
    var def = E.TYPES[type], h = 1 + 0.18 * (floor - 1);
    var hp = Math.round(def.hp * h * 2);
    return { id: seq++, type:type, name:def.name, x:x, y:y, r:def.r, maxHp:hp, hp:hp,
      dmg:Math.round(def.dmg * (1 + 0.12 * (floor - 1))), spd:def.spd, xp:def.xp,
      color:def.color, state:'idle', t:0, cd:0.8, face:1, flash:0, slow:0,
      burn:0, asleep:false, dead:false, contact:0, size:0, floor:floor, ang:0,
      tele:null, group:0, anim:random() * 10, strafe:random() < 0.5 ? 1 : -1,
      poison:!!def.poison, ghost:!!def.ghost, fireproof:!!def.fire,
      vamp:!!def.vamp, armored:!!def.armored, danger:false, dangerous:false };
  }
  function emit(x, y, col, n) {
    if (CC.fx) {
      if (CC.fx.burst) CC.fx.burst(x, y, col, n || 15, 95);
      if (CC.fx.shake) CC.fx.shake(5);
    }
  }
  function build(group, x, y) {
    var floor = CC.state.floor || 1, e = monster('ghoul', x, y, floor);
    e.stitched = true; e.name = 'The Patchwork Horror';
    e.maxHp = e.hp = Math.round(e.hp * 3);
    e.dmg = Math.round(e.dmg * 3); e.spd *= 1.55; e.xp *= 5; e.r = 15;
    e.stitchTimer = 3; e.stitchColors = group.map(function(q){return q.col || '#84394d';}).slice(0, 7);
    e.miniBoss = true; e.boss = false; e.stitchBlood = 0;
    E.list.push(e);
    for (var i = 0; i < group.length; i++) {
      var at = E.remains.indexOf(group[i]);
      if (at !== -1) E.remains.splice(at, 1);
    }
    for (i = 0; i < 18; i++) {
      var a = i * Math.PI * 2 / 18;
      E._gorePart(x, y, Math.cos(a) * (70 + random() * 90),
        Math.sin(a) * (70 + random() * 90), 75 + random() * 85, 'blood',
        i % 2 ? '#ad1c38' : '#ab66ca', 1.1, 0);
    }
    emit(x, y, '#b36bf0', 28);
    if (CC.fx && CC.fx.text)
      CC.fx.text(x, y - 35, 'THE PATCHWORK HORROR!', '#d18aff', 16);
  }
  function attempt(dt) {
    cooldown = Math.max(0, cooldown - dt);
    if (cooldown > 0 || !CC.state || CC.state.mode !== 'dungeon') return;
    if (E.list.some(function(e){return e.stitched && !e.dead;})) return;
    var parts = E.remains, i, j;
    for (i = 0; i < parts.length; i++) {
      var p = parts[i], types = {}, group = [];
      if (!partTypes[p.kind] || !p.source) continue;
      for (j = 0; j < parts.length; j++) {
        var q = parts[j];
        if (q.source && partTypes[q.kind] && dist(p, q) <= 70) {
          group.push(q); types[q.source] = true;
        }
      }
      if (group.length < 4 || Object.keys(types).length < 3) continue;
      cooldown = 24;
      if (random() < 0.22 && free(p.x, p.y) && (!CC.state.player || dist(p, CC.state.player) > 65))
        build(group, p.x, p.y);
      break;
    }
  }
  function summon(e) {
    var count = E.list.filter(function(o){return !o.dead && o.type === 'skeleton';}).length;
    if (count >= 12) return;
    var candidates = E.piles.filter(function(p){
      return p.bones >= 3 && dist(p, e) < 125 && free(p.x, p.y);
    });
    candidates.sort(function(a,b){return dist(a,e) - dist(b,e);});
    if (!candidates.length) return;
    var pile = candidates[0], skeleton = monster('skeleton', pile.x, pile.y, e.floor);
    pile.bones -= 3;
    if (pile.bones <= 0) E.piles.splice(E.piles.indexOf(pile), 1);
    skeleton.hp = Math.round(skeleton.maxHp * 0.8);
    skeleton.risen = true; skeleton.rose = true; skeleton.group = e.id; skeleton.cd = 0.55;
    E.list.push(skeleton);
    emit(pile.x, pile.y, '#b27ee0', 15);
    if (CC.fx && CC.fx.text)
      CC.fx.text(e.x, e.y - 29, 'BONE REANIMATION!', '#d39cff', 12);
  }
  var oldUpdate = E.update;
  E.update = function (dt) {
    // Seed the effects before the normal update so they share its clipping and cleanup.
    var result = oldUpdate.apply(this, arguments);
    timer += dt;
    attempt(dt);
    for (var i = 0; i < E.list.length; i++) {
      var e = E.list[i];
      if (!e.stitched || e.dead) continue;
      e.stitchTimer -= dt;
      if (e.stitchTimer <= 0) {
        e.stitchTimer = 4.5 + random() * 2.5;
        summon(e);
      }
      // An asymmetric, bloody gait while moving toward the player.
      var p = CC.state && CC.state.player;
      if (p && dist(e, p) < 240 && timer - (e.stitchBlood || 0) > 0.22) {
        e.stitchBlood = timer;
        if (E._addRemain) E._addRemain('drip', e.x + (random() - 0.5) * 8, e.y + 7, 1.7, '#8b1321', 25);
      }
    }
    return result;
  };
  var oldDraw = E.draw;
  E.draw = function (ctx, cam) {
    var result = oldDraw.apply(this, arguments);
    for (var i = 0; i < E.list.length; i++) {
      var e = E.list[i];
      if (!e.stitched || e.dead) continue;
      var x = e.x - cam.x, y = e.y - cam.y, r = e.r;
      if (x < -30 || y < -30 || x > cam.w + 30 || y > cam.h + 30) continue;
      if (CC.Dungeon && CC.Dungeon.isVisible && !CC.Dungeon.isVisible(e.x,e.y)) continue;
      ctx.save();
      ctx.translate(x, y + Math.abs(Math.sin(e.anim * 9)) * 2);
      ctx.scale(e.face || 1, 1);
      var colors = e.stitchColors || ['#91333a','#7d985a','#955483'];
      // Visibly mismatched skin grafts sewn across the moving creature.
      for (var n = 0; n < 7; n++) {
        var xx = Math.sin(n * 2.69) * r * 0.58, yy = Math.cos(n * 3.17) * r * 0.46;
        ctx.fillStyle = colors[n % colors.length];
        ctx.beginPath(); ctx.ellipse(xx, yy, 3 + n % 3, 3.5, n, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#24101b'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(xx - 3, yy); ctx.lineTo(xx + 3, yy); ctx.stroke();
        ctx.strokeStyle = '#d7b6b1'; ctx.beginPath();
        ctx.moveTo(xx - 1, yy - 2); ctx.lineTo(xx + 1, yy + 2); ctx.stroke();
      }
      ctx.strokeStyle = '#6c283b'; ctx.lineWidth = 3; ctx.beginPath();
      ctx.moveTo(-r * 0.5, r * 0.4); ctx.lineTo(-r * 0.75 + Math.sin(e.anim * 10) * 4, r * 1.2);
      ctx.moveTo(r * 0.4, r * 0.4); ctx.lineTo(r * 0.8 - Math.sin(e.anim * 7) * 4, r * 1.1); ctx.stroke();
      ctx.fillStyle = '#a5162c'; ctx.fillRect(-r * 0.53, r * 0.15, 3, 5);
      ctx.restore();
      // Unique mini-boss title and violet HP bar.
      ctx.fillStyle = 'rgba(5,2,12,0.8)'; ctx.fillRect(x - 34, y - r - 21, 68, 7);
      ctx.fillStyle = '#b465e4'; ctx.fillRect(x - 33, y - r - 20, 66 * Math.max(0, e.hp / e.maxHp), 5);
      ctx.fillStyle = '#e6aaff'; ctx.font = 'bold 9px Georgia,serif'; ctx.textAlign = 'center';
      ctx.fillText('PATCHWORK HORROR', x, y - r - 27); ctx.textAlign = 'left';
    }
    return result;
  };
  CC.Patchwork = { attempt: attempt, summon: summon };
})();