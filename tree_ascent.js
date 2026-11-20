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
/* ---------- the crown: the very top of the Ancient Tree, in the open air ---------- */
var crownBack=null,crownVillages=[],CN=640;
function buildCrownBack(){
 var cv=document.createElement('canvas');cv.width=CN;cv.height=CN;var c=cv.getContext('2d'),i,x,y;
 function rn(n){return nrand(n,7);}
 var G=64,cell=CN/G;
 for(y=0;y<G;y++)for(x=0;x<G;x++){
  var v=.5+.25*Math.sin(x*.21+y*.13)+.2*Math.sin(y*.31-x*.17+2),sh=Math.floor(rn(x*64+y)*14);
  c.fillStyle=v<.3?'rgb('+(30+sh)+','+(96+sh)+','+(130+sh)+')':v<.42?'rgb('+(86+sh)+','+(134+sh)+','+(66+sh)+')':'rgb('+(36+sh)+','+(86+sh)+','+(44+sh)+')';
  c.fillRect(x*cell,y*cell,cell+1,cell+1);
 }
 for(i=0;i<3400;i++){ // a sea of tree crowns seen from above
  var tx=rn(i*3)*CN,ty=rn(i*3+1)*CN,r=3+rn(i*3+2)*5,gx=Math.floor(tx/cell),gy=Math.floor(ty/cell),v2=.5+.25*Math.sin(gx*.21+gy*.13)+.2*Math.sin(gy*.31-gx*.17+2);
  if(v2<.42)continue;
  c.fillStyle='rgba(18,52,26,.55)';c.beginPath();c.arc(tx+2,ty+2,r,0,TAU);c.fill();
  c.fillStyle=i%3?'#2a6a36':'#357a40';c.beginPath();c.arc(tx,ty,r,0,TAU);c.fill();
  c.fillStyle='rgba(150,210,110,.5)';c.beginPath();c.arc(tx-r*.3,ty-r*.3,r*.45,0,TAU);c.fill();
 }
 c.strokeStyle='rgba(76,150,190,.95)';c.lineWidth=6;c.lineCap='round';c.beginPath();c.moveTo(500,0);
 for(i=1;i<14;i++)c.lineTo(500-i*30+Math.sin(i*1.4)*34,i*50+Math.cos(i*1.1)*10);c.stroke();
 crownVillages=[[210,250,1],[430,470,.7],[120,520,.55]];
 crownVillages.forEach(function(vg,k){
  var vx=vg[0],vy=vg[1],s=vg[2];
  c.fillStyle='rgba(176,160,96,.85)';c.beginPath();c.ellipse(vx,vy,70*s,56*s,0,0,TAU);c.fill(); // cleared ground and fields
  for(i=0;i<7;i++){c.fillStyle=i%2?'rgba(196,170,72,.8)':'rgba(120,160,70,.8)';c.fillRect(vx-92*s+(i%4)*46*s,vy+34*s+Math.floor(i/4)*20*s,40*s,16*s);}
  c.strokeStyle='rgba(210,196,150,.95)';c.lineWidth=3;c.beginPath();c.moveTo(vx-130*s,vy+70*s);c.lineTo(vx,vy);c.lineTo(vx+120*s,vy-80*s);c.stroke();
  for(i=0;i<(k?7:14);i++){var a=i*2.4,rr=(10+(i%4)*9)*s,hx=vx+Math.cos(a)*rr*1.3,hy=vy+Math.sin(a)*rr;
   c.fillStyle='#8a6a52';c.fillRect(hx-4*s,hy-3*s,9*s,7*s);c.fillStyle=i%2?'#b24a3a':'#8a3a30';c.beginPath();c.moveTo(hx-6*s,hy-3*s);c.lineTo(hx,hy-10*s);c.lineTo(hx+6*s,hy-3*s);c.fill();}
  if(!k){c.fillStyle='rgba(255,170,70,.55)';c.beginPath();c.arc(vx,vy,9,0,TAU);c.fill();c.fillStyle='#ffd070';c.beginPath();c.arc(vx,vy,3.5,0,TAU);c.fill();} // the town fire
 });
 crownBack=cv;
}
A.drawBackdrop=function(c,cam){
 if(!crownBack)buildCrownBack();
 var tm=Date.now()/1000,sc=1.7,size=CN*sc,ox=-((cam.x*.28)%size),oy=-((cam.y*.28)%size),x,y;
 if(ox>0)ox-=size;if(oy>0)oy-=size;
 for(x=ox;x<cam.w;x+=size)for(y=oy;y<cam.h;y+=size)c.drawImage(crownBack,x,y,size,size);
 c.save();c.fillStyle='#e8eef2';
 crownVillages.forEach(function(v,i){for(var rx=-1;rx<=1;rx++)for(var ry=-1;ry<=1;ry++){
  var px=ox+v[0]*sc+rx*size,py=oy+v[1]*sc+ry*size;if(px<-30||py<-80||px>cam.w+30||py>cam.h+30)continue;
  for(var k=0;k<4;k++){var u=(tm*.16+k/4+i*.2)%1;c.globalAlpha=.42*(1-u);c.beginPath();c.arc(px+Math.sin(tm+k)*3+u*12,py-8-u*30,2+u*3.4,0,TAU);c.fill();}}});
 c.restore();
 var hz=c.createLinearGradient(0,0,0,cam.h);hz.addColorStop(0,'rgba(180,206,232,.34)');hz.addColorStop(1,'rgba(150,180,210,.22)');c.fillStyle=hz;c.fillRect(0,0,cam.w,cam.h);
 for(var cl=0;cl<7;cl++){ // cloud puffs drifting between the crown and the ground far below
  var cx=((cl*231+tm*(6+cl))-cam.x*.6)%(cam.w+500);if(cx<0)cx+=cam.w+500;cx-=250;
  var cy=((cl*157+40)-cam.y*.6)%(cam.h+400);if(cy<0)cy+=cam.h+400;cy-=200;
  var gr=c.createRadialGradient(cx,cy,0,cx,cy,120+(cl%3)*40);gr.addColorStop(0,'rgba(255,255,255,.36)');gr.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=gr;c.fillRect(cx-170,cy-170,340,340);
 }
};
function leaves(c,sx,sy,seed,tm){ // a clump of foliage on a branch tip, stirring in the wind
 for(var j=0;j<9;j++){
  var a=j*2.4+seed,r=10+(j%4)*8,lx=sx+Math.cos(a)*r+Math.sin(tm*1.2+j+seed)*1.5,ly=sy+Math.sin(a)*r*.7-6,rad=12+(j%3)*3;
  oval(c,lx+1,ly+4,rad,rad*.7,'rgba(10,30,14,.45)');
  oval(c,lx,ly,rad,rad*.72,j%3?'#3d7a3a':'#2f6a34');
  oval(c,lx-3,ly-3,rad*.5,rad*.32,'#7fb85a');
 }
}
function build5(){
 stage=5;t=0;
 var W5=46,H5=38,N=W5*H5,tiles=new Uint8Array(N).fill(1),kind=new Uint8Array(N).fill(10),props=[],lights=[],i,n;
 function stamp(x,y,rad,k){
  for(var iy=Math.max(2,Math.floor(y-rad));iy<Math.min(H5-2,Math.ceil(y+rad)+1);iy++)
   for(var ix=Math.max(2,Math.floor(x-rad));ix<Math.min(W5-2,Math.ceil(x+rad)+1);ix++){
    if(Math.hypot(ix-x,iy-y)>rad)continue;tiles[iy*W5+ix]=0;kind[iy*W5+ix]=k;}
 }
 function seg(a,b,rad,k){var st=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*4);for(var q=0;q<=st;q++){var u=q/st;stamp(a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u,rad,k);}}
 var nodes=[[6,34],[7,28],[14,27],[15,21],[23,19]],goal={x:(23+.5)*T,y:(19+.5)*T},spawn={x:(6+.5)*T,y:(34+.5)*T};
 for(n=0;n<nodes.length-1;n++)seg(nodes[n],nodes[n+1],2.3,n%2?2:1);
 stamp(23,19,3.7,2);
 var spokes=[0,-.75,-1.57,-2.35,.75,1.57,2.4],tips=[];
 spokes.forEach(function(a,j){ // boughs radiating from the nest in every direction, each ending in a clump of leaves
  var len=8+(j%3)*2.5,tip=[23+Math.cos(a)*len*1.15,19+Math.sin(a)*len*.9];
  seg([23,19],tip,1.0-(j%2)*.12,j%2?1:2);stamp(tip[0],tip[1],1.7,1);tips.push(tip);
  var mid=[23+Math.cos(a)*len*.55*1.15,19+Math.sin(a)*len*.55*.9],side=a+(j%2?.9:-.9),tw=[mid[0]+Math.cos(side)*4,mid[1]+Math.sin(side)*3.4];
  seg(mid,tw,.7,1);stamp(tw[0],tw[1],1.1,1);tips.push(tw);
 });
 stamp(7,28,2.6,2);stamp(15,21,2.8,2);
 tips.push([7,28],[15,21]);
 var wx=goal.x-3.5*T,wy=goal.y;stamp(wx/T-.5,wy/T-.5,2.6,2);
 tips.forEach(function(tp,k){props.push({x:(tp[0]+.5)*T,y:(tp[1]+.5)*T+10,sortY:-60,reveal:false,draw:function(c,sx,sy,tm){leaves(c,sx,sy,k*1.7,tm);}});});
 for(i=0;i<46;i++){var gx=2+Math.floor(nrand(i,5)*(W5-4)),gy=2+Math.floor(nrand(i*3,5)*(H5-4));
  if(tiles[gy*W5+gx]===0)props.push({x:(gx+.3+nrand(i,9)*.4)*T,y:(gy+.6)*T,reveal:false,draw:function(c,sx,sy,tt){oval(c,sx,sy,9,4,'rgba(198,151,89,.27)');grass(c,sx,sy,Math.floor(sx+sy));}});}
 props.push({x:goal.x,y:goal.y,reveal:false,draw:function(c,sx,sy,tt){nest(c,sx,sy,tt);}});
 lights.push({x:goal.x,y:goal.y,r:190,color:'255,214,140',inten:.8,flicker:.06});
 var samples=[nodes[1],nodes[2],nodes[3]],pts=[],ty5=['horror','bat','mosslurker','raven','horror','horror'];
 samples.forEach(function(nd,k){pts.push({x:(nd[0]+.5)*T+(k%2?22:-22),y:(nd[1]+.5)*T,type:ty5[k%ty5.length]});});
 pts.push({x:(tips[2][0]+.5)*T,y:(tips[2][1]+.5)*T,type:'raven'});pts.push({x:(tips[6][0]+.5)*T,y:(tips[6][1]+.5)*T,type:'bat'});
 pts.push({x:wx,y:wy,type:'weaselDemon',miniBoss:true});
 function ground(k,hv){if(k===10)return 'rgba(0,0,0,0)';return k===2?(hv<.5?'#a0865a':'#977e54'):(hv<.5?'#7e6544':'#745c3f');}
 function detail(c,k,sx,sy,hv,tt,tx,ty){
  if(k===10)return;
  for(var z=0;z<4;z++){var rx=sx+nrand(tx*7+z,ty+5)*T,ry=sy+nrand(ty*9+z,tx+5)*T;line(c,rx,ry,rx+8,ry+Math.sin(z+tx)*2,z%2?'#a58a60':'#4a3626',1.1);}
  if((tx*13+ty*11)%10===0)oval(c,sx+14,sy+19,1.7,1,'#edce7f');
  if(ty+1<H5&&kind[(ty+1)*W5+tx]===10){var g=c.createLinearGradient(0,sy+T,0,sy+T+26);g.addColorStop(0,'#3e2c20');g.addColorStop(1,'rgba(40,30,24,0)');c.fillStyle=g;c.fillRect(sx,sy+T,T,26);
   for(var q=0;q<3;q++)line(c,sx+5+q*10,sy+T,sx+3+q*10+hv*5,sy+T+16+q*3,'rgba(26,18,14,.5)',1.6);}
 }
 var map=CC.Realm.create({name:titles[4],w:W5,h:H5,tiles:tiles,kind:kind,spawn:spawn,stairs:goal,enemySpawns:[],chests:[],props:props,lights:lights,
  ground:ground,detail:detail,drawSolid:function(){},ambient:'60,84,120,.14',playerLight:300,viewR:340,fog:.03,fogColor:'200,215,235',reveal:false,viewBoost:1.1});
 map.treeAscent=true;map.ascentFloor=5;map.enemySpawns=pts;map.seed=72415;map.npcs=[];map.eggNest=goal;map.climbGoal=goal;
 return map;
}

function build(floor){
 floor=Math.max(1,Math.min(5,Math.floor(floor||1)));stage=floor;t=0;
 if(floor===5)return build5();
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
 for(n=1;n<nodes.length-1;n++)stamp(nodes[n][0],nodes[n][1],3.5,2);
 var spawn={x:(nodes[0][0]+.5)*T,y:(nodes[0][1]+.5)*T},
     goal={x:(nodes[nodes.length-1][0]+.5)*T,y:(nodes[nodes.length-1][1]+.5)*T};
 // Carve open approach to summit and the 3-egg nest.
 stamp(nodes[nodes.length-1][0],nodes[nodes.length-1][1],3.3,2);
 // Realm interprets kind 3 as a raised solid/tree-art tile. Reserve it
 // strictly for real walls, never for walkable balcony platforms.
 for(var wi=0;wi<tiles.length;wi++)if(tiles[wi]!==0)kind[wi]=3;
 var forbidden=[spawn,goal],points=[],samples=[
  nodes[2],nodes[3],nodes[4],nodes[5],nodes[nodes.length-3]
 ];
 var typesByFloor=[
  ['bat','bat','vine','raven'],
  ['raven','bat','vine','rootling','bat'],
  ['sporeling','bat','horror','mosslurker','raven'],
  ['horror','vine','raven','mosslurker','horror'],
  ['horror','bat','mosslurker','raven','horror','horror']
 ];
 for(i=0;i<samples.length;i++){
   var node=samples[i],cx=(node[0]+.5)*T,cy=(node[1]+.5)*T;
   if(Math.hypot(cx-goal.x,cy-goal.y)<95||Math.hypot(cx-spawn.x,cy-spawn.y)<100)continue;
   points.push({x:cx+(i%2?25:-25),y:cy+(i%3-1)*18,
     type:typesByFloor[floor-1][i%typesByFloor[floor-1].length]});
 }
 // Unique guardian stands just before the nest, on the reachable main bough.
 if(floor===5)points.push({x:goal.x-3.5*T,y:goal.y,type:'weaselDemon',miniBoss:true});
 for(i=0;i<18+floor*3;i++){
   var nd=nodes[i%nodes.length],px=(nd[0]+.5)*T+(nrand(i,floor)-.5)*110,
      py=(nd[1]+.5)*T+(nrand(i*3,floor)-.5)*94;
   if(px<60||py<60||px>W*T-50||py>H*T-50)continue;
   props.push({x:px,y:py,draw:function(c,sx,sy,tt){
     if(floor===3){
       oval(c,sx,sy,8,4,'rgba(70,103,57,.5)');
       c.fillStyle='#d6ceb0';c.fillRect(sx-2,sy-8,4,9);
       oval(c,sx,sy-8,9,5,'#6fb79c');
       oval(c,sx-2,sy-9,2,1.4,'#d1fff1');
       c.shadowColor='#6feac1';c.shadowBlur=7;
       oval(c,sx,sy-8,3,2,'rgba(170,250,220,.6)');c.shadowBlur=0;
     }else if(floor===4){
       c.strokeStyle='#cbbf9c';c.lineWidth=1.4;c.beginPath();
       c.moveTo(sx-7,sy-3);c.quadraticCurveTo(sx,sy-12,sx+11,sy-4);c.stroke();
       line(c,sx-4,sy-5,sx+7,sy-5,'#eee3c8',1.1);
     }else if(floor===5){
       oval(c,sx,sy,9,4,'rgba(198,151,89,.27)');
       grass(c,sx,sy,Math.floor(sx+sy));
       oval(c,sx+3,sy-8,2.3,1.4,'#e8cf80');
     }else grass(c,sx,sy,Math.floor(sx+sy));}});
 }
 props.push({x:goal.x,y:goal.y,draw:function(c,sx,sy,tt){
   if(floor===5)nest(c,sx,sy,tt);else ladder(c,sx,sy,tt);
 }});
 lights.push({x:goal.x,y:goal.y,r:150,color:floor===5?'247,192,107':'170,221,163',inten:.9,flicker:.08});
 // Keep a custom artistic terrain palette and layers for every level of ascent.
 function ground(k,hv,tx,ty){
   // Different height strata have their own wood, moss, sky and warm crown tones.
   var tones=[
     ['#493523','#72573c','#272522'],
     ['#45402e','#6e6343','#20272b'],
     ['#354934','#536a45','#1d3029'],
     ['#514037','#85634b','#2b2529'],
     ['#6d6048','#a08b60','#30312b']
   ][floor-1];
   return k===2?tones[1]:k===1?tones[0]:tones[2];
 }
 function detail(c,k,sx,sy,hv,tt,tx,ty){
   for(var z=0;z<4;z++){
     var rx=sx+nrand(tx*7+z,ty+floor)*T,ry=sy+nrand(ty*9+z,tx+floor)*T;
     line(c,rx,ry,rx+8,ry+Math.sin(z+tx)*2,z%2?'#876246':'#372a22',1.1);
   }
   if((tx*31+ty*7+floor)%6===0)
     oval(c,sx+19,sy+11,8,4,floor===3?'rgba(77,169,126,.48)':
       floor===5?'rgba(205,173,110,.31)':'rgba(83,117,57,.5)');
   if(floor===3&&(tx*7+ty*13)%11===0) {
     oval(c,sx+7,sy+15,6,3,'#6ac1ab');oval(c,sx+5,sy+14,2,1,'#d7fff0');
   }else if(floor===4&&(tx*19+ty*7)%8===0){
     line(c,sx+7,sy+19,sx+23,sy+12,'#c7b49a',1.2);
     line(c,sx+14,sy+14,sx+20,sy+22,'#ede1c7',.8);
   }else if(floor===5&&(tx*13+ty*11)%10===0) {
     oval(c,sx+14,sy+19,1.7,1,'#edce7f');
   }
 }
 function solidArt(c,k,sx,sy,hv,tt,tx,ty){
   // Gnarled living bark wall with hanging vines and visible void between branches.
   c.fillStyle=floor===3?(hv>.5?'#294034':'#203029'):
     floor===5?(hv>.5?'#544734':'#3b372f'):
     hv>.5?'#2d241f':'#241e22';
   c.fillRect(sx,sy,T,T);
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
   ground:ground,detail:detail,drawSolid:solidArt,ambient:'8,12,12,.73',
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
   if(enemy){
     enemy.asleep=true;enemy.territory='tree';
     if(pt.miniBoss){
       enemy.miniBoss=true;enemy.weaselPhase=1;enemy.weaselCd=1.1;
       enemy.weaselCycle=0;enemy.xp=160;
     }
     if(floor===4&&i===m.enemySpawns.length-1){
       enemy.maxHp=Math.ceil(enemy.maxHp*1.45);enemy.hp=enemy.maxHp;
     }
   }
 }
};
A.canAdvance=function(){
 var E=CC.Enemies,s=CC.state,m=s&&s.map;
 // the crown's nest needs the guardian slain on THIS map (a stale or swapped monster list after a death must never count as cleared)
 if(m&&m.treeAscent&&m.ascentFloor===5&&!s.coop&&!m.guardianSlain)return false;
 return !E||!E.list||E.list.every(function(e){return e.dead||e.hp<=0||e.asleep&&e.x===-999;});
};
A.interact=function(force){ // force: the party's partner asked at the ladder
 var s=CC.state,p=s&&s.player,m=s&&s.map;
 if(s.area!=='tree-ascent'||!p||!m)return false;
 if(!force&&Math.hypot(p.x-m.stairs.x,p.y-m.stairs.y)>58)return false;
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
 // The character HUD already says "Tree Bough N". No permanent oversized
 // "ANCIENT TREE" title should cover the minimap, hero or health meters.
 // Only show a compact health strip when the unique summit miniboss is alive.
 var m=CC.state&&CC.state.map;
 if(!m||!m.treeAscent||stage!==5)return;
 var boss=CC.TreeWeasel&&CC.TreeWeasel.status&&CC.TreeWeasel.status();
 if(!boss)return;
 var bw=Math.min(196,w*.53),bx=w-12-bw;
 var by=w<360?201:163;
 c.save();
 c.fillStyle='rgba(18,11,20,.81)';c.fillRect(bx-6,by-17,bw+12,34);
 c.strokeStyle='rgba(162,107,134,.74)';c.lineWidth=1;
 c.strokeRect(bx-6,by-17,bw+12,34);
 c.textAlign='center';c.font='bold 10px Georgia';
 c.fillStyle=boss.phase===3?'#ff637b':boss.phase===2?'#ef9ab9':'#dfc0d5';
 c.fillText(boss.phase===3?'VEY R — DESPERATE RAGE'.replace('VEY R','VEYR'):
   boss.phase===2?'VEYR — RAGE':'VEYR, THE HOLLOW MAW',bx+bw/2,by-5);
 var pct=Math.max(0,Math.min(1,boss.hp/Math.max(1,boss.maxHp)));
 c.fillStyle='#1d1020';c.fillRect(bx,by+1,bw,8);
 c.fillStyle=boss.phase===3?'#e63c5b':boss.phase===2?'#ac487e':'#82557d';
 c.fillRect(bx+1,by+2,(bw-2)*pct,6);
 c.strokeStyle='#a67486';c.lineWidth=.8;c.strokeRect(bx,by+1,bw,8);
 c.restore();
};
A.drawEggs=function(c,cam){
 var s=CC.state,m=s&&s.map;
 if(!m||!m.treeAscent)return;
 if(CC.TreeWeasel&&CC.TreeWeasel.drawFx)CC.TreeWeasel.drawFx(c,cam);
 var q=m.stairs,x=q.x-cam.x,y=q.y-cam.y;
 if(stage===5&&!CC.EggQuest.hasGathered()) {
  // Nest itself belongs to the y-sorted world props. Only the subtle
  // summit egg-glint is overlaid here, avoiding two stacked nest sprites.
  c.save();c.globalAlpha=.45+.25*Math.sin(t*3);
  c.shadowColor='#ffe0a0';c.shadowBlur=13;
  oval(c,x,y-4,12,6,'rgba(255,229,162,.27)');c.restore();
 }
};
A.update=function(dt){t+=dt;};
A.status=function(){return {floor:stage,cleared:A.canAdvance()};};
})(window);