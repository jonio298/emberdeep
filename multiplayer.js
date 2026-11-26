/* Emberdeep co-op: two-player cave adventure, hosted simulation + guest controller.
 * Solo save is never loaded or overwritten by a multiplayer room.
 */
(function(root){
'use strict';
var CC=root.CC=root.CC||{};
var MP=CC.Multiplayer={active:false,role:null,room:null,remote:null,connected:false,options:{guestInvuln:false}};
var ws=null,session=null,reconnectDelay=800,pending=null,opened=false,playing=false;
// ---- network health: counters, backpressure and the delta snapshot state (host side) ----
var NET={bytesOut:0,bytesIn:0,rateOut:0,rateIn:0,rateAt:0,lastOut:0,lastIn:0,snapAt:0,needInit:true,keyClock:0,known:new Map(),dropSig:'',dropAt:0,
 pingClock:0,buf:90000,resyncAt:0,bid:'',peerBid:'',warned:false,show:false,needFull:true,rqAt:0,snapKind:'',snapBytes:0,drops:0};
MP.net=NET;
try{NET.show=/[?&]net=1/.test(location.search);}catch(_){}
function wsend(s){NET.bytesOut+=s.length;ws.send(s);}
// a congested link must not queue stale positions and world updates behind each other (that is what turns a slow link into a laggy one): skip them, send the newest later
function congested(){return !!ws&&(ws.bufferedAmount||0)>NET.buf;}

var chat=[],trade=null,positionClock=0,snapshotClock=0,roomClock=0,pickupClock=0;
var lastScene='',lastRemote=0,pendingPickups={},hostPos=null,extClock=0,qsClock=0;
var SCENES=['cave','defense','forest','tree-tunnel','plains','tree-ascent','rocky-pass','village','village-cellar'];
// Partner motion: samples arrive ~20x/s; we draw ~110 ms in the past and blend between them,
// so movement is smooth on any connection instead of stepping from packet to packet.
var linkKind='ws',joinCode='',optClock=0,samples=[],lastViewAt=0,minionClock=0,remoteMinions=[],remoteMinionsAt=0,INTERP_MS=110;
var colors={wizard:'#75caff',necromancer:'#b98eff',thief:'#e6809f',swordsman:'#f3bf78'};
var el=function(id){return document.getElementById(id);};
// The game page and the room server are normally the same host. To point a page hosted
// elsewhere (e.g. static Vercel) at a separate server, open it once with ?server=your-host.onrender.com
var URL=function(){
 var custom='';
 try{
  var q=(location.search.match(/[?&]server=([^&]+)/)||[])[1];
  if(q)localStorage.setItem('emberdeep-server',decodeURIComponent(q));
  custom=localStorage.getItem('emberdeep-server')||'';
 }catch(_){}
 custom=custom.replace(/^(https?|wss?):\/\//,'').replace(/\/.*$/,'');
 if(custom){var secure=location.protocol==='https:'||!/^(localhost|127\.|192\.168\.|10\.)/.test(custom);return (secure?'wss:':'ws:')+'//'+custom+'/api/ws';}
 return (location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/api/ws';
};
var ready=function(){return ws&&ws.readyState===1;};
function send(o){if(ready()){wsend(JSON.stringify(o));return true;}return false;}
function message(t){if(el('mp-status'))el('mp-status').textContent=t;}
function setError(t){message(t);if(el('mp-server'))el('mp-server').textContent=t;}
function safeName(){return ((MP.character&&MP.character.name)||'Adventurer').trim().slice(0,22);}
function sessionSave(){try{sessionStorage.setItem('emberdeep-room',JSON.stringify(session));}catch(_){}}
function sessionClear(){session=null;try{sessionStorage.removeItem('emberdeep-room');}catch(_){}}
function direct(){return linkKind==='p2p-host'||linkKind==='p2p-join';}
function useLink(kind,code){ // switch how we are connected; an old link of another kind is dropped first
 if(ws&&linkKind!==kind){ws.onclose=null;try{ws.close();}catch(_){}ws=null;MP.connected=false;}
 linkKind=kind;joinCode=code||joinCode;
}
function p2pProblem(type){
 if(type==='notfound')return 'No game found with that code. Is the host still online?';
 if(type==='timeout')return 'Could not reach the host. Both phones need internet to connect the first time.';
 if(type==='nopeer')return 'Direct play is not available in this browser.';
 if(type==='unavailable-id')return 'Could not create the room code. Try again.';
 return 'Could not connect ('+type+'). Check your internet connection and try again.';
}
function connect(){
 if(ws&&(ws.readyState===0||ws.readyState===1))return;
 try{
  if(linkKind==='p2p-host')ws=new CC.P2P.HostTransport();
  else if(linkKind==='p2p-join')ws=new CC.P2P.GuestTransport(joinCode);
  else ws=new WebSocket(URL());
 }catch(e){setError('Unable to connect: '+e.message);return;}
 var mine=ws,kind=linkKind;
 message(kind==='ws'?'Connecting to server...':kind==='p2p-host'?'Opening your room...':'Finding the host...');
 mine.onopen=function(){
  MP.connected=true;reconnectDelay=800;message(kind==='ws'?'Server connected':'Connected');
  if(session&&kind!=='p2p-host')send({type:'resume',code:session.code,token:session.token});
  else if(pending){var action=pending;pending=null;send(action);}
  else if(kind==='ws')send({type:'list'});
 };
 mine.onmessage=function(e){
  NET.bytesIn+=(e.data&&e.data.length)||0;
  try{handle(JSON.parse(e.data));}catch(err){console.warn('Co-op message:',err);}
 };
 mine.onclose=function(){
  if(ws!==mine)return;
  ws=null;MP.connected=false;
  if(kind==='p2p-host')return; // the host's room lives in this page; there is nothing to reconnect to
  if(kind==='p2p-join'){
   if(!session||!MP.active)return; // a failed first attempt just reports its error
   message('Connection lost. Reconnecting to the host...');
   var d2=reconnectDelay;reconnectDelay=Math.min(8000,Math.round(d2*1.7));
   setTimeout(function(){if(!ready()&&session)connect();},d2);
   return;
  }
  if(MP.active)message('Disconnected. Trying to reconnect...');
  else if(opened)message('Server disconnected. Retrying...');
  if(session||opened){
   var delay=reconnectDelay;reconnectDelay=Math.min(10000,Math.round(delay*1.7));
   setTimeout(function(){if(!ready())connect();},delay);
  }
 };
 mine.onerror=function(ev){
  if(kind==='ws')message('WebSocket connection failed. Check deployment and Redis settings.');
  else setError(p2pProblem(ev&&ev.type));
 };
}
function emit(data){if(!send(data)){pending=data;connect();}}
function identity(){return {name:safeName(),hero:(MP.character&&MP.character.hero)||'swordsman'};}
// ---- character select (shown after you press Create or Join): your saved heroes, or a new one ----
var HERO_NAMES={wizard:'Wizard',necromancer:'Necromancer',swordsman:'Swordsman',thief:'Thief'},HERO_COL={wizard:'#75caff',necromancer:'#b98eff',swordsman:'#f3bf78',thief:'#e6809f'};
function pickCharacter(done){
 var box=el('mp-char-list'),SG=CC.SaveGame;box.textContent='';
 var slots=SG&&SG.slots?SG.slots():[],free=0;
 slots.forEach(function(sl){
  if(!sl.info){free++;return;}
  var card=document.createElement('button');card.className='mp-char';card.style.borderColor=HERO_COL[sl.info.classId]||'#7a5a34';
  var n=document.createElement('strong');n.textContent=sl.info.name;n.style.color=HERO_COL[sl.info.classId]||'#fff';
  var s1=document.createElement('small');s1.textContent='Level '+sl.info.level+' '+(HERO_NAMES[sl.info.classId]||sl.info.classId)+'  -  '+sl.info.where;
  var s0=document.createElement('em');s0.textContent='SLOT '+sl.n;
  card.appendChild(s0);card.appendChild(n);card.appendChild(s1);
  card.onclick=function(){el('mp-chars').classList.add('mp-hidden');MP.character=SG.getCharacter(sl.n);done();};
  box.appendChild(card);
 });
 var nc=document.createElement('div');nc.className='mp-char mp-newchar';
 if(free>0){
  nc.innerHTML='<strong>NEW CHARACTER</strong><div class="mp-line"><label>Name<input id="mp-newname" maxlength="22" placeholder="Adventurer" autocomplete="nickname"></label>'
   +'<label>Hero<select id="mp-newhero"><option value="swordsman">Swordsman</option><option value="wizard">Wizard</option><option value="necromancer">Necromancer</option><option value="thief">Thief</option></select></label></div>'
   +'<button id="mp-newgo">CREATE AND PLAY</button>';
 }else nc.innerHTML='<strong>NEW CHARACTER</strong><small>All 5 slots are full. Delete a save from the single player Continue screen to make room.</small>';
 box.appendChild(nc);
 var go=el('mp-newgo');
 if(go)go.onclick=function(){
  var nm=(el('mp-newname').value||'').trim().slice(0,22)||'Adventurer',hero=el('mp-newhero').value,slot=SG.createCharacter(hero,nm);
  if(!slot){message('Could not create the character (all slots full)');return;}
  el('mp-chars').classList.add('mp-hidden');MP.character=SG.getCharacter(slot);done();
 };
 el('mp-chars').classList.remove('mp-hidden');
}
function netChoice(){return el('mp-net')&&el('mp-net').value==='server'?'server':'direct';}
function startRoom(isPrivate,chosen){
 if(!chosen)return pickCharacter(function(){startRoom(isPrivate,true);});
 var i=identity();
 if(netChoice()==='direct'){
  if(!(CC.P2P&&CC.P2P.available()))return setError('Direct play is not available in this browser. Choose "Game server".');
  sessionClear();useLink('p2p-host');
 }else useLink('ws');
 message('Creating room...');
 emit({type:'create',name:i.name,hero:i.hero,private:!!isPrivate,mode:el('mp-mode').value});
}
function joinRoom(code,chosen){
 code=String(code||'').trim().toUpperCase();
 if(!/^[0-9A-F]{6}$/.test(code))return message('Enter a six-character room code');
 if(!chosen)return pickCharacter(function(){joinRoom(code,true);});
 var i=identity();
 if(netChoice()==='direct'){
  if(!(CC.P2P&&CC.P2P.available()))return setError('Direct play is not available in this browser. Choose "Game server".');
  sessionClear();
  if(ws){ws.onclose=null;try{ws.close();}catch(_){}ws=null;MP.connected=false;}
  useLink('p2p-join',code);
 }else useLink('ws');
 message('Joining '+code+'...');
 emit({type:'join',code:code,name:i.name,hero:i.hero});
}
function rooms(items){
 var box=el('mp-rooms');box.textContent='';
 if(!items||!items.length){var none=document.createElement('div');none.className='mp-empty';
  none.textContent='No open games. Create an adventure and invite someone!';box.appendChild(none);return;}
 items.forEach(function(room){
  var row=document.createElement('div');row.className='mp-room';
  var left=document.createElement('div'),h=document.createElement('strong'),s=document.createElement('small');
  h.textContent=(room.mode==='defense'?'🛡 ':'')+room.title;s.textContent=(room.mode==='defense'?'Town Defense · ':'Explore · ')+room.host.name+' · '+room.host.hero+' · 1 / 2 players';
  left.appendChild(h);left.appendChild(s);row.appendChild(left);
  var button=document.createElement('button');button.textContent='JOIN';
  button.onclick=function(){useLink('ws');joinRoom(room.code);};row.appendChild(button);box.appendChild(row);
 });
}
function hud(){
 var other=MP.room&&(MP.role==='host'?MP.room.guest:MP.room.host);
 el('mp-code').textContent=MP.code||'------';
 el('mp-peer').textContent=other?other.name+' · '+other.hero:'Waiting for adventurer';
 el('mp-online').textContent=MP.connected?'● ONLINE':'● RECONNECTING';
 el('mp-dot').style.color=MP.connected?'#81daaa':'#ff9a7a';
 el('mp-hud').classList.toggle('mp-hidden',!MP.active||!playing);
}
function start(scene){
 if(playing)return;
 var player=MP.role==='host'?MP.room.host:MP.room.guest;
 if(!player||!CC.beginCoop)return setError('Game not ready');
 // Joining never loads the owner's local save; the game creates a fresh hero.
 playing=true;
 if(!scene&&MP.room)scene=MP.room.mode==='defense'?{area:'defense',floor:1}:{area:'forest',floor:1}; // Explore starts in the Giant Forest
 CC.beginCoop(player.hero,scene,MP.character);
 el('mp-lobby').classList.add('mp-hidden');
 el('mp-hud').classList.remove('mp-hidden');
 opened=false;hud();
 if(MP.role==='host')broadcastScene();
}
function awayNow(){var s=CC.state;return !!s&&(s.mode==='town'||!!(CC.Camp&&CC.Camp.isInside&&CC.Camp.isInside()));}
function sceneKey(sc){return sc.area+':'+sc.floor+':'+(sc.tf||1)+':'+sc.seed;}
function broadcastScene(){
 if(!MP.active||MP.role!=='host'||!CC.state||SCENES.indexOf(CC.state.area)<0)return;
 var s=CC.state,d=CC.Dungeon;
 if(!d||!Number.isFinite(d.seed))return;
 if(s.player&&!awayNow())hostPos={x:s.player.x,y:s.player.y};
 var scene={area:s.area,floor:s.floor,seed:d.seed,tf:s.treeFloor||1};
 if(hostPos){scene.px=Math.round(hostPos.x);scene.py=Math.round(hostPos.y);}
 lastScene=sceneKey(scene);MP.scene=scene;
 send({type:'scene',scene:scene});
 var data=snapshot('init');if(data){send({type:'snapshot',snapshot:data});NET.needInit=false;NET.keyClock=0;}
}
function incomingScene(scene){
 if(!scene||SCENES.indexOf(scene.area)<0||MP.role!=='guest')return;
 var key=sceneKey(scene);
 MP.scene=scene;
 if(!playing){start(scene);lastScene=key;return;}
 if(key===lastScene)return;
 lastScene=key;
 if(awayNow())return; // in town or a tent: we catch up with the leader when we step back out
 CC.syncCoopScene(scene);
}
// back from a tent or town: be in whatever world the leader is in now
MP.resync=function(){
 var sc=MP.scene,s=CC.state;
 if(MP.role!=='guest'||!sc||!playing||awayNow())return false;
 if(s.area===sc.area&&(s.floor||1)===sc.floor&&(s.treeFloor||1)===(sc.tf||1)&&CC.Dungeon&&CC.Dungeon.seed===sc.seed)return false;
 CC.syncCoopScene(sc);return true;
};
// through the town portal back to the party: arrive at your portal if it is in the leader's world, else beside the leader
MP.rejoin=function(portal){
 var sc=MP.scene;if(MP.role!=='guest'||!sc||!CC.syncCoopScene)return false;
 var at=portal&&portal.area===sc.area&&(portal.floor||1)===sc.floor&&(sc.area!=='tree-ascent'||(portal.treeFloor||1)===(sc.tf||1))?portal:null;
 return CC.syncCoopScene(sc,at&&at.x,at&&at.y);
};
var enemyFields=['id','type','name','x','y','r','hp','maxHp','dmg','spd','state',
 't','cd','face','anim','asleep','dead','boss','bossIdx','phase','def','bar',
 'stitched','miniBoss','elite','affixes','shield','slow','stunT','contact',
 'dangerous','tele','ang','atk','invuln','flash','burn','color','floor',
 'ghost','eth','look','size','horrorParts','bloodTime','collapsed','weaselMove',
 'weaselPhase','weaselGlow','weaselElapsed','weaselFx','weaselTarget','weaselAngle',
 'heartPhase','introDone','rage','poison','fireproof','mkGrip','mkFx','orbs','trail','enraged','mkSt','lostN'];
function fields(v,names){
 var o={};if(!v)return o;
 names.forEach(function(n){if(v[n]!==undefined&&typeof v[n]!=='function')o[n]=r1(v[n]);});return o;
}
function r1(v){return typeof v==='number'&&isFinite(v)?Math.round(v*10)/10:v;}
// Fields that change while a monster lives. A snapshot sends only the ones that changed since the last one (delta); the rest of an enemy is sent once, when the partner first meets it.
var FAST=['x','y','hp','state','t','face','tele','dangerous','invuln','stunT','slow','burn','shield','ang','atk','phase','collapsed','asleep','boss','weaselMove','weaselPhase','weaselGlow','weaselElapsed','weaselFx','weaselTarget','weaselAngle','heartPhase','introDone','rage','enraged','mkSt','mkGrip','mkFx','orbs','trail','lostN','bar','look','horrorParts','eth','def','poison','contact','flash'];
function sig(v){return v!==null&&typeof v==='object'?JSON.stringify(v):v;}
function baseline(e){var o={};for(var i=0;i<FAST.length;i++){var v=e[FAST[i]];if(v!==undefined&&typeof v!=='function')o[FAST[i]]=sig(r1(v));}return o;}
function delta(e,b){
 var o=null;
 for(var i=0;i<FAST.length;i++){
  var n=FAST[i],v=e[n];if(typeof v==='function')continue;
  if(v===undefined){if(b[n]===undefined||b[n]===null)continue;v=null;}
  v=r1(v);var g=sig(v);
  if(b[n]!==g){(o=o||{})[n]=v;b[n]=g;}
 }
 return o;
}
function heroList(){var h=[],p=CC.state&&CC.state.player;if(p&&!awayNow())h.push(p);if(MP.remote)h.push(MP.remote);return h;}
function nearHero(e,h,r){for(var i=0;i<h.length;i++)if(Math.abs(e.x-h[i].x)<r&&Math.abs(e.y-h[i].y)<r)return true;return false;}
function curSceneKey(){var s=CC.state;return sceneKey({area:s.area,floor:s.floor,tf:s.treeFloor||1,seed:CC.Dungeon&&CC.Dungeon.seed});}
// A fingerprint of the world generators and monster tables: if the two phones disagree, they are running different versions of the game.
function buildId(){
 if(NET.bid)return NET.bid;
 var s='',E=CC.Enemies;
 ['Forest','Plains','Dungeon','RockPass','AbandonedVillage','TreeTunnel','Defense','TreeAscent'].forEach(function(k){var o=CC[k];if(o&&typeof o.generate==='function')s+=o.generate.toString();});
 if(E){if(E.spawnForFloor)s+=E.spawnForFloor.toString();if(E.TYPES)s+=Object.keys(E.TYPES).join(',');}
 var h=0;for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;
 return NET.bid=(h>>>0).toString(36);
}
function checkBuild(){
 if(NET.warned||!NET.peerBid||NET.peerBid===buildId())return;
 NET.warned=true;
 var t='Your partner is running a different version of Emberdeep. Reload the page on BOTH phones, or the two worlds will not match.';
 chatItem({name:'System',text:t});setError(t);
 if(CC.fx&&CC.state.player&&CC.fx.text)CC.fx.text(CC.state.player.x,CC.state.player.y-34,'DIFFERENT GAME VERSIONS - RELOAD','#ff9a7a',11);
}
// kind: 'init' = everything (a new partner, a new scene, a request), 'key' = a full refresh of the nearby monsters every few seconds, 'delta' = only what changed nearby
function snapshot(kind){
 var E=CC.Enemies,L=CC.Loot;
 if(!E)return null;
 kind=kind||'init';
 var heroes=heroList(),alive=[],aliveSet=new Set(),out=[],rm=[],i;
 for(i=0;i<E.list.length;i++){var q=E.list[i];if(!q.dead){alive.push(q);aliveSet.add(q.id);}}
 if(alive.length>150)alive.length=150;
 if(kind==='init')NET.known.clear();
 for(i=0;i<alive.length;i++){
  var e=alive[i],b=NET.known.get(e.id);
  if(!b){out.push(fields(e,enemyFields));NET.known.set(e.id,baseline(e));continue;} // new to the partner: send all of it
  var near=nearHero(e,heroes,e.asleep?520:900)||e.boss||e.miniBoss||e.stitched;
  if(!near)continue; // far away and asleep (or far away): nothing the partner could see changed
  if(kind==='key'){out.push(fields(e,enemyFields));NET.known.set(e.id,baseline(e));continue;}
  var d=delta(e,b);if(d){d.id=e.id;out.push(d);}
 }
 NET.known.forEach(function(v,id){if(!aliveSet.has(id)){rm.push(id);NET.known.delete(id);}});
 var snap={enemies:out,
  projectiles:E.projectiles.slice(0,120).map(function(p){return fields(p,['x','y','vx','vy','r','life','ring','color','fx','kind','hostile','ghost','dmg']);}),
  zones:E.zones.slice(0,24).map(function(z){return fields(z,['x','y','rad','t','max','dmg','kind']);}),
  chests:(CC.Dungeon&&CC.Dungeon.chests||[]).map(function(c){return c.opened?1:0;}).join(''),
  bossId:E.boss&&E.boss.id,at:Date.now(),sk:curSceneKey(),bid:buildId()};
 if(kind==='init')snap.full=1;else snap.d=1;
 if(rm.length)snap.rm=rm;
 var drops=(L&&L.drops||[]).slice(0,80),dsig=drops.map(function(d){return d.mpId||'';}).join(','),now=Date.now(),fresh=drops.some(function(d){return !d.mpId;});
 if(fresh||kind==='init'||dsig!==NET.dropSig||now-NET.dropAt>3000){ // loot changes rarely: send it when it does (and now and then, for safety)
  snap.drops=drops.map(function(d){
   if(!d.mpId)d.mpId='d'+Math.random().toString(36).slice(2,11);
   return fields(d,['mpId','kind','x','y','z','age','amount','item','rarity','color','seed']);
  });
  NET.dropSig=drops.map(function(d){return d.mpId;}).join(',');NET.dropAt=now;
 }
 NET.snapKind=kind;
 return snap;
}
function sameWorld(sk){return sk===curSceneKey();}
function resyncTo(sk){
 var now=performance.now();if(now-NET.resyncAt<3000)return;NET.resyncAt=now;
 var p=String(sk).split(':'),scene={area:p[0],floor:parseInt(p[1],10)||1,tf:parseInt(p[2],10)||1,seed:Number(p[3])};
 if(SCENES.indexOf(scene.area)<0||!Number.isFinite(scene.seed)||!CC.syncCoopScene)return;
 MP.scene=Object.assign({},MP.scene||{},scene);NET.needFull=true;
 if(CC.state.player&&CC.fx&&CC.fx.text)CC.fx.text(CC.state.player.x,CC.state.player.y-30,'SYNCING WORLD','#9fe3ff',10);
 CC.syncCoopScene(scene);
}
function applySnapshot(data){
 if(MP.role!=='guest'||!playing||!data||!Array.isArray(data.enemies)||awayNow())return;
 var E=CC.Enemies,L=CC.Loot;
 if(!E)return;
 NET.snapAt=performance.now();
 if(data.bid){NET.peerBid=data.bid;checkBuild();}
 if(data.sk&&!sameWorld(data.sk)){resyncTo(data.sk);return;} // we are standing in a different world from the host: go to theirs
 if(!data.d){ // a full snapshot (the first one, a new scene, or an older host): replace the monster list
  NET.needFull=false;
  var old=new Map(E.list.map(function(e){return [e.id,e];}));
  E.list=data.enemies.map(function(net){
   var e=old.get(net.id)||{},oldX=e.x,oldY=e.y;
   Object.assign(e,net);
   if(Number.isFinite(oldX)&&Number.isFinite(oldY)){
    e.tx=e.x;e.ty=e.y;e.x=oldX;e.y=oldY;
   }else{e.tx=e.x;e.ty=e.y;}
   return e;
  });
 }else{ // a delta: merge the changes into the monsters we already have
  var byId=new Map(E.list.map(function(e){return [e.id,e];}));
  data.enemies.forEach(function(net){
   var e=byId.get(net.id);
   if(!e){if(net.type===undefined)return;e=Object.assign({},net);e.tx=e.x;e.ty=e.y;E.list.push(e);byId.set(net.id,e);return;}
   var ox=e.x,oy=e.y;
   Object.assign(e,net);
   if(net.x!==undefined){e.tx=net.x;if(Number.isFinite(ox))e.x=ox;}
   if(net.y!==undefined){e.ty=net.y;if(Number.isFinite(oy))e.y=oy;}
   if(Number.isFinite(e.tx)&&Number.isFinite(e.ty)&&Math.hypot(e.tx-e.x,e.ty-e.y)>160){e.x=e.tx;e.y=e.ty;} // a teleport is a jump, not a glide
  });
  if(data.rm&&data.rm.length){var gone=new Set(data.rm);E.list=E.list.filter(function(e){return !gone.has(e.id);});}
 }
 E.boss=E.list.find(function(e){return e.boss&&e.id===data.bossId;})||null;
 E.bossBar=E.boss&&E.boss.bar?Object.assign({},E.boss.bar,{pct:E.boss.hp/Math.max(1,E.boss.maxHp)}):null;
 if(!E.bossBar){var stitch=E.list.find(function(e){return e.stitched;});
  if(stitch)E.bossBar={name:'The Patchwork Horror',pct:stitch.hp/Math.max(1,stitch.maxHp),phase:1,kind:'patchwork',color:'#b465e4'};
 }
 if(Array.isArray(data.projectiles))E.projectiles=data.projectiles;
 if(Array.isArray(data.zones))E.zones=data.zones;
 if(L&&Array.isArray(data.drops))L.drops=data.drops;
 if(typeof data.chests==='string'&&CC.Dungeon&&CC.Dungeon.chests)data.chests.split('').forEach(function(f,i){var c=CC.Dungeon.chests[i];if(c&&f==='1'&&!c.opened)CC.Dungeon.openChest(c);});
}
function chatItem(m){
 chat.push(m);if(chat.length>60)chat.shift();
 var list=el('mp-chat-lines');list.textContent='';
 chat.forEach(function(row){
  var line=document.createElement('div'),name=document.createElement('b');
  name.textContent=(row.name||'Adventurer')+': ';
  name.style.color=row.from==='host'?'#ffd18a':'#a7d9ff';
  line.appendChild(name);line.appendChild(document.createTextNode(row.text||''));list.appendChild(line);
 });
 list.scrollTop=list.scrollHeight;
}
function reward(r){
 var s=CC.state,p=s.player;if(!p||!r)return;
 if(r.kind==='item'&&r.item){
  s.inventory=s.inventory||[];
  var L=CC.Loot,it=r.item,say=function(t,c,z){if(CC.fx&&CC.fx.text)CC.fx.text(p.x,p.y-22,t,c,z||11);};
  if(L&&L.autoEquip&&L.autoEquip(p,it))say('Equipped '+it.name,it.color||'#fff',11);
  else if(L&&L.stash){var sr=L.stash(it,p);
   if(sr.action==='swapped')say('Swapped for '+it.name+' (sold '+sr.sold.name+' +'+sr.gold+')',it.color||'#fff',10);
   else if(sr.action==='sold')say('Sold +'+(it.value||0),'#ffd24a');
   else say(it.name,it.color||'#fff',it.rarity>=3?12:10);}
  else if(s.inventory.length>=40){s.gold=(s.gold||0)+(it.value||0);say('Sold +'+(it.value||0),'#ffd24a');}
  else{s.inventory.push(it);say(it.name,it.color||'#fff',it.rarity>=3?12:10);}
  if(CC.fx&&CC.fx.burst)CC.fx.burst(p.x,p.y,it.color||'#fff',6+(it.rarity||0)*3,80);
 }else if(r.kind==='gold')s.gold=(s.gold||0)+(r.amount||0);
 else if(r.kind==='potion'){s.potions=(s.potions||0)+1;if(CC.fx)CC.fx.text(p.x,p.y-22,'Health Potion','#ff9ae0',10);}
 else if(r.kind==='mpotion'){s.manaPotions=(s.manaPotions||0)+1;if(CC.fx)CC.fx.text(p.x,p.y-22,'Mana Potion','#7ec2ff',10);}
 else if(r.kind==='hp')p.hp=Math.min(p.maxHp,p.hp+(r.amount||0));
 else if(r.kind==='mana')p.mana=Math.min(p.maxMana,p.mana+(r.amount||0));
}
function guestPickup(id){
 if(MP.role!=='host'||!MP.remote||!CC.Loot)return;
 var arr=CC.Loot.drops,idx=arr.findIndex(function(d){return d.mpId===id;});
 if(idx<0)return;
 var d=arr[idx];
 if(Math.hypot(d.x-MP.remote.x,d.y-MP.remote.y)>35)return;
 arr.splice(idx,1);send({type:'pickup_grant',id,reward:{kind:d.kind,amount:d.amount,item:d.item}});
}
function offer(){
 if(!MP.room||!MP.room.guest)return tradeStatus('Wait for your partner before trading');
 var items=CC.state.inventory||[],idx=Number(el('mp-trade-items').value),it=items[idx];
 if(!it)return tradeStatus('Select an item in your inventory');
 if(!it.mpTradeId)it.mpTradeId='item'+Math.random().toString(36).slice(2)+Date.now();
 tradeStatus('Offer sent. Waiting for your partner...');
 send({type:'trade_offer',item:it});
}
function tradeStatus(s){el('mp-trade-status').textContent=s;}
function refreshTrade(){
 var select=el('mp-trade-items');select.textContent='';
 (CC.state.inventory||[]).forEach(function(it,i){
  var opt=document.createElement('option');opt.value=i;
  opt.textContent=(it.name||'Item')+' · '+(it.slot||'gear');select.appendChild(opt);
 });
}
function showTrade(){
 if(!playing)return;
 el('mp-trade').classList.remove('mp-hidden');refreshTrade();
}
function onTrade(msg){
 if(msg.type==='trade_offer'){
  trade=msg;showTrade();
  if(msg.from===MP.role){tradeStatus('Waiting for partner to accept '+(msg.item.name||'item'));
   el('mp-trade-answer').classList.add('mp-hidden');
  }else{tradeStatus('Offer received: '+(msg.item.name||'item'));
   el('mp-trade-answer').classList.remove('mp-hidden');}
 }else if(msg.type==='trade_commit'){
  if(msg.from===MP.role){
   var inv=CC.state.inventory||[],idx=inv.findIndex(function(it){return it.mpTradeId===msg.item.mpTradeId;});
   if(idx>=0)inv.splice(idx,1);
   tradeStatus('Item sent successfully.');
  }else if(msg.to===MP.role){reward({kind:'item',item:msg.item});tradeStatus('Received '+(msg.item.name||'item'));}
  trade=null;el('mp-trade-answer').classList.add('mp-hidden');refreshTrade();
 }else if(msg.type==='trade_decline'){trade=null;tradeStatus('Offer declined');
  el('mp-trade-answer').classList.add('mp-hidden');}
}
function handle(m){
 if(m.type==='rooms'){rooms(m.rooms);return;}
 if(m.type==='error'){setError(m.message||'Server error');if(/expired|invalid/i.test(m.message||''))sessionClear();return;}
 if(m.type==='welcome'){
  session={code:m.code,token:m.token,role:m.role};sessionSave();
  MP.active=true;MP.role=m.role;MP.code=m.code;MP.room=m.room;MP.connected=true;
  if(m.role==='host'){if(!playing)start();}
  else if(m.scene)incomingScene(m.scene);
  else message('Joined. Waiting for host to start the world...');
  if(m.snapshot)applySnapshot(m.snapshot);
  if(m.trade)onTrade(Object.assign({type:'trade_offer'},m.trade));
  hud();return;
 }
 if(!MP.active)return;
 if(m.type==='players'){MP.room=m.room;if(MP.role==='host'&&m.room&&m.room.guest)NET.needInit=true;hud();return;}
 if(m.type==='position'){
  if(m.from===MP.role||!m.player)return;
  var hero=m.player,prev=MP.remote;
  MP.remote=Object.assign(prev||{r:8},hero);
  MP.remote.color=colors[MP.remote.classId]||'#ddd';
  lastRemote=Date.now();
  if(Number.isFinite(hero.x)&&Number.isFinite(hero.y)){
   samples.push({t:performance.now(),x:hero.x,y:hero.y,s:hero});
   if(samples.length>14)samples.shift();
  }
  return;
 }
 if(m.type==='fx'){
  if(m.from===MP.role||!playing)return;
  var d=m.d,C=CC.Classes;
  if(m.k==='fx'&&C&&C.addRemoteFx)C.addRemoteFx(d);
  else if(m.k==='pr'&&C&&C.addRemoteProjectile)C.addRemoteProjectile(d);
  else if(m.k==='sc'&&CC.SpellCharge&&CC.SpellCharge.addRemote){updateView(performance.now());CC.SpellCharge.addRemote(d,MP.view);}
  else if(m.k==='df'&&CC.Defense&&CC.Defense.applyState&&MP.role==='guest')CC.Defense.applyState(d);
  else if(m.k==='tb'&&CC.Defense&&CC.Defense.applyBolt&&MP.role==='guest')CC.Defense.applyBolt(d);
  else if(m.k==='opt'&&MP.role==='guest'&&d){
   var gi=!!d.gi;
   if(gi!==MP.options.guestInvuln&&CC.state.player&&CC.fx&&CC.fx.text)
    CC.fx.text(CC.state.player.x,CC.state.player.y-30,gi?'INVULNERABLE':'VULNERABLE',gi?'#9fe3ff':'#ffb0a0',11);
   MP.options.guestInvuln=gi;
  }
  else if(m.k==='tc'&&MP.role==='host'&&d){
   if(d.ch!==undefined)hostOpenChest(d.ch);
   else if(d.dn)hostDescend();
   else if(d.ta)hostTree();
   else if(CC.Defense&&CC.Defense.onCommand)CC.Defense.onCommand(d);
  }
  else if(m.k==='ch'&&MP.role==='guest'&&d&&CC.Dungeon&&CC.Dungeon.chests){var cc=CC.Dungeon.chests[d.i];if(cc&&!cc.opened)CC.Dungeon.openChest(cc);}
  else if((m.k==='qs'||m.k==='qe')&&MP.role==='guest'&&d&&CC.EggQuest&&CC.EggQuest.coopSync)CC.EggQuest.coopSync(d);
  else if(m.k==='gp'&&MP.role==='guest'&&d&&CC.state&&CC.state.player){var gpl=CC.state.player;gpl.psyT=Math.min(4,d.t||0);gpl.psyPull=d.n?null:{x:d.x,y:d.y};} // the Grinning Mask's psychic grip
  else if(m.k==='vf'&&d&&CC.Vfx&&CC.Vfx.addRemote)CC.Vfx.addRemote(d); // the partner's spell art (nova rings, explosions, lightning)
  else if(m.k==='pg'&&d){NET.peerBid=typeof d.b==='string'?d.b:NET.peerBid;checkBuild();sendFx('po',{t:d.t});}
  else if(m.k==='po'&&d&&Number.isFinite(d.t)){MP.rtt=(Math.round(performance.now())%20000-d.t+20000)%20000;}
  else if(m.k==='rq'&&MP.role==='host'){NET.needInit=true;}
  else if(m.k==='mn'&&d&&Array.isArray(d.l)){
   remoteMinions=d.l.map(function(q,i){var old=remoteMinions[i]||{};
    return {x:q.x,y:q.y,face:q.f>=0?1:-1,hp:q.h,maxHp:q.m||1,life:9,anim:old.anim||0,spawn:0,atkCd:0,charged:!!q.c};});
   remoteMinionsAt=performance.now();
  }
  return;
 }
 if(m.type==='scene'){incomingScene(m.scene);return;}
 if(m.type==='snapshot'){applySnapshot(m.snapshot);return;}
 if(m.type==='chat'){chatItem(m);return;}
 if(m.type==='kill'&&MP.role==='guest'&&playing){
  if(CC.Classes&&CC.Classes.gainXp)CC.Classes.gainXp(m.xp);
  return;
 }
 if(m.type==='hit'&&MP.role==='host'){
  var E=CC.Enemies,e=E&&E.list.find(function(item){return item.id===m.id&&!item.dead;});
  if(e&&MP.remote&&Math.hypot(e.x-MP.remote.x,e.y-MP.remote.y)<380)
   E.damage(e,Math.min(450,m.damage),m.kind||'slash');
  return;
 }
 if(m.type==='drop_item'&&MP.role==='host'&&m.item&&MP.remote&&CC.Loot&&CC.Loot._spawn){
  var di=m.item,dd=CC.Loot._spawn('item',MP.remote.x+(MP.remote.face||1)*14,MP.remote.y+4,{item:di,rarity:di.rarity,color:di.color});
  dd.age=-2.5;dd.vx=(MP.remote.face||1)*40;dd.vy=10;CC.Loot.drops.push(dd);return;
 }
 if(m.type==='pickup_request'&&MP.role==='host'){guestPickup(m.id);return;}
 if(m.type==='pickup_grant'&&m.to===MP.role){reward(m.reward);delete pendingPickups[m.id];return;}
 if(m.type==='damage_guest'&&MP.role==='guest'){
  if(MP.options.guestInvuln)return;
  if(CC.state.player&&CC.Classes&&CC.Classes.damage)CC.Classes.damage(CC.state.player,m.damage);
  return;
 }
 if(m.type==='trade_offer'||m.type==='trade_commit'||m.type==='trade_decline'){onTrade(m);return;}
 if(m.type==='presence'&&m.online===false&&m.from!==MP.role){
  chatItem({name:'System',text:'Partner disconnected; reconnecting is allowed.'});return;
 }
 if(m.type==='closed'||m.type==='left'){stop(false);setError(m.message||'Room closed.');}
}
function stop(notify){
 try{if(CC.SaveGame&&CC.state&&CC.state.coop)CC.SaveGame.saveCharacter();}catch(_){}
 if(notify)send({type:'leave'});
 MP.active=false;MP.connected=false;MP.role=null;MP.code=null;MP.room=null;MP.remote=null;MP.view=null;samples=[];remoteMinions=[];MP.options.guestInvuln=false;
 playing=false;opened=false;lastScene='';trade=null;pendingPickups={};MP.scene=null;hostPos=null;sessionClear();
 el('mp-lobby').classList.add('mp-hidden');el('mp-hud').classList.add('mp-hidden');
 el('mp-chat').classList.add('mp-hidden');el('mp-trade').classList.add('mp-hidden');el('mp-menu').classList.add('mp-hidden');
 if(ws){ws.onclose=null;ws.close();ws=null;}
 if(CC.state)CC.state.mode='title';
}
// 0 = out in the shared world, 1 = in town, 10..13 = inside a camp (owner and tent/outside); partners only see each other in the same place
function myScene(){var C=CC.Camp;if(C&&C.isInside&&C.isInside())return C.tag();return CC.state&&CC.state.mode==='town'?1:0;}
function sameScene(){return !!MP.remote&&(MP.remote.sc|0)===myScene();}
function posData(ext){
 var p=CC.state.player;
 if(!p)return null;
 var o={x:p.x,y:p.y,hp:p.hp,maxHp:p.maxHp,mana:p.mana,maxMana:p.maxMana,
  classId:p.classId,level:p.level,face:p.face||1,anim:p.anim||0,
  moving:!!p.moving,atkAnim:p.atkAnim||0,swingAng:p.swingAng||0,swingSign:p.swingSign||1,
  castFlash:p.castFlash||0,whirlT:p.whirlT||0,dashT:p.dashT||0,
  pwb:p.pw?((p.pw.rapid>0?1:0)|(p.pw.explode>0?2:0)|(p.pw.shield>0?4:0)):0,sc:myScene()};
 for(var pk in o)if(typeof o[pk]==='number')o[pk]=r1(o[pk]);
 if(ext){ // our portal and camp, a couple of times a second
  var pt=CC.Portal&&CC.Portal.share?CC.Portal.share():{a:0};
  o.pta=pt.a;if(pt.a){o.ptx=pt.x;o.pty=pt.y;o.ptr=pt.r;o.ptf=pt.f;o.ptt=pt.t;}
  var cp=CC.Camp&&CC.Camp.shareInfo?CC.Camp.shareInfo():null;
  o.cpa=cp?cp.a:-1;if(cp){o.cpx=Math.round(cp.x);o.cpy=Math.round(cp.y);o.cpf=cp.f;o.cpt=cp.t;}
 }
 return o;
}
// Every second: our send/receive rates, and a ping every two seconds. Tap the ONLINE label (or open the game with ?net=1) to show the readout.
function netTick(dt){
 NET.rateAt+=dt;NET.pingClock+=dt;
 if(NET.pingClock>2){NET.pingClock=0;sendFx('pg',{t:Math.round(performance.now())%20000,b:buildId()});}
 if(NET.rateAt<1)return;
 var span=NET.rateAt;NET.rateAt=0;
 NET.rateOut=(NET.bytesOut-NET.lastOut)/span;NET.rateIn=(NET.bytesIn-NET.lastIn)/span;NET.lastOut=NET.bytesOut;NET.lastIn=NET.bytesIn;
 var box=el('mp-netstat');if(!box)return;
 box.style.display=NET.show?'block':'none';if(!NET.show)return;
 var E=CC.Enemies,age=NET.snapAt?((performance.now()-NET.snapAt)/1000).toFixed(1)+'s':'-',peer=MP.role==='host'?(MP.remote?'partner seen':'no partner pos'):(MP.remote?'host seen':'no host pos');
 box.textContent=MP.role+'  ping '+(MP.rtt===undefined?'-':MP.rtt+'ms')+'  up '+(NET.rateOut/1024).toFixed(1)+'KB/s  down '+(NET.rateIn/1024).toFixed(1)+'KB/s  snap '+age+'  skipped '+NET.drops+'\n'
  +'monsters '+(E&&E.list.length||0)+'  '+peer+'  queue '+Math.round((ws&&ws.bufferedAmount||0)/1024)+'KB  link '+linkKind+'\n'
  +'world '+curSceneKey()+'  build '+buildId()+(NET.peerBid?(NET.peerBid===buildId()?' (same as partner)':' (DIFFERENT from partner '+NET.peerBid+')'):'');
}
function tick(dt){
 if(!playing||!MP.active||(CC.state.mode!=='dungeon'&&CC.state.mode!=='town'&&!(CC.state.mode==='dead'&&CC.state.area==='defense')))return;
 var away=awayNow();
 positionClock+=dt;snapshotClock+=dt;roomClock+=dt;pickupClock+=dt;extClock+=dt;qsClock+=dt;
 if(MP.role==='host'&&MP.remote&&MP.remote.invuln>0)
  MP.remote.invuln=Math.max(0,MP.remote.invuln-dt);
 if(MP.role==='guest'&&!away){
  var pj=CC.Enemies&&CC.Enemies.projectiles||[];for(var pi=0;pi<pj.length;pi++){var pq=pj[pi];if(Number.isFinite(pq.vx)&&Number.isFinite(pq.vy)){pq.x+=pq.vx*dt;pq.y+=pq.vy*dt;}} // shots keep flying between snapshots
  if(NET.needFull&&performance.now()-NET.rqAt>1500){NET.rqAt=performance.now();sendFx('rq',{});} // ask the host for the whole world until we have it
  (CC.Enemies&&CC.Enemies.list||[]).forEach(function(e){
   e.anim=(e.anim||0)+dt;
   if(Number.isFinite(e.tx)){
    e.x+=(e.tx-e.x)*Math.min(1,dt*16);e.y+=(e.ty-e.y)*Math.min(1,dt*16);
   }
  });
 }
 if(!ready())return;
 netTick(dt);
 if(positionClock>.05){positionClock=0;var wantExt=extClock>.5;if(wantExt)extClock=0;if(!congested())send({type:'position',player:posData(wantExt)});else NET.drops++;}
 optClock+=dt;
 if(MP.role==='host'&&optClock>2){optClock=0;if(MP.room&&MP.room.guest)sendFx('opt',{gi:MP.options.guestInvuln?1:0});}
 minionClock+=dt;
 if(minionClock>.12){minionClock=0;
  var mm=(CC.Classes&&CC.Classes.minions)||[];
  if(mm.length||MP._sentMinions){MP._sentMinions=mm.length>0;
   sendFx('mn',{l:mm.slice(0,8).map(function(q){return {x:Math.round(q.x*10)/10,y:Math.round(q.y*10)/10,f:q.face||1,
    h:Math.round(q.hp),m:Math.round(q.maxHp),c:q.charged?1:0};})});}
 }
 if(MP.role==='host'){
  if(!away&&CC.state.player)hostPos={x:CC.state.player.x,y:CC.state.player.y};
  if(roomClock>.5){roomClock=0;
   var sk=sceneKey({area:CC.state.area,floor:CC.state.floor,tf:CC.state.treeFloor||1,seed:CC.Dungeon&&CC.Dungeon.seed});
   if(sk!==lastScene)broadcastScene();
  }
  if(qsClock>3){qsClock=0;if(MP.room&&MP.room.guest&&CC.EggQuest&&CC.EggQuest.stage)sendFx('qs',{s:CC.EggQuest.stage()});} // everyone follows the leader's quest
  if(snapshotClock>.1){snapshotClock=0;NET.keyClock+=.1;
   var kind=NET.needInit?'init':NET.keyClock>4?'key':'delta';
   if(kind==='delta'&&congested())NET.drops++; // the link is behind: skip this one, the next carries the newest
   else{var snap=snapshot(kind);if(snap){send({type:'snapshot',snapshot:snap});if(kind!=='delta')NET.keyClock=0;if(kind==='init')NET.needInit=false;}}
  }
 }else if(pickupClock>.23&&!away){
  pickupClock=0;var L=CC.Loot,p=CC.state.player;
  if(L&&p)(L.drops||[]).forEach(function(d){
   if(d.mpId&&d.age>.5&&Math.hypot(p.x-d.x,p.y-d.y)<25){
    if(pendingPickups[d.mpId]&&Date.now()-pendingPickups[d.mpId]<1700)return;
    pendingPickups[d.mpId]=Date.now();send({type:'pickup_request',id:d.mpId});
   }
  });
 }
 if(MP.remote&&Date.now()-lastRemote>8000){MP.remote=null;MP.view=null;samples=[];}
}
// Smoothed view of the partner (also used as the owner of their following spells).
function updateView(now){
 if(!samples.length)return null;
 var rt=now-INTERP_MS,n=samples.length,a=null,b=null,i;
 for(i=n-1;i>=0;i--)if(samples[i].t<=rt){a=samples[i];b=samples[i+1]||null;break;}
 var x,y;
 if(!a){a=samples[0];x=a.x;y=a.y;}
 else if(b){
  var k=Math.max(0,Math.min(1,(rt-a.t)/Math.max(1,b.t-a.t)));
  // blink / teleport: a huge jump inside one packet gap is a jump, not a sprint
  if(Math.hypot(b.x-a.x,b.y-a.y)>56&&b.t-a.t<160)k=k<.5?0:1;
  x=a.x+(b.x-a.x)*k;y=a.y+(b.y-a.y)*k;
 }else{
  // newest sample is older than render time: coast on the last velocity for a moment
  var p0=samples[n-2],ext=Math.min(rt-a.t,140);
  if(p0&&a.t>p0.t){var vx=(a.x-p0.x)/(a.t-p0.t),vy=(a.y-p0.y)/(a.t-p0.t);
   if(Math.hypot(a.x-p0.x,a.y-p0.y)>56)vx=vy=0;
   x=a.x+vx*ext;y=a.y+vy*ext;}
  else{x=a.x;y=a.y;}
 }
 var latest=samples[n-1].s,v=MP.view,dt=Math.min(.1,Math.max(0,(now-lastViewAt)/1000));
 lastViewAt=now;
 if(!v){v=MP.view={r:8,anim:0,moving:false,movingT:0,whirlT:0,atkAnim:0,castFlash:0,bloodTime:0,
  invuln:0,flags:{},dashT:0,swingAng:0,swingSign:1,face:1,x:x,y:y};}
 var moved=Math.hypot(x-v.x,y-v.y),speed=dt>0?moved/dt:0;
 v.x=x;v.y=y;
 if(speed>14&&speed<900)v.movingT=.14;else v.movingT=Math.max(0,v.movingT-dt);
 v.moving=v.movingT>0;
 v.anim+=dt*(v.moving?1:1);
 // attack / cast timers are re-armed by each packet that reports a fresher one, then run out locally
 if(latest.atkAnim>v.atkAnim+.02){v.atkAnim=latest.atkAnim;v.swingAng=latest.swingAng||0;v.swingSign=latest.swingSign||1;}
 else v.atkAnim=Math.max(0,v.atkAnim-dt);
 if(latest.castFlash>v.castFlash+.02)v.castFlash=latest.castFlash;else v.castFlash=Math.max(0,v.castFlash-dt);
 v.whirlT=latest.whirlT>0?latest.whirlT:Math.max(0,v.whirlT-dt);
 v.dashT=latest.dashT||0;v.pwb=latest.pwb|0;
 v.face=latest.face>=0?1:-1;
 v.classId=latest.classId||v.classId;v.hp=latest.hp;v.maxHp=latest.maxHp;v.level=latest.level;
 return v;
}
function drawWorld(c,cam){
 if(!playing||!MP.remote||!MP.active)return;
 var now=performance.now(),p=updateView(now);
 if(!sameScene())return;
 if(!p)return;
 // partner's skeletons, drawn like our own
 if(remoteMinions.length&&now-remoteMinionsAt<1500&&CC.Classes&&CC.Classes.drawMinion){
  remoteMinions.forEach(function(m){m.anim+=.016;CC.Classes.drawMinion(c,m,cam);});
 }
 var x=p.x-cam.x,y=p.y-cam.y;
 if(x<-40||y<-40||x>cam.w+40||y>cam.h+40)return;
 c.save();
 var C=CC.Classes,col=colors[p.classId]||'#ddd',act=Math.max(p.castFlash,p.atkAnim*2,p.whirlT>0?.4:0);
 c.save();c.globalAlpha=.14+act*.5;c.fillStyle=col;c.beginPath();
 c.ellipse(x,y+9,12+act*12,4.5+act*4,0,0,6.2832);c.fill();c.restore();
 var sq=p.moving?1+Math.sin(p.anim*14)*.04:1+Math.sin(p.anim*3)*.015,st=p.atkAnim>0?1.08:1;
 if(p.pwb){c.save();var pt=now/1000;
  if(p.pwb&4){c.globalAlpha=.35+.15*Math.sin(pt*6);c.strokeStyle='#8fd8ff';c.lineWidth=2;c.beginPath();c.ellipse(x,y-2,15,19,0,0,6.2832);c.stroke();c.globalAlpha=.1;c.fillStyle='#8fd8ff';c.fill();}
  if(p.pwb&1){c.globalAlpha=.5;c.strokeStyle='#ffd84a';c.lineWidth=1.5;c.beginPath();c.ellipse(x,y+9,16+Math.sin(pt*12)*1.5,6,0,0,6.2832);c.stroke();}
  if(p.pwb&2){c.globalAlpha=.5;c.strokeStyle='#ff8a3a';c.lineWidth=1.5;c.beginPath();c.ellipse(x,y+9,12,4.5,0,0,6.2832);c.stroke();}
  c.restore();}
 if(MP.role==='host'&&MP.options.guestInvuln){c.save();c.globalAlpha=.28+.12*Math.sin(now/180);c.strokeStyle='#9fe3ff';c.lineWidth=1.5;
  c.beginPath();c.ellipse(x,y-2,13,17,0,0,6.2832);c.stroke();c.restore();}
 c.save();c.translate(x,y+10);c.scale(st/sq,sq*(2-st));c.translate(-x,-(y+10));
 if(C&&C.drawHero)C.drawHero(c,p,x,y);
 else{c.fillStyle=col;c.beginPath();c.arc(x,y,9,0,6.283);c.fill();}
 c.restore();
 c.font='bold 8px Georgia';c.textAlign='center';c.textBaseline='middle';
 c.fillStyle='#fff1cd';c.fillText((MP.role==='host'?MP.room?.guest?.name:MP.room?.host?.name)||'PARTNER',x,y-24);
 c.fillStyle='rgba(0,0,0,.8)';c.fillRect(x-16,y-19,32,4);
 c.fillStyle='#7fd7ab';c.fillRect(x-16,y-19,32*Math.max(0,Math.min(1,p.hp/Math.max(1,p.maxHp))),4);
 c.restore();
}
// An arrow at the edge of the screen pointing to your partner whenever they are out of view.
function drawScreen(c,W,H){
 var v=MP.view;
 if(!playing||!MP.active||!v||!CC.getCamera||!CC.state.player||!sameScene())return;
 var cam=CC.getCamera(),z=cam.zoom,me=CC.state.player;
 var sx=(v.x-cam.x)*z,sy=(v.y-cam.y)*z,m=26;
 if(sx>m&&sx<W-m&&sy>m&&sy<H-m)return; // in view
 var cx=W/2,cy=H*0.42,dx=sx-cx,dy=sy-cy,ang=Math.atan2(dy,dx);
 var ex=Math.min(W/2-m-4,Math.abs(dx)),ey=Math.min(H*0.38,Math.abs(dy));
 var t=Math.min((W/2-m-4)/Math.max(1,Math.abs(dx)),(H*0.40)/Math.max(1,Math.abs(dy)),1);
 var ax=cx+dx*t,ay=cy+dy*t,tiles=Math.round(Math.hypot(v.x-me.x,v.y-me.y)/32);
 var pulse=.7+.3*Math.sin(Date.now()/220);
 c.save();c.translate(ax,ay);
 c.save();c.rotate(ang);c.globalAlpha=.55+.4*pulse;
 c.fillStyle='#7df0ff';c.strokeStyle='#04222a';c.lineWidth=2;c.shadowColor='rgba(80,230,255,.9)';c.shadowBlur=10;
 c.beginPath();c.moveTo(13,0);c.lineTo(-8,-10);c.lineTo(-3,0);c.lineTo(-8,10);c.closePath();c.stroke();c.fill();c.restore();
 c.shadowBlur=0;c.globalAlpha=1;c.textAlign='center';c.textBaseline='middle';
 var nm=(MP.role==='host'?MP.room&&MP.room.guest&&MP.room.guest.name:MP.room&&MP.room.host&&MP.room.host.name)||'PARTNER';
 c.font='bold 10px Georgia,serif';c.lineWidth=3;c.strokeStyle='rgba(0,0,0,.85)';
 var ly=ay<H*0.3?20:-20, label=nm+'  '+tiles;
 c.strokeText(label,0,ly);c.fillStyle='#c8f8ff';c.fillText(label,0,ly);
 c.restore();
}
MP.drawScreen=drawScreen;
function hostOpenChest(i){
 var D=CC.Dungeon,g=MP.remote,c=D&&D.chests&&D.chests[i];
 if(!c||c.opened||!g||Math.hypot(g.x-c.x,g.y-c.y)>80)return;
 if(D.openChest(c)&&CC.Loot&&CC.Loot.roll)CC.Loot.roll(c,CC.state.floor,0);
 sendFx('ch',{i:i});
}
function hostDescend(){
 var s=CC.state,st=s.map&&s.map.stairs,g=MP.remote;
 if(awayNow()||!g||(g.sc|0)!==0)return; // the world waits while the leader is in town or a tent
 if(!(st&&st.x>-900&&Math.hypot(g.x-st.x,g.y-st.y)<90))return;
 if(s.area==='tree-ascent'){if(CC.TreeAscent&&CC.TreeAscent.interact)CC.TreeAscent.interact(true);return;}
 if(CC.nextFloor)CC.nextFloor();
}
function hostTree(){
 var m=CC.state.map,g=MP.remote;
 if(awayNow()||!g||(g.sc|0)!==0||!m||!m.ascentEntrance||Math.hypot(g.x-m.ascentEntrance.x,g.y-m.ascentEntrance.y)>90)return;
 if(CC.enterTreeAscent)CC.enterTreeAscent(true);
}
MP.requestTree=function(){sendFx('tc',{ta:1});};
MP.questEvent=function(d){if(MP.isHost())sendFx('qe',d);};
MP.requestChest=function(i){sendFx('tc',{ch:i});};
MP.requestDrop=function(item){if(ready())wsend(JSON.stringify({type:'drop_item',item:item}));};
MP.requestDescend=function(){sendFx('tc',{dn:1});};
function sendFx(k,d){if(playing&&MP.active&&ready())wsend(JSON.stringify({type:'fx',k:k,d:d}));}
MP.sendFx=sendFx;
function initialize(){
 var div=document.createElement('div');div.id='emberdeep-mp';
 div.innerHTML=String.raw`
 <section id="mp-lobby" class="mp-hidden" aria-label="Emberdeep multiplayer lobby">
   <div class="mp-panel">
    <header class="mp-title"><div><small>EMBERDEEP ONLINE</small><h2>ADVENTURERS' GUILD</h2></div>
      <button id="mp-back" class="mp-quiet">BACK</button></header>
    <p>Form a party of two. Explore caves together, chat and exchange items.</p>
    <div class="mp-line"><label>Game mode<select id="mp-mode"><option value="defense">Town Defense (waves)</option>
        <option value="cave">Explore: forest, tunnel, plains, caves</option></select></label>
      <label>Connection<select id="mp-net"><option value="direct">Direct (no server)</option>
        <option value="server">Game server</option></select></label></div>
    <div class="mp-actions"><button id="mp-create">CREATE OPEN GAME</button>
      <button id="mp-private">CREATE PRIVATE</button></div>
    <div class="mp-join"><input id="mp-join-code" maxlength="6" placeholder="INVITE CODE" aria-label="Room invite code">
      <button id="mp-join">JOIN BY CODE</button></div>
    <div class="mp-section"><div class="mp-between"><strong>OPEN GAMES</strong>
      <button id="mp-refresh" class="mp-quiet">REFRESH</button></div><div id="mp-rooms"></div></div>
    <div id="mp-status" role="status">Connecting...</div>
    <small id="mp-server">Direct games run on the host's phone, so the host keeps the game open. Share the 6-letter code, or use INVITE inside the game.</small>
   </div>
 </section>
 <section id="mp-chars" class="mp-hidden" aria-label="Choose your character"><div class="mp-panel">
   <header class="mp-title"><div><small>EMBERDEEP ONLINE</small><h2>CHOOSE YOUR CHARACTER</h2></div>
     <button id="mp-chars-back" class="mp-quiet">BACK</button></header>
   <p>Your single player heroes can play online too, and what they earn comes back with them.</p>
   <div id="mp-char-list"></div>
 </div></section>
 <div id="mp-hud" class="mp-hidden">
   <button id="mp-session" aria-haspopup="true" aria-expanded="false"><span id="mp-dot">●</span> SESSION</button>
   <div id="mp-menu" class="mp-hidden" role="menu">
     <div class="mp-hud-top"><span>CO-OP · <b id="mp-code">------</b></span><span id="mp-online">● ONLINE</span></div>
     <div id="mp-peer">Waiting for player 2</div>
     <div class="mp-hud-actions" style="margin-bottom:7px"><button id="mp-invite" role="menuitem">INVITE A FRIEND</button></div>
     <div class="mp-hud-actions"><button id="mp-chat-open" role="menuitem">CHAT</button>
       <button id="mp-trade-open" role="menuitem">TRADE</button>
       <button id="mp-leave" role="menuitem">LEAVE</button></div>
   </div>
 </div>
 <section id="mp-chat" class="mp-popup mp-hidden"><header>PARTY CHAT<button id="mp-chat-close">×</button></header>
   <div id="mp-chat-lines"></div><form id="mp-chat-form">
      <input id="mp-chat-input" maxlength="200" placeholder="Message your partner" autocomplete="off">
      <button type="submit">SEND</button></form></section>
 <section id="mp-trade" class="mp-popup mp-hidden"><header>ITEM TRADING<button id="mp-trade-close">×</button></header>
   <p>Offer an item to your partner. They choose whether to accept.</p>
   <select id="mp-trade-items"></select><button id="mp-trade-offer">OFFER ITEM</button>
   <div id="mp-trade-status" role="status">Select an inventory item to offer.</div>
   <div id="mp-trade-answer" class="mp-hidden"><button id="mp-trade-accept">ACCEPT</button>
     <button id="mp-trade-decline">DECLINE</button></div></section>
 `;
 document.body.appendChild(div);
 var ns=document.createElement('div');ns.id='mp-netstat';ns.style.cssText='position:fixed;left:4px;bottom:4px;z-index:99999;background:rgba(0,0,0,.7);color:#9fffb0;font:10px/1.3 monospace;padding:4px 6px;border-radius:4px;white-space:pre;pointer-events:none;display:none';document.body.appendChild(ns);
 var sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href='multiplayer.css';
 document.head.appendChild(sheet);
 if(el('mp-online'))el('mp-online').onclick=function(){NET.show=!NET.show;};
 el('mp-chars-back').onclick=function(){el('mp-chars').classList.add('mp-hidden');};
 el('mp-back').onclick=function(){el('mp-lobby').classList.add('mp-hidden');opened=false;if(!MP.active&&ws){ws.onclose=null;ws.close();ws=null;}};
 el('mp-create').onclick=function(){startRoom(false);};
 el('mp-private').onclick=function(){startRoom(true);};
 el('mp-join').onclick=function(){joinRoom(el('mp-join-code').value);};
 el('mp-refresh').onclick=function(){useLink('ws');emit({type:'list'});};
 el('mp-net').onchange=syncNet;
 function menu(open){
  el('mp-menu').classList.toggle('mp-hidden',!open);
  el('mp-session').setAttribute('aria-expanded',open?'true':'false');
 }
 el('mp-session').onclick=function(e){e.stopPropagation();menu(el('mp-menu').classList.contains('mp-hidden'));};
 // tapping anywhere else closes the menu
 document.addEventListener('pointerdown',function(e){
  var m=el('mp-menu');if(m&&!m.classList.contains('mp-hidden')&&!el('mp-hud').contains(e.target))menu(false);
 },true);
 el('mp-invite').onclick=function(){
  var url=location.origin+location.pathname+'?join='+(MP.code||''),text='Join my Emberdeep game! Code: '+(MP.code||'')+'  '+url,b=el('mp-invite');
  function copied(){b.textContent='LINK COPIED';setTimeout(function(){b.textContent='INVITE A FRIEND';},1800);}
  if(navigator.share){navigator.share({title:'Emberdeep',text:'Join my Emberdeep game! Code: '+MP.code,url:url}).catch(function(){});return;}
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(copied,function(){window.prompt('Copy this invite:',text);});}
  else window.prompt('Copy this invite:',text);
 };
 el('mp-chat-open').onclick=function(){menu(false);el('mp-trade').classList.add('mp-hidden');
  el('mp-chat').classList.remove('mp-hidden');el('mp-chat-input').focus();};
 el('mp-chat-close').onclick=function(){el('mp-chat').classList.add('mp-hidden');};
 el('mp-chat-form').onsubmit=function(e){e.preventDefault();var input=el('mp-chat-input');
  var t=input.value.trim();if(t)send({type:'chat',text:t});input.value='';};
 el('mp-trade-open').onclick=function(){menu(false);el('mp-chat').classList.add('mp-hidden');showTrade();};
 el('mp-trade-close').onclick=function(){el('mp-trade').classList.add('mp-hidden');};
 el('mp-trade-offer').onclick=offer;
 el('mp-trade-accept').onclick=function(){if(trade)send({type:'trade_accept',id:trade.id});};
 el('mp-trade-decline').onclick=function(){if(trade)send({type:'trade_decline',id:trade.id});};
 el('mp-leave').onclick=function(){menu(false);if(confirm('Leave the multiplayer adventure?'))stop(true);};
 // The SESSION button would cover the journal's tab row, so it steps aside while the journal is open.
 setInterval(function(){
  var u=CC.UI&&CC.UI._state?CC.UI._state():null,h=el('mp-hud');
  var pk=CC.state&&CC.state.player&&CC.state.player.perkOpen;
  if(h)h.style.visibility=(u&&u.target)||pk?'hidden':'';
 },150);
 // Text input must not also trigger gameplay key bindings or scroll the canvas.
 function editing(e){var t=e.target;return t&&(t.tagName==='INPUT'||t.tagName==='SELECT'||t.tagName==='TEXTAREA');}
 root.addEventListener('keydown',function(e){if(editing(e))e.stopImmediatePropagation();},true);
 root.addEventListener('keyup',function(e){if(editing(e))e.stopImmediatePropagation();},true);
 try{var jm=location.search.match(/[?&]join=([0-9A-Fa-f]{6})/);if(jm){setTimeout(function(){MP.openLobby(jm[1]);},400);}}catch(_){}
 try{var raw=sessionStorage.getItem('emberdeep-room');if(raw){session=JSON.parse(raw);if(session&&session.code)message('Previous room found. Open Multiplayer to reconnect.');}}
 catch(_){}
}
MP.openLobby=function(code,mode){ // mode: 'cave' (adventure) or 'defense' (Town Defense) preselects the game type
 el('mp-lobby').classList.remove('mp-hidden');
 if((mode==='cave'||mode==='defense')&&el('mp-mode'))el('mp-mode').value=mode;
 if(typeof code==='string'&&/^[0-9A-Fa-f]{6}$/.test(code)){el('mp-join-code').value=code.toUpperCase();el('mp-net').value='direct';}
 syncNet();
};
// Direct mode has no room browser (friends join by code); Game server mode lists open games as before.
function syncNet(){
 var server=netChoice()==='server';
 opened=server;
 el('mp-refresh').style.visibility=server?'':'hidden';
 if(server){useLink('ws');message('Connecting to server...');if(ready())send({type:'list'});else connect();}
 else{
  if(linkKind==='ws'&&ws&&!MP.active){ws.onclose=null;try{ws.close();}catch(_){}ws=null;MP.connected=false;}
  var box=el('mp-rooms');box.textContent='';
  var hint=document.createElement('div');hint.className='mp-empty';
  hint.textContent='Create a game and send your friend the 6-letter code (or the invite link). To browse open games, switch Connection to "Game server".';
  box.appendChild(hint);
  message(CC.P2P&&CC.P2P.available()?'Ready. Direct play connects phone to phone.':'Direct play is not available in this browser.');
 }
}
MP.leave=function(){stop(true);};MP.tick=tick;MP.drawWorld=drawWorld;
MP.isHost=function(){return MP.active&&MP.role==='host';};
MP.isGuest=function(){return MP.active&&MP.role==='guest';};
MP.remotePlayerForAI=function(){return MP.isHost()&&MP.remote&&(MP.remote.sc|0)===0?MP.remote:null;};
MP.myScene=myScene;MP.sameScene=sameScene;
MP.partnerName=function(){var o=MP.room&&(MP.role==='host'?MP.room.guest:MP.room.host);return (o&&o.name)||'Partner';};
MP.setGuestInvuln=function(on){
 if(!MP.isHost())return false;
 MP.options.guestInvuln=!!on;optClock=0;
 sendFx('opt',{gi:on?1:0});
 if(CC.fx&&CC.fx.text&&CC.state.player)CC.fx.text(CC.state.player.x,CC.state.player.y-30,
  on?'GUEST INVULNERABLE':'GUEST VULNERABLE',on?'#9fe3ff':'#ffb0a0',10);
 return true;
};
MP.guestInvulnerable=function(){return !!MP.options.guestInvuln;};
MP.onGuestDamage=function(amount){if(MP.isHost()&&amount>0&&!MP.options.guestInvuln)
 send({type:'damage_guest',damage:Math.min(250,amount)});};
MP.sendHit=function(id,amount,kind){
 if(MP.isGuest()&&Number.isFinite(amount)&&amount>0)
  send({type:'hit',id:id,damage:Math.min(450,amount),kind:kind||'melee'});
};
MP.broadcastKill=function(xp){
 if(MP.isHost()&&xp>0)send({type:'kill',xp:Math.min(4999,xp)});
};
MP.status=function(){return {active:MP.active,role:MP.role,code:MP.code,connected:MP.connected,playing};};
MP.pauseSimulation=function(){return MP.isGuest();};
MP.sendScene=broadcastScene;
MP.openChat=function(){if(playing)el('mp-chat-open').click();};
if(typeof document!=='undefined'){
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);
 else initialize();
}
})(window);