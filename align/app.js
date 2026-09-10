import { Alignment, hitTest, skeleton } from '../engine/alignment.js?v=0.4.3';
import { fitView } from '../engine/geometry.js?v=0.4.3';
import { CanvasRenderer, WebGLRenderer, loadTextures } from '../engine/renderer.js?v=0.4.3';

const $ = id => document.getElementById(id);
const feedback = (message, error = false) => { $('feedback').textContent = message; $('feedback').classList.toggle('error', error); };
const download = (blob, name) => {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

async function start() {
  const rigURL = new URL('../character/glitch/rig.json?v=0.4.3', location.href);
  const response = await fetch(rigURL, { signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error('角色設定載入失敗，請重新整理。');
  const editor = new Alignment(await response.json());
  const [textures, reference] = await Promise.all([
    loadTextures(editor.rig, rigURL),
    (async () => { const image = new Image(); image.src = new URL(editor.rig.reference.src, rigURL).href; await image.decode(); return image; })(),
  ]);
  const hidden = new Set(editor.scene().filter(item => item.opacity < .05).map(item => item.part.id));
  // Keep dormant expression art at its full size, available through each visibility switch.
  editor.pose.mouthOpen = 1;
  const alpha = Object.fromEntries(Object.entries(textures).map(([id, img]) => {
    const c = makeCanvas(img.width, img.height), ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0); return [id, { width: img.width, height: img.height, data: ctx.getImageData(0, 0, img.width, img.height).data }];
  }));
  const alphaAt = (id, x, y) => {
    const a = alpha[id]; x = Math.floor(x); y = Math.floor(y);
    return x >= 0 && y >= 0 && x < a.width && y < a.height ? a.data[(y * a.width + x) * 4 + 3] : 0;
  };
  const board = $('artboard'), viewport = $('viewport');
  let modelCanvas = $('model'), renderer;
  const createRenderer = () => {
    try {
      if (new URLSearchParams(location.search).get('renderer') === 'canvas') throw new Error('Canvas requested');
      renderer = new WebGLRenderer(modelCanvas, textures);
    } catch {
      const replacement = modelCanvas.cloneNode(); modelCanvas.replaceWith(replacement); modelCanvas = replacement;
      renderer = new CanvasRenderer(modelCanvas, textures);
    }
  };
  createRenderer();
  const frames = { full: [...editor.rig.views.full], head: [165, 0, 670, 730], lower: [170, 1040, 660, 1410] };
  const state = { mode: 'overlay', opacity: .5, zoom: 100, frame: 'full', guides: true, bones: false };
  let scene = [], drag = null, raf = null;
  const viewRig = () => ({ ...editor.rig, views: { ...editor.rig.views, alignment: frames[state.frame] } });
  const visibleScene = () => editor.scene().filter(item => !hidden.has(item.part.id)).map(item => ({ ...item, opacity: 1 }));
  const view = () => fitView(modelCanvas.width, modelCanvas.height, viewRig(), 0, 'alignment');
  const pixelView = () => fitView(board.getBoundingClientRect().width, board.getBoundingClientRect().height, viewRig(), 0, 'alignment');
  const worldAt = event => {
    const rect = board.getBoundingClientRect(), v = pixelView();
    return [(event.clientX - rect.left - v.x) / v.scale, (event.clientY - rect.top - v.y) / v.scale];
  };
  const drawReference = (ctx, width, height) => {
    const v = fitView(width, height, viewRig(), 0, 'alignment');
    const [x, y, w, h] = editor.rig.reference.rect;
    // Close-up reference paint must stay in its own export column.
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.clip();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
    ctx.drawImage(reference, ...editor.rig.reference.crop, x * v.scale + v.x, y * v.scale + v.y, w * v.scale, h * v.scale);
    ctx.restore();
  };
  const handles = () => {
    const b = editor.bounds(); if (!b) return null;
    const [x, y, w, h] = b, s = pixelView().scale;
    return { bounds: b, center: [x + w / 2, y + h / 2], corners: [[x,y],[x+w,y],[x+w,y+h],[x,y+h]], rotation: [x + w / 2, y - 30 / s] };
  };
  function drawOverlay() {
    const canvas = $('selection'), ctx = canvas.getContext('2d'), v = view();
    ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.save(); ctx.translate(v.x, v.y); ctx.scale(v.scale, v.scale);
    const line = (a, b) => { ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); };
    if (state.guides) {
      const frame = frames[state.frame];
      ctx.strokeStyle = '#157d9c70'; ctx.lineWidth = 1 / v.scale; ctx.setLineDash([5 / v.scale, 5 / v.scale]);
      line([500,frame[1]], [500,frame[1]+frame[3]]);
      for (const y of [140, 577.5, 1195, 1330, 2400]) line([frame[0],y],[frame[0]+frame[2],y]);
      ctx.setLineDash([]);
    }
    if (state.bones && state.mode !== 'reference') {
      const { joints, chains } = skeleton(editor.rig, editor.pose);
      for (const [color, width] of [['#ffffffdd', 5], ['#147991', 2]]) {
        ctx.strokeStyle = color; ctx.lineWidth = width / v.scale;
        for (const chain of chains) for (let i = 1; i < chain.length; i++) if (joints[chain[i-1]] && joints[chain[i]]) line(joints[chain[i-1]], joints[chain[i]]);
      }
      for (const joint of Object.values(joints)) { ctx.beginPath(); ctx.arc(...joint, 4 / v.scale, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke(); }
    }
    const h = handles();
    if (h && state.mode !== 'reference') {
      const uiScale = v.scale / pixelView().scale;
      ctx.strokeStyle = '#b86030'; ctx.fillStyle = '#fff8e9'; ctx.lineWidth = 1.4 * uiScale / v.scale;
      ctx.setLineDash([5 * uiScale / v.scale, 4 * uiScale / v.scale]); ctx.strokeRect(...h.bounds); ctx.setLineDash([]);
      line([h.rotation[0], h.bounds[1]], h.rotation);
      for (const [x,y] of h.corners) { const r = 4.5 * uiScale / v.scale; ctx.fillRect(x-r,y-r,r*2,r*2); ctx.strokeRect(x-r,y-r,r*2,r*2); }
      ctx.beginPath(); ctx.arc(...h.rotation, 5.5 * uiScale / v.scale, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      line([h.center[0]-4*uiScale/v.scale,h.center[1]],[h.center[0]+4*uiScale/v.scale,h.center[1]]);
      line([h.center[0],h.center[1]-4*uiScale/v.scale],[h.center[0],h.center[1]+4*uiScale/v.scale]);
    }
    ctx.restore();
  }
  function render() {
    raf = null; scene = visibleScene();
    renderer.render(scene, viewRig(), { framing: 'alignment' });
    const ref = $('reference'), ctx = ref.getContext('2d');
    ctx.clearRect(0,0,ref.width,ref.height); drawReference(ctx, ref.width, ref.height);
    ref.style.visibility = state.mode === 'model' ? 'hidden' : 'visible';
    board.style.background = state.mode === 'model' ? '#edf0f3' : '#ffffff';
    modelCanvas.style.opacity = state.mode === 'reference' ? '0' : state.mode === 'model' ? '1' : String(state.opacity);
    drawOverlay();
  }
  const schedule = () => { if (raf === null) raf = requestAnimationFrame(render); };
  function resize() {
    const [, , w, h] = frames[state.frame];
    const scale = Math.max(.04, Math.min((viewport.clientWidth - 32) / w, (viewport.clientHeight - 32) / h)) * state.zoom / 100;
    board.style.width = `${Math.round(w * scale)}px`; board.style.height = `${Math.round(h * scale)}px`; board.style.marginTop = board.style.marginBottom = '16px';
    const dpr = Math.min(devicePixelRatio || 1, 2);
    for (const c of [modelCanvas, $('reference'), $('selection')]) { c.width = Math.max(1, Math.round(w * scale * dpr)); c.height = Math.max(1, Math.round(h * scale * dpr)); }
    schedule();
  }
  function refresh() {
    $('part').value = editor.selection; $('selection-controls').hidden = !editor.ids.length;
    $('solo').disabled = !editor.ids.length;
    const b = editor.bounds();
    if (b) {
      const values = { 'center-x': (b[0] + b[2]/2 + 300)/2.5, 'center-y': (b[1] + b[3]/2 - 15)/2.5, width: b[2]/2.5, height: b[3]/2.5 };
      for (const [id, value] of Object.entries(values)) $(id).value = value.toFixed(1);
    }
    $('undo').disabled = !editor.past.length; $('redo').disabled = !editor.future.length;
    $('status').textContent = editor.changed ? `已調整 ${editor.changed} 片 · 請下載保存` : '點選部件開始對齊';
    for (const row of $('parts-list').children) {
      row.querySelector('input').checked = !hidden.has(row.dataset.part);
      row.querySelector('button').setAttribute('aria-pressed', String(editor.ids.includes(row.dataset.part)));
    }
    schedule();
  }
  const select = id => { editor.select(id); refresh(); };
  const change = action => {
    editor.begin();
    try { action(); editor.commit(); feedback(''); } catch (error) { editor.cancel(); feedback(error.message, true); }
    refresh();
  };
  const selectHit = id => {
    const match = /^(eye|iris|lid|brow)-(left|right)$/.exec(id);
    select(match ? `@eye-${match[2]}` : id);
  };
  const groupOptions = document.createElement('optgroup'); groupOptions.label = '整組調整';
  const partOptions = document.createElement('optgroup'); partOptions.label = '獨立部件';
  for (const g of editor.groups) { const option = new Option(g.label,g.id); groupOptions.append(option); }
  for (const p of editor.rig.parts) {
    partOptions.append(new Option(p.label,p.id));
    const row = document.createElement('div'); row.className = 'part-row'; row.dataset.part = p.id;
    const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.setAttribute('aria-label', `顯示${p.label}`);
    toggle.addEventListener('change', () => { if (toggle.checked) hidden.delete(p.id); else hidden.add(p.id); refresh(); });
    const button = document.createElement('button'); button.textContent = p.label; button.addEventListener('click', () => select(p.id));
    row.append(toggle,button); $('parts-list').append(row);
  }
  $('part').append(groupOptions, partOptions); $('part').addEventListener('change', () => select($('part').value));
  $('show-all').addEventListener('click', () => { hidden.clear(); refresh(); });
  $('hide-all').addEventListener('click', () => { editor.rig.parts.forEach(p => hidden.add(p.id)); refresh(); });
  $('solo').addEventListener('click', () => { hidden.clear(); editor.rig.parts.filter(p => !editor.ids.includes(p.id)).forEach(p => hidden.add(p.id)); refresh(); });
  $('opacity').addEventListener('input', () => { state.opacity = Number($('opacity').value)/100; $('opacity-value').value = `${$('opacity').value}%`; setMode('overlay'); });
  function setMode(mode) {
    if (!['reference','overlay','model'].includes(mode)) throw new RangeError('Unknown mode');
    state.mode = mode;
    document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode))); schedule();
  }
  function setFrame(frame) {
    if (!Object.hasOwn(frames,frame)) throw new RangeError('Unknown frame');
    state.frame = frame; state.zoom = 100; $('zoom').value = 100; $('zoom-value').value = '100%';
    document.querySelectorAll('[data-frame]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.frame === frame)));
    viewport.scrollTo(0,0); resize();
  }
  function setZoom(zoom) {
    if (!Number.isFinite(zoom) || zoom < 100 || zoom > 300) throw new RangeError('Invalid zoom');
    const center = [(viewport.scrollLeft+viewport.clientWidth/2-board.offsetLeft)/Math.max(1,board.offsetWidth), (viewport.scrollTop+viewport.clientHeight/2-board.offsetTop)/Math.max(1,board.offsetHeight)];
    state.zoom = zoom; $('zoom').value = zoom; $('zoom-value').value = `${zoom}%`; resize();
    viewport.scrollLeft = board.offsetLeft+center[0]*board.offsetWidth-viewport.clientWidth/2; viewport.scrollTop = board.offsetTop+center[1]*board.offsetHeight-viewport.clientHeight/2;
  }
  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  document.querySelectorAll('[data-frame]').forEach(b => b.addEventListener('click', () => setFrame(b.dataset.frame)));
  $('zoom').addEventListener('input', () => setZoom(Number($('zoom').value)));
  for (const id of ['guides','bones']) $(id).addEventListener('change', () => { state[id] = $(id).checked; schedule(); });
  for (const [id,fn] of [['smaller',()=>editor.scale(.98)],['larger',()=>editor.scale(1.02)],['rotate-left',()=>editor.rotate(-1)],['rotate-right',()=>editor.rotate(1)],['reset-part',()=>editor.reset()],['reset-all',()=>editor.reset(true)]]) $(id).addEventListener('click', () => change(fn));
  for (const b of document.querySelectorAll('[data-nudge]')) b.addEventListener('click', () => change(() => editor.move(...b.dataset.nudge.split(',').map(n => Number(n)*2.5))));
  for (const id of ['center-x','center-y','width','height']) $(id).addEventListener('change', () => change(() => {
    const value = Number($(id).value); if (!Number.isFinite(value) || $(id).value === '') throw new Error('請輸入有效數字。');
    const b = editor.bounds(); if (!b) return;
    if (id === 'center-x') editor.move(value*2.5-300-b[0]-b[2]/2,0);
    else if (id === 'center-y') editor.move(0,value*2.5+15-b[1]-b[3]/2);
    else editor.scale(value*2.5/b[id === 'width' ? 2 : 3]);
  }));
  $('undo').addEventListener('click', () => { editor.undo(); refresh(); });
  $('redo').addEventListener('click', () => { editor.redo(); refresh(); });
  board.addEventListener('pointerdown', event => {
    if (drag || event.button !== 0 || state.mode === 'reference') return;
    const p = worldAt(event), h = handles(), threshold = 12 / pixelView().scale;
    const near = q => Math.hypot(p[0]-q[0],p[1]-q[1]) < threshold;
    const corner = h?.corners.findIndex(near) ?? -1;
    let kind = corner >= 0 ? 'scale' : h && near(h.rotation) ? 'rotate' : 'move';
    if (kind === 'move') {
      const hit = hitTest(scene,...p,alphaAt);
      if (!hit) { select(''); return; }
      if (!editor.ids.includes(hit)) selectHit(hit);
    }
    const bounds = editor.bounds(); if (!bounds) return;
    editor.begin(); const center = [bounds[0]+bounds[2]/2,bounds[1]+bounds[3]/2];
    drag = { kind, pointerId: event.pointerId, start:p, center, anchor:corner >= 0 ? h.corners[(corner+2)%4] : null };
    board.setPointerCapture(event.pointerId); board.classList.add('dragging'); board.focus({preventScroll:true}); event.preventDefault();
  });
  board.addEventListener('pointermove', event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const p = worldAt(event); editor.restore(editor.transaction);
    try {
      if (drag.kind === 'move') editor.move(p[0]-drag.start[0],p[1]-drag.start[1]);
      if (drag.kind === 'rotate') editor.rotate((Math.atan2(p[1]-drag.center[1],p[0]-drag.center[0])-Math.atan2(drag.start[1]-drag.center[1],drag.start[0]-drag.center[0]))*180/Math.PI);
      if (drag.kind === 'scale') {
        const distance = q => Math.hypot(q[0]-drag.anchor[0],q[1]-drag.anchor[1]);
        editor.scale(Math.max(.1,Math.min(10,distance(p)/distance(drag.start))),drag.anchor);
      }
      refresh();
    } catch { editor.restore(editor.transaction); schedule(); }
  });
  function finishDrag(cancel = false) {
    if (!drag) return; const id = drag.pointerId; drag = null;
    if (cancel) editor.cancel(); else editor.commit();
    if (board.hasPointerCapture(id)) board.releasePointerCapture(id); board.classList.remove('dragging'); refresh();
  }
  board.addEventListener('pointerup', event => { if (event.pointerId === drag?.pointerId) finishDrag(); });
  board.addEventListener('pointercancel', event => { if (event.pointerId === drag?.pointerId) finishDrag(true); });
  board.addEventListener('lostpointercapture', () => finishDrag(true));
  document.addEventListener('keydown', event => {
    if (['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName)) return;
    if (event.key === 'Escape') { finishDrag(true); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); finishDrag(true); if (event.shiftKey) editor.redo(); else editor.undo(); refresh(); return; }
    const directions = { ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1] };
    if (Object.hasOwn(directions,event.key) && editor.ids.length) { event.preventDefault(); change(() => editor.move(...directions[event.key].map(n=>n*2.5*(event.shiftKey?10:1)))); }
  });
  $('export').addEventListener('click', () => {
    download(new Blob([JSON.stringify(editor.exportRig(),null,2)+'\n'],{type:'application/json'}),'glitch-aligned.rig.json');
    feedback('已下載角色設定，內含各部件的位置、角度與大小。');
  });
  $('import').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 1000000) throw new Error('請選擇本工具匯出的角色設定。');
      const result = editor.importRig(JSON.parse(await file.text())); refresh();
      feedback(result.replaced.length || result.recalibrated.length ? '已載入設定，修正部件使用新版比例，其餘保留你的調整。' : '已載入調整，可以接著微調。');
    } catch(error) { feedback(error.message, true); }
    event.target.value = '';
  });
  $('save-image').addEventListener('click', async () => {
    $('save-image').disabled = true;
    try {
      const width=600,height=Math.round(width*frames[state.frame][3]/frames[state.frame][2]);
      const out=makeCanvas(width*3,height+42),ctx=out.getContext('2d'),art=makeCanvas(width,height);
      new CanvasRenderer(art,textures).render(visibleScene(),viewRig(),{framing:'alignment'});
      ctx.fillStyle='#edf1f5';ctx.fillRect(0,0,out.width,out.height);ctx.font='14px sans-serif';
      ['REFERENCE','YOUR ALIGNMENT',`OVERLAY / ${Math.round(state.opacity*100)}%`].forEach((label,i)=>{
        ctx.save();ctx.translate(i*width,42);
        if(i!==1)drawReference(ctx,width,height);
        if(i>0){ctx.globalAlpha=i===2?state.opacity:1;ctx.drawImage(art,0,0);}ctx.restore();
        ctx.fillStyle='#24344a';ctx.fillText(label,i*width+14,27);
      });
      const blob=await new Promise(resolve=>out.toBlob(resolve,'image/png'));if(!blob)throw new Error('對照圖下載失敗。');
      download(blob,'glitch-alignment.png');feedback('已下載目前取景與開啟部件的對照圖。');
    }catch(error){feedback(error.message,true);}finally{$('save-image').disabled=false;}
  });
  modelCanvas.addEventListener('webglcontextlost', event => { event.preventDefault(); feedback('角色畫面暫停，正在恢復。',true); });
  modelCanvas.addEventListener('webglcontextrestored', () => { renderer=new WebGLRenderer(modelCanvas,textures); resize();feedback('角色畫面已恢復。'); });
  const observer=new ResizeObserver(resize);observer.observe(viewport);
  $('loading').hidden=true;$('tools').disabled=false;resize();refresh();
  window.addEventListener('pagehide',()=>{observer.disconnect();if(raf!==null)cancelAnimationFrame(raf);renderer.dispose();},{once:true});
  return {
    select, exportRig:()=>editor.exportRig(), importRig:rig=>{const result=editor.importRig(rig);refresh();return result;},
    move:(x,y)=>change(()=>editor.move(x,y)), scale:factor=>change(()=>editor.scale(factor)), rotate:angle=>change(()=>editor.rotate(angle)),
    undo:()=>{editor.undo();refresh();},redo:()=>{editor.redo();refresh();},reset:()=>change(()=>editor.reset(true)),
    setMode,setFrame,setZoom,
    setVisible:(id,value)=>{if(!editor.rig.parts.some(p=>p.id===id))throw new RangeError('Unknown part');if(value)hidden.delete(id);else hidden.add(id);refresh();},
    setBones:value=>{state.bones=Boolean(value);$('bones').checked=state.bones;schedule();},
    getInfo:()=>({renderer:renderer.kind,graphicsError:renderer.gl?.getError()||0,parts:editor.rig.parts.length,selection:editor.selection,changed:editor.changed,hidden:[...hidden],...state,reference:structuredClone(editor.rig.reference),bounds:editor.bounds(),canUndo:Boolean(editor.past.length),canRedo:Boolean(editor.future.length)}),
  };
}
window.GlitchAlign={version:'0.4.1'};
window.GlitchAlign.ready=start().then(api=>Object.assign(window.GlitchAlign,api));
window.GlitchAlign.ready.catch(error=>{ $('loading').textContent=`載入失敗：${error.message}`;feedback(error.message,true);console.error(error); });
