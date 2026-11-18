// The old GitHub Pages address forwards to triptab.org (Build 3), keeping the rest of the link, so
// group and trip links shared before the move still open the same screen. Loads docs/app/index.html
// from disk; triptab.org is faked, so the check needs no network. Run: node e2e/forward-check.cjs
const path = require('path');
const { chromium } = require('playwright');

const FILE = 'file://' + path.join(__dirname, '..', '..', 'docs', 'app', 'index.html');
const CASES = [
  ['#/join/abc123?as=6f1c', 'https://triptab.org/join/abc123?as=6f1c'],
  ['#/trips/9e2a', 'https://triptab.org/trips/9e2a'],
  ['', 'https://triptab.org/'],
  ['#junk', 'https://triptab.org/'],
];

(async () => {
  const browser = await chromium.launch();
  const result = [];
  let failed = false;
  for (const [hash, want] of CASES) {
    const page = await (await browser.newContext()).newPage();
    await page.route('https://triptab.org/**', (r) => r.fulfill({ contentType: 'text/html', body: '<p>TripTab</p>' }));
    await page.goto(FILE + hash);
    await page.waitForURL(/^https:\/\/triptab\.org\//);
    const got = page.url();
    result.push({ from: hash || '(none)', to: got });
    if (got !== want) failed = true;
  }
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  if (failed) process.exit(1);
})();
