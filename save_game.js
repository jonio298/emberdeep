/* Emberdeep Save/Continue — versioned local browser storage.
 * Current-session maps persist separately in memory. Loading a saved game
 * deliberately regenerates the combat floor but retains the hero, quest, inventory
 * and unlocked areas. The player must never load at 0 HP or inside a solid wall.
 */
(function(root){
'use strict';
var CC=root.CC=root.CC||{},S=CC.SaveGame={},KEY='emberdeep.save.v2',cached=null,
 lastError='',elapsed=0;
function storage(){try{return root.localStorage||(typeof localStorage!=='undefined'?localStorage:null);}catch(e){return null;}}
function safePlayer(p){
 if(!p)return null;
 var o={};
 for(var k in p){
  if(!Object.prototype.hasOwnProperty.call(p,k))continue;
  if(k==='dashHit'||k==='criticalPose'||k==='perkChoices'||k==='grabbedBy'||k==='grabT')continue;
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
S.peek=function(){
 if(cached!==null)return cached;
 var st=storage();if(!st)return null;
 try{
  var raw=st.getItem(KEY);
  if(!raw)return null;
  var data=JSON.parse(raw);
  if(!data||data.version!==2||!data.player||!data.classId)return null;
  cached=data;return data;
 }catch(e){lastError=String(e);return null;}
};
S.exists=function(){return !!S.peek();};
S.clear=function(){
 cached=null;elapsed=0;var st=storage();
 try{if(st)st.removeItem(KEY);}catch(e){lastError=String(e);}
};
S.save=function(){
 var st=storage(),s=CC.state,p=s&&s.player;
 if(!st||!p||p.hp<=0||!(s.mode==='town'||s.mode==='dungeon'))return false;
 try{
  var data={
   version:2,savedAt:Date.now(),classId:p.classId,
   player:safePlayer(p),area:s.area||'town',mode:s.mode,
   floor:Math.max(1,s.floor||1),treeFloor:Math.max(1,s.treeFloor||1),
   x:p.x,y:p.y,seed:s.map&&Number.isFinite(s.map.seed)?s.map.seed:null,
   gold:s.gold||0,kills:s.kills||0,runGold:s.runGold||0,
   bestFloor:s.bestFloor||1,bridgeDown:!!s.bridgeDown,
   potions:s.potions||0,inventory:Array.isArray(s.inventory)?s.inventory:[],
   quest:CC.EggQuest&&CC.EggQuest.serialize?CC.EggQuest.serialize():null,
   waypoints:CC.Waypoints&&CC.Waypoints.status?CC.Waypoints.status():null,
   camp:CC.Camp&&CC.Camp.exportState?CC.Camp.exportState():null
  };
  var packed=JSON.stringify(data);
  if(packed.length>2000000)throw Error('Save too large');
  st.setItem(KEY,packed);cached=data;lastError='';return true;
 }catch(e){lastError=String(e);return false;}
};
S.load=function(){
 var data=S.peek();
 if(!data||!CC.loadSavedGame)return false;
 try{return !!CC.loadSavedGame(data);}catch(e){lastError=String(e);return false;}
};
S.auto=function(dt){
 elapsed+=dt||0;
 if(elapsed>=9){elapsed=0;S.save();}
};
S.status=function(){return {exists:S.exists(),error:lastError,
 savedAt:cached&&cached.savedAt,area:cached&&cached.area};};
})(window);