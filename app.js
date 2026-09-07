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

 /* ---- 待機曲線（與 tools/build-motions.py 同一套設計；那份是給別的播放器的 motion3）---- */
 const TAU=Math.PI*2;
 // 呼吸：4.5 秒一循環，吸氣 40%、吐氣 60%，兩端各停一拍
 function breath(t){const p=(t%4.5)/4.5;const e=x=>.5-.5*Math.cos(Math.PI*x);return p<.4?e(p/.4):1-e((p-.4)/.6)}
 // 眨眼排程：閉 80ms 開 140ms，間隔 2.5–6 秒隨機，18% 機率連眨兩下，右眼慢左眼 25ms
 const blink={next:2.2,start:-9,double:false};
 function blinkAt(t,lag){const u=t-blink.start-lag;const one=x=>x<0?1:x<.08?1-x/.08:x<.22?(x-.08)/.14:1;
  return blink.double?Math.min(one(u),one(u-.26)):one(u)}
 function idle(t,v,pointer){
  if(t>=blink.next){blink.start=t;blink.double=Math.random()<.18;blink.next=t+(blink.double?.5:0)+2.5+Math.random()*3.5}
  const b=breath(t);
  v.ParamBreath=b;
  v.ParamAngleZ=Math.sin(t*.65)*5+Math.sin(t*.17+1.3)*3+(b-.5)*1.2+pointer*12;
  v.ParamBodyAngleZ=Math.sin(t*.55)*2.6+Math.sin(t*.13+.7)*1.4+(b-.5)*1.6;
  v.ParamWave=Math.sin(t*.9)*1.4+Math.sin(t*.21)*.8;
  v.ParamEyeLOpen=blinkAt(t,0);v.ParamEyeROpen=blinkAt(t,.025);
 }
 // 揮手：0–0.25s 反向蓄力，之後主振（頻率 11），尾端 40% 用衰減包絡收
 const WAVE_T=2.4;
 function waveCurve(u){if(u<.25)return -3*Math.sin(Math.PI*u/.25)*.5;const w=u-.25,L=WAVE_T-.25;
  const env=(w<L*.6?Math.sin(Math.PI*Math.min(w/(L*.35),1)/2):Math.exp(-(w-L*.6)*3.2))*Math.min(1,(WAVE_T-u)/.3);return Math.sin(w*11)*14*env}
 app.ticker.add(()=>{elapsed+=app.ticker.deltaMS/1000;const v={...values};if(automatic){idle(elapsed,v,document.querySelector('#follow').checked?pointer:0)}if(elapsed-waveStart<WAVE_T)v.ParamWave=waveCurve(elapsed-waveStart);if(document.querySelector('#talk').checked)v.ParamMouthOpenY=Math.max(0,Math.sin(elapsed*10))*.8;apply(v);for(const[id,c]of Object.entries(controls)){c.input.value=v[id];c.out.value=v[id].toFixed(2)}overlay.clear();if(document.querySelector('#mesh').checked){overlay.lineStyle(.7,0xa6f5e0,.5);const d=core._model.drawables;d.vertexPositions.forEach((positions,i)=>{if(d.opacities[i]<.01)return;positions=model.internalModel.getDrawableVertices(i);const pts=model.internalModel.localTransform;const idx=d.indices[i];for(let j=0;j<idx.length;j+=3){for(let k=0;k<4;k++){const n=idx[j+k%3]*2;const p=pts.apply(new PIXI.Point(positions[n],positions[n+1]));const q=model.toGlobal(p);k?overlay.lineTo(q.x,q.y):overlay.moveTo(q.x,q.y)}}})}});
 document.querySelector('#status').textContent='模型已載入';window.__demo={status:'ok',errors:[],params:core._parameterIds.length,drawables:core._model.drawables.count};
})().catch(e=>{window.__demo.status='error';window.__demo.errors.push(String(e));document.querySelector('#status').textContent=e.message;console.error(e)});
