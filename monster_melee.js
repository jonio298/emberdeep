/* Emberdeep unique close-range creature attacks.
 * Small telegraphed strikes and creature-specific animation; only one additional
 * strike per cooldown, never used by bosses or the bear's custom AI.
 */
(function(root){
'use strict';
var CC=root.CC=root.CC||{},E=CC.Enemies;if(!E)return;
var TAU=Math.PI*2,t=0;
var THEMES={
 bat:['fang dive','#be9de8',.50],slime:['acid slap','#83cf77',1.14],
 skeleton:['bone cleave','#e2dbc6',.84],archer:['bow bash','#d4b98d',.50],
 charger:['horn gore','#dbba73',.54],spitter:['spore bite','#a7da8e',.78],
 spider:['fang stab','#b987d2',.34],snake:['double fang','#a7db7b',.42],
 ghoul:['rending claws','#d27283',.78],scorpion:['venom stinger','#ddb568',.42],
 ghost:['wraith touch','#9dcfdf',.95],demon:['ember claw','#e49d76',.83],
 dragon:['raking claw','#edb070',.88],raven:['talon rake','#c2bdd7',.49],
 horror:['phase rend','#ba8add',.89],vine:['thorn lash','#8abf62',.55],
 direwolf:['snapping jaws','#e5c4ad',.44],crow:['razor beak','#b6b0ca',.36],
 scarecrow:['pitchfork stab','#dcb96f',.42],mawworm:['toothed maw','#d59ba1',1.16],
 rootling:['root claws','#b3b882',.69],sporeling:['spore pop','#c8d793',1.1],
 mosslurker:['moss crush','#90b47f',.91],heartroot:['heartwood smash','#bddba2',1.2],
 horrorHead:['hex snap','#b87df0',.55]
};
var old=E.update;
E.update=function(dt){
  var result=old.apply(this,arguments),p=CC.state&&CC.state.player,arr=this.list||[];
  t+=dt;
  if(!p||p.hp<=0)return result;
  for(var i=0;i<arr.length;i++){
    var e=arr[i];if(!e||e.dead||e.asleep||e.collapsed||e.boss||e.type==='bear')continue;
    var theme=THEMES[e.type];if(!theme)continue;
    e.closeCD=Math.max(0,(e.closeCD||0)-dt);
    e.closeFx=Math.max(0,(e.closeFx||0)-dt);
    if(e.closeStrike){
      e.closeStrike.t-=dt;
      if(e.closeStrike.t<=0){
        var attack=e.closeStrike;
        e.closeStrike=null;e.closeCD=2.4+Math.random()*.8;e.closeFx=.38;
        var dist=Math.hypot(p.x-e.x,p.y-e.y),reach=e.r+(p.r||9)+15;
        if(dist<=reach&&p.invuln<=0&&CC.Classes&&CC.Classes.damage){
          CC.Classes.damage(p,Math.max(1,Math.round(e.dmg*.66)),e);
          if(CC.fx&&CC.fx.burst)CC.fx.burst(p.x,p.y,theme[1],5,45);
        }
      }
    }else if(e.closeCD<=0&&e.state==='idle'&&!e.dangerous){
      var d=Math.hypot(e.x-p.x,e.y-p.y);
      if(d<=e.r+(p.r||9)+27){
        e.closeStrike={t:.32,ang:Math.atan2(p.y-e.y,p.x-e.x)};
        e.closeFx=.6;
        if(CC.fx&&CC.fx.text)CC.fx.text(e.x,e.y-e.r-9,theme[0].toUpperCase(),theme[1],9);
      }
    }
  }
  return result;
};
function line(c,a,b,x,y,col,w){
 c.strokeStyle=col;c.lineWidth=w;c.lineCap='round';c.beginPath();c.moveTo(a,b);c.lineTo(x,y);c.stroke();
}
function arc(c,x,y,r,a,b,col,w){
 c.strokeStyle=col;c.lineWidth=w;c.beginPath();c.arc(x,y,r,a,b);c.stroke();
}
function drawFx(c,cam){
 var list=E.list||[],p=CC.state&&CC.state.player;
 for(var i=0;i<list.length;i++){
  var e=list[i];if(e.dead||e.asleep||!e.closeFx)continue;
  var theme=THEMES[e.type];if(!theme)continue;
  var x=e.x-cam.x,y=e.y-cam.y;
  if(x<-50||y<-50||x>cam.w+50||y>cam.h+50)continue;
  var progress=e.closeStrike?1-e.closeStrike.t/.32:1-Math.max(0,e.closeFx)/.38,
      ready=!!e.closeStrike,alpha=ready?.24+.3*progress:.68*(1-progress);
  c.save();c.translate(x,y);
  var angle=e.closeStrike?e.closeStrike.ang:Math.atan2((p?p.y:e.y)-e.y,(p?p.x:e.x+1)-e.x);
  c.rotate(angle);c.globalAlpha=Math.max(0,Math.min(1,alpha));
  var r=e.r+8,swipe=r*(.65+.45*progress);
  // Each species gets a different silhouette, but all strikes have a readable red tell.
  if(e.type==='snake'||e.type==='spider'||e.type==='direwolf'||e.type==='horrorHead'){
    for(var q=-1;q<=1;q+=2){
      line(c,r*.35,-q*4,r+10,-q*(5+8*progress),theme[1],2.4);
      line(c,r+10,-q*(5+8*progress),r+15,-q*(2+4*progress),'#f4f0df',1.4);
    }
  } else if(e.type==='scorpion'){
    line(c,0,-r*.6,r*.8,-r*.6,r+15,2.8);
    line(c,r*.8,-r*.6,r+13,2,'#f4e2ba',2.2);
  } else if(e.type==='scarecrow'||e.type==='vine'){
    line(c,-3,-r*.7,r+11,r*.25,theme[1],3);
    line(c,r+11,r*.25,r+18,r*.18,'#fff0d1',1.4);
  } else if(e.type==='slime'||e.type==='sporeling'||e.type==='mawworm'){
    arc(c,r*.34,0,swipe,-theme[2],theme[2],theme[1],4.2);
    for(var j=0;j<6;j++){
      var ang=(j-2.5)*.5,xx=r+5+Math.cos(ang)*10,yy=Math.sin(ang)*15;
      c.fillStyle=theme[1];c.beginPath();c.arc(xx,yy,1.3+j%2,0,TAU);c.fill();
    }
  } else if(e.type==='bat'||e.type==='raven'||e.type==='crow'){
    for(var wing=-1;wing<=1;wing+=2){
      line(c,0,0,r*.78,wing*r*.73,theme[1],2.2);
      line(c,r*.78,wing*r*.73,r+12,wing*r*.2,'#f7dcd4',1.2);
    }
  }else if(e.type==='ghoul'||e.type==='dragon'||e.type==='demon'||e.type==='rootling'){
    for(var claw=0;claw<3;claw++){
      var y0=(claw-1)*5;
      line(c,r*.3,y0,r+12,y0+9*(claw-1)*progress,theme[1],2.5);
      line(c,r+12,y0+9*(claw-1)*progress,r+15,y0+11*(claw-1)*progress,'#f5e8df',1.5);
    }
  }else{
    arc(c,r*.22,0,r,-theme[2],theme[2],theme[1],2.7);
    line(c,r*.35,-r*.2,r+12,r*.1,'#f4e5d6',1.5);
  }
  if(ready){
    c.globalAlpha*=.36;
    arc(c,0,0,r+.4,-theme[2],theme[2],'#fa5550',1.3);
  }
  c.restore();
 }
}
function drawStatus(c,W,H){
 var p=CC.state&&CC.state.player;
 if(!p||!p.bearRoarT||p.bearRoarT<=0)return;
 c.save();c.fillStyle='rgba(30,9,17,.88)';c.fillRect(W/2-88,69,176,24);
 c.strokeStyle='#d94e66';c.lineWidth=1;c.strokeRect(W/2-88,69,176,24);
 c.font='bold 11px Georgia';c.textAlign='center';c.fillStyle='#ffb6c1';
 c.fillText('ARMOR -30%  '+p.bearRoarT.toFixed(1)+'s',W/2,85);c.restore();
}
CC.MonsterMelee={drawFx:drawFx,drawStatus:drawStatus};
})(window);