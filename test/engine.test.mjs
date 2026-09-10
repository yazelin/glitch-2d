import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Motion, Spring, rms, mouthFromRms } from '../engine/motion.js';
import { buildScene, deformPoint, around, point, nodeMatrices, facePoint, fitView, editPartRect } from '../engine/geometry.js';
import { removeChroma, prepareTexture } from '../engine/renderer.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const rig = JSON.parse(await readFile(new URL('../character/glitch/rig.json', import.meta.url), 'utf8'));
const neutral = () => ({ ...new Motion().values, hair: 0 });
const height = item => {
  const ys = item.positions.filter((_, i) => i % 2); return Math.max(...ys) - Math.min(...ys);
};

test('parameter API clamps range and ignores invalid or inherited properties', () => {
  const motion = new Motion();
  motion.setParameters({ headX: 50, eyeOpen: -1, mouthOpen: NaN, gazeY: Infinity, toString: 1, unknown: 1 });
  assert.equal(motion.target.headX, 1); assert.equal(motion.target.eyeOpen, 0);
  assert.equal(motion.target.mouthOpen, 0); assert.equal(motion.target.gazeY, 0);
  assert.equal(Object.hasOwn(motion.target, 'toString'), false);
  assert.throws(() => motion.setExpression('__proto__'), RangeError);
});
test('blink closes geometry and aperture without squashing the iris', () => {
  const open = buildScene(rig, neutral());
  const closed = buildScene(rig, { ...neutral(), eyeOpen: .15 });
  const find = (scene, id) => scene.find(item => item.part.id === id);
  assert(height(find(closed, 'eye-left')) < height(find(open, 'eye-left')) * .2);
  assert(Math.abs(height(find(closed, 'iris-left')) - height(find(open, 'iris-left'))) < 1e-6);
  assert(Math.hypot(...find(closed, 'iris-left').clip.axisY) < Math.hypot(...find(open, 'iris-left').clip.axisY) * .2);
  const motion = new Motion(() => .5); motion.idle = false; motion.blink();
  let minimum = 1; let last;
  for (let i = 0; i < 45; i++) { last = motion.step(1 / 120); minimum = Math.min(minimum, last.eyeOpen); }
  assert(minimum < .01); assert(last.eyeOpen > .99);
});
test('head movement preserves torso attachment and moving gaze preserves eye aperture', () => {
  const base = buildScene(rig, neutral());
  const posed = buildScene(rig, { ...neutral(), headX: 1 });
  const restTorso = base.find(x => x.part.id === 'torso'), turnedTorso = posed.find(x => x.part.id === 'torso');
  const firstFixedRow = (restTorso.part.mesh[0] + 1) * 2 * 3;
  assert.deepEqual(restTorso.positions.slice(firstFixedRow), turnedTorso.positions.slice(firstFixedRow));
  assert.notDeepEqual(restTorso.positions, turnedTorso.positions, 'The neck follows the jaw while the hoodie stays anchored');
  assert.notDeepEqual(base.find(x => x.part.id === 'face').positions, posed.find(x => x.part.id === 'face').positions);
  const gaze = buildScene(rig, { ...neutral(), gazeX: 1 });
  assert.deepEqual(base.find(x => x.part.id === 'iris-left').clip, gaze.find(x => x.part.id === 'iris-left').clip);
  assert.notDeepEqual(base.find(x => x.part.id === 'iris-left').positions, gaze.find(x => x.part.id === 'iris-left').positions);
});
test('voice energy opens mouth only above silence floor and release closes it', () => {
  assert.equal(mouthFromRms(rms(new Float32Array(512))), 0);
  assert(Math.abs(rms([.5, -.5, .5, -.5]) - .5) < 1e-6);
  const motion = new Motion(); motion.speaking = true; motion.audio = mouthFromRms(.15);
  for (let i = 0; i < 20; i++) motion.step(1 / 60);
  assert(motion.values.mouthOpen > .5);
  motion.audio = 0;
  for (let i = 0; i < 30; i++) motion.step(1 / 60);
  assert(motion.values.mouthOpen < .002);
});
test('spring remains bounded and settles after an interrupted frame', () => {
  const spring = new Spring();
  for (let i = 0; i < 90; i++) spring.step(1, 1 / 60);
  spring.step(-1, 60);
  assert(Number.isFinite(spring.value) && Math.abs(spring.value) < 2);
  for (let i = 0; i < 600; i++) spring.step(0, 1 / 60);
  assert(Math.abs(spring.value) < .0001);
});
test('hierarchy applies rotation around pivot and rejects cycles', () => {
  const rotated = point(around([10, 20], Math.PI / 2), 20, 20);
  assert(Math.abs(rotated[0] - 10) < 1e-6); assert(Math.abs(rotated[1] - 30) < 1e-6);
  assert.throws(() => nodeMatrices({ nodes: [{ id: 'a', parent: 'b', pivot: [0, 0] }, { id: 'b', parent: 'a', pivot: [0, 0] }] }, neutral()), /cycle/);
});
test('chroma key clears the generated backing and retains mint, skin and plum', () => {
  const pixels = new Uint8ClampedArray([19,241,13,255, 17,239,15,255, 178,236,247,255, 255,219,216,255, 62,37,75,255]);
  removeChroma(pixels);
  assert.equal(pixels[3], 0); assert.equal(pixels[7], 0);
  assert.equal(pixels[11], 255); assert.equal(pixels[15], 255); assert.equal(pixels[19], 255);
  assert.deepEqual([...pixels.slice(8,12)], [178,236,247,255]);
});
test('extreme supported poses keep every mesh finite and all indices in bounds', () => {
  for (const headX of [-1, 1]) for (const headZ of [-1, 1]) for (const eyeOpen of [0, .5, 1]) for (const explode of [0, 1]) {
    const scene = buildScene(rig, { ...neutral(), headX, headZ, eyeOpen, mouthOpen: 1, mouthWide: 1, hair: -.8, arm: 1 }, { explode });
    for (const item of scene) {
      assert(item.positions.every(Number.isFinite));
      assert(item.indices.every(n => n >= 0 && n < item.positions.length / 2));
      if (item.clip) assert([...item.clip.center, ...item.clip.axisX, ...item.clip.axisY].every(Number.isFinite));
    }
  }
});
test('exploded view reveals dormant mouth and eyelid artwork while respecting hidden parts', () => {
  const scene = buildScene(rig, neutral(), { explode: 1 });
  assert(scene.every(item => item.opacity === 1));
  const modified = structuredClone(rig); modified.parts[0].visible = false;
  assert.equal(buildScene(modified, neutral(), { explode: 1 })[0].opacity, 0);
});

test('skin, facial features and eye aperture share one face transform at extreme turns', () => {
  const iris = rig.parts.find(p => p.id === 'iris-left');
  for (const headX of [-1, 1]) for (const headZ of [-1, 1]) {
    const pose = { ...neutral(), headX, headZ, headY: .7, eyeOpen: .2 };
    const scene = buildScene(rig, pose), matrix = nodeMatrices(rig, pose).head;
    const [x, y, w, h] = iris.clip;
    const center = point(matrix, ...facePoint(rig, pose, x + w / 2, y + h / 2));
    assert.deepEqual(scene.find(p => p.part.id === iris.id).clip.center, center);
    const expectedEdge = point(matrix, ...facePoint(rig, pose, x + w / 2, y + h / 2 + h / 2 * pose.eyeOpen));
    const actual = scene.find(p => p.part.id === iris.id).clip;
    expectedEdge.forEach((n, i) => assert(Math.abs(n - actual.center[i] - actual.axisY[i]) < 1e-8));
  }
});

test('resizing preserves art proportions and moves the aperture with its part', () => {
  const part = { rect: [10, 20, 80, 160], clip: [30, 60, 40, 60] };
  editPartRect(part, 2, 120);
  assert.deepEqual(part.rect, [10, 20, 120, 240]);
  assert.deepEqual(part.clip, [40, 80, 60, 90]);
  editPartRect(part, 1, 50);
  assert.deepEqual(part.clip, [40, 110, 60, 90]);
  editPartRect(part, 3, 0); editPartRect(part, 2, NaN);
  assert.deepEqual(part.rect, [10, 50, 120, 240]);
  for (const p of rig.parts.filter(p => p.lockAspect)) assert(Math.abs(p.rect[2] / p.rect[3] - p.uv[2] / p.uv[3]) < 1e-8, p.id);
});

test('full and bust framing contain their art bounds and can map pointers back to the same face', () => {
  for (const framing of ['full', 'bust']) for (const [width, height] of [[390, 600], [1100, 800]]) {
    const [x, y, w, h] = rig.views[framing];
    const view = fitView(width, height, rig, 0, framing);
    assert(x * view.scale + view.x >= -1e-8);
    assert(y * view.scale + view.y >= -1e-8);
    assert((x + w) * view.scale + view.x <= width + 1e-8);
    assert((y + h) * view.scale + view.y <= height + 1e-8);
    const screen = [500 * view.scale + view.x, 430 * view.scale + view.y];
    assert(Math.abs((screen[0] - view.x) / view.scale - 500) < 1e-8);
    assert(Math.abs((screen[1] - view.y) / view.scale - 430) < 1e-8);
  }
});

test('atlas crops exclude neighboring pieces and source art is untouched', async () => {
  const source = await loadImage(await readFile(new URL('../character/glitch/sleeves-v2.png', import.meta.url)));
  const spec = rig.textures.sleeveLeft;
  const result = prepareTexture(source, spec, createCanvas);
  assert.equal(source.width, 1254); assert.equal(result.width, 423); assert.equal(result.height, 617);
  const ctx = result.getContext('2d');
  assert.equal(ctx.getImageData(220, 601, 1, 1).data[3], 0, 'Neighbor shoulder must not leak into the left hand crop');
  assert(ctx.getImageData(345, 220, 1, 1).data[3] > 200, 'Sleeve paint must survive the extraction');
});

test('hand calibration holds the wrist and sleeve while preserving fingertip proportions', () => {
  for (const part of rig.parts.filter(p => p.hand)) {
    const [x, y, w, h] = part.rect;
    const wrist = [x + w * part.hand.anchor[0], y + h * part.hand.anchor[1]];
    const distance = h * part.hand.transition * 2;
    const tip = wrist.map((n, i) => n + part.hand.axis[i] * distance);
    const sleeve = wrist.map((n, i) => n - part.hand.axis[i] * distance);
    const deform = p => deformPoint(part, ...p, neutral(), rig);
    assert.deepEqual(deform(wrist), wrist);
    assert.deepEqual(deform(sleeve), sleeve, 'Hand corrections must not shorten the sleeve');
    const first = deform(tip), second = deform([tip[0] + 4, tip[1] + 3]);
    assert(Math.abs(Math.hypot(first[0] - second[0], first[1] - second[1]) - 5 * part.hand.scale) < 1e-7);
    assert(Math.abs(Math.hypot(first[0] - wrist[0], first[1] - wrist[1]) - distance * part.hand.scale) < 1e-7);
  }
});

test('hidden thigh roots cover the skirt joint without moving knees or soles, including after resizing', () => {
  for (const source of rig.parts.filter(p => p.attachment)) {
    for (const factor of [1, 1.5]) {
      const part = structuredClone(source);
      editPartRect(part, 2, part.rect[2] * factor);
      editPartRect(part, 1, part.rect[1] + 25);
      const [x, y, w, h] = part.rect;
      const top = deformPoint(part, x + w / 2, y, neutral(), rig);
      assert(top[1] < y, 'The hidden root must overlap the skirt');
      for (const depth of [part.attachment.depth, .25, .5, 1]) {
        const original = [x + w / 2, y + h * depth];
        const actual = deformPoint(part, ...original, neutral(), rig);
        original.forEach((n, i) => assert(Math.abs(n - actual[i]) < 1e-7));
      }
    }
  }
});
