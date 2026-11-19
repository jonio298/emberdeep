/* Emberdeep — five-floor Ancient Tree ascent, the orphaned-eagle quest dungeon.
   Maps are deliberately deterministic per floor so Save/Continue can regenerate them.
   F=climb the ladder after clearing each floor; summit F=gather eggs then descend.
*/
(function(root){
'use strict';
var CC=root.CC=root.CC||{},A=CC.TreeAscent={};
var T=CC.TILE||32,W=40,H=26,TAU=Math.PI*2;
var titles=['The Lower Bark','The Swaying Boughs','The Fungus Canopy','The Broken Roost','The Crown of the Ancient Tree'];
var stage=1,t=0;
function nrand(n,seed){var q=Math.sin((n+seed*97)*128.211)*19213.723;return q-Math.floor(q);}
function oval(c,x,y,rx,ry,col){
 c.fillStyle=col;c.beginPath();c.ellipse(x,y,Math.max(.2,rx),Math.max(.2,ry),0,0,TAU);c.fill();
}
function line(c,x,y,xx,yy,col,w){c.strokeStyle=col;c.lineWidth=w;c.lineCap='round';c.beginPath();c.moveTo(x,y);c.lineTo(xx,yy);c.stroke();}
function nest(c,x,y,tm){
 oval(c,x+2,y+13,34,13,'rgba(3,5,7,.5)');
 for(var j=0;j<16;j++){
   var a=j*2.399,r=20+(j%4)*4;
   line(c,x+Math.cos(a)*r,y+Math.sin(a)*r*.4+6,
     x+Math.cos(a+.8)*(r+7),y+Math.sin(a+.8)*r*.6+7,
     j%3?'#86613d':'#b89760',3.4);
 }
 oval(c,x,y+4,23,10,'#4e372c');oval(c,x,y+4,18,7,'#a8895f');
 var gathered=CC.EggQuest&&CC.EggQuest.hasGathered&&CC.EggQuest.hasGathered();
 if(!gathered)for(j=0;j<3;j++){
   var ex=x+(j-1)*14,ey=y+2+((j%2)*3)+Math.sin(tm*1.3+j)*.5;
   oval(c,ex,ey,6,9,j%2?'#f1dec0':'#ebe2c6');
   oval(c,ex-2,ey-3,2,3,'rgba(255,255,255,.38)');
   oval(c,ex+2,ey+2,1.1,1.4,'#bfa98e');
 }
}
function ladder(c,x,y,tm,top){
 c.save();c.translate(x,y);
 oval(c,0,6,22,12,'rgba(0,0,0,.4)');
 line(c,-12,10,-9,-36,'#855333',5);line(c,12,10,9,-36,'#936740',5);
 for(var j=0;j<6;j++)line(c,-11,6-j*8,11,6-j*8,'#c49a63',3);
 line(c,-10,-34,-22,-42,'#537443',2);
 line(c,10,-34,22,-42,'#537443',2);
 if(!top){c.shadowColor='#94c7a5';c.shadowBlur=12;oval(c,0,-38,4.5,4.5,'#d5e7b8');}
 c.restore();
}
function grass(c,x,y,seed){
 for(var j=0;j<4;j++){
  var xx=x+(j-1.5)*3,dy=Math.sin(t*1.5+seed+j)*2;
  line(c,xx,y,xx+dy+(j-2)*3,y-8-j%3*4,j%2?'#6c8251':'#47664b',1.2);
 }
}
function build(floor){
 floor=Math.max(1,Math.min(5,Math.floor(floor||1)));stage=floor;t=0;
 var tiles=new Uint8Array(W*H).fill(1),kind=new Uint8Array(W*H),props=[],lights=[],path=[];
 var nodes=floor%2?[[4,21],[10,21],[10,16],[18,16],[18,11],[28,11],[28,5],[35,5]]:
  [[4,20],[4,15],[14,15],[14,20],[23,20],[23,11],[33,11],[33,5],[35,5]];
 function stamp(x,y,rad,k){
  for(var iy=Math.max(2,Math.floor(y-rad));iy<Math.min(H-2,Math.ceil(y+rad)+1);iy++)
   for(var ix=Math.max(2,Math.floor(x-rad));ix<Math.min(W-2,Math.ceil(x+rad)+1);ix++){
    if(Math.hypot(ix-x,iy-y)>rad)continue;
    tiles[iy*W+ix]=0;kind[iy*W+ix]=k||1;
   }
 }
 for(var n=0;n<nodes.length-1;n++){
  var p=nodes[n],next=nodes[n+1],steps=Math.ceil(Math.hypot(next[0]-p[0],next[1]-p[1])*4);
  for(var i=0;i<=steps;i++){
   var q=i/steps,x=p[0]+(next[0]-p[0])*q,y=p[1]+(next[1]-p[1])*q;
   stamp(x,y,2.45,n%2?2:1);
  }
 }
 for(n=1;n<nodes.length-1;n++)stamp(nodes[n][0],nodes[n][1],3.5,3);
 var spawn={x:(nodes[0][0]+.5)*T,y:(nodes[0][1]+.5)*T},
     goal={x:(nodes[nodes.length-1][0]+.5)*T,y:(nodes[nodes.length-1][1]+.5)*T};
 // Carve open approach to summit and the 3-egg nest.
 stamp(nodes[nodes.length-1][0],nodes[nodes.length-1][1],3.3,3);
 var forbidden=[spawn,goal],points=[],samples=[
  nodes[2],nodes[3],nodes[4],nodes[5],nodes[nodes.length-3]
 ];
 var typesByFloor=[
  ['bat','bat','vine','raven'],
  ['raven','bat','vine','rootling','bat'],
  ['sporeling','bat','horror','mosslurker','raven'],
  ['horror','vine','raven','mosslurker','horror'],
  ['horror','bat','mosslurker','raven','heartroot','horror']
 ];
 for(i=0;i<samples.length;i++){
   var node=samples[i],cx=(node[0]+.5)*T,cy=(node[1]+.5)*T;
   if(Math.hypot(cx-goal.x,cy-goal.y)<95||Math.hypot(cx-spawn.x,cy-spawn.y)<100)continue;
   points.push({x:cx+(i%2?25:-25),y:cy+(i%3-1)*18,
     type:typesByFloor[floor-1][i%typesByFloor[floor-1].length]});
 }
 if(floor===5)points.push({x:(nodes[5][0]+.5)*T,y:(nodes[5][1]+1.3)*T,type:'horror'});
 for(i=0;i<18+floor*3;i++){
   var nd=nodes[i%nodes.length],px=(nd[0]+.5)*T+(nrand(i,floor)-.5)*110,
      py=(nd[1]+.5)*T+(nrand(i*3,floor)-.5)*94;
   if(px<60||py<60||px>W*T-50||py>H*T-50)continue;
   props.push({x:px,y:py,draw:function(c,sx,sy,tt){
     grass(c,sx,sy,Math.floor(sx+sy));}});
 }
 props.push({x:goal.x,y:goal.y,draw:function(c,sx,sy,tt){
   if(floor===5)nest(c,sx,sy,tt);else ladder(c,sx,sy,tt);
 }});
 lights.push({x:goal.x,y:goal.y,r:150,color:floor===5?'247,192,107':'170,221,163',inten:.9,flicker:.08});
 // Keep a custom artistic terrain palette and layers for every level of ascent.
 function ground(c,k,sx,sy,hv,tt,tx,ty){
   c.fillStyle=k===3?'#72573c':k===2?'#62432e':'#493523';
   c.fillRect(sx,sy,T,T);
   for(var z=0;z<4;z++){
     var rx=sx+nrand(tx*7+z,ty+floor)*T,ry=sy+nrand(ty*9+z,tx+floor)*T;
     line(c,rx,ry,rx+8,ry+Math.sin(z+tx)*2,z%2?'#876246':'#372a22',1.1);
   }
   if((tx*31+ty*7+floor)%6===0)oval(c,sx+19,sy+11,8,4,'rgba(83,117,57,.5)');
 }
 function solidArt(c,k,sx,sy,hv,tt,tx,ty){
   // Gnarled living bark wall with hanging vines and visible void between branches.
   c.fillStyle=hv>.5?'#2d241f':'#241e22';c.fillRect(sx,sy,T,T);
   for(var z=0;z<3;z++){
     var x=sx+4+z*11;
     line(c,x,sy-1,x+Math.sin(tx*.8+z)*4,sy+T+1,z%2?'#715139':'#4e382d',2.5);
   }
   if((tx*3+ty*19+floor)%7===0) {
     line(c,sx+10,sy,sx+14,sy+T-5,'#466244',2);
     oval(c,sx+14,sy+23,5,3,'#688751');
   }
 }
 var map=CC.Realm.create({
   name:titles[floor-1],w:W,h:H,tiles:tiles,kind:kind,spawn:spawn,stairs:goal,
   enemySpawns:[],chests:[],props:props,lights:lights,
   ground:ground,drawSolid:solidArt,ambient:'8,12,12,.73',
   playerLight:195,viewR:235,fog:.08,viewBoost:1.1
 });
 map.treeAscent=true;map.ascentFloor=floor;map.enemySpawns=points;
 map.seed=72410+floor;map.npcs=[];map.eggNest=floor===5?goal:null;
 map.climbGoal=goal;return map;
}
A.generate=build;
A.floor=function(){return stage;};
A.title=function(){return titles[stage-1];};
A.populate=function(floor){
 var E=CC.Enemies;if(!E)return;
 // Clear using floor 1 so the generic cave floor-5 boss never interferes.
 E.spawnForFloor(1,[]);
 var m=CC.state&&CC.state.map;
 if(!m||!m.treeAscent)return;
 for(var i=0;i<m.enemySpawns.length;i++){
   var pt=m.enemySpawns[i],enemy=E.spawn(pt.type,pt.x,pt.y,floor||1,{awake:false});
   if(enemy){enemy.asleep=true;enemy.territory='tree';if(floor>=4&&i===m.enemySpawns.length-1){enemy.maxHp=Math.ceil(enemy.maxHp*1.45);enemy.hp=enemy.maxHp;}}
 }
};
A.canAdvance=function(){
 var E=CC.Enemies;return !E||!E.list||E.list.every(function(e){return e.dead||e.hp<=0||e.asleep&&e.x===-999;});
};
A.interact=function(){
 var s=CC.state,p=s&&s.player,m=s&&s.map;
 if(s.area!=='tree-ascent'||!p||!m)return false;
 if(Math.hypot(p.x-m.stairs.x,p.y-m.stairs.y)>58)return false;
 if(!A.canAdvance()){
   if(CC.fx&&CC.fx.text)CC.fx.text(p.x,p.y-27,'DEFEAT THE NEST GUARDIANS','#f39b78',11);
   return true;
 }
 if(stage===5){
   var Q=CC.EggQuest;
   if(Q&&!Q.hasGathered()){Q.gather();return true;}
   if(Q&&Q.hasGathered()&&CC.leaveTreeAscent){CC.leaveTreeAscent();return true;}
 }else if(CC.nextFloor){CC.nextFloor();return true;}
 return true;
};
A.nearAction=function(){
 var s=CC.state,p=s&&s.player,m=s&&s.map;
 return !!(s.area==='tree-ascent'&&p&&m&&Math.hypot(p.x-m.stairs.x,p.y-m.stairs.y)<60);
};
A.drawHud=function(c,w,h){
 var m=CC.state&&CC.state.map;
 if(!m||!m.treeAscent)return;
 c.save();
 c.textAlign='center';c.fillStyle='rgba(12,15,14,.87)';
 c.fillRect(w/2-140,42,280,38);
 c.strokeStyle='#937d53';c.lineWidth=1;c.strokeRect(w/2-140,42,280,38);
 c.fillStyle='#f2d7a1';c.font='bold 12px Georgia';
 c.fillText('ANCIENT TREE — FLOOR '+stage+' / 5',w/2,57);
 c.fillStyle='#b6c99d';c.font='11px Georgia';
 var caption=!A.canAdvance()?'Guardians remain':
   stage===5?(CC.EggQuest&&CC.EggQuest.hasGathered()?'Eggs secured · descend [F]':'Collect the orphaned eggs [F]'):
   'Climb to the next bough [F]';
 c.fillText(caption,w/2,72);
 c.restore();
};
A.drawEggs=function(c,cam){
 var s=CC.state,m=s&&s.map;
 if(!m||!m.treeAscent)return;
 var q=m.stairs,x=q.x-cam.x,y=q.y-cam.y;
 if(stage===5&&!CC.EggQuest.hasGathered()) {
  c.save();c.shadowColor='#e7ca87';c.shadowBlur=14;nest(c,x,y,t);c.restore();
 }
};
A.update=function(dt){t+=dt;};
A.status=function(){return {floor:stage,cleared:A.canAdvance()};};
})(window);