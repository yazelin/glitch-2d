// How far each emote actually departs from the neutral face, measured the way a
// moving thing has to be measured.
//
// An emote is not a still image. Idle breathing and sway run under it, and the
// error emote is deliberately shaken frame by frame. Averaging the difference
// over time cancels exactly the part that carries the expression: a shake is
// zero-mean, so the more it shakes the more the average says nothing happened.
// So every frame is compared against neutral on its own and the reported number
// is the strongest frame. The mean is printed beside it to show the gap the old
// method left, and for a still emote the two agree.
import { readFile } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { Motion, EMOTES, EMOTE_EYES, GLITCHED_EMOTES, NEUTRAL_POSE } from '../engine/motion.js';
import { buildScene } from '../engine/geometry.js';
import { CanvasRenderer, prepareTexture } from '../engine/renderer.js';

const base = new URL('../character/glitch/', import.meta.url);
const rig = JSON.parse(await readFile(new URL('rig.json', base), 'utf8'));
const textures = {};
for (const [id, spec] of Object.entries(rig.textures)) {
  textures[id] = prepareTexture(await loadImage(await readFile(new URL(spec.src, base))), spec, createCanvas);
}
// The face at the size the pet actually ships, so the numbers describe what a
// viewer sees rather than what the atlas holds.
const PET = 220;
const [, , viewW, viewH] = rig.views.bust;
const scale = PET / rig.views.full[3];
const canvas = createCanvas(Math.round(viewW * scale), Math.round(viewH * scale));
const renderer = new CanvasRenderer(canvas, textures);
const FRAMES = 90;

function frames(emote, eyes) {
  const motion = new Motion(() => .5);
  motion.follow = false;
  if (emote) motion.setParameters({ ...NEUTRAL_POSE, ...emote });
  if (eyes) motion.setSlots({ eyes });
  const glitch = emote && GLITCHED_EMOTES.includes(emote.id);
  const out = [];
  for (let n = 0; n < FRAMES; n++) {
    const pose = motion.step(1 / 30);
    if (glitch) {
      // The caller shakes the error face every frame. Reproduced here, because
      // leaving it out measures a face the site never shows.
      pose.headX = (Math.sin(n * 12.9898) * 43758.5453 % 1) * 1.4 - .7;
      pose.headZ = (Math.sin(n * 78.233) * 43758.5453 % 1) * 1.2 - .6;
    }
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    renderer.render(buildScene(rig, pose, { framing: 'bust' }), rig, { framing: 'bust' });
    out.push(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data);
  }
  return out;
}

// Whole frame, and the face on its own. Over the whole frame the number is
// dominated by how far the head travelled, so an emote that tilts the head
// scores high while one that only changes the eyes and mouth scores near zero.
// The face window answers the question actually being asked: does the face read
// differently. It is fixed in canvas space, so a head that moves out of it is
// itself part of what changed.
const FACE = [
  Math.round((325 - rig.views.bust[0]) * scale), Math.round((170 - rig.views.bust[1]) * scale),
  Math.round((675 - rig.views.bust[0]) * scale), Math.round((560 - rig.views.bust[1]) * scale),
];
const difference = (a, b, box) => {
  let sum = 0, n = 0;
  const [x0, y0, x1, y1] = box || [0, 0, canvas.width, canvas.height];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * canvas.width + x) * 4;
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i+1] - b[i+1]) + Math.abs(a[i+2] - b[i+2]);
    n++;
  }
  return sum / n / 3;
};

const rest = frames(null, null);
console.log(`face rendered at ${canvas.width}x${canvas.height}, ${FRAMES} frames each\n`);
console.log(`face window ${FACE.join(',')}`);
console.log('emote      眼睛        全畫面最強   臉部最強   臉部平均  平均低估了');
for (const [id, params] of Object.entries(EMOTES)) {
  for (const eyes of [null, EMOTE_EYES[id]].filter((v, i, a) => i === 0 || (v && v !== a[0]))) {
    const shots = frames({ ...params, id }, eyes);
    const whole = shots.map((f, i) => difference(f, rest[i]));
    const face = shots.map((f, i) => difference(f, rest[i], FACE));
    const peak = Math.max(...face), mean = face.reduce((s, v) => s + v, 0) / face.length;
    const label = eyes ? `畫的${eyes === 'smile' ? '笑眼' : '螺旋眼'}` : '參數';
    console.log(`${id.padEnd(10)} ${label.padEnd(11)} ${Math.max(...whole).toFixed(1).padStart(9)} ${peak.toFixed(1).padStart(10)} ${mean.toFixed(1).padStart(10)} ${(peak - mean).toFixed(1).padStart(10)}`);
  }
}
