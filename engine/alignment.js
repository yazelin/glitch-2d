import { around, buildScene, deformPoint, identity, multiply, nodeMatrices, point } from './geometry.js?v=0.4.8';
import { Motion } from './motion.js?v=0.4.8';

export const restPose = () => ({ ...new Motion().values, hair: 0 });

export function inverse([a, b, c, d, x, y]) {
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-10) throw new RangeError('Singular transform');
  return [d / det, -b / det, -c / det, a / det, (c * y - d * x) / det, (b * x - a * y) / det];
}

export function sceneBounds(scene, ids) {
  const selected = new Set(ids);
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const item of scene) if (selected.has(item.part.id)) {
    for (let i = 0; i < item.positions.length; i += 2) {
      left = Math.min(left, item.positions[i]); right = Math.max(right, item.positions[i]);
      top = Math.min(top, item.positions[i + 1]); bottom = Math.max(bottom, item.positions[i + 1]);
    }
  }
  return Number.isFinite(left) ? [left, top, right - left, bottom - top] : null;
}

export function selectionGroups(rig) {
  const ids = predicate => rig.parts.filter(predicate).map(p => p.id);
  return [
    { id: '@all', label: '全身整組', parts: ids(() => true) },
    { id: '@head', label: '頭部整組', parts: ids(p => p.node === 'head') },
    { id: '@hair', label: '頭髮整組', parts: ids(p => p.type === 'hair') },
    { id: '@face', label: '臉部與五官', parts: ids(p => p.face) },
    { id: '@eye-left', label: '左眼整組（含眉毛）', parts: ids(p => /^(eye|iris|lid|brow)-left$/.test(p.id)) },
    { id: '@eye-right', label: '右眼整組（含眉毛）', parts: ids(p => /^(eye|iris|lid|brow)-right$/.test(p.id)) },
    { id: '@legs', label: '雙腿與鞋子', parts: ids(p => p.id.startsWith('leg-')) },
  ];
}

// Picking follows the drawn mesh, UV alpha and eye aperture, not atlas rectangles.
export function hitTest(scene, x, y, alphaAt) {
  for (let n = scene.length - 1; n >= 0; n--) {
    const item = scene[n];
    if (item.opacity < .05) continue;
    if (item.clip) {
      const { center, axisX, axisY } = item.clip;
      const local = point(inverse([...axisX, ...axisY, ...center]), x, y);
      if (local[0] ** 2 + local[1] ** 2 > 1) continue;
    }
    for (let i = 0; i < item.indices.length; i += 3) {
      const ids = item.indices.slice(i, i + 3);
      const [a, b, c] = ids.map(id => item.positions.slice(id * 2, id * 2 + 2));
      const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(den) < 1e-9) continue;
      const u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / den;
      const v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / den;
      const w = 1 - u - v;
      if (Math.min(u, v, w) < -1e-6) continue;
      const weights = [u, v, w], uv = [0, 0];
      ids.forEach((id, j) => { uv[0] += item.texcoords[id * 2] * weights[j]; uv[1] += item.texcoords[id * 2 + 1] * weights[j]; });
      if (alphaAt(item.part.texture, ...uv) > 30) return item.part.id;
    }
  }
  return null;
}

export class Alignment {
  constructor(rig) {
    this.original = structuredClone(rig);
    this.rig = structuredClone(rig);
    this.groups = selectionGroups(rig);
    this.selection = '';
    this.past = []; this.future = []; this.transaction = null;
    this.pose = restPose();
  }
  get ids() {
    return this.groups.find(g => g.id === this.selection)?.parts || (this.selection ? [this.selection] : []);
  }
  select(id) {
    if (id && !this.groups.some(g => g.id === id) && !this.rig.parts.some(p => p.id === id)) throw new RangeError('Unknown selection');
    this.selection = id; return this.ids;
  }
  scene() { return buildScene(this.rig, this.pose); }
  bounds() { return sceneBounds(this.scene(), this.ids); }
  snapshot() { return this.rig.parts.map(p => p.adjustment ? [...p.adjustment] : null); }
  restore(values) {
    this.rig.parts.forEach((p, i) => { if (values[i]) p.adjustment = [...values[i]]; else delete p.adjustment; });
  }
  begin() { if (!this.transaction) this.transaction = this.snapshot(); }
  commit() {
    if (!this.transaction) return;
    if (JSON.stringify(this.transaction) !== JSON.stringify(this.snapshot())) {
      this.past.push(this.transaction); if (this.past.length > 80) this.past.shift(); this.future = [];
    }
    this.transaction = null;
  }
  cancel() { if (this.transaction) this.restore(this.transaction); this.transaction = null; }
  undo() {
    this.cancel(); if (!this.past.length) return false;
    this.future.push(this.snapshot()); this.restore(this.past.pop()); return true;
  }
  redo() {
    this.cancel(); if (!this.future.length) return false;
    this.past.push(this.snapshot()); this.restore(this.future.pop()); return true;
  }
  transform(world) {
    if (!this.ids.length) return;
    const matrices = nodeMatrices(this.rig, this.pose);
    for (const part of this.rig.parts.filter(p => this.ids.includes(p.id))) {
      const parent = matrices[part.node || 'root'];
      // Conjugation keeps dragging in screen/world directions even on rotated limbs.
      part.adjustment = multiply(multiply(multiply(inverse(parent), world), parent), part.adjustment || identity());
    }
  }
  move(dx, dy) {
    if (![dx, dy].every(Number.isFinite)) throw new RangeError('Invalid movement');
    this.transform([1, 0, 0, 1, dx, dy]);
  }
  scale(factor, anchor = null) {
    if (!Number.isFinite(factor) || factor < .1 || factor > 10) throw new RangeError('Invalid scale');
    const bounds = this.bounds(); if (!bounds) return;
    const parts = this.rig.parts.filter(p => this.ids.includes(p.id));
    for (const p of parts) {
      const [a,b,c,d] = p.adjustment || identity();
      const size = Math.sqrt(a*d-b*c) * factor;
      if (size < .1 || size > 10) throw new RangeError('縮放範圍為原部件的 10% 到 1000%。');
    }
    this.transform(around(anchor || [bounds[0] + bounds[2] / 2, bounds[1] + bounds[3] / 2], 0, factor, factor));
  }
  rotate(degrees) {
    if (!Number.isFinite(degrees)) throw new RangeError('Invalid angle');
    const bounds = this.bounds(); if (!bounds) return;
    this.transform(around([bounds[0] + bounds[2] / 2, bounds[1] + bounds[3] / 2], degrees * Math.PI / 180));
  }
  reset(all = false) {
    const ids = new Set(all ? this.rig.parts.map(p => p.id) : this.ids);
    this.rig.parts.forEach((p, i) => {
      if (!ids.has(p.id)) return;
      const original = this.original.parts[i].adjustment;
      if (original) p.adjustment = [...original]; else delete p.adjustment;
    });
  }
  exportRig() { return structuredClone(this.rig); }
  importRig(candidate) {
    if (!candidate || candidate.format !== 'glitch2d.rig' || !Array.isArray(candidate.parts)) throw new Error('請選擇本工具匯出的角色設定。');
    // Key order is not part of the model: a corrected shape may arrive appended.
    const canonical = (key, value) => value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map(name => [name, value[name]])) : value;
    const stripped = rig => {
      const copy = structuredClone(rig);
      for (const p of copy.parts) delete p.adjustment;
      return JSON.stringify(copy, canonical);
    };
    let imported = candidate, replaced = [], recalibrated = [];
    if (stripped(candidate) !== stripped(this.original)) {
      // Art replacements keep edits to every unchanged part. A shared atlas
      // migrates as one unit; imported texture URLs are never used or loaded.
      imported = structuredClone(candidate);
      // Local shape corrections travel with the model, not with the user's edits.
      for (const [id, key] of [['torso', 'neck'], ['face', 'jaw']]) {
        const part = imported.parts.find(p => p.id === id), current = this.original.parts.find(p => p.id === id);
        if (!part || !current || JSON.stringify(part[key]) === JSON.stringify(current[key])) continue;
        if (current[key] === undefined) delete part[key]; else part[key] = structuredClone(current[key]);
        recalibrated.push(id);
      }
      const groups = [
        { texture: 'sleeveLeft', parts: ['arm-left'], nodes: ['arm-left'] },
        { texture: 'sleeveRight', parts: ['arm-right'], nodes: ['arm-right'] },
        { texture: 'skirt', parts: ['skirt'], nodes: [] },
        { texture: 'legs', parts: ['leg-left', 'leg-right'], nodes: ['leg-left', 'leg-right'] },
      ];
      const base = (rig, group) => JSON.stringify({
        texture: rig.textures?.[group.texture],
        parts: group.parts.map(id => {
          const part = structuredClone(rig.parts.find(p => p.id === id));
          if (part) delete part.adjustment;
          return part;
        }),
        nodes: group.nodes.map(id => rig.nodes?.find(n => n.id === id)),
      });
      for (const group of groups) {
        if (base(imported, group) === base(this.original, group)) continue;
        for (const [list, ids] of [['parts', group.parts], ['nodes', group.nodes]]) for (const id of ids) {
          const index = imported[list]?.findIndex(item => item.id === id) ?? -1;
          if (index < 0) throw new Error('這份設定的底模不同，請載入本工具匯出的設定。');
          imported[list][index] = structuredClone(this.original[list].find(item => item.id === id));
        }
        if (imported.textures) imported.textures[group.texture] = structuredClone(this.original.textures[group.texture]);
        replaced.push(...group.parts);
      }
      // Art fixes outside those groups (masks, chroma) also belong to the model.
      for (const [id, spec] of Object.entries(this.original.textures || {})) {
        if (!imported.textures || JSON.stringify(imported.textures[id]) === JSON.stringify(spec)) continue;
        imported.textures[id] = structuredClone(spec);
        if (!recalibrated.includes(id)) recalibrated.push(id);
      }
      if (stripped(imported) !== stripped(this.original)) throw new Error('這份設定的底模不同，請載入本工具匯出的設定。');
    }
    for (const p of imported.parts) if (p.adjustment !== undefined) {
      const m = p.adjustment;
      if (!Array.isArray(m) || m.length !== 6 || !m.every(n => Number.isFinite(n) && Math.abs(n) < 100000)) throw new Error('設定含有無效的部件位置。');
      const det = m[0] * m[3] - m[1] * m[2];
      if (det < .009999 || det > 100.001) throw new Error('設定含有超出範圍的部件大小。');
    }
    this.begin(); this.restore(imported.parts.map(p => p.adjustment || null)); this.commit();
    return { replaced, recalibrated };
  }
  get changed() {
    return this.rig.parts.filter((p, i) => JSON.stringify(p.adjustment || null) !== JSON.stringify(this.original.parts[i].adjustment || null)).length;
  }
}

// Anatomical guides follow the artwork, separately from motion-driving pivots.
export function skeleton(rig, pose = restPose()) {
  const definitions = {
    head: ['face', .5, .27], face: ['face', .5, .69], neck: ['torso', .5, .1], chest: ['torso', .5, .44], pelvis: ['torso', .5, .98],
    shoulderLeft: ['arm-left', 349 / 423, 12 / 617], elbowLeft: ['arm-left', .49, .46], wristLeft: ['arm-left', 108 / 423, 511 / 617],
    shoulderRight: ['arm-right', 78 / 386, 9 / 630], elbowRight: ['arm-right', .52, .45], wristRight: ['arm-right', 281 / 386, 513 / 630],
    hipLeft: ['leg-left', .5, .035], kneeLeft: ['leg-left', .5, .39], ankleLeft: ['leg-left', .5, .87],
    hipRight: ['leg-right', .5, .035], kneeRight: ['leg-right', .5, .39], ankleRight: ['leg-right', .5, .87],
  };
  const matrices = nodeMatrices(rig, pose), joints = {};
  for (const [id, [partId, defaultU, defaultV]] of Object.entries(definitions)) {
    const part = rig.parts.find(p => p.id === partId); if (!part) continue;
    const key = id.replace(/Left$|Right$/, '');
    const [u, v] = part.joints?.[key] || (key === 'wrist' && part.hand?.anchor) || [defaultU, defaultV];
    const [x, y, w, h] = part.rect;
    const local = deformPoint(part, x + w * u, y + h * v, pose, rig);
    const matrix = multiply(matrices[part.node || 'root'], part.adjustment || identity());
    joints[id] = point(matrix, ...local);
  }
  const chains = [
    ['head','face','neck','chest','pelvis'],
    ['neck','shoulderLeft','elbowLeft','wristLeft'], ['neck','shoulderRight','elbowRight','wristRight'],
    ['pelvis','hipLeft','kneeLeft','ankleLeft'], ['pelvis','hipRight','kneeRight','ankleRight'],
  ];
  return { joints, chains };
}
