// Checks that the app sends the Build 2 PostHog events, without sending anything to PostHog.
// Start a dev server with a dummy key first:
//   VITE_POSTHOG_KEY=phc_dummy_local_check npx vite --port 5174
// then: node e2e/posthog-check.cjs
// PostHog's ingestion calls are intercepted and answered locally; the event names are decoded
// from the request bodies and printed.
const { chromium } = require('playwright');
const zlib = require('zlib');

const BASE = 'http://localhost:5174';
const run = Math.random().toString(36).slice(2, 7);
const events = [];

function decode(req) {
  const buf = req.postDataBuffer();
  if (!buf) return [];
  let text;
  try {
    text = zlib.gunzipSync(buf).toString();
  } catch {
    text = buf.toString();
    if (text.startsWith('data=')) text = Buffer.from(decodeURIComponent(text.slice(5)), 'base64').toString();
  }
  try {
    const body = JSON.parse(text);
    const list = Array.isArray(body) ? body : body.batch ?? [body];
    return list.map((e) => e.event).filter(Boolean);
  } catch {
    return [];
  }
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  // PostHog drops events from user agents that look like bots, which includes headless Chromium,
  // so this check presents a normal desktop Chrome user agent.
  const page = await (
    await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    })
  ).newPage();
  // Headless Chromium also reports navigator.webdriver; present it as a normal browser for this check only.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'userAgentData', {
      get: () => ({ brands: [{ brand: 'Google Chrome', version: '131' }], mobile: false, platform: 'Windows' }),
    });
  });
  page.on('console', (m) => { if (/PostHog/.test(m.text())) console.log('CONSOLE', m.text().slice(0, 160)); });
  await page.route(/posthog\.com/, async (route) => {
    const req = route.request();
    const url = req.url();
    if (/\/(e|i\/v0\/e|batch|capture|s)\/?(\?|$)/.test(new URL(url).pathname + '?')) {
      events.push(...decode(req));
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":1}' });
    }
    if (/flags|decide|config/.test(url)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"featureFlags":{},"sessionRecording":false}' });
    }
    return route.continue();
  });

  await page.goto(`${BASE}/`);
  await page.getByRole('button', { name: 'Start a trip' }).click();
  await page.getByLabel('Your name').fill('Mike');
  await page.getByLabel('Email').fill(`demo-${run}-ph@example.com`);
  await page.getByLabel('Password').fill(`demo-${run}-Passw0rd`);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/\/trips\/new/);
  await page.getByRole('button', { name: 'Fill in the ski trip example' }).click();
  await page.getByRole('button', { name: 'Start the trip' }).click();
  await page.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  await page.locator('#day-2027-02-06').getByRole('button', { name: 'Add to morning' }).click();
  await page.locator('dialog[open]').getByLabel('What').fill('Ski school');
  await page.locator('dialog[open]').getByRole('button', { name: 'Add to trip' }).click();
  await page.locator('#day-2027-02-06').getByText('Ski school').waitFor();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.locator('dialog[open]').getByLabel('Name').fill('Vic');
  await page.locator('dialog[open]').getByRole('button', { name: 'Add to trip' }).click();
  await page.locator('dialog[open]').getByText('Added Vic').waitFor();
  // Let PostHog flush its queue.
  await page.waitForTimeout(6000);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
  await page.waitForTimeout(1500);

  const counts = events.reduce((m, e) => ({ ...m, [e]: (m[e] ?? 0) + 1 }), {});
  console.log(JSON.stringify(counts, null, 2));
  const need = ['trip created', 'person added', 'plan added', '$pageview'];
  const missing = need.filter((e) => !counts[e]);
  console.log(missing.length ? `MISSING: ${missing.join(', ')}` : 'All Build 2 events sent.');
  await browser.close();
  process.exit(missing.length ? 1 : 0);
})();
