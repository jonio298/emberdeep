/* CC.ItemArt - procedural sprites for every kind of item (no letters): swords, axes, daggers, staves, wands, bows, maces,
 * spears, armor, helms, gloves, boots, rings, amulets, trinkets and charms. Each is painted once into a small offscreen
 * canvas (cached) from the item's slot, weapon type, name (for the material and variant) and rarity colour.
 *
 *   CC.ItemArt.draw(ctx, item, slotName, x, y, size, opts)   item may be null: slotName then draws a dim ghost of that slot
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, A = CC.ItemArt = {}, cache = {}, count = 0, U = 64, SS = 2; // 64-unit design grid, drawn at 2x

  function shade(hex, f) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '#888888');
    if (!m) return hex;
    var r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    if (f >= 1) { r = r + (255 - r) * (f - 1); g = g + (255 - g) * (f - 1); b = b + (255 - b) * (f - 1); }
    else { r *= f; g *= f; b *= f; }
    return 'rgb(' + Math.round(Math.max(0, Math.min(255, r))) + ',' + Math.round(Math.max(0, Math.min(255, g))) + ',' + Math.round(Math.max(0, Math.min(255, b))) + ')';
  }
  function lin(c, x0, y0, x1, y1, a, b) { var g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; }
  function poly(c, pts, fill, stroke, lw) {
    c.beginPath(); c.moveTo(pts[0], pts[1]); for (var i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.lineWidth = lw || 1; c.strokeStyle = stroke; c.stroke(); }
  }
  function ell(c, x, y, rx, ry, fill, stroke, lw) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 6.2832); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.lineWidth = lw || 1; c.strokeStyle = stroke; c.stroke(); } }
  function ca(hex, a) { var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '#888888'); return m ? 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + a + ')' : 'rgba(136,136,136,' + a + ')'; }
  function glow(c, x, y, r, col) { var g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }

  // materials picked from the item's name
  function material(name) {
    var n = (name || '').toLowerCase();
    if (/iron|chain|steel|gauntlet|greave|helm/.test(n)) return { base: '#9aa3b2', dark: '#4a5060', light: '#e4eaf6', trim: '#c9a24a', kind: 'metal' };
    if (/bone|skull|fang|tooth|claw/.test(n)) return { base: '#d8d0b8', dark: '#6b6350', light: '#f6f0dc', trim: '#9a8c6a', kind: 'bone' };
    if (/leather|hide|vest|cuirass|cap|boots|treads|gloves|mitts/.test(n)) return { base: '#8a5a34', dark: '#3d2514', light: '#c48a52', trim: '#d6b46a', kind: 'leather' };
    if (/cloth|robe|wrap|hood|sandal|moth/.test(n)) return { base: '#6a5a8a', dark: '#2c2440', light: '#a89ad0', trim: '#d6b46a', kind: 'cloth' };
    if (/copper/.test(n)) return { base: '#c47a44', dark: '#6a3a1c', light: '#f0b27a', trim: '#f0c890', kind: 'metal' };
    if (/silver/.test(n)) return { base: '#c8d0dc', dark: '#5a6272', light: '#ffffff', trim: '#e8eef8', kind: 'metal' };
    if (/jade/.test(n)) return { base: '#3aa070', dark: '#145238', light: '#8af0b8', trim: '#d6e8a0', kind: 'gem' };
    if (/amber/.test(n)) return { base: '#e0a030', dark: '#7a4c10', light: '#ffe08a', trim: '#f0d890', kind: 'gem' };
    return { base: '#a8aebb', dark: '#4e5462', light: '#eef2fb', trim: '#c9a24a', kind: 'metal' };
  }

  /* ---------- weapons (painted pointing up, then rotated) ---------- */
  function wSword(c, m, rc) {
    var b = lin(c, -4, 0, 4, 0, m.light, m.dark);
    poly(c, [0, -29, 4.2, -22, 3.6, 5, -3.6, 5, -4.2, -22], b, shade(m.dark, 0.7), 0.8);
    c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillRect(-0.6, -22, 1.2, 25);                       // fuller
    c.fillStyle = rc; c.globalAlpha = 0.35; poly(c, [0, -29, 1.4, -22, 0, -20, -1.4, -22], rc); c.globalAlpha = 1;
    poly(c, [-10, 5, 10, 5, 9, 9, -9, 9], lin(c, 0, 5, 0, 9, m.trim, shade(m.trim, 0.5)), '#2a1a08', 0.8); // guard
    ell(c, -10, 7, 2, 2, m.trim, '#2a1a08', 0.6); ell(c, 10, 7, 2, 2, m.trim, '#2a1a08', 0.6);
    c.fillStyle = '#4a2c18'; c.fillRect(-2, 9, 4, 12); c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 0.6; for (var i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-2, 11 + i * 3); c.lineTo(2, 12 + i * 3); c.stroke(); }
    ell(c, 0, 24, 3.4, 3.4, lin(c, 0, 21, 0, 27, m.trim, shade(m.trim, 0.5)), '#2a1a08', 0.8);
    ell(c, 0, 24, 1.3, 1.3, rc);
  }
  function wDagger(c, m, rc) {
    poly(c, [0, -20, 3.4, -13, 2.8, 3, -2.8, 3, -3.4, -13], lin(c, -3, 0, 3, 0, m.light, m.dark), shade(m.dark, 0.7), 0.8);
    c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(-0.5, -14, 1, 15);
    poly(c, [-6.5, 3, 6.5, 3, 6, 6.5, -6, 6.5], m.trim, '#2a1a08', 0.8);
    c.fillStyle = '#2e2018'; c.fillRect(-1.8, 6.5, 3.6, 10); c.strokeStyle = rc; c.lineWidth = 0.9; c.beginPath(); c.moveTo(-1.8, 9); c.lineTo(1.8, 10); c.moveTo(-1.8, 12); c.lineTo(1.8, 13); c.stroke();
    ell(c, 0, 18, 2.5, 2.5, m.trim, '#2a1a08', 0.7);
  }
  function wAxe(c, m, rc) {
    c.fillStyle = '#6a4424'; c.fillRect(-1.8, -24, 3.6, 50); c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(-1.8, -24, 1, 50);
    c.beginPath(); c.moveTo(1.8, -24); c.bezierCurveTo(18, -27, 22, -8, 12, -2); c.lineTo(8, -8); c.lineTo(1.8, -9); c.closePath();
    c.fillStyle = lin(c, 2, -14, 20, -14, m.light, m.dark); c.fill(); c.lineWidth = 0.9; c.strokeStyle = shade(m.dark, 0.6); c.stroke();
    c.strokeStyle = rc; c.globalAlpha = 0.7; c.lineWidth = 1.2; c.beginPath(); c.moveTo(13, -23); c.bezierCurveTo(21, -16, 19, -8, 12, -3); c.stroke(); c.globalAlpha = 1;
    c.fillStyle = m.trim; c.fillRect(-2.6, -10, 5.2, 3); c.fillRect(-2.6, 18, 5.2, 3);
  }
  function wMace(c, m, rc) {
    c.fillStyle = '#6a4424'; c.fillRect(-1.8, -6, 3.6, 32); c.fillStyle = m.trim; c.fillRect(-2.6, 20, 5.2, 3);
    ell(c, 0, -14, 8.5, 8.5, lin(c, -8, -20, 8, -8, m.light, m.dark), shade(m.dark, 0.6), 1);
    for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4; poly(c, [Math.cos(a - 0.3) * 7.5, -14 + Math.sin(a - 0.3) * 7.5, Math.cos(a) * 13.2, -14 + Math.sin(a) * 13.2, Math.cos(a + 0.3) * 7.5, -14 + Math.sin(a + 0.3) * 7.5], m.light, shade(m.dark, 0.6), 0.7); }
    glow(c, 0, -14, 7, ca(rc,0.35));
  }
  function wSpear(c, m, rc) {
    c.fillStyle = '#7a5230'; c.fillRect(-1.5, -14, 3, 42); c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(-1.5, -14, 0.9, 42);
    poly(c, [0, -30, 5, -18, 1.8, -13, -1.8, -13, -5, -18], lin(c, -5, 0, 5, 0, m.light, m.dark), shade(m.dark, 0.6), 0.8);
    c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(-0.5, -27, 1, 12);
    c.fillStyle = rc; c.fillRect(-2.5, -12, 5, 2.4); c.fillStyle = m.trim; c.fillRect(-2.2, 24, 4.4, 2.5);
  }
  function wStaff(c, m, rc) {
    c.fillStyle = lin(c, -2, 0, 2, 0, '#8a6038', '#4a2c14'); c.fillRect(-1.9, -12, 3.8, 40);
    c.strokeStyle = m.trim; c.lineWidth = 1.6; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-1.9, -10); c.quadraticCurveTo(-9, -16, -5, -25); c.moveTo(1.9, -10); c.quadraticCurveTo(9, -16, 5, -25); c.stroke();
    glow(c, 0, -19, 13, ca(rc,0.55));
    ell(c, 0, -18, 4.6, 4.6, lin(c, -4, -22, 4, -14, '#ffffff', rc), shade(rc, 0.6), 0.8);
    ell(c, -1.4, -19.4, 1.4, 1.4, 'rgba(255,255,255,0.9)');
    c.fillStyle = m.trim; c.fillRect(-2.5, -9, 5, 2.4);
  }
  function wWand(c, m, rc) {
    poly(c, [-1.4, 24, 1.4, 24, 2.2, -10, -2.2, -10], lin(c, -2, 0, 2, 0, '#8a6038', '#3e2412'), '#24140a', 0.6);
    c.fillStyle = m.trim; c.fillRect(-2.6, 8, 5.2, 2.2);
    glow(c, 0, -15, 11, ca(rc,0.55));
    poly(c, [0, -26, 4.5, -17, 0, -8, -4.5, -17], lin(c, -4, -24, 4, -10, '#ffffff', rc), shade(rc, 0.55), 0.8);
    c.fillStyle = 'rgba(255,255,255,0.6)'; poly(c, [0, -24, 1.5, -18, 0, -14, -1.4, -18], 'rgba(255,255,255,0.45)');
  }
  function wBow(c, m, rc) { // upright, no rotation
    c.strokeStyle = lin(c, -8, 0, 8, 0, '#a07044', '#5a3a1c'); c.lineWidth = 3.4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-2, -27); c.quadraticCurveTo(14, 0, -2, 27); c.stroke();
    c.strokeStyle = '#f2ead0'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(-2, -27); c.lineTo(-2, 27); c.stroke();
    c.strokeStyle = '#d8c8a0'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-2, 0); c.lineTo(20, 0); c.stroke();
    poly(c, [23, 0, 18, -2.6, 18, 2.6], m.light, shade(m.dark, 0.6), 0.6);
    c.fillStyle = rc; c.beginPath(); c.moveTo(-2, 0); c.lineTo(-5.5, -2.4); c.lineTo(-5.5, 2.4); c.fill();
    c.strokeStyle = m.trim; c.lineWidth = 1.4; c.beginPath(); c.moveTo(6.5, -4); c.lineTo(6.5, 4); c.stroke();
  }
  var WEAPONS = { sword: wSword, dagger: wDagger, axe: wAxe, mace: wMace, spear: wSpear, staff: wStaff, wand: wWand, bow: wBow };

  /* ---------- armor and the rest ---------- */
  function drawArmor(c, m, rc, n) {
    var robe = /robe|wrap|cloth/.test(n), plate = /plate|chain|cuirass|shirt/.test(n);
    if (robe) { // flowing robe with a sash
      poly(c, [-9, -22, 9, -22, 17, 26, -17, 26], lin(c, 0, -22, 0, 26, m.base, m.dark), shade(m.dark, 0.6), 1);
      poly(c, [-4, -22, 4, -22, 2, 26, -2, 26], 'rgba(255,255,255,0.12)');
      c.fillStyle = m.trim; c.fillRect(-9.5, 0, 19, 3.6); ell(c, 0, 1.8, 2.4, 2.4, rc, '#2a1a08', 0.6);
      poly(c, [-9, -22, -22, -6, -16, -1, -8, -12], lin(c, -20, -6, -8, -14, m.base, m.dark), shade(m.dark, 0.6), 1); poly(c, [9, -22, 22, -6, 16, -1, 8, -12], lin(c, 20, -6, 8, -14, m.base, m.dark), shade(m.dark, 0.6), 1);
      c.strokeStyle = rc; c.lineWidth = 1; c.beginPath(); c.moveTo(-9, -22); c.quadraticCurveTo(0, -17, 9, -22); c.stroke();
      return;
    }
    // shoulders + chest piece
    ell(c, -15, -15, 8, 6.5, lin(c, -22, -20, -8, -10, m.light, m.dark), shade(m.dark, 0.6), 1); ell(c, 15, -15, 8, 6.5, lin(c, 22, -20, 8, -10, m.light, m.dark), shade(m.dark, 0.6), 1);
    poly(c, [-12, -19, 12, -19, 14, 6, 9, 24, -9, 24, -14, 6], lin(c, 0, -19, 0, 24, m.base, m.dark), shade(m.dark, 0.55), 1.2);
    poly(c, [-9, -17, 0, -13, 9, -17, 7, 2, 0, 6, -7, 2], 'rgba(255,255,255,0.14)');
    if (plate) { c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 0.8; for (var i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-10 + i * 0.6, -2 + i * 6); c.lineTo(10 - i * 0.6, -2 + i * 6); c.stroke(); } c.strokeStyle = 'rgba(255,255,255,0.3)'; c.beginPath(); c.moveTo(0, -17); c.lineTo(0, 22); c.stroke(); }
    else { c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(0, -16); c.lineTo(0, 22); c.stroke(); for (var j = 0; j < 5; j++) { c.beginPath(); c.moveTo(-2, -12 + j * 7); c.lineTo(2, -10 + j * 7); c.stroke(); } }
    c.fillStyle = '#3a2412'; c.fillRect(-12, 12, 24, 4.2); ell(c, 0, 14, 3, 3, m.trim, '#2a1a08', 0.7); ell(c, 0, 14, 1.2, 1.2, rc);
    c.strokeStyle = rc; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-12, -19); c.lineTo(12, -19); c.stroke();
  }
  function drawHelm(c, m, rc, n) {
    var hood = /hood|cap/.test(n), skull = /skull|mask/.test(n), crown = /crown/.test(n), horn = /horn/.test(n);
    if (hood) {
      c.beginPath(); c.moveTo(-17, 24); c.quadraticCurveTo(-20, -18, 0, -26); c.quadraticCurveTo(20, -18, 17, 24); c.quadraticCurveTo(0, 14, -17, 24); c.closePath();
      c.fillStyle = lin(c, 0, -26, 0, 24, m.base, m.dark); c.fill(); c.lineWidth = 1.2; c.strokeStyle = shade(m.dark, 0.55); c.stroke();
      ell(c, 0, 4, 8, 11, '#0c0810'); ell(c, -3, 3, 1.3, 1.1, rc); ell(c, 3, 3, 1.3, 1.1, rc); glow(c, 0, 3, 8, ca(rc,0.25));
      c.strokeStyle = m.trim; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-9, -12); c.quadraticCurveTo(0, -20, 9, -12); c.stroke();
      return;
    }
    if (horn) {
      poly(c, [-17, -10, -26, -25, -20, -26, -10, -16], m.light, shade(m.dark, 0.6), 1); poly(c, [17, -10, 26, -25, 20, -26, 10, -16], m.light, shade(m.dark, 0.6), 1);
    }
    c.beginPath(); c.moveTo(-17, 16); c.lineTo(-18, -4); c.quadraticCurveTo(-17, -24, 0, -26); c.quadraticCurveTo(17, -24, 18, -4); c.lineTo(17, 16); c.lineTo(9, 22); c.lineTo(-9, 22); c.closePath();
    c.fillStyle = lin(c, -18, 0, 18, 0, m.light, m.dark); c.fill(); c.lineWidth = 1.3; c.strokeStyle = shade(m.dark, 0.5); c.stroke();
    if (skull) { ell(c, -6, 0, 4.2, 5, '#100a10'); ell(c, 6, 0, 4.2, 5, '#100a10'); poly(c, [-2, 9, 2, 9, 0, 4], '#100a10'); c.fillStyle = '#100a10'; for (var k = -3; k <= 3; k += 2) c.fillRect(k - 0.5, 14, 1, 7); ell(c, -6, 0, 1.4, 1.4, rc); ell(c, 6, 0, 1.4, 1.4, rc); }
    else { c.fillStyle = '#0c0810'; c.fillRect(-12, -2, 24, 5); c.fillRect(-1.4, -2, 2.8, 17); c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-12, -2); c.lineTo(12, -2); c.stroke(); ell(c, -6, 0.5, 1.2, 0.9, rc); ell(c, 6, 0.5, 1.2, 0.9, rc); }
    c.fillStyle = 'rgba(255,255,255,0.18)'; poly(c, [-12, -18, -4, -22, -6, -8, -13, -6], 'rgba(255,255,255,0.18)');
    if (crown) { for (var q = -2; q <= 2; q++) poly(c, [q * 7 - 3, -22, q * 7, -31, q * 7 + 3, -22], m.trim, '#2a1a08', 0.7); ell(c, 0, -26, 1.8, 1.8, rc); }
    else { c.fillStyle = m.trim; c.fillRect(-17, 12, 34, 3); }
  }
  function drawGloves(c, m, rc, n) {
    var claws = /claw|fist|spike/.test(n), wrap = /wrap/.test(n);
    c.fillStyle = lin(c, -14, 0, 14, 0, m.base, m.dark); c.strokeStyle = shade(m.dark, 0.5); c.lineWidth = 1.1;
    c.beginPath(); c.moveTo(-11, 24); c.lineTo(-13, 2); c.lineTo(-11, -4); c.lineTo(11, -4); c.lineTo(13, 2); c.lineTo(11, 24); c.closePath(); c.fill(); c.stroke();
    for (var i = 0; i < 4; i++) { var fx = -9.5 + i * 6.4; c.beginPath(); c.roundRect ? c.roundRect(fx, -24 + (i === 1 || i === 2 ? -3 : 0), 5, 22, 2.5) : c.rect(fx, -24, 5, 22); c.fillStyle = lin(c, fx, 0, fx + 5, 0, m.base, m.dark); c.fill(); c.stroke(); if (claws) poly(c, [fx, -24 + (i === 1 || i === 2 ? -3 : 0), fx + 2.5, -34 + (i === 1 || i === 2 ? -3 : 0), fx + 5, -24 + (i === 1 || i === 2 ? -3 : 0)], '#f0f0f0', '#555', 0.6); }
    poly(c, [-14, -1, -22, -8, -18, 2, -13, 4], m.base, shade(m.dark, 0.5), 1); // thumb
    c.fillStyle = m.trim; c.fillRect(-13, 14, 26, 4.5); if (wrap) { c.strokeStyle = 'rgba(0,0,0,0.35)'; for (var w = 0; w < 4; w++) { c.beginPath(); c.moveTo(-12, 2 + w * 4); c.lineTo(12, 5 + w * 4); c.stroke(); } }
    ell(c, 0, 8, 2.4, 2.4, rc, '#2a1a08', 0.6);
  }
  function drawBoots(c, m, rc, n) {
    var iron = m.kind === 'metal', sandal = /sandal/.test(n);
    c.beginPath(); c.moveTo(-9, -24); c.lineTo(9, -24); c.lineTo(10, 8); c.quadraticCurveTo(24, 10, 24, 20); c.lineTo(24, 25); c.lineTo(-11, 25); c.lineTo(-12, -6); c.closePath();
    c.fillStyle = lin(c, -12, 0, 24, 0, m.base, m.dark); c.fill(); c.lineWidth = 1.3; c.strokeStyle = shade(m.dark, 0.5); c.stroke();
    c.fillStyle = shade(m.dark, 0.5); c.fillRect(-11, 21, 36, 5);
    c.fillStyle = m.trim; c.fillRect(-10, -24, 20, 4.5); c.fillStyle = 'rgba(255,255,255,0.2)'; c.fillRect(-7, -18, 3, 28);
    if (iron) { c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(-10, -4); c.lineTo(10, -4); c.moveTo(-10, 6); c.lineTo(11, 6); c.stroke(); }
    else { c.strokeStyle = '#e8d8b0'; c.lineWidth = 0.9; for (var i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-3, -12 + i * 6); c.lineTo(5, -10 + i * 6); c.stroke(); } }
    if (sandal) { c.strokeStyle = m.trim; c.lineWidth = 1.2; for (var s = 0; s < 3; s++) { c.beginPath(); c.moveTo(-10, -10 + s * 9); c.lineTo(10, -8 + s * 9); c.stroke(); } }
    ell(c, 0, -22, 2, 2, rc);
  }
  function drawRing(c, m, rc) {
    ell(c, 0, 8, 17, 15, null, shade(m.dark, 0.6), 7); ell(c, 0, 8, 17, 15, null, lin(c, -17, 0, 17, 0, m.light, m.base), 5);
    c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1.2; c.beginPath(); c.ellipse(0, 8, 17, 15, 0, 3.6, 5.2); c.stroke();
    poly(c, [-8, -10, 8, -10, 12, -20, 0, -30, -12, -20], m.trim, '#2a1a08', 0.9);
    glow(c, 0, -19, 15, ca(rc,0.5));
    poly(c, [-6, -12, 6, -12, 9, -19, 0, -27, -9, -19], lin(c, -8, -26, 8, -12, '#ffffff', rc), shade(rc, 0.55), 0.9);
    poly(c, [-3, -22, 0, -26, 2, -22, -1, -17], 'rgba(255,255,255,0.7)');
  }
  function drawAmulet(c, m, rc, n) {
    c.strokeStyle = m.kind === 'bone' ? '#cfc6a8' : m.trim; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-22, -26); c.quadraticCurveTo(0, 6, 22, -26); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.8; c.setLineDash([2, 2]); c.beginPath(); c.moveTo(-22, -26); c.quadraticCurveTo(0, 6, 22, -26); c.stroke(); c.setLineDash([]);
    glow(c, 0, 12, 16, ca(rc,0.5));
    if (/fang|tooth/.test(n.toLowerCase())) { poly(c, [-6, -2, 6, -2, 2, 26, -2, 26], '#f2ecd8', '#7a7058', 1); poly(c, [-3, 0, 0, 0, -0.5, 22], 'rgba(255,255,255,0.7)'); }
    else if (/shell/.test(n.toLowerCase())) { c.beginPath(); c.moveTo(-12, 20); c.quadraticCurveTo(0, -12, 12, 20); c.quadraticCurveTo(0, 26, -12, 20); c.fillStyle = lin(c, -12, 0, 12, 24, '#f6e8e0', '#c8a0a0'); c.fill(); c.strokeStyle = '#8a6a6a'; c.lineWidth = 1; c.stroke(); for (var i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * 3, 22); c.lineTo(i * 1.2, 4); c.stroke(); } }
    else if (/rune/.test(n.toLowerCase())) { poly(c, [0, -2, 10, 8, 0, 26, -10, 8], lin(c, -10, 0, 10, 26, '#3a3a52', '#14141f'), m.trim, 1.2); c.strokeStyle = rc; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-3, 8); c.lineTo(0, 4); c.lineTo(3, 8); c.moveTo(0, 4); c.lineTo(0, 20); c.moveTo(-3, 14); c.lineTo(3, 12); c.stroke(); }
    else if (/glass|pendant/.test(n.toLowerCase())) { c.beginPath(); c.moveTo(0, -2); c.bezierCurveTo(13, 4, 11, 20, 0, 26); c.bezierCurveTo(-11, 20, -13, 4, 0, -2); c.fillStyle = lin(c, -10, 0, 10, 26, 'rgba(255,255,255,0.9)', rc); c.fill(); c.strokeStyle = m.trim; c.lineWidth = 1.5; c.stroke(); poly(c, [-4, 4, -1, 2, -3, 12], 'rgba(255,255,255,0.7)'); }
    else { ell(c, 0, 12, 9, 11, lin(c, -9, 2, 9, 24, shade(rc, 1.5), shade(rc, 0.7)), m.trim, 2.2); poly(c, [-4, 6, -1, 4, -3, 14], 'rgba(255,255,255,0.65)'); }
    ell(c, 0, -2, 2.6, 2.6, m.trim, '#2a1a08', 0.8);
  }
  function drawTrinket(c, m, rc, n) {
    n = (n || '').toLowerCase();
    glow(c, 0, 2, 22, ca(rc,0.28));
    if (/coin/.test(n)) { ell(c, 0, 2, 17, 17, lin(c, -14, -14, 14, 14, '#ffe58a', '#b07a1a'), '#6a4a10', 1.4); ell(c, 0, 2, 12, 12, null, 'rgba(110,70,10,0.7)', 1.1); poly(c, [0, -8, 2.4, -1, 9, -1, 4, 4, 6, 11, 0, 7, -6, 11, -4, 4, -9, -1, -2.4, -1], 'rgba(110,70,10,0.8)'); }
    else if (/pebble/.test(n)) { c.beginPath(); c.moveTo(-14, 10); c.bezierCurveTo(-18, -8, -4, -20, 8, -14); c.bezierCurveTo(20, -8, 18, 12, 4, 16); c.bezierCurveTo(-4, 20, -12, 18, -14, 10); c.fillStyle = lin(c, -14, -14, 14, 16, shade(rc, 1.6), shade(rc, 0.6)); c.fill(); c.strokeStyle = shade(rc, 0.4); c.lineWidth = 1.2; c.stroke(); ell(c, -4, -6, 3.5, 2.4, 'rgba(255,255,255,0.6)'); }
    else if (/idol/.test(n)) { poly(c, [-10, 24, -8, -6, -12, -12, -6, -22, 6, -22, 12, -12, 8, -6, 10, 24], lin(c, -10, 0, 10, 0, '#8a8478', '#4a463e'), '#2a2620', 1.2); ell(c, -4, -12, 2, 2, '#0a0a0a'); ell(c, 4, -12, 2, 2, '#0a0a0a'); c.strokeStyle = '#1a1814'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-5, -5); c.lineTo(5, -5); c.moveTo(-2, 4); c.lineTo(2, 4); c.moveTo(-3, 12); c.lineTo(3, 12); c.stroke(); c.strokeStyle = '#1a1814'; c.beginPath(); c.moveTo(-3, -22); c.lineTo(-1, -8); c.moveTo(4, -17); c.lineTo(2, -8); c.stroke(); ell(c, 0, 8, 2, 2, rc); }
    else if (/mushroom/.test(n)) { c.fillStyle = '#e8dcc0'; c.beginPath(); c.moveTo(-5, 24); c.lineTo(-4, 2); c.lineTo(4, 2); c.lineTo(5, 24); c.quadraticCurveTo(0, 28, -5, 24); c.fill(); c.strokeStyle = '#8a7a5a'; c.lineWidth = 1; c.stroke(); c.beginPath(); c.moveTo(-22, 4); c.quadraticCurveTo(-20, -24, 0, -24); c.quadraticCurveTo(20, -24, 22, 4); c.quadraticCurveTo(0, 8, -22, 4); c.fillStyle = lin(c, 0, -24, 0, 6, shade(rc, 1.4), shade(rc, 0.65)); c.fill(); c.strokeStyle = shade(rc, 0.4); c.lineWidth = 1.2; c.stroke(); ell(c, -8, -10, 3.2, 2.6, 'rgba(255,255,240,0.85)'); ell(c, 5, -13, 2.4, 2, 'rgba(255,255,240,0.85)'); ell(c, 12, -4, 2, 1.6, 'rgba(255,255,240,0.85)'); }
    else if (/silk|knot/.test(n)) { c.strokeStyle = '#e8e6f0'; c.lineWidth = 2.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(-18, -8); c.bezierCurveTo(-4, -26, 10, 14, 18, -2); c.moveTo(-16, 10); c.bezierCurveTo(-2, -12, 12, 26, 20, 8); c.moveTo(-6, -14); c.bezierCurveTo(8, 4, -10, 12, 6, 24); c.stroke(); c.strokeStyle = 'rgba(160,150,200,0.7)'; c.lineWidth = 1; c.stroke(); ell(c, 0, 4, 4, 4, rc); }
    else { poly(c, [-9, 4, 0, -26, 9, 4, 0, 24], lin(c, -9, -20, 9, 20, shade(rc, 1.6), shade(rc, 0.7)), shade(rc, 0.4), 1.3); poly(c, [0, -26, 9, 4, 0, 0], 'rgba(255,255,255,0.22)'); poly(c, [-9, 4, 0, -26, -2, 2], 'rgba(255,255,255,0.35)'); c.strokeStyle = m.trim; c.lineWidth = 2; c.beginPath(); c.moveTo(-5, -20); c.lineTo(5, -20); c.stroke(); }
  }
  function drawCharm(c, m, rc) {
    c.strokeStyle = m.trim; c.lineWidth = 1.6; c.beginPath(); c.arc(0, -24, 5, Math.PI, 0); c.stroke(); ell(c, 0, -19, 2.2, 2.2, m.trim, '#2a1a08', 0.7);
    glow(c, 0, 6, 24, ca(rc,0.4));
    poly(c, [0, -16, 13, -4, 9, 14, 0, 26, -9, 14, -13, -4], lin(c, -12, -14, 12, 24, shade(rc, 1.7), shade(rc, 0.65)), shade(rc, 0.35), 1.4);
    poly(c, [0, -16, 13, -4, 0, 2], 'rgba(255,255,255,0.28)'); poly(c, [-13, -4, 0, -16, 0, 2], 'rgba(255,255,255,0.12)'); poly(c, [0, 2, 9, 14, 0, 26, -9, 14], 'rgba(0,0,0,0.18)');
    c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(0, -16); c.lineTo(0, 26); c.moveTo(-13, -4); c.lineTo(13, -4); c.stroke();
  }

  // typeFor: what to paint for this item / empty slot
  function typeFor(it, slot) {
    var s = it ? it.slot : slot;
    if (s === 'weapon') {
      var t = it && it.weaponType;
      if (!t && it) { var n = (it.name || '').toLowerCase(); t = /staff|rod|scepter|focus/.test(n) ? 'staff' : /wand|orb/.test(n) ? 'wand' : /dagger|fang|kris|stiletto|shiv/.test(n) ? 'dagger' : /axe|cleaver/.test(n) ? 'axe' : /bow/.test(n) ? 'bow' : /mace|club/.test(n) ? 'mace' : /spear|pike/.test(n) ? 'spear' : 'sword'; }
      return 'weapon:' + (t || 'sword');
    }
    return s && s.indexOf('charm') === 0 ? 'charm' : s || 'charm';
  }
  function build(type, name, rc, ghost) {
    var cv = document.createElement('canvas'); cv.width = cv.height = U * SS;
    var c = cv.getContext('2d'); c.scale(SS, SS); c.translate(U / 2, U / 2 + 1);
    var m = material(name);
    if (ghost) { m = { base: '#5a5360', dark: '#2a2630', light: '#847c8c', trim: '#6a6070', kind: m.kind }; rc = '#6a6070'; }
    c.lineJoin = 'round'; c.lineCap = 'round';
    var parts = type.split(':'), base = parts[0];
    c.save();
    if (base === 'weapon') {
      var fn = WEAPONS[parts[1]] || wSword;
      if (parts[1] !== 'bow') c.rotate(0.62 + (parts[1] === 'staff' || parts[1] === 'spear' ? 0.1 : 0));
      if (parts[1] === 'bow') c.translate(-3, 0);
      c.scale(0.92, 0.92);
      if (parts[1] === 'sword' || parts[1] === 'dagger') c.translate(0, parts[1] === 'sword' ? 1 : 2);
      fn(c, m, rc);
    } else {
      c.scale(0.95, 0.95);
      if (base === 'armor') drawArmor(c, m, rc, name || '');
      else if (base === 'helm') drawHelm(c, m, rc, (name || '').toLowerCase());
      else if (base === 'gloves') drawGloves(c, m, rc, (name || '').toLowerCase());
      else if (base === 'boots') drawBoots(c, m, rc, (name || '').toLowerCase());
      else if (base === 'ring') drawRing(c, m, rc);
      else if (base === 'amulet') drawAmulet(c, m, rc, name || '');
      else if (base === 'trinket') drawTrinket(c, m, rc, name || '');
      else drawCharm(c, m, rc);
    }
    c.restore();
    return cv;
  }
  function sprite(it, slot, ghost) {
    if (it && !ghost && it.legendary && CC.LegendArt) { var lg = CC.LegendArt.sprite(it.name); if (lg) return lg; } // the 70 legendary weapons have their own pictures
    var type = typeFor(it, slot), name = it ? it.name : '', rc = it ? (it.color || '#cccccc') : '#6a6070';
    var key;
    // variant words matter, so key on the whole name's matched keywords
    var kw = ((name || '').toLowerCase().match(/iron|chain|bone|skull|leather|hide|cloth|robe|copper|silver|jade|amber|fang|tooth|shell|rune|glass|pendant|coin|pebble|idol|mushroom|silk|knot|cap|hood|crown|horn|plate|vest|cuirass|shirt|wrap|claw|fist|spike|sandal|gauntlet|greave|steel|helm|mask/g) || []).join('.');
    key = type + '|' + kw + '|' + rc + (ghost ? '|g' : '');
    if (cache[key]) return cache[key];
    if (count > 400) { cache = {}; count = 0; }
    count++;
    return (cache[key] = build(type, name || '', rc, ghost));
  }

  // draws the item (or a ghost of the slot) centred in the size x size box at x, y
  A.draw = function (ctx, it, slot, x, y, size, opts) {
    opts = opts || {};
    var cv = sprite(it, slot, !it), pad = size * 0.06, s = size - pad * 2;
    ctx.save();
    if (!it) ctx.globalAlpha = opts.ghostAlpha === undefined ? 0.4 : opts.ghostAlpha;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cv, x + pad, y + pad, s, s);
    ctx.restore();
  };
  A.sprite = sprite;
})(window);
