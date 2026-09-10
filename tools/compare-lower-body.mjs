import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { CanvasRenderer, prepareTexture } from '../engine/renderer.js';
import { buildScene } from '../engine/geometry.js';
import { restPose } from '../engine/alignment.js';

const base = new URL('../character/glitch/', import.meta.url);
const rig = JSON.parse(await readFile(new URL('rig.json', base)));
const previousPath = process.argv[2];
if (!previousPath) throw new Error('Usage: node tools/compare-lower-body.mjs path/to/previous-rig.json');
const previous = JSON.parse(await readFile(previousPath));
const reference = await loadImage(await readFile(new URL('turnaround-reference.png', base)));
async function prepare(rig) {
  const textures = {};
  for (const [id, spec] of Object.entries(rig.textures)) textures[id] = prepareTexture(await loadImage(await readFile(new URL(spec.src, base))), spec, createCanvas);
  return { rig, textures, scene: buildScene(rig, restPose()) };
}
function render(prepared, rect, width, height, only = null) {
  const canvas = createCanvas(width, height);
  new CanvasRenderer(canvas, prepared.textures).render(only ? prepared.scene.filter(p => p.part.id === only) : prepared.scene,
    { ...prepared.rig, views: { comparison: rect } }, { framing: 'comparison' });
  return canvas;
}
const old = await prepare(previous), next = await prepare(rig);
const ref = createCanvas(1536, 1024); ref.getContext('2d').drawImage(reference, 0, 0);
const source = ref.getContext('2d').getImageData(0, 0, 1536, 1024).data;
const refInk = (x, y) => {
  const i = (y * 1536 + x) * 4, rgb = source.slice(i, i + 3);
  return Math.max(...rgb) - Math.min(...rgb) > 15;
};
function longestSpan(ink, y, min, max) {
  let best = null, start = null;
  for (let x = min; x <= max + 1; x++) {
    if (x <= max && ink(x, y)) { if (start === null) start = x; }
    else if (start !== null) { if (!best || x - start > best[1] - best[0]) best = [start, x]; start = null; }
  }
  return best ? best[1] - best[0] : 0;
}
function silhouetteWidth(ink, y, min, max) {
  // Light skin highlights can approach white; measure contour to contour,
  // not the longest unbroken colored run through the interior.
  const xs = [];
  for (let x = min; x <= max; x++) if (ink(x, y)) xs.push(x);
  return xs.length ? xs.at(-1) - xs[0] + 1 : 0;
}
const report = { units: 'reference pixels', ground: 954, sampleHeights: [540, 580, 630, 680, 720, 765, 835, 920], legs: [] };
for (const [side, min, max] of [['left', 210, 310], ['right', 313, 430]]) {
  const measure = prepared => {
    const c = render(prepared, [-300, 15, 3840, 2560], 1536, 1024, 'leg-' + side);
    const pixels = c.getContext('2d').getImageData(0, 0, 1536, 1024).data;
    const ink = (x, y) => pixels[(y * 1536 + x) * 4 + 3] > 128;
    let soleY = null;
    for (let y = 900; y < 990; y++) if (longestSpan(ink, y, min, max) >= 4) soleY = y;
    return { widths: report.sampleHeights.map(y => silhouetteWidth(ink, y, side === 'left' && y < 600 ? 220 : min, max)), soleY };
  };
  report.legs.push({ side, referenceWidths: report.sampleHeights.map(y => silhouetteWidth(refInk, y, side === 'left' && y < 600 ? 220 : min, max)), before: measure(old), after: measure(next) });
}
const crop = [188, 435, 245, 535], width = 430, height = Math.round(width * crop[3] / crop[2]), label = 42;
const rect = [crop[0] * 2.5 - 300, crop[1] * 2.5 + 15, crop[2] * 2.5, crop[3] * 2.5];
const out = createCanvas(width * 4, height + label), ctx = out.getContext('2d');
const before = render(old, rect, width, height), after = render(next, rect, width, height);
ctx.fillStyle = '#edf1f5'; ctx.fillRect(0, 0, out.width, out.height);
for (const [i, title] of ['REFERENCE', 'YOUR PREVIOUS ALIGNMENT', 'REGENERATED', 'OVERLAY / 50%'].entries()) {
  ctx.fillStyle = '#24344a'; ctx.font = '14px "DejaVu Sans"'; ctx.fillText(title, i * width + 14, 27);
  ctx.save(); ctx.translate(i * width, label);
  if (i === 0 || i === 3) ctx.drawImage(reference, ...crop, 0, 0, width, height);
  if (i > 0) { ctx.globalAlpha = i === 3 ? .5 : 1; ctx.drawImage(i === 1 ? before : after, 0, 0); ctx.globalAlpha = 1; }
  const ground = (report.ground - crop[1]) * height / crop[3];
  ctx.strokeStyle = '#14859d'; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(0, ground); ctx.lineTo(width, ground); ctx.stroke(); ctx.restore();
}
const destination = new URL('../test-results/', import.meta.url); await mkdir(destination, { recursive: true });
await writeFile(new URL('lower-body-comparison.png', destination), out.toBuffer('image/png'));
await writeFile(new URL('lower-body-measurements.json', destination), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
