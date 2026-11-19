/* Emberdeep waystones: discover in Town and Plains, then instant travel between
 * unlocked markers, or directly to an active camp. In-session world state only.
 */
(function(root){
'use strict';
var CC=root.CC=root.CC||{}, W=CC.Waypoints={};
var known={town:true,plains:false},open=false,clock=0;
var LABELS={town:'Hollowpine Hold',plains:'Rolling Plains',camp:'Your Campsite'};
function state(){return CC.state||{};}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function area(){return state().area;}
function allowed(){return !CC.Camp||!CC.Camp.isInside||!CC.Camp.isInside();}
function point(m,location){
 if(!m)return null;
 if(m.waypoint)return m.waypoint;
 var origin=m.spawn||{x:760,y:760},T=CC.TILE||32;
 var offsets=location==='town'?[[2,1],[2,0],[-2,0],[0,-3],[3,-1],[-3,1],[1,3]]:
   [[3,1],[2,2],[3,-1],[-3,-1],[1,3],[-2,2],[4,0]];
 for(var i=0;i<offsets.length;i++){
   var x=origin.x+offsets[i][0]*T,y=origin.y+offsets[i][1]*T,clear=true;
   if(m.isSolid)for(var dx=-1;dx<=1;dx++)for(var dy=-1;dy<=1;dy++)
     if(m.isSolid(x+dx*11,y+dy*11))clear=false;
   if(clear){m.waypoint={x:x,y:y};break;}
 }
 if(!m.waypoint)m.waypoint={x:origin.x+T,y:origin.y};
 return m.waypoint;
}
W.discover=function(location,map){
 if(location!=='town'&&location!=='plains')return;
 known[location]=true;
 if(map)point(map,location);
};
W.reset=function(){known={town:true,plains:false};open=false;};
W.restore=function(o){
 known={town:true,plains:!!(o&&o.plains)};open=false;
};
W.isOpen=function(){return open;};
W.isNear=function(){
 var s=state(),p=s.player,loc=area();
 if(!p||!allowed()||!(loc==='town'||loc==='plains'))return false;
 var map=s.mode==='town'?CC.Town&&CC.Town.map:s.map;
 return !!(map&&dist(p,point(map,loc))<66);
};
W.interact=function(){if(!W.isNear())return false;open=true;return true;};
W.close=function(){open=false;};
W.key=function(key){
 if(!open)return false;
 if(key==='Escape'||key==='KeyN'){open=false;return true;}
 if(key==='Digit1')return W.travel('town'),true;
 if(key==='Digit2'&&known.plains)return W.travel('plains'),true;
 if(key==='Digit3'&&CC.Camp&&CC.Camp.hasCamp&&CC.Camp.hasCamp())return W.travel('camp'),true;
 return true;
};
W.travel=function(target){
 if(!open)return false;
 if(target==='plains'&&!known.plains)return false;
 if(target==='camp'&&!(CC.Camp&&CC.Camp.hasCamp&&CC.Camp.hasCamp()))return false;
 if(target!=='town'&&target!=='plains'&&target!=='camp')return false;
 open=false;
 if(target==='camp'){
   if(CC.Camp.travelTo&&CC.Camp.travelTo()) {
     if(CC.fx&&CC.fx.burst){var p=state().player;CC.fx.burst(p.x,p.y,'#74d8dc',24,110);}
     return true;
   }
   return false;
 }
 if(target==='town'){
   if(CC.setMode)CC.setMode('town');
   var s=state(),p=s.player,m=CC.Town&&CC.Town.map,pt=m&&point(m,'town');
   if(p&&pt){p.x=pt.x;p.y=pt.y+30;}
 }else if(CC.travelToArea){
   CC.travelToArea('plains');
   var st=state(),pp=st.player,mp=st.map,wp=mp&&point(mp,'plains');
   if(pp&&wp){pp.x=wp.x;pp.y=wp.y+29;}
 }
 if(CC.fx&&CC.fx.text&&state().player)
   CC.fx.text(state().player.x,state().player.y-30,'WAYSTONE TRAVEL','#a9f4e4',13);
 return true;
};
W.update=function(dt){clock+=dt;}
function ellipse(c,x,y,rx,ry,col){
 c.fillStyle=col;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();
}
W.draw=function(c,cam){
 var s=state(),loc=area();if(!allowed()||!(loc==='town'||loc==='plains'))return;
 var map=loc==='town'?CC.Town&&CC.Town.map:s.map;
 if(!map)return;
 var wp=point(map,loc),x=wp.x-cam.x,y=wp.y-cam.y;
 if(x< -90||x>cam.w+90||y< -90||y>cam.h+90)return;
 c.save();ellipse(c,x,y+17,24,10,'rgba(0,0,0,.43)');
 ellipse(c,x,y+9,19,8,'#3b4948');ellipse(c,x,y+6,13,5,'#677b75');
 c.strokeStyle='#7cbaab';c.lineWidth=1.5;c.beginPath();c.ellipse(x,y+6,17,8,0,0,Math.PI*2);c.stroke();
 // Ancient carved standing stone with stepped sides and a breathing cyan glyph.
 c.fillStyle='#253d42';c.beginPath();c.moveTo(x-11,y+5);
 c.lineTo(x-13,y-28);c.lineTo(x-5,y-43);c.lineTo(x+7,y-43);
 c.lineTo(x+14,y-27);c.lineTo(x+11,y+5);c.closePath();c.fill();
 c.fillStyle='#5d7874';c.beginPath();c.moveTo(x-12,y-30);c.lineTo(x-5,y-43);
 c.lineTo(x-2,y-43);c.lineTo(x-4,y+3);c.lineTo(x-10,y+5);c.closePath();c.fill();
 c.shadowColor='#66f5e0';c.shadowBlur=8+4*Math.sin(clock*3);
 c.strokeStyle='#88ead2';c.lineWidth=2.4;
 c.beginPath();c.moveTo(x,y-35);c.lineTo(x-6,y-24);c.lineTo(x,y-17);
 c.lineTo(x+6,y-24);c.closePath();c.stroke();
 c.beginPath();c.arc(x,y-24,3.5,0,Math.PI*2);c.stroke();
 c.shadowBlur=0;
 for(var i=0;i<4;i++)ellipse(c,x+Math.cos(i*1.6+clock)*17,y-20+Math.sin(i*1.6+clock*1.4)*9,1.3,1.3,'#8eedd6');
 if(W.isNear()){
   c.fillStyle='rgba(10,20,25,.87)';c.fillRect(x-56,y-68,112,19);
   c.strokeStyle='#8fd7c6';c.strokeRect(x-56,y-68,112,19);
   c.fillStyle='#dffbf1';c.textAlign='center';c.font='bold 10px Georgia';
   c.fillText('F  USE WAYSTONE',x,y-54);
 }
 c.restore();
};
W.drawUI=function(c,width,height,hit){
 if(!open)return;
 c.save();c.fillStyle='rgba(4,8,13,.76)';c.fillRect(0,0,width,height);
 var w=Math.min(368,width-25),x=(width-w)/2,h=302,y=(height-h)/2;
 c.fillStyle='#152329';c.fillRect(x,y,w,h);
 c.strokeStyle='#8ddfcb';c.lineWidth=2;c.strokeRect(x,y,w,h);
 c.textAlign='center';c.font='bold 21px Georgia';c.fillStyle='#b8ffef';
 c.fillText('ANCIENT WAYSTONES',width/2,y+34);
 c.font='12px Georgia';c.fillStyle='#acbec1';c.fillText('Instant travel to discovered places',width/2,y+55);
 var options=[['town',true],['plains',known.plains],['camp',CC.Camp&&CC.Camp.hasCamp&&CC.Camp.hasCamp()]];
 for(var i=0;i<3;i++){
   var p=options[i],enabled=!!p[1],by=y+76+i*61;
   c.fillStyle=enabled?'#274b49':'#293034';c.fillRect(x+18,by,w-36,49);
   c.strokeStyle=enabled?'#6dcdb4':'#515960';c.strokeRect(x+18,by,w-36,49);
   c.textAlign='left';c.font='bold 14px Georgia';c.fillStyle=enabled?'#d0fff0':'#889497';
   c.fillText((i+1)+'.  '+LABELS[p[0]],x+31,by+22);
   c.font='11px Georgia';c.fillStyle=enabled?'#96c6b8':'#6e797b';
   c.fillText(enabled?(p[0]===area()?'Current region':'Travel instantly'):'Not discovered',x+31,by+39);
   if(enabled)(function(location,yy){hit(x+18,yy,w-36,49,function(){W.travel(location);});})(p[0],by);
 }
 c.textAlign='center';c.font='12px Georgia';c.fillStyle='#c9d4d5';c.fillText('Close [ESC]',width/2,y+285);
 hit(width/2-67,y+270,134,26,function(){open=false;});
 c.restore();
};
W.status=function(){return {town:known.town,plains:known.plains,open:open};};
})(window);