/* CC.BetaNotes - the beta tester's notepad.
 * After 20 minutes of continuous play (not counting pauses, menus, the title screen or time away from the tab) the game pauses and a notepad opens:
 * "The developer would like your opinions!" with three questions. Pressing Send posts the answers to /api/feedback on the game's server (see feedback.js),
 * which saves them and emails the developer. It is asked once; "Not now" is remembered for 3 days and a sent note for 30 (in this browser's localStorage).
 *   CC.BetaNotes.tick(dt, playing)   called every frame by main.js
 *   CC.BetaNotes.open() / close()    (open() is also handy for testing from the console)
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, B = CC.BetaNotes = {}, doc = root.document, KEY = 'emberdeep-betanotes', AFTER = 20 * 60, t = 0, el = null, shown = false, minutesPlayed = 0;
  function mute() { try { var s = JSON.parse(localStorage.getItem(KEY) || 'null'); return s && s.until > Date.now(); } catch (e) { return false; } }
  function remember(days) { try { localStorage.setItem(KEY, JSON.stringify({ until: Date.now() + days * 86400000 })); } catch (e) { /* private mode */ } }
  var CSS = '#bn-back{position:fixed;inset:0;z-index:99999;background:rgba(6,3,10,.78);display:flex;align-items:center;justify-content:center;padding:12px;font-family:Georgia,"Times New Roman",serif}' +
    '#bn-box{width:min(560px,100%);max-height:96vh;overflow:auto;background:linear-gradient(#2a1d14,#150e09);border:2px solid #8a5a26;border-radius:10px;box-shadow:0 0 0 3px #0c0705,0 0 0 4px rgba(224,180,100,.5),0 12px 40px #000;padding:18px 20px;color:#f0e6d0}' +
    '#bn-box h2{margin:0 0 4px;color:#ffd890;font-size:21px}#bn-box p.sub{margin:0 0 12px;color:#bfae8e;font-size:13px}' +
    '#bn-box label{display:block;margin:10px 0 3px;color:#ffe3a0;font-weight:bold;font-size:14px}' +
    '#bn-box textarea,#bn-box input[type=text]{width:100%;box-sizing:border-box;background:#0f0a07;color:#f0e6d0;border:1px solid #6a4a26;border-radius:6px;padding:8px;font:14px Georgia,serif;resize:vertical}' +
    '#bn-box textarea{min-height:64px}#bn-box textarea:focus,#bn-box input:focus{outline:none;border-color:#e0b45a;box-shadow:0 0 6px rgba(224,180,90,.5)}' +
    '#bn-box .thx{margin:14px 0 4px;color:#cfe8b0;font-size:14px;text-align:center}#bn-box .row{display:flex;gap:10px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap}' +
    '#bn-box button{font:bold 14px Georgia,serif;border-radius:18px;padding:9px 20px;cursor:pointer;border:1.5px solid #e0c070;color:#fff}#bn-send{background:linear-gradient(#547a38,#324d20)}#bn-skip{background:#3a2a22;border-color:#7a5a3a;color:#d8c8a8}' +
    '#bn-box button:disabled{opacity:.5;cursor:default}#bn-msg{min-height:18px;margin-top:8px;font-size:13px;color:#ff9a8a;text-align:center}#bn-hp{position:absolute;left:-9999px;opacity:0}';
  function stop(e) { e.stopPropagation(); } // typing in the notepad must never move the hero
  B.open = function () {
    if (el || !doc) return; shown = true;
    var st = doc.createElement('style'); st.id = 'bn-style'; st.textContent = CSS; doc.head.appendChild(st);
    el = doc.createElement('div'); el.id = 'bn-back';
    el.innerHTML = '<div id="bn-box" role="dialog" aria-modal="true" aria-label="Beta tester notepad"><h2>The developer would like your opinions!</h2>' +
      '<p class="sub">You can become part of the development! Thank you for your input.</p>' +
      '<label for="bn-a">What do you think needs balancing or tweaking?</label><textarea id="bn-a" maxlength="1200" placeholder="Too hard? Too easy? A skill that feels off?"></textarea>' +
      '<label for="bn-b">What was your favorite part?</label><textarea id="bn-b" maxlength="1200"></textarea>' +
      '<label for="bn-c">What would you like to see added?</label><textarea id="bn-c" maxlength="1200"></textarea>' +
      '<label for="bn-d">Your name or email, if you would like a reply (optional)</label><input id="bn-d" type="text" maxlength="200" autocomplete="off">' +
      '<input id="bn-hp" type="text" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<div id="bn-msg"></div><div class="row"><button id="bn-skip" type="button">Not now</button><button id="bn-send" type="button">Send</button></div></div>';
    ['keydown', 'keyup', 'keypress', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'wheel'].forEach(function (ev) { el.addEventListener(ev, stop); });
    doc.body.appendChild(el);
    if (CC.setPaused) CC.setPaused(true);
    el.querySelector('#bn-skip').onclick = function () { remember(3); B.close(); };
    el.querySelector('#bn-send').onclick = send;
    setTimeout(function () { var a = el && el.querySelector('#bn-a'); if (a) a.focus(); }, 50);
  };
  B.close = function () {
    if (!el) return; el.remove(); el = null; var st = doc.getElementById('bn-style'); if (st) st.remove();
    if (CC.setPaused) CC.setPaused(false);
  };
  function send() {
    var q = function (id) { return el.querySelector(id).value; }, btn = el.querySelector('#bn-send'), msg = el.querySelector('#bn-msg');
    var body = { balance: q('#bn-a'), favorite: q('#bn-b'), wish: q('#bn-c'), contact: q('#bn-d'), website: q('#bn-hp'), minutes: Math.round(minutesPlayed), hero: CC.state && CC.state.classId };
    if (!body.balance.trim() && !body.favorite.trim() && !body.wish.trim()) { msg.textContent = 'Write a few words in any box first.'; return; }
    btn.disabled = true; msg.style.color = '#cfe8b0'; msg.textContent = 'Sending...';
    root.fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }).then(function (j) { return { ok: r.ok && j.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok) { remember(30); el.querySelector('#bn-box').innerHTML = '<h2>Thank you!</h2><div class="thx">Your notes are on their way to the developer. Enjoy the game!</div>'; setTimeout(B.close, 2000); }
        else { btn.disabled = false; msg.style.color = '#ff9a8a'; msg.textContent = (res.j && res.j.error) || 'Could not send right now. Please try again in a moment.'; }
      }).catch(function () { btn.disabled = false; msg.style.color = '#ff9a8a'; msg.textContent = 'Could not reach the server. Please try again in a moment.'; });
  }
  B.tick = function (dt, playing) {
    if (!playing || el || shown || !doc || (doc.hidden)) return; if (mute()) { shown = true; return; }
    t += Math.min(dt, 0.25); minutesPlayed = t / 60; if (t >= AFTER) B.open();
  };
  B.seconds = function () { return t; };
})(window);
