/* CC.DialogBox - the one look for every NPC conversation: a compact dark-wood-and-gold panel with a name plate, corner ornaments, and small pill buttons.
 *   draw(ctx, W, H, addHit, { name, text, actions })
 *     actions (optional): [{ label, enabled(), run() }]; with none, it is a plain line of speech and swallows no taps.
 * Sized by the text, never wider than 460 px (or the screen), so it stays neat on a wide PC window and in landscape on a phone.
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, D = CC.DialogBox = {};
  function wrap(c, text, maxW) {
    var words = String(text || '').split(' '), lines = [], line = '', i;
    for (i = 0; i < words.length; i++) { var t = line ? line + ' ' + words[i] : words[i]; if (c.measureText(t).width > maxW && line) { lines.push(line); line = words[i]; } else line = t; }
    if (line) lines.push(line); return lines;
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function diamond(c, x, y, s, col) { c.fillStyle = col; c.beginPath(); c.moveTo(x, y - s); c.lineTo(x + s, y); c.lineTo(x, y + s); c.lineTo(x - s, y); c.closePath(); c.fill(); }
  /* Dialogs are queued while the frame is built and painted LAST (D.flush, called at the end of the shell's draw), so they sit on top of the
   * HUD and the player controls instead of underneath them. A plain line of speech may carry onTap: a quick tap anywhere on the screen (see D.tap)
   * runs it, to move on to the next prompt or dismiss. */
  var queue = [], active = [];
  D.draw = function (c, Wd, Hd, addHit, o, y0) { if (o) queue.push({ Wd: Wd, Hd: Hd, addHit: addHit, o: o, y0: y0 }); };
  D.flush = function (c, hit) {
    active = [];
    for (var i = 0; i < queue.length; i++) { var q = queue[i]; if (q.o.onTap) active.push(q.o); paint(c, q.Wd, q.Hd, hit || q.addHit, q.o, q.y0); }
    queue.length = 0;
  };
  D.hasTap = function () { return active.length > 0; };
  D.tap = function () { var o = active[active.length - 1]; if (!o || typeof o.onTap !== 'function') return false; active = []; o.onTap(); return true; };
  D.clear = function () { queue.length = 0; active = []; };
  function paint(c, Wd, Hd, addHit, o, y0) {
    if (!o) return; var acts = o.actions || [], FS = Wd < 420 || Hd < 330 ? 11.5 : 12.5, LH = Math.round(FS * 1.4), pad = 14;
    var bw = Math.min(460, Wd - 24), bx = Math.round((Wd - bw) / 2);
    c.save(); c.font = FS + 'px Georgia, serif'; var lines = wrap(c, o.text, bw - pad * 2 - 4), BH = 26, gap = 6;
    var bh = 20 + lines.length * LH + (acts.length ? 8 + acts.length * (BH + gap) : 0) + 10;
    var by = y0 !== undefined ? y0 : Math.max(52, Math.round(Hd * (o.low ? 0.32 : 0.2))); if (by + bh > Hd - 8) by = Math.max(8, Hd - 8 - bh);
    c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 14; c.shadowOffsetY = 3;
    var g = c.createLinearGradient(0, by, 0, by + bh); g.addColorStop(0, 'rgba(58,34,22,0.97)'); g.addColorStop(1, 'rgba(30,16,10,0.98)');
    rr(c, bx, by, bw, bh, 8); c.fillStyle = g; c.fill(); c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0;
    rr(c, bx + 0.5, by + 0.5, bw - 1, bh - 1, 8); c.lineWidth = 2; c.strokeStyle = '#8b9199'; c.stroke();
    rr(c, bx + 4, by + 4, bw - 8, bh - 8, 5); c.lineWidth = 1; c.strokeStyle = 'rgba(214,170,112,0.5)'; c.stroke();
    diamond(c, bx + 4, by + 4, 3, '#9aa1ab'); diamond(c, bx + bw - 4, by + 4, 3, '#9aa1ab'); diamond(c, bx + 4, by + bh - 4, 3, '#9aa1ab'); diamond(c, bx + bw - 4, by + bh - 4, 3, '#9aa1ab');
    if (o.name) { // the name plate straddling the top edge
      c.font = 'bold 12px Georgia, serif'; var nw = Math.min(bw - 40, c.measureText(o.name).width + 30), nx = bx + 16, ny = by - 11;
      rr(c, nx, ny, nw, 22, 6); var ng = c.createLinearGradient(0, ny, 0, ny + 22); ng.addColorStop(0, '#6a4430'); ng.addColorStop(1, '#3a2216'); c.fillStyle = ng; c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#9aa1ab'; c.stroke();
      diamond(c, nx + 9, ny + 11, 2.2, '#9aa1ab'); c.fillStyle = '#ffe3a0'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(o.name, nx + 17, ny + 11.5, nw - 22);
    }
    c.textBaseline = 'alphabetic'; c.font = FS + 'px Georgia, serif'; c.fillStyle = '#f0e6d0'; c.textAlign = 'left'; var ty = by + 28, i;
    for (i = 0; i < lines.length; i++) c.fillText(lines[i], bx + pad + 2, ty + i * LH);
    var yy = by + 20 + lines.length * LH + 8;
    if (acts.length) addHit(bx, by, bw, bh, function () {}); // registered first: the box swallows taps and the buttons sit on top
    acts.forEach(function (a) {
      var on = !a.enabled || a.enabled(); c.font = 'bold 12px Georgia, serif';
      var w = Math.min(bw - pad * 2, Math.max(150, c.measureText(a.label).width + 56)), x = Math.round(bx + (bw - w) / 2);
      rr(c, x, yy, w, BH, 13); var bg = c.createLinearGradient(0, yy, 0, yy + BH);
      if (on) { bg.addColorStop(0, '#547a38'); bg.addColorStop(1, '#324d20'); } else { bg.addColorStop(0, 'rgba(255,255,255,0.08)'); bg.addColorStop(1, 'rgba(255,255,255,0.04)'); }
      c.fillStyle = bg; c.fill(); c.lineWidth = 1.2; c.strokeStyle = on ? '#e0c070' : 'rgba(255,255,255,0.18)'; c.stroke();
      if (on) { diamond(c, x + 11, yy + BH / 2, 2.4, '#ffe3a0'); diamond(c, x + w - 11, yy + BH / 2, 2.4, '#ffe3a0'); }
      c.fillStyle = on ? '#fff' : '#888'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(a.label, x + w / 2, yy + BH / 2 + 0.5, w - 34); c.textBaseline = 'alphabetic';
      if (on) addHit(x, yy, w, BH, function () { a.run(); });
      yy += BH + gap;
    });
    if (o.onTap && !acts.length) { c.font = 'italic 10px Georgia, serif'; c.fillStyle = 'rgba(240,230,208,0.55)'; c.textAlign = 'right'; c.fillText('tap to continue', bx + bw - 12, by + bh - 6); } // a plain line of speech can be tapped away
    c.restore();
  }
})(window);
