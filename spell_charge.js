/* SPELL PAIR REGISTRY (contract for the per-class spell modules spells_*.js)
 *   CC.SpellPairs.register(abilityId, def)   abilityId = id from abilities.js ('bolt', 'leap', ...).
 *     Registering 'wizard_spell2' etc. overrides the built-in charged version of an original spell.
 *     Modules loaded before this file may push [id, def] pairs into CC.SpellPairs._queue instead.
 *   def: {name, color, shape:'cone'|'circle'|'line'|'self'|'dash', range, radius, half (cone half-angle, rad),
 *         cost (tap mana, number or fn(p)), cooldown (tap seconds, number or fn(p)), manaMul (default 1.65),
 *         cdMul (default 1.75), tapDesc, chargeDesc,
 *         tap(p,where,ctx)       optional; omitted: the ability's own CC.Skills.cast / tapAction runs
 *         charge(p,where,power)  required to be chargeable; power 0..1 grows with hold time; return false = cancelled (mana refunded)
 *         preview(c,cam,inf)     optional custom aiming preview; omitted: default transparent shape
 *         clear()                optional; called on death, restart and zone change (drop projectiles/timers)
 *         drawers:{kind:fn(c,e,x,y,progress,t)}  optional; draws SC.effect(kind,opts) visuals (also on the co-op partner)}
 *   where = {x,y,dx,dy,rad,range,valid}: world aim point and unit direction. The dispatcher pays mana, writes the
 *   cooldown and the cast flash. Tap < 0.25s casts the tap; hold >= 0.25s previews; full charge at 0.9s.
 *   ONE shared cooldown per spell: a charged cast writes its longer cooldown into p.cd[key] (and p.cdCharged[key]
 *   for the HUD ring); p.cdMax[key] stays the tap cooldown. p.cdC is only used by the dash charge.
 *   Co-op: SC.effect(kind,opts) replicates a visual to the partner (numbers/strings/booleans only);
 *   damage is only ever dealt by the casting client.
 */
/* Emberdeep charged spellcasting: tap Q/E/Dash for the original ability,
 * hold >= 0.25s to aim and release a class-specific, higher-mana spell.
 * Mobile thumb drag aims relative to its spell button (MOBA-style). The game
 * remains fully playable with keyboard/mouse. Existing hold-ATK charges remain
 * a separate system.
 */
(function(root){
'use strict';
var CC=root.CC=root.CC||{}, SC=CC.SpellCharge={}, TAU=Math.PI*2;
var ARM=.25,FULL=.9, MAX_AIM=92,frameTime=0,active=null,effects=[],lastArea=null,wiped=false;
var PAIRS={},DRAWERS={},SLOTS=['spell1','spell2','spell3','spell4'],SP=CC.SpellPairs=CC.SpellPairs||{};
function register(id,def){
 if(typeof id!=='string'||!id||!def||typeof def!=='object')return false;
 var d=Object.assign({name:id,color:'#9fe3ff',shape:'circle'},def);
 d.id=id;PAIRS[id]=d;
 if(d.drawers)for(var k in d.drawers)if(typeof d.drawers[k]==='function')DRAWERS[k]=d.drawers[k];
 return true;
}
SP.register=register;
SP.unregister=function(id){return delete PAIRS[id];};
SP.get=function(id){return PAIRS[id]||null;};
SP.has=function(id){return !!PAIRS[id];};
SP.list=function(){return Object.keys(PAIRS);};
if(Array.isArray(SP._queue)){SP._queue.forEach(function(q){register(q[0],q[1]);});SP._queue=[];}
var DEFINITIONS={
  swordsman:{
    spell1:{name:'EARTHBREAKER',shape:'cone',range:92,radius:58,color:'#f2b264',mult:1.8},
    spell2:{name:'VORTEX CLEAVE',shape:'circle',range:0,radius:72,color:'#c7a5ee',mult:1.75},
    dash:{name:'VANGUARD RUSH',shape:'dash',range:184,radius:18,color:'#73c6ff'}
  },
  wizard:{
    spell1:{name:'FLAMETHROWER',shape:'cone',range:129,radius:72,color:'#ff8749',mult:1.8},
    spell2:{name:'ICICLE BARRAGE',shape:'circle',range:189,radius:79,color:'#83dcff',mult:1.8},
    dash:{name:'ARCANE SURGE',shape:'dash',range:184,radius:18,color:'#76ceff'}
  },
  necromancer:{
    spell1:{name:'GRAVE CHOIR',shape:'circle',range:153,radius:63,color:'#9bd99f',mult:1.8},
    spell2:{name:'SOUL WELL',shape:'circle',range:0,radius:74,color:'#a47cf0',mult:1.8},
    dash:{name:'WRAITH STRIDE',shape:'dash',range:184,radius:18,color:'#8bd6a7'}
  },
  thief:{
    spell1:{name:'RAZOR RAIN',shape:'circle',range:171,radius:75,color:'#fa687e',mult:1.8},
    spell2:{name:'PHANTOM SHROUD',shape:'circle',range:142,radius:74,color:'#a796ce',mult:1.8},
    dash:{name:'PHANTOM RUSH',shape:'dash',range:184,radius:18,color:'#ee657b'}
  }
};
function hero(){var s=CC.state;return s&&s.mode==='dungeon'&&s.player&&s.player.hp>0&&!s.player.perkOpen?s.player:null;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function norm(x,y){var d=Math.hypot(x,y);return d>.0001?{x:x/d,y:y/d}:{x:1,y:0};}
function dist(x,y,X,Y){return Math.hypot(x-X,y-Y);}
function all(){return (CC.Enemies&&CC.Enemies.list)||[];}
function living(e){return e&&!e.dead&&e.hp>0&&!e.asleep&&!e.collapsed;}
function status(e,type,t,m){if(CC.Classes&&CC.Classes.status)CC.Classes.status(e,type,t,m);}
function hurt(e,n,type){
 if(!living(e)||!CC.Classes||!CC.Classes.hitEnemy)return 0;
 return CC.Classes.hitEnemy(e,Math.max(1,n),type,{noCrit:true,attackKind:'spell',splash:true})||0;
}
function fxText(x,y,s,c){if(CC.fx&&CC.fx.text)CC.fx.text(x,y,s,c,11);}
function burst(x,y,c,n){if(CC.fx&&CC.fx.burst)CC.fx.burst(x,y,c,n,100);}
function shake(n){if(CC.fx&&CC.fx.shake)CC.fx.shake(n);}
function move(e,x,y){
 var D=CC.Dungeon;
 if(D&&D.moveWithCollision)return D.moveWithCollision(e,x,y);
 e.x+=x;e.y+=y;
}
function clearPath(x,y,X,Y){
 var D=CC.Dungeon;
 if(!D||!D.isSolid)return true;
 var steps=Math.max(1,Math.ceil(dist(x,y,X,Y)/18));
 for(var j=1;j<=steps;j++){
   var k=j/steps;
   if(D.isSolid(x+(X-x)*k,y+(Y-y)*k))return false;
 }
 return true;
}
function push(e,sourceX,sourceY,power){
 var d=norm(e.x-sourceX,e.y-sourceY);
 for(var j=0;j<4;j++)move(e,d.x*power/4,d.y*power/4);
}
function targets(x,y,r){
 return all().filter(function(e){
   return living(e)&&dist(e.x,e.y,x,y)<=r+(e.r||8)&&clearPath(x,y,e.x,e.y);
 });
}
function slotDefinition(p,slot){var c=slot==='spell1'?p.testSpell1:slot==='spell2'?p.testSpell2:null;return (DEFINITIONS[c||p.classId]||DEFINITIONS.swordsman)[slot];}
// The ability equipped in a slot -> {slot,id,key (cooldown key),legacy (built-in original spell/dash name),reg,def}
function equipped(p,slot){
 var i=SLOTS.indexOf(slot);
 if(i<0)return null;
 if(CC.Skills&&CC.Skills.ensure)CC.Skills.ensure(p);
 var id=p.slots&&p.slots[i];
 if(id)return id;
 return !p.slots&&i<2?(p.classId+'_'+slot):null;
}
function resolve(p,slot){
 if(slot==='dash')return {slot:slot,key:'dash',legacy:'dash',def:slotDefinition(p,'dash')};
 var id=equipped(p,slot);
 if(!id)return null;
 var m=/^[a-z]+_(spell[12])$/.exec(id),reg=PAIRS[id]||null;
 if(m&&!reg){var d=slotDefinition(p,m[1]);return d?{slot:slot,id:id,key:m[1],legacy:m[1],def:d}:null;}
 if(!reg||typeof reg.charge!=='function')return null;
 var key=m?m[1]:CC.Skills&&CC.Skills.cdKey?CC.Skills.cdKey(p,slot):'ab_'+id;
 return {slot:slot,id:id,key:key,legacy:m?m[1]:null,reg:reg,def:reg};
}
function defFor(p,slot){var r=resolve(p,slot);return r?r.def:slotDefinition(p,slot);}
function num(v,p){return typeof v==='function'?v(p):v;}
function tapCost(p,r){
 var c=r.reg&&num(r.reg.cost,p);
 if(c==null&&CC.Skills&&CC.Skills.slotInfo){var si=CC.Skills.slotInfo(p,r.slot);c=si&&si.cost;}
 if(c==null)c=p.cost&&p.cost[r.key];
 return c==null?12:c;
}
function costOf(p,r){
 if(!r.reg)return cost(p,r.legacy);
 return Math.ceil(tapCost(p,r)*(r.reg.manaMul||1.65));
}
function tapCooldown(p,r){
 var b=r.reg&&num(r.reg.cooldown,p);
 if(b==null)return (p.cdMax&&p.cdMax[r.key])||4;
 if(CC.Skills&&CC.Skills.cdMul&&r.id)b*=CC.Skills.cdMul(p,r.id);
 return b*(1-Math.min(.5,(p.stats&&p.stats.cdr)||0));
}
// Independent cooldowns: the charged cast runs its own (longer) cooldown in p.cdC[key]; the tap keeps p.cd[key].
function setSharedCd(p,r){
 var m=tapCooldown(p,r)*(r.reg&&r.reg.cdMul||CHARGED_CD_MUL[r.key]||1.75);
 p.cdC=p.cdC||{};p.cdCMax=p.cdCMax||{};
 p.cdC[r.key]=Math.max(p.cdC[r.key]||0,m);p.cdCMax[r.key]=m;
}
function cost(p,slot){
 var def=slotDefinition(p,slot);
 if(slot==='dash')return Math.max(10,Math.ceil((p.maxMana||60)*.16));
 return Math.ceil(((p.cost&&p.cost[slot])||12)*(def.mult||1.8));
}
function levelOk(p,r){
 if(!p||!p.cd||!r)return false;
 if(r.legacy==='spell2'&&p.level<4)return false;
 var si=r.slot!=='dash'&&CC.Skills&&CC.Skills.slotInfo&&p.slots?CC.Skills.slotInfo(p,r.slot):null;
 return !(si&&(si.locked||si.empty));
}
// Spells: tap and charged versions share ONE cooldown, p.cd[key]. Dash only: p.cdC.dash is a separate charged cooldown (p.cdCMax holds its length).
function chargedReady(p,slot){p.cdC=p.cdC||{};return (p.cdC[slot]||0)<=.01;}
// spells share one cooldown (p.cd[key]); only the dash keeps its separate charged cooldown
// a press may start when EITHER the tap or the charged version is ready; release then checks the one actually cast
function cdReady(p,r){return (p.cd[r.key]||0)<=.01||chargedReady(p,r.key);}
function unlocked(p,r){return levelOk(p,r)&&cdReady(p,r);}
var CHARGED_CD_MUL={spell1:2,spell2:2,dash:1.6}; // a charged cast recharges for longer than the tap (tap: 1x its cooldown)
function standable(p,x,y){
 var D=CC.Dungeon,r=Math.max(3,(p.r||8)*.78);
 if(!D||!D.isSolid)return true;
 return !D.isSolid(x,y)&&!D.isSolid(x-r,y-r)&&
  !D.isSolid(x+r,y-r)&&!D.isSolid(x-r,y+r)&&!D.isSolid(x+r,y+r);
}
function dashLanding(p,n,reach){
 // A stepwise collision-aware preview: never promise an unreachable spot
 // inside rock, tree walls, props or closed dungeon boundaries.
 var steps=Math.max(1,Math.ceil(reach/5)),last=0;
 for(var k=1;k<=steps;k++){
   var amount=reach*k/steps,
       x=p.x+n.x*amount,y=p.y+n.y*amount;
   if(!standable(p,x,y))break;
   last=amount;
 }
 return {x:p.x+n.x*last,y:p.y+n.y*last,distance:last};
}
function aim(p,slot,drag){
 var d=defFor(p,slot),dx=p.aimX||p.face||1,dy=p.aimY||0,autoDistance=null;
 // Stationary input: auto-target the closest visible monster in casting range.
 var best=null,range=d.range||95,bd=(range+24)*(range+24);
 if(!drag){
   var foes=all();
   for(var i=0;i<foes.length;i++){
     var e=foes[i],ds=dist(e.x,e.y,p.x,p.y);
     if(living(e)&&ds*ds<bd&&clearPath(p.x,p.y,e.x,e.y)){best=e;bd=ds*ds;}
   }
   if(best&&slot!=='dash'){
     dx=best.x-p.x;dy=best.y-p.y;
     autoDistance=Math.hypot(dx,dy);
   }
 }else if(drag.world){dx=drag.x-p.x;dy=drag.y-p.y;}
 else{dx=drag.x;dy=drag.y;}
 var n=norm(dx,dy);
 // The stationary field spell Whirl remains centered on the player.
 var reach=d.range===0?0:autoDistance!==null?Math.min(range,autoDistance):range;
 if(drag){
   // Mobile: thumb displacement scales from zero to the original max range.
   // Mouse: selected world coordinate determines the exact travel distance.
   var amount=drag.world?Math.hypot(drag.x-p.x,drag.y-p.y):drag.distance;
   if(slot==='dash')reach=clamp(drag.world?amount:amount/MAX_AIM*range,0,range);
   else if(d.range!==0)reach=clamp(drag.world?amount:amount/83*range,26,range);
 }
 var x,y,valid=true;
 if(slot==='dash'){
   var safe=dashLanding(p,n,reach);
   x=safe.x;y=safe.y;reach=safe.distance;valid=reach>=8;
 }else{
   x=p.x+n.x*reach;y=p.y+n.y*reach;
   // Existing spells do not aim through the forest walls.
   var D=CC.Dungeon,steps=Math.ceil(reach/12);
   if(D&&D.isSolid)for(var k=1;k<=steps;k++){
     var px=p.x+n.x*Math.min(reach,k*12),py=p.y+n.y*Math.min(reach,k*12);
     if(D.isSolid(px,py)){x=p.x+n.x*Math.max(0,(k-1)*12);y=p.y+n.y*Math.max(0,(k-1)*12);break;}
   }
 }
 return {x:x,y:y,dx:n.x,dy:n.y,rad:d.radius,range:reach,valid:valid};
}
function begin(slot,sx,sy,viewW,viewH){
 var p=hero();
 var res=p&&DEFINITIONS[p.classId]?resolve(p,slot):null;
 if(!res||!unlocked(p,res))return false;
 if(active)return false;
 if(lastArea===null)lastArea=CC.state.area;
 wiped=false;
 active={slot:slot,hero:p,res:res,time:0,originX:sx||0,originY:sy||0,
   viewW:viewW||0,viewH:viewH||0,drag:null,charged:false};
 return true;
}
function drag(x,y,viewW,viewH){
 if(!active)return;
 if(viewW)active.viewW=viewW;
 if(viewH)active.viewH=viewH;
 var dx=x-active.originX,dy=y-active.originY,dd=Math.hypot(dx,dy);
 // Amplify only travel towards a nearby screen edge (notably southeast).
 var edge=14,w=active.viewW||0,h=active.viewH||0;
 var spaceX=dx>=0?(w?Math.max(22,w-active.originX-edge):MAX_AIM):Math.max(22,active.originX-edge);
 var spaceY=dy>=0?(h?Math.max(22,h-active.originY-edge):MAX_AIM):Math.max(22,active.originY-edge);
 var sx=Math.min(3.5,Math.max(1,MAX_AIM/spaceX));
 var sy=Math.min(3.5,Math.max(1,MAX_AIM/spaceY));
 var ax=dx*sx,ay=dy*sy;
 active.drag=dd<8?null:{x:ax,y:ay,distance:Math.hypot(ax,ay)};
}
function canCharge(slot){var p=hero();return !!(p&&DEFINITIONS[p.classId]&&resolve(p,slot));} // ignores cooldown/mana: only "does the equipped spell have a charged version"
SC.heldInfo=function(cls,slot){var d=PAIRS[cls+'_'+slot]||(DEFINITIONS[cls]||{})[slot];return d?{name:d.name,color:d.color,shape:d.shape,mult:d.mult}:null;};
function cancel(){if(active&&active.snd&&CC.Audio)CC.Audio.chargeEnd(false);active=null;}
function wipeHooks(){ // modules drop their own projectiles/timers/attached visuals
 for(var id in PAIRS){var f=PAIRS[id].clear;if(typeof f==='function'){try{f();}catch(e){if(root.console)console.error(e);}}}
}
function wipe(){effects.length=0;wipeHooks();}
function clear(){active=null;wipe();}
function isActive(){return !!active;}
function landingRadius(p){
 var ST=CC.SkillTree,f=ST&&ST.rank?ST.rank(p,'focus'):0,
 q=ST&&ST.rank?ST.rank(p,'quickening'):0;
 return ({swordsman:35,wizard:42,necromancer:43,thief:38}[p.classId]||36)+f*4+q*9;
}
function worldAim(x,y){
 if(!active||!Number.isFinite(x)||!Number.isFinite(y))return;
 active.drag={x:x,y:y,distance:0,world:true};
}
function info(){
 if(!active)return null;
 var p=hero();if(!p||p!==active.hero)return null;
 var d=active.res.def,where=aim(p,active.slot,active.drag),
     total=costOf(p,active.res),power=clamp((active.time-ARM)/(FULL-ARM),0,1);
 var motion=active.drag,rawX=motion&&!motion.world?motion.x:0,rawY=motion&&!motion.world?motion.y:0;
 var length=Math.hypot(rawX,rawY);
 return {slot:active.slot,name:d.name,color:d.color,shape:d.shape,range:d.range,half:d.half,pid:active.res.id,preview:d.preview,
   radius:active.slot==='dash'?landingRadius(p):d.radius,
   elapsed:active.time,power:power,progress:power,
   aiming:active.time>=ARM,ready:active.time>=FULL,
   stickX:length?rawX/length:0,stickY:length?rawY/length:0,
   stickAmount:clamp(length/MAX_AIM,0,1),
   cost:total,affordable:p.mana>=total,valid:where.valid,
   maxDistance:d.range,distance:where.range,heroClass:p.classId,
   x:where.x,y:where.y,dx:where.dx,dy:where.dy,originX:p.x,originY:p.y};
}
function effect(kind,opts){
 if(effects.length>=32)effects.shift();
 effects.push(Object.assign({kind:kind,t:0,life:1,interval:.12,pulse:0},opts));
 // Co-op: the partner sees the landed spell (never the aiming preview). 'impact' sparks are re-made on their side.
 if(kind!=='impact'&&!(opts&&opts.visual)&&CC.Multiplayer&&CC.Multiplayer.sendFx){
   var d={kind:kind,own:opts&&opts.owner?1:0};
   for(var k in opts){var v=opts[k];if(k!=='owner'&&(typeof v==='number'||typeof v==='string'||typeof v==='boolean'))d[k]=v;}
   CC.Multiplayer.sendFx('sc',d);
 }
}
// A landed charged spell from the other player: draw only, no damage.
function addRemote(d,owner){
 if(!d||typeof d.kind!=='string'||d.kind==='impact'||effects.length>=32)return;
 var o={kind:d.kind,t:0,life:1,interval:.12,pulse:0,hits:0,visual:true};
 for(var k in d)if(k!=='own'&&k!=='kind')o[k]=d[k];
 if(d.own&&owner)o.owner=owner;
 if(!(o.life>0&&o.life<5))o.life=1;
 effects.push(o);
}
function doCone(p,a,range,half,base,type,slow){
 var hits=0;
 for(var i=0,l=all();i<l.length;i++){
   var e=l[i];if(!living(e))continue;
   var dx=e.x-p.x,dy=e.y-p.y,d=Math.hypot(dx,dy);
   var angle=Math.atan2(dy,dx),da=Math.atan2(Math.sin(angle-a),Math.cos(angle-a));
   if(d>range+(e.r||8)||Math.abs(da)>half||!clearPath(p.x,p.y,e.x,e.y))continue;
   hurt(e,base,type);if(slow)status(e,'slow',slow,.55);hits++;
 }
 return hits;
}
function landing(p){
 var spec=p&&p.chargedLanding;
 if(!spec)return false;
 p.chargedLanding=null;
 var id=p.classId,ST=CC.SkillTree,
   focus=ST&&ST.rank?ST.rank(p,'focus'):0,
   quick=ST&&ST.rank?ST.rank(p,'quickening'):0,
   base={swordsman:35,thief:38,wizard:42,necromancer:43}[id]||36,
   radius=base+focus*4+quick*9,
   mastery=1+focus*.35+quick*.30,
   strength=(.85+spec.power*.25)*mastery,
   damage=p.stats.dmg*strength,
   type=id==='wizard'?'arcane':id==='necromancer'?'drain':'slash',
   color=slotDefinition(p,'dash').color,
   hits=targets(p.x,p.y,radius);
 for(var j=0;j<hits.length;j++){
   var enemy=hits[j],dealt=hurt(enemy,damage,type);
   if(id==='swordsman'){
     status(enemy,'stun',.30+quick*.10);
     push(enemy,p.x,p.y,9);
   }else if(id==='thief'){
     status(enemy,'slow',1.1,.58);
     push(enemy,p.x,p.y,6);
   }else if(id==='wizard'){
     status(enemy,'slow',.80,.63);
   }else if(id==='necromancer'){
     status(enemy,'slow',1.1,.54);
     if(CC.Classes&&CC.Classes.heal)CC.Classes.heal(p,dealt*.23);
   }
 }
 effect('landing',{x:p.x,y:p.y,r:radius,color:color,
   heroClass:id,life:.62,hits:hits.length});
 burst(p.x,p.y,color,15+Math.min(15,hits.length*3));
 shake(Math.min(5,2+hits.length));
 if(hits.length)fxText(p.x,p.y-24,hits.length+' SPLASH HIT'+(hits.length>1?'S':''),color);
 return true;
}
function tickTeleport(p,dt){
 var t=p&&p.teleportPhase;
 if(!t)return;
 t.t+=dt;
 if(!t.shifted&&t.t>=t.duration*.51){
   // This is a true instantaneous relocation (never a dash across tiles).
   t.shifted=true;
   p.x=t.x;p.y=t.y;
   effect('teleportIn',{x:p.x,y:p.y,heroClass:p.classId,
     color:slotDefinition(p,'dash').color,life:.43});
   landing(p);
 }
 if(t.t>=t.duration){p.teleportPhase=null;p.chargedDash=false;}
}
function setChargedCd(p,slot){if(slot!=='dash'){setSharedCd(p,{key:slot});return;}p.cdC=p.cdC||{};p.cdCMax=p.cdCMax||{};var m=(p.cdMax[slot]||4)*(CHARGED_CD_MUL[slot]||2);p.cdC[slot]=Math.max(p.cdC[slot]||0,m);p.cdCMax[slot]=m;}
function cast(p,slot,where,power){
 var d=slotDefinition(p,slot),col=d.color,sc=1+power*.52,
     dmg=p.stats.dmg,angle=Math.atan2(where.dy,where.dx),
     x=where.x,y=where.y;
 if(slot==='dash'){
   var direction=norm(where.dx,where.dy),
       travel=Math.hypot(where.x-p.x,where.y-p.y),
       speed=590+power*85,transporter=p.classId==='wizard'||p.classId==='necromancer';
   p.chargedLanding={power:power,fromX:p.x,fromY:p.y,
     targetX:where.x,targetY:where.y};
   setChargedCd(p,'dash');
   p.swingAng=angle;p.face=direction.x>=0?1:-1;
   if(transporter){
     // Wizard shatters into arcane blue runes. Necromancer dissolves into
     // green spectral smoke. Both teleport, without traversing intermediate tiles.
     p.dashT=0;p.dashTarget=null;p.chargedDash=false;p.dashAttack=false;
     p.teleportPhase={x:where.x,y:where.y,startX:p.x,startY:p.y,
       t:0,duration:.40,shifted:false};
     p.iframes=Math.max(p.iframes||0,.47);
     effect('teleportOut',{x:p.x,y:p.y,heroClass:p.classId,
       color:col,life:.35});
   }else{
     // Swordsman/Thief physically travel to the selected point and stop.
     p.dashSpeed=speed;
     p.dashTarget={x:where.x,y:where.y};
     p.dashT=travel/speed+.09;
     p.dashVX=direction.x*speed;p.dashVY=direction.y*speed;
     p.dashHit=[];p.chargedDash=true;
     p.dashAttack=p.classId==='thief';
     p.iframes=Math.max(p.iframes||0,p.dashT+.07);
     effect('dash',{x:p.x,y:p.y,dx:direction.x,dy:direction.y,
       distance:travel,color:col,life:p.dashT+.14,heroClass:p.classId});
   }
   burst(p.x,p.y,col,11);fxText(p.x,p.y-24,d.name,col);
   return;
 }
 if(p.classId==='wizard'&&slot==='spell1'){
   effect('flame',{owner:p,dx:where.dx,dy:where.dy,color:col,
     range:118+power*21,life:1.10+.28*power,interval:.115,
     damage:dmg*(.27+.065*power)});
 }else if(p.classId==='wizard'&&slot==='spell2'){
   effect('icicles',{x:x,y:y,r:where.rad,color:col,
     life:1.64,interval:.18,damage:dmg*(.57+.12*power),hits:0});
 }else if(p.classId==='swordsman'&&slot==='spell1'){
   var h=doCone(p,angle,89,.7,dmg*2.1*sc,'bash',1.3);
   for(var i=0;i<all().length;i++){
     var e=all()[i];if(!living(e))continue;
     var range=dist(e.x,e.y,p.x,p.y),a=Math.atan2(e.y-p.y,e.x-p.x);
     if(range<91&&Math.abs(Math.atan2(Math.sin(a-angle),Math.cos(a-angle)))<.7){
       status(e,'stun',.65+.3*power);push(e,p.x,p.y,17);
     }
   }
   effect('earth',{x:p.x,y:p.y,dx:where.dx,dy:where.dy,color:col,life:.56,r:95});
   shake(5);burst(p.x+where.dx*55,p.y+where.dy*55,col,20);
 }else if(p.classId==='swordsman'&&slot==='spell2'){
   effect('vortex',{owner:p,r:72+power*13,color:col,life:1.25,
     interval:.21,damage:dmg*(.63+.14*power)});
   p.iframes=Math.max(p.iframes||0,.38);
 }else if(p.classId==='thief'&&slot==='spell1'){
   effect('razor',{x:x,y:y,r:where.rad,color:col,life:1.45,
     interval:.16,damage:dmg*(.55+.16*power),hits:0});
 }else if(p.classId==='thief'&&slot==='spell2'){
   if(CC.SmokeBomb)CC.SmokeBomb.deploy(p,{x:x,y:y,charged:true}); // 20% bigger, lasts 7 s, bursts in the middle and throws three knives
   else{effect('smoke',{x:x,y:y,r:where.rad,color:col,life:2.65,
     interval:.30,damage:dmg*(.17+.06*power)});
   p.iframes=Math.max(p.iframes||0,.62);p.ambushT=Math.max(p.ambushT||0,2.8);}
 }else if(p.classId==='necromancer'&&slot==='spell1'){
   if(CC.Classes&&CC.Classes.summonCharged)
     CC.Classes.summonCharged(x,y,3,p);
   effect('grave',{x:x,y:y,r:where.rad,color:col,life:1.1,
     interval:.40,damage:dmg*.45});
 }else if(p.classId==='necromancer'&&slot==='spell2'){
   effect('soul',{owner:p,x:x,y:y,r:where.rad,color:col,
     life:2.15,interval:.28,damage:dmg*(.48+.06*power)});
 }
 setChargedCd(p,slot);
 p.castFlash=.28;
 fxText(p.x,p.y-30,d.name,col);
 burst(x,y,col,17);shake(3);
}
var castInner=cast;
cast=function(p,slot,where,power){ // test mode: a spell borrowed from another class is cast as that class
 var ov=slot==='spell1'?p.testSpell1:slot==='spell2'?p.testSpell2:null,real=p.classId;
 if(ov&&ov!==real){p.classId=ov;try{return castInner(p,slot,where,power);}finally{p.classId=real;}}
 return castInner(p,slot,where,power);
};
function tapDispatch(p,r,a){
 var reg=r.reg;
 if(reg&&typeof reg.tap==='function'){
   if((p.cd[r.key]||0)>.01)return false;
   var mana=tapCost(p,r);
   if(p.mana<mana){fxText(p.x,p.y-20,'NEED '+mana+' MANA','#7bbddd');return false;}
   var where=aim(p,r.slot,a.drag),ok;
   p.mana-=mana;
   try{ok=reg.tap(p,where,{slot:r.slot,id:r.id});}catch(e){ok=false;if(root.console)console.error(e);}
   if(ok===false){p.mana+=mana;return false;}
   var cd=tapCooldown(p,r);
   p.cd[r.key]=cd;if(!r.legacy){p.cdMax=p.cdMax||{};p.cdMax[r.key]=cd;}
   p.castFlash=Math.max(p.castFlash||0,.2);
   return true;
 }
 if(r.legacy)return !!(CC.Classes&&CC.Classes.tapAction&&CC.Classes.tapAction(r.legacy));
 return !!(CC.Skills&&CC.Skills.cast&&CC.Skills.cast(p,r.id));
}
function castReg(p,r,where,power){
 var ok;
 try{ok=r.reg.charge(p,where,power,{slot:r.slot,id:r.id});}catch(e){ok=false;if(root.console)console.error(e);}
 if(ok===false)return false;
 setSharedCd(p,r);
 p.castFlash=.28;
 fxText(p.x,p.y-30,r.reg.chargeName||r.reg.name,r.reg.color);
 return true;
}
function release(slot){
 if(!active||active.slot!==slot)return false;
 var p=hero(),a=active;active=null;
 var r=a.res,now=p&&resolve(p,slot);
 if(!p||p!==a.hero||!now||now.id!==r.id||!levelOk(p,r))return false;
 if(a.time<ARM){
   var tapped=tapDispatch(p,r,a);
   if(tapped&&r.legacy&&!(r.reg&&r.reg.tap))fxText(p.x,p.y-29,slot==='dash'?'DASH':
     (p.spellNames&&p.spellNames[r.legacy==='spell1'?0:1])||slot,
     r.def.color);
   return tapped;
 }
 if(!chargedReady(p,r.key)){fxText(p.x,p.y-20,'CHARGE RECHARGING','#7bbddd');if(a.snd&&CC.Audio)CC.Audio.chargeEnd(false);return false;}
 var mana=costOf(p,r);
 if(p.mana<mana){fxText(p.x,p.y-20,'NEED '+mana+' MANA','#7bbddd');if(a.snd&&CC.Audio)CC.Audio.chargeEnd(false);return false;}
 if(a.snd&&CC.Audio)CC.Audio.chargeEnd(true);
 var where=aim(p,slot,a.drag),power=clamp((a.time-ARM)/(FULL-ARM),0,1);
 if(!where.valid){fxText(p.x,p.y-20,'BLOCKED LANDING','#f3969d');return false;}
 p.mana-=mana;
 if(r.reg){if(!castReg(p,r,where,power)){p.mana+=mana;return false;}}else cast(p,r.legacy,where,power);
 return true;
}
function combatTick(dt){
 var p=hero();
 if(!p){cancel();effects.length=0;if(!wiped){wiped=true;wipeHooks();}return;}
 wiped=false;
 tickTeleport(p,dt);
 if(p.cdC){for(var ck in p.cdC)if(p.cdC[ck]>0)p.cdC[ck]=Math.max(0,p.cdC[ck]-dt);}
 if(active){
   active.time+=dt;
   if(active.time>=ARM&&!active.charged){active.charged=true;var p=active.hero,d=slotDefinition(p,active.slot);
     /* Cast name is displayed only on release. */}
 }
 for(var i=effects.length-1;i>=0;i--){
   var e=effects[i];e.t+=dt;e.pulse-=dt;
   if(e.t>=e.life){effects.splice(i,1);continue;}
   if(e.pulse>0)continue;
   e.pulse=e.interval;
   var j,foe,affected,px=e.owner?e.owner.x:e.x,py=e.owner?e.owner.y:e.y;
   if(e.visual){ // partner's spell: sparks only, never touches monsters on this screen
     if(e.kind==='icicles'||e.kind==='razor'){
       for(j=0;j<(e.kind==='icicles'?3:4);j++){
         var va=(e.hits*2.399+j*2.14),vr=(e.r||30)*Math.sqrt(((e.hits+j)%13+1)/13);
         effect('impact',{x:px+Math.cos(va)*vr,y:py+Math.sin(va)*vr,color:e.color,life:.32,style:e.kind,visual:true});
       }
       e.hits++;
     }
     continue;
   }
   if(e.kind==='flame'){
     if(!e.owner||e.owner.hp<=0){e.life=e.t;continue;}
     doCone(e.owner,Math.atan2(e.dy,e.dx),e.range,.48,e.damage,'fire',.35);
     if(CC.Vfx&&CC.Vfx.flameEmbers)CC.Vfx.flameEmbers(px,py,e.dx,e.dy,e.range);
     else if(Math.random()<.8)burst(px+e.dx*e.range*.8,py+e.dy*e.range*.8,e.color,2);
   }else if(e.kind==='icicles'||e.kind==='razor'){
     var n=e.kind==='icicles'?3:4;
     for(j=0;j<n;j++){
       var a=(e.hits*2.399+j*2.14),rr=e.r*Math.sqrt(((e.hits+j)%13+1)/13),
           xx=px+Math.cos(a)*rr,yy=py+Math.sin(a)*rr;
       effect('impact',{x:xx,y:yy,color:e.color,life:.32,style:e.kind});
       affected=targets(xx,yy,e.kind==='icicles'?20:19);
       for(var k=0;k<affected.length;k++){
         foe=affected[k];hurt(foe,e.damage,e.kind==='icicles'?'frost':'slash');
         if(e.kind==='icicles')status(foe,'slow',1.75,.48);
       }
       e.hits++;
     }
   }else if(e.kind==='vortex'){
     affected=targets(px,py,e.r);
     for(j=0;j<affected.length;j++){foe=affected[j];hurt(foe,e.damage,'slash');push(foe,px,py,6);}
     burst(px,py,e.color,6);
   }else if(e.kind==='smoke'){
     affected=targets(px,py,e.r);
     for(j=0;j<affected.length;j++){foe=affected[j];hurt(foe,e.damage,'poison');status(foe,'slow',1.2,.53);}
   }else if(e.kind==='grave'){
     affected=targets(px,py,e.r);
     for(j=0;j<affected.length;j++){foe=affected[j];hurt(foe,e.damage,'bone');status(foe,'slow',.8,.68);}
   }else if(e.kind==='soul'){
     affected=targets(px,py,e.r);
     for(j=0;j<affected.length;j++){
       foe=affected[j];var amount=hurt(foe,e.damage,'drain');
       if(e.owner&&CC.Classes&&CC.Classes.heal)CC.Classes.heal(e.owner,amount*.22);
       status(foe,'slow',.6,.68);
     }
   }
 }
}
function update(dt){
 frameTime+=dt;
 var a=CC.state&&CC.state.area;
 if(lastArea===null)lastArea=a;
 else if(lastArea!==a){lastArea=a;cancel();wipe();}
 combatTick(dt);
 if(active&&CC.Audio&&active.time>=ARM){if(!active.snd){active.snd=1;CC.Audio.chargeStart(false,0.6);}CC.Audio.chargeSet(Math.min(1,(active.time-ARM)/(FULL-ARM)));}
}
function glow(c,x,y,r,col){
 var g=c.createRadialGradient(x,y,0,x,y,Math.max(1,r));
 g.addColorStop(0,col);g.addColorStop(1,'rgba(0,0,0,0)');
 c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);
}
function oval(c,x,y,rx,ry,col){
 c.fillStyle=col;c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fill();
}
function ring(c,x,y,r,col,w,start,end){
 c.beginPath();c.arc(x,y,Math.max(1,r),start===undefined?0:start,end===undefined?TAU:end);
 c.strokeStyle=col;c.lineWidth=w;c.stroke();
}
function drawEffects(c,cam){
 var t=frameTime;
 for(var i=0;i<effects.length;i++){
   var e=effects[i],x=(e.owner?e.owner.x:e.x)-cam.x,
      y=(e.owner?e.owner.y:e.y)-cam.y,progress=e.t/e.life;
   c.save();c.globalAlpha=clamp(1-progress,0,1)*.85;
   if(DRAWERS[e.kind]){try{DRAWERS[e.kind](c,e,x,y,progress,t);}catch(_){}c.restore();continue;} // module-registered visuals
   if(CC.Vfx&&CC.Vfx.drawSC&&CC.Vfx.drawSC(c,e,x,y,progress,t)){c.restore();continue;} // stylised art for every held spell
   if(e.kind==='flame'){
     c.translate(x,y);c.rotate(Math.atan2(e.dy,e.dx));
     var range=e.range;
     var grad=c.createLinearGradient(0,0,range,0);
     grad.addColorStop(0,'rgba(255,245,181,.35)');
     grad.addColorStop(.5,'rgba(255,129,38,.56)');
     grad.addColorStop(1,'rgba(253,57,16,0)');
     c.fillStyle=grad;c.beginPath();c.moveTo(0,-4);
     c.lineTo(range*.92,-range*.37);c.quadraticCurveTo(range*1.1,0,range*.92,range*.37);
     c.closePath();c.fill();
     for(var k=0;k<17;k++){
       var speed=(k*13.2+t*250)%range,a=Math.sin(k*4.2+t*5)*.39,
          yy=Math.sin(k*2.93+t*9)*speed*.32;
       oval(c,speed,yy,2+k%3,2+k%2,k%4?'#ff9d3d':'#fff1bd');
     }
   }else if(e.kind==='icicles'||e.kind==='razor'||e.kind==='soul'||e.kind==='smoke'||e.kind==='grave'||e.kind==='vortex'){
     var radius=e.r||50,spin=t*(e.kind==='vortex'?7:2.3);
     var color=e.color;
     glow(c,x,y,radius*1.2,e.kind==='smoke'?'rgba(108,93,166,.32)':'rgba(109,179,226,.20)');
     ring(c,x,y,radius*(.88+.13*Math.sin(t*5)),color,2);
     for(var j=0;j<12;j++){
       var angle=j*TAU/12+spin,
         xx=x+Math.cos(angle)*radius*(.33+.55*progress),yy=y+Math.sin(angle)*radius*(.33+.55*progress);
       if(e.kind==='icicles'){
         c.strokeStyle='#b6f2ff';c.lineWidth=2.5;c.beginPath();
         c.moveTo(xx-3,yy-21+(e.t*80)%29);c.lineTo(xx,yy+1);c.lineTo(xx+2,yy-21+(e.t*80)%29);c.stroke();
       }else if(e.kind==='razor'){
         c.save();c.translate(xx,yy);c.rotate(spin+j*2.3);
         c.fillStyle='#ff8ba2';c.beginPath();c.moveTo(-5,-2);c.lineTo(8,0);
         c.lineTo(-5,2);c.closePath();c.fill();c.restore();
       }else if(e.kind==='grave'){
         oval(c,xx,yy,3,4,'#aaf3af');oval(c,xx+1,yy-1,1,1,'#271f33');
       }else if(e.kind==='soul'){
         oval(c,xx,yy,2,5,'#bb8bf1');
       }else if(e.kind==='smoke'){
         oval(c,xx,yy,9+Math.sin(t*7+j)*3,7,'rgba(122,110,163,.37)');
       }else{
         c.strokeStyle=color;c.lineWidth=2;
         c.beginPath();c.arc(xx,yy,5,0,TAU*.7);c.stroke();
       }
     }
   }else if(e.kind==='impact'){
     ring(c,x,y,6+progress*14,e.color,3*(1-progress));
     if(e.style==='icicles'){
       c.fillStyle='#e4fbff';c.beginPath();c.moveTo(x,y-25*(1-progress));
       c.lineTo(x+4,y);c.lineTo(x,y+8);c.lineTo(x-4,y);c.closePath();c.fill();
     }else{
       c.strokeStyle='#fbe9f0';c.lineWidth=2;
       c.beginPath();c.moveTo(x-11,y-8);c.lineTo(x+10,y+8);c.stroke();
     }
   }else if(e.kind==='earth'){
     c.translate(x,y);c.rotate(Math.atan2(e.dy,e.dx));
     for(var z=0;z<7;z++){
       var dx=z*13+progress*30,side=Math.sin(z*2.3)*19;
       c.fillStyle=z%2?'#d4af7c':'#a27b52';c.beginPath();
       c.moveTo(dx,side+13);c.lineTo(dx+4,side-13*(1-progress));
       c.lineTo(dx+11,side+13);c.closePath();c.fill();
     }
   }else if(e.kind==='dash'){
     c.save();c.translate(x,y);c.rotate(Math.atan2(e.dy,e.dx));
     for(var k=0;k<5;k++){
       c.strokeStyle=e.color;c.lineWidth=2;
       c.beginPath();c.moveTo(0,k*4-9);
       c.lineTo((e.distance||110)*(1-progress),k*4-9);c.stroke();
     }
     c.restore();
   }else if(e.kind==='teleportOut'||e.kind==='teleportIn'||e.kind==='landing'){
     var cls=e.heroClass||'wizard',
       r=e.kind==='landing'?Math.max(6,e.r)*(.28+progress*.72):14+progress*35;
     // Departure is an implosion; landing is a different styled outward burst.
     var fade=e.kind==='landing'?(1-progress):.83*(1-progress);
     c.globalAlpha*=fade;
     ring(c,x,y,r,e.color,2.2);
     if(cls==='wizard'){
       glow(c,x,y,r*.92,'rgba(73,166,255,.40)');
       c.textAlign='center';c.font='bold 13px serif';c.fillStyle='#c7f1ff';
       var glyph=['ᚠ','ᚨ','ᚱ','ᛟ','ᛉ','ᛖ'];
       for(var k=0;k<6;k++){
         var a=k*TAU/6+t*2;
         c.fillText(glyph[k],x+Math.cos(a)*r*.74,y+Math.sin(a)*r*.68);
       }
     }else if(cls==='necromancer'){
       glow(c,x,y,r*.78,'rgba(89,179,111,.35)');
       for(var k=0;k<12;k++){
         var a=k*TAU/12+t*2.8,rr=r*(.3+(k%4)*.16),
             xx=x+Math.cos(a)*rr,yy=y+Math.sin(a)*rr;
         oval(c,xx,yy,3,5,'rgba(144,228,159,.56)');
         c.strokeStyle='#8bcd94';c.lineWidth=1.4;c.beginPath();
         c.moveTo(xx,yy);c.quadraticCurveTo(xx-6,yy-9,xx+4,yy-15);c.stroke();
       }
     }else if(cls==='thief'){
       for(var k=0;k<7;k++){
         var a=k*TAU/7-t*3.4;c.save();c.translate(x,y);c.rotate(a);
         c.strokeStyle=k%2?'#ed8ca1':'#98344c';c.lineWidth=2.3;
         c.beginPath();c.arc(0,0,r*(.4+(k%3)*.15),-.8,1.1);c.stroke();c.restore();
       }
     }else{
       c.strokeStyle='#b9eaff';c.lineWidth=2.8;
       c.beginPath();c.moveTo(x-r*.65,y-r*.45);c.lineTo(x+r*.65,y+r*.45);
       c.moveTo(x-r*.57,y+r*.48);c.lineTo(x+r*.57,y-r*.48);c.stroke();
     }
   }
   c.restore();
 }
}
// A transparent field with a crisp, class-specific edge: no distracting opaque disk.
function hglyph(c,k,s){ // hieroglyph-style glyphs drawn from strokes (no font needed), about +-5 units
 c.save();c.scale(s/5,s/5);c.lineWidth=1.25*5/s;c.lineCap='round';c.lineJoin='round';
 c.beginPath();
 switch(k%8){
  case 0:c.arc(0,-3.2,2.2,0,TAU);c.moveTo(0,-1);c.lineTo(0,5);c.moveTo(-3.4,1.4);c.lineTo(3.4,1.4);break;          // ankh
  case 1:c.moveTo(-5,0);c.quadraticCurveTo(0,-5,5,0);c.quadraticCurveTo(0,5,-5,0);c.moveTo(1.6,0);c.arc(0,0,1.6,0,TAU);c.moveTo(5,0);c.lineTo(5.8,3.4);break; // eye
  case 2:c.moveTo(-5,3);c.bezierCurveTo(-3,-6,1,6,5,-3);c.moveTo(6,-3.4);c.arc(5,-3.4,1,0,TAU);break;               // serpent
  case 3:for(var j=-1;j<=1;j++){c.moveTo(-5,j*3);c.lineTo(-2.5,j*3-2);c.lineTo(0,j*3);c.lineTo(2.5,j*3-2);c.lineTo(5,j*3);}break; // water
  case 4:c.ellipse(0,0,3,4,0,0,TAU);c.moveTo(0,-4);c.lineTo(0,4);c.moveTo(-3,-2);c.lineTo(-5.4,-3.4);c.moveTo(-3,1);c.lineTo(-5.4,2.4);c.moveTo(3,-2);c.lineTo(5.4,-3.4);c.moveTo(3,1);c.lineTo(5.4,2.4);break; // scarab
  case 5:c.moveTo(0,-5);c.lineTo(0,5);c.moveTo(0,-4);c.lineTo(-3,-1);c.moveTo(0,-4);c.lineTo(3,-1);c.moveTo(0,-1);c.lineTo(-3,2);c.moveTo(0,-1);c.lineTo(3,2);break; // reed
  case 6:c.moveTo(-5,4);c.lineTo(0,-5);c.lineTo(5,4);c.closePath();c.moveTo(1,0.5);c.arc(0,0.5,1,0,TAU);break;       // pyramid
  default:c.moveTo(3,0);c.arc(0,0,3,0,TAU);for(var q=0;q<8;q++){c.moveTo(Math.cos(q*.785)*4,Math.sin(q*.785)*4);c.lineTo(Math.cos(q*.785)*5.6,Math.sin(q*.785)*5.6);} // sun disc
 }
 c.stroke();c.restore();
}
function tinySkull(c,x,y,s,col){
 c.save();c.translate(x,y);c.scale(s,s);
 c.fillStyle=col;c.beginPath();c.ellipse(0,-.8,3.6,3.8,0,0,TAU);c.fill();c.fillRect(-2,1.6,4,2.6);
 c.fillStyle='#0b1a12';c.beginPath();c.ellipse(-1.4,-1,.95,1.25,0,0,TAU);c.ellipse(1.4,-1,.95,1.25,0,0,TAU);c.fill();
 c.fillRect(-.3,.8,.6,1);c.fillRect(-1.2,2.4,.5,1.5);c.fillRect(.7,2.4,.5,1.5);
 c.restore();
}
// The necromancer's circle: a ring of alternating skulls and hieroglyphs, bone-and-skull crown on the outside, a turning star within
function necroSigil(c,r,t){
 var i,a,n=16,band=r*.79,gs=Math.max(4,Math.min(9,r*.075)),ss=Math.max(.9,Math.min(2,r*.017));
 ring(c,0,0,r,'#8fe0b0',1.8);
 ring(c,0,0,r*.9,'rgba(143,224,176,.65)',.8);
 ring(c,0,0,r*.68,'rgba(101,172,119,.6)',.8);
 // tick marks like a measuring dial
 c.strokeStyle='rgba(143,224,176,.7)';c.lineWidth=1;
 for(i=0;i<48;i++){a=i*TAU/48+t*.05;var l=i%4===0?5:2.6;c.beginPath();c.moveTo(Math.cos(a)*r,Math.sin(a)*r);c.lineTo(Math.cos(a)*(r+l),Math.sin(a)*(r+l));c.stroke();}
 // the band: skull, glyph, skull, glyph...
 for(i=0;i<n;i++){
  a=i*TAU/n+t*.16;var px=Math.cos(a)*band,py=Math.sin(a)*band;
  if(i%2){c.save();c.translate(px,py);c.rotate(a+Math.PI/2);c.strokeStyle='#9be8b8';hglyph(c,(i>>1)+Math.floor(t*.3),gs);c.restore();}
  else{tinySkull(c,px,py,ss,'#d6f6e0');}
 }
 // skulls crowning the outside, joined by crossed bones
 for(i=0;i<8;i++){
  a=-i*TAU/8-t*.1;var ox=Math.cos(a)*(r*1.13+4),oy=Math.sin(a)*(r*1.13+4);
  c.save();c.translate(ox,oy);c.rotate(a+Math.PI/2);
  c.strokeStyle='rgba(205,236,215,.55)';c.lineWidth=1;c.beginPath();c.moveTo(-5,5);c.lineTo(5,9);c.moveTo(5,5);c.lineTo(-5,9);c.stroke();
  tinySkull(c,0,0,ss*1.25,'#e2f8ea');
  c.restore();
 }
 // a slowly turning star and wisps within
 c.save();c.rotate(-t*.35);c.strokeStyle='rgba(143,224,176,.4)';c.lineWidth=1;
 for(var k=0;k<2;k++){c.rotate(k*Math.PI/3);c.beginPath();for(var j=0;j<3;j++){var sa=j*TAU/3-Math.PI/2;c.lineTo(Math.cos(sa)*r*.6,Math.sin(sa)*r*.6);}c.closePath();c.stroke();}
 c.restore();
 for(i=0;i<7;i++){
  a=i*TAU/7+t*.24;var rr=r*(.34+.07*Math.sin(i+t*1.7)),sx=Math.cos(a)*rr,sy=Math.sin(a)*rr;
  c.strokeStyle=i%2?'rgba(156,231,173,.5)':'rgba(70,136,99,.75)';c.lineWidth=2;
  c.beginPath();c.moveTo(sx,sy);c.quadraticCurveTo(sx-4,sy-8,sx+Math.sin(t+i)*6,sy-16);c.stroke();
  oval(c,sx,sy-4,2.7,4,'rgba(89,193,119,.22)');
 }
 oval(c,0,0,Math.max(3,r*.1),Math.max(3,r*.12),'rgba(149,219,167,.3)');
}
function sigil(c,cls,x,y,r,col,t){
 c.save();c.translate(x,y);c.lineCap='round';
 if(cls==='swordsman'){
   // Clean sword-blue target ring with four engraved blade points.
   ring(c,0,0,r,'#74bdff',1.7);
   ring(c,0,0,r*.88,'rgba(146,213,255,.48)',.7);
   for(var i=0;i<4;i++){
     c.save();c.rotate(i*TAU/4);
     c.strokeStyle='#b4e6ff';c.lineWidth=1.4;
     c.beginPath();c.moveTo(r*.71,-3);c.lineTo(r*.96,0);
     c.lineTo(r*.71,3);c.stroke();
     c.beginPath();c.moveTo(r*.79,-4);c.lineTo(r*.79,4);c.stroke();
     c.restore();
   }
 }else if(cls==='wizard'){
   // The blue runic glyphs orbit the etched magic ring.
   ring(c,0,0,r,'#79c9fa',1.8);
   ring(c,0,0,r*.76,'rgba(129,201,247,.65)',.8);
   c.textAlign='center';c.textBaseline='middle';
   c.font='bold '+Math.max(10,Math.min(14,r*.22))+'px serif';
   var glyphs=['ᚠ','ᚨ','ᚱ','ᛟ','ᛉ','ᚢ','ᛖ','ᚹ'];
   for(var i=0;i<8;i++){
     var a=i*TAU/8+t*.16;
     c.fillStyle='#addfff';
     c.fillText(glyphs[i],Math.cos(a)*r*.87,Math.sin(a)*r*.87);
   }
 }else if(cls==='thief'){
   ring(c,0,0,r,'#d7617b',1.55);
   for(var i=0;i<5;i++){
     var a=i*TAU/5+t*.52;
     c.save();c.rotate(a);c.strokeStyle=i%2?'rgba(243,117,137,.7)':'rgba(135,38,69,.78)';
     c.lineWidth=1.7;
     c.beginPath();c.arc(0,0,r*(.40+i*.105),-1,1.2);c.stroke();
     c.restore();
     oval(c,Math.cos(a)*r*.5,Math.sin(a)*r*.5,2.6,1.7,'rgba(215,67,98,.33)');
   }
 }else{
   necroSigil(c,r,t);
 }
 c.restore();
}
function drawPreview(c,cam){
 var inf=info();if(!inf||!inf.aiming)return;
 if(typeof inf.preview==='function'){c.save();try{inf.preview(c,cam,inf);}finally{c.restore();}return;}
 var x=inf.x-cam.x,y=inf.y-cam.y,px=inf.originX-cam.x,py=inf.originY-cam.y,
     factor=.57+.43*inf.power,r=Math.max(12,inf.radius)*factor,
     cls=inf.heroClass,progress=inf.progress,
     col=inf.valid&&inf.affordable?(
       {swordsman:'#77c7ff',wizard:'#83cbff',necromancer:'#82cca0',thief:'#dc667c'}[cls]||inf.color):
       '#e07e85';
 c.save();c.globalAlpha=.23+.69*progress;
 if(inf.shape==='dash'){
   c.strokeStyle=col;c.lineWidth=1.2+progress*.8;c.setLineDash([5,5]);
   c.beginPath();c.moveTo(px,py);c.lineTo(x,y);c.stroke();c.setLineDash([]);
   c.fillStyle='rgba(14,22,29,.17)';
   c.beginPath();c.arc(x,y,r,0,TAU);c.fill();
   sigil(c,cls,x,y,r,col,frameTime);ring(c,x,y,5,col,1.5);
 }else if(inf.shape==='line'){
   var la=Math.atan2(inf.dy,inf.dx),ll=Math.max(12,inf.range)*factor,lw=Math.max(5,(inf.radius||14)*.5);
   c.save();c.translate(px,py);c.rotate(la);
   c.fillStyle='rgba(45,112,183,.17)';c.fillRect(0,-lw,ll,lw*2);
   c.strokeStyle=col;c.lineWidth=1.2+progress*.8;c.strokeRect(0,-lw,ll,lw*2);c.restore();
   sigil(c,cls,x,y,Math.min(22,r*.4),col,frameTime);
 }else if(inf.shape==='cone'){
   var a=Math.atan2(inf.dy,inf.dx),half=inf.half||(cls==='wizard'?.48:.7);
   c.fillStyle=cls==='thief'?'rgba(125,32,52,.17)':
     cls==='necromancer'?'rgba(39,113,71,.18)':'rgba(45,118,195,.17)';
   c.beginPath();c.moveTo(px,py);
   c.arc(px,py,Math.max(12,inf.range)*factor,a-half,a+half);
   c.closePath();c.fill();c.strokeStyle=col;c.lineWidth=1.2+progress*.8;c.stroke();
   sigil(c,cls,x,y,Math.min(27,r*.45),col,frameTime);
 }else{
   c.fillStyle=cls==='thief'?'rgba(116,30,51,.18)':
     cls==='necromancer'?'rgba(40,108,75,.18)':'rgba(45,112,183,.18)';
   c.beginPath();c.arc(x,y,r,0,TAU);c.fill();
   sigil(c,cls,x,y,r,col,frameTime);
 }
 ring(c,x,y,r+4,col,2.2,-Math.PI/2,-Math.PI/2+TAU*Math.max(.012,progress));
 if(inf.ready)ring(c,x,y,r+7+Math.sin(frameTime*6)*1.3,col,1.1);
 c.restore();
}
SC.begin=begin;SC.drag=drag;SC.worldAim=worldAim;SC.release=release;SC.cancel=cancel;SC.clear=clear;SC.update=update;SC.land=landing;SC.addRemote=addRemote;
SC.isActive=isActive;SC.info=info;SC.draw=function(c,cam){drawEffects(c,cam);drawPreview(c,cam);};
SC.effect=effect;SC.canCharge=canCharge;SC.pairs=SP;
SC.sigil=sigil;SC.definitions=DEFINITIONS;SC.chargeThreshold=ARM;SC.holdDuration=FULL;
})(window);