/* Emberdeep direct (phone-to-phone) multiplayer.
 *
 * No game server and no install: the HOST's browser acts as the room server. A friend types the host's 6-letter
 * code; PeerJS's free cloud broker only introduces the two browsers, then game data flows straight between them
 * (over the same Wi-Fi when they share one) in a WebRTC data channel.
 *
 * Pieces:
 *   Hub            - the room logic of api/ws.js for exactly two players, running inside the host's page
 *   HostTransport  - a WebSocket-shaped object for the host's own game: talks to the Hub in-process and listens for
 *                    the friend on PeerJS as emberdeep-<CODE>
 *   GuestTransport - a WebSocket-shaped object for the friend: connects to emberdeep-<CODE>
 * multiplayer.js uses them exactly like a WebSocket (readyState, send, close, onopen/onmessage/onclose/onerror), so
 * the rest of the co-op code is the same whichever way the two phones are connected.
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {};
  var P2P = CC.P2P = {};
  var PREFIX = 'emberdeep-';
  var HEROES = ['swordsman', 'wizard', 'necromancer', 'thief'];

  function validHero(s) { return HEROES.indexOf(s) >= 0 ? s : 'swordsman'; }
  function safeText(s, max) { return String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max || 80); }
  function hex(n) { var out = '', a = (root.crypto && root.crypto.getRandomValues) ? root.crypto.getRandomValues(new Uint8Array(n)) : null, i; for (i = 0; i < n; i++) out += ('0' + (a ? a[i] : Math.floor(Math.random() * 256)).toString(16)).slice(-2); return out; }
  function makeCode() { return hex(3).toUpperCase(); }
  // Keep only plain numbers, booleans, short strings, small arrays and shallow objects (same rules as the server).
  function cleanFx(v, depth) {
    var i, out, k;
    if (typeof v === 'number') return isFinite(v) ? Math.max(-30000, Math.min(30000, v)) : undefined;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return v.slice(0, 32);
    if (depth > 3 || !v || typeof v !== 'object') return undefined;
    if (Array.isArray(v)) { out = []; for (i = 0; i < v.length && i < 12; i++) { k = cleanFx(v[i], depth + 1); if (k !== undefined) out.push(k); } return out; }
    out = {};
    Object.keys(v).slice(0, 40).forEach(function (key) {
      if (!/^[A-Za-z0-9_]{1,16}$/.test(key)) return;
      var c = cleanFx(v[key], depth + 1); if (c !== undefined) out[key] = c;
    });
    return out;
  }

  /* ---------------------------------------------------------------- hub */
  function Hub() {
    this.code = null; this.room = null; this.eps = { host: null, guest: null };
    this.scene = null; this.snapshotRaw = null; this.trade = null; this.guestToken = null; this.lastGuest = null; this.closed = false;
    this.lastChat = { host: 0, guest: 0 };
  }
  Hub.prototype.pub = function () {
    var r = this.room;
    return { code: r.code, title: r.title, private: r.private, mode: r.mode, host: { name: r.host.name, hero: r.host.hero },
      guest: r.guest ? { name: r.guest.name, hero: r.guest.hero } : null, players: r.guest ? 2 : 1, capacity: 2, created: r.created };
  };
  Hub.prototype.attach = function (role, sendStr) { this.eps[role] = { send: sendStr }; };
  Hub.prototype.detach = function (role) { this.eps[role] = null; };
  Hub.prototype.sendRaw = function (role, str) { var ep = this.eps[role]; if (ep) ep.send(str); };
  Hub.prototype.sendTo = function (role, obj) { this.sendRaw(role, JSON.stringify(obj)); };
  Hub.prototype.publish = function (obj) { var s = JSON.stringify(obj); this.sendRaw('host', s); this.sendRaw('guest', s); };
  Hub.prototype.fail = function (role, message) { this.sendTo(role, { type: 'error', message: message }); };
  Hub.prototype.welcome = function (role, token) {
    var snap = null;
    if (role === 'guest' && this.snapshotRaw) { try { snap = JSON.parse(this.snapshotRaw).snapshot; } catch (e) { snap = null; } }
    this.sendTo(role, { type: 'welcome', role: role, code: this.code, token: token, room: this.pub(),
      scene: this.scene, snapshot: snap, trade: this.trade ? { id: this.trade.id, from: this.trade.from, item: this.trade.item } : null });
    this.publish({ type: 'players', room: this.pub() });
  };
  Hub.prototype.guestDropped = function () { // the friend's connection ended without a LEAVE: they may come back with their token
    if (!this.room || !this.room.guest) return;
    this.lastGuest = this.room.guest; this.room.guest = null; this.detach('guest');
    this.publish({ type: 'presence', from: 'guest', online: false });
    this.publish({ type: 'players', room: this.pub() });
  };
  Hub.prototype.handle = function (role, raw) {
    if (this.closed) return;
    // fast path: the host's world snapshots (big, frequent) are forwarded untouched, never parsed here
    if (role === 'host' && raw.charCodeAt(1) === 34 && raw.indexOf('{"type":"snapshot"') === 0) { this.snapshotRaw = raw; this.sendRaw('guest', raw); return; }
    var d; try { d = JSON.parse(raw); } catch (e) { return; }
    if (!d || typeof d !== 'object') return;
    var room = this.room, t = d.type, now = Date.now();
    if (t === 'list') { this.sendTo(role, { type: 'rooms', rooms: [] }); return; }
    if (t === 'create') {
      if (role !== 'host') return;
      if (room) return this.fail(role, 'Already in a room');
      var name = safeText(d.name, 22); if (!name) return this.fail(role, 'Enter your name first');
      this.room = { code: this.code, created: now, title: safeText(d.title, 42) || name + "'s Adventure", private: !!d.private,
        mode: d.mode === 'defense' ? 'defense' : 'cave', host: { name: name, hero: validHero(d.hero) }, guest: null };
      this.welcome('host', 'p2p-host'); return;
    }
    if (t === 'join' || t === 'resume') {
      if (role !== 'guest') return;
      if (!room) return this.fail(role, 'Game not found or expired');
      if (String(d.code || '').toUpperCase() !== this.code) return this.fail(role, 'Game not found or expired');
      if (room.guest) return this.fail(role, 'Game is full');
      if (t === 'resume') {
        if (!this.guestToken || d.token !== this.guestToken || !this.lastGuest) return this.fail(role, 'Session expired or invalid');
        room.guest = this.lastGuest;
      } else {
        var gname = safeText(d.name, 22); if (!gname) return this.fail(role, 'Enter your name first');
        room.guest = { name: gname, hero: validHero(d.hero) }; this.guestToken = hex(16);
      }
      this.lastGuest = room.guest; this.welcome('guest', this.guestToken); return;
    }
    if (!room || !room[role]) return this.fail(role, 'Join a game first');
    if (t === 'leave') {
      if (role === 'host') { this.publish({ type: 'closed', message: 'Host ended the game' }); this.closed = true; return; }
      room.guest = null; this.lastGuest = null; this.guestToken = null;
      this.sendTo('guest', { type: 'left' }); this.detach('guest');
      this.publish({ type: 'players', room: this.pub() }); return;
    }
    if (t === 'chat') {
      if (now - this.lastChat[role] < 700) return; this.lastChat[role] = now;
      var text = safeText(d.text, 200);
      if (text) this.publish({ type: 'chat', from: role, name: room[role].name, text: text, at: now });
      return;
    }
    if (t === 'position') {
      var p = d.player || {}, clean = {};
      ['x', 'y', 'hp', 'maxHp', 'mana', 'maxMana', 'level', 'face', 'anim', 'atkAnim', 'swingAng', 'swingSign', 'castFlash', 'whirlT', 'dashT', 'pwb', 'sc', 'pta', 'ptx', 'pty', 'ptr', 'ptf', 'ptt', 'cpa', 'cpx', 'cpy', 'cpf', 'cpt'].forEach(function (k) {
        if (typeof p[k] === 'number' && isFinite(p[k])) clean[k] = Math.max(-20000, Math.min(20000, p[k]));
      });
      clean.classId = room[role].hero; clean.moving = !!p.moving;
      this.publish({ type: 'position', from: role, player: clean }); return;
    }
    if (t === 'fx') {
      if (['fx', 'pr', 'sc', 'mn', 'df', 'tb', 'tc', 'opt', 'ch', 'qs', 'qe', 'vf', 'gp'].indexOf(d.k) < 0) return;
      if ((d.k === 'df' || d.k === 'tb' || d.k === 'opt' || d.k === 'ch' || d.k === 'qs' || d.k === 'qe' || d.k === 'gp') && role !== 'host') return;
      if (d.k === 'tc' && role !== 'guest') return;
      var fx = cleanFx(d.d, 0);
      if (fx === undefined || JSON.stringify(fx).length > 2500) return;
      this.publish({ type: 'fx', from: role, k: d.k, d: fx }); return;
    }
    if (t === 'kill' && role === 'host') {
      var xp = Number(d.xp); if (isFinite(xp) && xp > 0 && xp < 5000) this.publish({ type: 'kill', xp: Math.round(xp) }); return;
    }
    if (t === 'damage_guest' && role === 'host') {
      var amt = Number(d.damage); if (isFinite(amt) && amt > 0 && amt <= 250) this.publish({ type: 'damage_guest', to: 'guest', damage: amt }); return;
    }
    if (t === 'hit' && role === 'guest') {
      var id = Number(d.id), dm = Number(d.damage);
      if (!Number.isInteger(id) || !isFinite(dm) || dm <= 0 || dm > 450) return;
      this.publish({ type: 'hit', from: role, id: id, damage: dm, kind: safeText(d.kind, 24) }); return;
    }
    if (t === 'drop_item' && role === 'guest') {
      var di = d.item; if (!di || typeof di !== 'object' || Array.isArray(di)) return;
      var dj = JSON.stringify(di); if (dj.length > 3000) return;
      this.publish({ type: 'drop_item', from: role, item: JSON.parse(dj) }); return;
    }
    if (t === 'pickup_request' && role === 'guest') { var pid = safeText(d.id, 50); if (pid) this.publish({ type: 'pickup_request', from: role, id: pid }); return; }
    if (t === 'pickup_grant' && role === 'host') {
      var rw = d.reward;
      if (rw && ['item', 'gold', 'potion', 'mpotion', 'hp', 'mana'].indexOf(rw.kind) >= 0 && JSON.stringify(rw).length <= 5000)
        this.publish({ type: 'pickup_grant', to: 'guest', id: safeText(d.id, 50), reward: rw });
      return;
    }
    if (t === 'scene' && role === 'host') {
      var sc = d.scene || {};
      if (['cave', 'defense', 'forest', 'tree-tunnel', 'plains', 'tree-ascent'].indexOf(sc.area) < 0 || !isFinite(sc.seed) || !Number.isInteger(sc.floor) || sc.floor < 1 || sc.floor > 200) return;
      this.scene = { area: sc.area, seed: sc.seed, floor: sc.floor };
      if (Number.isInteger(sc.tf) && sc.tf >= 1 && sc.tf <= 5) this.scene.tf = sc.tf;
      if (isFinite(sc.px) && isFinite(sc.py)) { this.scene.px = Math.max(-20000, Math.min(20000, sc.px)); this.scene.py = Math.max(-20000, Math.min(20000, sc.py)); }
      this.publish({ type: 'scene', scene: this.scene }); return;
    }
    if (t === 'trade_offer') {
      if (!room.guest) return this.fail(role, 'Wait for the other adventurer before trading');
      var item = d.item; if (!item || typeof item !== 'object' || Array.isArray(item)) return;
      var js = JSON.stringify(item); if (js.length > 3000) return this.fail(role, 'Item too large');
      if (this.trade && now - this.trade.at < 120000) return this.fail(role, 'A trade is already pending');
      this.trade = { id: hex(8), from: role, item: JSON.parse(js), at: now };
      this.publish({ type: 'trade_offer', id: this.trade.id, from: role, item: this.trade.item }); return;
    }
    if (t === 'trade_accept' || t === 'trade_decline') {
      var offer = this.trade; if (!offer || offer.id !== d.id || offer.from === role) return;
      this.trade = null;
      var o = { id: offer.id, from: offer.from, item: offer.item };
      this.publish(t === 'trade_accept' ? Object.assign({ type: 'trade_commit', to: role }, o) : Object.assign({ type: 'trade_decline' }, o));
    }
  };
  P2P.Hub = Hub;

  /* ---------------------------------------------------------------- transports */
  function later(fn) { setTimeout(fn, 0); }

  // The host's own game talks to the Hub in-process; PeerJS carries only the friend.
  function HostTransport() {
    var self = this;
    this.readyState = 0; this.hub = new Hub(); this.peer = null; this.guestConn = null; this.tries = 0;
    this.onopen = this.onmessage = this.onclose = this.onerror = null;
    this.hub.attach('host', function (str) { later(function () { if (self.onmessage) self.onmessage({ data: str }); }); });
    later(function () { self._open(); });
  }
  HostTransport.prototype._open = function () {
    var self = this, code = makeCode();
    if (!root.Peer) { self._fail('nopeer'); return; }
    var peer;
    try { peer = new root.Peer(PREFIX + code, { debug: 0 }); } catch (e) { self._fail('nopeer'); return; }
    this.peer = peer;
    peer.on('open', function () {
      self.hub.code = code; self.code = code; self.readyState = 1;
      if (self.onopen) self.onopen();
    });
    peer.on('error', function (err) {
      if (err && err.type === 'unavailable-id' && self.tries++ < 6) { try { peer.destroy(); } catch (e) { /* gone */ } self._open(); return; }
      if (self.readyState !== 1) self._fail(err && err.type || 'network');
      // once running, transient signalling hiccups are ignored: the friend's data channel does not need the broker
    });
    peer.on('disconnected', function () { try { peer.reconnect(); } catch (e) { /* will retry on next event */ } });
    peer.on('connection', function (conn) { self._guest(conn); });
  };
  HostTransport.prototype._fail = function (type) {
    var was = this.readyState; this.readyState = 3;
    if (this.onerror) this.onerror({ type: type });
    if (was !== 3 && this.onclose) this.onclose();
  };
  HostTransport.prototype._guest = function (conn) {
    var self = this, hub = this.hub;
    conn.on('open', function () {
      if (hub.eps.guest) { // only two players
        try { conn.send(JSON.stringify({ type: 'error', message: 'Game is full' })); } catch (e) { /* gone */ }
        setTimeout(function () { try { conn.close(); } catch (e) { /* gone */ } }, 300);
        return;
      }
      self.guestConn = conn;
      hub.attach('guest', function (str) { try { if (conn.open) conn.send(str); } catch (e) { /* link dropped; close handler follows */ } });
    });
    conn.on('data', function (d) {
      if (self.guestConn !== conn) return;
      hub.handle('guest', typeof d === 'string' ? d : JSON.stringify(d));
    });
    conn.on('close', function () { if (self.guestConn === conn) { self.guestConn = null; hub.guestDropped(); } });
    conn.on('error', function () { /* close follows */ });
  };
  HostTransport.prototype.send = function (str) { var hub = this.hub; later(function () { hub.handle('host', str); }); };
  HostTransport.prototype.close = function () {
    var self = this, hub = this.hub;
    this.readyState = 3;
    if (hub.room && !hub.closed) hub.publish({ type: 'closed', message: 'Host ended the game' }); // tell the friend before the link goes
    hub.closed = true;
    setTimeout(function () { // give that last message a moment to leave
      try { if (self.guestConn) self.guestConn.close(); } catch (e) { /* gone */ }
      try { if (self.peer) self.peer.destroy(); } catch (e) { /* gone */ }
    }, 400);
  };
  P2P.HostTransport = HostTransport;

  // The friend: connects to emberdeep-<CODE>
  function GuestTransport(code) {
    var self = this;
    this.readyState = 0; this.conn = null; this.peer = null; this.code = String(code || '').toUpperCase();
    this.onopen = this.onmessage = this.onclose = this.onerror = null;
    later(function () { self._open(); });
  }
  GuestTransport.prototype._open = function () {
    var self = this;
    if (!root.Peer) { this._die('nopeer'); return; }
    var peer;
    try { peer = new root.Peer(undefined, { debug: 0 }); } catch (e) { this._die('nopeer'); return; }
    this.peer = peer;
    this.timer = setTimeout(function () { if (self.readyState === 0) self._die('timeout'); }, 15000);
    peer.on('open', function () {
      var conn = peer.connect(PREFIX + self.code, { reliable: true });
      self.conn = conn;
      conn.on('open', function () { clearTimeout(self.timer); self.readyState = 1; if (self.onopen) self.onopen(); });
      conn.on('data', function (d) { if (self.onmessage) self.onmessage({ data: typeof d === 'string' ? d : JSON.stringify(d) }); });
      conn.on('close', function () { self._ended(); });
      conn.on('error', function () { self._ended(); });
    });
    peer.on('error', function (err) { self._die(err && err.type === 'peer-unavailable' ? 'notfound' : (err && err.type || 'network')); });
    peer.on('disconnected', function () { /* the data channel survives the broker going away */ });
  };
  GuestTransport.prototype._die = function (type) {
    clearTimeout(this.timer);
    var was = this.readyState; this.readyState = 3;
    try { if (this.peer) this.peer.destroy(); } catch (e) { /* gone */ }
    if (was !== 3) { if (this.onerror) this.onerror({ type: type }); if (this.onclose) this.onclose(); }
  };
  GuestTransport.prototype._ended = function () {
    clearTimeout(this.timer);
    var was = this.readyState; this.readyState = 3;
    try { if (this.peer) this.peer.destroy(); } catch (e) { /* gone */ }
    if (was !== 3 && this.onclose) this.onclose();
  };
  GuestTransport.prototype.send = function (str) { try { if (this.conn && this.conn.open) this.conn.send(str); } catch (e) { /* link dropped */ } };
  GuestTransport.prototype.close = function () {
    var self = this;
    clearTimeout(this.timer); this.readyState = 3;
    setTimeout(function () { // let a final LEAVE message go out first
      try { if (self.conn) self.conn.close(); } catch (e) { /* gone */ }
      try { if (self.peer) self.peer.destroy(); } catch (e) { /* gone */ }
    }, 300);
  };
  P2P.GuestTransport = GuestTransport;

  P2P.available = function () { return typeof root.Peer === 'function' && !!root.RTCPeerConnection; };
  P2P.cleanFx = cleanFx;
  if (typeof module !== 'undefined' && module.exports) module.exports = { Hub: Hub, cleanFx: cleanFx };
})(typeof window !== 'undefined' ? window : globalThis);
