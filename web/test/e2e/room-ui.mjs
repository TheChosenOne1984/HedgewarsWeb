// Two players in one room, driven only through the user interface (no state
// set by script): both see both teams with their own colours, colour changes
// and chat reach both sides, and the room master can start the game.
//
// Usage: node room-ui.mjs <site url> <screenshot dir>
// (the site's CSP forbids eval, so this uses page.evaluate, not waitForFunction)
import { chromium } from 'playwright';

const [siteUrl, outDir] = process.argv.slice(2);
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const problems = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) problems.push(what);
};

async function player(nick) {
  const page = await browser.newPage({
    viewport: { width: 1100, height: 900 },
    ignoreHTTPSErrors: true,
  });
  page.on('pageerror', (e) => problems.push(`${nick}: ${e}`));
  await page.goto(siteUrl);
  await page.waitForSelector('input[autocomplete=nickname]');
  await page.fill('input[autocomplete=nickname]', nick);
  await page.click('form button.primary');
  await page.waitForSelector('input[placeholder="New room name"]');
  return page;
}

/** what the room view shows: teams (name, colour) and chat lines */
const view = (page) =>
  page.evaluate(() => ({
    teams: [...document.querySelectorAll('.team')].map((e) => ({
      name: e.querySelector('b')?.textContent ?? '',
      colour: e.querySelector('.swatch')?.style.background ?? '',
    })),
    chat: [...document.querySelectorAll('.chat .log > div')].map((e) => e.textContent.trim()),
  }));

async function until(page, fn, what, timeout = 10000) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await view(page);
    if (fn(v)) return v;
    if (Date.now() > end) {
      check(false, `${what}: ${JSON.stringify(v)}`);
      return v;
    }
    await page.waitForTimeout(200);
  }
}

try {
  const alice = await player('alice');
  await alice.fill('input[placeholder="New room name"]', 'ui test');
  await alice.click('form button.primary');
  await alice.waitForSelector('.room');
  // (the test stack exempts the test host from the server's reconnect limit)
  const bob = await player('bob');
  await bob.waitForSelector('tr:has-text("ui test") button');
  await bob.click('tr:has-text("ui test") button');
  await bob.waitForSelector('.room');

  await alice.click('.add button');
  await alice.waitForTimeout(500);
  await bob.click('.add button');

  const twoColours = (v) => v.teams.length === 2 && v.teams[0].colour !== v.teams[1].colour;
  const a = await until(alice, twoColours, 'alice sees two teams in different colours');
  const b = await until(bob, twoColours, 'bob sees two teams in different colours');
  check(
    JSON.stringify(a.teams) === JSON.stringify(b.teams),
    `both see the same teams and colours (${JSON.stringify(a.teams)})`,
  );

  await alice.fill('.chat input', 'hello from alice');
  await alice.press('.chat input', 'Enter');
  await until(alice, (v) => v.chat.some((l) => l.includes('hello from alice')), 'own chat line');
  await until(bob, (v) => v.chat.some((l) => l.includes('hello from alice')), 'chat reaches bob');
  await bob.fill('.chat input', 'hi alice');
  await bob.press('.chat input', 'Enter');
  await until(alice, (v) => v.chat.some((l) => l.includes('hi alice')), 'chat reaches alice');
  await alice.locator('.chatbox').screenshot({ path: `${outDir}/room-ui-chat.png` });

  // room settings reach the other player; a new seed renders a new preview
  const preview = (p) =>
    p.evaluate(() => document.querySelector('.preview canvas')?.toDataURL() ?? '');
  const settled = async (p, old) => {
    for (let i = 0; i < 50; i++) {
      const now = await preview(p);
      if (now && now !== old) return now;
      await p.waitForTimeout(200);
    }
    return old;
  };
  const scheme = alice.locator('.settings select').first();
  await scheme.selectOption({ index: 3 });
  const schemeName = await scheme.evaluate((s) => s.value);
  const shown = async () => bob.evaluate(() => document.querySelector('.settings dd')?.textContent);
  for (let i = 0; i < 25 && (await shown()) !== schemeName; i++) await bob.waitForTimeout(200);
  check(
    (await shown()) === schemeName,
    `bob sees the scheme the room master chose (${schemeName})`,
  );
  const alicePreview = await settled(alice, '');
  const bobPreview = await settled(bob, '');
  check(alicePreview !== '' && alicePreview === bobPreview, 'both see the same map preview');
  await alice.click('.settings button');
  const alicePreview2 = await settled(alice, alicePreview);
  const bobPreview2 = await settled(bob, bobPreview);
  check(alicePreview2 !== alicePreview, 'a new map seed renders a new preview for the room master');
  check(
    bobPreview2 !== bobPreview && bobPreview2 === alicePreview2,
    'and the same new preview for bob',
  );

  // the room master changes the colour of bob's team
  const before = (await view(alice)).teams[1].colour;
  await alice.locator('.team').nth(1).locator('select').nth(1).selectOption({ index: 5 });
  await until(alice, (v) => v.teams[1]?.colour !== before, 'colour change shown to alice');
  await until(bob, (v) => v.teams[1]?.colour !== before, 'colour change reaches bob');

  // the room master leaves: bob takes over, alice and her team are gone, no error
  await alice.click('.bar button'); // leave room
  const bobState = () =>
    bob.evaluate(() => ({
      error: window.hedgewars.error,
      master: window.hedgewars.client.room?.isMaster,
      players: [...document.querySelectorAll('.room ul li')].map((e) => e.textContent.trim()),
      teams: document.querySelectorAll('.team').length,
    }));
  let st = await bobState();
  for (let i = 0; i < 25 && !(st.master && st.players.length === 1 && st.teams === 1); i++) {
    await bob.waitForTimeout(200);
    st = await bobState();
  }
  check(st.error === '', `no error for bob when the room master leaves (${st.error})`);
  check(
    !!st.master && st.players.length === 1 && st.teams === 1,
    `bob is the new room master, alone with his team (${JSON.stringify(st)})`,
  );

  // alice comes back; bob, now room master, starts the game
  await alice.waitForSelector('tr:has-text("ui test") button');
  await alice.click('tr:has-text("ui test") button');
  await alice.waitForSelector('.room');
  await alice.click('.add button');
  await until(bob, (v) => v.teams.length === 2, "alice's team is back");
  const bobScheme = await bob
    .locator('.settings select')
    .first()
    .evaluate((x) => x.value);
  check(bobScheme === schemeName, `the new room master keeps the room's scheme (${bobScheme})`);
  const aliceSees = await alice.evaluate(() => document.querySelector('.settings dd')?.textContent);
  check(aliceSees === schemeName, `a returning player sees the room's scheme (${aliceSees})`);
  await alice.click('.actions button:first-child'); // ready
  await bob.click('.actions button:first-child');
  await bob.waitForTimeout(500);
  await bob.click('.actions button.primary:last-child'); // start game
  const started = async (p) => {
    for (let i = 0; i < 50; i++) {
      if ((await p.evaluate(() => window.hedgewars.screen)) === 'game') return true;
      await p.waitForTimeout(200);
    }
    return false;
  };
  check(await started(bob), 'the new room master starts the game');
  check(await started(alice), 'the game starts for alice');
  await alice.waitForTimeout(5000);
  await alice.screenshot({ path: `${outDir}/room-ui-game.png` });
} catch (e) {
  problems.push(String(e));
}

await browser.close();
if (problems.length) console.log('problems:\n' + problems.join('\n'));
console.log(`room ui: ${problems.length ? 'FAIL' : 'PASS'}`);
process.exit(problems.length ? 1 : 0);
