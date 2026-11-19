// Makes public/og.jpg, the picture a TripTab link shows when it's pasted into iMessage, WhatsApp or
// Slack (Mike's 11/19 review: a group link in iMessage had no image). 1200 by 630, the size those
// apps expect. The landing page's photo and type, so the preview looks like the app.
// Run it again after a change to the look: node scripts/make-og-image.cjs
const path = require('path');
const { chromium } = require('playwright');

const PHOTO = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1400&q=80&auto=format&fit=crop';

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600&family=Playfair+Display:ital,wght@1,700&display=swap" rel="stylesheet">
<style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
  body { background: #181825 url('${PHOTO}') center / cover no-repeat; font-family: 'DM Sans', sans-serif; }
  .shade { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(0,0,0,0.30), rgba(0,0,0,0.55)); }
  .card { position: absolute; left: 72px; right: 72px; bottom: 72px; padding: 44px 52px; border-radius: 36px;
          background: rgba(249,248,245,0.92); box-shadow: 0 24px 60px rgba(0,0,0,0.25); }
  .brand { font: italic 700 76px/1 'Playfair Display', serif; color: #181825; margin: 0; }
  .line { margin: 18px 0 0; font-size: 34px; color: #181825; }
  .tag { margin: 22px 0 0; font-size: 24px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: #8c7054; }
</style></head><body>
  <div class="shade"></div>
  <div class="card">
    <p class="brand">TripTab</p>
    <p class="line">One place for the group trip's plans, and who paid what.</p>
    <p class="tag">Plan it · Split it · Live it</p>
  </div>
</body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const out = path.join(__dirname, '..', 'public', 'og.jpg');
  await page.screenshot({ path: out, type: 'jpeg', quality: 85 });
  await browser.close();
  console.log('wrote', out);
})();
