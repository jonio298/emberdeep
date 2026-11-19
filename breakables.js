/* Emberdeep: destructible fungi, bushes and stumps in Forest and Plains.
 * Basic projectiles and sword swipes share the same hit/drop logic.
 */
(function(root){
'use strict';
var CC=root.CC=root.CC||{}, B=CC.Breakables={},TAU=Math.PI*2,t=0;
function rng(seed){var n=Math.sin(seed*133.7+11.432)*12517.61;return n-Math.floor(n);}
function line(c,x,y,x2,y2,col,w){
 c.strokeStyle=col;c.lineWidth=w;c.lineCap='round';c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.stroke();
}
function oval(c,x,y,rx,ry,col){
 c.fillStyle=col;c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fill();
}
function safe(m,x,y){
 if(!m.isSolid)return true;
 for(var i=-1;i<=1;i++)for(var j=-1;j<=1;j++)
   if(m.isSolid(x+i*13,y+j*13))return false;
 return true;
}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function scene(){
 var s=CC.state||{},m=s.map;
 return (s.area==='forest'||s.area==='plains')&&m&&m.breakables?m:null;
}
function blockedByExisting(map,x,y){
 var targets=(map.npcs||[]).concat(map.chests||[]);
 targets.push(map.spawn||{x:0,y:0},map.stairs||{x:0,y:0});
 if(map.waypoint)targets.push(map.waypoint);
 for(var i=0;i<targets.length;i++)if(dist({x:x,y:y},targets[i])<95)return true;
 for(i=0;i<(map.breakables||[]).length;i++)if(dist({x:x,y:y},map.breakables[i])<37)return true;
 return false;
}
B.populate=function(area,map){
 if(!map||(area!=='forest'&&area!=='plains'))return;
 if(map.breakables&&map.breakables._initialized)return;
 map.breakables=[];
 var seed=map.seed||57121,spanX=(map.w||60)*32,spanY=(map.h||60)*32,placed=0;
 for(var attempt=0;attempt<430&&placed<45;attempt++){
   var x=64+rng(seed+attempt*3)*Math.max(100,spanX-128);
   var y=64+rng(seed+attempt*3+1)*Math.max(100,spanY-128);
   if(!safe(map,x,y)||blockedByExisting(map,x,y))continue;
   var kind=attempt%4===0?'stump':attempt%3===0?'mushroom':'bush';
   map.breakables.push({x:x,y:y,kind:kind,hp:kind==='stump'?3:kind==='bush'?2:1,
     maxHp:kind==='stump'?3:kind==='bush'?2:1,dead:false,fade:0,seed:attempt,flash:0});
   placed++;
 }
 map.breakables._initialized=true;
};
function breakObject(map,obj){
 obj.dead=true;obj.fade=2.4;
 var palette=obj.kind==='stump'?'#a87843':obj.kind==='mushroom'?'#d1ad72':'#7fa059';
 if(CC.fx&&CC.fx.burst)CC.fx.burst(obj.x,obj.y,palette,14,120);
 if(CC.fx&&CC.fx.text)CC.fx.text(obj.x,obj.y-16,'CRACK!','#d2b788',10);
 // Independently rolled, low-yield loot. Rare items only 0.5% per broken object.
 var L=CC.Loot,roll=Math.random(),drop=null,it=null;
 if(L&&L._spawn){
   if(roll<.005&&L.rollItem){
     it=L.rollItem((CC.state&&CC.state.floor)||1,0,2);
     drop=L._spawn('item',obj.x,obj.y,{item:it,rarity:it.rarity,color:it.color});
   } else if(roll<.045&&L.rollItem){
     it=L.rollItem((CC.state&&CC.state.floor)||1,0,0);
     drop=L._spawn('item',obj.x,obj.y,{item:it,rarity:it.rarity,color:it.color});
   } else if(roll<.215){
     drop=L._spawn('potion',obj.x,obj.y,{color:'#e65061'});
   }
   if(drop)L.drops.push(drop);
 }
}
function hit(obj,map){
 if(obj.dead)return false;
 obj.hp--;obj.flash=.16;
 if(obj.hp<=0)breakObject(map,obj);
 else if(CC.fx&&CC.fx.burst)CC.fx.burst(obj.x,obj.y,'#b4b17d',6,67);
 return true;
}
B.hitCone=function(p,dir,range,half){
 var s=CC.state||{},m=scene();
 if(s.area==='tree-tunnel'&&CC.TreeTunnel)
   return CC.TreeTunnel.hitBreakables(p,dir,range,half);
 if(!m)return 0;
 var hits=0;
 for(var i=0;i<m.breakables.length;i++){
   var b=m.breakables[i],dx=b.x-p.x,dy=b.y-p.y,
     d=Math.hypot(dx,dy),a=Math.atan2(dy,dx),diff=Math.atan2(Math.sin(a-dir.a),Math.cos(a-dir.a));
   if(!b.dead&&d<=range+11&&(d<=8||Math.abs(diff)<=half))hits+=hit(b,m)?1:0;
 }
 return hits;
};
B.hitProjectile=function(shot){
 if(!shot||!(shot.kind==='bolt'||shot.kind==='shard'))return false;
 var s=CC.state||{};
 if(s.area==='tree-tunnel'&&CC.TreeTunnel)
   return CC.TreeTunnel.hitBreakables(shot,{a:0},(shot.r||2)+8,Math.PI)>0;
 var m=scene();if(!m)return false;
 for(var i=0;i<m.breakables.length;i++){
   var b=m.breakables[i];
   if(!b.dead&&dist(shot,b)<=10+(shot.r||2)){hit(b,m);return true;}
 }
 return false;
};
B.update=function(dt){
 t+=dt;
 var m=scene();if(!m)return;
 for(var i=0;i<m.breakables.length;i++){
   var b=m.breakables[i];b.flash=Math.max(0,b.flash-dt);
   if(b.dead&&b.fade>0)b.fade=Math.max(0,b.fade-dt);
 }
};
function mushroom(c,b){
 var x=b.x,y=b.y,scale=1.05+Math.sin(t*1.3+b.seed)*.035;
 c.save();c.translate(x,y);c.scale(scale,scale);
 oval(c,0,6,14,5,'rgba(0,0,0,.36)');
 c.fillStyle='#d8c3a4';c.fillRect(-3,-9,6,16);
 oval(c,0,-8,12,7,b.seed%2?'#a33b4a':'#c37742');
 oval(c,-4,-10,2.5,2,'#fff1c6');oval(c,4,-7,2,1.7,'#edd2a2');
 c.restore();
}
function bush(c,b){
 var x=b.x,y=b.y;
 oval(c,x,y+9,18,6,'rgba(0,0,0,.3)');
 for(var i=0;i<7;i++){
   var ox=Math.cos(i*2.399)*12,oy=Math.sin(i*2.399)*6;
   oval(c,x+ox,y+oy,9.5,7.5,i%3?'#315d37':'#56804c');
 }
 oval(c,x,y-3,12,8,'#416a3c');
 for(i=0;i<6;i++){var a=i*2.399;
   oval(c,x+Math.cos(a)*13,y+Math.sin(a)*8-3,2,1.5,'#84aa6c');
 }
}
function stump(c,b){
 var x=b.x,y=b.y;
 oval(c,x+1,y+11,19,7,'rgba(0,0,0,.37)');
 c.fillStyle='#4f311e';c.fillRect(x-15,y-11,30,19);
 for(var i=0;i<7;i++)line(c,x-13+i*4,y-9,x-11+i*4,y+7,i%2?'#946239':'#39241a',2);
 oval(c,x,y-11,16,8,'#a87b45');
 oval(c,x,y-12,12,5,'#c99b60');
 c.strokeStyle='#76502e';c.lineWidth=1;c.beginPath();c.ellipse(x,y-12,8,3.5,0,0,TAU);c.stroke();
}
B.draw=function(c,cam){
 var m=scene();if(!m)return;
 var list=m.breakables||[];
 c.save();
 for(var i=0;i<list.length;i++){
   var b=list[i],xx=b.x-cam.x,yy=b.y-cam.y;
   if(xx< -45||yy< -45||xx>cam.w+45||yy>cam.h+45)continue;
   c.save();c.translate(-cam.x,-cam.y);
   if(b.dead){
     if(b.fade>0){c.globalAlpha=b.fade/2.4*.45;oval(c,b.x,b.y+5,13,4,b.kind==='bush'?'#5e724a':'#78583a');}
   }else {
     if(b.kind==='mushroom')mushroom(c,b);
     else if(b.kind==='bush')bush(c,b);
     else stump(c,b);
     if(b.hp<b.maxHp){
       c.strokeStyle='#a76641';c.lineWidth=2;
       line(c,b.x-9,b.y-3,b.x+5,b.y+3,'#42201c',2);
       line(c,b.x+5,b.y+3,b.x+9,b.y+8,'#c5a77d',1);
     }
     if(b.flash>0){c.globalAlpha=Math.min(.8,b.flash*4);
       oval(c,b.x,b.y-2,13,9,'#efe0b9');}
   }
   c.restore();
 }
 c.restore();
};
B.status=function(){var m=scene();return {count:m?m.breakables.length:0,
 intact:m?m.breakables.filter(function(q){return !q.dead;}).length:0};};
})(window);