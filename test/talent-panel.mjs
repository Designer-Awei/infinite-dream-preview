import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

const baseline = process.argv.includes('--baseline');
const out = path.resolve('tmp/talent-panel'); await mkdir(out, { recursive: true });
const browser = await chromium.launchPersistentContext(path.resolve('../.cache/talent-panel-browser'), {
  channel: 'chrome', headless: true, viewport: { width: 804, height: 360 }, deviceScaleFactor: 3,
  hasTouch: true, isMobile: true,
});
try {
  const p = await browser.newPage(), errors = [];
  await p.route('**/*', route => route.continue()); // Always test the current local sources, not the profile's HTTP cache.
  p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(() => localStorage.setItem('ai-girls-dungeon-v1', JSON.stringify({
    tutorialSeen: true, sel: 'gpt', chars: ['deepseek', 'gpt', 'grok', 'claude', 'doubao', 'glm'],
    seenUnlock: ['deepseek', 'gpt', 'grok', 'claude', 'doubao', 'glm'], sound: false, music: false,
    talents: { t_overclock: 1, u_echo: 1, u_links: 1 }, loadout: { gpt: ['t_overclock', null] },
  })));
  await p.goto('http://127.0.0.1:8775'); await p.waitForTimeout(2400);
  await p.evaluate(async () => {
    const S = await import('./js/save.js'), D = await import('./js/data.js');
    S.load().talents = Object.fromEntries(D.GACHA.pool.map(it => [it.id, it.max]));
  }); // Exercise the full passive list and owned SSR cards seen in the phone recording.
  const remember = () => p.evaluate(() => {
    window.__talentOriginal = {
      lobby: document.querySelector('.lb'), hero: document.querySelector('.lb-hero'),
      state: document.querySelector('.lb-hero').__anim,
      island: document.querySelector('.lb-island canvas'), info: document.querySelector('.lb-info'),
      head: document.querySelector('.li-head'), rays: document.querySelector('.lb-rays'),
    };
    window.__talentMutations = [];
    window.__talentObserver?.disconnect();
    window.__talentObserver = new MutationObserver(records => {
      for (const r of records) {
        if (r.type === 'childList') window.__talentMutations.push(r.target.className);
        else if (r.target.closest?.('.lb-hero') || r.target.matches?.('.lb-info')) window.__talentMutations.push(r.target.className + ':' + r.attributeName);
      }
    });
    window.__talentObserver.observe(document.querySelector('.lb'), { childList: true, attributes: true, subtree: true });
  });
  const state = () => p.evaluate(() => {
    const o = window.__talentOriginal;
    return {
      lobbySame: o.lobby === document.querySelector('.lb'),
      animationSame: o.state === document.querySelector('.lb-hero').__anim,
      islandSame: o.island === document.querySelector('.lb-island canvas'),
      headSame: o.head === document.querySelector('.li-head'),
      raysSame: o.rays === document.querySelector('.lb-rays'),
      mutations: window.__talentMutations,
    };
  });
  await remember();
  await p.locator('.li-kit').tap();
  const maskAnimation = await p.locator('.kit-modal').evaluate(n => getComputedStyle(n).animationName);
  const opened = await state();
  const panelAnimation = await p.locator('.kit-panel').evaluate(n => getComputedStyle(n).animationName);
  const tintFrames = await p.evaluate(async () => {
    const md = document.querySelector('.kit-modal'), frames = [];
    for (let i = 0; i < 15; i++) {
      frames.push({ background: getComputedStyle(md).backgroundColor, opacity: getComputedStyle(md).opacity });
      await new Promise(requestAnimationFrame);
    }
    return frames;
  });
  await p.locator('.kit-modal .x-btn').tap();
  await p.waitForTimeout(50);
  const closed = await state();
  console.log(JSON.stringify({ maskAnimation, panelAnimation, tintFrames, opened, closed }));
  if (baseline) {
    // Repeated entry creates multiple masks before the guard is added.
    await p.evaluate(async () => { const L = await import('./js/lobby.js'); L.showLoadout('gpt'); L.showLoadout('gpt'); });
    console.log('baseline modal count', await p.locator('.kit-modal').count());
  } else {
    assert.equal(maskAnimation, 'none', 'full-screen backdrop should not animate');
    assert.equal(panelAnimation, 'none', 'talent panel should not scale from 30% on entry');
    assert(opened.lobbySame && opened.animationSame && opened.islandSame && opened.headSame && opened.raysSame);
    assert.deepEqual(opened.mutations, [], 'opening must not mutate the lobby');
    assert(tintFrames.every(f => f.background === 'rgba(8, 4, 20, 0.62)' && f.opacity === '1'), 'stable tint from the first frame');
    await p.locator('.li-kit').tap();
    await p.screenshot({ path: path.join(out, '2412x1080-talents-open.png') });
    await p.locator('.kit-modal .x-btn').tap();
    for (const [width, height] of [[804, 360], [667, 375], [877, 393], [1280, 720]]) {
      await p.setViewportSize({ width, height });
      for (let i = 0; i < 5; i++) {
        await remember();
        await p.locator('.li-kit').tap();
        const opened = await state();
        assert(opened.animationSame && opened.islandSame && opened.headSame && opened.raysSame);
        assert.deepEqual(opened.mutations, []);
        await p.evaluate(async () => { (await import('./js/lobby.js')).showLoadout('gpt'); });
        assert.equal(await p.locator('.kit-modal').count(), 1, 'repeated opening stays one modal');
        if (i % 2) {
          // Tap the leftmost edge: the modal backdrop, outside the panel.
          await p.touchscreen.tap(2, height / 2);
        } else await p.locator('.kit-modal .x-btn').tap();
        assert.equal(await p.locator('.kit-modal').count(), 0);
      }
    }
    // Keep the existing close callback: changed equipment still appears in the lobby.
    await p.setViewportSize({ width: 804, height: 360 }); await remember();
    await p.locator('.li-kit').tap();
    await p.locator('.kcard[data-id="u_echo"]').tap();
    await p.locator('.kit-modal .x-btn').tap();
    const equipped = await p.evaluate(async () => (await import('./js/save.js')).loadoutOf('gpt'));
    assert(equipped.includes('u_echo'));
    assert.equal(await p.locator('.li-kit .ks.on').count(), equipped.filter(Boolean).length);
    await p.locator('.li-kit').tap();
    await p.locator('.kcard[data-id="u_echo"]').tap();
    await p.locator('.kit-modal .x-btn').tap();
    assert(!(await p.evaluate(async () => (await import('./js/save.js')).loadoutOf('gpt'))).includes('u_echo'));
    // Character switching should still rebuild the appropriate hero normally.
    await p.locator('.lb-roster .rcard').nth(0).tap(); await p.waitForTimeout(1300);
    assert.equal(await p.evaluate(() => document.querySelector('.lb-hero').__anim.id), 'deepseek');
    await p.locator('.li-kit').tap(); assert((await p.locator('.kit-head h2').innerText()).includes('大肥鱼'));
    await p.locator('.kit-modal .x-btn').tap();
    assert.deepEqual(errors, []);
    await p.screenshot({ path: path.join(out, '804-lobby-after-talents.png') });
    console.log('PASS repeated touch entry across four viewports; stable initial tint/panel; no lobby rebuild on opening; one mask; existing close, equip/unequip and character switching preserved');
  }
} finally { await browser.close(); }
