// Basic auth of a deployed site: the web client loads and its game
// connection (/ws) works in every browser engine once the user has entered
// the credentials (Playwright answers the browser's auth challenge).
//
// Usage: node deploy-auth.mjs <site url> <user> <password>
import { chromium, firefox, webkit } from 'playwright';

const [siteUrl, username, password] = process.argv.slice(2);
const engines = {
  chromium: () => chromium.launch(),
  firefox: () => firefox.launch(),
  webkit: () => webkit.launch(),
};

async function run(name) {
  const browser = await engines[name]();
  try {
    const page = await browser.newPage({
      ignoreHTTPSErrors: true,
      httpCredentials: { username, password },
    });
    await page.goto(siteUrl);
    await page.waitForSelector('input[autocomplete=nickname]', { timeout: 30000 });
    await page.fill('input[autocomplete=nickname]', `auth-${name}`);
    await page.click('form button.primary');
    for (let i = 0; i < 75; i++) {
      const s = await page.evaluate(() => ({
        screen: window.hedgewars.screen,
        error: window.hedgewars.error,
      }));
      if (s.screen === 'lobby') return { name, ok: true };
      if (s.error && !s.error.includes('Connecting again'))
        return { name, ok: false, why: s.error };
      await page.waitForTimeout(200);
    }
    return { name, ok: false, why: 'no lobby after 15 s' };
  } catch (e) {
    return { name, ok: false, why: String(e) };
  } finally {
    await browser.close();
  }
}

let failed = 0;
for (const name of Object.keys(engines)) {
  const r = await run(name);
  console.log(
    `${r.ok ? 'ok  ' : 'FAIL'} ${name}: page and lobby behind basic auth${r.why ? ` (${r.why})` : ''}`,
  );
  if (!r.ok) failed++;
}
console.log(`deploy auth: ${failed ? 'FAIL' : 'PASS'}`);
process.exit(failed ? 1 : 0);
