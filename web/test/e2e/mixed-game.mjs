// End-to-end: two players in browsers (web client) and one desktop client
// (project_files/web/tools/desktop-bot.py with the native engine) play an
// online game together on the same server. Each adds an AI team.
//
// Runs in the Playwright image with host networking, see
// project_files/web/ci/mixed-game.sh.
// Usage: node mixed-game.mjs <dist dir> <ws url> <out dir> [minutes]

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const [distArg, wsUrl, outDir, minutesArg] = process.argv.slice(2);
const dist = path.resolve(distArg);
const minutes = Number(minutesArg || 15);
fs.mkdirSync(outDir, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.wasm': 'application/wasm', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const file = path.join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const target = fs.existsSync(file) && fs.statSync(file).isDirectory() ? path.join(file, 'index.html') : file;
  if (!target.startsWith(dist) || !fs.existsSync(target)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' });
  fs.createReadStream(target).pipe(res);
});
await new Promise((r) => server.listen(8090, r));

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

async function player(nick) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 700 } });
  const log = [];
  page.on('console', (m) => log.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => log.push(`[pageerror] ${e.stack || e}`));
  await page.goto(`http://localhost:8090/?server=${encodeURIComponent(wsUrl)}`);
  // init() has loaded settings, teams and the asset catalog
  await page.waitForFunction(() => !!window.hedgewars?.catalog);
  // an AI team with a unique name
  await page.evaluate((n) => {
    const app = window.hedgewars;
    app.teams = [{ ...app.teams[1], name: `${n} bots`, difficulty: 3 }];
  }, nick);
  await page.fill('input[autocomplete=nickname]', nick);
  await page.click('button.primary');
  try {
    await page.waitForFunction(() => window.hedgewars.screen === 'lobby');
  } catch (e) {
    console.log(log.join('\n'));
    console.log(await page.evaluate(() => JSON.stringify({ c: window.hedgewars.client.state, e: window.hedgewars.error })));
    throw e;
  }
  return { page, log, nick };
}

const state = (p) => p.page.evaluate(() => {
  const app = window.hedgewars;
  const room = app.client.room;
  return {
    screen: app.screen,
    teams: room ? room.teams.map((t) => `${t.name}/${t.owner}/${t.hedgehogsNumber}`) : [],
    ready: room ? room.players.map((n) => `${n}:${app.client.players.get(n)?.flags.has('r')}`) : [],
    lastGame: app.lastGame,
  };
});

const alice = await player('alice');
const bob = await player('bob');

await alice.page.fill('input[placeholder="New room name"]', 'mixed');
await alice.page.click('text=Create room');
await alice.page.waitForFunction(() => window.hedgewars.client.room?.isMaster);
await alice.page.click('text=Add team');

await bob.page.click('text=Refresh');
await bob.page.waitForSelector('tr:has-text("mixed") button');
await bob.page.click('tr:has-text("mixed") button');
await bob.page.waitForFunction(() => window.hedgewars.screen === 'room');
await bob.page.click('text=Add team');

// wait for the desktop client's team, then one hedgehog per team (shorter game)
await alice.page.waitForFunction(() => window.hedgewars.client.room.teams.length === 3, null, { timeout: 120000 });
await alice.page.evaluate(() => {
  const c = window.hedgewars.client;
  for (const t of c.room.teams) c.setHedgehogsNumber(t.name, 1);
});
for (const p of [alice, bob]) await p.page.click('button:has-text("Ready")');
await alice.page.waitForFunction(() => {
  const c = window.hedgewars.client;
  return c.room.players.length === 3 && c.room.players.every((n) => c.players.get(n)?.flags.has('r'));
}, null, { timeout: 60000 });
console.log('before start', JSON.stringify(await state(alice)));
await alice.page.click('text=Start game');

await Promise.all([alice, bob].map((p) => p.page.waitForFunction(() => window.hedgewars.screen === 'game')));
console.log('game running');
const deadline = Date.now() + minutes * 60000;
let shot = 0;
while (Date.now() < deadline) {
  await alice.page.waitForTimeout(20000);
  await alice.page.screenshot({ path: path.join(outDir, `alice-${String(shot).padStart(2, '0')}.png`) });
  await bob.page.screenshot({ path: path.join(outDir, `bob-${String(shot++).padStart(2, '0')}.png`) });
  const s = await Promise.all([state(alice), state(bob)]);
  if (s.every((x) => x.lastGame)) break;
}
const results = await Promise.all([state(alice), state(bob)]);
for (const p of [alice, bob]) fs.writeFileSync(path.join(outDir, `${p.nick}.log`), p.log.join('\n') + '\n');
console.log(JSON.stringify(results, null, 1));
const desync = [alice, bob].some((p) => p.log.some((l) => l.includes('Desync')));
const ok = results.every((r) => r.lastGame && r.lastGame.code === 0 && r.lastGame.finished) && !desync;
console.log(ok ? 'mixed game: PASS' : `mixed game: FAIL${desync ? ' (desync)' : ''}`);
await browser.close();
server.close();
process.exit(ok ? 0 : 1);
