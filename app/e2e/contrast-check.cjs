// Measures real text contrast over the photos and glass (WCAG ratio, 4.5:1 is the bar for small text).
// For each screen it hides the text, screenshots what sits behind it, and compares every text
// run's color with the pixels under it (the median, and the worst tenth, since photos vary).
// Run with the dev server up: node e2e/contrast-check.cjs            (prints anything under the bar)
//                             node e2e/contrast-check.cjs --all      (prints every text run)
const { chromium } = require('playwright');
const h = require('./helpers.cjs');
const ALL = process.argv.includes('--all');

const HIDE = '*,*::before,*::after{color:transparent !important;-webkit-text-fill-color:transparent !important;text-shadow:none !important;caret-color:transparent !important}';

let cards = 0;
async function measure(page, screen) {
  await page.waitForTimeout(600);
  // 1. Collect the text runs while the text is still painted.
  const runs = await page.evaluate(() => {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const top = document.querySelector('dialog[open]');
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent.trim();
      const el = n.parentElement;
      if (!text || !el || (top && !top.contains(el))) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
      if (el.closest('button:disabled, [aria-disabled="true"]')) continue; // disabled controls are exempt

      const range = document.createRange();
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      // Skip text that something else covers (a sticky bar, a dialog).
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit || !(el === hit || el.contains(hit) || hit.contains(el))) continue;
      let opacity = 1;
      for (let e = el; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
      out.push({
        text: text.slice(0, 40),
        color: cs.color,
        opacity,
        size: parseFloat(cs.fontSize),
        weight: Number(cs.fontWeight),
        card: Boolean(el.closest('.item-card')),
        cls: (el.className && el.className.baseVal === undefined ? String(el.className) : '').slice(0, 70),
        x: r.left, y: r.top, w: r.width, h: r.height,
      });
    }
    return out;
  });
  // 2. Hide the text and photograph what is behind it.
  const tag = await page.addStyleTag({ content: HIDE });
  await page.waitForTimeout(150);
  const png = (await page.screenshot({ type: 'png' })).toString('base64');
  await tag.evaluate((el) => el.remove());
  // 3. Compare, in the page (it has a canvas).
  const rows = await page.evaluate(async ({ png, runs }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${png}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const k = img.width / innerWidth;
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = (r, gg, b) => 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b);
    // Any CSS color (rgb, oklab, color-mix results) to straight RGBA, by painting one pixel.
    const one = document.createElement('canvas');
    one.width = one.height = 1;
    const og = one.getContext('2d', { willReadFrequently: true });
    const parse = (color) => {
      og.clearRect(0, 0, 1, 1);
      og.fillStyle = color;
      og.fillRect(0, 0, 1, 1);
      const [r, gg, b, a] = og.getImageData(0, 0, 1, 1).data;
      return [r, gg, b, a / 255];
    };
    return runs.map((t) => {
      const [r, gg, b, a0] = parse(t.color);
      const a = a0 * t.opacity;
      const x = Math.max(0, Math.floor(t.x * k)), y = Math.max(0, Math.floor(t.y * k));
      const w = Math.max(1, Math.min(c.width - x, Math.floor(t.w * k))), hh = Math.max(1, Math.min(c.height - y, Math.floor(t.h * k)));
      const d = g.getImageData(x, y, w, hh).data;
      const ratios = [];
      const step = Math.max(1, Math.floor((w * hh) / 400));
      for (let i = 0; i < w * hh; i += step) {
        const br = d[i * 4], bg = d[i * 4 + 1], bb = d[i * 4 + 2];
        const l1 = lum(r * a + br * (1 - a), gg * a + bg * (1 - a), b * a + bb * (1 - a));
        const l2 = lum(br, bg, bb);
        ratios.push((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05));
      }
      ratios.sort((p, q) => p - q);
      return { ...t, median: ratios[Math.floor(ratios.length / 2)], worst: ratios[Math.floor(ratios.length / 10)] };
    });
  }, { png, runs });
  // WCAG: 4.5:1, or 3:1 for large text (24px, or 18.66px bold). Plan cards are counted apart:
  // how Suggested and Planned look is on hold until the pod has tested it (11/17).
  const bar = (r) => (r.size >= 24 || (r.size >= 18.66 && r.weight >= 700) ? 3 : 4.5);
  const under = rows.filter((r) => r.median < bar(r));
  const low = under.filter((r) => !r.card);
  cards += under.length - low.length;
  console.log(`\n== ${screen}: ${rows.length} text runs, ${low.length} under the bar, plus ${under.length - low.length} on plan cards (left as they are)`);
  for (const r of ALL ? rows : under) {
    console.log(`  ${r.card ? 'card ' : ''}${r.median.toFixed(1)} (worst ${r.worst.toFixed(1)})  ${r.size}px/${r.weight}  "${r.text}"  ${r.color}${r.opacity < 1 ? ` x${r.opacity.toFixed(2)}` : ''}  [${r.cls}]`);
  }
  return low.length;
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  let low = 0;
  for (const [label, opts] of [['desktop', h.DESKTOP], ['phone', { ...h.PHONE, deviceScaleFactor: 1 }]]) {
    const p = h.watch(await (await h.context(browser, opts)).newPage(), label);
    await p.goto(`${h.BASE}/`);
    await p.getByRole('button', { name: 'Start a trip' }).first().waitFor();
    low += await measure(p, `${label}: landing`);
    await p.goto(`${h.BASE}/sign-in?next=/trips/new`);
    await h.withEmail(p);
    low += await measure(p, `${label}: create account`);
    await h.signUp(p, 'Mike', `contrast-${label}`);
    await p.waitForURL(/\/trips\/new/);
    await p.getByRole('button', { name: 'Fill in the ski trip example' }).click();
    low += await measure(p, `${label}: new trip`);
    await p.getByRole('button', { name: 'Start the trip' }).click();
    await p.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
    await h.addPlan(p, '2027-02-05', 'Add to morning', { title: 'Ski school', status: 'Suggested', est: '80' });
    await h.addPlan(p, '2027-02-05', 'Add to evening', { title: 'Fondue at La Caleche', kind: 'Meal', status: 'Planned', est: '40' });
    await p.evaluate(() => window.scrollTo(0, 0));
    low += await measure(p, `${label}: trip, top`);
    await p.locator('#day-2027-02-05').scrollIntoViewIfNeeded();
    await p.evaluate(() => document.getElementById('day-2027-02-05').scrollIntoView({ block: 'start' }));
    low += await measure(p, `${label}: trip, a day`);
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    low += await measure(p, `${label}: trip, bottom`);
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.getByRole('radio', { name: 'Week' }).click();
    await p.getByRole('region', { name: 'Week view' }).waitFor();
    low += await measure(p, `${label}: week view`);
    await p.getByRole('radio', { name: 'Day' }).click();
    // Dialogs: add a plan (dark dialog) and, on phones, the other tabs.
    await h.showDay(p, '2027-02-05');
    await p.locator('#day-2027-02-05').getByRole('button', { name: 'Add to day' }).click();
    low += await measure(p, `${label}: add a plan dialog`);
    await h.dlg(p).getByRole('button', { name: 'Close' }).click();
    if (label === 'phone') {
      for (const t of ['Money', 'To do', 'People']) {
        await p.getByRole('tab', { name: new RegExp(t) }).click();
        await p.evaluate(() => window.scrollTo(0, 0));
        low += await measure(p, `${label}: ${t} tab`);
      }
    }
    await p.goto(`${h.BASE}/trips`);
    await p.getByText('Euro ski trip').first().waitFor();
    low += await measure(p, `${label}: my trips`);
  }
  console.log(`\nTotal under the bar (4.5:1, or 3:1 for large text): ${low}; on plan cards, left as they are: ${cards}`);
  console.log('errors:', JSON.stringify(h.errors));
  await browser.close();
})().catch((e) => {
  console.error('CHECK FAILED:', e.message.split('\n')[0]);
  process.exit(1);
});
