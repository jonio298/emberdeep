/* holdguide.js - teaches the hold-to-charge controls and dresses the action buttons.
 *   - glass buttons: every button is a blue-faded glass bead tinted with its own spell's colour
 *   - the held effect: a rising liquid light, a turning rune ring, spiralling motes, ripples and a flare when the charge is ready
 *   - HOLD hints: a looping "charging" ring and a HOLD tag on the charge-capable buttons for the first few minutes
 *   - the first-spell tutorial: the world pauses, a finger presses and holds the button ("HOLD to charge")
 *   - the Hard-mode aiming tutorial (no auto-aim), shown when Hard or Dev is picked
 *   - a training dummy that stands still near the start so a tap and a hold can be compared
 * The whole thing is switched off by the "Tutorial hints" setting (Settings.get('tutorial') === false); what the player already learned is remembered.
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, TAU = Math.PI * 2, KEY = 'emberdeep-tutorial';
  var CHARGEABLE = { spell1: 1, spell2: 1, spell3: 1, spell4: 1, dash: 1, attack: 1 };
  var done = { hold: {}, firstSpell: false, aim: false };
  try { var sv = JSON.parse(root.localStorage.getItem(KEY) || 'null'); if (sv && typeof sv === 'object') { done.hold = sv.hold || {}; done.firstSpell = !!sv.firstSpell; done.aim = !!sv.aim; } } catch (_) { /* optional */ }
  try { if (/[?&]tut=1/.test(root.location.search)) { done = { hold: {}, firstSpell: false, aim: false }; root.localStorage.removeItem(KEY); } } catch (_) { /* optional */ }
  function save() { try { root.localStorage.setItem(KEY, JSON.stringify(done)); } catch (_) { /* optional */ } }
  function enabled() { return !CC.Endless?.active() && !(CC.Settings && CC.Settings.get && CC.Settings.get('tutorial') === false); }
  function now() { return (root.performance && performance.now ? performance.now() : Date.now()) / 1000; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rgbOf(hex) { var m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '120,190,255'; var n = parseInt(m[1], 16); return (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255); }

  var clock = 0, lastT = 0, dtF = 0, playSecs = 0;
  var since = {}, readyFlash = {}, ov = null, tapped = {}, dummyFor = null;
  function stepClock() { var t = now(); dtF = Math.min(0.1, t - lastT || 0); lastT = t; clock += dtF; }

  /* ---------- colours: each button is tinted by the spell sitting in it ---------- */
  var DEFAULT_RGB = { attack: '255,150,80', dash: '110,225,165', potion: '255,90,110', mpotion: '90,160,255', spell1: '140,160,255', spell2: '170,140,255', spell3: '120,220,200', spell4: '255,170,120' };
  function colorFor(name, p, sInfo) {
    if (sInfo && sInfo.col) return rgbOf(sInfo.col);
    if ((name === 'spell1' || name === 'spell2' || name === 'dash') && p && CC.SpellCharge && CC.SpellCharge.heldInfo) { var h = CC.SpellCharge.heldInfo(p.classId, name); if (h && h.color) return rgbOf(h.color); }
    if (name === 'attack' && p && p.color) return rgbOf(p.color);
    return DEFAULT_RGB[name] || '120,190,255';
  }

  /* ---------- the glass button ---------- */
  function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); }
  function glass(c, b, rgb, on, prog, locked) {
    var x = b.x, y = b.y, r = b.r, g, i;
    c.save();
    c.shadowColor = 'rgba(' + rgb + ',' + (on ? 0.7 : 0.4) + ')'; c.shadowBlur = on ? 20 : 9;
    circle(c, x, y, r); c.fillStyle = 'rgba(5,12,32,' + (on ? 0.66 : 0.52) + ')'; c.fill(); c.shadowBlur = 0;
    g = c.createLinearGradient(x, y - r, x, y + r); // the fade: pale at the crown, deep colour at the base
    g.addColorStop(0, 'rgba(' + rgb + ',' + (on ? 0.32 : 0.16) + ')'); g.addColorStop(0.5, 'rgba(' + rgb + ',' + (on ? 0.52 : 0.3) + ')'); g.addColorStop(1, 'rgba(' + rgb + ',' + (on ? 0.92 : 0.66) + ')');
    circle(c, x, y, r - 1); c.fillStyle = g; c.fill();
    c.save(); circle(c, x, y, r - 1); c.clip();
    if (prog > 0) { // the held charge: liquid light rising in the glass
      var lv = y + r - 2 * r * prog, wv = Math.sin(clock * 9) * 1.6;
      var lg = c.createLinearGradient(x, lv, x, y + r); lg.addColorStop(0, 'rgba(255,255,255,0.78)'); lg.addColorStop(0.12, 'rgba(' + rgb + ',0.9)'); lg.addColorStop(1, 'rgba(' + rgb + ',0.5)');
      c.fillStyle = lg; c.beginPath(); c.moveTo(x - r, y + r); c.lineTo(x - r, lv);
      for (i = 0; i <= 8; i++) c.lineTo(x - r + i * r / 4, lv + Math.sin(clock * 7 + i * 1.3) * 1.6 + wv * 0.3);
      c.lineTo(x + r, y + r); c.closePath(); c.fill();
    }
    var gg = c.createLinearGradient(x, y - r, x, y - r * 0.05); gg.addColorStop(0, 'rgba(255,255,255,0.62)'); gg.addColorStop(1, 'rgba(255,255,255,0)'); // glass gloss on top
    c.fillStyle = gg; c.beginPath(); c.ellipse(x, y - r * 0.52, r * 0.78, r * 0.44, 0, 0, TAU); c.fill();
    var sw = ((clock * 0.28) % 1.6) - 0.3; // a slow shimmer sweeping across
    c.globalAlpha = 0.16 + (on ? 0.1 : 0); c.fillStyle = '#fff'; c.save(); c.translate(x - r + sw * 2 * r, y); c.rotate(0.5); c.fillRect(-4, -r * 1.3, 8, r * 2.6); c.restore();
    c.globalAlpha = 1; c.restore();
    var rg = c.createLinearGradient(x - r, y - r, x + r, y + r); rg.addColorStop(0, 'rgba(255,255,255,0.9)'); rg.addColorStop(0.5, 'rgba(' + rgb + ',0.75)'); rg.addColorStop(1, 'rgba(255,255,255,0.38)');
    c.lineWidth = 2; c.strokeStyle = rg; circle(c, x, y, r - 1); c.stroke();
    c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,255,0.18)'; circle(c, x, y, r - 5); c.stroke();
    if (locked) { circle(c, x, y, r - 1); c.fillStyle = 'rgba(6,8,18,0.55)'; c.fill(); }
    c.restore();
  }

  /* ---------- the held effect: rune ring, motes, ripples, flare ---------- */
  function heldFx(c, b, rgb, prog, t, ready, flash) {
    var x = b.x, y = b.y, r = b.r, i;
    c.save(); c.globalCompositeOperation = 'lighter';
    // progress arc, thick and glowing
    c.lineCap = 'round'; c.shadowColor = 'rgba(' + rgb + ',1)'; c.shadowBlur = 10;
    c.lineWidth = 3.4; c.strokeStyle = 'rgba(' + rgb + ',0.95)'; c.beginPath(); c.arc(x, y, r + 5, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.01, prog)); c.stroke(); c.shadowBlur = 0;
    // a ring of runes turning round the button, faster and brighter as it fills
    var n = 12, rot = t * (1.2 + 3 * prog);
    c.lineWidth = 1.6;
    for (i = 0; i < n; i++) {
      var a = rot + i * TAU / n, rr = r + 11, k = i % 3, al = (0.25 + 0.6 * prog) * (0.6 + 0.4 * Math.sin(t * 6 + i));
      c.strokeStyle = 'rgba(' + rgb + ',' + al + ')'; var px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      c.save(); c.translate(px, py); c.rotate(a + Math.PI / 2); c.beginPath();
      if (k === 0) { c.moveTo(-2.5, 2); c.lineTo(0, -3); c.lineTo(2.5, 2); } else if (k === 1) { c.moveTo(0, -3); c.lineTo(0, 3); c.moveTo(-2.5, -1); c.lineTo(2.5, -1); } else { c.moveTo(-2.5, -2.5); c.lineTo(2.5, 2.5); c.moveTo(2.5, -2.5); c.lineTo(-2.5, 2.5); }
      c.stroke(); c.restore();
    }
    // motes spiralling in towards the button
    for (i = 0; i < 9; i++) {
      var ph = ((t * (0.8 + prog) + i / 9) % 1), ang = i * 0.7 + t * 3 + ph * 4, rad = (r + 30) * (1 - ph) + 3;
      c.fillStyle = 'rgba(' + rgb + ',' + (0.8 * (1 - Math.abs(ph - 0.5) * 1.4)) + ')'; c.beginPath(); c.arc(x + Math.cos(ang) * rad, y + Math.sin(ang) * rad, 1.8 + prog, 0, TAU); c.fill();
    }
    // ripples
    for (i = 0; i < 2; i++) { var rp = ((t * 1.6 + i * 0.5) % 1); c.strokeStyle = 'rgba(' + rgb + ',' + (0.5 * (1 - rp)) + ')'; c.lineWidth = 1.6; c.beginPath(); c.arc(x, y, r + 2 + rp * 22, 0, TAU); c.stroke(); }
    if (ready) { // fully charged: a breathing halo and turning light rays
      var br = 0.6 + 0.4 * Math.sin(t * 8), hg = c.createRadialGradient(x, y, r * 0.6, x, y, r + 26);
      hg.addColorStop(0, 'rgba(' + rgb + ',' + 0.35 * br + ')'); hg.addColorStop(1, 'rgba(' + rgb + ',0)'); c.fillStyle = hg; c.beginPath(); c.arc(x, y, r + 26, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,255,255,' + 0.5 * br + ')'; c.lineWidth = 1.4;
      for (i = 0; i < 8; i++) { var ra = t * 1.5 + i * TAU / 8; c.beginPath(); c.moveTo(x + Math.cos(ra) * (r + 3), y + Math.sin(ra) * (r + 3)); c.lineTo(x + Math.cos(ra) * (r + 14 + 4 * br), y + Math.sin(ra) * (r + 14 + 4 * br)); c.stroke(); }
    }
    if (flash > 0) { // the moment it fills: a bright ring bursts out
      var fp = 1 - flash / 0.5; c.strokeStyle = 'rgba(255,255,255,' + (0.9 * (1 - fp)) + ')'; c.lineWidth = 3 * (1 - fp) + 1; c.beginPath(); c.arc(x, y, r + 4 + fp * 40, 0, TAU); c.stroke();
      c.fillStyle = 'rgba(' + rgb + ',' + (0.35 * (1 - fp)) + ')'; c.beginPath(); c.arc(x, y, r + 4 + fp * 40, 0, TAU); c.fill();
    }
    c.restore();
  }

  /* ---------- the button entry points ---------- */
  function holdProgress(name, secs) { return name === 'attack' ? clamp(secs / 1.2, 0, 1) : clamp((secs - 0.25) / 0.65, 0, 1); }
  function button(c, name, b, o) {
    stepClockOncePerFrame();
    var p = CC.state && CC.state.player, rgb = colorFor(name, p, o.sInfo), secs = 0, prog = 0;
    if (o.on && CHARGEABLE[name] && !o.contextual && !o.locked) { if (!since[name]) since[name] = clock; secs = clock - since[name]; prog = secs > 0.12 ? holdProgress(name, secs) : 0; }
    glass(c, b, rgb, o.on, prog, o.locked);
    return true;
  }
  var frameStamp = -1;
  function stepClockOncePerFrame() { var t = now(); if (t - frameStamp > 0.0001) { frameStamp = t; stepClock(); if (CC.state && (CC.state.mode === 'dungeon' || CC.state.mode === 'town') && !ov) playSecs += dtF; } }
  // called after the button's labels are drawn: the held effect and the HOLD hint sit on top
  // the outer ring: the CHARGED version's own cooldown (the tap spell keeps its pie sweep inside the button)
  function chargedRing(c, name, b, rgb, p) {
    var cd = p && p.cdC ? p.cdC[name] || 0 : 0, mx = p && p.cdCMax ? p.cdCMax[name] || 0 : 0, f = mx > 0 ? clamp(1 - cd / mx, 0, 1) : 1, ready = cd <= 0.01, x = b.x, y = b.y, R = b.r + 8, i;
    c.save(); c.lineCap = 'round';
    c.strokeStyle = 'rgba(6,14,34,0.7)'; c.lineWidth = 5; c.beginPath(); c.arc(x, y, R, 0, TAU); c.stroke(); // the glass groove
    c.strokeStyle = 'rgba(' + rgb + ',0.28)'; c.lineWidth = 1; c.beginPath(); c.arc(x, y, R + 2.6, 0, TAU); c.stroke(); c.beginPath(); c.arc(x, y, R - 2.6, 0, TAU); c.stroke();
    c.globalCompositeOperation = 'lighter';
    var a0 = -Math.PI / 2, a1 = a0 + TAU * Math.max(0.004, f), al = ready ? 0.7 + 0.25 * Math.sin(clock * 5) : 0.85;
    c.shadowColor = 'rgba(' + rgb + ',1)'; c.shadowBlur = ready ? 11 : 6; c.strokeStyle = 'rgba(' + rgb + ',' + al + ')'; c.lineWidth = 3.4; c.beginPath(); c.arc(x, y, R, a0, a1); c.stroke(); c.shadowBlur = 0;
    c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,255,' + (ready ? 0.7 : 0.45) + ')'; c.beginPath(); c.arc(x, y, R, a0, a1); c.stroke();
    for (i = 0; i < 12; i++) { var ta = a0 + i * TAU / 12, on = i * TAU / 12 <= TAU * f + 0.01; c.strokeStyle = 'rgba(' + (on ? '255,255,255' : rgb) + ',' + (on ? 0.55 : 0.22) + ')'; c.lineWidth = i % 3 === 0 ? 1.6 : 1; c.beginPath(); c.moveTo(x + Math.cos(ta) * (R + 3.4), y + Math.sin(ta) * (R + 3.4)); c.lineTo(x + Math.cos(ta) * (R + (i % 3 === 0 ? 7 : 5.4)), y + Math.sin(ta) * (R + (i % 3 === 0 ? 7 : 5.4))); c.stroke(); }
    if (!ready) { // a bright spark rides the leading edge while it recharges
      var sx = x + Math.cos(a1) * R, sy = y + Math.sin(a1) * R, sg = c.createRadialGradient(sx, sy, 0, sx, sy, 7); sg.addColorStop(0, 'rgba(255,255,255,0.95)'); sg.addColorStop(0.4, 'rgba(' + rgb + ',0.6)'); sg.addColorStop(1, 'rgba(' + rgb + ',0)'); c.fillStyle = sg; c.beginPath(); c.arc(sx, sy, 7, 0, TAU); c.fill();
    } else { // ready: a few motes circle the ring
      for (i = 0; i < 3; i++) { var ma = clock * 1.4 + i * TAU / 3; c.fillStyle = 'rgba(255,255,255,' + (0.5 + 0.4 * Math.sin(clock * 6 + i)) + ')'; c.beginPath(); c.arc(x + Math.cos(ma) * R, y + Math.sin(ma) * R, 1.5, 0, TAU); c.fill(); }
    }
    c.restore();
    if (!ready) { c.save(); c.font = 'bold 9px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 3; c.strokeStyle = 'rgba(4,10,26,0.9)'; var tx = x - R * 0.72, ty = y - R * 0.86 - 5, tl = cd.toFixed(cd < 10 ? 1 : 0); c.strokeText(tl, tx, ty); c.fillStyle = 'rgba(' + rgb + ',1)'; c.fillText(tl, tx, ty); c.restore(); }
  }
  function decorate(c, name, b, o) {
    if (!CHARGEABLE[name] || o.contextual || o.locked) { if (!o.on) since[name] = 0; return; }
    var p = CC.state && CC.state.player, rgb = colorFor(name, p, o.sInfo);
    if (/^(spell[1-4]|dash)$/.test(name) && p && (name === 'dash' || (CC.SpellCharge && CC.SpellCharge.canCharge ? CC.SpellCharge.canCharge(name) : (!CC.Skills || !CC.Skills.chargeOk || CC.Skills.chargeOk(name))))) chargedRing(c, o.sInfo && o.sInfo.key ? o.sInfo.key : name, b, rgb, p);
    if (o.on) {
      if (!since[name]) since[name] = clock;
      var secs = clock - since[name], prog = holdProgress(name, secs), ready = prog >= 1 && secs > 0.3;
      if (ready && !readyFlash[name]) readyFlash[name] = 0.5;
      if (secs > 0.12) heldFx(c, b, rgb, prog, clock, ready, readyFlash[name] || 0);
      if (readyFlash[name] > 0) readyFlash[name] = Math.max(0, readyFlash[name] - dtF);
      if (secs >= 0.5 && !done.hold[name]) { done.hold[name] = true; if (name === 'spell1' || name === 'spell2' || name === 'dash') done.firstSpell = true; save(); }
    } else {
      since[name] = 0; readyFlash[name] = 0;
      if (enabled() && playSecs < 300 && !done.hold[name] && !ov) hint(c, name, b, rgb);
    }
  }
  function hint(c, name, b, rgb) { // a looping "press and hold" demonstration
    var cyc = (clock * 0.55 + (name.length * 0.13)) % 1, prog = clamp(cyc / 0.7, 0, 1), x = b.x, y = b.y, r = b.r;
    c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    c.strokeStyle = 'rgba(' + rgb + ',' + (cyc < 0.85 ? 0.75 : 0.75 * (1 - (cyc - 0.85) / 0.15)) + ')'; c.lineWidth = 2.4; c.shadowColor = 'rgba(' + rgb + ',1)'; c.shadowBlur = 8;
    c.beginPath(); c.arc(x, y, r + 5, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.01, prog)); c.stroke(); c.restore();
    var bob = Math.sin(clock * 4) * 1.4, ty = y - r - 12 + bob, al = 0.7 + 0.25 * Math.sin(clock * 5);
    c.save(); c.globalAlpha = al; c.font = 'bold 9px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    var w = 34; c.beginPath(); c.moveTo(x - w / 2 + 5, ty - 7); c.arcTo(x + w / 2, ty - 7, x + w / 2, ty + 7, 5); c.arcTo(x + w / 2, ty + 7, x - w / 2, ty + 7, 5); c.arcTo(x - w / 2, ty + 7, x - w / 2, ty - 7, 5); c.arcTo(x - w / 2, ty - 7, x + w / 2, ty - 7, 5); c.closePath();
    c.fillStyle = 'rgba(6,14,34,0.82)'; c.fill(); c.lineWidth = 1.2; c.strokeStyle = 'rgba(' + rgb + ',0.9)'; c.stroke(); c.fillStyle = '#e8f6ff'; c.fillText('HOLD', x, ty + 0.5); c.restore();
  }

  /* ---------- overlays (first-spell tutorial, Hard-mode aiming) ---------- */
  function playingNow() { var s = CC.state; return s && (s.mode === 'dungeon' || s.mode === 'town') && s.player && s.player.hp > 0 && !s.player.perkOpen; }
  function show(kind, name) { if (ov) return; ov = { kind: kind, name: name || 'spell1', t: 0, t0: clock }; }
  function dismiss() {
    if (!ov || ov.t < 0.9) return;
    if (ov.kind === 'hold') done.firstSpell = true; else done.aim = true;
    ov = null; save();
  }
  function onAction(name) { // called when a button is pressed: the first spell tapped starts the lesson
    if (!enabled() || done.firstSpell || ov) return;
    if (name === 'spell1' || name === 'spell2') { tapped[name] = clock; ov = null; root.setTimeout(function () { if (!done.firstSpell && enabled() && playingNow() && !ov) show('hold', name); }, 650); }
  }
  function showAim() { if (enabled() && !done.aim && !ov) show('aim', 'attack'); }
  function panel(c, x, y, w, h, rgb) {
    c.save(); c.beginPath(); c.moveTo(x + 12, y); c.arcTo(x + w, y, x + w, y + h, 12); c.arcTo(x + w, y + h, x, y + h, 12); c.arcTo(x, y + h, x, y, 12); c.arcTo(x, y, x + w, y, 12); c.closePath();
    var g = c.createLinearGradient(x, y, x, y + h); g.addColorStop(0, 'rgba(' + rgb + ',0.30)'); g.addColorStop(0.5, 'rgba(10,20,48,0.86)'); g.addColorStop(1, 'rgba(' + rgb + ',0.42)'); c.fillStyle = g; c.fill();
    c.lineWidth = 2; c.strokeStyle = 'rgba(' + rgb + ',0.85)'; c.shadowColor = 'rgba(' + rgb + ',0.8)'; c.shadowBlur = 14; c.stroke(); c.restore();
  }
  function finger(c, x, y, press) { // a stylised fingertip: a soft capsule with a nail, pressing down onto the button
    c.save(); var dy = press ? 3 : 0; c.translate(x + 6, y + 8 + dy); c.rotate(-0.28);
    c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 8; c.lineCap = 'round'; c.strokeStyle = '#f0c5a0'; c.lineWidth = 17; c.beginPath(); c.moveTo(0, 46); c.lineTo(0, 4); c.stroke(); c.shadowBlur = 0;
    c.strokeStyle = '#fbd9b8'; c.lineWidth = 11; c.beginPath(); c.moveTo(-1, 40); c.lineTo(-1, 3); c.stroke();
    c.fillStyle = 'rgba(255,240,230,0.9)'; c.beginPath(); c.ellipse(0, 1, 5, 6.5, 0, 0, TAU); c.fill(); c.restore();
  }
  function overlay(c, W, H, btns, push) {
    stepClockOncePerFrame();
    var p = CC.state && CC.state.player;
    if (enabled()) {
      if (!done.firstSpell && !ov && playingNow() && playSecs > 80 && !tapped.spell1 && !tapped.spell2 && btns.spell1) show('hold', 'spell1'); // never found the spells on their own
      dummyTick(p);
    } else if (ov) ov = null;
    if (!ov) return;
    ov.t = clock - ov.t0;
    var b = btns[ov.name] || btns.attack, rgb = colorFor(ov.name, p, CC.Skills && /^spell[1-4]$/.test(ov.name) && p && p.slots ? CC.Skills.slotInfo(p, ov.name) : null), t = ov.t, loop = (t % 3.4) / 3.4;
    var hold = ov.kind === 'hold';
    // dim everything but a spotlight on the button
    c.save(); var sp = c.createRadialGradient(b.x, b.y, b.r + 6, b.x, b.y, b.r + 46 + 4 * Math.sin(t * 4)); sp.addColorStop(0, 'rgba(2,6,16,0)'); sp.addColorStop(1, 'rgba(2,6,16,0.74)'); c.fillStyle = sp; c.fillRect(0, 0, W, H); c.restore();
    // the lesson: a finger presses the button, holds while the glass fills, and lets go
    if (hold) {
      var press = loop > 0.16 && loop < 0.8, prog = loop < 0.16 ? 0 : clamp((loop - 0.16) / 0.5, 0, 1), fx = b.x + (loop < 0.16 ? (1 - loop / 0.16) * 46 : 0), fy = b.y + (loop < 0.16 ? (1 - loop / 0.16) * 54 : 0);
      c.save(); c.beginPath(); c.arc(b.x, b.y, b.r - 1, 0, TAU); c.clip(); c.restore();
      if (press) { heldFx(c, b, rgb, prog, t, prog >= 1, prog >= 1 && loop < 0.7 ? Math.max(0, 0.5 - (loop - 0.66)) : 0); }
      finger(c, fx, fy, press);
    } else {
      var d = loop < 0.15 ? 0 : clamp((loop - 0.15) / 0.55, 0, 1), ang = -2.2 + Math.sin(t * 1.1) * 0.4, fx2 = b.x + Math.cos(ang) * 46 * d, fy2 = b.y + Math.sin(ang) * 46 * d;
      heldFx(c, b, rgb, 0.4 + 0.5 * d, t, false, 0);
      c.save(); c.strokeStyle = 'rgba(' + rgb + ',0.95)'; c.fillStyle = 'rgba(' + rgb + ',0.9)'; c.lineWidth = 3; c.lineCap = 'round'; c.shadowColor = 'rgba(' + rgb + ',1)'; c.shadowBlur = 10;
      c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x + Math.cos(ang) * (46 * d + 28), b.y + Math.sin(ang) * (46 * d + 28)); c.stroke();
      var tx2 = b.x + Math.cos(ang) * (46 * d + 28), ty2 = b.y + Math.sin(ang) * (46 * d + 28); c.beginPath(); c.moveTo(tx2 + Math.cos(ang) * 10, ty2 + Math.sin(ang) * 10); c.lineTo(tx2 + Math.cos(ang + 2.4) * 8, ty2 + Math.sin(ang + 2.4) * 8); c.lineTo(tx2 + Math.cos(ang - 2.4) * 8, ty2 + Math.sin(ang - 2.4) * 8); c.closePath(); c.fill(); c.restore();
      finger(c, fx2, fy2, true);
    }
    // the card
    var cw = Math.min(W - 24, 330), ch = hold ? 150 : 158, cx = Math.max(12, Math.min(W / 2 - cw / 2, b.x - cw - 40)), cy = Math.max(14, Math.min(H * 0.18, H - ch - 14));
    if (W < 560) { cx = W / 2 - cw / 2; cy = Math.max(14, H * 0.12); }
    var appear = clamp(t / 0.35, 0, 1); c.save(); c.globalAlpha = appear; c.translate(0, (1 - appear) * 14);
    panel(c, cx, cy, cw, ch, rgb);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#ffffff'; c.shadowColor = 'rgba(' + rgb + ',1)'; c.shadowBlur = 12; c.font = 'bold 21px Georgia, serif';
    c.fillText(hold ? 'HOLD TO CHARGE' : 'NO AUTO-AIM', cx + cw / 2, cy + 26); c.shadowBlur = 0; c.font = '13px Georgia, serif';
    var lines = hold ? ['TAP  =  the quick spell', 'HOLD  =  a bigger, aimable version', 'Drag while holding to aim. Let go to cast.', dummyAlive() ? 'Try it on the training dummy nearby!' : 'Watch the glass fill: that is the charge.']
      : ['Attacks and spells fly exactly where you aim.', 'Computer: aim with the mouse.', 'Touch: hold ATK and drag to aim.', 'Or just face the way you are moving.'];
    for (var li = 0; li < lines.length; li++) { c.fillStyle = li < 2 ? '#e8f6ff' : '#b4cfe6'; c.fillText(lines[li], cx + cw / 2, cy + 56 + li * 21); }
    c.font = '11px Georgia, serif'; c.fillStyle = 'rgba(220,240,255,' + (0.45 + 0.4 * Math.sin(t * 4)) * clamp((t - 0.7) / 0.3, 0, 1) + ')'; c.fillText('tap to continue', cx + cw / 2, cy + ch - 10);
    c.restore();
    if (push) push(0, 0, W, H, function () { dismiss(); });
  }

  /* ---------- the training dummy ---------- */
  var E = CC.Enemies;
  if (E && E.TYPES) E.TYPES.trainingDummy = { name: 'Training Dummy', hp: 40, spd: 0, dmg: 0, r: 11, xp: 0, color: '#9a7a48', blood: '#d8c488', bone: false, w: 0, min: 99 };
  if (E && E._think) { var oldThink = E._think; E._think = function (e) { if (e.type === 'trainingDummy') { e.hp = e.maxHp; e.state = 'idle'; e.vx = e.vy = 0; return; } return oldThink.apply(this, arguments); }; }
  function dummyAlive() { var l = (E && E.list) || []; for (var i = 0; i < l.length; i++) if (l[i].type === 'trainingDummy' && !l[i].dead) return true; return false; }
  function dummyTick(p) {
    if (!E || !E.list || !p) return;
    var s = CC.state, learned = done.firstSpell || (done.hold.spell1 || done.hold.spell2);
    if (!learned && s.mode === 'dungeon' && s.area === 'forest' && (s.floor || 1) === 1 && dummyFor !== s.map && s.map) {
      dummyFor = s.map; var D = CC.Dungeon, offs = [[84, 8], [-84, 8], [10, 84], [10, -84], [60, 60], [-60, -60]];
      for (var i = 0; i < offs.length; i++) {
        var x = p.x + offs[i][0], y = p.y + offs[i][1]; if (D && D.isSolid && (D.isSolid(x, y) || D.isSolid(x + 12, y) || D.isSolid(x - 12, y))) continue;
        var e = E.spawn('trainingDummy', x, y, 1); if (e) { e.maxHp = e.hp = 99999; e.asleep = false; e.dummy = true; e.noLoot = true; } break;
      }
    }
    if (learned || !enabled()) { var l = E.list; for (var k = 0; k < l.length; k++) if (l[k].type === 'trainingDummy' && !l[k].dead) { l[k].dead = true; l[k].hp = 0; l[k].collapsed = true; } }
  }
  function drawMonster(c, e, r, col, dark, t) { // a straw-stuffed post with a painted target
    if (e.type !== 'trainingDummy') return false;
    var hit = (e._hitFlash || 0) > 0 ? Math.min(1, e._hitFlash * 8) : 0, sway = Math.sin(t * 2.2) * 0.02 + hit * 0.18 * Math.sin(t * 40);
    c.save(); c.scale(r / 11, r / 11);
    c.fillStyle = 'rgba(8,6,6,0.5)'; c.beginPath(); c.ellipse(0, 12, 15, 5, 0, 0, TAU); c.fill();
    c.fillStyle = '#5a3d22'; c.beginPath(); c.ellipse(0, 11, 11, 4, 0, 0, TAU); c.fill(); // earth mound
    c.rotate(sway); c.translate(0, 0);
    c.fillStyle = '#6b4a28'; c.fillRect(-2.5, -4, 5, 16); // post
    c.fillStyle = '#6b4a28'; c.fillRect(-14, -9, 28, 4); // crossbar
    var bg = c.createLinearGradient(-9, -22, 9, 4); bg.addColorStop(0, '#d8bf86'); bg.addColorStop(1, '#a8884e');
    c.fillStyle = bg; c.beginPath(); c.moveTo(-9, -17); c.quadraticCurveTo(0, -22, 9, -17); c.lineTo(8, 3); c.quadraticCurveTo(0, 7, -8, 3); c.closePath(); c.fill(); // sack body
    c.strokeStyle = '#5a431f'; c.lineWidth = 1; c.stroke();
    for (var i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-6 + i * 4, -3); c.lineTo(-5 + i * 4, 0); c.strokeStyle = '#5a431f'; c.stroke(); } // stitches
    c.fillStyle = '#f2e7d0'; c.beginPath(); c.arc(0, -9, 6.5, 0, TAU); c.fill(); c.fillStyle = '#c9322e'; c.beginPath(); c.arc(0, -9, 4.6, 0, TAU); c.fill(); c.fillStyle = '#f2e7d0'; c.beginPath(); c.arc(0, -9, 2.8, 0, TAU); c.fill(); c.fillStyle = '#c9322e'; c.beginPath(); c.arc(0, -9, 1.2, 0, TAU); c.fill(); // target
    c.strokeStyle = '#d8bf6a'; c.lineWidth = 1.4; for (i = 0; i < 6; i++) { var sx = -14 + i * 5.6; c.beginPath(); c.moveTo(sx, -9); c.lineTo(sx + (i % 2 ? 2 : -2), -14 - (i % 3)); c.stroke(); } // straw
    if (hit > 0) { c.globalAlpha = hit * 0.5; c.fillStyle = '#fff'; c.fillRect(-10, -22, 20, 26); }
    c.restore(); return true;
  }

  CC.HoldGuide = { button: button, decorate: decorate, overlay: overlay, onAction: onAction, frozen: function () { return enabled() && !!(ov && ov.kind === 'hold'); }, showAim: showAim, drawMonster: drawMonster, enabled: enabled, isOverlay: function () { return !!ov; }, state: function () { return { done: done, playSecs: playSecs, overlay: ov && ov.kind }; }, reset: function () { done = { hold: {}, firstSpell: false, aim: false }; save(); } };
})(window);
