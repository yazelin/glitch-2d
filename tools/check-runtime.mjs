// Runtime API check only: no screenshots, DOM inspection, UI automation or visual assertions.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { once } from 'node:events';
let localServer;
if (!process.env.GLITCH_TEST_URL) {
  process.env.GLITCH_PORT = '0';
  localServer = (await import('./serve.mjs')).server;
  if (!localServer.listening) await once(localServer, 'listening');
}
const base = process.env.GLITCH_TEST_URL || `http://127.0.0.1:${localServer.address().port}/`;
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
try {
  for (const mode of ['webgl', 'canvas']) {
    const page = await browser.newPage();
    const errors = [], failed = [], hosts = new Set();
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => failed.push(request.url()));
    page.on('request', request => { if (request.url().startsWith('http')) hosts.add(new URL(request.url()).host); });
    await page.goto(base + (mode === 'canvas' ? '?renderer=canvas' : ''), { waitUntil: 'load' });
    const result = await page.evaluate(async mode => {
      const api = await window.Glitch2D.ready;
      const frames = async count => { for (let i = 0; i < count; i++) await new Promise(requestAnimationFrame); };
      api.setIdle(false); api.setFollow(false);
      api.setParameters({ headX: .7, gazeX: -.8, eyeOpen: .3, mouthOpen: .6 });
      await frames(35);
      const posed = api.getParameters();
      api.setExpression('sleepy'); await frames(30);
      const sleepy = api.getParameters();
      let peak = 0;
      if (mode === 'webgl') {
        await api.playAudio(new URL('character/glitch/voice-intro.mp3', location.href).href);
        for (let i = 0; i < 120; i++) { await frames(1); peak = Math.max(peak, api.getParameters().mouthOpen); }
        api.stopAudio(); await frames(40);
      }
      return { info: api.getInfo(), posed, sleepy, peak, stopped: api.getParameters().mouthOpen, rigParts: api.exportRig().parts.length };
    }, mode);
    assert.equal(result.info.renderer, mode === 'webgl' ? 'WebGL' : 'Canvas 2D');
    assert.equal(result.info.graphicsError, 0);
    assert.equal(result.rigParts, 18);
    assert(Math.abs(result.posed.headX - .7) < .03);
    assert(Math.abs(result.posed.gazeX + .8) < .03);
    assert(Math.abs(result.posed.eyeOpen - .3) < .03);
    assert(Math.abs(result.sleepy.eyeOpen - .5) < .03);
    if (mode === 'webgl') { assert(result.peak > .08, `Voice did not drive mouth: ${result.peak}`); assert(result.stopped < .02); }
    assert.deepEqual(errors, []); assert.deepEqual(failed, []);
    assert.deepEqual([...hosts], [new URL(base).host]);
    console.log(JSON.stringify({ mode, ...result, errors, failed, requestHosts: [...hosts] }, null, 2));
    await page.close();
  }
} finally { await browser.close(); localServer?.close(); }
