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
      api.setView('bust'); await frames(3);
      const bust = api.getInfo().view;
      api.setView('full'); await frames(3);
      const full = api.getInfo().view;
      let rejectedView = false;
      try { api.setView('__proto__'); } catch (error) { rejectedView = error instanceof RangeError; }
      api.setParameters({ headX: .7, gazeX: -.8, eyeOpen: .3, mouthOpen: .6 });
      await frames(35);
      const posed = api.getParameters();
      api.setExpression('sleepy'); await frames(30);
      const sleepy = api.getParameters();
      // A wave has to reach full height, swing, and put the arm back down.
      api.gesture();
      // Clicking again mid-wave used to restart it from hanging, which reads as
      // the arm dropping and starting over. The second call must do nothing.
      await frames(30);
      const partway = api.getParameters().armRaise ?? 0;
      api.gesture();
      await frames(1);
      const interrupted = Math.abs((api.getParameters().armRaise ?? 0) - partway) > .15;
      for (let i = 0; i < 200; i++) await frames(1);
      api.gesture();
      const trail = [];
      for (let i = 0; i < 230; i++) { await frames(1); trail.push(api.getParameters()); }
      const wave = {
        peakRaise: Math.max(...trail.map(p => p.armRaise ?? 0)),
        endRaise: trail.at(-1).armRaise ?? 0,
        shoulderLeads: trail.slice(0, 24).some(p => (p.armRaise ?? 0) > (p.armFold ?? 0) + .05),
        overshoot: Math.max(...trail.map(p => p.armRaise ?? 0)),
        still: trail.every(p => (p.tilt ?? 0) === 0 && (p.arm ?? 0) === 0),
        arc: Math.max(...trail.map(p => Math.abs(p.lean ?? 0))),
        wrist: Math.max(...trail.map(p => Math.abs(p.handAngle ?? 0))),
        reversals: trail.reduce((count, p, i) => {
          if (i < 2) return count;
          const before = (trail[i - 1].armFold ?? 0) - (trail[i - 2].armFold ?? 0);
          const after = (p.armFold ?? 0) - (trail[i - 1].armFold ?? 0);
          return count + (before > 0 !== after > 0 ? 1 : 0);
        }, 0),
      };
      await frames(20);
      let peak = 0;
      if (mode === 'webgl') {
        await api.playAudio(new URL('character/glitch/voice-intro.mp3', location.href).href);
        for (let i = 0; i < 120; i++) { await frames(1); peak = Math.max(peak, api.getParameters().mouthOpen); }
        api.stopAudio(); await frames(40);
      }
      return { info: api.getInfo(), bust, full, rejectedView, posed, sleepy, wave, interrupted, peak, stopped: api.getParameters().mouthOpen, rigParts: api.exportRig().parts.length };
    }, mode);
    assert.equal(result.info.renderer, mode === 'webgl' ? 'WebGL' : 'Canvas 2D');
    assert.equal(result.info.graphicsError, 0);
    assert.equal(result.rigParts, 27);
    assert.equal(result.bust, 'bust'); assert.equal(result.full, 'full'); assert(result.rejectedView);
    assert(Math.abs(result.posed.headX - .7) < .03);
    assert(Math.abs(result.posed.gazeX + .8) < .03);
    assert(Math.abs(result.posed.eyeOpen - .3) < .03);
    assert(Math.abs(result.sleepy.eyeOpen - .5) < .03);
    assert(!result.interrupted, 'a second click restarted the wave instead of being ignored');
    assert(result.wave.peakRaise > .9, `wave never reached full height: ${result.wave.peakRaise}`);
    assert(result.wave.endRaise < .05, `arm did not come back down: ${result.wave.endRaise}`);
    assert(result.wave.reversals >= 3, `forearm did not swing: ${result.wave.reversals} reversals`);
    assert(result.wave.shoulderLeads, 'the shoulder did not lead the elbow on the way up');
    assert(result.wave.overshoot > 1.02, `the arm did not overshoot on arrival: ${result.wave.overshoot}`);
    assert(result.wave.still, 'parts that should stay still moved during the wave');
    assert(result.wave.arc > .1 && result.wave.arc < 1, `the body should take a small arc, got ${result.wave.arc}`);
    assert(result.wave.wrist > .5, `wrist stayed welded to the forearm: ${result.wave.wrist}`);
    if (mode === 'webgl') { assert(result.peak > .08, `Voice did not drive mouth: ${result.peak}`); assert(result.stopped < .02); }
    assert.deepEqual(errors, []); assert.deepEqual(failed, []);
    assert.deepEqual([...hosts], [new URL(base).host]);
    console.log(JSON.stringify({ mode, ...result, errors, failed, requestHosts: [...hosts] }, null, 2));
    await page.close();
  }
} finally { await browser.close(); localServer?.close(); }
