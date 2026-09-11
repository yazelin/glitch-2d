import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Motion, Spring, rms, mouthFromRms, waveFrame, WAVE_DURATION } from '../engine/motion.js';
import { buildScene, deformPoint, partOpacity, around, point, multiply, identity, nodeMatrices, facePoint, fitView, editPartRect } from '../engine/geometry.js';
import { removeChroma, prepareTexture } from '../engine/renderer.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const rig = JSON.parse(await readFile(new URL('../character/glitch/rig.json', import.meta.url), 'utf8'));
const neutral = () => ({ ...new Motion().values, hair: 0 });
const height = item => {
  const ys = item.positions.filter((_, i) => i % 2); return Math.max(...ys) - Math.min(...ys);
};
const localHeight = item => {
  const columns = item.part.mesh?.[0] || 4, rows = item.part.mesh?.[1] || 6;
  const bottom = rows * (columns + 1) * 2;
  return Math.hypot(item.positions[bottom] - item.positions[0], item.positions[bottom + 1] - item.positions[1]);
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
  assert(localHeight(find(closed, 'eye-left')) < localHeight(find(open, 'eye-left')) * .2);
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
test('neck rest shrink lowers and thins the choker, and the jaw fills out the chin only', () => {
  const pose = neutral();
  const torso = rig.parts.find(part => part.id === 'torso');
  const unshrunk = { ...torso, neck: { ...torso.neck, rest: { ...torso.neck.rest, shrink: 0 } } };
  const band = part => [560, 590].map(y => deformPoint(part, torso.neck.center, y, pose, rig)[1]);
  const [top, bottom] = band(torso), [flatTop, flatBottom] = band(unshrunk);
  assert(top > flatTop, 'The choker sits lower, so more throat shows under the chin');
  assert(bottom - top < flatBottom - flatTop, 'The choker renders thinner than the hoodie scale');
  const outside = torso.neck.center + torso.neck.rest.outer + 5;
  assert.deepEqual(deformPoint(torso, outside, 660, pose, rig), deformPoint(unshrunk, outside, 660, pose, rig),
    'The outer hoodie keeps its own scale');
  const face = rig.parts.find(part => part.id === 'face');
  const plain = { ...face, jaw: undefined };
  const chin = deformPoint(face, 560, 530, pose, rig), sharp = deformPoint(plain, 560, 530, pose, rig);
  assert(chin[0] > sharp[0] && chin[1] > sharp[1], 'The lower face widens and reaches a little further down');
  assert.deepEqual(deformPoint(face, 560, 300, pose, rig), deformPoint(plain, 560, 300, pose, rig),
    'Eyes and brows keep their place');
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
    const scene = buildScene(rig, pose), matrix = multiply(nodeMatrices(rig, pose).head, iris.adjustment || identity());
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
  // Keep the original shared atlas as a fixture for crop/exclusion behavior.
  const spec = { chroma: [49,226,25], crop: [732,24,423,617], clearRects: [[890,600,365,60]] };
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

test('a wave unfolds the arm, swings it, and puts it back down', () => {
  const start = waveFrame(0), peak = waveFrame(1.2), end = waveFrame(WAVE_DURATION);
  assert.ok(start.armRaise < .01 && start.armFold < .01, 'starts from rest');
  assert.ok(peak.armRaise > .9 && peak.armFold > .8, 'the arm is up at the peak');
  assert.ok(end.armRaise < .01 && end.armFold < .01, 'and is back down when it ends');
  // Overlapping action: the impulse travels out along the limb, so the
  // shoulder moves first, the elbow follows, and the wrist trails both.
  // Nothing in the chain arrives at the same moment as its parent.
  const reaches = (key, fraction) => {
    const peak = Math.max(...Array.from({ length: 300 }, (_, i) => Math.abs(waveFrame(i / 100)[key])));
    for (let i = 0; i < 300; i++) if (Math.abs(waveFrame(i / 100)[key]) >= peak * fraction) return i / 100;
    return Infinity;
  };
  assert.ok(waveFrame(.2).armRaise > waveFrame(.2).armFold, 'the shoulder leads the elbow');
  assert.ok(reaches('armFold', .9) > reaches('armRaise', .9), 'the elbow arrives after the shoulder');
  // Follow-through: a limb with mass overshoots and rocks back rather than
  // stopping dead on its mark.
  const top = Math.max(...Array.from({ length: 300 }, (_, i) => waveFrame(i / 100).armRaise));
  assert.ok(top > 1.02, `the arm overshoots on arrival, peaked at ${top.toFixed(3)}`);
  // The brow is dragged along late rather than snapping on with the arm.
  assert.ok(reaches('brow', .9) > reaches('armRaise', .9), 'the face settles after the shoulder');
  // The face warms up and the body takes its small arc, so the arm is not
  // moving in isolation. The arc is small on purpose; the assertion is that it
  // exists at all, not that it is large.
  assert.notStrictEqual(peak.smile, 0, 'the face is coupled to the wave');
  assert.ok(Math.abs(peak.lean) > .1 && Math.abs(peak.lean) < 1, `the body takes a small arc, got ${peak.lean}`);
  // And the parts with no reason to move stay exactly still. Live2D's motion
  // guide calls this keeping unnecessary parts stationary; moving all of them
  // at once is what made an earlier version of this wave read as writhing.
  // tilt turns the head against the shoulders, which puts a visible twist in
  // a short neck wearing a choker. lean was tried twice, as a shear of the
  // torso and as a rotation of the whole figure over the shoes, and both read
  // as the hips and the neck twisting.
  for (const key of ['arm', 'tilt', 'headZ', 'headY', 'headX']) {
    for (const t of [0, .5, 1.2, 2, 2.8]) {
      assert.strictEqual(waveFrame(t)[key], 0, `${key} stays still at t=${t}`);
    }
  }
  // The forearm has to actually reverse direction, not just drift.
  const folds = [];
  for (let t = .7; t < 1.9; t += 1 / 60) folds.push(waveFrame(t).armFold);
  let reversals = 0;
  for (let i = 2; i < folds.length; i++) {
    const before = folds[i - 1] - folds[i - 2], after = folds[i] - folds[i - 1];
    if (before > 0 !== after > 0) reversals++;
  }
  assert.ok(reversals >= 3, `forearm reverses at least three times, saw ${reversals}`);
});

test('the wrist trails the forearm instead of being welded to it', () => {
  // Peak fold and peak wrist angle must not land on the same frame.
  let bestFold = 0, bestHand = 0;
  for (let t = .7; t < 1.9; t += 1 / 120) {
    if (waveFrame(t).armFold > waveFrame(bestFold || .7).armFold) bestFold = t;
    if (waveFrame(t).handAngle > waveFrame(bestHand || .7).handAngle) bestHand = t;
  }
  assert.ok(Math.abs(bestFold - bestHand) > .01, 'the hand lags the forearm');
});

test('a slot shows one variant at a time and leaves other parts alone', () => {
  const base = { id: 'eye-left', slot: 'eyes', variant: 'default', type: 'eye' };
  const smile = { id: 'eye-smile-left', slot: 'eyes', variant: 'smile' };
  const brow = { id: 'brow-left', type: 'brow' };
  const open = { eyeOpen: 1 };
  assert.ok(partOpacity(base, open) > 0, 'default shows when no slot is chosen');
  assert.strictEqual(partOpacity(smile, open), 0, 'other variants stay hidden');
  const swapped = { eyeOpen: 1, slots: { eyes: 'smile' } };
  assert.strictEqual(partOpacity(base, swapped), 0, 'the default gives way');
  assert.ok(partOpacity(smile, swapped) > 0, 'the chosen variant shows');
  assert.strictEqual(partOpacity(brow, swapped), partOpacity(brow, open), 'parts outside the slot are untouched');
});

test('bending the arm keeps the shoulder still and carries the hand upward', () => {
  const part = rig.parts.find(p => p.id === 'arm-left');
  assert.ok(part.bend, 'the left arm carries bend angles');
  const [rx, ry, w, h] = part.rect;
  const at = ([u, v]) => [rx + w * u, ry + h * v];
  const rest = { ...neutral(), armRaise: 0, armFold: 0 };
  const up = { ...neutral(), armRaise: 1, armFold: 1 };
  const shoulder = at(part.joints.shoulder), wrist = at(part.joints.wrist);
  const pinned = deformPoint(part, ...shoulder, up, rig);
  assert.ok(Math.hypot(pinned[0] - shoulder[0], pinned[1] - shoulder[1]) < 6, 'the shoulder stays put');
  const before = deformPoint(part, ...wrist, rest, rig), after = deformPoint(part, ...wrist, up, rig);
  assert.ok(after[1] < before[1] - 400, `the wrist rises, moved ${(before[1] - after[1]).toFixed(0)}px`);
});
