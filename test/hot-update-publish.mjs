// Exercise the existing phone updater, with the pre-fix manifest and real Git bytes.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

const git = 'C:/Program Files/Git/cmd/git.exe';
const prior = '21382d3e35248ef049f6507a2d60d8472cd5eae0'; // Last release with CRLF hashes.
const blob = name => execFileSync(git, ['show', `${prior}:${name}`], { maxBuffer: 12e6 });
const oldManifest = JSON.parse(blob('docs/update.json'));
const fixed = JSON.parse(readFileSync('docs/update.json'));
let broken = false;
const serve = handler => new Promise(resolve => {
  const server = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const name = decodeURIComponent(new URL(req.url, 'http://local').pathname.slice(1));
    try { handler(name, res); } catch { res.writeHead(404); res.end(); }
  }).listen(0, '127.0.0.1', () => resolve(server));
});
const remote = await serve((name, res) => {
  if (name === 'update.json') return res.end(JSON.stringify(broken ? oldManifest : fixed));
  res.end(readFileSync(path.join('docs', name)));
});
const origin = s => `http://127.0.0.1:${s.address().port}/`;
const local = await serve((name, res) => {
  if (name === 'harness.html') {
    res.setHeader('Content-Type', 'text/html');
    return res.end('<div id="ui"></div><script type="module">import {initUpdater} from "./js/updater.js";initUpdater();</script>');
  }
  if (name === 'update.json') return res.end(JSON.stringify({ ...oldManifest, version: '20261105.0000-test' }));
  if (name.startsWith('js/')) {
    res.setHeader('Content-Type', 'text/javascript');
    return res.end(blob('web/' + name));
  }
  res.end(blob('docs/' + name));
});
mkdirSync('tmp/hot-update-publish', { recursive: true });
const browser = await chromium.launchPersistentContext(path.resolve('../.cache/updater-publish-browser'), {
  channel: 'chrome', headless: true, viewport: { width: 804, height: 360 },
});
try {
  const p = await browser.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.route('https://**/*', r => r.abort());
  await p.addInitScript(remoteURL => {
    localStorage.clear(); localStorage.setItem('updRemote', remoteURL);
    const files = {};
    window.__files = files; window.__switched = '';
    const FS = {
      readFile: async () => { throw Error('not downloaded'); },
      writeFile: async ({ path, data, encoding }) => { files[path] = { data, encoding }; },
      readdir: async () => ({ files: [] }),
      rmdir: async ({ path }) => { for (const key of Object.keys(files)) if (key.startsWith(path + '/')) delete files[key]; },
      getUri: async ({ path }) => ({ uri: 'file:///data/app/' + path }),
    };
    window.Capacitor = { isNativePlatform: () => true, Plugins: { Filesystem: FS, WebView: {
      getServerBasePath: async () => ({ path: 'public' }),
      setServerBasePath: async ({ path }) => { window.__switched = path; },
    } } };
  }, origin(remote));
  broken = true;
  await p.goto(origin(local) + 'harness.html');
  await p.waitForFunction(() => document.querySelector('.upd-t')?.textContent.includes('下载失败：manifest.webmanifest'));
  assert.equal(await p.evaluate(() => window.__switched), '');
  console.log('PASS reproduced old manifest.webmanifest failure; updater keeps original version');
  broken = false;
  await p.reload();
  await p.waitForFunction(() => !!window.__switched, { timeout: 30000 });
  const files = await p.evaluate(() => window.__files);
  const dir = 'hot/' + fixed.version + '/';
  for (const [name, expected] of Object.entries(fixed.files)) {
    const file = files[dir + name];
    assert(file, name + ' downloaded');
    const bytes = Buffer.from(file.data, file.encoding ? 'utf8' : 'base64');
    assert.equal(bytes.length, expected.s, name + ' size');
    assert.equal(createHash('sha1').update(bytes).digest('hex').slice(0, 12), expected.h, name + ' hash');
  }
  assert.equal(JSON.parse(files[dir + 'update.json'].data).version, fixed.version);
  assert.deepEqual(errors, []);
  console.log(`PASS old updater successfully applies fixed release: all ${Object.keys(fixed.files).length} files verified; no installer needed`);
} finally {
  await browser.close();
  await Promise.all([local, remote].map(server => new Promise(resolve => server.close(resolve))));
}
