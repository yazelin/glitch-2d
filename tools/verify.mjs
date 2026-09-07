import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const reportDir=resolve(root,'test-results');await mkdir(reportDir,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'};
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!path.startsWith(root))throw Error('path');const p=path===root.slice(0,-1)?resolve(root,'index.html'):path;const content=await readFile(p);res.setHeader('Content-Type',types[extname(p)]||'application/octet-stream');res.end(content)}catch{res.writeHead(404);res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=process.env.TEST_URL||`http://127.0.0.1:${server.address().port}/index.html`;
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.waitForFunction(()=>window.__demo.status!=='loading',null,{timeout:60000});assert.equal(await page.evaluate(()=>window.__demo.status),'ok');
 const results=await page.evaluate(()=>{const r=window.__rig;r.pause();const defaults=Object.fromEntries(r.specs.map(([id,,,,v])=>[id,v]));const result=r.specs.map(([id,,min,max])=>{r.apply({...defaults,[id]:min});const a=r.snapshot();r.apply({...defaults,[id]:max});const b=r.snapshot();let vertexDelta=0,opacityDelta=0,changedMeshes=0;for(let i=0;i<a.vertices.length;i++){let changed=false;for(let j=0;j<a.vertices[i].length;j++){const d=Math.abs(a.vertices[i][j]-b.vertices[i][j]);vertexDelta=Math.max(vertexDelta,d);changed||=d>1e-6}opacityDelta=Math.max(opacityDelta,Math.abs(a.opacity[i]-b.opacity[i]));if(changed)changedMeshes++}return{id,vertexDelta,opacityDelta,changedMeshes}});r.apply(defaults);r.resume();return result});
 for(const r of results)assert(r.vertexDelta>1e-6||r.opacityDelta>.5,`${r.id} has no effect`);
 const rigInfo=await page.evaluate(async()=>{const a=new Uint8Array(await(await fetch('./model/glitch.moc3')).arrayBuffer());return {mocVersion:a[4],parameters:window.__demo.params,drawables:window.__demo.drawables}});assert.equal(rigInfo.mocVersion,5);
 await page.getByRole('button',{name:'重設',exact:true}).click();await page.waitForTimeout(150);assert.equal(await page.locator('#auto').getAttribute('aria-pressed'),'false');
 const headMax=await page.getByRole('slider',{name:'頭部傾斜',exact:true}).getAttribute('max');await page.getByRole('slider',{name:'頭部傾斜',exact:true}).fill(headMax);await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.__rig.core.getParameterValueById('ParamAngleZ')),+headMax);
 await page.locator('#mesh').check();await page.waitForTimeout(200);assert(await page.evaluate(()=>window.__rig.overlay.getBounds().height>300));await page.screenshot({path:resolve(reportDir,'desktop-mesh.png'),fullPage:true});
 await page.locator('#mesh').uncheck();await page.getByRole('button',{name:'重設',exact:true}).click();await page.locator('#wave').click();await page.waitForTimeout(350);assert(Math.abs(await page.evaluate(()=>window.__rig.core.getParameterValueById('ParamWave')))>1);
 await page.locator('#talk').check();await page.waitForTimeout(100);await page.locator('#talk').uncheck();await page.getByRole('button',{name:'重設',exact:true}).click();await page.waitForTimeout(200);await page.screenshot({path:resolve(reportDir,'desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:resolve(reportDir,'mobile.png'),fullPage:true});
 await page.locator('#auto').click();await page.waitForTimeout(250);assert.equal(await page.locator('#auto').getAttribute('aria-pressed'),'true');assert.deepEqual(errors,[]);
 await writeFile(resolve(reportDir,'rig-verification.json'),JSON.stringify({url,rigInfo,results,errors},null,2)+'\n');console.log(JSON.stringify({rigInfo,results,errors},null,2));
}finally{await browser.close();server.close()}
