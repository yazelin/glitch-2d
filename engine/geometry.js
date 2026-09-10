import { clamp } from './motion.js';

export const identity = () => [1, 0, 0, 1, 0, 0];
export function multiply(a, b) {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1],
    a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
    a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}
export const point = (m, x, y) => [m[0]*x+m[2]*y+m[4], m[1]*x+m[3]*y+m[5]];
export function around([x, y], angle = 0, sx = 1, sy = 1, tx = 0, ty = 0) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [c*sx, s*sx, -s*sy, c*sy, x-c*sx*x+s*sy*y+tx, y-s*sx*x-c*sy*y+ty];
}

export function nodeMatrices(rig, pose) {
  const matrices = { root: identity() };
  const visiting = new Set();
  const byId = new Map(rig.nodes.map(node => [node.id, node]));
  function resolve(id) {
    if (matrices[id]) return matrices[id];
    if (visiting.has(id)) throw new Error(`Rig node cycle: ${id}`);
    const node = byId.get(id);
    if (!node) throw new Error(`Missing rig node: ${id}`);
    visiting.add(id);
    let angle = 0, sx = 1, sy = 1, tx = 0, ty = 0;
    if (node.drive === 'body') {
      angle = pose.headZ * .012;
      sy = 1 + pose.breath * .006;
      ty = -pose.breath * 1.5;
    }
    if (node.drive === 'head') {
      angle = pose.headZ * .105;
      sx = 1 - Math.abs(pose.headX) * .025;
      tx = pose.headX * 12;
      ty = pose.headY * 6;
    }
    if (node.drive === 'arm') angle = pose.arm * .09 * (node.side || 1);
    tx += node.offset?.[0] || 0;
    ty += node.offset?.[1] || 0;
    matrices[id] = multiply(resolve(node.parent || 'root'), around(node.pivot, angle, sx, sy, tx, ty));
    visiting.delete(id);
    return matrices[id];
  }
  for (const node of rig.nodes) resolve(node.id);
  return matrices;
}

export function deformPoint(part, x, y, pose, rig, explode = 0) {
  const [rx, ry, w, h] = part.rect;
  const cx = rx + w / 2, cy = ry + h / 2;
  const type = part.type || 'sprite';
  if (part.neck && Math.abs(x - part.neck.center) < 80 && y < part.neck.bottom) {
    const weight = clamp((part.neck.bottom - y) / (part.neck.bottom - part.neck.top), 0, 1);
    x = part.neck.center + (x - part.neck.center) * (1 - weight * part.neck.pinch);
    y -= weight * (part.neck.extend || 0);
  }
  if (type === 'hair') {
    const weight = clamp((y - ry) / h, 0, 1);
    x += pose.hair * (part.sway ?? 16) * weight * weight;
  }
  if (type === 'eye' || type === 'lash') {
    y = cy + (y - cy) * Math.max(.025, pose.eyeOpen);
  }
  if (type === 'iris') {
    x += pose.gazeX * (part.travel?.[0] ?? 9);
    y += pose.gazeY * (part.travel?.[1] ?? 5);
  }
  if (type === 'brow') {
    y -= pose.brow * 9;
    y += (x - cx) / w * pose.brow * 9 * (part.side || 1);
  }
  if (type === 'mouth') {
    y = cy + (y - cy) * (.15 + .85 * pose.mouthOpen);
    x = cx + (x - cx) * (1 + pose.mouthWide * .18);
  }
  if (type === 'lip') {
    y -= pose.smile * 3 * Math.pow((x - cx) / (w / 2), 2);
  }
  if (part.face) {
    x += pose.headX * (part.depth ?? 9);
    y += pose.headY * (part.depth ?? 9) * .3;
  }
  const shift = part.explode || [0, 0];
  return [x + shift[0] * explode, y + shift[1] * explode];
}

export function partOpacity(part, pose) {
  if (part.visible === false) return 0;
  if (part.type === 'mouth') return clamp(pose.mouthOpen / .12, 0, 1);
  if (part.type === 'lip') return 1 - clamp(pose.mouthOpen / .12, 0, 1);
  if (part.type === 'closed-eye') return 1 - clamp(pose.eyeOpen / .16, 0, 1);
  if (part.type === 'eye' || part.type === 'iris' || part.type === 'lash') return clamp(pose.eyeOpen / .09, 0, 1);
  if (part.type === 'blush') return clamp(pose.smile, 0, 1) * .4;
  return part.opacity ?? 1;
}

export function buildScene(rig, pose, { explode = 0, hidden = new Set() } = {}) {
  const matrices = nodeMatrices(rig, pose);
  const displayPose = { ...pose, eyeOpen: pose.eyeOpen + (1 - pose.eyeOpen) * explode, mouthOpen: pose.mouthOpen + (1 - pose.mouthOpen) * explode };
  return rig.parts.filter(part => !hidden.has(part.id)).map(part => {
    const baseOpacity = partOpacity(part, pose);
    const opacity = part.visible === false ? 0 : baseOpacity + (1 - baseOpacity) * explode;
    const matrix = matrices[part.node || 'root'];
    if (!matrix) throw new Error(`Missing node for ${part.id}`);
    const [x, y, w, h] = part.rect;
    const [u, v, uw, vh] = part.uv;
    const columns = part.mesh?.[0] || 4, rows = part.mesh?.[1] || 6;
    const positions = [], texcoords = [], indices = [];
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) {
      const a = i / columns, b = j / rows;
      const local = deformPoint(part, x + w * a, y + h * b, displayPose, rig, explode);
      positions.push(...point(matrix, ...local));
      texcoords.push(u + uw * a, v + vh * b);
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
      const a = j * (columns + 1) + i, b = a + columns + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
    // Eye aperture shares the exact head/face transforms with the iris.
    let clip = null;
    if (part.clip) {
      const [ex, ey, ew, eh] = part.clip;
      const cx = ex + ew / 2 + (part.face ? pose.headX * (part.depth ?? 9) : 0);
      const cy = ey + eh / 2 + (part.face ? pose.headY * (part.depth ?? 9) * .3 : 0);
      const shift = part.explode || [0, 0];
      clip = { center: point(matrix, cx + shift[0] * explode, cy + shift[1] * explode),
        axisX: [matrix[0] * ew / 2, matrix[1] * ew / 2],
        axisY: [matrix[2] * eh / 2 * Math.max(.01, displayPose.eyeOpen), matrix[3] * eh / 2 * Math.max(.01, displayPose.eyeOpen)] };
    }
    return { part, positions, texcoords, indices, opacity, clip };
  });
}

export function fitView(width, height, rig, explode = 0) {
  const [rw, rh] = rig.size;
  const scale = Math.min(width / rw, height / rh) * (1 - explode * .22);
  return { scale, x: (width - rw * scale) / 2, y: (height - rh * scale) / 2 };
}
