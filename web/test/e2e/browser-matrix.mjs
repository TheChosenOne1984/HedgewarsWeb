// Browser matrix: the web client (a built and staged web/dist) runs a local
// game of two AI teams in each browser engine Playwright has.
//
// Usage: node browser-matrix.mjs <dist dir> <out dir> [browser...]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium, firefox, webkit } from 'playwright';

const [distArg, outDir, ...names] = process.argv.slice(2);
const dist = path.resolve(distArg);
fs.mkdirSync(outDir, { recursive: true });
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.png': 'image/png',
};
const server = http
  .createServer((req, res) => {
    let file = path.join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file.startsWith(dist) || !fs.existsSync(file)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(8093);

const engines = {
  chromium: () =>
    chromium.launch({
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    }),
  firefox: () =>
    firefox.launch({
      headless: false,
      firefoxUserPrefs: { 'webgl.force-enabled': true, 'webgl.disabled': false },
    }),
  webkit: () => webkit.launch({ headless: false }),
};

async function run(name) {
  const browser = await engines[name]();
  const page = await browser.newPage({ viewport: { width: 1024, height: 700 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await page.goto('http://localhost:8093/');
    await page.waitForFunction(() => !!window.hedgewars?.catalog, null, { timeout: 30000 });
    await page.evaluate(() => {
      const app = window.hedgewars;
      app.teams = [
        { ...app.teams[1], name: 'Bots A', difficulty: 3 },
        { ...app.teams[1], name: 'Bots B', difficulty: 3 },
      ];
      app.screen = 'local';
    });
    await page.click('button.start');
    await page.waitForFunction(() => window.hedgewars.screen === 'game', null, { timeout: 15000 });
    // let the game load, then count frames for 10 s
    await page.waitForTimeout(10000);
    const fps = await page.evaluate(
      () =>
        new Promise((resolve) => {
          let frames = 0;
          const start = performance.now();
          const tick = () => {
            frames++;
            if (performance.now() - start < 10000) requestAnimationFrame(tick);
            else resolve(Math.round((frames * 1000) / (performance.now() - start)));
          };
          requestAnimationFrame(tick);
        }),
    );
    const state = await page.evaluate(() => ({
      screen: window.hedgewars.screen,
      lastGame: window.hedgewars.lastGame,
    }));
    await page.screenshot({ path: `${outDir}/${name}.png` });
    const ok = errors.length === 0 && (state.screen === 'game' || state.lastGame?.code === 0);
    return { name, ok, fps, state, errors };
  } catch (e) {
    return { name, ok: false, errors: [...errors, String(e)] };
  } finally {
    await browser.close();
  }
}

const results = [];
for (const name of names.length ? names : Object.keys(engines)) results.push(await run(name));
server.close();
for (const r of results)
  console.log(
    `${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.fps ? ` ${r.fps} fps` : ''}${r.errors.length ? ` ${r.errors.join(' | ')}` : ''}`,
  );
const failed = results.filter((r) => !r.ok).length;
console.log(`browser matrix: ${failed ? 'FAIL' : 'PASS'}`);
process.exit(failed ? 1 : 0);
