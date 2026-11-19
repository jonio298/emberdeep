/* Emberdeep charged spellcasting: tap Q/E/Dash for the original ability,
 * hold >= 0.36s to aim and release a class-specific, higher-mana spell.
 * Mobile thumb drag aims relative to its spell button (MOBA-style). The game
 * remains fully playable with keyboard/mouse. Existing hold-ATK charges remain
 * a separate system.
 */
(function(root){
'use strict';
var CC=root.CC=root.CC||{}, SC=CC.SpellCharge={}, TAU=Math.PI*2;
var ARM=.36,FULL=.9, MAX_AIM=110,frameTime=0,active=null,effects=[],lastArea=null;
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
    spell2:{name:'SOUL WELL',shape:'circle',range:161,radius:74,color:'#a47cf0',mult:1.8},
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
function slotDefinition(p,slot){return (DEFINITIONS[p.classId]||DEFINITIONS.swordsman)[slot];}
function cost(p,slot){
 var def=slotDefinition(p,slot);
 if(slot==='dash')return Math.max(10,Math.ceil((p.maxMana||60)*.16));
 return Math.ceil(((p.cost&&p.cost[slot])||12)*(def.mult||1.8));
}
function unlocked(p,slot){
 if(!p||!p.cd||p.cd[slot]>.01)return false;
 if(slot==='spell2'&&p.level<4)return false;
 return true;
}
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
 var d=slotDefinition(p,slot),dx=p.aimX||p.face||1,dy=p.aimY||0,autoDistance=null;
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
 }else{dx=drag.x;dy=drag.y;}
 var n=norm(dx,dy);
 // The stationary field spell Whirl remains centered on the player.
 var reach=d.range===0?0:autoDistance!==null?Math.min(range,autoDistance):range;
 if(drag){
   // Dash distance is proportional to thumb displacement, not fixed at max.
   if(slot==='dash')reach=clamp(drag.distance/MAX_AIM*range,0,range);
   else if(d.range!==0)reach=clamp(drag.distance/83*range,34,range);
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
function begin(slot,sx,sy){
 var p=hero();
 if(!p||!DEFINITIONS[p.classId]||!unlocked(p,slot))return false;
 if(active)return false;
 if(lastArea===null)lastArea=CC.state.area;
 active={slot:slot,hero:p,time:0,originX:sx||0,originY:sy||0,
   drag:null,charged:false};
 return true;
}
function drag(x,y){
 if(!active)return;
 var dx=x-active.originX,dy=y-active.originY,dd=Math.hypot(dx,dy);
 active.drag=dd<9?null:{x:dx,y:dy,distance:dd};
}
function cancel(){active=null;}
function clear(){active=null;effects.length=0;}
function isActive(){return !!active;}
function info(){
 if(!active)return null;
 var p=hero();if(!p||p!==active.hero)return null;
 var d=slotDefinition(p,active.slot),where=aim(p,active.slot,active.drag),
     total=cost(p,active.slot);
 return {slot:active.slot,name:d.name,color:d.color,shape:d.shape,range:d.range,
   radius:d.radius,elapsed:active.time,power:clamp((active.time-ARM)/(FULL-ARM),0,1),
   progress:clamp(active.time/FULL,0,1),ready:active.time>=ARM,
   cost:total,affordable:p.mana>=total,valid:where.valid,
   maxDistance:d.range,distance:where.range,heroClass:p.classId,
   x:where.x,y:where.y,dx:where.dx,dy:where.dy,originX:p.x,originY:p.y};
}
function effect(kind,opts){
 if(effects.length>=32)effects.shift();
 effects.push(Object.assign({kind:kind,t:0,life:1,interval:.12,pulse:0},opts));
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
function cast(p,slot,where,power){
 var d=slotDefinition(p,slot),col=d.color,sc=1+power*.52,
     dmg=p.stats.dmg,angle=Math.atan2(where.dy,where.dx),
     x=where.x,y=where.y;
 if(slot==='dash'){
   // Existing dash movement/collision automatically handles this longer rush.
   p.dashT=.32+.035*power;
   var speed=(500+62*power),direction=norm(where.dx,where.dy);
   p.dashVX=direction.x*speed;p.dashVY=direction.y*speed;
   p.dashHit=[];p.chargedDash=p.classId==='thief';
   p.dashAttack=p.classId==='thief';
   p.iframes=Math.max(p.iframes||0,p.dashT+.08);
   p.cd.dash=Math.max(p.cd.dash||0,p.cdMax.dash*1.50);
   p.swingAng=angle;p.face=direction.x>=0?1:-1;
   effect('dash',{x:p.x,y:p.y,dx:direction.x,dy:direction.y,
     color:col,life:.42});
   burst(p.x,p.y,col,16);fxText(p.x,p.y-24,d.name,col);
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
   effect('smoke',{x:x,y:y,r:where.rad,color:col,life:2.65,
     interval:.30,damage:dmg*(.17+.06*power)});
   p.iframes=Math.max(p.iframes||0,.62);p.ambushT=Math.max(p.ambushT||0,2.8);
 }else if(p.classId==='necromancer'&&slot==='spell1'){
   if(CC.Classes&&CC.Classes.summonCharged)
     CC.Classes.summonCharged(x,y,3,p);
   effect('grave',{x:x,y:y,r:where.rad,color:col,life:1.1,
     interval:.40,damage:dmg*.55});
 }else if(p.classId==='necromancer'&&slot==='spell2'){
   effect('soul',{owner:p,x:x,y:y,r:where.rad,color:col,
     life:2.15,interval:.28,damage:dmg*(.56+.08*power)});
 }
 p.cd[slot]=Math.max(p.cd[slot]||0,p.cdMax[slot]*1.34);
 p.castFlash=.28;
 fxText(p.x,p.y-30,d.name,col);
 burst(x,y,col,17);shake(3);
}
function release(slot){
 if(!active||active.slot!==slot)return false;
 var p=hero(),a=active;active=null;
 if(!p||p!==a.hero||!unlocked(p,slot))return false;
 if(a.time<ARM){
   if(CC.Classes&&CC.Classes.tapAction)return !!CC.Classes.tapAction(slot);
   return false;
 }
 var mana=cost(p,slot);
 if(p.mana<mana){fxText(p.x,p.y-20,'NEED '+mana+' MANA','#7bbddd');return false;}
 var where=aim(p,slot,a.drag),power=clamp((a.time-ARM)/(FULL-ARM),0,1);
 if(!where.valid){fxText(p.x,p.y-20,'BLOCKED LANDING','#f3969d');return false;}
 p.mana-=mana;cast(p,slot,where,power);
 return true;
}
function combatTick(dt){
 if(!hero()){cancel();effects.length=0;return;}
 if(active){
   active.time+=dt;
   if(active.time>=ARM&&!active.charged){active.charged=true;var p=active.hero,d=slotDefinition(p,active.slot);
     fxText(p.x,p.y-18,d.name,d.color);}
 }
 for(var i=effects.length-1;i>=0;i--){
   var e=effects[i];e.t+=dt;e.pulse-=dt;
   if(e.t>=e.life){effects.splice(i,1);continue;}
   if(e.pulse>0)continue;
   e.pulse=e.interval;
   var j,foe,affected,px=e.owner?e.owner.x:e.x,py=e.owner?e.owner.y:e.y;
   if(e.kind==='flame'){
     if(!e.owner||e.owner.hp<=0){e.life=e.t;continue;}
     doCone(e.owner,Math.atan2(e.dy,e.dx),e.range,.48,e.damage,'fire',.35);
     if(Math.random()<.8)burst(px+e.dx*e.range*.8,py+e.dy*e.range*.8,e.color,2);
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
       if(e.owner&&CC.Classes&&CC.Classes.heal)CC.Classes.heal(e.owner,amount*.32);
       status(foe,'slow',.6,.68);
     }
   }
 }
}
function update(dt){
 frameTime+=dt;
 var a=CC.state&&CC.state.area;
 if(lastArea===null)lastArea=a;
 else if(lastArea!==a){lastArea=a;cancel();effects.length=0;}
 combatTick(dt);
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
     glow(c,53,0,62,'rgba(189,200,247,.22)');
     for(var q=0;q<6;q++){
       c.strokeStyle=e.color;c.lineWidth=2.5;
       c.beginPath();c.moveTo(-4,q*5-12);c.lineTo(132*(1-progress),q*6-15);c.stroke();
     }
     c.restore();
   }
   c.restore();
 }
}
function drawPreview(c,cam){
 var inf=info();if(!inf)return;
 var progress=inf.progress,fully=inf.ready,alpha=.24+progress*.55;
 var x=inf.x-cam.x,y=inf.y-cam.y,px=inf.originX-cam.x,py=inf.originY-cam.y;
 var color=inf.affordable?inf.color:'#dc5e68';
 c.save();c.globalAlpha=alpha;
 var r=inf.radius*(.86+.14*Math.sin(frameTime*4));
 if(inf.shape==='dash'){
   c.strokeStyle=color;c.lineWidth=13;c.globalAlpha*=.17;
   c.beginPath();c.moveTo(px,py);c.lineTo(x,y);c.stroke();
   c.globalAlpha=alpha;
   c.strokeStyle=color;c.lineWidth=2.5;c.setLineDash([8,6]);
   c.beginPath();c.moveTo(px,py);c.lineTo(x,y);c.stroke();c.setLineDash([]);
   ring(c,x,y,16,color,2);
   oval(c,x,y,11,5,'rgba(149,200,200,.2)');
 }else if(inf.shape==='cone'){
   var angle=Math.atan2(inf.dy,inf.dx),arcWidth=inf.slot==='spell1'&&active.hero.classId==='wizard'?.49:.72,
       max=inf.range||100;
   c.fillStyle=inf.affordable?'rgba(255,185,105,.16)':'rgba(225,58,68,.12)';
   c.beginPath();c.moveTo(px,py);c.arc(px,py,max,angle-arcWidth,angle+arcWidth);
   c.closePath();c.fill();
   c.lineWidth=2;c.strokeStyle=color;c.stroke();
   ring(c,x,y,Math.min(r,26),color,1.4);
 }else{
   glow(c,x,y,r+24,inf.affordable?'rgba(96,177,219,.25)':'rgba(217,72,78,.21)');
   oval(c,x,y+4,r,r*.54,inf.affordable?'rgba(69,153,216,.16)':'rgba(197,47,58,.14)');
   ring(c,x,y,r,color,2.2);
   ring(c,x,y,r*.7,color,.9);
 }
 c.globalAlpha=Math.min(1,alpha+.16);
 ring(c,x,y,Math.max(13,r),color,3,Math.PI*1.5,Math.PI*1.5+TAU*progress);
 if(fully)ring(c,x,y,Math.max(13,r+4),color,1.3);
 c.save();c.translate(x,y-r-19);
 c.fillStyle='rgba(11,15,20,.88)';
 var width=164;c.fillRect(-width/2,-13,width,30);
 c.strokeStyle=color;c.lineWidth=1;c.strokeRect(-width/2,-13,width,30);
 c.fillStyle='#f2f3ee';c.textAlign='center';c.font='bold 10px Georgia';
 c.fillText(inf.name,0,-1);
 c.font='10px Georgia';c.fillStyle=inf.affordable?(fully?'#c7ffe3':'#e3cc9c'):'#ffb4b8';
 c.fillText(fully?inf.affordable?
   (progress<.99?'RELEASE / HOLD  '+Math.round(progress*100)+'%':'FULL POWER  •  '+inf.cost+' MANA'):
   'NOT ENOUGH MANA':
   'HOLD TO CHARGE  '+Math.round(progress*100)+'%',0,12);
 c.restore();
 c.restore();
}
SC.begin=begin;SC.drag=drag;SC.release=release;SC.cancel=cancel;SC.clear=clear;SC.update=update;
SC.isActive=isActive;SC.info=info;SC.draw=function(c,cam){drawEffects(c,cam);drawPreview(c,cam);};
SC.definitions=DEFINITIONS;SC.chargeThreshold=ARM;SC.holdDuration=FULL;
})(window);