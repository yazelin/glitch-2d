import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { buildScene, fitView } from '../engine/geometry.js';
import { Motion } from '../engine/motion.js';
import { CanvasRenderer, prepareTexture } from '../engine/renderer.js';

const base = new URL('../character/glitch/', import.meta.url);
const rig = JSON.parse(await readFile(new URL('rig.json', base)));
const reference = await loadImage(await readFile(new URL(rig.reference.src, base)));
const textures = {};
for (const [id, spec] of Object.entries(rig.textures)) textures[id] = prepareTexture(await loadImage(await readFile(new URL(spec.src, base))), spec, createCanvas);
const width = 660, height = 1235, padding = 44;
const out = createCanvas(width * 3, height + padding), ctx = out.getContext('2d');
ctx.fillStyle = '#f3f5f8'; ctx.fillRect(0, 0, out.width, out.height);
const view = fitView(width, height, rig);
const original = createCanvas(width, height), refctx = original.getContext('2d');
refctx.fillStyle = '#fff'; refctx.fillRect(0, 0, width, height);
const [x, y, w, h] = rig.reference.rect;
refctx.drawImage(reference, ...rig.reference.crop, x * view.scale + view.x, y * view.scale + view.y, w * view.scale, h * view.scale);
const model = createCanvas(width, height);
new CanvasRenderer(model, textures).render(buildScene(rig, { ...new Motion().values, hair: 0 }), rig);
for (const [i, label] of ['TURNAROUND / 2.5x', 'ASSEMBLED / SAME SCALE', 'OVERLAY / 50%'].entries()) {
  ctx.fillStyle = '#24334b'; ctx.font = '18px "DejaVu Sans"'; ctx.fillText(label, i * width + 18, 28);
  ctx.save(); ctx.translate(i * width, padding);
  if (i !== 1) ctx.drawImage(original, 0, 0);
  if (i > 0) { ctx.globalAlpha = i === 2 ? .5 : 1; ctx.drawImage(model, 0, 0); }
  ctx.restore();
}
const output = new URL('../test-results/turnaround-alignment.png', import.meta.url);
await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
await writeFile(output, out.toBuffer('image/png'));
console.log(output.pathname);
if (process.argv.includes('--publish')) {
  const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  const published = new URL(`proportion-check-v${version}.png`, base);
  await writeFile(published, out.toBuffer('image/png'));
  console.log(published.pathname);
}
