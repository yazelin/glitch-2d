/* Cubism owns deformation. The page only drives exported model parameters. */
'use strict';
window.__demo={status:'loading',errors:[]};
const specs=[['ParamAngleZ','頭部傾斜',-30,30,0],['ParamBodyAngleZ','身體擺動',-10,10,0],['ParamBreath','呼吸',0,1,0],['ParamWave','揮手',-30,30,0],['ParamEyeLOpen','左眼開合',0,1,1],['ParamEyeROpen','右眼開合',0,1,1],['ParamMouthOpenY','嘴巴開合',0,1,0]];
(async()=>{
 if(!window.Live2DCubismCore||!window.PIXI?.live2d)throw Error('無法載入 Live2D，請確認網路後重新整理。');
 const stage=document.querySelector('#stage'),app=new PIXI.Application({resizeTo:stage,backgroundAlpha:0,antialias:true,resolution:Math.min(devicePixelRatio,2),autoDensity:true});stage.append(app.view);
 const model=await PIXI.live2d.Live2DModel.from('./model/glitch.model3.json',{autoInteract:false,autoUpdate:false});
 app.stage.addChild(model);model.anchor.set(.5);const core=model.internalModel.coreModel;
 const natural={w:model.width,h:model.height};
 function fit(){const s=Math.min(stage.clientWidth/natural.w,stage.clientHeight/natural.h)*.96;model.scale.set(s);model.position.set(stage.clientWidth/2,stage.clientHeight/2)}
 new ResizeObserver(fit).observe(stage);fit();
 const overlay=new PIXI.Graphics();app.stage.addChild(overlay);
 const values=Object.fromEntries(specs.map(([id,,, ,v])=>[id,v]));let automatic=true,waveStart=-100,elapsed=0,pointer=0;
 const controls={};
 function auto(v){automatic=v;document.querySelector('#auto').textContent=v?'Ⅱ 暫停待機':'▷ 開始待機';document.querySelector('#auto').setAttribute('aria-pressed',String(v))}
 specs.forEach(([id,label,min,max,value])=>{const l=document.createElement('label');l.className='control';const span=document.createElement('span');span.append(label);const out=document.createElement('output');span.append(out);const input=document.createElement('input');Object.assign(input,{type:'range',min,max,step:(max-min)/200,value});input.setAttribute('aria-label',label);input.oninput=()=>{auto(false);values[id]=+input.value;out.value=(+input.value).toFixed(2)};out.value=value.toFixed(2);l.append(span,input);document.querySelector('#controls').append(l);controls[id]={input,out}});
 document.querySelector('#auto').onclick=()=>auto(!automatic);
 const wave=()=>{waveStart=elapsed};document.querySelector('#wave').onclick=wave;stage.addEventListener('click',wave);
 stage.addEventListener('pointermove',e=>{const r=stage.getBoundingClientRect();pointer=Math.max(-1,Math.min(1,((e.clientX-r.left)/r.width-.5)*2))});stage.addEventListener('pointerleave',()=>pointer=0);
 document.querySelector('#reset').onclick=()=>{specs.forEach(([id,,,,v])=>values[id]=v);pointer=0;waveStart=-100;document.querySelector('#talk').checked=false;auto(false)};
 function apply(v){for(let i=0;i<core._parameterIds.length;i++)core.setParameterValueByIndex(i,core._model.parameters.defaultValues[i]);for(const[id,value]of Object.entries(v))core.setParameterValueById(id,value);core.update()}
 function snapshot(){return {vertices:core._model.drawables.vertexPositions.map(a=>Array.from(a)),opacity:Array.from(core._model.drawables.opacities)}}
 window.__rig={core,model,app,overlay,specs,apply,snapshot,pause:()=>{auto(false);app.ticker.stop()},resume:()=>app.ticker.start()};
 app.ticker.add(()=>{elapsed+=app.ticker.deltaMS/1000;const v={...values};if(automatic){v.ParamAngleZ=Math.sin(elapsed*.65)*8+(document.querySelector('#follow').checked?pointer*12:0);v.ParamBodyAngleZ=Math.sin(elapsed*.55)*4;v.ParamBreath=(Math.sin(elapsed*1.6)+1)/2;v.ParamWave=Math.sin(elapsed*.9)*2;const phase=elapsed%4.2;const blink=phase<.16?1-phase/.16:phase<.32?(phase-.16)/.16:1;v.ParamEyeLOpen=v.ParamEyeROpen=blink}if(elapsed-waveStart<2.4)v.ParamWave=Math.sin((elapsed-waveStart)*11)*27*Math.sin(Math.PI*(elapsed-waveStart)/2.4);if(document.querySelector('#talk').checked)v.ParamMouthOpenY=Math.max(0,Math.sin(elapsed*10))*.8;apply(v);for(const[id,c]of Object.entries(controls)){c.input.value=v[id];c.out.value=v[id].toFixed(2)}overlay.clear();if(document.querySelector('#mesh').checked){overlay.lineStyle(.7,0xa6f5e0,.5);const d=core._model.drawables;d.vertexPositions.forEach((positions,i)=>{if(d.opacities[i]<.01)return;positions=model.internalModel.getDrawableVertices(i);const pts=model.internalModel.localTransform;const idx=d.indices[i];for(let j=0;j<idx.length;j+=3){for(let k=0;k<4;k++){const n=idx[j+k%3]*2;const p=pts.apply(new PIXI.Point(positions[n],positions[n+1]));const q=model.toGlobal(p);k?overlay.lineTo(q.x,q.y):overlay.moveTo(q.x,q.y)}}})}});
 document.querySelector('#status').textContent='模型已載入';window.__demo={status:'ok',errors:[],params:core._parameterIds.length,drawables:core._model.drawables.count};
})().catch(e=>{window.__demo.status='error';window.__demo.errors.push(String(e));document.querySelector('#status').textContent=e.message;console.error(e)});
