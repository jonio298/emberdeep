/* Emberdeep first story quest: rescue the orphaned eagle eggs (never "return" them
   to the ancient tree). Sister Alder warms two in Hollowpine; the hero raises a third.
*/
(function(root){
'use strict';
var CC=root.CC=root.CC||{},Q=CC.EggQuest={},TAU=Math.PI*2;
var HATCH_STEPS=800,stage='unstarted',stepCount=0,stepFraction=0,hatched=false,clock=0;
var messages={
 unstarted:'Sister Alder cares for the birds by the town fire. Speak with her.',
 climbing:'Climb the Ancient Tree in the Giant Forest. Clear all five boughs.',
 gathered:'Three orphaned eagle eggs are safe in your sack. Return to Sister Alder.',
 nest:'Two eggs are warming by the town fire. Accept one to keep warm in your sack.',
 complete:'Keep the eagle egg warm while you travel. It will hatch after enough steps.'
};
function notice(s,col){
 var p=CC.state&&CC.state.player;
 if(p&&CC.fx&&CC.fx.text)CC.fx.text(p.x,p.y-25,s,col||'#dfd79f',12);
}
function save(){if(CC.SaveGame&&CC.SaveGame.save)CC.SaveGame.save();}
Q.reset=function(){stage='unstarted';stepCount=0;stepFraction=0;hatched=false;clock=0;};
Q.restore=function(o){
 o=o||{};var choices=['unstarted','climbing','gathered','nest','complete'];
 stage=choices.indexOf(o.stage)>=0?o.stage:'unstarted';
 stepCount=Math.max(0,Math.floor(o.steps||0));stepFraction=0;
 hatched=!!o.hatched||stepCount>=HATCH_STEPS;
 if(stage!=='complete'){stepCount=0;hatched=false;}
};
Q.serialize=function(){return {stage:stage,steps:stepCount,hatched:hatched};};
Q.status=function(){return {stage:stage,steps:stepCount,required:HATCH_STEPS,
 eggCount:stage==='gathered'?3:stage==='nest'?1:stage==='complete'&&!hatched?1:0,
 hatched:hatched,complete:stage==='complete'};};
Q.stage=function(){return stage;};
Q.accept=function(){
 if(stage!=='unstarted')return false;
 stage='climbing';notice('QUEST ACCEPTED: THE UNHATCHED');save();return true;
};
Q.hasGathered=function(){return stage==='gathered'||stage==='nest'||stage==='complete';};
Q.gather=function(){
 if(stage!=='climbing')return false;
 stage='gathered';
 notice('3 ORPHANED EAGLE EGGS GATHERED','#e3d4a1');
 if(CC.fx&&CC.fx.burst){var p=CC.state.player;CC.fx.burst(p.x,p.y,'#efd9a1',22,100);}
 save();return true;
};
Q.deliver=function(){
 if(stage!=='gathered')return false;
 stage='nest';notice('2 EGGS SAFE BY THE TOWN FIRE','#f7c881');save();return true;
};
Q.keepEgg=function(){
 if(stage!=='nest')return false;
 stage='complete';stepCount=0;stepFraction=0;hatched=false;
 notice('A WARM EAGLE EGG JOINS YOUR SACK','#cbefb1');save();return true;
};
Q.tunnelUnlocked=function(){return stage==='complete';};
Q.onMovement=function(dx,dy){
 if(stage!=='complete'||hatched)return;
 var d=Math.hypot(dx,dy);
 if(!isFinite(d)||d<=0||d>45)return; // reject teleports and scene snaps
 stepFraction+=d/16; // one counted step per 16 world pixels walked
 var whole=Math.floor(stepFraction);
 if(whole>0){
   stepCount+=whole;stepFraction-=whole;
   if(stepCount>=HATCH_STEPS){
     stepCount=HATCH_STEPS;hatched=true;
     notice('YOUR EAGLE HAS HATCHED!','#b6eac0');
     if(CC.fx&&CC.fx.burst){var p=CC.state.player;CC.fx.burst(p.x,p.y,'#f3daa7',40,95);}
     save();
   }
 }
};
Q.update=function(dt){clock+=dt;};
Q.drawTownNest=function(c,cam){
 var x=24*32+131-cam.x,y=18*32+27-cam.y;
 c.save();c.translate(x,y);
 c.fillStyle='rgba(0,0,0,.3)';c.beginPath();c.ellipse(0,6,25,10,0,0,TAU);c.fill();
 c.strokeStyle='#956e45';c.lineWidth=3.2;c.lineCap='round';
 for(var j=0;j<16;j++){
   var a=j*2.4,r=15+(j%4)*3;
   c.beginPath();c.moveTo(Math.cos(a)*r,Math.sin(a)*r*.48);
   c.lineTo(Math.cos(a+.8)*(r+6),Math.sin(a+.8)*r*.45+2);c.stroke();
 }
 c.fillStyle='#4e3424';c.beginPath();c.ellipse(0,0,16,7,0,0,TAU);c.fill();
 if(stage==='nest'||stage==='complete')for(j=0;j<2;j++){
   var xx=j?7:-7,yy=-2+Math.sin(clock*2+j)*.5;
   c.fillStyle='#e9d8b7';c.beginPath();c.ellipse(xx,yy,5,7,-.13,0,TAU);c.fill();
   c.fillStyle='#fff0d9';c.fillRect(xx-2,yy-4,2,2);
 }
 c.fillStyle='#b88553';c.fillRect(-3,8,6,10);
 c.restore();
};
Q.drawCompanion=function(c,cam){
 if(stage!=='complete')return;
 var p=CC.state&&CC.state.player;if(!p)return;
 if(!hatched)return; // before hatching: egg is safely inside pack, not on the ground
 var x=p.x-cam.x-23+Math.sin(clock*1.8)*4,
     y=p.y-cam.y-15+Math.cos(clock*3)*2;
 c.save();c.translate(x,y);
 c.shadowColor='#f1daa0';c.shadowBlur=6;
 c.fillStyle='#c7a77b';c.beginPath();c.ellipse(0,0,8,6,0,0,TAU);c.fill();
 c.fillStyle='#e2c79e';c.beginPath();c.arc(6,-4,5,0,TAU);c.fill();
 c.shadowBlur=0;
 var flap=Math.sin(clock*16)*.6;
 c.fillStyle='#9a714e';c.beginPath();c.moveTo(-4,-2);
 c.lineTo(-12,-10+flap*6);c.lineTo(-3,2);c.closePath();c.fill();
 c.fillStyle='#e5c189';c.beginPath();c.moveTo(9,-4);c.lineTo(15,-2);
 c.lineTo(9,0);c.fill();
 c.fillStyle='#282324';c.beginPath();c.arc(7,-6,1.2,0,TAU);c.fill();
 c.restore();
};
Q.drawHud=function(c,w,h){
 if(stage==='unstarted')return;
 c.save();c.textAlign='left';
 c.fillStyle='rgba(15,13,16,.87)';c.fillRect(10,113,Math.min(206,w*.57),32);
 c.strokeStyle='#837050';c.lineWidth=1;c.strokeRect(10,113,Math.min(206,w*.57),32);
 c.fillStyle='#edc88a';c.font='bold 10px Georgia';
 c.fillText('THE UNHATCHED',18,126);
 c.fillStyle='#d4dbc0';c.font='10px Georgia';
 var v=stage==='complete'?hatched?'Eagle chick hatched!':stepCount+' / '+HATCH_STEPS+' steps until hatching':
 stage==='gathered'?'Eggs: 3 · return to Sister Alder':
 stage==='nest'?'Accept your egg from Alder':'Ascend five floors';
 c.fillText(v,18,139);
 c.restore();
};
Q.drawJournal=function(c,x,y,w,h){
 c.save();c.textAlign='left';
 c.fillStyle='#e9c88b';c.font='bold 19px Georgia';
 c.fillText('THE UNHATCHED',x+8,y+32);
 c.strokeStyle='#79603f';c.beginPath();c.moveTo(x+8,y+46);c.lineTo(x+w-8,y+46);c.stroke();
 c.fillStyle='#d8cdb8';c.font='13px Georgia';
 var lines=[
 'A mother eagle died defending her',
 'eggs high in the Ancient Tree.',
 '',
 'Speak to Sister Alder by the town fire.',
 'Climb five floors of the living tree.',
 'Gather three abandoned eagle eggs.',
 'Bring them to the warm town nest.',
 'Keep one egg in your sack to hatch.'
 ];
 for(var i=0;i<lines.length;i++)c.fillText(lines[i],x+9,y+76+i*24);
 var stateMsg=messages[stage];
 if(hatched)stateMsg='Your eaglet hatched and now follows you!';
 var pieces=String(stateMsg).split(' '),lineText='',rows=[];
 c.font='bold 12px Georgia';
 for(i=0;i<pieces.length;i++){
   var next=lineText?lineText+' '+pieces[i]:pieces[i];
   if(c.measureText(next).width>w-26&&lineText){rows.push(lineText);lineText=pieces[i];}
   else lineText=next;
 }
 if(lineText)rows.push(lineText);
 var yy=Math.max(y+306,y+h-85);
 c.fillStyle='#b8d8a8';
 for(i=0;i<rows.length;i++)c.fillText(rows[i],x+9,yy+i*18);
 if(stage==='complete'&&!hatched){
   c.fillStyle='#373a29';c.fillRect(x+9,y+h-33,w-18,12);
   c.fillStyle='#c1d89e';c.fillRect(x+9,y+h-33,(w-18)*stepCount/HATCH_STEPS,12);
 }
 c.restore();
};
Q.dialog=function(d){
 if(stage==='unstarted'){
   d.text='There are three eagle eggs in an abandoned nest atop the Ancient Tree. Their mother was killed defending them. The creatures above are cursed, but the eggs are untouched. Would you climb five floors and gather them before they grow cold?';
   d.actions.push({label:'Accept — gather the orphaned eggs',run:function(){
     Q.accept();d.text='Thank you. Follow the Giant Forest path to the Ancient Tree, then climb through five guarded boughs. Bring all three eggs to my fire.';d.actions=[];
   }});
 }else if(stage==='climbing'){
   d.text='The nest is at the crown of the Ancient Tree. Clear the monsters on each floor, climb the ladders, and gather all three eggs. Please hurry.';
 }else if(stage==='gathered'){
   d.text='You found them! Come to the woven nest here by the fire. I can keep two warm and fed if you will carry the third.';
   d.actions.push({label:'Place the three eggs in Alder’s care',run:function(){
     Q.deliver();d.text='Two eggs are safe in their warm nest. The third is still yours to carry, if you accept it.';d.actions=[{label:'Keep one warm in your sack',run:function(){
       Q.keepEgg();d.text='Keep it near your heart. Take a thousand careful steps and listen for a tiny beak.';d.actions=[];
     }}];
   }});
 }else if(stage==='nest'){
   d.text='Two eggs are safe here. Would you keep the third warm in your sack? When it hatches, it may follow you.';
   d.actions.push({label:'Take one warm eagle egg',run:function(){
     Q.keepEgg();d.text='There. Keep it safe as you walk. The hollow-tree tunnel is yours to explore now.';d.actions=[];
   }});
 }else{
   d.text=hatched?
     'It hatched! See how it follows you. The two here are growing stronger every day. Thank you for saving their family.':
     'The two eggs by my fire are safe. Your egg will hatch after '+Math.max(0,HATCH_STEPS-stepCount)+' more steps. Keep it warm as you travel.';
 }
 return d;
};
})(window);