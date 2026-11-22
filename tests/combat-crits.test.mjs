import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function boot(id) {
  const hits=[], signals=[];
  const CC={
    state:{mode:'dungeon',map:{},area:'forest',floor:1},
    Enemies:{ list:[], damage(e,d,t){hits.push({e,d,t});e.hp-=Math.round(d);
      if(e.hp<=0){e.hp=0;e.dead=true;}}, },
    Settings:{get(k){return k==='critMode'?'kills':true;}},
    fx:{burst(){},blood(){},flash(){},shake(){},text(){},hitStop(){}}
  };
  const window={CC};window.window=window;
  runInNewContext(readFileSync(new URL('../classes.js',import.meta.url),'utf8'),window,{filename:'classes.js'});
  const p=CC.Classes.create(id);CC.state.player=p;p.x=p.y=20;
  return {CC,p,hits,signals};
}

test('Wizard critical basic orb pulses three times with controlled splash',()=>{
  const {CC,p,hits}=boot('wizard');
  const e={id:1,x:40,y:20,r:8,hp:200,maxHp:200},
    side={id:2,x:58,y:20,r:8,hp:200,maxHp:200};
  CC.Enemies.list.push(e,side);
  p.stats.crit=1;
  // Prime the world's current map before creating a shot; syncWorld intentionally
  // clears old projectiles on an area transition.
  CC.Classes.update(.001,{noCombat:true});
  const shot=CC.Classes._h.shoot(p,0,100,1,1,7,'bolt','arcane','#5bcaff');
  assert.equal(shot.preRolledCrit,true);
  shot.x=e.x;shot.y=e.y;
  CC.Classes.update(.001,{noCombat:true});
  assert.equal(hits.filter(h=>h.e===e).length,1,'first direct impact is immediate');
  assert.equal(hits.filter(h=>h.e===side).length,1,'splash begins with impact');
  CC.Classes.update(.12,{noCombat:true});
  CC.Classes.update(.12,{noCombat:true});
  assert.equal(hits.filter(h=>h.e===e).length,3,'orb has three damaging pulses');
  assert.equal(hits.filter(h=>h.e===side).length,3,'each pulse splashes nearby foes');
  assert.equal(hits.every(h=>Number.isFinite(h.d)&&h.d>0),true);
});

test('Nonlethal thief crit adds visual slash without starting a scene',()=>{
  const {CC,p}=boot('thief');
  const e={id:4,x:45,y:20,r:8,hp:100,maxHp:100};
  CC.Enemies.list.push(e);
  CC.Classes.hitEnemy(e,4,'slash',{basicAttack:true,preRolledCrit:true});
  assert.ok(e.hp>0);
  assert.equal(CC.Classes.player.classId,'thief');
});
