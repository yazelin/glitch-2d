import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { CanvasRenderer, prepareTexture } from '../engine/renderer.js';
import { buildScene } from '../engine/geometry.js';
import { restPose } from '../engine/alignment.js';

const base = new URL('../character/glitch/', import.meta.url);
const current = JSON.parse(await readFile(new URL('rig.json', base)));
const previousPath = process.argv[2];
if (!previousPath) throw new Error('Usage: node tools/compare-sleeves.mjs path/to/previous-rig.json');
const previous = JSON.parse(await readFile(previousPath));
const reference = await loadImage(await readFile(new URL('turnaround-reference.png', base)));
const specs = [
  { id:'arm-left', crop:[55,225,220,330], shoulder:[251,246], wrist:[124,482], referenceWidths:[78,84.25,80.25,65.75] },
  { id:'arm-right', crop:[355,225,210,315], shoulder:[388,246], wrist:[500,489], referenceWidths:[78.5,84.5,79.25,63.75] },
];
async function prepare(rig) {
  const textures={};
  for(const [id,spec] of Object.entries(rig.textures)) textures[id]=prepareTexture(await loadImage(await readFile(new URL(spec.src,base))),spec,createCanvas);
  return {rig,textures,scene:buildScene(rig,restPose())};
}
const old=await prepare(previous),next=await prepare(current);
function render(prepared,rect,width,height,only=null) {
  const canvas=createCanvas(width,height);
  const rig={...prepared.rig,views:{comparison:rect}};
  new CanvasRenderer(canvas,prepared.textures).render(only?prepared.scene.filter(p=>p.part.id===only):prepared.scene,rig,{framing:'comparison'});
  return canvas;
}
function widths(prepared,spec) {
  const canvas=render(prepared,[-300,15,3840,2560],1536,1024,spec.id);
  const pixels=canvas.getContext('2d').getImageData(0,0,1536,1024).data;
  const [s,w]=[spec.shoulder,spec.wrist],length=Math.hypot(w[0]-s[0],w[1]-s[1]);
  const normal=[(w[1]-s[1])/length,-(w[0]-s[0])/length];
  return [.7,.75,.8,.85].map(t=>{
    const c=[s[0]+(w[0]-s[0])*t,s[1]+(w[1]-s[1])*t],distances=[];
    for(const sign of [-1,1]) {
      let edge=0,gap=0;
      for(let d=0;d<120;d+=.25){
        const x=Math.round(c[0]+normal[0]*d*sign),y=Math.round(c[1]+normal[1]*d*sign);
        const alpha=pixels[(y*1536+x)*4+3];
        if(alpha<100)gap+=.25;else gap=0;
        if(gap>=1.5){edge=d-gap;break;}
      }
      distances.push(edge);
    }
    return Number((distances[0]+distances[1]).toFixed(2));
  });
}
const width=432,height=648,label=42,out=createCanvas(width*4,(height+label)*2),ctx=out.getContext('2d'),report=[];
ctx.fillStyle='#f0f3f7';ctx.fillRect(0,0,out.width,out.height);
for(const [row,spec] of specs.entries()) {
  const [x,y,w,h]=spec.crop,rect=[x*2.5-300,y*2.5+15,w*2.5,h*2.5];
  const ref=createCanvas(width,height);ref.getContext('2d').drawImage(reference,...spec.crop,0,0,width,height);
  const before=render(old,rect,width,height),after=render(next,rect,width,height);
  for(const [i,title] of ['REFERENCE','BEFORE','REGENERATED','OVERLAY / 50%'].entries()){
    ctx.save();ctx.translate(i*width,row*(height+label));ctx.fillStyle='#213449';ctx.font='14px "DejaVu Sans"';ctx.fillText(`${row===0?'LEFT':'RIGHT'} / ${title}`,14,27);ctx.translate(0,label);
    if(i===0||i===3)ctx.drawImage(ref,0,0);
    if(i>0){ctx.globalAlpha=i===3?.5:1;ctx.drawImage(i===1?before:after,0,0);}ctx.restore();
  }
  report.push({side:spec.id,units:'reference pixels',shoulderToWrist:Math.hypot(spec.wrist[0]-spec.shoulder[0],spec.wrist[1]-spec.shoulder[1]),sampleFractions:[.7,.75,.8,.85],reference:spec.referenceWidths,before:widths(old,spec),after:widths(next,spec)});
}
const destination=new URL('../test-results/',import.meta.url);await mkdir(destination,{recursive:true});
await writeFile(new URL('sleeve-width-comparison.png',destination),out.toBuffer('image/png'));
await writeFile(new URL('sleeve-width-measurements.json',destination),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
