// API checks only. No screenshots, DOM assertions or automated UI interactions.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
const legacy = JSON.parse(await readFile(new URL('../character/glitch/calibration/user-alignment-v0.4.0.json', import.meta.url)));
process.env.GLITCH_PORT='0';
const { server }=await import('./serve.mjs');if(!server.listening)await once(server,'listening');
const base=`http://127.0.0.1:${server.address().port}/align/`;
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  for(const mode of ['webgl','canvas']){
    const page=await browser.newPage(),errors=[],failed=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failed.push(r.url()));
    await page.goto(base+(mode==='canvas'?'?renderer=canvas':''),{waitUntil:'load'});
    const result=await page.evaluate(async legacy=>{
      const api=await window.GlitchAlign.ready;
      const frames=async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);};
      const original=api.exportRig(),reference=api.getInfo().reference;
      api.select('arm-left');const before=api.getInfo().bounds;
      api.move(25,-10);const moved=api.getInfo().bounds;
      api.rotate(5);api.scale(1.06);const saved=api.exportRig();
      api.undo();api.redo();const redone=JSON.stringify(saved)===JSON.stringify(api.exportRig());
      api.setVisible('arm-right',false);api.setBones(true);api.setFrame('head');api.setZoom(180);await frames();
      const edited=api.getInfo();api.reset();const reset=JSON.stringify(original)===JSON.stringify(api.exportRig());
      api.importRig(saved);api.setFrame('full');api.setMode('overlay');await frames();
      const restored=JSON.stringify(saved)===JSON.stringify(api.exportRig());
      const migration=api.importRig(legacy),migrated=api.exportRig();
      const preserved=migrated.parts.filter(p=>!migration.replaced.includes(p.id)).every(p=>JSON.stringify(p.adjustment)===JSON.stringify(legacy.parts.find(q=>q.id===p.id).adjustment));
      const currentArt=JSON.stringify(migrated.textures)===JSON.stringify(original.textures)&&migration.replaced.every(id=>JSON.stringify(migrated.parts.find(p=>p.id===id))===JSON.stringify(original.parts.find(p=>p.id===id)));
      return{before,moved,redone,reset,edited,restored,migration,preserved,currentArt,referenceFixed:JSON.stringify(reference)===JSON.stringify(api.getInfo().reference),info:api.getInfo()};
    },legacy);
    assert.equal(result.info.renderer,mode==='webgl'?'WebGL':'Canvas 2D');assert.equal(result.info.graphicsError,0);assert.equal(result.info.parts,21);
    assert(Math.abs(result.moved[0]-result.before[0]-25)<1e-7);assert(Math.abs(result.moved[1]-result.before[1]+10)<1e-7);
    assert(result.redone&&result.reset&&result.restored&&result.referenceFixed);assert(result.edited.hidden.includes('arm-right'));assert(result.edited.bones);assert.equal(result.edited.zoom,180);
    assert.deepEqual(result.migration.replaced,['arm-left','arm-right','skirt','leg-left','leg-right']);assert.deepEqual(result.migration.recalibrated,['torso']);assert(result.preserved&&result.currentArt);
    assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);console.log(JSON.stringify({mode,...result,errors,failed},null,2));await page.close();
  }
}finally{await browser.close();server.close();}
