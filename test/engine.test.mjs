import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Motion, Spring, rms, mouthFromRms } from '../engine/motion.js';
import { buildScene, around, point, nodeMatrices } from '../engine/geometry.js';
import { removeChroma } from '../engine/renderer.js';

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
  assert.deepEqual(base.find(x => x.part.id === 'torso').positions, posed.find(x => x.part.id === 'torso').positions);
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
