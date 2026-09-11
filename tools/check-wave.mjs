// Measures the wave on rendered pixels, not on the numbers that drive it.
// The hand is drawn under the torso, so a pose that reads fine in the rig can
// still put the palm behind the hoodie. Renders each frame twice — with and
// without the left arm — and counts how much of the hand survives on screen.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { Motion, WAVE_DURATION } from '../engine/motion.js';
import { buildScene } from '../engine/geometry.js';
import { CanvasRenderer, prepareTexture } from '../engine/renderer.js';

const base = new URL('../character/glitch/', import.meta.url);
const rig = JSON.parse(await readFile(new URL('rig.json', base), 'utf8'));
const textures = {};
for (const [id, spec] of Object.entries(rig.textures)) {
  const image = await loadImage(await readFile(new URL(spec.src, base)));
  textures[id] = prepareTexture(image, spec, createCanvas);
}

const [width, height] = rig.views.full.slice(2);
const surface = createCanvas(width, height);
const renderer = new CanvasRenderer(surface, textures);
const draw = (pose, hidden) => {
  const context = surface.getContext('2d');
  context.clearRect(0, 0, width, height);
  const options = { framing: 'full', hidden };
  renderer.render(buildScene(rig, pose, options), rig, options);
  return context.getImageData(0, 0, width, height).data;
};
// Bare skin: the sleeve and the hoodie are all blue-white, the hand is not.
const isSkin = (d, i) => d[i + 3] > 140 && d[i] > 232 && d[i + 1] > 196 && d[i + 1] < 248 && d[i + 2] > 188 && d[i + 2] < 244;
const others = new Set(rig.parts.map(part => part.id).filter(id => id !== 'arm-left'));
const everything = new Set(['arm-left']);

// The hoodie has a socket cut out of it where the sleeve attaches, so if the
// arm swings off that socket the hole shows. This is the socket itself, in
// character coordinates, with a margin for the torso's alignment matrix. Open
// space between the raised arm and the body is not a hole and is not measured.
const [viewX] = rig.views.full;
const box = { x0: Math.round(260 - viewX), x1: Math.round(380 - viewX), y0: 620, y1: 830 };
const armpitGap = data => {
  let total = 0;
  for (let y = box.y0; y < box.y1; y++) for (let x = box.x0; x < box.x1; x++) {
    if (data[(y * width + x) * 4 + 3] <= 140) total++;
  }
  return total;
};

// Centre of mass of the paint inside a band, in character coordinates.
const centroid = (data, y0, y1) => {
  let sx = 0, sy = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] > 140) { sx += x; sy += y; n++; }
  }
  return n ? [sx / n, sy / n] : null;
};
// Chest, for which way and how far the upper body travels.
const bands = { chest: [700, 1100] };
// Bare throat between the jaw and the collar. The head travels when the spine
// bends, and if the neck column does not follow it the throat stretches.
const neckBand = [560, 700];
const throat = data => {
  let n = 0;
  for (let y = neckBand[0]; y < neckBand[1]; y++) for (let x = 0; x < width; x++) {
    if (isSkin(data, (y * width + x) * 4)) n++;
  }
  return n;
};

// Anything painted on the outermost column has been cut off by the view.
const clipped = data => {
  let count = 0;
  for (let y = 0; y < height; y++) if (data[(y * width) * 4 + 3] > 140) count++;
  return count;
};

function measure(pose) {
  const full = draw(pose, everything);          // scene without the left arm
  const alone = draw(pose, others);             // the left arm on its own
  const both = draw(pose, new Set());           // the finished frame
  let drawn = 0, visible = 0, top = Infinity, left = Infinity, right = -Infinity;
  let armDrawn = 0, armVisible = 0;
  for (let i = 0; i < alone.length; i += 4) {
    // Whole-arm coverage first: a pose that buries the upper arm in the torso
    // looks wrong long before the hand is in trouble.
    if (alone[i + 3] > 140) {
      armDrawn++;
      if (Math.abs(both[i] - full[i]) + Math.abs(both[i + 1] - full[i + 1]) + Math.abs(both[i + 2] - full[i + 2]) > 24 || full[i + 3] < 140) armVisible++;
    }
    if (!isSkin(alone, i)) continue;
    drawn++;
    const x = (i / 4) % width, y = Math.floor(i / 4 / width);
    // The hand survives where the finished frame still differs from the
    // armless one, which is exactly where the arm is not painted over.
    if (Math.abs(both[i] - full[i]) + Math.abs(both[i + 1] - full[i + 1]) + Math.abs(both[i + 2] - full[i + 2]) > 24 || full[i + 3] < 140) {
      visible++;
      if (y < top) top = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  return { drawn, visible, shown: drawn ? visible / drawn : 0, arm: armDrawn ? armVisible / armDrawn : 0,
    top, left, right, clipped: clipped(both), gap: armpitGap(both),
    chest: centroid(full, ...bands.chest), throat: throat(full), frame: both };   // full has no arm in it, so the raised hand cannot skew the body measurements
}

// The frames are rendered anyway, so writing them out costs nothing.
const frames = process.argv.includes('--frames') ? new URL('../test-results/wave/', import.meta.url) : null;
if (frames) { await rm(frames, { recursive: true, force: true }); await mkdir(frames, { recursive: true }); }

const motion = new Motion(() => .5);
// Idle breathing and sway keep running during a wave in the app, so they run
// here too. Measuring with them off flattered the numbers and, worse, made the
// rendered frames look frozen in a way the shipped pet never is.
motion.idle = true; motion.follow = false;
const rest = measure(motion.step(1 / 30));
motion.wave();
const rows = [];
for (let n = 0, t = 0; t <= WAVE_DURATION + .1; t += 1 / 30, n++) {
  const row = { t, ...measure(motion.step(1 / 30)) };
  if (frames) await writeFile(new URL(`f${String(n).padStart(3, '0')}.png`, frames), surface.toBuffer('image/png'));
  delete row.frame;
  rows.push(row);
}

let failures = 0;
// Signed, because which way the body leans is the whole question. Negative is
// toward the raised arm, which reads as the body chasing the hand.
const drift = rows.map(r => (r.chest && rest.chest ? r.chest[0] - rest.chest[0] : 0));
const worstDrift = drift.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0);
console.log(`shoulder drift ${worstDrift > 0 ? 'away from' : 'toward'} the raised arm by ${Math.abs(worstDrift).toFixed(0)}px`);

// A torso that reverses direction once per wave stroke reads as writhing. The
// body should settle into its lean and stay there while only the arm strokes.
const held = rows.filter(r => r.t > .7 && r.t < 1.9 && r.chest);
let wobble = 0;
for (let i = 2; i < held.length; i++) {
  const before = held[i - 1].chest[0] - held[i - 2].chest[0];
  const after = held[i].chest[0] - held[i - 1].chest[0];
  if (Math.abs(after) > .4 && before > 0 !== after > 0) wobble++;
}
console.log(`torso wobble   ${wobble} direction changes while the hand is up`);
if (wobble > 3) {
  console.error(`FAIL the torso writhes: ${wobble} direction changes while the hand is up`);
  failures++;
} else console.log('OK the torso holds its lean instead of rocking with each stroke');

const stretched = rows.reduce((a, b) => (b.throat > a.throat ? b : a));
const stretch = rest.throat ? (stretched.throat - rest.throat) / rest.throat : 0;
console.log(`neck stretch   throat is ${(stretch * 100).toFixed(0)}% larger than at rest, worst at t=${stretched.t.toFixed(2)}s`);
if (stretch > .12) {
  console.error(`FAIL the neck stretches: throat grows ${(stretch * 100).toFixed(0)}% at t=${stretched.t.toFixed(2)}s`);
  failures++;
} else console.log('OK the neck keeps its length');


const worst = rows.reduce((a, b) => (b.shown < a.shown ? b : a));
const highest = rows.reduce((a, b) => (b.top < a.top ? b : a));
const swing = rows.filter(r => r.shown > .5);
const span = { left: Math.min(...swing.map(r => r.left)), right: Math.max(...swing.map(r => r.right)) };
console.log(`rest          hand ${rest.visible}px of ${rest.drawn} drawn (${(rest.shown * 100).toFixed(0)}% on screen), top y=${rest.top}`);
console.log(`highest       t=${highest.t.toFixed(2)}s top y=${highest.top} (shoulder y=630), ${(highest.shown * 100).toFixed(0)}% on screen`);
console.log(`least visible t=${worst.t.toFixed(2)}s ${(worst.shown * 100).toFixed(0)}% on screen, ${worst.visible}px`);
console.log(`swing spans x ${span.left}..${span.right} (${span.right - span.left}px) across ${swing.length} frames`);
// How far the arm throws itself sideways on the way up and on the way down.
// A tighter path keeps these high; the view runs out at x=0.
const transit = rows.filter(r => r.t < .62 || r.t > 2.0);
const reach = transit.reduce((a, b) => (b.left < a.left ? b : a));
console.log(`widest throw   x=${reach.left} at t=${reach.t.toFixed(2)}s, ${transit.filter(r => r.left < 120).length} transit frames inside 120px of the edge`);
for (const r of rows.filter((_, i) => i % 6 === 0)) {
  console.log(`  t=${r.t.toFixed(2)}  shown ${(r.shown * 100).toFixed(0).padStart(3)}%  top y=${String(r.top).padStart(4)}  x ${String(r.left).padStart(4)}..${r.right}`);
}
const cut = rows.filter(r => r.clipped > 0);
if (cut.length) {
  const worstCut = cut.reduce((a, b) => (b.clipped > a.clipped ? b : a));
  console.error(`FAIL the view cuts the figure on ${cut.length} frames, worst ${worstCut.clipped}px at t=${worstCut.t.toFixed(2)}s`);
  failures++;
} else
console.log('OK nothing touches the edge of the view');

// The arm is painted under the torso, so tucking it inward hides it. Compared
// against how much of it shows while hanging, not against the whole sleeve.
const buried = rows.reduce((a, b) => (b.arm < a.arm ? b : a));
console.log(`arm coverage   rest ${(rest.arm * 100).toFixed(0)}%, lowest ${(buried.arm * 100).toFixed(0)}% at t=${buried.t.toFixed(2)}s`);
if (buried.arm < rest.arm - .05) {
  console.error(`FAIL the upper arm sinks into the body: ${(buried.arm * 100).toFixed(0)}% visible at t=${buried.t.toFixed(2)}s against ${(rest.arm * 100).toFixed(0)}% at rest`);
  failures++;
} else
console.log('OK the arm never sinks further into the body than it does at rest');

const gapped = rows.reduce((a, b) => (b.gap > a.gap ? b : a));
console.log(`armpit gap     rest ${rest.gap}px, worst ${gapped.gap}px at t=${gapped.t.toFixed(2)}s`);
if (gapped.gap > rest.gap + 200) {
  console.error(`FAIL the armpit opens up: ${gapped.gap}px of hole at t=${gapped.t.toFixed(2)}s against ${rest.gap}px at rest`);
  failures++;
} else
console.log('OK the armpit stays closed');

const FLOOR = .75;
if (worst.shown < FLOOR) {
  console.error(`FAIL the hand drops to ${(worst.shown * 100).toFixed(0)}% visible at t=${worst.t.toFixed(2)}s, below the ${FLOOR * 100}% floor`);
  failures++;
} else console.log(`OK hand never drops below ${(worst.shown * 100).toFixed(0)}% visible`);
// Every check runs, so one failure never hides the next.
process.exit(failures ? 1 : 0);
