// Usage: node shot.cjs <url-path> <name> [waitSelector]
// Saves docs/screenshots/<name>-desktop.png (1280) and <name>-phone.png (390), reports console errors
// and horizontal overflow.
const { chromium } = require('playwright');
const path = require('path');
const [, , route, name, waitFor] = process.argv;
const out = path.join(__dirname, '..', '..', 'docs', 'screenshots');
(async () => {
  const b = await chromium.launch();
  for (const [label, vp, dsf] of [['desktop', { width: 1280, height: 800 }, 1], ['phone', { width: 390, height: 844 }, 2]]) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: dsf, isMobile: label === 'phone' });
    const p = await ctx.newPage();
    const errs = [];
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    p.on('pageerror', (e) => errs.push(String(e)));
    await p.goto('http://localhost:5173' + route, { waitUntil: 'networkidle' });
    if (waitFor) await p.waitForSelector(waitFor, { timeout: 15000 });
    await p.waitForTimeout(800);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await p.screenshot({ path: path.join(out, `${name}-${label}.jpg`), type: 'jpeg', quality: 80 });
    console.log(label, 'overflowX=', overflow, 'errors=', JSON.stringify(errs));
    await ctx.close();
  }
  await b.close();
})();
