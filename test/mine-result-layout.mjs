import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

const out = path.resolve('tmp/mine-result-layout');
await mkdir(out, { recursive: true });
const browser = await chromium.launchPersistentContext(path.resolve('../.cache/mine-result-browser'), {
  channel: 'chrome', headless: true, viewport: { width: 804, height: 360 },
  deviceScaleFactor: 3, hasTouch: true, isMobile: true,
});
await browser.route('**/*', route => route.continue());
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('ai-girls-dungeon-v1', JSON.stringify({
    tutorialSeen: true, chars: ['deepseek', 'gpt', 'grok'], sel: 'gpt',
    seenUnlock: ['deepseek', 'gpt', 'grok'], sound: false, music: false,
  })));
  await page.goto('http://127.0.0.1:8775');
  await page.locator('.play-btn').waitFor();
  await page.evaluate(() => document.fonts.ready);
  for (const [width, height] of [[804, 360], [667, 375], [877, 393], [1280, 720]]) {
    await page.setViewportSize({ width, height });
    for (const count of [0, 1, 2, 11]) {
      for (const how of ['extract', 'timeup', 'power', 'dead']) {
        await page.evaluate(async ({ count, how }) => {
          const UI = await import('./js/ui.js'), M = await import('./js/mineui.js');
          const { ORES, RELICS } = await import('./js/minedata.js');
          UI.clear();
          // Include both four-character names even in the smallest sample.
          const ids = ['rune', 'gear', ...Object.keys(ORES).filter(id => !['rune', 'gear'].includes(id))].slice(0, count);
          const kept = ids.flatMap((id, i) => Array(i ? 25 : 26).fill(id));
          const res = {
            cid: 'grok', how, kept, value: 1024, mats: 460, stars: count ? 437 : 0,
            starsFound: count ? (['dead', 'power'].includes(how) ? 450 : 437) : 0,
            depth: 121, dug: 303, kills: 10, lost: how === 'dead' ? 100 : 0,
            record: true, characterXP: { gained: 87, after: { level: 1 } },
            questsDone: count === 11 ? ['安全撤离 3 次', '击败 10 只怪物', '一次带出价值 70 晶石以上'] : [],
            relics: count === 11 ? Object.fromEntries(Object.keys(RELICS).map(id => [id, 1])) : {},
          };
          M.showMineResult(res, how === 'dead' ? null : () => window.mineAction = 'again', () => window.mineAction = 'back');
        }, { count, how });
        await page.waitForTimeout(600);
        const layout = await page.evaluate(() => {
          const panel = document.querySelector('.res2'), left = panel.querySelector('.res-l');
          const rect = panel.getBoundingClientRect(), body = panel.querySelector('.mres-body');
          const cards = [...panel.querySelectorAll('.mri')];
          return {
            height: rect.height, hero: panel.querySelector('.res-hero').getBoundingClientRect().height,
            portrait: panel.querySelector('.res-hero img').getAttribute('src'),
            leftOverflow: left.scrollHeight - left.clientHeight, bodyOverflowX: body.scrollWidth - body.clientWidth,
            chips: panel.querySelectorAll('.res-extras .res-chip').length,
            cards: cards.length, single: panel.querySelector('.mres-items').classList.contains('single'),
            intact: cards.every(card => {
              const img = card.querySelector('img').getBoundingClientRect(), label = card.querySelector('span'),
                name = label.getBoundingClientRect(), n = card.querySelector('b').getBoundingClientRect(), c = card.getBoundingClientRect();
              const range = document.createRange(); range.selectNodeContents(label);
              return range.getClientRects().length === 1 && img.right <= name.left && name.right <= n.left && n.right <= c.right - 3;
            }),
            buttons: [...panel.querySelectorAll('.acts .btn')].every(b => {
              const r = b.getBoundingClientRect(); return r.bottom <= rect.bottom - 4 && r.top >= rect.top && r.right <= rect.right - 4;
            }),
          };
        });
        assert(Math.abs(layout.height - Math.min(460, height * .8)) < 1);
        assert.equal(layout.hero, height <= 420 ? 110 : 150);
        assert.equal(layout.portrait, 'assets/hero_grok.png');
        assert(layout.leftOverflow <= 1, JSON.stringify({ width, height, count, how, layout }));
        assert(layout.bodyOverflowX <= 1); assert(layout.intact); assert(layout.buttons);
        assert.equal(layout.cards, count); assert.equal(layout.single, count === 1);
        assert.equal(layout.chips, count ? 2 : 1);
        if (count) {
          await page.locator('.mri').last().scrollIntoViewIfNeeded();
          assert(await page.locator('.mri').last().evaluate(n => {
            const r = n.getBoundingClientRect(), b = n.closest('.mres-body').getBoundingClientRect(); return r.top >= b.top - 1 && r.bottom <= b.bottom + 1;
          }));
          await page.locator('.mres-body').evaluate(n => n.scrollTop = 0);
        }
        if (width === 804 && how === 'extract') await page.screenshot({ path: path.join(out, `materials-${count}.png`) });
        if (how !== 'dead') { await page.getByRole('button', { name: '再次下潜', exact: true }).click(); assert.equal(await page.evaluate(() => window.mineAction), 'again'); }
        await page.getByRole('button', { name: how === 'dead' ? '继续' : '返回矿场', exact: true }).click();
        assert.equal(await page.evaluate(() => window.mineAction), 'back');
      }
    }
    console.log('PASS mine results', width, height, '0/1/2/11 materials × four end states');
  }
  // The live dive character wins over any changed lobby selection.
  await page.setViewportSize({ width: 804, height: 360 });
  await page.evaluate(async () => {
    const S = await import('./js/save.js'); S.load().sel = 'grok'; S.mineState().shovels.cu = 2;
    __app.startDive({ shovel: 'cu' }); S.load().sel = 'gpt';
    __app.dive.bag.push('rune', 'gear'); __app.dive.finish('extract');
  });
  await page.locator('.mres').waitFor();
  assert.equal(await page.locator('.res-hero img').getAttribute('src'), 'assets/hero_grok.png');
  assert.equal(await page.locator('.mri').count(), 2);
  await page.getByRole('button', { name: '返回矿场', exact: true }).click();
  await page.locator('.mine-hub').waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS actual dive settlement and return to hub; no page errors');
} finally { await browser.close(); }
