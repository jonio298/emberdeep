/* skillscreen.js - THE TABLET OF ASCENSION: the Skills screen, redrawn as an ancient carved stone tablet.
 *
 * Three tablets across the top, in Roman numerals:
 *   I   PASSIVES   the rune tree: Offense, Defense, Utility and the class Mastery, plus the repeatable Training coins
 *   II  ABILITIES  the four seals (keys Q E R T) and the five abilities that can be bound to them, with each ability's upgrade runes
 *   III CHARGES    what holding does: the ATK charge attack you bind, and every ability's HOLD version at a glance
 * Everything is drawn in code: procedural stone grain, bevelled slabs, chiselled (engraved) lettering, and the runes themselves are line art
 * (Elder Futhark shapes) so nothing depends on a font that might not have them. Ranks, levels and seals are Roman numerals.
 *
 * Flow: tap a rune/ability/charge to read its inscription; tap it again (or INSCRIBE) to learn it. In ABILITIES pick an ability, then tap a seal to bind it.
 * Keys 1 / 2 / 3 switch tablets while the screen is open.
 *
 * API (CC.SkillScreen): draw(c, addHit, x, y, w, h, p, U)   key(code)   hubFrame(c,x,y,w,h)   hubTab(c,x,y,w,h,on,hover,label,numeral)
 *   roman(n)  rune(c,name,cx,cy,size,color,glow,lineWidth)  state()  setTab(id)  RUNE_NAMES
 * U (from ui.js): { mouse:{x,y}, clock:seconds, close:fn }. Reads CC.SkillTree, CC.Skills, CC.SpellPairs, CC.SpellCharge.
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, S = CC.SkillScreen = {}, TAU = Math.PI * 2;
  var FONT = 'Georgia, "Palatino Linotype", "Book Antiqua", serif';
  var GOLD = '#e8b04a', GOLD2 = '#ffd98a', LOCK = '#6f675a', RED = '#b0604f', GOOD = '#9be36b', DIM = '#8f8576', TEXT = '#e6dcc6';
  var st = { tab: 'passives', sel: null, ab: null, chg: null, flash: {}, toast: null };

  /* ---------- small helpers ---------- */
  var ROMANS = [[90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  function roman(n) {
    n = Math.floor(+n || 0);
    if (n <= 0) return '0';
    var out = '', i;
    while (n >= 100) { out += 'C'; n -= 100; }
    for (i = 0; i < ROMANS.length; i++) while (n >= ROMANS[i][0]) { out += ROMANS[i][1]; n -= ROMANS[i][0]; }
    return out;
  }
  function hash(s) { var h = 7; s = String(s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function now() { return Date.now() / 1000; }
  function rrPath(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  function hovering(U, x, y, w, h) { var m = U && U.mouse; return !!(m && m.x >= x && m.x < x + w && m.y >= y && m.y < y + h); }
  function hex(col, a) { // '#rrggbb' -> rgba(); any other string passes through
    if (typeof col !== 'string' || col.charAt(0) !== '#' || col.length !== 7) return col;
    return 'rgba(' + parseInt(col.slice(1, 3), 16) + ',' + parseInt(col.slice(3, 5), 16) + ',' + parseInt(col.slice(5, 7), 16) + ',' + a + ')';
  }

  /* ---------- stone: a cached grain tile, bevelled slabs, chiselled lettering ---------- */
  var grain = null, veins = null;
  function lcg(seed) { return function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
  function canvasOf(n) { var cv = root.document && root.document.createElement('canvas'); if (!cv) return null; cv.width = cv.height = n; return cv; }
  // gritty speckle: neutral grey with hard light and dark flecks, blended with 'overlay' so it adds texture without washing the stone out
  function grainTile() {
    if (grain !== null) return grain;
    grain = false;
    try {
      var cv = canvasOf(96), g = cv && cv.getContext('2d'); if (!g) return grain;
      var rnd = lcg(12345), i;
      g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, 96, 96);
      for (i = 0; i < 1100; i++) { var v = rnd() < 0.55 ? 0 : 255; g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (0.1 + rnd() * 0.3) + ')'; g.fillRect(rnd() * 96, rnd() * 96, 0.8 + rnd() * 2, 0.8 + rnd() * 1.6); }
      g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1;
      for (i = 0; i < 6; i++) { var px = rnd() * 96, py = rnd() * 96; g.beginPath(); g.moveTo(px, py); for (var s2 = 0; s2 < 4; s2++) { px += (rnd() - 0.5) * 26; py += (rnd() - 0.2) * 20; g.lineTo(px, py); } g.stroke(); }
      grain = cv;
    } catch (e) { grain = false; }
    return grain;
  }
  // marble: pale veins that wander and branch (drawn three times shifted so the tile repeats without a seam) over dark cloudy patches
  function veinTile() {
    if (veins !== null) return veins;
    veins = false;
    try {
      var N = 192, cv = canvasOf(N), g = cv && cv.getContext('2d'); if (!g) return veins;
      var rnd = lcg(777), i, ox, oy, k;
      for (i = 0; i < 9; i++) { // dark cloudy patches
        var cx = rnd() * N, cy = rnd() * N, r = 28 + rnd() * 46;
        for (ox = -N; ox <= N; ox += N) for (oy = -N; oy <= N; oy += N) {
          var gr = g.createRadialGradient(cx + ox, cy + oy, 1, cx + ox, cy + oy, r); gr.addColorStop(0, 'rgba(0,0,0,0.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(cx + ox - r, cy + oy - r, r * 2, r * 2);
        }
      }
      function vein(x, y, ang, len, w, a, depth) {
        var pts = [[x, y]], steps = 9, j;
        for (j = 0; j < steps; j++) { ang += (rnd() - 0.5) * 0.9; x += Math.cos(ang) * len / steps; y += Math.sin(ang) * len / steps; pts.push([x, y]); }
        for (ox = -N; ox <= N; ox += N) for (oy = -N; oy <= N; oy += N) {
          g.lineCap = 'round'; g.lineJoin = 'round';
          g.strokeStyle = 'rgba(0,0,0,' + a * 0.9 + ')'; g.lineWidth = w + 1.2; g.beginPath(); // a dark shadow edge under the pale vein
          for (k = 0; k < pts.length; k++) { if (k) g.lineTo(pts[k][0] + ox + 0.8, pts[k][1] + oy + 0.8); else g.moveTo(pts[k][0] + ox + 0.8, pts[k][1] + oy + 0.8); } g.stroke();
          g.strokeStyle = 'rgba(214,208,196,' + a + ')'; g.lineWidth = w; g.beginPath();
          for (k = 0; k < pts.length; k++) { if (k) g.lineTo(pts[k][0] + ox, pts[k][1] + oy); else g.moveTo(pts[k][0] + ox, pts[k][1] + oy); } g.stroke();
        }
        if (depth < 2) for (j = 2; j < pts.length - 1; j += 3) if (rnd() < 0.8) vein(pts[j][0], pts[j][1], ang + (rnd() < 0.5 ? 1 : -1) * (0.5 + rnd() * 0.8), len * 0.45, w * 0.6, a * 0.8, depth + 1);
      }
      for (i = 0; i < 5; i++) vein(rnd() * N, rnd() * N, rnd() * TAU, 150 + rnd() * 90, 0.9 + rnd() * 1.1, 0.16 + rnd() * 0.16, 0);
      veins = cv;
    } catch (e) { veins = false; }
    return veins;
  }
  // kind: 'raised' (a proud slab), 'inset' (cut into the stone), 'flat'
  function slab(c, x, y, w, h, r, kind, tint) {
    var raised = kind === 'raised', inset = kind === 'inset', g;
    rrPath(c, x, y, w, h, r);
    g = c.createLinearGradient(0, y, 0, y + h);
    if (inset) { g.addColorStop(0, '#0b0a09'); g.addColorStop(1, '#171512'); }
    else if (raised) { g.addColorStop(0, '#3c3934'); g.addColorStop(0.55, '#262421'); g.addColorStop(1, '#171614'); }
    else { g.addColorStop(0, '#272521'); g.addColorStop(1, '#161513'); }
    c.fillStyle = g; c.fill();
    var tile = grainTile(), vt = veinTile();
    if (tile || vt) {
      c.save(); rrPath(c, x, y, w, h, r); c.clip();
      if (tile) { try { c.globalCompositeOperation = 'overlay'; c.globalAlpha = inset ? 0.9 : 0.75; c.fillStyle = c.createPattern(tile, 'repeat'); c.fillRect(x, y, w, h); c.globalCompositeOperation = 'source-over'; } catch (e) { /* plain slab */ } }
      if (vt) { try { c.globalAlpha = inset ? 0.55 : 0.85; c.save(); c.translate(x * 0.37, y * 0.37); c.fillStyle = c.createPattern(vt, 'repeat'); c.fillRect(x - x * 0.37, y - y * 0.37, w, h); c.restore(); } catch (e) { /* no veins */ } }
      c.restore();
    }
    if (tint) { rrPath(c, x, y, w, h, r); c.fillStyle = tint; c.fill(); }
    // bevel: light on the top-left edge, shadow on the bottom-right (reversed for an inset)
    var b = c.createLinearGradient(x, y, x + w, y + h);
    b.addColorStop(0, inset ? 'rgba(0,0,0,0.8)' : 'rgba(235,228,214,0.26)'); b.addColorStop(0.5, 'rgba(0,0,0,0.15)'); b.addColorStop(1, inset ? 'rgba(235,228,214,0.14)' : 'rgba(0,0,0,0.85)');
    rrPath(c, x + 0.75, y + 0.75, w - 1.5, h - 1.5, r); c.lineWidth = 1.6; c.strokeStyle = b; c.stroke();
  }
  function setSpacing(c, px) { if ('letterSpacing' in c) c.letterSpacing = px ? px + 'px' : '0px'; }
  // chiselled text: a dark cut above, a pale lip below, then the paint
  function carve(c, s, x, y, px, col, align, weight, spacing) {
    c.save(); c.font = (weight || 'bold') + ' ' + px + 'px ' + FONT; c.textAlign = align || 'left'; c.textBaseline = 'middle'; setSpacing(c, spacing || 0);
    c.fillStyle = 'rgba(255,238,205,0.16)'; c.fillText(s, x, y + 1);
    c.fillStyle = 'rgba(0,0,0,0.75)'; c.fillText(s, x, y - 0.5);
    c.fillStyle = col; c.fillText(s, x, y + 0.2);
    c.restore();
  }
  function plain(c, s, x, y, px, col, align, weight) { c.save(); c.font = (weight || 'normal') + ' ' + px + 'px ' + FONT; c.textAlign = align || 'left'; c.textBaseline = 'middle'; setSpacing(c, 0); c.fillStyle = col; c.fillText(s, x, y); c.restore(); }
  function wrap(c, s, maxW, px, weight) {
    c.save(); c.font = (weight || 'normal') + ' ' + px + 'px ' + FONT;
    var words = String(s).split(' '), line = '', out = [], i, t;
    for (i = 0; i < words.length; i++) { t = line ? line + ' ' + words[i] : words[i]; if (c.measureText(t).width > maxW && line) { out.push(line); line = words[i]; } else line = t; }
    out.push(line); c.restore(); return out;
  }
  function paragraph(c, s, x, y, maxW, lh, px, col, maxLines) {
    var lines = wrap(c, s, maxW, px), i;
    if (maxLines && lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '...'; }
    for (i = 0; i < lines.length; i++) plain(c, lines[i], x, y + i * lh, px, col);
    return lines.length;
  }
  function fit(c, s, maxW, px, weight) {
    c.save(); c.font = (weight || 'bold') + ' ' + px + 'px ' + FONT;
    var out = String(s);
    while (out.length > 2 && c.measureText(out).width > maxW) out = out.slice(0, -2);
    c.restore();
    return out.length < String(s).length ? out + '.' : out;
  }

  /* ---------- runes: Elder Futhark line art in a unit box (x -0.5..0.5, y -1..1) ---------- */
  var RUNES = {
    fehu: [[0, -1, 0, 1], [0, -0.45, 0.5, -0.95], [0, 0, 0.5, -0.5]],
    uruz: [[-0.35, 1, -0.35, -1, 0.35, -0.5, 0.35, 1]],
    thurisaz: [[-0.1, -1, -0.1, 1], [-0.1, -0.5, 0.45, 0, -0.1, 0.5]],
    ansuz: [[-0.2, -1, -0.2, 1], [-0.2, -0.8, 0.4, -0.4], [-0.2, -0.2, 0.4, 0.2]],
    raido: [[-0.25, -1, -0.25, 1], [-0.25, -1, 0.35, -0.45, -0.25, 0, 0.35, 1]],
    kenaz: [[0.35, -0.6, -0.25, 0, 0.35, 0.6]],
    gebo: [[-0.4, -0.9, 0.4, 0.9], [0.4, -0.9, -0.4, 0.9]],
    wunjo: [[-0.2, -1, -0.2, 1], [-0.2, -1, 0.35, -0.5, -0.2, 0]],
    hagalaz: [[-0.3, -1, -0.3, 1], [0.3, -1, 0.3, 1], [-0.3, -0.3, 0.3, 0.3]],
    nauthiz: [[0, -1, 0, 1], [-0.4, -0.35, 0.4, 0.35]],
    isa: [[0, -1, 0, 1]],
    jera: [[-0.3, -0.7, 0.1, -0.3, -0.3, 0.1], [0.3, 0.1, -0.1, 0.5, 0.3, 0.9]],
    eihwaz: [[0, -1, 0, 1], [0, -1, 0.35, -0.6], [0, 1, -0.35, 0.6]],
    perthro: [[-0.3, -1, -0.3, 1], [-0.3, -1, 0.3, -0.55, -0.3, -0.1], [-0.3, 0.1, 0.3, 0.55, -0.3, 1]],
    algiz: [[0, -1, 0, 1], [0, -0.1, -0.45, -0.7], [0, -0.1, 0.45, -0.7]],
    sowilo: [[0.3, -1, -0.3, -0.35, 0.3, 0.35, -0.3, 1]],
    tiwaz: [[0, 1, 0, -1], [-0.4, -0.5, 0, -1, 0.4, -0.5]],
    berkano: [[-0.3, -1, -0.3, 1], [-0.3, -1, 0.3, -0.5, -0.3, 0, 0.3, 0.5, -0.3, 1]],
    ehwaz: [[-0.35, -1, -0.35, 1], [0.35, -1, 0.35, 1], [-0.35, -1, 0, -0.45, 0.35, -1]],
    mannaz: [[-0.35, -1, -0.35, 1], [0.35, -1, 0.35, 1], [-0.35, -1, 0.35, 0], [0.35, -1, -0.35, 0]],
    laguz: [[-0.2, -1, -0.2, 1], [-0.2, -1, 0.3, -0.5]],
    ingwaz: [[0, -0.9, 0.45, 0, 0, 0.9, -0.45, 0, 0, -0.9]],
    dagaz: [[-0.4, -0.8, -0.4, 0.8, 0.4, -0.8, 0.4, 0.8, -0.4, -0.8]],
    othala: [[0, -1, 0.45, -0.3, 0, 0.3, -0.45, -0.3, 0, -1], [-0.45, 0.9, 0, 0.3, 0.45, 0.9]]
  };
  var RUNE_NAMES = Object.keys(RUNES);
  var CLASS_RUNE = { swordsman: 'tiwaz', wizard: 'ansuz', necromancer: 'hagalaz', thief: 'sowilo' };
  function rune(c, name, cx, cy, size, color, glow, lw) {
    var g = RUNES[name] || RUNES[RUNE_NAMES[hash(name) % RUNE_NAMES.length]], i, j, pts;
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = color; c.lineWidth = lw || Math.max(1.4, size * 0.11);
    if (glow) { c.shadowColor = glow; c.shadowBlur = Math.max(4, size * 0.6); }
    for (i = 0; i < g.length; i++) {
      pts = g[i]; c.beginPath(); c.moveTo(cx + pts[0] * size * 0.7, cy + pts[1] * size);
      for (j = 2; j < pts.length; j += 2) c.lineTo(cx + pts[j] * size * 0.7, cy + pts[j + 1] * size);
      c.stroke();
    }
    c.restore();
  }
  function runeFor(id) { return RUNE_NAMES[hash(id) % RUNE_NAMES.length]; }
  // a band of small runes: the carved border of the tablet
  function runeBand(c, x, y, w, size, color, seedKey) {
    var n = Math.max(3, Math.floor(w / (size * 1.5))), step = w / n, i;
    for (i = 0; i < n; i++) rune(c, RUNE_NAMES[(hash(seedKey) + i * 7) % RUNE_NAMES.length], x + step * (i + 0.5), y, size * 0.5, color, null, 1);
  }

  /* ---------- the medallion: one rune set in a stone ring ---------- */
  function shapePath(c, cx, cy, R, shape) {
    c.beginPath();
    if (shape === 'diamond') { c.moveTo(cx, cy - R * 1.18); c.lineTo(cx + R * 1.18, cy); c.lineTo(cx, cy + R * 1.18); c.lineTo(cx - R * 1.18, cy); c.closePath(); }
    else c.arc(cx, cy, R, 0, TAU);
  }
  // o: state 'lock' | 'avail' | 'own' | 'max', shape, rune, col (class colour), sel, ring (extra coloured ring), t
  function medal(c, cx, cy, R, o) {
    var state = o.state, g, col = o.col || GOLD2, t = o.t || 0, shape = o.shape || 'round';
    c.save();
    c.fillStyle = 'rgba(0,0,0,0.38)'; shapePath(c, cx + 1, cy + 2.5, R + 1.5, shape); c.fill(); // cast shadow
    g = c.createLinearGradient(cx - R, cy - R, cx + R, cy + R); g.addColorStop(0, '#6b6557'); g.addColorStop(0.5, '#3f3b33'); g.addColorStop(1, '#201d19');
    shapePath(c, cx, cy, R + 1.5, shape); c.fillStyle = g; c.fill(); // the ring
    c.lineWidth = 1; c.strokeStyle = 'rgba(0,0,0,0.65)'; c.stroke();
    var inner = R * 0.76;
    g = c.createRadialGradient(cx, cy - inner * 0.3, 1, cx, cy, inner * 1.2);
    if (state === 'own' || state === 'max') { g.addColorStop(0, hex(col, 0.55)); g.addColorStop(1, '#17120f'); }
    else if (state === 'avail') { g.addColorStop(0, 'rgba(232,176,74,0.28)'); g.addColorStop(1, '#171410'); }
    else { g.addColorStop(0, '#26231e'); g.addColorStop(1, '#12100d'); }
    shapePath(c, cx, cy, inner, shape); c.fillStyle = g; c.fill(); // the recess
    c.lineWidth = 1.2; c.strokeStyle = 'rgba(0,0,0,0.8)'; c.stroke();
    shapePath(c, cx, cy, inner + 1, shape); c.lineWidth = 0.8; c.strokeStyle = 'rgba(255,240,205,0.16)'; c.stroke();
    var rc = state === 'max' ? GOLD2 : state === 'own' ? '#fff3d6' : state === 'avail' ? GOLD : LOCK;
    var glowCol = state === 'max' ? GOLD : state === 'own' ? col : state === 'avail' ? GOLD : null;
    var pulse = state === 'avail' ? 0.65 + 0.35 * Math.sin(t * 4) : 1;
    c.globalAlpha = state === 'lock' ? 0.75 : pulse;
    rune(c, o.rune, cx, cy, inner * 0.62, rc, glowCol, Math.max(1.4, R * 0.11));
    c.globalAlpha = 1;
    if (o.ring) { shapePath(c, cx, cy, R + 3, shape); c.lineWidth = 1.4; c.strokeStyle = hex(o.ring, 0.85); c.stroke(); }
    if (state === 'avail') { c.globalAlpha = 0.3 + 0.35 * Math.sin(t * 4); shapePath(c, cx, cy, R + 4.5, shape); c.lineWidth = 2; c.strokeStyle = GOLD; c.stroke(); c.globalAlpha = 1; }
    if (o.sel) { // a turning ring of dashes
      c.strokeStyle = '#fff3d6'; c.lineWidth = 1.6; c.setLineDash && c.setLineDash([4, 4]); c.lineDashOffset = -t * 14;
      shapePath(c, cx, cy, R + 6.5, shape); c.stroke(); c.setLineDash && c.setLineDash([]);
    }
    c.restore();
  }
  function flashRing(c, id, cx, cy, R) {
    var f = st.flash[id]; if (!f) return;
    var u = (now() - f) / 0.7; if (u >= 1) { delete st.flash[id]; return; }
    c.save(); c.globalAlpha = 1 - u; c.strokeStyle = '#fff3d6'; c.lineWidth = 2.5 * (1 - u) + 0.5; c.beginPath(); c.arc(cx, cy, R + 4 + u * 28, 0, TAU); c.stroke(); c.restore();
  }
  function markFlash(id) { st.flash[id] = now(); }

  /* ---------- carved grooves between runes ---------- */
  function groove(c, x1, y1, x2, y2, level, col, t) { // level 0 dormant, 1 reachable, 2 inscribed
    c.save(); c.lineCap = 'round';
    c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 4; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    c.strokeStyle = 'rgba(255,240,205,0.12)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x1 + 1.6, y1); c.lineTo(x2 + 1.6, y2); c.stroke();
    if (level > 0) {
      c.strokeStyle = level === 2 ? hex(col, 0.95) : 'rgba(232,176,74,0.55)'; c.lineWidth = level === 2 ? 2 : 1.4;
      if (level === 2) { c.shadowColor = col; c.shadowBlur = 6; }
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.shadowBlur = 0;
      if (level === 2) { var u = (t * 0.7) % 1; c.fillStyle = '#fff3d6'; c.beginPath(); c.arc(x1 + (x2 - x1) * u, y1 + (y2 - y1) * u, 1.6, 0, TAU); c.fill(); }
    }
    c.restore();
  }

  /* ---------- the stone button ---------- */
  function stoneButton(c, hit, U, x, y, w, h, label, enabled, cb, glow) {
    var hov = enabled && hovering(U, x, y, w, h);
    slab(c, x, y, w, h, 6, enabled ? 'raised' : 'inset', hov ? 'rgba(255,230,160,0.13)' : null);
    if (enabled) { c.save(); c.globalAlpha = 0.35 + 0.25 * Math.sin(now() * 3.2); c.strokeStyle = glow || GOLD; c.lineWidth = 1.4; rrPath(c, x + 2, y + 2, w - 4, h - 4, 4); c.stroke(); c.restore(); }
    carve(c, label, x + w / 2, y + h / 2 + 0.5, 11, enabled ? (glow || GOLD2) : '#5e574c', 'center', 'bold', 1);
    if (enabled && hit) hit(x, y, w, h, cb);
  }
  function say(U, s) { st.toast = { s: s, t: now() }; if (U && U.say) U.say(s); }

  /* ---------- hub frame and tabs (used by ui.js for the whole character window) ---------- */
  S.hubFrame = function (c, x, y, w, h) {
    slab(c, x, y, w, h, 10, 'raised');
    c.save(); rrPath(c, x + 5, y + 5, w - 10, h - 10, 7); c.lineWidth = 1; c.strokeStyle = 'rgba(0,0,0,0.6)'; c.stroke(); // the chiselled inner margin
    rrPath(c, x + 6.5, y + 6.5, w - 13, h - 13, 6); c.strokeStyle = 'rgba(255,240,205,0.12)'; c.stroke(); c.restore();
    var i, pts = [[x + 9, y + 9], [x + w - 9, y + 9], [x + 9, y + h - 9], [x + w - 9, y + h - 9]];
    for (i = 0; i < 4; i++) { c.fillStyle = '#17140f'; c.beginPath(); c.arc(pts[i][0], pts[i][1], 2.6, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,225,160,0.4)'; c.beginPath(); c.arc(pts[i][0] - 0.6, pts[i][1] - 0.6, 1, 0, TAU); c.fill(); } // rivets
  };
  S.hubTab = function (c, x, y, w, h, on, hover, label, numeral) {
    slab(c, x, y + (on ? 0 : 2), w, h - (on ? 0 : 2), 5, on ? 'raised' : 'inset', hover && !on ? 'rgba(255,230,160,0.1)' : null);
    if (on) { c.fillStyle = GOLD; c.fillRect(x + 6, y + h - 3, w - 12, 2); c.save(); c.shadowColor = GOLD; c.shadowBlur = 6; c.fillRect(x + 6, y + h - 3, w - 12, 1); c.restore(); }
    var cy = y + h / 2 + (on ? 0 : 1);
    var px = clamp((w - 8) / (label.length * 0.66), 6.5, 10);
    if (w > 78 && numeral) { carve(c, numeral, x + 7, cy, 8, on ? GOLD : '#5e574c', 'left', 'bold', 0); carve(c, label, x + w / 2 + 5, cy, Math.min(px, 9.5), on ? GOLD2 : DIM, 'center', 'bold', 0.4); }
    else carve(c, label, x + w / 2, cy, px, on ? GOLD2 : DIM, 'center', 'bold', 0.2);
  };

  /* ---------- shared data ---------- */
  function ST() { return CC.SkillTree; }
  function SK() { return CC.Skills; }
  function classColor(p) { return p && p.color || GOLD2; }
  function nodeState(p, nd) {
    var rk = ST().rank(p, nd.id), ok = ST().canBuy(p, nd.id).ok;
    return rk >= nd.max ? 'max' : rk > 0 ? 'own' : ok ? 'avail' : 'lock';
  }
  function anyAffordable(p) {
    var ST1 = ST(), SK1 = SK(), pts = ST1.points(p), out = { passives: false, abilities: false };
    if (pts < 1) return out;
    ST1.nodes(p.classId).forEach(function (nd) { if (ST1.canBuy(p, nd.id).ok) out.passives = true; });
    if (SK1 && SK1.TRAIN) SK1.TRAIN.forEach(function (t) { if (SK1.canTrain(p, t).ok) out.passives = true; });
    if (SK1 && SK1.list) SK1.list(p.classId).forEach(function (a) { SK1.KEYS.forEach(function (k) { if (SK1.canBuy(p, a.id, k).ok) out.abilities = true; }); });
    return out;
  }

  /* ---------- header and the three tablets ---------- */
  function header(c, hit, U, x, y, w, p) {
    var t = now(), pts = ST().points(p), cc = classColor(p), cls = String(p.classId || 'hero');
    slab(c, x, y, w, 36, 6, 'inset');
    medal(c, x + 21, y + 18, 12, { state: 'own', rune: CLASS_RUNE[cls] || 'othala', col: cc, t: t });
    carve(c, cls.toUpperCase(), x + 42, y + 13, 13, cc, 'left', 'bold', 1.5);
    carve(c, 'LEVEL ' + roman(p.level || 1), x + 42, y + 27, 9, DIM, 'left', 'bold', 1);
    var ox = x + w - 22;
    medal(c, ox, y + 18, 12, { state: pts > 0 ? 'avail' : 'lock', rune: 'fehu', col: GOLD, t: t });
    carve(c, pts > 0 ? roman(pts) : '0', ox, y + 18 + 0.5, pts > 0 ? 8 : 10, pts > 0 ? '#fff3d6' : DIM, 'center', 'bold', 0);
    carve(c, pts > 0 ? 'RUNES TO INSCRIBE' : 'NO RUNES TO SPEND', ox - 19, y + 18, 8.5, pts > 0 ? GOLD2 : DIM, 'right', 'bold', 0.8);
  }
  var TABS = [['passives', 'PASSIVES', 'I'], ['abilities', 'ABILITIES', 'II'], ['charges', 'CHARGES', 'III']];
  function tabs(c, hit, U, x, y, w, p) {
    var tw = (w - 8) / 3, mark = anyAffordable(p), t = now();
    TABS.forEach(function (tb, i) {
      var tx = x + i * (tw + 4), on = st.tab === tb[0], hov = hovering(U, tx, y, tw, 30);
      slab(c, tx, y + (on ? 0 : 3), tw, on ? 32 : 29, 6, on ? 'raised' : 'inset', hov && !on ? 'rgba(255,230,160,0.1)' : null);
      if (on) { c.save(); c.fillStyle = classColor(p); c.shadowColor = classColor(p); c.shadowBlur = 8; c.fillRect(tx + 8, y + 30, tw - 16, 2); c.restore(); }
      var cy = y + (on ? 16 : 18.5);
      carve(c, tb[2], tx + 9, cy, 9, on ? GOLD : '#5e574c', 'left', 'bold', 0);
      carve(c, tw < 96 ? tb[1].slice(0, 6) : tb[1], tx + tw / 2 + 5, cy, tw < 96 ? 9 : 10.5, on ? GOLD2 : DIM, 'center', 'bold', 1);
      if (mark[tb[0]] && !on) { c.fillStyle = 'rgba(232,176,74,' + (0.6 + 0.4 * Math.sin(t * 4)) + ')'; c.beginPath(); c.arc(tx + tw - 9, y + 9, 3, 0, TAU); c.fill(); }
      hit(tx, y, tw, 32, function () { st.tab = tb[0]; });
    });
  }

  /* ---------- I. PASSIVES ---------- */
  function detailBox(c, x, y, w, h, o) { // the inscription: a big rune, title, subtitle, text, status line
    slab(c, x, y, w, h, 7, 'inset');
    medal(c, x + 28, y + 30, 19, { state: o.state, rune: o.rune, col: o.col, shape: o.shape, t: now() });
    carve(c, fit(c, o.title, w - 150, 14), x + 58, y + 15, 14, o.state === 'lock' ? DIM : GOLD2, 'left', 'bold', 0.8);
    carve(c, o.sub, x + 58, y + 31, 9, DIM, 'left', 'bold', 0.8);
    paragraph(c, o.text, x + 12, y + 54, w - 24 - (o.button ? 92 : 0), 13, 11, TEXT, 3);
    if (o.status) plain(c, o.status, x + 12, y + h - 11, 10, o.ok ? GOOD : '#b8806c', 'left', 'bold');
  }
  function passives(c, hit, U, x, y, w, h, p) {
    var T = ST(), K = SK(), t = now(), cc = classColor(p), list = T.nodes(p.classId), byId = {}, colW = w / 4;
    list.forEach(function (nd) { byId[nd.id] = nd; });
    var detailH = 98, gap = 6, treeY = y, treeH = h - detailH - gap;
    var titleH = 18, rowsY = treeY + titleH + 4, rowH = clamp((treeH - titleH - 10) / 6, 30, 62), R = clamp(Math.min(colW * 0.3, rowH * 0.36), 11, 19);
    slab(c, x, treeY, w, treeH, 7, 'flat');
    var i;
    for (i = 0; i < 4; i++) { carve(c, T.colTitle(p.classId, i).toUpperCase(), x + colW * (i + 0.5), treeY + 10, 9, i === 3 ? cc : DIM, 'center', 'bold', 1.2); }
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(x + 8, treeY + 19, w - 16, 1); c.fillStyle = 'rgba(255,240,205,0.12)'; c.fillRect(x + 8, treeY + 20, w - 16, 1);
    function pos(nd) { return { x: x + colW * (nd.col + 0.5), y: rowsY + nd.tier * rowH + R + 3 }; }
    list.forEach(function (nd) { // grooves first
      if (!nd.parent) return;
      var a = pos(byId[nd.parent]), b = pos(nd), lvl = T.rank(p, nd.parent) > 0 ? (T.rank(p, nd.id) > 0 ? 2 : 1) : 0;
      groove(c, a.x, a.y + R, b.x, b.y - R, lvl, cc, t);
    });
    // the training coins live under the three shared columns, in the empty space the shorter trees leave
    var trainRows = [], trainBox = { x: x + 6, y: rowsY + 4 * rowH + 2, w: colW * 3 - 12, h: rowH * 2 - 6 };
    if (K && K.TRAIN) {
      slab(c, trainBox.x, trainBox.y, trainBox.w, trainBox.h, 6, 'inset');
      carve(c, 'TRAINING  ·  REPEATABLE', trainBox.x + trainBox.w / 2, trainBox.y + 9, 8.5, DIM, 'center', 'bold', 1);
      var per = 4, cw = trainBox.w / per, cr = clamp(Math.min(cw * 0.3, (trainBox.h - 34) / 5), 8, 13);
      K.TRAIN.forEach(function (tr, k) {
        var row = Math.floor(k / per), col = k % per, cx = trainBox.x + cw * (col + 0.5), cy = trainBox.y + 22 + cr + row * (cr * 2 + 13);
        var r = (p.skills && p.skills.ranks['t:' + tr.id]) || 0, can = K.canTrain(p, tr).ok, state = r >= tr.max ? 'max' : r > 0 ? 'own' : can ? 'avail' : 'lock';
        var on = st.sel && st.sel.k === 't' && st.sel.id === tr.id;
        medal(c, cx, cy, cr, { state: can && r > 0 ? 'avail' : state, rune: runeFor('t:' + tr.id), col: cc, sel: on, t: t });
        flashRing(c, 't:' + tr.id, cx, cy, cr);
        carve(c, fit(c, tr.name.toUpperCase(), cw - 2, 6.5), cx, cy + cr + 7, 6.5, r > 0 ? GOLD2 : '#6a6256', 'center', 'bold', 0);
        if (r > 0) carve(c, roman(r), cx + cr + 1, cy - cr + 1, 7.5, GOLD2, 'left', 'bold', 0);
        hit(cx - cr - 5, cy - cr - 4, cr * 2 + 10, cr * 2 + 16, function () {
          if (on && can) { if (K.train(p, tr)) markFlash('t:' + tr.id); } else st.sel = { k: 't', id: tr.id };
        });
        trainRows.push(tr);
      });
    }
    list.forEach(function (nd) { // runes
      var ps = pos(nd), state = nodeState(p, nd), rk = T.rank(p, nd.id), on = st.sel && st.sel.k === 'n' && st.sel.id === nd.id;
      medal(c, ps.x, ps.y, R, { state: state, rune: runeFor(nd.id), col: cc, shape: nd.capstone ? 'diamond' : 'round', ring: nd.mastery ? cc : null, sel: on, t: t });
      flashRing(c, nd.id, ps.x, ps.y, R);
      if (rk === 0 && (p.level || 1) < nd.lvl) carve(c, 'LVL ' + roman(nd.lvl), ps.x, ps.y + R + 8.5, 7.5, '#8a5a4c', 'center', 'bold', 0);
      else carve(c, rk >= nd.max ? 'MAX' : roman(rk) + ' / ' + roman(nd.max), ps.x, ps.y + R + 8.5, 7.5, rk >= nd.max ? GOLD : rk > 0 ? GOLD2 : '#5e574c', 'center', 'bold', 0);
      hit(ps.x - R - 6, ps.y - R - 6, (R + 6) * 2, (R + 6) * 2 + 12, function () {
        if (on && T.canBuy(p, nd.id).ok) { if (T.buy(p, nd.id)) markFlash(nd.id); } else st.sel = { k: 'n', id: nd.id };
      });
    });
    // the inscription at the bottom
    var dy = y + h - detailH, sel = st.sel;
    if (sel && sel.k === 't' && K) {
      var tr = K.TRAIN.filter(function (q) { return q.id === sel.id; })[0];
      if (tr) {
        var r2 = (p.skills && p.skills.ranks['t:' + tr.id]) || 0, cb = K.canTrain(p, tr), allowed = K.trainMax(p, tr);
        detailBox(c, x, dy, w, detailH, { state: r2 >= tr.max ? 'max' : r2 > 0 ? 'own' : cb.ok ? 'avail' : 'lock', rune: runeFor('t:' + tr.id), col: cc, title: tr.name.toUpperCase(), sub: 'TRAINING  ·  RANK ' + roman(r2) + ' OF ' + roman(allowed) + (allowed < tr.max ? '  (MAX ' + roman(tr.max) + ')' : ''),
          text: tr.desc + '. Each rank opens at a higher level, so power grows with you.', status: cb.ok ? 'Costs one rune.' : cb.reason, ok: cb.ok, button: true });
        stoneButton(c, hit, U, x + w - 90, dy + detailH - 36, 80, 28, r2 >= tr.max ? 'MAXED' : 'TRAIN', cb.ok, function () { if (K.train(p, tr)) markFlash('t:' + tr.id); });
        return;
      }
    }
    var nd2 = sel && sel.k === 'n' && byId[sel.id];
    if (!nd2) {
      slab(c, x, dy, w, detailH, 7, 'inset');
      carve(c, 'TAP A RUNE TO READ ITS INSCRIPTION', x + w / 2, dy + 30, 10.5, GOLD2, 'center', 'bold', 1);
      plain(c, 'Glowing runes can be learned now. Tap it again to inscribe it.', x + w / 2, dy + 54, 10, DIM, 'center');
      plain(c, 'Lower runes need the one above them first.', x + w / 2, dy + 70, 10, DIM, 'center');
      return;
    }
    var chk = T.canBuy(p, nd2.id), rk2 = T.rank(p, nd2.id);
    detailBox(c, x, dy, w, detailH, { state: nodeState(p, nd2), rune: runeFor(nd2.id), col: cc, shape: nd2.capstone ? 'diamond' : 'round', title: nd2.name.toUpperCase(),
      sub: (nd2.capstone ? 'CAPSTONE  ·  ' : nd2.mastery ? T.colTitle(p.classId, 3).toUpperCase() + '  ·  ' : T.colTitle(p.classId, nd2.col).toUpperCase() + '  ·  ') + 'RANK ' + roman(rk2) + ' OF ' + roman(nd2.max) + '  ·  LVL ' + roman(nd2.lvl),
      text: nd2.desc, status: chk.ok ? 'Costs one rune.' : chk.reason, ok: chk.ok, button: true });
    stoneButton(c, hit, U, x + w - 90, dy + detailH - 36, 80, 28, rk2 >= nd2.max ? 'MAXED' : 'INSCRIBE', chk.ok, function () { if (T.buy(p, nd2.id)) markFlash(nd2.id); });
  }

  /* ---------- II. ABILITIES ---------- */
  var KEYCAPS = ['Q', 'E', 'R', 'T'];
  function abilities(c, hit, U, x, y, w, h, p) {
    var Sk = SK(), t = now(), cc = classColor(p);
    if (!Sk || !Sk.list) { plain(c, 'Abilities unavailable', x + w / 2, y + h / 2, 12, DIM, 'center'); return; }
    Sk.ensure(p);
    var lst = Sk.list(p.classId), AB = Sk.AB;
    if (!st.ab || !AB[st.ab] || AB[st.ab].cls !== p.classId) st.ab = lst[0].id;
    var a = AB[st.ab], locked = (p.level || 1) < a.lvl, bound = p.slots.indexOf(a.id), yy = y;
    // the four seals
    carve(c, 'THE FOUR SEALS', x + 4, yy + 6, 9, DIM, 'left', 'bold', 1.2);
    plain(c, locked ? 'This ability is not yet unlocked.' : bound >= 0 ? 'Tap another seal to move ' + a.name + '.' : 'Tap a seal to bind ' + a.name + '.', x + w - 4, yy + 6, 9, locked ? '#b8806c' : GOLD, 'right', 'bold');
    yy += 14;
    var sw = (w - 3 * 5) / 4, sh = 52;
    for (var k = 0; k < 4; k++) (function (k) {
      var sx = x + k * (sw + 5), id = p.slots[k], ab = AB[id], here = id === a.id, canBind = !locked && !here;
      slab(c, sx, yy, sw, sh, 7, 'inset', here ? hex(cc, 0.12) : null);
      if (canBind) { c.save(); c.globalAlpha = 0.35 + 0.35 * Math.sin(t * 4 + k); c.strokeStyle = GOLD; c.lineWidth = 1.6; c.setLineDash && c.setLineDash([3, 3]); rrPath(c, sx + 2, yy + 2, sw - 4, sh - 4, 5); c.stroke(); c.setLineDash && c.setLineDash([]); c.restore(); }
      carve(c, roman(k + 1), sx + 8, yy + 9, 9, GOLD, 'left', 'bold', 0);
      carve(c, KEYCAPS[k], sx + sw - 8, yy + 9, 8, '#5e574c', 'right', 'bold', 0);
      if (ab) {
        var lockedHere = (p.level || 1) < ab.lvl;
        medal(c, sx + sw / 2, yy + 26, 11, { state: lockedHere ? 'lock' : 'own', rune: runeFor(ab.id), col: ab.col, t: t });
        carve(c, fit(c, ab.name.toUpperCase(), sw - 6, 8, 'bold'), sx + sw / 2, yy + sh - 6, 8, here ? GOLD2 : DIM, 'center', 'bold', 0.3);
      } else {
        c.save(); c.strokeStyle = '#4a443a'; c.lineWidth = 1.5; c.setLineDash && c.setLineDash([3, 3]); c.beginPath(); c.arc(sx + sw / 2, yy + 26, 10, 0, TAU); c.stroke(); c.setLineDash && c.setLineDash([]); c.restore();
        carve(c, 'EMPTY', sx + sw / 2, yy + sh - 6, 8, '#5e574c', 'center', 'bold', 0.5);
      }
      hit(sx, yy, sw, sh, function () {
        if (canBind) { if (Sk.assign(p, k, a.id)) { say(U, a.name.toUpperCase() + ' SEALED IN ' + roman(k + 1)); st.flash['slot' + k] = now(); } }
        else if (ab) st.ab = ab.id;
      });
      flashRing(c, 'slot' + k, sx + sw / 2, yy + 26, 12);
    })(k);
    yy += sh + 10;
    // the five abilities
    carve(c, 'KNOWN ABILITIES', x + 4, yy + 5, 9, DIM, 'left', 'bold', 1.2);
    yy += 13;
    var tw = (w - 4 * 4) / 5, th = 64;
    lst.forEach(function (ab, i) {
      var tx2 = x + i * (tw + 4), lk = (p.level || 1) < ab.lvl, on = ab.id === st.ab, slot = p.slots.indexOf(ab.id);
      slab(c, tx2, yy + (on ? 0 : 2), tw, on ? th : th - 2, 6, on ? 'raised' : 'inset', hovering(U, tx2, yy, tw, th) && !on ? 'rgba(255,230,160,0.08)' : null);
      if (on) { c.save(); c.fillStyle = cc; c.shadowColor = cc; c.shadowBlur = 8; c.fillRect(tx2 + 6, yy + th - 3, tw - 12, 2); c.restore(); }
      medal(c, tx2 + tw / 2, yy + 20, 11, { state: lk ? 'lock' : on ? 'max' : 'own', rune: runeFor(ab.id), col: ab.col, t: t });
      var sp = ab.name.indexOf(' '), l1 = sp > 0 ? ab.name.slice(0, sp) : ab.name, l2 = sp > 0 ? ab.name.slice(sp + 1) : '';
      carve(c, fit(c, l1.toUpperCase(), tw - 4, 7.5), tx2 + tw / 2, yy + 38, 7.5, on ? GOLD2 : DIM, 'center', 'bold', 0);
      if (l2) carve(c, fit(c, l2.toUpperCase(), tw - 4, 7.5), tx2 + tw / 2, yy + 47, 7.5, on ? GOLD2 : DIM, 'center', 'bold', 0);
      carve(c, lk ? 'LVL ' + roman(ab.lvl) : slot >= 0 ? 'SEAL ' + roman(slot + 1) : 'UNBOUND', tx2 + tw / 2, yy + 57, 7, lk ? '#8a5a4c' : slot >= 0 ? GOOD : '#5e574c', 'center', 'bold', 0);
      hit(tx2, yy, tw, th, function () { st.ab = ab.id; });
    });
    yy += th + 8;
    // the chosen ability: tap and hold
    var pr = CC.SpellPairs && CC.SpellPairs.get ? CC.SpellPairs.get(a.id) : null;
    var hi = !pr && a.orig && CC.SpellCharge && CC.SpellCharge.heldInfo ? CC.SpellCharge.heldInfo(p.classId, a.orig) : null;
    var infoH = 62;
    slab(c, x, yy, w, infoH, 7, 'inset');
    carve(c, fit(c, a.name.toUpperCase(), w - 150, 13), x + 10, yy + 12, 13, a.col, 'left', 'bold', 1);
    plain(c, a.cost + ' mana  ·  ' + a.cd + 's', x + w - 10, yy + 12, 9.5, DIM, 'right', 'bold');
    rune(c, 'isa', x + 15, yy + 30, 5, GOLD2, null, 1.6); // tap: a single mark
    paragraph(c, (pr && pr.tapDesc) || a.desc, x + 28, yy + 30, w - 38, 11, 10, TEXT, 2);
    c.save(); c.strokeStyle = GOLD2; c.lineWidth = 1.5; c.beginPath(); c.arc(x + 15, yy + 50, 4.2, 0, TAU); c.stroke(); c.restore(); // hold: a ring
    var holdTxt = pr ? (pr.chargeName || pr.name) + ': ' + (pr.chargeDesc || 'a stronger version') : hi ? hi.name + ': aim it' + (hi.mult ? ', +' + Math.round((hi.mult - 1) * 100) + '% damage' : '') : 'A stronger version of this ability.';
    paragraph(c, holdTxt, x + 28, yy + 50, w - 38, 11, 10, a.col, 2);
    yy += infoH + 6;
    // upgrade runes
    var avail = y + h - yy - 16, rh = clamp(avail / 5, 25, 40);
    Sk.KEYS.forEach(function (key, n) {
      var nd = Sk.NODE[key], r = Sk.rank(p, a.id, key), cb = Sk.canBuy(p, a.id, key), ry = yy + n * rh;
      slab(c, x, ry, w, rh - 3, 6, 'inset');
      var state = r >= nd.max ? 'max' : r > 0 ? 'own' : cb.ok ? 'avail' : 'lock', cy = ry + (rh - 3) / 2;
      medal(c, x + 16, cy, Math.min(11, (rh - 6) / 2), { state: state, rune: runeFor(a.id + key), col: a.col, shape: key === 'ult' ? 'diamond' : 'round', t: t });
      var name = key === 'eff' ? a.eff.name : nd.name, desc = key === 'eff' ? a.eff.desc : nd.desc;
      carve(c, name.toUpperCase(), x + 34, ry + 8, 9, r > 0 ? GOLD2 : DIM, 'left', 'bold', 0.6);
      plain(c, fit(c, cb.ok || r >= nd.max ? desc : cb.reason, w - 150, 8.5, 'normal'), x + 34, ry + rh - 11, 8.5, cb.ok ? GOOD : '#8a7c6c');
      // rank bar: a carved trough filling with light
      var bx = x + w - 112, bw = 52, by = cy - 8;
      c.fillStyle = 'rgba(0,0,0,0.6)'; rrPath(c, bx, by, bw, 8, 4); c.fill();
      if (r > 0) { c.save(); c.shadowColor = a.col; c.shadowBlur = 5; c.fillStyle = hex(a.col, 0.9); rrPath(c, bx + 1, by + 1, Math.max(4, (bw - 2) * r / nd.max), 6, 3); c.fill(); c.restore(); }
      carve(c, roman(r) + '/' + roman(nd.max), bx + bw / 2, by + 16, 7.5, r > 0 ? GOLD2 : '#5e574c', 'center', 'bold', 0);
      var bxx = x + w - 52;
      slab(c, bxx, cy - 11, 44, 22, 5, cb.ok ? 'raised' : 'inset', hovering(U, bxx, cy - 11, 44, 22) && cb.ok ? 'rgba(255,230,160,0.13)' : null);
      carve(c, r >= nd.max ? 'MAX' : '+', bxx + 22, cy + 0.5, r >= nd.max ? 8 : 14, cb.ok ? GOLD2 : '#5e574c', 'center', 'bold', 0);
      if (cb.ok) { c.save(); c.globalAlpha = 0.3 + 0.25 * Math.sin(t * 3.2); c.strokeStyle = GOLD; c.lineWidth = 1.2; rrPath(c, bxx + 2, cy - 9, 40, 18, 4); c.stroke(); c.restore(); hit(bxx, cy - 11, 44, 22, function () { if (Sk.buy(p, a.id, key)) markFlash('u' + a.id + key); }); }
      flashRing(c, 'u' + a.id + key, x + 16, cy, 11);
    });
    var q = AB[a.syn], sb = Sk.synBonus(p, a.id);
    plain(c, 'Synergy: ' + (q ? q.name : '') + ' runes add +' + Math.round(sb * 100) + '%   ·   total damage x' + Sk.dmgMul(p, a.id).toFixed(2), x + w / 2, y + h - 6, 8.5, '#8fb8d8', 'center', 'bold');
  }

  /* ---------- III. CHARGES ---------- */
  function charges(c, hit, U, x, y, w, h, p) {
    var T = ST(), Sk = SK(), t = now(), cc = classColor(p), cl = T.chargeSkills(p.classId), cur = T.chargeSelected(p), yy = y;
    carve(c, 'CHARGE ATTACK  ·  HOLD THE ATTACK BUTTON', x + 4, yy + 6, 9, DIM, 'left', 'bold', 1);
    yy += 14;
    var tw = (w - 6) / 2, th = 50, i;
    if (st.chg === null || !cl[st.chg]) st.chg = cur;
    cl.forEach(function (cs, k) {
      var tx = x + (k % 2) * (tw + 6), ty = yy + Math.floor(k / 2) * (th + 6), open = T.chargeUnlocked(p, k), on = cur === k, look = st.chg === k;
      slab(c, tx, ty, tw, th, 7, on || look ? 'raised' : 'inset', on ? hex(cc, 0.14) : hovering(U, tx, ty, tw, th) && open ? 'rgba(255,230,160,0.08)' : null);
      medal(c, tx + 24, ty + th / 2, 15, { state: !open ? 'lock' : on ? 'max' : 'own', rune: runeFor(cs.id), col: cc, shape: k === 3 ? 'diamond' : 'round', sel: look && !on, t: t });
      carve(c, roman(k + 1), tx + tw - 9, ty + 9, 8, GOLD, 'right', 'bold', 0);
      carve(c, fit(c, cs.name.toUpperCase(), tw - 66, 9.5), tx + 46, ty + 18, 9.5, open ? (on ? GOLD2 : TEXT) : DIM, 'left', 'bold', 0.5);
      carve(c, !open ? 'OPENS AT LVL ' + roman(cs.lvl) : on ? 'BOUND' : 'TAP TO BIND', tx + 46, ty + 34, 8, !open ? '#8a5a4c' : on ? GOOD : GOLD, 'left', 'bold', 0.6);
      if (on) { c.save(); c.fillStyle = cc; c.shadowColor = cc; c.shadowBlur = 8; c.fillRect(tx + 8, ty + th - 3, tw - 16, 2); c.restore(); }
      hit(tx, ty, tw, th, function () { st.chg = k; if (open && cur !== k) { T.selectCharge(p, k); say(U, cs.name.toUpperCase() + ' BOUND'); markFlash('chg' + k); } });
      flashRing(c, 'chg' + k, tx + 24, ty + th / 2, 15);
    });
    yy += th * 2 + 6 + 6;
    var look2 = cl[st.chg];
    slab(c, x, yy, w, 42, 6, 'inset');
    paragraph(c, look2 ? look2.desc : '', x + 10, yy + 12, w - 20, 12, 10.5, TEXT, 3);
    yy += 42 + 10;
    // every ability's hold version
    carve(c, 'CHARGED SPELLS  ·  HOLD A SEAL', x + 4, yy + 5, 9, DIM, 'left', 'bold', 1);
    plain(c, 'a separate, longer recharge from the tap', x + w - 4, yy + 5, 8.5, DIM, 'right');
    yy += 14;
    if (!Sk || !Sk.list) return;
    Sk.ensure(p);
    var lst = Sk.list(p.classId), rh = clamp((y + h - yy) / lst.length, 34, 46);
    lst.forEach(function (ab, n) {
      var ry = yy + n * rh, lk = (p.level || 1) < ab.lvl, slot = p.slots.indexOf(ab.id), pr = CC.SpellPairs && CC.SpellPairs.get ? CC.SpellPairs.get(ab.id) : null;
      var hi = !pr && ab.orig && CC.SpellCharge && CC.SpellCharge.heldInfo ? CC.SpellCharge.heldInfo(p.classId, ab.orig) : null;
      var hold = pr ? (pr.chargeName || pr.name) : hi ? hi.name : 'Stronger version', desc = pr ? (pr.chargeDesc || '') : hi ? 'Aim it for ' + (hi.mult ? '+' + Math.round((hi.mult - 1) * 100) + '% damage.' : 'more power.') : '';
      slab(c, x, ry, w, rh - 3, 6, 'inset', hovering(U, x, ry, w, rh - 3) ? 'rgba(255,230,160,0.07)' : null);
      medal(c, x + 18, ry + (rh - 3) / 2, 11, { state: lk ? 'lock' : slot >= 0 ? 'own' : 'avail', rune: runeFor(ab.id + 'hold'), col: ab.col, t: t });
      carve(c, fit(c, ab.name.toUpperCase() + '  >  ' + hold.toUpperCase(), w - 130, 9), x + 36, ry + 10, 9, lk ? DIM : ab.col, 'left', 'bold', 0.4);
      plain(c, fit(c, desc, w - 205, 8.5, 'normal'), x + 36, ry + rh - 13, 8.5, DIM);
      var tag = lk ? 'LVL ' + roman(ab.lvl) : slot >= 0 ? 'SEAL ' + roman(slot + 1) : 'UNBOUND';
      carve(c, tag, x + w - 10, ry + 10, 8, lk ? '#8a5a4c' : slot >= 0 ? GOOD : '#5e574c', 'right', 'bold', 0.5);
      if (pr && pr.manaMul) plain(c, '×' + pr.manaMul.toFixed(2) + ' mana  ×' + (pr.cdMul || 1.75).toFixed(2) + ' recharge', x + w - 10, ry + rh - 13, 8, '#6f675a', 'right');
      hit(x, ry, w, rh - 3, function () { st.ab = ab.id; st.tab = 'abilities'; });
    });
  }

  /* ---------- the screen ---------- */
  S.draw = function (c, hit, x, y, w, h, p, U) {
    if (!p) { plain(c, 'No hero yet', x + w / 2, y + h / 2, 14, DIM, 'center'); return; }
    if (!ST()) { plain(c, 'Skill tablet unavailable', x + w / 2, y + h / 2, 14, DIM, 'center'); return; }
    c.save();
    hit = hit || function () {}; U = U || {};
    header(c, hit, U, x, y, w, p);
    tabs(c, hit, U, x, y + 40, w, p);
    var by = y + 78, bh = h - 80;
    c.save();
    if (st.tab === 'abilities') abilities(c, hit, U, x, by, w, bh, p);
    else if (st.tab === 'charges') charges(c, hit, U, x, by, w, bh, p);
    else passives(c, hit, U, x, by, w, bh, p);
    c.restore();
    if (st.toast && now() - st.toast.t < 1.8) { // a short chiselled message that fades
      var a = Math.min(1, (1.8 - (now() - st.toast.t)) / 0.5); c.save(); c.globalAlpha = a; slab(c, x + w / 2 - 110, by + bh - 58, 220, 24, 6, 'raised'); carve(c, st.toast.s, x + w / 2, by + bh - 46, 9.5, GOLD2, 'center', 'bold', 1); c.restore();
    }
    c.restore();
  };
  S.key = function (code) {
    var i = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].indexOf(code);
    if (i < 0) return false;
    st.tab = TABS[i % 3][0]; return true;
  };
  S.setTab = function (id) { if (TABS.some(function (t) { return t[0] === id; })) st.tab = id; };
  S.state = function () { return st; };
  S.roman = roman; S.rune = rune; S.RUNE_NAMES = RUNE_NAMES;
})(typeof window !== 'undefined' ? window : globalThis);
