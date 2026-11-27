/* CC.LegendArt - a hand-built picture for every one of the 70 legendary weapons (gear update: art).
 *
 * Each weapon is a small spec: a SHAPE (how the blade / head is built), a metal colour, an accent (glow) colour and a MOTIF (flames, frost,
 * lightning, skulls, eyes, runes, vines, webs ...). They are painted once into a cached canvas, like CC.ItemArt, which asks this module first
 * for any legendary weapon (itemart.js: sprite()).
 *
 *   CC.LegendArt.sprite(name)       the painted canvas for a legendary weapon, or null if the name is unknown
 *   CC.LegendArt.shadow(name)       the same weapon as a dark silhouette with a faint outline (the Legendary Index uses it for undiscovered ones)
 *   CC.LegendArt.has(name)          is there art for this name?
 *   CC.LegendArt.SPECS              the table, by weapon name
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, LA = CC.LegendArt = {}, U = 64, SS = 2, cache = {}, shadows = {};

  function shade(hex, f) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '#888888'); if (!m) return hex;
    var r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    if (f >= 1) { r += (255 - r) * (f - 1); g += (255 - g) * (f - 1); b += (255 - b) * (f - 1); } else { r *= f; g *= f; b *= f; }
    return 'rgb(' + Math.round(Math.max(0, Math.min(255, r))) + ',' + Math.round(Math.max(0, Math.min(255, g))) + ',' + Math.round(Math.max(0, Math.min(255, b))) + ')';
  }
  function ca(hex, a) { var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '#888888'); return m ? 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + a + ')' : 'rgba(136,136,136,' + a + ')'; }
  function lin(c, x0, y0, x1, y1, a, b) { var g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; }
  function glow(c, x, y, r, col) { var g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
  function poly(c, pts, fill, stroke, lw) {
    c.beginPath(); c.moveTo(pts[0], pts[1]); for (var i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.lineWidth = lw || 1; c.strokeStyle = stroke; c.stroke(); }
  }
  function ell(c, x, y, rx, ry, fill, stroke, lw) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 6.2832); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.lineWidth = lw || 1; c.strokeStyle = stroke; c.stroke(); } }
  function metalFill(c, B, x) { return lin(c, -x, 0, x, 0, shade(B, 1.45), shade(B, 0.55)); }

  /* ---------- the hilt shared by blades ---------- */
  var WOOD = '#4a2c18', GOLD = '#c9a24a';
  function hilt(c, o, A) {
    var b = o.base, gw = o.gw || 9, trim = o.trim || GOLD, gl = o.grip || 12;
    poly(c, [-gw, b, gw, b, gw - 1, b + 3.6, -gw + 1, b + 3.6], lin(c, 0, b, 0, b + 4, trim, shade(trim, 0.5)), '#2a1a08', 0.8);
    ell(c, -gw, b + 1.8, 1.9, 1.9, trim, '#2a1a08', 0.6); ell(c, gw, b + 1.8, 1.9, 1.9, trim, '#2a1a08', 0.6);
    c.fillStyle = o.haft || WOOD; c.fillRect(-1.9, b + 3.6, 3.8, gl);
    c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 0.6; for (var i = 0; i < gl / 3; i++) { c.beginPath(); c.moveTo(-1.9, b + 5 + i * 3); c.lineTo(1.9, b + 6 + i * 3); c.stroke(); }
    var py = b + 3.6 + gl + 2.4;
    ell(c, 0, py, 3.2, 3.2, lin(c, 0, py - 3, 0, py + 3, trim, shade(trim, 0.5)), '#2a1a08', 0.8); ell(c, 0, py, 1.3, 1.3, A);
  }
  /* a parametric blade: width w, tip y, base y, wave (flamberge), curve (scimitar), serration */
  function blade(c, o, B, A) {
    var pts = [], right = [], y, t, hw, ox, step = 2, n = 0;
    for (y = o.base; y >= o.tip - 0.01; y -= step) {
      t = (o.base - y) / (o.base - o.tip); hw = o.w * (t < 0.72 ? 1 : Math.max(0, (1 - t) / 0.28));
      if (o.tapered) hw = o.w * (1 - t * 0.85);
      ox = (o.curve || 0) * t * t * 9 + (o.wave || 0) * Math.sin(y * 0.75) * 1.5;
      if (o.serr && t > 0.2 && t < 0.9) hw += (n % 2 ? 1.4 : 0);
      pts.push(ox - hw, y); right.push(ox + hw, y); n++;
    }
    var all = pts.slice(); for (var i = right.length - 2; i >= 0; i -= 2) all.push(right[i], right[i + 1]);
    poly(c, all, metalFill(c, B, o.w + 2), shade(B, 0.4), 0.8);
    c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1; c.beginPath();
    for (y = o.base - 2, n = 0; y >= o.tip + 6; y -= 2, n++) { t = (o.base - y) / (o.base - o.tip); ox = (o.curve || 0) * t * t * 9 + (o.wave || 0) * Math.sin(y * 0.75) * 1.5; if (!n) c.moveTo(ox, y); else c.lineTo(ox, y); }
    c.stroke();
    c.globalAlpha = 0.45; c.strokeStyle = A; c.lineWidth = 1.1; c.beginPath(); for (y = o.base - 2, n = 0; y >= o.tip + 6; y -= 2, n++) { t = (o.base - y) / (o.base - o.tip); ox = (o.curve || 0) * t * t * 9 + (o.wave || 0) * Math.sin(y * 0.75) * 1.5 + o.w * 0.55; if (!n) c.moveTo(ox, y); else c.lineTo(ox, y); } c.stroke(); c.globalAlpha = 1;
  }
  function shaft(c, y0, y1, col, w) { w = w || 3.6; c.fillStyle = lin(c, -w / 2, 0, w / 2, 0, col || '#8a6038', shade(col || '#8a6038', 0.5)); c.fillRect(-w / 2, y0, w, y1 - y0); c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(-w / 2, y0, 1, y1 - y0); }
  function wrapBand(c, y, col) { c.fillStyle = col || GOLD; c.fillRect(-2.7, y, 5.4, 2.4); }

  /* ---------- the shapes: each paints the weapon pointing up and returns the anchor for its motif { x, y, r } ---------- */
  var SHAPES = {
    sword: function (c, B, A, X) { blade(c, { base: 5, tip: -29, w: 4.2 }, B, A); hilt(c, { base: 5, trim: X.trim }, A); return { x: 0, y: -12, r: 12 }; },
    great: function (c, B, A, X) { blade(c, { base: 6, tip: -32, w: 6.2 }, B, A); c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-1.6, -26); c.lineTo(-1.6, 3); c.moveTo(1.6, -26); c.lineTo(1.6, 3); c.stroke(); hilt(c, { base: 6, gw: 11.5, grip: 13, trim: X.trim }, A); return { x: 0, y: -12, r: 14 }; },
    scim: function (c, B, A, X) { blade(c, { base: 5, tip: -28, w: 4, curve: 1 }, B, A); hilt(c, { base: 5, gw: 7, trim: X.trim }, A); return { x: 3, y: -12, r: 12 }; },
    wavy: function (c, B, A, X) { blade(c, { base: 5, tip: -30, w: 3.6, wave: 1 }, B, A); hilt(c, { base: 5, gw: 9, trim: X.trim }, A); return { x: 0, y: -12, r: 12 }; },
    serr: function (c, B, A, X) { blade(c, { base: 5, tip: -29, w: 4, serr: 1 }, B, A); hilt(c, { base: 5, trim: X.trim }, A); return { x: 0, y: -12, r: 12 }; },
    dagger: function (c, B, A, X) { blade(c, { base: 3, tip: -20, w: 3.2 }, B, A); hilt(c, { base: 3, gw: 6.5, grip: 9, trim: X.trim, haft: X.haft }, A); return { x: 0, y: -8, r: 9 }; },
    kris: function (c, B, A, X) { blade(c, { base: 3, tip: -24, w: 2.7, wave: 1.1 }, B, A); hilt(c, { base: 3, gw: 5.5, grip: 8, trim: X.trim, haft: X.haft }, A); return { x: 0, y: -9, r: 10 }; },
    curved: function (c, B, A, X) { blade(c, { base: 3, tip: -22, w: 3.4, curve: 1.1 }, B, A); hilt(c, { base: 3, gw: 5.5, grip: 8, trim: X.trim, haft: X.haft }, A); return { x: 2, y: -9, r: 10 }; },
    pick: function (c, B, A, X) {
      blade(c, { base: 3, tip: -22, w: 1.7, tapered: 1 }, B, A); poly(c, [-3.4, -22, 5, -22, 5, -17, 1.6, -17, 1.6, -13, -0.4, -13, -0.4, -17, -3.4, -17], metalFill(c, B, 5), shade(B, 0.4), 0.7); // the teeth of a key
      hilt(c, { base: 3, gw: 5, grip: 8, trim: X.trim }, A); return { x: 0, y: -10, r: 9 };
    },
    cleaver: function (c, B, A, X) {
      shaft(c, -26, 26, '#6a4424', 3.6); wrapBand(c, 14, X.trim); wrapBand(c, 21, X.trim);
      c.beginPath(); c.moveTo(1.8, -27); c.lineTo(17, -26); c.quadraticCurveTo(21, -12, 14, 0); c.lineTo(1.8, -1); c.closePath(); c.fillStyle = lin(c, 2, -14, 20, -14, shade(B, 1.45), shade(B, 0.55)); c.fill(); c.lineWidth = 0.9; c.strokeStyle = shade(B, 0.35); c.stroke();
      ell(c, 11, -18, 2.3, 2.3, 'rgba(10,6,4,0.8)'); c.strokeStyle = A; c.globalAlpha = 0.7; c.lineWidth = 1.2; c.beginPath(); c.moveTo(16.5, -25); c.quadraticCurveTo(20.5, -12, 14, -1); c.stroke(); c.globalAlpha = 1;
      return { x: 10, y: -12, r: 10 };
    },
    axe: function (c, B, A, X) {
      shaft(c, -24, 27, '#6a4424', 3.6); wrapBand(c, -10, X.trim); wrapBand(c, 19, X.trim);
      c.beginPath(); c.moveTo(1.8, -25); c.bezierCurveTo(19, -28, 24, -8, 13, -1); c.lineTo(8, -8); c.lineTo(1.8, -9); c.closePath();
      c.fillStyle = lin(c, 2, -14, 22, -14, shade(B, 1.45), shade(B, 0.55)); c.fill(); c.lineWidth = 0.9; c.strokeStyle = shade(B, 0.35); c.stroke();
      c.strokeStyle = A; c.globalAlpha = 0.7; c.lineWidth = 1.2; c.beginPath(); c.moveTo(14, -24); c.bezierCurveTo(22, -16, 20, -8, 13, -2); c.stroke(); c.globalAlpha = 1;
      return { x: 12, y: -14, r: 11 };
    },
    daxe: function (c, B, A, X) {
      shaft(c, -26, 27, '#6a4424', 3.6); wrapBand(c, 19, X.trim);
      for (var s = -1; s <= 1; s += 2) {
        c.save(); c.scale(s, 1); c.beginPath(); c.moveTo(1.8, -23); c.bezierCurveTo(15, -30, 22, -10, 12, -2); c.lineTo(1.8, -7); c.closePath();
        c.fillStyle = lin(c, 2, -14, 22, -14, shade(B, 1.45), shade(B, 0.55)); c.fill(); c.lineWidth = 0.9; c.strokeStyle = shade(B, 0.35); c.stroke();
        c.strokeStyle = A; c.globalAlpha = 0.65; c.lineWidth = 1.1; c.beginPath(); c.moveTo(13, -22); c.bezierCurveTo(20, -14, 19, -8, 12, -3); c.stroke(); c.globalAlpha = 1; c.restore();
      }
      ell(c, 0, -14, 3, 3, X.trim, '#2a1a08', 0.7); return { x: 0, y: -14, r: 15 };
    },
    moonaxe: function (c, B, A, X) { // a crescent-moon bladed axe
      shaft(c, -20, 27, '#4a2a2a', 3.6); wrapBand(c, 19, X.trim);
      c.beginPath(); c.moveTo(1.8, -22); c.bezierCurveTo(24, -34, 28, 0, 1.8, 2); c.bezierCurveTo(14, -6, 14, -16, 1.8, -22); c.closePath();
      c.fillStyle = lin(c, 2, -14, 24, -14, shade(B, 1.5), shade(B, 0.6)); c.fill(); c.lineWidth = 0.9; c.strokeStyle = shade(B, 0.35); c.stroke();
      return { x: 12, y: -13, r: 11 };
    },
    mace: function (c, B, A, X) {
      shaft(c, -6, 26, '#6a4424', 3.6); wrapBand(c, 20, X.trim);
      for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4; poly(c, [Math.cos(a - 0.3) * 7.5, -14 + Math.sin(a - 0.3) * 7.5, Math.cos(a) * 13.4, -14 + Math.sin(a) * 13.4, Math.cos(a + 0.3) * 7.5, -14 + Math.sin(a + 0.3) * 7.5], shade(B, 1.4), shade(B, 0.4), 0.7); }
      ell(c, 0, -14, 8.6, 8.6, lin(c, -8, -20, 8, -8, shade(B, 1.5), shade(B, 0.5)), shade(B, 0.35), 1); glow(c, 0, -14, 7, ca(A, 0.4)); return { x: 0, y: -14, r: 13 };
    },
    maul: function (c, B, A, X) {
      shaft(c, -8, 28, '#5a3a20', 4); wrapBand(c, 20, X.trim); wrapBand(c, 12, X.trim);
      poly(c, [-14, -28, 14, -28, 15, -9, -15, -9], lin(c, -14, 0, 14, 0, shade(B, 1.35), shade(B, 0.5)), shade(B, 0.3), 1);
      c.fillStyle = shade(B, 0.45); c.fillRect(-14.5, -25, 29, 2.2); c.fillRect(-14.5, -13, 29, 2.2); c.fillStyle = X.trim; c.fillRect(-4, -28, 8, 19);
      ell(c, 0, -18.5, 3, 3, A, '#2a1a08', 0.6); glow(c, 0, -18.5, 9, ca(A, 0.4)); return { x: 0, y: -19, r: 15 };
    },
    spade: function (c, B, A, X) { // a gravedigger's spade
      shaft(c, -8, 27, '#6a4424', 3.6); poly(c, [-3, -8, 3, -8, 3, -3, -3, -3], X.trim, '#2a1a08', 0.6);
      c.beginPath(); c.moveTo(-8, -6); c.lineTo(8, -6); c.lineTo(8, -17); c.quadraticCurveTo(8, -32, 0, -34); c.quadraticCurveTo(-8, -32, -8, -17); c.closePath();
      c.fillStyle = lin(c, -8, 0, 8, 0, shade(B, 1.4), shade(B, 0.5)); c.fill(); c.lineWidth = 0.9; c.strokeStyle = shade(B, 0.3); c.stroke();
      c.fillStyle = 'rgba(80,50,20,0.45)'; c.fillRect(-7, -14, 14, 3); return { x: 0, y: -19, r: 11 };
    },
    spear: function (c, B, A, X) {
      shaft(c, -14, 28, '#7a5230', 3.2); wrapBand(c, 20, X.trim); c.fillStyle = A; c.fillRect(-2.6, -12, 5.2, 2.4);
      poly(c, [0, -32, 5.4, -19, 1.8, -13, -1.8, -13, -5.4, -19], lin(c, -5, 0, 5, 0, shade(B, 1.5), shade(B, 0.5)), shade(B, 0.3), 0.8);
      c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(-0.5, -29, 1, 13); return { x: 0, y: -20, r: 11 };
    },
    trident: function (c, B, A, X) {
      shaft(c, -14, 28, '#4a6a5a', 3.2); wrapBand(c, 20, X.trim); c.fillStyle = A; c.fillRect(-3, -14, 6, 2.4);
      c.strokeStyle = shade(B, 1.2); c.lineWidth = 2.4; c.lineCap = 'round'; c.beginPath(); c.moveTo(-8, -26); c.quadraticCurveTo(-8, -14, 0, -14); c.quadraticCurveTo(8, -14, 8, -26); c.stroke();
      c.lineWidth = 2.4; c.beginPath(); c.moveTo(0, -14); c.lineTo(0, -31); c.stroke();
      poly(c, [0, -35, 2.6, -29, -2.6, -29], shade(B, 1.5)); poly(c, [-8, -30, -5.6, -25, -10.4, -25], shade(B, 1.5)); poly(c, [8, -30, 10.4, -25, 5.6, -25], shade(B, 1.5));
      return { x: 0, y: -22, r: 12 };
    },
    bow: function (c, B, A, X) {
      c.strokeStyle = lin(c, -8, 0, 8, 0, shade(B, 1.4), shade(B, 0.5)); c.lineWidth = 3.8; c.lineCap = 'round'; c.beginPath(); c.moveTo(-2, -28); c.quadraticCurveTo(16, 0, -2, 28); c.stroke();
      c.strokeStyle = A; c.lineWidth = 1; c.globalAlpha = 0.8; c.beginPath(); c.moveTo(-2, -28); c.quadraticCurveTo(15, 0, -2, 28); c.stroke(); c.globalAlpha = 1;
      c.strokeStyle = '#f2ead0'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(-2, -28); c.lineTo(-2, 28); c.stroke();
      c.strokeStyle = '#d8c8a0'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-2, 0); c.lineTo(20, 0); c.stroke();
      poly(c, [24, 0, 18, -2.8, 18, 2.8], shade(B, 1.5), shade(B, 0.4), 0.6); c.fillStyle = A; c.beginPath(); c.moveTo(-2, 0); c.lineTo(-6, -2.6); c.lineTo(-6, 2.6); c.fill();
      c.strokeStyle = X.trim; c.lineWidth = 1.6; c.beginPath(); c.moveTo(7, -4.5); c.lineTo(7, 4.5); c.stroke(); return { x: 7, y: 0, r: 16, rot: 0 };
    },
    chakram: function (c, B, A, X) { // a spinning ring of blades
      var i, a; for (i = 0; i < 10; i++) { a = i * 0.6283; poly(c, [Math.cos(a - 0.2) * 14, Math.sin(a - 0.2) * 14, Math.cos(a) * 22, Math.sin(a) * 22, Math.cos(a + 0.2) * 14, Math.sin(a + 0.2) * 14], shade(B, 1.4), shade(B, 0.35), 0.7); }
      ell(c, 0, 0, 16.5, 16.5, null, shade(B, 1.3), 5); ell(c, 0, 0, 16.5, 16.5, null, shade(B, 0.4), 0.8); ell(c, 0, 0, 12, 12, null, A, 1.2); ell(c, 0, 0, 5, 5, X.trim, '#2a1a08', 0.7); ell(c, 0, 0, 1.8, 1.8, A);
      return { x: 0, y: 0, r: 20, rot: 0, flat: true };
    },
    orb: function (c, B, A, X) { // a floating sphere with a ring around it, no handle
      glow(c, 0, 0, 26, ca(A, 0.55)); var g = c.createRadialGradient(-4, -5, 1, 0, 0, 14); g.addColorStop(0, shade(B, 1.9)); g.addColorStop(0.5, B); g.addColorStop(1, shade(B, 0.25));
      ell(c, 0, 0, 14, 14, g, shade(B, 0.3), 1); c.save(); c.rotate(-0.5); c.strokeStyle = X.trim; c.lineWidth = 2.2; c.beginPath(); c.ellipse(0, 0, 21, 6.5, 0, 0, 6.2832); c.stroke(); c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 0.8; c.stroke(); c.restore();
      ell(c, -5, -6, 3.6, 2.2, 'rgba(255,255,255,0.55)'); return { x: 0, y: 0, r: 18, rot: 0, flat: true };
    }
  };

  /* staffs: a long shaft with a head. */
  function staffShaft(c, X) { shaft(c, -12, 30, X.haft || '#7a5230', 3.8); wrapBand(c, -9, X.trim); wrapBand(c, 21, X.trim); }
  function prongs(c, X, n) { c.strokeStyle = X.trim; c.lineWidth = 1.8; c.lineCap = 'round'; c.beginPath(); c.moveTo(-1.9, -10); c.quadraticCurveTo(-10, -14, -7, -26); c.moveTo(1.9, -10); c.quadraticCurveTo(10, -14, 7, -26); c.stroke(); }
  function gemball(c, x, y, r, col) { glow(c, x, y, r * 2.8, ca(col, 0.5)); var g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, 0.5, x, y, r); g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, col); g.addColorStop(1, shade(col, 0.4)); ell(c, x, y, r, r, g, shade(col, 0.4), 0.8); }
  var STAFF = {
    s_orb: function (c, B, A, X) { staffShaft(c, X); prongs(c, X); gemball(c, 0, -19, 6, A); return { x: 0, y: -19, r: 12 }; },
    s_crystal: function (c, B, A, X) { staffShaft(c, X); prongs(c, X); glow(c, 0, -21, 15, ca(A, 0.5)); poly(c, [0, -36, 6, -23, 0, -9, -6, -23], lin(c, -6, -30, 6, -12, '#ffffff', A), shade(A, 0.4), 0.8); poly(c, [0, -36, 6, -23, 0, -23], 'rgba(255,255,255,0.35)'); poly(c, [0, -9, -6, -23, 0, -23], 'rgba(0,0,0,0.2)'); return { x: 0, y: -22, r: 13 }; },
    s_crescent: function (c, B, A, X) { staffShaft(c, X); c.strokeStyle = lin(c, -9, 0, 9, 0, shade(B, 1.5), shade(B, 0.6)); c.lineWidth = 3.4; c.lineCap = 'round'; c.beginPath(); c.arc(0, -21, 9.5, 2.2, 0.94 + 3.14 * 0, false); c.stroke(); c.strokeStyle = X.trim; c.lineWidth = 1; c.stroke(); gemball(c, 0, -21, 4, A); return { x: 0, y: -21, r: 13 }; },
    s_spire: function (c, B, A, X) { staffShaft(c, X); prongs(c, X); glow(c, 0, -22, 15, ca(A, 0.55)); c.beginPath(); c.moveTo(0, -38); c.bezierCurveTo(9, -28, 8, -20, 5, -15); c.bezierCurveTo(3, -12, -3, -12, -5, -15); c.bezierCurveTo(-8, -20, -9, -28, 0, -38); c.fillStyle = lin(c, 0, -38, 0, -12, '#ffe9b0', A); c.fill(); c.lineWidth = 0.8; c.strokeStyle = shade(A, 0.5); c.stroke(); return { x: 0, y: -24, r: 13 }; },
    s_star: function (c, B, A, X) { staffShaft(c, X); glow(c, 0, -21, 16, ca(A, 0.55)); var pts = [], i; for (i = 0; i < 10; i++) { var r = i % 2 ? 4.2 : 11, a = -1.5708 + i * 0.6283; pts.push(Math.cos(a) * r, -22 + Math.sin(a) * r); } poly(c, pts, lin(c, 0, -33, 0, -11, '#ffffff', A), shade(A, 0.45), 0.8); ell(c, 0, -22, 2, 2, '#ffffff'); return { x: 0, y: -22, r: 14 }; },
    s_hour: function (c, B, A, X) {
      staffShaft(c, X); c.fillStyle = X.trim; c.fillRect(-9, -34, 18, 2.6); c.fillRect(-9, -14, 18, 2.6); c.strokeStyle = X.trim; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-8, -32); c.lineTo(-8, -14); c.moveTo(8, -32); c.lineTo(8, -14); c.stroke();
      poly(c, [-6, -32, 6, -32, 0.6, -23, 6, -14, -6, -14, -0.6, -23], 'rgba(200,230,255,0.28)', shade(A, 0.8), 0.8); poly(c, [-4.5, -31, 4.5, -31, 0, -24.5], A); poly(c, [-5, -15, 5, -15, 0, -19.5], A); c.fillStyle = A; c.fillRect(-0.5, -24.5, 1, 6); return { x: 0, y: -23, r: 12 };
    },
    s_skull: function (c, B, A, X) {
      staffShaft(c, X); glow(c, 0, -21, 15, ca(A, 0.4)); ell(c, 0, -22, 8, 7.4, lin(c, -8, -28, 8, -16, shade(B, 1.5), shade(B, 0.7)), shade(B, 0.35), 0.9); poly(c, [-4.6, -17, 4.6, -17, 3.4, -11.5, -3.4, -11.5], shade(B, 1.05), shade(B, 0.35), 0.8);
      ell(c, -3.1, -22, 2.3, 2.7, '#150a0a'); ell(c, 3.1, -22, 2.3, 2.7, '#150a0a'); ell(c, -3.1, -22, 1, 1.2, A); ell(c, 3.1, -22, 1, 1.2, A); poly(c, [0, -19.5, 1.2, -17.5, -1.2, -17.5], '#150a0a');
      c.strokeStyle = '#150a0a'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(-2, -16.5); c.lineTo(-2, -12.5); c.moveTo(0, -16.5); c.lineTo(0, -12.5); c.moveTo(2, -16.5); c.lineTo(2, -12.5); c.stroke(); return { x: 0, y: -22, r: 12 };
    },
    s_eye: function (c, B, A, X) {
      staffShaft(c, X); prongs(c, X); glow(c, 0, -20, 14, ca(A, 0.5)); c.beginPath(); c.moveTo(-10, -20); c.quadraticCurveTo(0, -31, 10, -20); c.quadraticCurveTo(0, -9, -10, -20); c.closePath(); c.fillStyle = '#efe6ff'; c.fill(); c.lineWidth = 1; c.strokeStyle = shade(A, 0.4); c.stroke();
      ell(c, 0, -20, 4.6, 4.6, lin(c, 0, -25, 0, -15, A, shade(A, 0.4)), '#0a0612', 0.8); ell(c, 0, -20, 1.9, 3.4, '#0a0612'); ell(c, -1.4, -21.5, 1, 1, 'rgba(255,255,255,0.85)'); return { x: 0, y: -20, r: 13 };
    },
    s_censer: function (c, B, A, X) {
      staffShaft(c, X); c.strokeStyle = X.trim; c.lineWidth = 1.6; c.beginPath(); c.moveTo(0, -12); c.lineTo(0, -16); c.moveTo(-8, -12); c.quadraticCurveTo(-9, -32, 0, -33); c.quadraticCurveTo(9, -32, 8, -12); c.stroke();
      ell(c, 0, -22, 6.6, 6.6, lin(c, -6, -26, 6, -18, shade(B, 1.5), shade(B, 0.5)), shade(B, 0.3), 0.9); c.fillStyle = 'rgba(10,8,4,0.7)'; for (var i = 0; i < 3; i++) ell(c, -2.6 + i * 2.6, -22 + (i % 2) * 2.4, 1, 1, 'rgba(10,8,4,0.8)'); c.fillStyle = A; c.globalAlpha = 0.55; ell(c, 0, -22, 2.4, 2.4, A); c.globalAlpha = 1; return { x: 0, y: -22, r: 13 };
    },
    s_crown: function (c, B, A, X) { // a crown of thorns
      staffShaft(c, X); prongs(c, X); var i, pts = [-9, -14]; for (i = 0; i < 5; i++) { pts.push(-9 + i * 4.5 + 1, -34 + (i % 2) * 6); pts.push(-9 + i * 4.5 + 3.5, -14 - (i % 2) * 0); } poly(c, [-8, -14, -8, -20, -6, -34, -3.6, -22, 0, -36, 3.6, -22, 6, -34, 8, -20, 8, -14], lin(c, 0, -36, 0, -14, shade(B, 1.45), shade(B, 0.5)), shade(B, 0.3), 0.8); gemball(c, 0, -20, 2.8, A); return { x: 0, y: -23, r: 13 };
    },
    s_bloom: function (c, B, A, X) {
      staffShaft(c, X); var i; for (i = 0; i < 6; i++) { c.save(); c.translate(0, -22); c.rotate(i * 1.0472); ell(c, 0, -8, 4.4, 8, lin(c, 0, -16, 0, 0, '#ffffff', A), shade(A, 0.4), 0.8); c.restore(); } gemball(c, 0, -22, 4.4, '#ffe9a0'); return { x: 0, y: -22, r: 14 };
    },
    s_scythe: function (c, B, A, X) {
      shaft(c, -26, 30, X.haft || '#6a5a4a', 3.6); wrapBand(c, 22, X.trim); c.beginPath(); c.moveTo(0, -27); c.bezierCurveTo(10, -38, 26, -30, 28, -14); c.bezierCurveTo(20, -26, 10, -26, 0, -22); c.closePath();
      c.fillStyle = lin(c, 0, -34, 24, -18, shade(B, 1.6), shade(B, 0.5)); c.fill(); c.lineWidth = 0.9; c.strokeStyle = shade(B, 0.3); c.stroke(); c.strokeStyle = A; c.globalAlpha = 0.6; c.lineWidth = 1; c.beginPath(); c.moveTo(2, -29); c.bezierCurveTo(12, -35, 22, -30, 26, -17); c.stroke(); c.globalAlpha = 1; return { x: 12, y: -27, r: 14 };
    },
    s_ring: function (c, B, A, X) { staffShaft(c, X); prongs(c, X); glow(c, 0, -22, 15, ca(A, 0.4)); ell(c, 0, -22, 8.5, 8.5, null, shade(B, 1.4), 3.6); ell(c, 0, -22, 8.5, 8.5, null, A, 1); gemball(c, 0, -22, 2.6, A); return { x: 0, y: -22, r: 13 }; }
  };
  /* wands */
  var WAND = {
    w_crystal: function (c, B, A, X) { poly(c, [-1.4, 26, 1.4, 26, 2.4, -8, -2.4, -8], lin(c, -2, 0, 2, 0, '#8a6038', '#3e2412'), '#24140a', 0.6); c.fillStyle = X.trim; c.fillRect(-2.8, 10, 5.6, 2.4); glow(c, 0, -16, 12, ca(A, 0.55)); poly(c, [0, -28, 5, -18, 0, -8, -5, -18], lin(c, -4, -24, 4, -10, '#ffffff', A), shade(A, 0.5), 0.8); poly(c, [0, -26, 2, -18, 0, -13, -1.8, -18], 'rgba(255,255,255,0.4)'); return { x: 0, y: -17, r: 11 }; },
    w_bone: function (c, B, A, X) {
      var bn = '#e8e0c8'; c.fillStyle = lin(c, -2, 0, 2, 0, shade(bn, 1.1), shade(bn, 0.6)); c.fillRect(-1.9, -12, 3.8, 38); ell(c, -2.4, 26, 2.4, 2.4, bn, shade(bn, 0.4), 0.6); ell(c, 2.4, 26, 2.4, 2.4, bn, shade(bn, 0.4), 0.6); ell(c, -2.4, -12, 2.4, 2.4, bn, shade(bn, 0.4), 0.6); ell(c, 2.4, -12, 2.4, 2.4, bn, shade(bn, 0.4), 0.6);
      c.fillStyle = X.trim; c.fillRect(-2.6, 8, 5.2, 2); c.strokeStyle = A; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-3, -13); c.quadraticCurveTo(-8, -18, -4, -23); c.moveTo(3, -13); c.quadraticCurveTo(8, -18, 4, -23); c.stroke(); gemball(c, 0, -20, 4.2, A); return { x: 0, y: -19, r: 11 };
    },
    w_reed: function (c, B, A, X) {
      c.save(); c.translate(0, 0); poly(c, [-2.2, -26, 2.2, -26, 2.8, 26, -2.8, 26], lin(c, -3, 0, 3, 0, shade(B, 1.4), shade(B, 0.55)), shade(B, 0.3), 0.8); poly(c, [-2.2, -26, 2.2, -26, 4, -30, -4, -30], shade(B, 1.1), shade(B, 0.3), 0.7); c.restore();
      for (var i = 0; i < 4; i++) ell(c, 0, -14 + i * 6, 1.1, 1.1, '#120a06'); c.fillStyle = X.trim; c.fillRect(-3.2, -20, 6.4, 1.8); c.fillRect(-3.2, 16, 6.4, 1.8); glow(c, 0, -30, 8, ca(A, 0.5)); return { x: 0, y: -26, r: 11 };
    }
  };
  for (var k in STAFF) SHAPES[k] = STAFF[k];
  for (k in WAND) SHAPES[k] = WAND[k];

  /* ---------- motifs: the decoration that makes each one itself ---------- */
  var seedv = 1; function rnd() { seedv = (seedv * 16807) % 2147483647; return seedv / 2147483647; }
  function flameAt(c, x, y, s, A) { c.beginPath(); c.moveTo(x, y - 7 * s); c.bezierCurveTo(x + 4.5 * s, y - 2 * s, x + 3.5 * s, y + 3 * s, x, y + 3.5 * s); c.bezierCurveTo(x - 3.5 * s, y + 3 * s, x - 4.5 * s, y - 2 * s, x, y - 7 * s); c.fillStyle = lin(c, x, y - 7 * s, x, y + 3.5 * s, '#fff2a8', A); c.fill(); }
  function sparkle(c, x, y, r, col) { poly(c, [x, y - r, x + r * 0.28, y - r * 0.28, x + r, y, x + r * 0.28, y + r * 0.28, x, y + r, x - r * 0.28, y + r * 0.28, x - r, y, x - r * 0.28, y - r * 0.28], col); }
  var MOTIF = {
    flame: function (c, a, A) { glow(c, a.x, a.y, a.r * 1.5, ca(A, 0.35)); flameAt(c, a.x + a.r * 0.7, a.y - a.r * 0.5, 1.1, A); flameAt(c, a.x - a.r * 0.65, a.y - a.r * 0.1, 0.8, A); flameAt(c, a.x + a.r * 0.5, a.y + a.r * 0.5, 0.65, A); flameAt(c, a.x, a.y - a.r * 1.1, 0.7, A); },
    frost: function (c, a, A) { glow(c, a.x, a.y, a.r * 1.4, ca(A, 0.3)); [[a.x + a.r * 0.75, a.y - a.r * 0.6, 4], [a.x - a.r * 0.7, a.y + a.r * 0.1, 3], [a.x + a.r * 0.5, a.y + a.r * 0.7, 2.4]].forEach(function (q) { c.strokeStyle = '#eafaff'; c.lineWidth = 0.9; c.beginPath(); for (var i = 0; i < 3; i++) { var an = i * 1.0472; c.moveTo(q[0] - Math.cos(an) * q[2], q[1] - Math.sin(an) * q[2]); c.lineTo(q[0] + Math.cos(an) * q[2], q[1] + Math.sin(an) * q[2]); } c.stroke(); }); },
    bolt: function (c, a, A) { glow(c, a.x, a.y, a.r * 1.4, ca(A, 0.3)); var y0 = a.y - a.r * 1.2, y1 = a.y + a.r * 0.9; [4.5, 0.8].forEach(function (w, i) { c.strokeStyle = i ? '#ffffff' : A; c.lineWidth = w; c.lineJoin = 'miter'; c.beginPath(); c.moveTo(a.x + 2, y0); c.lineTo(a.x - 3, y0 + (y1 - y0) * 0.35); c.lineTo(a.x + 2.5, y0 + (y1 - y0) * 0.45); c.lineTo(a.x - 3.5, y1); c.stroke(); }); c.lineJoin = 'round'; },
    skull: function (c, a, A) { var x = a.x + a.r * 0.35, y = a.y + a.r * 0.15; ell(c, x, y - 0.5, 4.6, 4.2, '#efe8d4', '#2a2218', 0.7); poly(c, [x - 2.6, y + 2, x + 2.6, y + 2, x + 1.9, y + 5.2, x - 1.9, y + 5.2], '#e0d8c0', '#2a2218', 0.6); ell(c, x - 1.7, y - 0.8, 1.3, 1.5, '#150a0a'); ell(c, x + 1.7, y - 0.8, 1.3, 1.5, '#150a0a'); ell(c, x - 1.7, y - 0.8, 0.5, 0.6, A); ell(c, x + 1.7, y - 0.8, 0.5, 0.6, A); },
    eye: function (c, a, A) { var x = a.x, y = a.y; glow(c, x, y, 8, ca(A, 0.4)); c.beginPath(); c.moveTo(x - 6.5, y); c.quadraticCurveTo(x, y - 6.5, x + 6.5, y); c.quadraticCurveTo(x, y + 6.5, x - 6.5, y); c.closePath(); c.fillStyle = '#f2e8ff'; c.fill(); c.lineWidth = 0.9; c.strokeStyle = '#1a1020'; c.stroke(); ell(c, x, y, 2.7, 2.7, A, '#0a0612', 0.6); ell(c, x, y, 1, 1.9, '#0a0612'); },
    rune: function (c, a, A) { glow(c, a.x, a.y, a.r, ca(A, 0.3)); c.strokeStyle = A; c.lineWidth = 1.5; c.lineCap = 'round'; c.beginPath(); c.moveTo(a.x - 2, a.y - 8); c.lineTo(a.x + 1, a.y - 5); c.lineTo(a.x - 2, a.y - 2); c.moveTo(a.x + 1, a.y); c.lineTo(a.x - 2, a.y + 3); c.lineTo(a.x + 2, a.y + 6); c.moveTo(a.x - 3, a.y - 1); c.lineTo(a.x + 3, a.y - 1); c.stroke(); c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 0.5; c.stroke(); },
    vine: function (c, a, A) { c.strokeStyle = '#4a8a3a'; c.lineWidth = 1.5; c.lineCap = 'round'; c.beginPath(); c.moveTo(a.x - 4, a.y + a.r); c.bezierCurveTo(a.x + 6, a.y + a.r * 0.4, a.x - 6, a.y - a.r * 0.3, a.x + 3, a.y - a.r * 1.1); c.stroke(); for (var i = 0; i < 4; i++) { var ly = a.y + a.r * (0.8 - i * 0.55), lx = a.x + (i % 2 ? 4 : -4); c.save(); c.translate(lx, ly); c.rotate(i % 2 ? 0.7 : -0.7 + 3.14); ell(c, 2.4, 0, 3.2, 1.5, '#6ac04a', '#2a5a1a', 0.5); c.restore(); } gemball(c, a.x + 3, a.y - a.r * 1.1, 1.8, A); },
    web: function (c, a, A) { c.strokeStyle = ca('#ffffff', 0.7); c.lineWidth = 0.6; var x = a.x + a.r * 0.4, y = a.y, i, j; for (i = 0; i < 6; i++) { var an = i * 1.0472; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(an) * 9, y + Math.sin(an) * 9); c.stroke(); } for (j = 1; j <= 3; j++) { c.beginPath(); for (i = 0; i <= 6; i++) { var an2 = i * 1.0472, rr = j * 3 + (i % 2) * 0.0; if (!i) c.moveTo(x + Math.cos(an2) * rr, y + Math.sin(an2) * rr); else c.lineTo(x + Math.cos(an2) * rr, y + Math.sin(an2) * rr); } c.stroke(); } ell(c, x + 6, y + 6, 1.4, 1.4, A); },
    star: function (c, a, A) { glow(c, a.x, a.y, a.r * 1.3, ca(A, 0.3)); sparkle(c, a.x + a.r * 0.75, a.y - a.r * 0.6, 5, '#ffffff'); sparkle(c, a.x + a.r * 0.75, a.y - a.r * 0.6, 3, A); sparkle(c, a.x - a.r * 0.7, a.y + a.r * 0.35, 3.4, '#ffffff'); sparkle(c, a.x + a.r * 0.2, a.y + a.r * 0.9, 2.4, A); },
    drip: function (c, a, A) { for (var i = 0; i < 3; i++) { var x = a.x + (i - 1) * a.r * 0.5 + 3, y = a.y + a.r * 0.5 + i * 2.2; c.beginPath(); c.moveTo(x, y - 3.4); c.quadraticCurveTo(x + 2.6, y + 0.6, x, y + 2.6); c.quadraticCurveTo(x - 2.6, y + 0.6, x, y - 3.4); c.fillStyle = A; c.fill(); ell(c, x - 0.6, y, 0.5, 0.8, 'rgba(255,255,255,0.6)'); } },
    wind: function (c, a, A) { c.strokeStyle = ca(A, 0.85); c.lineWidth = 1.3; c.lineCap = 'round'; for (var i = 0; i < 3; i++) { var y = a.y - a.r * 0.7 + i * a.r * 0.6, x = a.x + a.r * 0.55; c.beginPath(); c.moveTo(x - 4, y); c.bezierCurveTo(x + 2, y - 3.4, x + 8, y + 3.2, x + 6 + i * 2, y - 1.4); c.stroke(); } },
    stitch: function (c, a, A) { var x = a.x + a.r * 0.3, y = a.y - a.r * 0.6; c.strokeStyle = '#d8c8a8'; c.lineWidth = 1; c.beginPath(); c.moveTo(x - 3, y); c.lineTo(x + 3, y + a.r * 1.2); c.stroke(); c.strokeStyle = A; c.lineWidth = 1.3; for (var i = 0; i < 4; i++) { var yy = y + 1.4 + i * a.r * 0.28, xx = x - 3 + (yy - y) * 0.5; c.beginPath(); c.moveTo(xx - 2.4, yy - 1.5); c.lineTo(xx + 2.4, yy + 1.5); c.moveTo(xx + 2.4, yy - 1.5); c.lineTo(xx - 2.4, yy + 1.5); c.stroke(); } },
    moon: function (c, a, A) { glow(c, a.x, a.y, a.r * 1.4, ca(A, 0.3)); var x = a.x + a.r * 0.6, y = a.y - a.r * 0.4; ell(c, x, y, 5.6, 5.6, null, A, 1.4); ell(c, x + 1.6, y, 4.6, 5.2, 'rgba(10,8,16,0.9)'); },
    spade: function (c, a, A) { var x = a.x, y = a.y - a.r * 0.15; c.beginPath(); c.moveTo(x, y - 6); c.bezierCurveTo(x + 9, y + 1, x + 4, y + 7, x + 0.8, y + 3.6); c.lineTo(x + 2, y + 8); c.lineTo(x - 2, y + 8); c.lineTo(x - 0.8, y + 3.6); c.bezierCurveTo(x - 4, y + 7, x - 9, y + 1, x, y - 6); c.fillStyle = A; c.fill(); c.lineWidth = 0.6; c.strokeStyle = '#0a0a0a'; c.stroke(); },
    ghost: function (c, a, A) { c.globalAlpha = 0.6; for (var i = 0; i < 3; i++) { var x = a.x + (i - 1) * a.r * 0.6, y = a.y - a.r * 0.5 + (i % 2) * a.r * 0.8; c.beginPath(); c.moveTo(x, y - 4); c.quadraticCurveTo(x + 4, y - 3, x + 3.4, y + 2); c.lineTo(x + 1.8, y + 1); c.lineTo(x, y + 3); c.lineTo(x - 1.8, y + 1); c.lineTo(x - 3.4, y + 2); c.quadraticCurveTo(x - 4, y - 3, x, y - 4); c.fillStyle = A; c.fill(); } c.globalAlpha = 1; },
    prism: function (c, a, A) { var cols = ['#ff5a5a', '#ffb84a', '#fff04a', '#5aff8a', '#4ab8ff', '#b06aff']; for (var i = 0; i < 6; i++) { var an = i * 1.0472; ell(c, a.x + Math.cos(an) * a.r * 0.8, a.y + Math.sin(an) * a.r * 0.8, 1.9, 1.9, cols[i]); } sparkle(c, a.x, a.y, 4, '#ffffff'); },
    none: function () {}
  };

  /* ---------- the table: [shape, metal, accent, motif, extras] ---------- */
  var SPECS = {
    // swordsman
    'Emberfang': ['sword', '#e0d8c8', '#ff7a1a', 'flame'], 'Dawnbreaker': ['sword', '#fff0b8', '#ffc83a', 'star', { trim: '#fff0a0' }], 'Stormbrand': ['sword', '#d4e6ff', '#5ac8ff', 'bolt'],
    'Oathsplitter': ['great', '#b8c2d4', '#e8c878', 'rune'], "Gravelord's Edge": ['sword', '#7a7a70', '#a0906a', 'rune'], 'Kingsbane': ['great', '#f0e0a0', '#d63a3a', 'star', { trim: '#e8c040' }],
    'Hollow Tree Cleaver': ['cleaver', '#8a9a74', '#58a844', 'vine'], 'Skullcrusher': ['axe', '#a09a90', '#e8e0c8', 'skull'], 'Ragewind': ['daxe', '#d0d8e0', '#6ae0c8', 'wind'],
    'Bloodmoon Reaper': ['moonaxe', '#a82430', '#ff4a4a', 'drip'], 'Thunderhead': ['mace', '#929cb0', '#9ad8ff', 'bolt'], 'Ironvow': ['mace', '#5e6678', '#d6aa4a', 'rune'],
    'Sunforged Maul': ['maul', '#f0b848', '#fff0a0', 'star', { trim: '#fff0b0' }], "Warlord's Edge": ['serr', '#a8b0c0', '#d63a3a', 'rune'],
    // wizard
    'Archmage Focus': ['s_orb', '#c8b078', '#7a9cff', 'rune', { trim: '#e8c878' }], 'Stormcaller Rod': ['s_crystal', '#8a94a8', '#ffe84a', 'bolt'], 'Mana Thorn': ['w_crystal', '#8a6a4a', '#3a8aff', 'vine'],
    'Rimefall Staff': ['s_crystal', '#8ab0c8', '#8ae0ff', 'frost', { trim: '#d0f0ff' }], 'Twinflame Wand': ['w_crystal', '#8a6a4a', '#ff6a2a', 'flame'], 'Cinderspire': ['s_spire', '#5a3a30', '#ff5a1a', 'flame'],
    'Prism Crook': ['s_crescent', '#d8d0e8', '#ff9ad8', 'prism'], 'Voidlens': ['orb', '#2a1a4a', '#9a5aff', 'eye', { trim: '#7a5ad0' }], 'Aetherwhip': ['w_reed', '#8adce8', '#7ae8ff', 'wind'],
    "Glacier's Heart": ['s_crystal', '#bfeaff', '#dff6ff', 'frost', { trim: '#e8f8ff', haft: '#8aa8c0' }], 'Thunderstaff of Vael': ['s_crystal', '#c8b040', '#fff04a', 'bolt'], 'Starfall Scepter': ['s_star', '#d8b868', '#ffe08a', 'star'],
    'Hourglass Rod': ['s_hour', '#d8b060', '#f8e8a0', 'none'], 'The Last Word': ['s_eye', '#e8e0ff', '#ffffff', 'rune', { trim: '#e0d8ff', haft: '#b8b0d0' }],
    // necromancer
    'Gravewhisper': ['w_bone', '#e0d8c0', '#7aff9a', 'skull'], "Gravedigger's Spade": ['spade', '#8a8a7a', '#c8a050', 'none'], 'Bonechoir Rod': ['w_bone', '#e8e0c8', '#d0c8a0', 'ghost'],
    'Hexbone Wand': ['w_bone', '#d8d0b8', '#c04aff', 'rune'], 'Marrow Lash': ['w_bone', '#d8c0b0', '#d63a3a', 'drip'], 'Deathbinder': ['s_ring', '#6a5a7a', '#a04aff', 'rune', { trim: '#a898c0' }],
    'Ghoulpiper': ['w_reed', '#8aa070', '#7aff6a', 'ghost'], 'Soulwell Scythe': ['s_scythe', '#9ab8c8', '#7affd8', 'ghost', { haft: '#4a5a6a' }], "Nightwarden's Reach": ['s_eye', '#3a3a5a', '#9a7aff', 'none', { trim: '#7a6ab0', haft: '#3a3050' }],
    'Plague Censer': ['s_censer', '#7a9a3a', '#b0e84a', 'ghost', { trim: '#a8c050' }], 'Sepulcher Staff': ['s_skull', '#d0c8b0', '#8aff9a', 'none', { haft: '#5a5a4a' }], 'Memento Mori': ['w_crystal', '#c8c8c0', '#a0a0a0', 'skull', { trim: '#e0e0d8' }],
    "Lich's Phylactery": ['orb', '#38d8c0', '#a0fff0', 'ghost', { trim: '#c8c0a0' }], 'Worm-Eaten Regalia': ['s_crown', '#a8883a', '#9ad04a', 'vine', { haft: '#4a3a1a' }],
    // thief
    'Nightfang': ['dagger', '#50506a', '#8a6aff', 'moon', { haft: '#2a2030' }], "Locksmith's Pick": ['pick', '#cfcfd8', '#e8c878', 'none'], "Gutter Saint's Kris": ['kris', '#b8b8c0', '#d63a3a', 'drip'],
    'Whisperkiss': ['dagger', '#a8e0a8', '#60e860', 'drip'], "Cutpurse's Delight": ['dagger', '#f0c848', '#fff0a0', 'star', { trim: '#fff0a0' }], 'Venomtongue': ['kris', '#78b84a', '#b8ff30', 'drip'],
    'Shadowstep Shiv': ['dagger', '#30303f', '#7a6aff', 'wind', { haft: '#1a1a24' }], 'Ace of Spades': ['dagger', '#2e2e34', '#f0f0f0', 'spade', { trim: '#d8d8d8' }], 'Mirage Edge': ['curved', '#d0c0f0', '#e8a8ff', 'wind'],
    'Hailstorm Daggers': ['dagger', '#d0f4ff', '#8ad8ff', 'frost'], 'Eclipse Fang': ['curved', '#20202c', '#ffd24a', 'moon'], 'Silent Requiem': ['dagger', '#44444e', '#c8c8dc', 'wind', { haft: '#222228' }],
    'Razorwind Chakram': ['chakram', '#d0d8e0', '#6ae0c8', 'wind'], 'Widowmaker': ['bow', '#5a3a50', '#d63a3a', 'web'],
    // bound to a boss
    "Grinmask's Rictus Blade": ['sword', '#ded6c4', '#e8e0a0', 'skull'], 'Stitchblade': ['sword', '#aaa294', '#d04a3a', 'stitch'], 'Drowned Trident': ['trident', '#4a9a9a', '#6ae8d8', 'drip'],
    "Hearthkeeper's Poker": ['mace', '#4e3e34', '#ff8a2a', 'flame'], 'Emberheart Brand': ['sword', '#b02a14', '#ff9a2a', 'flame'],
    // bound to a night stalker
    'Rictus Fang': ['dagger', '#e8e0c8', '#e8e0a0', 'skull', { haft: '#cfc6a8' }], "Puppet Butcher's Cleaver": ['cleaver', '#8c8c94', '#d63a3a', 'stitch'], 'Thread-Reaper': ['s_scythe', '#d8b8e8', '#ffd0ff', 'web', { haft: '#6a4a7a' }],
    "Widow's Sting": ['dagger', '#2e1a30', '#c04aff', 'web', { haft: '#1a1020' }], 'Choir Reed': ['w_reed', '#e8d0a0', '#ff9ad0', 'wind'], 'Bloomstaff': ['s_bloom', '#6a8a4a', '#ff6aa8', 'vine', { haft: '#5a7a3a' }],
    "Hound's Fang": ['curved', '#ecd8b8', '#ff6a1a', 'flame', { haft: '#8a5a30' }], 'Gloomreach': ['spear', '#42425a', '#8a8aff', 'eye', { trim: '#7a7aa8' }], 'Gravemaw Maul': ['maul', '#6c5c4c', '#b0d030', 'skull', { trim: '#8a8a5a' }]
  };
  LA.SPECS = SPECS;
  LA.has = function (name) { return !!SPECS[name]; };

  function build(name, noAura) {
    var s = SPECS[name]; if (!s) return null;
    var cv = document.createElement('canvas'); cv.width = cv.height = U * SS;
    var c = cv.getContext('2d'); c.scale(SS, SS); c.translate(U / 2, U / 2 + 1); c.lineJoin = 'round'; c.lineCap = 'round';
    var X = s[4] || {}; if (!X.trim) X.trim = GOLD;
    seedv = 7 + name.length * 13;
    if (!noAura) glow(c, 0, -2, 31, ca(s[2], 0.28)); // the legendary aura
    c.save();
    var flat = /^(bow|chakram|orb)$/.test(s[0]);
    if (!flat) c.rotate(0.62 + (/^(s_|spear|trident|w_)/.test(s[0]) ? 0.1 : 0));
    c.scale(flat ? 0.95 : 0.9, flat ? 0.95 : 0.9);
    if (s[0] === 'sword' || s[0] === 'great' || s[0] === 'wavy' || s[0] === 'serr' || s[0] === 'scim') c.translate(0, 1);
    var anchor = SHAPES[s[0]](c, s[1], s[2], X);
    (MOTIF[s[3]] || MOTIF.none)(c, anchor, s[2]);
    c.restore();
    return cv;
  }
  LA.sprite = function (name) { if (!SPECS[name]) return null; return cache[name] || (cache[name] = build(name)); };
  LA.shadow = function (name) {
    if (shadows[name]) return shadows[name];
    var src = SPECS[name] && build(name, true); if (!src) return null;
    var sc = src.getContext('2d'), id = sc.getImageData(0, 0, src.width, src.height), d = id.data, q; for (q = 3; q < d.length; q += 4) d[q] = d[q] > 110 ? 255 : 0; sc.putImageData(id, 0, 0); // a hard edge: no glow in the silhouette
    var w = src.width, h = src.height, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    var c = cv.getContext('2d'), t = document.createElement('canvas'), tc, i, o = [[-2.6, 0], [2.6, 0], [0, -2.6], [0, 2.6], [-1.9, -1.9], [1.9, 1.9], [-1.9, 1.9], [1.9, -1.9]];
    t.width = w; t.height = h; tc = t.getContext('2d'); tc.drawImage(src, 0, 0); tc.globalCompositeOperation = 'source-in'; tc.fillStyle = '#0a0705'; tc.fillRect(0, 0, w, h); // the flat dark shape
    var ol = document.createElement('canvas'); ol.width = w; ol.height = h; var oc = ol.getContext('2d');
    for (i = 0; i < o.length; i++) oc.drawImage(t, o[i][0], o[i][1]);
    oc.globalCompositeOperation = 'source-in'; oc.fillStyle = 'rgba(150,126,96,0.55)'; oc.fillRect(0, 0, w, h); // faint outline
    c.drawImage(ol, 0, 0); c.drawImage(t, 0, 0);
    return (shadows[name] = cv);
  };
})(typeof window !== 'undefined' ? window : globalThis);
