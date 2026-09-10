import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Alignment, hitTest, skeleton } from '../engine/alignment.js';
import { buildScene } from '../engine/geometry.js';

const rig = JSON.parse(await readFile(new URL('../character/glitch/rig.json', import.meta.url)));
const close = (a,b) => { assert.equal(a.length,b.length);a.forEach((n,i)=>assert(Math.abs(n-b[i])<1e-7,`${n} != ${b[i]}`)); };

test('dragging a rotated arm follows world axes and does not move the reference or other parts',()=>{
  const e=new Alignment(rig);e.select('arm-left');const before=e.scene();
  e.begin();e.move(31,-19);e.commit();const after=e.scene();
  for(let i=0;i<before.length;i++){
    if(before[i].part.id==='arm-left')close(after[i].positions,before[i].positions.map((n,j)=>n+(j%2?-19:31)));
    else close(after[i].positions,before[i].positions);
  }
  assert.deepEqual(e.rig.reference,rig.reference);assert.deepEqual(e.rig.parts.find(p=>p.id==='arm-left').rect,rig.parts.find(p=>p.id==='arm-left').rect);
});

test('head-group resizing scales every feature and its clipping aperture around the same center',()=>{
  const e=new Alignment(rig);e.select('@head');const b=e.bounds(),center=[b[0]+b[2]/2,b[1]+b[3]/2];
  const before=e.scene();e.scale(1.12);const after=e.scene();
  const scaled=p=>p.map((n,i)=>center[i%2]+(n-center[i%2])*1.12);
  for(let i=0;i<before.length;i++){
    if(e.ids.includes(before[i].part.id)){
      close(after[i].positions,scaled(before[i].positions));
      if(before[i].clip){close(after[i].clip.center,scaled(before[i].clip.center));close(after[i].clip.axisX,before[i].clip.axisX.map(n=>n*1.12));}
    }else close(after[i].positions,before[i].positions);
  }
});

test('rotation preserves selected distances, and undo/redo and export/import restore exact placement',()=>{
  const e=new Alignment(rig);e.select('@legs');const base=e.scene(),data=e.exportRig();
  e.begin();e.rotate(7);e.move(12,4);e.commit();
  const changed=e.scene(),first=base.find(p=>p.part.id==='leg-left'),second=changed.find(p=>p.part.id==='leg-left');
  const distance=p=>Math.hypot(p[0]-p.at(-2),p[1]-p.at(-1));
  assert(Math.abs(distance(first.positions)-distance(second.positions))<1e-7);
  const saved=e.exportRig();e.undo();assert.deepEqual(e.exportRig(),data);e.redo();assert.deepEqual(e.exportRig(),saved);
  const restored=new Alignment(rig);restored.importRig(saved);assert.deepEqual(restored.scene(),changed);
  saved.parts[0].rect[0]+=1;assert.throws(()=>restored.importRig(saved),/底模/);
  assert.deepEqual(restored.scene(),changed,'Rejected imports must leave the work intact');
});

test('drag cancellation is reversible and malformed transforms cannot enter the rig',()=>{
  const e=new Alignment(rig);e.select('arm-right');e.begin();e.move(12,18);e.move(20,0);e.cancel();
  assert.deepEqual(e.exportRig(),rig);assert.equal(e.past.length,0);
  for(const adjustment of [[0,0,0,0,0,0],[1,0,0,1,Infinity,0],[-1,0,0,1,0,0]]){
    const bad=structuredClone(rig);bad.parts[0].adjustment=adjustment;assert.throws(()=>e.importRig(bad));
  }
});

test('picking ignores transparent pixels, hidden layers and points outside the eye clip',()=>{
  const item={part:{id:'back',texture:'back'},positions:[0,0,100,0,0,100],texcoords:[0,0,100,0,0,100],indices:[0,1,2],opacity:1};
  const front={...item,part:{id:'front',texture:'front'}};
  assert.equal(hitTest([item,front],20,20,(id)=>id==='front'?0:255),'back');
  assert.equal(hitTest([item,{...front,opacity:0}],20,20,()=>255),'back');
  assert.equal(hitTest([item],90,90,()=>255),null);
  front.clip={center:[10,10],axisX:[4,0],axisY:[0,4]};
  assert.equal(hitTest([item,front],20,20,()=>255),'back');
  assert.equal(hitTest([item,front],10,10,()=>255),'front');
});

test('skeleton wrist guides follow the calibrated artwork and exported rigs use the normal renderer',()=>{
  const e=new Alignment(rig),before=skeleton(e.rig);e.select('arm-left');e.move(-20,35);
  const after=skeleton(e.rig);close(after.joints.wristLeft,[before.joints.wristLeft[0]-20,before.joints.wristLeft[1]+35]);
  close(after.joints.wristRight,before.joints.wristRight);
  assert.deepEqual(buildScene(e.exportRig(),e.pose),e.scene());
});

test('replacing artwork preserves edits to unchanged parts and rejects unrelated base changes',()=>{
  const legacy=structuredClone(rig);
  legacy.textures.sleeveLeft.src='previous-left.png';
  legacy.textures.sleeveRight.src='previous-right.png';
  legacy.parts.find(p=>p.id==='arm-left').rect=[0,0,400,650];
  legacy.parts.find(p=>p.id==='arm-right').rect=[500,0,400,650];
  legacy.parts.find(p=>p.id==='arm-left').adjustment=[1.2,0,0,1.2,10,40];
  legacy.textures.skirt.src='previous-skirt.png';
  legacy.textures.legs.src='previous-legs.png';
  const oldTorso=legacy.parts.find(p=>p.id==='torso');
  delete oldTorso.neck.rest;oldTorso.adjustment=[1.05,0,0,1.05,-20,15];
  legacy.parts.find(p=>p.id==='face').adjustment=[1,0,0,1,-8,15];
  const e=new Alignment(rig),result=e.importRig(legacy);
  assert.deepEqual(result.replaced,['arm-left','arm-right','skirt','leg-left','leg-right']);
  assert.deepEqual(result.recalibrated,['torso']);
  assert.deepEqual(e.rig.parts.find(p=>p.id==='torso').adjustment,oldTorso.adjustment);
  assert.deepEqual(e.rig.parts.find(p=>p.id==='torso').neck,rig.parts.find(p=>p.id==='torso').neck);
  assert.deepEqual(e.rig.parts.find(p=>p.id==='face').adjustment,[1,0,0,1,-8,15]);
  assert.deepEqual(e.rig.parts.find(p=>p.id==='arm-left'),rig.parts.find(p=>p.id==='arm-left'));
  for(const id of ['skirt','leg-left','leg-right']) assert.deepEqual(e.rig.parts.find(p=>p.id===id),rig.parts.find(p=>p.id===id));
  assert.deepEqual(e.rig.textures,rig.textures);
  e.undo();assert.deepEqual(e.exportRig(),rig);e.redo();
  const saved=e.exportRig();legacy.parts.find(p=>p.id==='face').rect[0]+=1;
  assert.throws(()=>e.importRig(legacy),/底模/);assert.deepEqual(e.exportRig(),saved);
});
