/* Emberdeep co-op: two-player cave adventure, hosted simulation + guest controller.
 * Solo save is never loaded or overwritten by a multiplayer room.
 */
(function(root){
'use strict';
var CC=root.CC=root.CC||{};
var MP=CC.Multiplayer={active:false,role:null,room:null,remote:null,connected:false,options:{guestInvuln:false}};
var ws=null,session=null,reconnectDelay=800,pending=null,opened=false,playing=false;
var chat=[],trade=null,positionClock=0,snapshotClock=0,roomClock=0,pickupClock=0;
var lastScene='',lastRemote=0,pendingPickups={};
// Partner motion: samples arrive ~20x/s; we draw ~110 ms in the past and blend between them,
// so movement is smooth on any connection instead of stepping from packet to packet.
var optClock=0,samples=[],lastViewAt=0,minionClock=0,remoteMinions=[],remoteMinionsAt=0,INTERP_MS=110;
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
function send(o){if(ready()){ws.send(JSON.stringify(o));return true;}return false;}
function message(t){if(el('mp-status'))el('mp-status').textContent=t;}
function setError(t){message(t);if(el('mp-server'))el('mp-server').textContent=t;}
function safeName(){return (el('mp-name').value||'').trim().slice(0,22);}
function sessionSave(){try{sessionStorage.setItem('emberdeep-room',JSON.stringify(session));}catch(_){}}
function sessionClear(){session=null;try{sessionStorage.removeItem('emberdeep-room');}catch(_){}}
function connect(){
 if(ws&&(ws.readyState===0||ws.readyState===1))return;
 try{ws=new WebSocket(URL());}catch(e){setError('Unable to connect: '+e.message);return;}
 message('Connecting to server...');
 ws.onopen=function(){
  MP.connected=true;reconnectDelay=800;message('Server connected');
  if(session)send({type:'resume',code:session.code,token:session.token});
  else if(pending){var action=pending;pending=null;send(action);}
  else send({type:'list'});
 };
 ws.onmessage=function(e){
  try{handle(JSON.parse(e.data));}catch(err){console.warn('Co-op message:',err);}
 };
 ws.onclose=function(){
  ws=null;MP.connected=false;
  if(MP.active)message('Disconnected. Trying to reconnect...');
  else if(opened)message('Server disconnected. Retrying...');
  if(session||opened){
   var delay=reconnectDelay;reconnectDelay=Math.min(10000,Math.round(delay*1.7));
   setTimeout(function(){if(!ready())connect();},delay);
  }
 };
 ws.onerror=function(){message('WebSocket connection failed. Check deployment and Redis settings.');};
}
function emit(data){if(!send(data)){pending=data;connect();}}
function identity(){return {name:safeName(),hero:el('mp-hero').value};}
function startRoom(isPrivate){
 var i=identity();if(!i.name)return message('Enter your name to create a game');
 message('Creating room...');
 emit({type:'create',name:i.name,hero:i.hero,private:!!isPrivate,mode:el('mp-mode').value});
}
function joinRoom(code){
 var i=identity();if(!i.name)return message('Enter your name to join a game');
 code=String(code||'').trim().toUpperCase();
 if(!/^[0-9A-F]{6}$/.test(code))return message('Enter a six-character room code');
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
  h.textContent=(room.mode==='defense'?'🛡 ':'')+room.title;s.textContent=(room.mode==='defense'?'Town Defense · ':'Cave Co-op · ')+room.host.name+' · '+room.host.hero+' · 1 / 2 players';
  left.appendChild(h);left.appendChild(s);row.appendChild(left);
  var button=document.createElement('button');button.textContent='JOIN';
  button.onclick=function(){joinRoom(room.code);};row.appendChild(button);box.appendChild(row);
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
 if(!scene&&MP.room&&MP.room.mode==='defense')scene={area:'defense',floor:1};
 CC.beginCoop(player.hero,scene);
 el('mp-lobby').classList.add('mp-hidden');
 el('mp-hud').classList.remove('mp-hidden');
 opened=false;hud();
 if(MP.role==='host')broadcastScene();
}
function broadcastScene(){
 if(!MP.active||MP.role!=='host'||!CC.state||(CC.state.area!=='cave'&&CC.state.area!=='defense'))return;
 var s=CC.state,d=CC.Dungeon;
 if(!d||!Number.isFinite(d.seed))return;
 var scene={area:s.area,floor:s.floor,seed:d.seed};
 lastScene=scene.area+':'+scene.floor+':'+scene.seed;
 send({type:'scene',scene:scene});
 var data=snapshot();if(data)send({type:'snapshot',snapshot:data});
}
function incomingScene(scene){
 if(!scene||(scene.area!=='cave'&&scene.area!=='defense')||MP.role!=='guest')return;
 var key=scene.area+':'+scene.floor+':'+scene.seed;
 if(!playing){start(scene);lastScene=key;return;}
 if(key===lastScene)return;
 lastScene=key;
 CC.syncCoopScene(scene);
}
var enemyFields=['id','type','name','x','y','r','hp','maxHp','dmg','spd','state',
 't','cd','face','anim','asleep','dead','boss','bossIdx','phase','def','bar',
 'stitched','miniBoss','elite','affixes','shield','slow','stunT','contact',
 'dangerous','tele','ang','atk','invuln','flash','burn','color','floor',
 'ghost','eth','look','size','horrorParts','bloodTime','collapsed','weaselMove',
 'weaselPhase','weaselGlow','weaselElapsed','weaselFx','weaselTarget','weaselAngle',
 'heartPhase','introDone','rage','poison','fireproof'];
function fields(v,names){
 var o={};if(!v)return o;
 names.forEach(function(n){if(v[n]!==undefined&&typeof v[n]!=='function')o[n]=v[n];});return o;
}
function snapshot(){
 var E=CC.Enemies,L=CC.Loot;
 if(!E)return null;
 return {enemies:E.list.filter(function(e){return !e.dead;}).slice(0,150).map(function(e){return fields(e,enemyFields);}),
  projectiles:E.projectiles.slice(0,120).map(function(e){return fields(e,['x','y','vx','vy','r','life','ring','color','fx','kind','hostile','ghost','dmg']);}),
  zones:E.zones.slice(0,24).map(function(e){return fields(e,['x','y','rad','t','max','dmg','kind']);}),
  drops:(L&&L.drops||[]).slice(0,80).map(function(d){
   if(!d.mpId)d.mpId='d'+Math.random().toString(36).slice(2,11);
   return fields(d,['mpId','kind','x','y','z','age','amount','item','rarity','color','seed']);
  }),
  bossId:E.boss&&E.boss.id,at:Date.now()};
}
function applySnapshot(data){
 if(MP.role!=='guest'||!playing||!data||!Array.isArray(data.enemies))return;
 var E=CC.Enemies,L=CC.Loot;
 if(!E)return;
 var old=new Map(E.list.map(function(e){return [e.id,e];}));
 E.list=data.enemies.map(function(net){
  var e=old.get(net.id)||{},oldX=e.x,oldY=e.y;
  Object.assign(e,net);
  if(Number.isFinite(oldX)&&Number.isFinite(oldY)){
   e.tx=e.x;e.ty=e.y;e.x=oldX;e.y=oldY;
  }else{e.tx=e.x;e.ty=e.y;}
  return e;
 });
 E.boss=E.list.find(function(e){return e.boss&&e.id===data.bossId;})||null;
 E.bossBar=E.boss&&E.boss.bar?Object.assign({},E.boss.bar,{pct:E.boss.hp/Math.max(1,E.boss.maxHp)}):null;
 if(!E.bossBar){var stitch=E.list.find(function(e){return e.stitched;});
  if(stitch)E.bossBar={name:'The Patchwork Horror',pct:stitch.hp/Math.max(1,stitch.maxHp),phase:1,kind:'patchwork',color:'#b465e4'};
 }
 if(Array.isArray(data.projectiles))E.projectiles=data.projectiles;
 if(Array.isArray(data.zones))E.zones=data.zones;
 if(L&&Array.isArray(data.drops))L.drops=data.drops;
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
  if(s.inventory.length<40)s.inventory.push(r.item);
  else s.gold=(s.gold||0)+(r.item.value||0);
 }else if(r.kind==='gold')s.gold=(s.gold||0)+(r.amount||0);
 else if(r.kind==='potion')s.potions=(s.potions||0)+1;
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
 if(m.type==='players'){MP.room=m.room;hud();return;}
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
  else if(m.k==='tc'&&CC.Defense&&CC.Defense.onCommand&&MP.role==='host')CC.Defense.onCommand(d);
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
  if(e&&MP.remote&&Math.hypot(e.x-MP.remote.x,e.y-MP.remote.y)<280)
   E.damage(e,Math.min(450,m.damage),m.kind||'slash');
  return;
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
 if(notify)send({type:'leave'});
 MP.active=false;MP.connected=false;MP.role=null;MP.code=null;MP.room=null;MP.remote=null;MP.view=null;samples=[];remoteMinions=[];MP.options.guestInvuln=false;
 playing=false;opened=false;lastScene='';trade=null;pendingPickups={};sessionClear();
 el('mp-lobby').classList.add('mp-hidden');el('mp-hud').classList.add('mp-hidden');
 el('mp-chat').classList.add('mp-hidden');el('mp-trade').classList.add('mp-hidden');el('mp-menu').classList.add('mp-hidden');
 if(ws){ws.onclose=null;ws.close();ws=null;}
 if(CC.state)CC.state.mode='title';
}
function posData(){
 var p=CC.state.player;
 return p?{x:p.x,y:p.y,hp:p.hp,maxHp:p.maxHp,mana:p.mana,maxMana:p.maxMana,
  classId:p.classId,level:p.level,face:p.face||1,anim:p.anim||0,
  moving:!!p.moving,atkAnim:p.atkAnim||0,swingAng:p.swingAng||0,swingSign:p.swingSign||1,
  castFlash:p.castFlash||0,whirlT:p.whirlT||0,dashT:p.dashT||0,
  pwb:p.pw?((p.pw.rapid>0?1:0)|(p.pw.explode>0?2:0)|(p.pw.shield>0?4:0)):0}:null;
}
function tick(dt){
 if(!playing||!MP.active||(CC.state.mode!=='dungeon'&&!(CC.state.mode==='dead'&&CC.state.area==='defense')))return;
 positionClock+=dt;snapshotClock+=dt;roomClock+=dt;pickupClock+=dt;
 if(MP.role==='host'&&MP.remote&&MP.remote.invuln>0)
  MP.remote.invuln=Math.max(0,MP.remote.invuln-dt);
 if(MP.role==='guest'){
  (CC.Enemies&&CC.Enemies.list||[]).forEach(function(e){
   e.anim=(e.anim||0)+dt;
   if(Number.isFinite(e.tx)){
    e.x+=(e.tx-e.x)*Math.min(1,dt*16);e.y+=(e.ty-e.y)*Math.min(1,dt*16);
   }
  });
 }
 if(!ready())return;
 if(positionClock>.05){positionClock=0;send({type:'position',player:posData()});}
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
  if(roomClock>.5){roomClock=0;
   var sceneKey=CC.state.area+':'+CC.state.floor+':'+(CC.Dungeon&&CC.Dungeon.seed);
   if(sceneKey!==lastScene)broadcastScene();
  }
  if(snapshotClock>.15){snapshotClock=0;
   var snap=snapshot();if(snap)send({type:'snapshot',snapshot:snap});
  }
 }else if(pickupClock>.23){
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
function sendFx(k,d){if(playing&&MP.active&&ready())ws.send(JSON.stringify({type:'fx',k:k,d:d}));}
MP.sendFx=sendFx;
function initialize(){
 var div=document.createElement('div');div.id='emberdeep-mp';
 div.innerHTML=String.raw`
 <section id="mp-lobby" class="mp-hidden" aria-label="Emberdeep multiplayer lobby">
   <div class="mp-panel">
    <header class="mp-title"><div><small>EMBERDEEP ONLINE</small><h2>ADVENTURERS' GUILD</h2></div>
      <button id="mp-back" class="mp-quiet">BACK</button></header>
    <p>Form a party of two. Explore caves together, chat and exchange items.</p>
    <div class="mp-line"><label>Your name<input id="mp-name" maxlength="22" placeholder="Adventurer" autocomplete="nickname"></label>
      <label>Choose hero<select id="mp-hero"><option value="wizard">Wizard</option><option value="necromancer">Necromancer</option>
        <option value="swordsman">Swordsman</option><option value="thief">Thief</option></select></label></div>
    <div class="mp-line"><label>Game mode<select id="mp-mode"><option value="defense">Town Defense (waves)</option>
        <option value="cave">Cave Co-op (explore)</option></select></label></div>
    <div class="mp-actions"><button id="mp-create">CREATE OPEN GAME</button>
      <button id="mp-private">CREATE PRIVATE</button></div>
    <div class="mp-join"><input id="mp-join-code" maxlength="6" placeholder="INVITE CODE" aria-label="Room invite code">
      <button id="mp-join">JOIN BY CODE</button></div>
    <div class="mp-section"><div class="mp-between"><strong>OPEN GAMES</strong>
      <button id="mp-refresh" class="mp-quiet">REFRESH</button></div><div id="mp-rooms"></div></div>
    <div id="mp-status" role="status">Connecting...</div>
    <small id="mp-server">Rooms last up to four hours. Invite codes let friends enter private rooms.</small>
   </div>
 </section>
 <div id="mp-hud" class="mp-hidden">
   <button id="mp-session" aria-haspopup="true" aria-expanded="false"><span id="mp-dot">●</span> SESSION</button>
   <div id="mp-menu" class="mp-hidden" role="menu">
     <div class="mp-hud-top"><span>CO-OP · <b id="mp-code">------</b></span><span id="mp-online">● ONLINE</span></div>
     <div id="mp-peer">Waiting for player 2</div>
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
 var sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href='multiplayer.css';
 document.head.appendChild(sheet);
 el('mp-back').onclick=function(){el('mp-lobby').classList.add('mp-hidden');opened=false;if(!MP.active&&ws){ws.onclose=null;ws.close();ws=null;}};
 el('mp-create').onclick=function(){startRoom(false);};
 el('mp-private').onclick=function(){startRoom(true);};
 el('mp-join').onclick=function(){joinRoom(el('mp-join-code').value);};
 el('mp-refresh').onclick=function(){emit({type:'list'});};
 function menu(open){
  el('mp-menu').classList.toggle('mp-hidden',!open);
  el('mp-session').setAttribute('aria-expanded',open?'true':'false');
 }
 el('mp-session').onclick=function(e){e.stopPropagation();menu(el('mp-menu').classList.contains('mp-hidden'));};
 // tapping anywhere else closes the menu
 document.addEventListener('pointerdown',function(e){
  var m=el('mp-menu');if(m&&!m.classList.contains('mp-hidden')&&!el('mp-hud').contains(e.target))menu(false);
 },true);
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
  if(h)h.style.visibility=u&&u.target?'hidden':'';
 },150);
 // Text input must not also trigger gameplay key bindings or scroll the canvas.
 function editing(e){var t=e.target;return t&&(t.tagName==='INPUT'||t.tagName==='SELECT'||t.tagName==='TEXTAREA');}
 root.addEventListener('keydown',function(e){if(editing(e))e.stopImmediatePropagation();},true);
 root.addEventListener('keyup',function(e){if(editing(e))e.stopImmediatePropagation();},true);
 try{var raw=sessionStorage.getItem('emberdeep-room');if(raw){session=JSON.parse(raw);if(session&&session.code)message('Previous room found. Open Multiplayer to reconnect.');}}
 catch(_){}
}
MP.openLobby=function(){
 opened=true;el('mp-lobby').classList.remove('mp-hidden');
 if(ready())send({type:'list'});else connect();
};
MP.leave=function(){stop(true);};MP.tick=tick;MP.drawWorld=drawWorld;
MP.isHost=function(){return MP.active&&MP.role==='host';};
MP.isGuest=function(){return MP.active&&MP.role==='guest';};
MP.remotePlayerForAI=function(){return MP.isHost()?MP.remote:null;};
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