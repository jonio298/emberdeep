/* CC.LeatherUI - the IRON & LEATHER look: dark stitched leather panels in a riveted iron frame, ribbon title plaques, red square close buttons,
 * green ON pills, chevron steppers and gold-knob sliders. ui.js uses it for the Settings page (and the character window around it).
 *
 *   frame(c,x,y,w,h)            iron frame, rivets and corner plates around stitched leather
 *   ribbon(c,cx,y,w,text)       the title plaque (iron-capped leather banner)
 *   tab(c,x,y,w,h,on,hover,label)   close(c,x,y,s)
 *   settings(c,hit,mouse,x,y,w,S) -> end y   every Settings row: toggles, steppers, sliders (same features as before)
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, L = CC.LeatherUI = {}, TAU = Math.PI * 2;
  var FONT = 'Georgia, "Palatino Linotype", "Book Antiqua", serif';
  var CREAM = '#e6d8bc', GOLD = '#e8c878', DIM = '#a8987c', GREEN = '#2f8f3f';
  function rr(c, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath(); }
  function text(c, s, x, y, px, col, align, weight) { c.font = (weight || 'bold') + ' ' + px + 'px ' + FONT; c.textAlign = align || 'left'; c.textBaseline = 'middle'; c.fillStyle = col; c.fillText(s, x, y); }
  function emboss(c, s, x, y, px, col, align) { c.save(); c.font = 'bold ' + px + 'px ' + FONT; c.textAlign = align || 'center'; c.textBaseline = 'middle'; c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillText(s, x, y + 1.4); c.fillStyle = col; c.fillText(s, x, y); c.restore(); }

  /* ---------- leather grain ---------- */
  var tex = null;
  function leather() {
    if (tex !== null) return tex;
    tex = false;
    try {
      var cv = root.document && root.document.createElement('canvas'); if (!cv) return tex;
      cv.width = cv.height = 80; var g = cv.getContext('2d'); if (!g) return tex;
      var seed = 4242; function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
      // a transparent grain of light and dark flecks, laid down with plain alpha (the old 'overlay' blend and clip were slow on phones)
      for (var i = 0; i < 900; i++) { var v = rnd() < 0.5 ? 0 : 255; g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (0.05 + rnd() * 0.14) + ')'; g.fillRect(rnd() * 80, rnd() * 80, 0.8 + rnd() * 2.2, 0.8 + rnd() * 1.6); }
      g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1; for (var k = 0; k < 7; k++) { var px = rnd() * 80, py = rnd() * 80; g.beginPath(); g.moveTo(px, py); g.lineTo(px + (rnd() - 0.5) * 30, py + (rnd() - 0.5) * 12); g.stroke(); }
      tex = cv;
    } catch (e) { tex = false; }
    return tex;
  }
  var grainPat = null, grainCtx = null;
  function grain(c, x, y, w, h, r, a) {
    var t = leather(); if (!t) return;
    try {
      if (grainCtx !== c || !grainPat) { grainPat = c.createPattern(t, 'repeat'); grainCtx = c; }
      var keep = c.globalAlpha; c.globalAlpha = keep * (a || 0.8) * 0.4; c.fillStyle = grainPat; rr(c, x, y, w, h, r); c.fill(); c.globalAlpha = keep;
    } catch (e) { /* plain leather */ }
  }
  function iron(c, x, y, w, h, r) { var g = c.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, '#7b828b'); g.addColorStop(0.45, '#4d535b'); g.addColorStop(1, '#2b2f35'); rr(c, x, y, w, h, r); c.fillStyle = g; c.fill(); }
  function rivet(c, x, y, r) { c.fillStyle = '#16181c'; c.beginPath(); c.arc(x, y, r + 0.8, 0, TAU); c.fill(); c.fillStyle = '#8d949d'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, TAU); c.fill(); }

  /* ---------- the frame, ribbon, tabs, close button ---------- */
  L.frame = function (c, x, y, w, h) {
    iron(c, x, y, w, h, 12);
    c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 1.5; rr(c, x + 0.75, y + 0.75, w - 1.5, h - 1.5, 12); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.28)'; c.lineWidth = 1; rr(c, x + 2.5, y + 2.5, w - 5, h - 5, 10); c.stroke();
    var m = 7, g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#4a2c1c'); g.addColorStop(1, '#2c1810'); // the leather inside
    rr(c, x + m, y + m, w - m * 2, h - m * 2, 7); c.fillStyle = g; c.fill(); grain(c, x + m, y + m, w - m * 2, h - m * 2, 7, 0.85);
    c.strokeStyle = 'rgba(0,0,0,0.65)'; c.lineWidth = 1.5; rr(c, x + m, y + m, w - m * 2, h - m * 2, 7); c.stroke();
    c.save(); c.strokeStyle = 'rgba(214,170,112,0.6)'; c.lineWidth = 1; c.setLineDash && c.setLineDash([4, 3]); rr(c, x + m + 4, y + m + 4, w - (m + 4) * 2, h - (m + 4) * 2, 4); c.stroke(); c.restore(); // the stitching
    var pts = [[x + 4, y + 4, 1, 1], [x + w - 4, y + 4, -1, 1], [x + 4, y + h - 4, 1, -1], [x + w - 4, y + h - 4, -1, -1]], i; // corner plates with rivets
    for (i = 0; i < 4; i++) { var p = pts[i]; c.fillStyle = '#6d747d'; c.beginPath(); c.moveTo(p[0], p[1] + p[3] * 22); c.lineTo(p[0], p[1]); c.lineTo(p[0] + p[2] * 22, p[1]); c.lineTo(p[0] + p[2] * 12, p[1] + p[3] * 12); c.closePath(); c.fill(); c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 1; c.stroke(); rivet(c, p[0] + p[2] * 7, p[1] + p[3] * 7, 2.4); }
  };
  L.ribbon = function (c, cx, y, w, label) { // an iron-capped leather banner with a pointed end on each side
    var h = 30, x = cx - w / 2, g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#6a4430'); g.addColorStop(1, '#3a2216');
    c.save(); c.beginPath(); c.moveTo(x + 14, y); c.lineTo(x + w - 14, y); c.lineTo(x + w, y + h / 2); c.lineTo(x + w - 14, y + h); c.lineTo(x + 14, y + h); c.lineTo(x, y + h / 2); c.closePath();
    c.fillStyle = g; c.fill(); c.clip(); grain(c, x, y, w, h, 0, 0.7); c.restore();
    c.save(); c.beginPath(); c.moveTo(x + 14, y); c.lineTo(x + w - 14, y); c.lineTo(x + w, y + h / 2); c.lineTo(x + w - 14, y + h); c.lineTo(x + 14, y + h); c.lineTo(x, y + h / 2); c.closePath(); c.strokeStyle = '#8b9199'; c.lineWidth = 2; c.stroke(); c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 1; c.stroke(); c.restore();
    rivet(c, x + 16, y + h / 2, 2); rivet(c, x + w - 16, y + h / 2, 2);
    emboss(c, label, cx, y + h / 2 + 0.5, 17, CREAM, 'center');
  };
  L.tab = function (c, x, y, w, h, on, hover, label) {
    var g = c.createLinearGradient(0, y, 0, y + h); if (on) { g.addColorStop(0, '#7a4a30'); g.addColorStop(1, '#4a2a1c'); } else { g.addColorStop(0, '#3a2318'); g.addColorStop(1, '#25150e'); }
    rr(c, x, y, w, h, 5); c.fillStyle = g; c.fill(); grain(c, x, y, w, h, 5, 0.7);
    if (hover && !on) { rr(c, x, y, w, h, 5); c.fillStyle = 'rgba(255,220,160,0.08)'; c.fill(); }
    rr(c, x + 0.5, y + 0.5, w - 1, h - 1, 5); c.lineWidth = on ? 1.6 : 1.2; c.strokeStyle = on ? '#b8bfc7' : '#4b5159'; c.stroke();
    if (on) { c.fillStyle = '#e0a84a'; c.fillRect(x + 6, y + h - 3, w - 12, 2); }
    var px = Math.max(6.5, Math.min(10.5, (w - 8) / (label.length * 0.76))); emboss(c, label, x + w / 2, y + h / 2 + 0.5, px, on ? GOLD : DIM, 'center');
  };
  L.close = function (c, x, y, w, h, hover) {
    var g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, hover ? '#e04a3a' : '#c8392b'); g.addColorStop(1, '#8e2018');
    rr(c, x, y, w, h, 5); c.fillStyle = g; c.fill(); rr(c, x + 0.5, y + 0.5, w - 1, h - 1, 5); c.lineWidth = 2; c.strokeStyle = '#aab0b8'; c.stroke(); rr(c, x + 2.5, y + 2.5, w - 5, h - 5, 3); c.lineWidth = 1; c.strokeStyle = 'rgba(0,0,0,0.5)'; c.stroke();
    c.strokeStyle = '#fff'; c.lineWidth = 2.6; c.lineCap = 'round'; c.beginPath(); var m = Math.min(w, h) * 0.3; c.moveTo(x + w / 2 - m, y + h / 2 - m); c.lineTo(x + w / 2 + m, y + h / 2 + m); c.moveTo(x + w / 2 + m, y + h / 2 - m); c.lineTo(x + w / 2 - m, y + h / 2 + m); c.stroke();
  };

  L.grain = grain;
  // a leather plate: kind 'raised' (proud, with an iron rim), 'inset' (pressed in), 'flat'
  L.plate = function (c, x, y, w, h, r, kind, tint) {
    var raised = kind === 'raised', inset = kind === 'inset', g = c.createLinearGradient(0, y, 0, y + h);
    if (inset) { g.addColorStop(0, '#1b0e08'); g.addColorStop(1, '#2a160e'); } else if (raised) { g.addColorStop(0, '#6a4430'); g.addColorStop(0.5, '#4a2c1c'); g.addColorStop(1, '#321c12'); } else { g.addColorStop(0, '#4a2c1c'); g.addColorStop(1, '#341c12'); }
    rr(c, x, y, w, h, r); c.fillStyle = g; c.fill(); grain(c, x, y, w, h, r, inset ? 0.9 : 0.8);
    if (tint) { rr(c, x, y, w, h, r); c.fillStyle = tint; c.fill(); }
    var b = c.createLinearGradient(x, y, x + w, y + h);
    b.addColorStop(0, inset ? 'rgba(0,0,0,0.85)' : 'rgba(255,225,180,0.28)'); b.addColorStop(0.5, 'rgba(0,0,0,0.2)'); b.addColorStop(1, inset ? 'rgba(255,225,180,0.14)' : 'rgba(0,0,0,0.85)');
    rr(c, x + 0.75, y + 0.75, w - 1.5, h - 1.5, r); c.lineWidth = 1.6; c.strokeStyle = b; c.stroke();
    if (raised) { rr(c, x + 0.5, y + 0.5, w - 1, h - 1, r); c.lineWidth = 1; c.strokeStyle = '#5a6068'; c.stroke(); } // the iron rim
  };
  // a leather button with an iron edge; tint (the old button colour) hints its meaning: green yes, red no, amber warn
  L.button = function (c, x, y, w, h, label, enabled, tint, hover, px) {
    L.plate(c, x, y, w, h, 6, enabled ? 'raised' : 'inset', enabled && tint ? tint.replace(/^#([0-9a-f]{6})$/i, function (m, hx) { return 'rgba(' + parseInt(hx.slice(0, 2), 16) + ',' + parseInt(hx.slice(2, 4), 16) + ',' + parseInt(hx.slice(4, 6), 16) + ',0.38)'; }) : null);
    if (enabled && hover) { rr(c, x, y, w, h, 6); c.fillStyle = 'rgba(255,225,170,0.12)'; c.fill(); }
    if (enabled) { rr(c, x + 0.5, y + 0.5, w - 1, h - 1, 6); c.lineWidth = 1.4; c.strokeStyle = hover ? '#c8cfd7' : '#8b9199'; c.stroke(); }
    emboss(c, label, x + w / 2, y + h / 2 + 0.5, px || 12, enabled ? CREAM : '#6f6252', 'center');
  };

  /* ---------- icons: simple pictograms, cream on leather ---------- */
  function icon(c, name, cx, cy, s) {
    c.save(); c.translate(cx, cy); c.strokeStyle = CREAM; c.fillStyle = CREAM; c.lineWidth = 1.7; c.lineCap = 'round'; c.lineJoin = 'round'; var k;
    if (name === 'gear') { c.beginPath(); c.arc(0, 0, s * 0.42, 0, TAU); c.stroke(); c.beginPath(); c.arc(0, 0, s * 0.16, 0, TAU); c.stroke(); for (k = 0; k < 8; k++) { var a = k * TAU / 8; c.beginPath(); c.moveTo(Math.cos(a) * s * 0.42, Math.sin(a) * s * 0.42); c.lineTo(Math.cos(a) * s * 0.62, Math.sin(a) * s * 0.62); c.lineWidth = 3; c.stroke(); } }
    else if (name === 'book') { c.beginPath(); c.moveTo(0, -s * 0.4); c.lineTo(0, s * 0.45); c.moveTo(0, -s * 0.4); c.quadraticCurveTo(-s * 0.35, -s * 0.5, -s * 0.6, -s * 0.38); c.lineTo(-s * 0.6, s * 0.38); c.quadraticCurveTo(-s * 0.35, s * 0.3, 0, s * 0.45); c.quadraticCurveTo(s * 0.35, s * 0.3, s * 0.6, s * 0.38); c.lineTo(s * 0.6, -s * 0.38); c.quadraticCurveTo(s * 0.35, -s * 0.5, 0, -s * 0.4); c.stroke(); }
    else if (name === 'moon') { c.beginPath(); c.arc(0, 0, s * 0.5, 0.6, TAU - 0.6); c.arc(s * 0.22, -s * 0.05, s * 0.4, TAU - 0.9, 0.9, true); c.closePath(); c.fill(); }
    else if (name === 'chevrons') { for (k = 0; k < 2; k++) { c.beginPath(); c.moveTo(-s * 0.4, s * 0.1 - k * s * 0.34); c.lineTo(0, -s * 0.28 - k * s * 0.34); c.lineTo(s * 0.4, s * 0.1 - k * s * 0.34); c.stroke(); } c.translate(0, s * 0.3); }
    else if (name === 'clapper') { c.strokeRect(-s * 0.5, -s * 0.2, s, s * 0.7); c.beginPath(); c.moveTo(-s * 0.5, -s * 0.2); c.lineTo(-s * 0.4, -s * 0.52); c.lineTo(s * 0.5, -s * 0.52); c.lineTo(s * 0.5, -s * 0.2); c.stroke(); for (k = 0; k < 3; k++) { c.beginPath(); c.moveTo(-s * 0.3 + k * s * 0.3, -s * 0.2); c.lineTo(-s * 0.15 + k * s * 0.3, -s * 0.52); c.stroke(); } }
    else if (name === 'swords') { c.beginPath(); c.moveTo(-s * 0.5, s * 0.5); c.lineTo(s * 0.45, -s * 0.45); c.moveTo(s * 0.5, s * 0.5); c.lineTo(-s * 0.45, -s * 0.45); c.stroke(); c.lineWidth = 2.6; c.beginPath(); c.moveTo(-s * 0.4, s * 0.15); c.lineTo(-s * 0.1, s * 0.45); c.moveTo(s * 0.4, s * 0.15); c.lineTo(s * 0.1, s * 0.45); c.stroke(); }
    else if (name === 'speaker') { c.beginPath(); c.moveTo(-s * 0.55, -s * 0.18); c.lineTo(-s * 0.25, -s * 0.18); c.lineTo(s * 0.1, -s * 0.5); c.lineTo(s * 0.1, s * 0.5); c.lineTo(-s * 0.25, s * 0.18); c.lineTo(-s * 0.55, s * 0.18); c.closePath(); c.fill(); for (k = 0; k < 2; k++) { c.beginPath(); c.arc(s * 0.1, 0, s * (0.28 + k * 0.22), -0.9, 0.9); c.stroke(); } }
    else if (name === 'note') { c.beginPath(); c.ellipse(-s * 0.18, s * 0.34, s * 0.24, s * 0.17, -0.4, 0, TAU); c.fill(); c.beginPath(); c.moveTo(s * 0.04, s * 0.3); c.lineTo(s * 0.04, -s * 0.5); c.lineTo(s * 0.5, -s * 0.3); c.stroke(); }
    else if (name === 'magnifier') { c.beginPath(); c.arc(-s * 0.1, -s * 0.1, s * 0.34, 0, TAU); c.stroke(); c.lineWidth = 3; c.beginPath(); c.moveTo(s * 0.16, s * 0.16); c.lineTo(s * 0.5, s * 0.5); c.stroke(); }
    else if (name === 'dpad') { c.beginPath(); c.moveTo(-s * 0.14, -s * 0.5); c.lineTo(s * 0.14, -s * 0.5); c.lineTo(s * 0.14, -s * 0.14); c.lineTo(s * 0.5, -s * 0.14); c.lineTo(s * 0.5, s * 0.14); c.lineTo(s * 0.14, s * 0.14); c.lineTo(s * 0.14, s * 0.5); c.lineTo(-s * 0.14, s * 0.5); c.lineTo(-s * 0.14, s * 0.14); c.lineTo(-s * 0.5, s * 0.14); c.lineTo(-s * 0.5, -s * 0.14); c.lineTo(-s * 0.14, -s * 0.14); c.closePath(); c.stroke(); }
    c.restore();
  }
  L.icon = icon;

  /* ---------- controls ---------- */
  function pill(c, x, y, w, h, on, label) { var g = c.createLinearGradient(0, y, 0, y + h); if (on) { g.addColorStop(0, '#3fae52'); g.addColorStop(1, '#23702f'); } else { g.addColorStop(0, '#5a3a30'); g.addColorStop(1, '#321e18'); } rr(c, x, y, w, h, h / 2); c.fillStyle = g; c.fill(); rr(c, x + 0.5, y + 0.5, w - 1, h - 1, h / 2); c.lineWidth = 1.4; c.strokeStyle = on ? '#8ad49a' : '#7a5a4a'; c.stroke(); emboss(c, label, x + w / 2, y + h / 2 + 0.5, 11, on ? '#fff' : '#c9b4a4', 'center'); }
  function stepper(c, x, y, w, h, label, hov) { rr(c, x, y, w, h, 5); c.fillStyle = '#1d110b'; c.fill(); rr(c, x + 0.5, y + 0.5, w - 1, h - 1, 5); c.lineWidth = 1.4; c.strokeStyle = hov ? '#c8cfd7' : '#7d848d'; c.stroke(); c.strokeStyle = GOLD; c.lineWidth = 2; c.beginPath(); c.moveTo(x + 14, y + h / 2 - 5); c.lineTo(x + 9, y + h / 2); c.lineTo(x + 14, y + h / 2 + 5); c.moveTo(x + w - 14, y + h / 2 - 5); c.lineTo(x + w - 9, y + h / 2); c.lineTo(x + w - 14, y + h / 2 + 5); c.stroke(); text(c, label, x + w / 2, y + h / 2 + 0.5, 11.5, CREAM, 'center'); }
  function slider(c, x, y, w, val, on) { c.fillStyle = 'rgba(0,0,0,0.65)'; rr(c, x, y - 3, w, 6, 3); c.fill(); if (on) { var g = c.createLinearGradient(0, y - 3, 0, y + 3); g.addColorStop(0, '#f2cf72'); g.addColorStop(1, '#c08a2a'); rr(c, x, y - 3, Math.max(4, w * val), 6, 3); c.fillStyle = g; c.fill(); } c.strokeStyle = 'rgba(255,255,255,0.18)'; rr(c, x, y - 3, w, 6, 3); c.stroke(); var kx = x + w * val, kg = c.createRadialGradient(kx - 2, y - 2, 1, kx, y, 9); kg.addColorStop(0, '#fff2c0'); kg.addColorStop(1, on ? '#d09a30' : '#7a6a5a'); c.fillStyle = kg; c.beginPath(); c.arc(kx, y, 8, 0, TAU); c.fill(); c.strokeStyle = '#5a3a14'; c.lineWidth = 1.5; c.stroke(); }

  // every Settings row, same features as the old page: returns the y after the last row
  L.settings = function (c, hit, mouse, x, y, w, S) {
    var yy = y, RH = 40, pad = 10, cw = Math.min(124, w * 0.4), cx = x + w - pad - cw, i;
    function hov(a, b, ww, hh) { return mouse && mouse.x >= a && mouse.x < a + ww && mouse.y >= b && mouse.y < b + hh; }
    function row(ic, title, sub, extra) {
      var h = RH + (sub ? 14 : 0), g = c.createLinearGradient(0, yy, 0, yy + h); g.addColorStop(0, 'rgba(20,10,6,0.45)'); g.addColorStop(1, 'rgba(36,20,12,0.45)');
      rr(c, x + 4, yy, w - 8, h - 4, 6); c.fillStyle = g; c.fill(); rr(c, x + 4.5, yy + 0.5, w - 9, h - 5, 6); c.lineWidth = 1; c.strokeStyle = 'rgba(0,0,0,0.55)'; c.stroke(); c.strokeStyle = 'rgba(214,170,112,0.18)'; rr(c, x + 5.5, yy + 1.5, w - 11, h - 7, 5); c.stroke();
      icon(c, ic, x + pad + 14, yy + RH / 2 - 2, 18); text(c, title, x + pad + 34, yy + RH / 2 - 2, 13.5, CREAM, 'left');
      if (sub) text(c, sub, x + pad + 6, yy + RH - 2 + 6, 9.5, DIM, 'left', 'normal');
      var at = yy; yy += h; return at;
    }
    function toggleRow(ic, title, key, inv) { var on = inv ? S.get(key) !== false : !!S.get(key), at = row(ic, title); pill(c, cx + cw - 58, at + 7, 58, 24, on, on ? 'ON' : 'OFF'); hit(cx + cw - 70, at + 3, 72, 32, function () { if (inv) S.set(key, S.get(key) === false); else S.toggle(key); }); }
    function stepRow(ic, title, label, prev, next, sub) { var at = row(ic, title, sub), bx = cx - 4, bw = cw + 4; stepper(c, bx, at + 6, bw, 26, label, hov(bx, at + 6, bw, 26)); hit(bx, at + 4, bw / 2, 30, prev); hit(bx + bw / 2, at + 4, bw / 2, 30, next); }
    function cycle(list, cur, d) { var i2 = list.indexOf(cur); return list[(i2 + d + list.length) % list.length]; }
    toggleRow('gear', 'Auto Equip', 'autoEquip');
    toggleRow('book', 'Tutorial Hints', 'tutorial', true);
    toggleRow('moon', 'Reduce Darkness', 'reduceDarkness');
    toggleRow('chevrons', 'Auto Level', 'autoLevel');
    var crit = ['kills', 'all', 'short', 'off'], critName = { kills: 'Big Kills', all: 'All Hits', short: 'Short', off: 'Off' }, cm = S.get('critMode') || 'kills';
    stepRow('clapper', 'Crit Cinematics', critName[cm] || 'Big Kills', function () { S.set('critMode', cycle(crit, cm, -1)); }, function () { S.set('critMode', cycle(crit, cm, 1)); });
    var D = CC.Difficulty;
    if (D) { var modes = D.modes(), sel = D.mode(), dn = D.PRESETS[sel].desc || '';
      var setM = function (m) { D.setMode(m); if ((m === 'hard' || m === 'dev') && CC.HoldGuide) CC.HoldGuide.showAim(); };
      stepRow('swords', 'Difficulty', D.PRESETS[sel].name, function () { setM(cycle(modes, sel, -1)); }, function () { setM(cycle(modes, sel, 1)); }, dn.length > 60 ? dn.slice(0, 58) + '..' : dn); }
    var AU = CC.Audio;
    if (AU) { var au = AU.status(), tw = cw - 8, tk = cx + 2;
      var volRow = function (ic, title, val, setter, on, toggle) { var at = row(ic, title); slider(c, tk, at + RH / 2 - 2, tw, val, on); hit(tk - 12, at + 2, tw + 24, 34, function (px) { setter(Math.max(0, Math.min(1, (px - tk) / tw))); }, true); hit(x + pad + 4, at + 2, 140, 34, toggle); };
      volRow('speaker', 'Volume', au.vol.master, function (v) { AU.setMaster(v); }, au.sfx, function () { AU.toggleSfx(); });
      volRow('note', 'Music Volume', au.vol.music, function (v) { AU.setMusic(v); }, au.music, function () { AU.toggleMusic(); }); }
    var rg = CC.zoomRange || [0.28, 2.2], z = CC.getZoomTarget ? CC.getZoomTarget() : 1, setZ = function (v) { if (CC.setZoom) CC.setZoom(Math.max(rg[0], Math.min(rg[1], v))); };
    stepRow('magnifier', 'Zoom', Math.round(z * 100) + '%', function () { setZ(z / 1.12); }, function () { setZ(z * 1.12); });
    var fixed = S.get('stick') === 'fixed';
    stepRow('dpad', 'Movement Stick', fixed ? 'Fixed' : 'Dynamic', function () { S.set('stick', fixed ? 'floating' : 'fixed'); }, function () { S.set('stick', fixed ? 'floating' : 'fixed'); });
    return yy;
  };
})(window);
