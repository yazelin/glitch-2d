import { Motion, PARAMS, clamp } from './engine/motion.js';
import { buildScene } from './engine/geometry.js';
import { WebGLRenderer, CanvasRenderer, loadTextures, drawMesh } from './engine/renderer.js';
import { VoicePlayer } from './engine/audio.js';

const $ = selector => document.querySelector(selector);
const query = new URLSearchParams(location.search);
const overlay = query.get('overlay') === '1';
document.body.classList.toggle('overlay', overlay);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const expressionNames = { neutral: '平常', happy: '開心', curious: '好奇', sleepy: '想睡', shy: '害羞' };
const sliders = new Map();
let objectURL = null;

function slider(container, id, label, min, max, value, step, onInput) {
  const row = document.createElement('label'); row.className = 'slider-row';
  const title = document.createElement('span'); title.textContent = label;
  const input = document.createElement('input'); input.type = 'range'; input.id = id;
  input.min = min; input.max = max; input.step = step; input.value = value;
  const output = document.createElement('output'); output.htmlFor = id;
  const update = next => { input.value = next; output.value = Number(next).toFixed(step < 1 ? 2 : 0); };
  update(value);
  input.addEventListener('input', () => { update(input.value); onInput(Number(input.value)); });
  row.append(title, input, output); container.append(row);
  return { input, update };
}

function showError(error) {
  $('#loading').hidden = true; $('#error').hidden = false;
  $('#error-detail').textContent = error.message;
  $('#status').textContent = '載入遇到問題';
  console.error(error);
}
$('#retry').addEventListener('click', () => location.reload());

async function start() {
  const rigURL = new URL('character/glitch/rig.json?v=0.2.0', location.href);
  const response = await fetch(rigURL, { signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`角色設定讀取失敗（${response.status}）`);
  const rig = await response.json();
  const original = structuredClone(rig);
  const textures = await loadTextures(rig, rigURL);
  const motion = new Motion(); motion.idle = !reducedMotion; motion.follow = !reducedMotion;
  $('#idle').checked = motion.idle; $('#follow').checked = motion.follow;
  let canvas = $('#character');
  const meshCanvas = $('#mesh-canvas');
  let renderer;
  try {
    if (query.get('renderer') === 'canvas') throw new Error('Canvas renderer requested');
    renderer = new WebGLRenderer(canvas, textures);
  }
  catch {
    // A failed WebGL context may lock the canvas context type. Use a fresh node.
    const replacement = canvas.cloneNode(); canvas.replaceWith(replacement); canvas = replacement;
    renderer = new CanvasRenderer(canvas, textures);
  }
  let playingDemo = false, selected = '', explode = 0, expression = 'neutral', running = true;
  const voice = new VoicePlayer(motion, state => {
    const playing = state === 'playing';
    $('#voice-demo').textContent = playing ? '停止播放' : '▷ 聽她自我介紹';
    $('#voice-caption').hidden = !playing || !playingDemo;
    $('#audio-status').textContent = state === 'error' ? '無法播放這個音檔，請改用 MP3、WAV 或 OGG。' : playing ? '播放中，嘴型跟隨音量' : '尚未播放語音';
    if (!playing) { $('#audio-level').style.transform = 'scaleX(0)'; $('.audio-meter').setAttribute('aria-valuenow', '0'); }
  });
  const resize = () => {
    const stage = $('#stage');
    const dpr = Math.min(devicePixelRatio || 1, renderer.kind === 'WebGL' ? 2 : 1.5);
    canvas.width = meshCanvas.width = Math.max(1, Math.round(stage.clientWidth * dpr));
    canvas.height = meshCanvas.height = Math.max(1, Math.round(stage.clientHeight * dpr));
  };
  const observer = new ResizeObserver(resize); observer.observe($('#stage')); resize();
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); running = false; $('#status').textContent = '正在恢復角色畫面';
  });
  canvas.addEventListener('webglcontextrestored', () => {
    try { renderer = new WebGLRenderer(canvas, textures); running = true; $('#status').textContent = '格莉奇在這裡'; }
    catch (error) { showError(error); }
  });
  const syncSliders = () => { for (const [id, control] of sliders) control.update(motion.target[id]); };
  const setIdle = value => { motion.idle = Boolean(value); $('#idle').checked = motion.idle; };
  const setFollow = value => {
    motion.follow = Boolean(value); $('#follow').checked = motion.follow;
    if (!value) motion.pointer = { x: 0, y: 0 };
  };
  const setExpression = name => {
    motion.setExpression(name); expression = name;
    for (const button of document.querySelectorAll('[data-expression]')) button.setAttribute('aria-pressed', String(button.dataset.expression === name));
    syncSliders(); $('#status').textContent = `格莉奇在這裡 · ${expressionNames[name]}`;
  };
  for (const [id, label] of [['headZ', '歪頭'], ['headX', '臉部朝向'], ['gazeX', '左右視線'], ['gazeY', '上下視線'], ['eyeOpen', '眼睛開合'], ['mouthOpen', '嘴巴開合']]) {
    const [min, max, value] = PARAMS[id];
    sliders.set(id, slider($('#controls'), id, label, min, max, value, .01, next => {
      setIdle(false); if (id.startsWith('gaze')) setFollow(false);
      if (id === 'mouthOpen') voice.stop();
      motion.setParameters({ [id]: next });
    }));
  }
  for (const button of document.querySelectorAll('[data-expression]')) button.addEventListener('click', () => setExpression(button.dataset.expression));
  $('#idle').addEventListener('change', event => setIdle(event.target.checked));
  $('#follow').addEventListener('change', event => setFollow(event.target.checked));
  $('#blink').addEventListener('click', () => motion.blink());
  const gesture = () => { motion.wave(); motion.blink(); };
  $('#gesture').addEventListener('click', gesture);
  $('#stage').addEventListener('click', gesture);
  $('#stage').addEventListener('keydown', event => {
    if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); gesture(); }
  });
  $('#stage').addEventListener('pointermove', event => {
    if (!motion.follow) return;
    const rect = $('#stage').getBoundingClientRect();
    motion.pointer = { x: clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1), y: clamp((event.clientY - rect.top) / rect.height * 2 - .65, -1, 1) };
  });
  $('#stage').addEventListener('pointerleave', () => { motion.pointer = { x: 0, y: 0 }; });
  $('#reset').addEventListener('click', () => {
    voice.stop(); motion.reset(); setExpression('neutral');
    setIdle(!reducedMotion); setFollow(!reducedMotion); syncSliders();
  });
  $('#voice-demo').addEventListener('click', async () => {
    if (motion.speaking) { voice.stop(); return; }
    playingDemo = true; setExpression('happy');
    try { await voice.play(new URL('character/glitch/voice-intro.mp3', location.href)); }
    catch { /* VoicePlayer reports the playback error in the visible status. */ }
  });
  $('#audio-file').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    voice.stop(); if (objectURL) URL.revokeObjectURL(objectURL);
    objectURL = URL.createObjectURL(file); playingDemo = false;
    try { await voice.play(objectURL); $('#audio-status').textContent = `正在播放：${file.name}`; }
    catch { /* Visible status is set by VoicePlayer. */ }
  });
  $('#stop-audio').addEventListener('click', () => voice.stop());
  for (const part of rig.parts) {
    const option = document.createElement('option'); option.value = part.id; option.textContent = part.label; $('#part-select').append(option);
  }
  const refreshPart = () => {
    $('#part-sliders').replaceChildren(); $('#part-controls').hidden = !selected;
    if (!selected) return;
    const part = rig.parts.find(part => part.id === selected);
    $('#part-visible').checked = part.visible !== false;
    for (const [index, label, min, max] of [[0, '水平位置', -150, 1100], [1, '垂直位置', -200, 1320], [2, '寬度', 5, 850], [3, '高度', 5, 1100]]) {
      slider($('#part-sliders'), `part-${index}`, label, min, max, part.rect[index], 1, value => {
        const delta = value - part.rect[index];
        if (part.clip && index < 2) part.clip[index] += delta;
        part.rect[index] = value;
      });
    }
  };
  $('#part-select').addEventListener('change', event => { selected = event.target.value; refreshPart(); });
  $('#part-visible').addEventListener('change', event => { rig.parts.find(part => part.id === selected).visible = event.target.checked; });
  $('#part-reset').addEventListener('click', () => {
    const index = rig.parts.findIndex(part => part.id === selected);
    rig.parts[index] = structuredClone(original.parts[index]); refreshPart();
  });
  $('#download-rig').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(rig, null, 2) + '\n'], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'glitch.rig.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('#explode').addEventListener('change', event => { $('#stage-hint').textContent = event.target.checked ? `${rig.parts.length} 個獨立部件` : '移動游標，和她對看'; });
  let previous = performance.now(), uiTime = 0, frameID;
  let lastPose = { ...motion.values, hair: 0 };
  function frame(now) {
    const dt = Math.min((now - previous) / 1000, .05); previous = now;
    if (running) {
      const level = voice.update();
      lastPose = motion.step(dt);
      const target = $('#explode').checked ? 1 : 0;
      explode += (target - explode) * (reducedMotion ? 1 : 1 - Math.exp(-dt * 9));
      const options = { explode, selected };
      const scene = buildScene(rig, lastPose, options);
      renderer.render(scene, rig, options);
      if ($('#show-mesh').checked || selected) drawMesh(meshCanvas, scene, rig, options);
      else meshCanvas.getContext('2d').clearRect(0, 0, meshCanvas.width, meshCanvas.height);
      if (now - uiTime > 80) {
        $('#audio-level').style.transform = `scaleX(${level})`;
        $('.audio-meter').setAttribute('aria-valuenow', String(Math.round(level * 100)));
        if (playingDemo && motion.speaking) $('#voice-caption p').textContent = voice.element.currentTime < 7 ? '大家好，我是格莉奇。虛擬主播，頻道第二年。我的記憶體只有四 KB。' : '正在播放格莉奇的角色自我介紹。';
        uiTime = now;
      }
    }
    frameID = requestAnimationFrame(frame);
  }
  const api = {
    version: '0.2.0',
    setParameters(values) { motion.setParameters(values); syncSliders(); },
    setExpression, setIdle, setFollow, blink: () => motion.blink(), gesture,
    async playAudio(url) { playingDemo = false; return voice.play(url); },
    stopAudio: () => voice.stop(),
    getParameters: () => ({ ...lastPose }),
    exportRig: () => structuredClone(rig),
    getInfo: () => ({ renderer: renderer.kind, parts: rig.parts.length, expression, format: rig.format, version: rig.version, graphicsError: renderer.gl?.getError() ?? 0 }),
  };
  Object.assign(window.Glitch2D, api);
  for (const button of document.querySelectorAll('button[disabled]')) button.disabled = false;
  $('#loading').hidden = true; $('#status').textContent = '格莉奇在這裡';
  frameID = requestAnimationFrame(frame);
  addEventListener('pagehide', () => {
    cancelAnimationFrame(frameID); observer.disconnect(); voice.dispose(); renderer.dispose();
    if (objectURL) URL.revokeObjectURL(objectURL);
  }, { once: true });
  addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  return api;
}

window.Glitch2D = { version: '0.2.0' };
window.Glitch2D.ready = start();
window.Glitch2D.ready.catch(showError);
