// Tap targets on a phone (DESIGN.md: 44 px minimum; 11/23 review, item 9). Walks a trip at 390
// wide as its owner (itinerary, a plan's sheet, Money, Settle up, To do, People) and lists every
// visible button, link, field and tab shorter than 44 px. Text links inside a sentence count too.
// Run with `npm run dev` going. Exits 1 if anything is under 44.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

const scan = (page, where) => page.evaluate((where) => {
  const out = [];
  const seen = new Set();
  const root = document.querySelector('dialog[open]') ?? document.body;
  for (const el of root.querySelectorAll('button, a[href], input, select, textarea, [role="tab"], [role="radio"]')) {
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    // A checkbox or radio inside a label is tapped by its label's row.
    const row = (el.type === 'checkbox' || el.type === 'radio') ? el.closest('label') : null;
    const height = Math.round((row ?? el).getBoundingClientRect().height);
    if (height >= 44) continue;
    const name = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 40);
    // Day chips, slots and the like repeat: one line each kind.
    const key = `${name.replace(/\d+/g, '#')}|${height}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`${where}: ${height}px  ${name}`);
  }
  return out;
}, where);

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const small = [];
  try {
    const p = h.watch(await (await h.context(browser, h.PHONE)).newPage(), 'phone');
    await h.startSkiTrip(p, 'taps');
    small.push(...await scan(p, 'itinerary'));
    await h.addPlan(p, '2027-02-05', 'Add to evening', { title: 'Dinner at Le Cap', kind: 'Meal', status: 'Planned', est: '380' });
    await p.locator('#day-2027-02-05').getByText('Dinner at Le Cap').click();
    await h.dlg(p).getByLabel('What').waitFor();
    await h.openCost(h.dlg(p));
    small.push(...await scan(p, 'plan sheet'));
    await h.dlg(p).getByRole('button', { name: 'Confirm with the real cost' }).click();
    await h.dlg(p).getByLabel('What it cost').waitFor();
    small.push(...await scan(p, 'confirm'));
    await h.dlg(p).getByRole('button', { name: 'Confirm and log' }).click();
    await h.dlg(p).waitFor({ state: 'detached' });
    await p.getByRole('tab', { name: 'Money' }).click();
    small.push(...await scan(p, 'money'));
    await p.locator('section[aria-labelledby="money-title"]').getByRole('button', { name: 'Settle up' }).click();
    await h.dlg(p).getByText('The fewest payments').waitFor();
    small.push(...await scan(p, 'settle up'));
    await h.dlg(p).getByRole('button', { name: 'Done' }).click();
    await p.getByRole('tab', { name: 'To do' }).click();
    small.push(...await scan(p, 'to do'));
    await p.getByRole('tab', { name: /People/ }).click();
    await p.locator('section[aria-labelledby="people-title"]').getByRole('button', { name: 'Add', exact: true }).click();
    await h.dlg(p).getByLabel('Name').fill('Julia');
    await h.dlg(p).getByLabel('Email (optional)').fill('julia@example.com').catch(() => {});
    small.push(...await scan(p, 'add a person'));
    await h.dlg(p).getByRole('button', { name: 'Add to trip' }).click();
    await h.dlg(p).getByText('Added Julia').waitFor();
    await h.dlg(p).getByRole('button', { name: 'Done' }).click();
    small.push(...await scan(p, 'people'));
    await p.locator('section[aria-labelledby="link-title"]').getByRole('button', { name: 'Link settings' }).click();
    small.push(...await scan(p, 'link settings'));
  } catch (e) {
    small.push(`FAILED: ${String(e).slice(0, 300)}`);
  } finally {
    console.log(small.length ? small.join('\n') : 'Every tap target is 44 px or taller.');
    await browser.close();
    process.exit(small.length ? 1 : 0);
  }
})();
