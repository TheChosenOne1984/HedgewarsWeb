// Smoke test of a deployed site (project_files/web/deploy): the page loads
// under its Content-Security-Policy, links to the source, connects to the
// game server through the /ws proxy and runs a local game.
//
// Usage: node deploy-smoke.mjs <site url> <screenshot dir>
import { chromium } from 'playwright';

const [siteUrl, outDir] = process.argv.slice(2);
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({
  viewport: { width: 1024, height: 700 },
  ignoreHTTPSErrors: true,
});
const log = [];
const problems = [];
page.on('console', (m) => {
  log.push(`[${m.type()}] ${m.text()}`);
  if (/Content Security Policy|Refused to/i.test(m.text())) problems.push(`CSP: ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.stack || e}`));

// page.waitForFunction evaluates its predicate with eval, which the CSP forbids
async function waitFor(fn, timeout) {
  const end = Date.now() + timeout;
  while (!(await page.evaluate(fn))) {
    if (Date.now() > end) throw new Error(`timeout waiting for ${fn}`);
    await page.waitForTimeout(250);
  }
}

function check(ok, what) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) problems.push(what);
}

try {
  await page.goto(siteUrl);
  await waitFor(() => !!window.hedgewars?.catalog, 30000);
  check(true, 'page and asset catalog loaded');

  const source = await page.$$eval('a', (as) =>
    as.map((a) => a.href).filter((h) => /github|source|git/i.test(h)),
  );
  check(source.length > 0, `source link (${source[0] ?? 'none'})`);

  await page.fill('input[autocomplete=nickname]', 'smoke');
  await page.click('button.primary');
  await waitFor(() => window.hedgewars.screen === 'lobby', 15000);
  check(true, 'connected to the lobby through /ws');
  await page.evaluate(() => window.hedgewars.client.disconnect());
  await page.evaluate(() => (window.hedgewars.screen = 'start'));

  // a local game of two AI teams
  await page.evaluate(() => {
    const app = window.hedgewars;
    app.teams = [
      { ...app.teams[1], name: 'Smoke A', difficulty: 3 },
      { ...app.teams[1], name: 'Smoke B', difficulty: 3 },
    ];
    app.screen = 'local';
  });
  await page.click('button.start');
  await waitFor(() => window.hedgewars.screen === 'game', 15000);
  await page.waitForTimeout(20000);
  const still = await page.evaluate(() => ({
    screen: window.hedgewars.screen,
    last: window.hedgewars.lastGame,
  }));
  check(
    still.screen === 'game' || still.last?.code === 0,
    `local game runs (${JSON.stringify(still)})`,
  );
  await page.screenshot({ path: `${outDir}/deploy-game.png` });
} catch (e) {
  problems.push(String(e));
}

await browser.close();
if (problems.length) {
  console.log(log.slice(-40).join('\n'));
  console.log('problems:\n' + problems.join('\n'));
  console.log('deploy smoke: FAIL');
  process.exit(1);
}
console.log('deploy smoke: PASS');
