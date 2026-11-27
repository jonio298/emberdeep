/* CC.DayNight - the day and night cycle.
 *
 * Every 10 minutes the world switches between DAY and NIGHT (it starts at dawn). The change fades over about half a minute. It lights the outdoor areas
 * (Giant Forest, Rolling Plains, Rocky Pass, the Abandoned Village) by moving each map's own `ambient` darkness; caves and the Cinderwake are always dark.
 *
 * At night every monster outdoors is stronger (+15% health, +20% damage), all monsters get scarier glowing eyes (bats red, skeletons purple, the
 * rest ember-red), and Dire Wolves turn into WEREWOLVES. Sleep in your camp's tent bed to wait out the night (Camp.interact calls skipToMorning).
 *
 * API: isNight() nightness() clock() skipToMorning() serialize() restore(d) reset() drawHud(ctx,W,H) update(dt) outdoors()
 *      NIGHT_HP, NIGHT_DMG, PHASE (seconds per phase)
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, D = CC.DayNight = {}, E = CC.Enemies, F = CC.Forest, PI2 = Math.PI * 2;
  var PHASE = 600, FADE = 28, NIGHT_HP = 1.15, NIGHT_DMG = 1.2, OUTDOOR = { forest: 1, plains: 1, 'rocky-pass': 1, village: 1, 'tree-ascent': 1 };
  var clock = 0, n = 0, showT = 0, wasNight = null, banner = -1, bannerPending = false;
  var BANNER_LEN = 7;
  D.PHASE = PHASE; D.NIGHT_HP = NIGHT_HP; D.NIGHT_DMG = NIGHT_DMG;

  function area() { return CC.state && CC.state.area; }
  function targetNight() { return Math.floor(clock / PHASE) % 2 === 1; }
  D.outdoors = function (a) { return !!OUTDOOR[a || area()]; };
  D.clock = function () { return clock; };
  D.isNight = function () { return n > 0.5; };
  D.nightness = function () { return n; };
  D.secondsLeft = function () { return PHASE - (clock % PHASE); };
  D.frozen = false;
  // test mode: jump straight to day or night (night shows the 'Night Falls' card); the clock can be frozen
  D.setNight = function (on) { clock = on ? PHASE + 5 : 5; n = on ? 1 : 0; wasNight = !on ? true : false; if (on) bannerPending = true; };
  D.reset = function () { clock = 0; n = 0; wasNight = null; banner = -1; bannerPending = false; };
  D.serialize = function () { return { t: Math.round(clock) }; };
  D.restore = function (d) { clock = d && isFinite(d.t) ? Math.max(0, +d.t) : 0; n = targetNight() ? 1 : 0; };
  // sleep until morning: jump to the start of the next day phase; the light comes back up over a few seconds
  D.skipToMorning = function () {
    if (!targetNight() && n < 0.5) return false;
    clock = (Math.floor(clock / PHASE) + 1) * PHASE; n = Math.max(n, 0.7);
    if (CC.fx && CC.state && CC.state.player) CC.fx.text(CC.state.player.x, CC.state.player.y - 30, 'MORNING', '#ffe08a', 14);
    return true;
  };

  /* ---------- lighting: move the map's ambient darkness ---------- */
  function parse(s) { var a = String(s).split(',').map(Number); return a.length === 4 && a.every(isFinite) ? a : null; }
  function lighting(map) {
    if (!map) return;
    if (!map._dnReady) { map._dnReady = true; map._dnAmb = parse(map.ambient); map._dnLight = map.playerLight; }
    if (!map._dnAmb) return;
    var a = map._dnAmb, k = D.outdoors() ? n : 0, NI = [10, 14, 34, 0.66]; // the night is deep but not black: beyond your light the world lies half-seen
    var c0 = Math.round(a[0] + (NI[0] - a[0]) * k), c1 = Math.round(a[1] + (NI[1] - a[1]) * k), c2 = Math.round(a[2] + (NI[2] - a[2]) * k), al = a[3] + (Math.max(a[3], NI[3]) - a[3]) * k + 0.035 * k * Math.sin(Date.now() / 1400); // the dark slowly breathes
    map.ambient = c0 + ',' + c1 + ',' + c2 + ',' + al.toFixed(3);
    map.playerLight = map._dnLight * (1 - 0.4 * k); // at night you see only a modest circle around you
  }

  /* ---------- your own light: at night every hero lights the ground around them in their class colour ---------- */
  var LIGHT = { swordsman: '150,200,255', wizard: '85,115,235', necromancer: '140,255,170', thief: '255,115,100' }; // blue/white, darker blue/white, green/white, red/white
  D.lightColor = function (cls) { return LIGHT[cls] || '255,230,180'; };
  // ambient light, like a torch in a dark room: the dark is cut away around you in a soft falloff and a wide wash of class-coloured light spills over the ground and everything near you
  function playerLight(map, p) {
    if (!map || !map.lights || !p) return;
    if (!map._dnPl) { map._dnPl = [{ x: 0, y: 0, r: 0, color: '255,255,255', inten: 0, flicker: 0.035, flat: 1, glow: 0.18 }, { x: 0, y: 0, r: 0, color: '255,255,255', inten: 0, flicker: 0.05, flat: 1, glow: 0.14 }]; map.lights.push(map._dnPl[0], map._dnPl[1]); }
    var k = D.outdoors() ? n : 0, wide = map._dnPl[0], near = map._dnPl[1], col = LIGHT[p.classId] || '255,235,200';
    wide.x = near.x = p.x; wide.y = near.y = p.y - 2; wide.color = near.color = col;
    wide.r = 215 * k; wide.inten = 0.5 * k;   // the faint outer spill of light (a modest circle, not a huge one)
    near.r = 130 * k; near.inten = 0.9 * k;    // the brighter pool around you
  }

  /* ---------- the monsters at night ---------- */
  function buff(e, on) {
    if (on && !e._nb) { e._nb = 1; e.maxHp = (e.maxHp || e.hp) * NIGHT_HP; e.hp *= NIGHT_HP; e.dmg = (e.dmg || 0) * NIGHT_DMG; if (e.contactDmg) e.contactDmg *= NIGHT_DMG; }
    else if (!on && e._nb) { e._nb = 0; e.maxHp /= NIGHT_HP; e.hp = Math.min(e.maxHp, e.hp / NIGHT_HP); e.dmg /= NIGHT_DMG; if (e.contactDmg) e.contactDmg /= NIGHT_DMG; }
  }
  D.buff = buff;

  function update(dt) {
    var s = CC.state; if (!s || s.mode !== 'dungeon') return;
    if (!D.frozen) clock += dt;
    var tn = targetNight();
    if (wasNight === null) wasNight = tn;
    if (tn && !wasNight) bannerPending = true; // the moment night falls
    wasNight = tn;
    if (bannerPending && D.outdoors()) { bannerPending = false; banner = 0; if (CC.Audio && CC.Audio.fx) CC.Audio.fx('ghost_moan', { vol: 0.55, gap: 100 }); } // shown as soon as you are out under the sky
    if (banner >= 0) { banner += dt; if (banner > BANNER_LEN) banner = -1; }
    var want = tn ? 1 : 0;
    n = n < want ? Math.min(want, n + dt / FADE) : Math.max(want, n - dt / FADE); // the light fades over about half a minute
    lighting(s.map);
    playerLight(s.map, CC.state.player);
    var night = D.outdoors() && n > 0.5, list = CC.Enemies && CC.Enemies.list, i;
    if (list) for (i = 0; i < list.length; i++) { var e = list[i]; if (e && !e.dead) buff(e, night); }
    if (showT > 0) showT -= dt;
  }
  if (E && E.update) {
    var prevUpdate = E.update;
    E.update = function (dt) { var r = prevUpdate.apply(this, arguments); try { update(dt); } catch (err) { if (root.console) console.error(err); } return r; };
  }

  /* ---------- scarier eyes ---------- */
  var EYE = { // local eye positions in sprite units (x flips with the facing), colour
    bat: { c: '#ff2a2a', p: function (r) { return [[-2, -1], [2, -1]]; } },
    skeleton: { c: '#b45cff', p: function (r) { return [[-r * 0.4 + 1.5, -r * 0.65 + 1.5], [r * 0.15 + 1.5, -r * 0.65 + 1.5]]; } },
    ghost: { c: '#8ff0ff', p: function (r) { return [[-r * 0.35, -r * 0.3], [r * 0.35, -r * 0.3]]; } }
  };
  function drawEyes(ctx, cam) {
    var list = E && E.list, i, k, e, d, pts, col, g, w = cam.w || 0, h = cam.h || 0;
    if (!list || !D.outdoors() || n < 0.05) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < list.length; i++) {
      e = list[i]; if (!e || e.dead || e.collapsed || e._cine || e.asleep || e.nightStalker) continue;
      var sx = e.x - cam.x, sy = e.y - cam.y; if (sx < -30 || sy < -30 || sx > w + 30 || sy > h + 30) continue;
      d = EYE[e.type]; var r = e.r || 8, face = e.face || 1;
      if (e.type === 'direwolf') { pts = [[r * 0.62, -r * 0.28], [r * 0.9, -r * 0.2]]; col = '#ffd23a'; } // the werewolf's eyes (see its art below)
      else { pts = d ? d.p(r) : [[-r * 0.28, -r * 0.35], [r * 0.28, -r * 0.35]]; col = d ? d.c : '#ff5a2a'; }
      for (k = 0; k < pts.length; k++) {
        var ex = sx + face * pts[k][0], ey = sy + pts[k][1], gr = 3.5 + r * 0.16 + 1.5 * Math.sin((E._time || 0) * 6 + i + k);
        g = ctx.createRadialGradient(ex, ey, 0, ex, ey, gr * 2.1); g.addColorStop(0, col); g.addColorStop(0.4, col); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = n * 0.85; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ex, ey, gr * 2.1, 0, PI2); ctx.fill();
        ctx.globalAlpha = n; ctx.fillStyle = '#fff6d8'; ctx.fillRect(ex - 0.8, ey - 1.8, 1.6, 3.6); // a bright slit pupil
      }
    }
    ctx.restore();
  }
  if (E && E.draw) {
    var prevDraw = E.draw;
    E.draw = function (ctx, cam) { var r = prevDraw.apply(this, arguments); if (cam) try { drawEyes(ctx, cam); } catch (err) { if (root.console) console.error(err); } return r; };
  }

  /* ---------- werewolves: a Dire Wolf at night is drawn as a hunched, long-armed werewolf ---------- */
  function werewolf(ctx, e, r, col, dark, t) {
    var an = e.anim || 0, lunge = e.state === 'act' || e.state === 'telegraph', bob = Math.sin(an * 7) * 1.2, k;
    var fur = '#3a2e2a', fur2 = '#241a18', hl = '#6a5448', s = 1.35;
    ctx.save(); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, r * 0.85, r * 1.0, r * 0.32, 0, 0, PI2); ctx.fill();
    ctx.fillStyle = fur2; for (k = -1; k <= 1; k += 2) { ctx.beginPath(); ctx.moveTo(k * r * 0.35, r * 0.2); ctx.lineTo(k * r * 0.55 + Math.sin(an * 7 + k) * 2, r * 0.9); ctx.lineTo(k * r * 0.15, r * 0.9); ctx.closePath(); ctx.fill(); } // legs
    ctx.fillStyle = fur; ctx.beginPath(); ctx.moveTo(-r * 0.75, r * 0.3 + bob); ctx.quadraticCurveTo(-r * 0.9, -r * 0.7 + bob, -r * 0.1, -r * 0.8 + bob); ctx.lineTo(r * 0.55, -r * 0.55 + bob); ctx.lineTo(r * 0.55, r * 0.35 + bob); ctx.closePath(); ctx.fill(); // the hunched torso
    ctx.fillStyle = hl; ctx.beginPath(); ctx.ellipse(-r * 0.2, -r * 0.5 + bob, r * 0.4, r * 0.2, -0.4, 0, PI2); ctx.fill();
    ctx.strokeStyle = fur; ctx.lineWidth = 3.6; ctx.lineCap = 'round'; // long arms with claws, raised when it strikes
    var ax = r * 0.9, ay = lunge ? -r * 0.1 : r * 0.7;
    ctx.beginPath(); ctx.moveTo(r * 0.3, -r * 0.35 + bob); ctx.lineTo(ax, ay); ctx.stroke();
    ctx.strokeStyle = '#e8e0cc'; ctx.lineWidth = 1.2; for (k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + r * 0.35, ay + k * 3); ctx.stroke(); }
    ctx.fillStyle = fur; ctx.beginPath(); ctx.arc(r * 0.45, -r * 0.75 + bob, r * 0.42, 0, PI2); ctx.fill(); // the head
    ctx.beginPath(); ctx.moveTo(r * 0.6, -r * 0.85 + bob); ctx.lineTo(r * 1.35, -r * 0.6 + bob); ctx.lineTo(r * 0.7, -r * 0.45 + bob); ctx.closePath(); ctx.fill(); // the snout
    ctx.beginPath(); ctx.moveTo(r * 0.2, -r * 1.05 + bob); ctx.lineTo(r * 0.28, -r * 1.55 + bob); ctx.lineTo(r * 0.5, -r * 1.1 + bob); ctx.closePath(); ctx.fill(); // an ear
    ctx.fillStyle = '#f4efe0'; for (k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(r * (0.8 + k * 0.17), -r * 0.52 + bob); ctx.lineTo(r * (0.86 + k * 0.17), -r * 0.36 + bob); ctx.lineTo(r * (0.92 + k * 0.17), -r * 0.52 + bob); ctx.fill(); } // fangs
    ctx.fillStyle = '#10080a'; ctx.beginPath(); ctx.arc(r * 1.3, -r * 0.62 + bob, 1.4, 0, PI2); ctx.fill();
    ctx.restore();
  }
  if (F && !F._dnDraw) {
    F._dnDraw = true;
    var prevMonster = F.drawMonster;
    F.drawMonster = function (ctx, e, r, col, dark, t) {
      if (e.type === 'direwolf' && D.outdoors() && n > 0.5) { werewolf(ctx, e, r, col, dark, t); return true; }
      return prevMonster ? prevMonster.apply(this, arguments) : false;
    };
  }

  /* ---------- the little clock at the bottom of the screen ---------- */
  D.drawHud = function (ctx, W, H) {
    var s = CC.state; if (!s || s.mode !== 'dungeon' || !D.outdoors()) return;
    var night = n > 0.5, left = Math.ceil(D.secondsLeft()), mm = Math.floor(left / 60), ss = ('0' + (left % 60)).slice(-2), x = Math.round(W / 2), y = H - 15;
    ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = 'rgba(10,8,16,0.6)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - 44, y - 10, 88, 20, 10) : ctx.rect(x - 44, y - 10, 88, 20); ctx.fill();
    ctx.fillStyle = night ? '#cfd8ff' : '#ffd36b'; ctx.beginPath(); ctx.arc(x - 30, y, 5, 0, PI2); ctx.fill();
    if (night) { ctx.fillStyle = 'rgba(10,8,16,0.95)'; ctx.beginPath(); ctx.arc(x - 28, y - 1, 4.4, 0, PI2); ctx.fill(); }
    ctx.fillStyle = night ? '#cfd8ff' : '#ffe9a8'; ctx.font = 'bold 10px Georgia, serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText((night ? 'NIGHT ' : 'DAY ') + mm + ':' + ss, x - 20, y + 0.5); ctx.restore();
  };
  // 'Night Falls. Evil walks.': creepy blood-red lettering that fades in out of the dark, shivers, and fades away
  D.drawBanner = function (ctx, W, H) {
    if (banner < 0) return;
    var t = banner, a = t < 1.8 ? t / 1.8 : t < 4.6 ? 1 : Math.max(0, 1 - (t - 4.6) / (BANNER_LEN - 4.6));
    if (a <= 0.01) return;
    var size = Math.min(54, W / 8.2), cy = H * 0.3, now = Date.now() / 1000;
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var vg = ctx.createRadialGradient(W / 2, cy, 10, W / 2, cy, Math.max(W, H) * 0.7); vg.addColorStop(0, 'rgba(60,0,10,' + 0.28 * a + ')'); vg.addColorStop(1, 'rgba(0,0,0,' + 0.18 * a + ')'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H); // the world darkens a little
    var lines = [['Night Falls.', size, 0], ['Evil walks.', size * 0.78, size * 1.15]], i, j;
    for (i = 0; i < lines.length; i++) {
      var txt = lines[i][0], px = lines[i][1], y = cy + lines[i][2], font = 'italic bold ' + px + 'px Georgia, "Palatino Linotype", serif';
      ctx.font = font;
      var letters = txt.split(''), total = ctx.measureText(txt).width + letters.length * 3, x = W / 2 - total / 2;
      for (j = 0; j < letters.length; j++) { // each letter shivers on its own and fades in one after another
        var w = ctx.measureText(letters[j]).width + 3, la = clamp01(a * 1.4 - j * 0.03 - i * 0.25) * (0.88 + 0.12 * Math.sin(now * 9 + j * 1.7 + i)), jx = Math.sin(now * 13 + j * 2.3) * 1.2 * a, jy = Math.cos(now * 11 + j * 1.9) * 1.4 * a;
        ctx.globalAlpha = la;
        ctx.shadowColor = 'rgba(200,20,30,0.95)'; ctx.shadowBlur = 18 + 8 * Math.sin(now * 3 + j);
        ctx.fillStyle = '#3a0509'; ctx.fillText(letters[j], x + w / 2 + jx + 2, y + jy + 3); // a dark drip of shadow under the blood-red letter
        ctx.shadowBlur = 10; ctx.fillStyle = i === 0 ? '#e0202c' : '#c01a28'; ctx.fillText(letters[j], x + w / 2 + jx, y + jy);
        ctx.shadowBlur = 0; ctx.globalAlpha = la * 0.35; ctx.fillStyle = '#ffb0a8'; ctx.fillText(letters[j], x + w / 2 + jx - 0.6, y + jy - 0.8);
        x += w;
      }
    }
    ctx.restore();
  };
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  D.bannerActive = function () { return banner >= 0; };
  D.update = update;
})(window);
