import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { Motion } from '../engine/motion.js';
import { buildScene } from '../engine/geometry.js';
import { CanvasRenderer, prepareTexture } from '../engine/renderer.js';

const root = new URL('../', import.meta.url);
const base = new URL('character/glitch/', root);
const rig = JSON.parse(await readFile(new URL('rig.json', base), 'utf8'));
const textures = {};
for (const [id, spec] of Object.entries(rig.textures)) {
  const image = await loadImage(await readFile(new URL(spec.src, base)));
  textures[id] = prepareTexture(image, spec, createCanvas);
}
await mkdir(new URL('test-results/', root), { recursive: true });
const states = [
  ['full', {}], ['neutral', {}], ['blink', { eyeOpen: 0 }],
  ['happy', { smile: 1, brow: .25, eyeOpen: .86, mouthWide: .45, mouthOpen: .55 }],
  ['look-left', { gazeX: -1, headX: -.6, headZ: -.6, hair: .5 }],
  ['look-right', { gazeX: 1, gazeY: -.8, headX: .6, headZ: .6, hair: -.5 }],
  ['sleepy', { eyeOpen: .5, brow: -.4, smile: -.2 }],
  ['exploded', { eyeOpen: 1 }],
  ['turn-left', { headX: -1, headY: .5, headZ: -1 }],
  ['turn-right', { headX: 1, headY: -.5, headZ: 1 }],
  ['arm-out', { arm: .75, headY: .3 }],
  ['arm-in', { arm: -.75 }],
];
for (const [name, parameters] of states) {
  const motion = new Motion(() => .5);
  const pose = { ...motion.values, hair: 0, ...parameters };
  const framing = name === 'full' ? 'full' : 'bust';
  const canvas = createCanvas(...rig.views[framing].slice(2));
  const renderer = new CanvasRenderer(canvas, textures);
  const options = { explode: name === 'exploded' ? 1 : 0, framing };
  renderer.render(buildScene(rig, pose, options), rig, options);
  const out = new URL(`test-results/${name}.png`, root);
  await writeFile(out, canvas.toBuffer('image/png'));
  console.log(out.pathname);
}
