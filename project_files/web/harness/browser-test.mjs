// Headless browser smoke test of the harness: serve the staged site, start
// an AI-vs-AI game, check that the engine runs, and take screenshots.
// Runs in the Playwright image, see browser-test.sh.
//
// Usage: node browser-test.mjs <site dir> <out dir> [seconds]

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium, firefox } from 'playwright';

const [siteArg, outDir, secondsArg] = process.argv.slice(2);
const siteDir = path.resolve(siteArg);
const seconds = Number(secondsArg || 60);
fs.mkdirSync(outDir, { recursive: true });

const types = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.wasm': 'application/wasm', '.json': 'application/json', '.hwpack': 'application/octet-stream',
};
const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const file = path.join(siteDir, decodeURIComponent(url.pathname));
    if (!file.startsWith(siteDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end();
        return;
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(8080, resolve));

const browserName = process.env.BROWSER || 'chromium';
const browser = browserName === 'firefox'
    ? await firefox.launch({
        // headless Firefox has no GL in the container; run headed under xvfb-run
        headless: !process.env.DISPLAY,
        env: { ...process.env, LIBGL_ALWAYS_SOFTWARE: '1' },
        firefoxUserPrefs: {
            'webgl.force-enabled': true, 'webgl.out-of-process': false, 'gfx.webrender.software': true,
            'media.autoplay.default': 0,
        },
    })
    : await chromium.launch({
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
               '--autoplay-policy=no-user-gesture-required'],
    });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const consoleLines = [];
const errors = [];
page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => errors.push(e.stack || String(e)));

const query = process.env.HARNESS_QUERY || 'autostart=1&bots=1&nosound=1';
await page.goto(`http://localhost:8080/index.html?${query}`);

// frame timing: measure the longest gap between animation frames
await page.evaluate(() => {
    window.frameGaps = [];
    let last = performance.now();
    const tick = (t) => { window.frameGaps.push(t - last); last = t; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
});

// KEYTEST=1: hotseat input check, move the current hedgehog with the keyboard
if (process.env.KEYTEST) {
    await page.waitForTimeout(15000);
    await page.mouse.click(640, 500);
    await page.focus('#canvas');
    await page.screenshot({ path: path.join(outDir, 'key-before.png') });
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(2500);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.press('Enter'); // long jump
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(outDir, 'key-after.png') });
}

const start = Date.now();
let shot = 0;
while (Date.now() - start < seconds * 1000) {
    await page.waitForTimeout(10000);
    await page.screenshot({ path: path.join(outDir, `shot-${String(shot++).padStart(2, '0')}.png`) });
    if (shot === 3) await page.setViewportSize({ width: 1000, height: 640 }); // resize mid-game
    const exited = await page.evaluate(() => window.engineExitCode);
    if (exited !== undefined) break;
}

const result = await page.evaluate(() => {
    const gaps = window.frameGaps.slice(30).sort((a, b) => a - b);
    return {
        status: document.getElementById('status')?.textContent,
        exitCode: window.engineExitCode,
        frames: gaps.length,
        p50: gaps[Math.floor(gaps.length / 2)],
        p99: gaps[Math.floor(gaps.length * 0.99)],
        max: gaps[gaps.length - 1],
    };
});
fs.writeFileSync(path.join(outDir, 'console.txt'), consoleLines.join('\n') + '\n');
fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify({ ...result, errors }, null, 1));
console.log(JSON.stringify({ browser: browserName, ...result, errors: errors.length }, null, 1));
await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);
