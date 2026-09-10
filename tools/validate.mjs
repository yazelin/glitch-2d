import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildScene } from '../engine/geometry.js';
import { Motion } from '../engine/motion.js';

const root = new URL('../', import.meta.url);
const rigBase = new URL('character/glitch/', root);
const rig = JSON.parse(await readFile(new URL('rig.json', rigBase), 'utf8'));
assert.equal(rig.format, 'glitch2d.rig'); assert.equal(rig.version, 1);
assert(rig.size.length === 2 && rig.size.every(n => Number.isFinite(n) && n > 0));
const ids = new Set(); const dimensions = {};
for (const [id, spec] of Object.entries(rig.textures)) {
  assert(!spec.src.includes('..') && !spec.src.includes('://'), `Texture must be local: ${id}`);
  const png = await readFile(new URL(spec.src, rigBase));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  dimensions[id] = [png.readUInt32BE(16), png.readUInt32BE(20)];
  if (spec.chroma) assert(spec.chroma.length === 3 && spec.chroma.every(n => n >= 0 && n <= 255));
}
for (const node of rig.nodes) { assert(!ids.has(node.id)); ids.add(node.id); }
ids.clear();
for (const part of rig.parts) {
  assert(!ids.has(part.id), `Duplicate part: ${part.id}`); ids.add(part.id);
  assert(part.rect.length === 4 && part.rect.every(Number.isFinite));
  assert(part.rect[2] > 0 && part.rect[3] > 0);
  assert(part.uv.length === 4 && part.uv.every(Number.isFinite));
  const [w, h] = dimensions[part.texture] || [];
  const [u, v, uw, vh] = part.uv;
  assert(u >= 0 && v >= 0 && uw > 0 && vh > 0 && u + uw <= w && v + vh <= h, `UV outside atlas: ${part.id}`);
}
const motion = new Motion(() => .5);
for (const scene of [buildScene(rig, { ...motion.values, hair: 0 }), buildScene(rig, { ...motion.values, eyeOpen: 0, headZ: 1, hair: .7 })]) {
  for (const item of scene) assert(item.positions.every(Number.isFinite), `Invalid geometry: ${item.part.id}`);
}
const index = await readFile(new URL('index.html', root), 'utf8');
assert(index.includes('lang="zh-Hant"')); assert(index.includes('type="module"'));
assert(!/live2dcubismcore|pixi(?:\.min)?\.js|cubism4\.min/.test(index), 'Legacy runtime in new entry');
for (const match of index.matchAll(/(?:href|src)="([^"#?][^"]*)"/g)) {
  if (/^(?:https?:|data:)/.test(match[1])) continue;
  const path = match[1].split(/[?#]/)[0]; await access(new URL(path, root));
}
const checked = new Set();
async function checkModule(url) {
  if (checked.has(url.href)) return; checked.add(url.href);
  const source = await readFile(url, 'utf8');
  execFileSync(process.execPath, ['--check', fileURLToPath(url)]);
  assert(!/https?:\/\/.*(?:cdn|cubism|pixi)/i.test(source), `Remote runtime dependency: ${url.pathname}`);
  for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    assert(match[1].startsWith('.'), `Nonlocal runtime import: ${match[1]}`);
    await checkModule(new URL(match[1], url));
  }
}
await checkModule(new URL('studio.js', root));
await access(new URL('voice-intro.mp3', rigBase));
assert(index.includes('https://yazelin.github.io/glitch-l2d/character/glitch/social-card.png'));
console.log(`Validated ${rig.parts.length} parts, ${Object.keys(dimensions).length} local atlases, ${checked.size} native modules and entry links. No build output needed for GitHub Pages.`);
