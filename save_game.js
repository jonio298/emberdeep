/* Emberdeep Save/Continue - up to 5 save slots in local browser storage.
 * A slot IS a character (Diablo II style): the same characters are used in single player and in multiplayer.
 * Current-session maps persist separately in memory. Loading a saved game deliberately regenerates the combat floor but
 * retains the hero, quest, inventory and unlocked areas. The player must never load at 0 HP or inside a solid wall.
 *
 *   slots() -> [{n, data|null, info|null} x5]      load(n)        newGame()/clear()   save()   deleteSlot(n)
 *   createCharacter(classId, name) -> n | 0        getCharacter(n)  saveCharacter()   (co-op progress goes back to the slot)
 */
(function(root){
'use strict';
var CC=root.CC=root.CC||{},S=CC.SaveGame={},PREFIX='emberdeep.save.v3.slot',LEGACY='emberdeep.save.v2',MAX=5,
 current=0,lastError='',elapsed=0,charElapsed=0,mem={};
function storage(){try{return root.localStorage||(typeof localStorage!=='undefined'?localStorage:null);}catch(e){return null;}}
function key(n){return PREFIX+n;}
function safePlayer(p){
 if(!p)return null;
 var o={};
 for(var k in p){
  if(!Object.prototype.hasOwnProperty.call(p,k))continue;
  if(k==='dashHit'||k==='criticalPose'||k==='perkChoices'||k==='grabbedBy'||k==='grabT'||k==='pw')continue;
  var v=p[k];
  if(typeof v==='function'||v===undefined)continue;
  if(v&&typeof v==='object'&&!(Array.isArray(v)||Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null))continue;
  o[k]=v;
 }
 o.hp=Math.max(1,o.hp||1);
 o.perkOpen=false;o.perkChoices=null;o.invuln=0;
 o.dashT=0;o.dashHit=null;o.criticalPose=null;
 return o;
}
// Copy through the same JSON representation as campaign slots.
function copy(data){return JSON.parse(JSON.stringify(data));}
S.characterSnapshot=function(s){
 return copy({classId:s.classId||s.player.classId,charName:s.charName||s.player.name,
  player:safePlayer(s.player),gold:s.gold||0,inventory:s.inventory||[],
  potions:s.potions||0,manaPotions:s.manaPotions||0});
};
S.restoreCharacterSnapshot=function(data){
 var p=CC.Classes.create(data.classId);
 if(!p)return null;
 var s=copy(data);
 Object.assign(p,s.player);
 var hp=p.hp,mana=p.mana;
 if(CC.Classes.applyItemStats)CC.Classes.applyItemStats(p);
 p.hp=Math.max(1,Math.min(p.maxHp,hp));
 p.mana=Math.max(0,Math.min(p.maxMana,mana));
 p.grabbedBy=null;p.grabT=0;
 return {player:p,classId:s.classId,charName:s.charName||p.name,gold:s.gold||0,
  inventory:s.inventory||[],potions:s.potions||0,manaPotions:s.manaPotions||0};
};
// Rewards mutate a copy of the destination character and commit it atomically.
// Mutator false cancels delivery. Failure leaves slot storage and the restored hero intact.
S.endlessRewardDestination=function(identity,hero){
 var slot=identity.slot;
 function baseline(){return slot?read(slot):S.characterSnapshot(hero);}
 return {
  read:function(){var data=baseline();return data?copy(data):null;},
  deliver:function(mutate){
   var data=baseline(),n=slot;
   if(!data)return {ok:false,reason:'missing-character'};
   if(!n){
    for(n=1;n<=MAX&&read(n);n++){}
    if(n>MAX)return {ok:false,reason:'no-empty-slot'};
   }
   try{
    data=copy(data);
    if(mutate(data)===false)return {ok:false,reason:'cancelled'};
    if(!slot)data=Object.assign(S.makeCharacterData(identity.classId,identity.name),data);
    data.savedAt=Date.now();
    if(!write(n,data))return {ok:false,reason:'storage-unavailable'};
    slot=n;
    return {ok:true,slot:n};
   }catch(e){lastError=String(e);return {ok:false,reason:'storage-unavailable'};}
  }
 };
};
function valid(d){return !!(d&&d.version===2&&d.player&&d.classId);}
function read(n){
 if(mem[n]!==undefined)return mem[n];
 var st=storage();if(!st)return null;
 try{var raw=st.getItem(key(n));mem[n]=raw?JSON.parse(raw):null;if(!valid(mem[n]))mem[n]=null;}
 catch(e){lastError=String(e);mem[n]=null;}
 return mem[n];
}
function write(n,data){
 var st=storage();if(!st)return false;
 var packed=JSON.stringify(data);
 if(packed.length>2000000)throw Error('Save too large');
 st.setItem(key(n),packed);mem[n]=data;lastError='';return true;
}
// the old single save moves into slot 1 the first time
(function migrate(){
 var st=storage();if(!st)return;
 try{
  var raw=st.getItem(LEGACY);
  if(raw&&!st.getItem(key(1))){st.setItem(key(1),raw);}
  if(raw)st.removeItem(LEGACY);
 }catch(e){lastError=String(e);}
})();

var AREA={town:'Town',forest:'Giant Forest','tree-tunnel':'Hollow Tree',plains:'Rolling Plains','tree-ascent':'Eagle Tree',defense:'Town Defense','rocky-pass':'Rocky Pass',village:'Abandoned Village','village-cellar':'The Cellar',cinderwake:'The Cinderwake'};
function info(d){
 if(!d)return null;
 var p=d.player||{},where=d.area==='cave'?'Cave floor '+(d.floor||1):(AREA[d.area]||'Town');
 return {classId:d.classId,name:d.charName||p.name||d.classId,level:p.level||1,where:where,floor:d.floor||1,savedAt:d.savedAt||0,
  gold:d.gold||0,items:(d.inventory||[]).length};
}
S.slots=function(){var out=[],n;for(n=1;n<=MAX;n++){var d=read(n);out.push({n:n,data:d,info:info(d)});}return out;};
S.slotData=function(n){return read(n);};
S.exists=function(){for(var n=1;n<=MAX;n++)if(read(n))return true;return false;};
S.count=function(){var c=0;for(var n=1;n<=MAX;n++)if(read(n))c++;return c;};
S.current=function(){return current;};
S.peek=function(){return current&&read(current)?read(current):(function(){var best=null;for(var n=1;n<=MAX;n++){var d=read(n);if(d&&(!best||(d.savedAt||0)>(best.savedAt||0)))best=d;}return best;})();};
// the slot a NEW game will save into: the first empty one, else the oldest save (which it will replace)
S.nextSlot=function(){
 var n,oldest=1,oldestT=Infinity;
 for(n=1;n<=MAX;n++){var d=read(n);if(!d)return {n:n,replaces:false};if((d.savedAt||0)<oldestT){oldestT=d.savedAt||0;oldest=n;}}
 return {n:oldest,replaces:true};
};
S.newGame=function(){var s=S.nextSlot();current=s.n;elapsed=0;if(s.replaces)S.deleteSlot(s.n,true);return s;};
S.clear=function(){current=0;elapsed=0;}; // starting over never wipes the other slots
S.deleteSlot=function(n,keepCurrent){
 var st=storage();mem[n]=null;
 try{if(st)st.removeItem(key(n));}catch(e){lastError=String(e);}
 if(!keepCurrent&&current===n)current=0;
};
S.save=function(){
 if(CC.Endless?.inSession())return false;
 var st=storage(),s=CC.state,p=s&&s.player;
 if(!st||!p||s.coop||s.testMode||s.area==='testroom'||p.hp<=0||!(s.mode==='town'||s.mode==='dungeon'))return false;
 try{
  if(!current)current=S.nextSlot().n;
  var campMeta=CC.Camp&&CC.Camp.exportState?CC.Camp.exportState():null;
  var inside=!!(campMeta&&CC.Camp&&CC.Camp.isInside&&CC.Camp.isInside());
  var where=inside?campMeta.area:(s.area||'town');
  var currentFloor=inside?campMeta.floor:s.floor;
  var currentTreeFloor=inside?campMeta.treeFloor:s.treeFloor;
  var location=inside?campMeta:{x:p.x,y:p.y};
  var seed=inside?campMeta.seed:s.map&&s.map.seed;
  var prev=read(current);
  var data={
   version:2,savedAt:Date.now(),classId:p.classId,charName:(prev&&prev.charName)||s.charName||p.name,
   player:safePlayer(p),area:where,mode:inside?'dungeon':s.mode,
   floor:Math.max(1,currentFloor||1),treeFloor:Math.max(1,currentTreeFloor||1),
   x:location.x,y:location.y,seed:Number.isFinite(seed)?seed:null,
   gold:s.gold||0,kills:s.kills||0,runGold:s.runGold||0,
   bestFloor:s.bestFloor||1,bridgeDown:!!s.bridgeDown,
   potions:s.potions||0,manaPotions:s.manaPotions||0,inventory:Array.isArray(s.inventory)?s.inventory:[],
   quest:CC.EggQuest&&CC.EggQuest.serialize?CC.EggQuest.serialize():null,
   cinderwake:CC.CinderwakeStory&&CC.CinderwakeStory.serialize?CC.CinderwakeStory.serialize():null,
   waypoints:CC.Waypoints&&CC.Waypoints.status?CC.Waypoints.status():null,
   camp:CC.Camp&&CC.Camp.exportState?CC.Camp.exportState():null
  };
  write(current,data);return true;
 }catch(e){lastError=String(e);return false;}
};
S.load=function(n){
 if(!n)n=(S.peek()&&S.slots().filter(function(x){return x.data===S.peek();})[0]||{}).n||1;
 var data=read(n);
 if(!data||!CC.loadSavedGame)return false;
 current=n;
 try{return !!CC.loadSavedGame(data);}catch(e){lastError=String(e);return false;}
};
S.auto=function(dt){
 elapsed+=dt||0;
 if(elapsed>=9){elapsed=0;S.save();}
};

/* ---------- characters (shared with multiplayer) ---------- */
S.getCharacter=function(n){var d=read(n);return d?{slot:n,name:d.charName||(d.player&&d.player.name)||d.classId,hero:d.classId,data:d}:null;};
S.makeCharacterData=function(classId,name){
 var p=CC.Classes?.create?.(classId);if(!p)return null;
 return {version:2,savedAt:Date.now(),classId:classId,charName:String(name||p.name||classId).slice(0,22),player:safePlayer(p),
  area:'town',mode:'town',floor:1,treeFloor:1,x:0,y:0,seed:null,gold:0,kills:0,runGold:0,bestFloor:1,bridgeDown:false,
  potions:2,manaPotions:1,inventory:[],quest:null,waypoints:null,camp:null};
};
// A brand-new character in the first empty slot (0 when all five are taken).
S.createCharacter=function(classId,name){
 var n;
 for(n=1;n<=MAX;n++)if(!read(n))break;
 if(n>MAX||!storage())return 0;
 var data=S.makeCharacterData(classId,name);if(!data)return 0;
 try{write(n,data);return n;}catch(e){lastError=String(e);return 0;}
};
// Co-op progress (level, gear, pack, gold, potions) goes back into the character's slot; where it stood in single player is kept.
S.saveCharacter=function(){
 if(CC.Endless?.inSession())return false;
 var s=CC.state,p=s&&s.player,n=s&&s.coopSlot;
 if(!p||!n||p.hp===undefined)return false;
 var d=read(n);if(!d)return false;
 try{
  d.player=safePlayer(p);d.player.hp=Math.max(1,p.maxHp||d.player.hp);d.inventory=Array.isArray(s.inventory)?s.inventory:[];
  d.gold=s.gold||0;d.potions=s.potions||0;d.manaPotions=s.manaPotions||0;d.savedAt=Date.now();
  if(CC.EggQuest&&CC.EggQuest.serialize)d.quest=CC.EggQuest.serialize();
  write(n,d);return true;
 }catch(e){lastError=String(e);return false;}
};
S.autoCharacter=function(dt){
 charElapsed+=dt||0;
 if(charElapsed>=15){charElapsed=0;S.saveCharacter();}
};
S.status=function(){return {exists:S.exists(),error:lastError,current:current,count:S.count()};};
S.MAX=MAX;
})(window);
