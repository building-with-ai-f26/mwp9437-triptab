// T6 (Mike's 11/23 ski trip test, restated 11/24; journal/pm-review/spec-11-23.md): repeat a plan on
// several days as separate plans. At 1280 and 390 wide, against TripTab dev; made-up plans.
// - Add a ski day on Sat 2/6 and tick six more days in More days: seven full cards, one per day.
//   Changing day 3's place leaves the others alone; deleting day 5 leaves six.
// - Three days not in a row (Fri 2/5, Sun 2/7, Wed 2/10) give cards on just those days.
// - An old seven-day plan (made the way the app used to, through the API) splits into seven plans
//   with Split into separate days; the original goes, and Julia's opt-out carries over to each day.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n')
    .map((l) => l.match(/^(VITE_[A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]),
);
const tokenOf = (p) =>
  p.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => /^sb-.*-auth-token$/.test(x));
    return JSON.parse(localStorage.getItem(k)).access_token;
  });
async function rest(p, method, table, body) {
  const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${table}`, {
    method,
    headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${await tokenOf(p)}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

const WEEK = ['2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09', '2027-02-10', '2027-02-11', '2027-02-12'];
const first = (p, day, title) => p.locator(`#day-${day} .item-card:not([data-continued="true"])`).filter({ hasText: title });
const daysWith = async (p, title, days) => {
  const out = [];
  for (const d of days) if ((await first(p, d, title).count()) > 0) out.push(d);
  return out;
};
const allDays = () => {
  const out = [];
  for (let t = Date.UTC(2027, 1, 5); t <= Date.UTC(2027, 1, 16); t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
};

async function addOnDays(p, day, slotLabel, title, kind, more) {
  await h.showDay(p, day);
  await p.locator(`#day-${day}`).getByRole('button', { name: slotLabel }).click();
  const d = h.dlg(p);
  await d.getByLabel('What').fill(title);
  if (kind) await d.getByRole('radio', { name: kind }).click();
  await d.getByRole('radio', { name: 'Planned' }).click();
  if (title === 'Ski day') {
    await d.getByRole('group', { name: 'Part of the day' }).getByRole('button', { name: 'Day', exact: true }).click();
    await d.getByLabel('Where (optional)').fill('Chamonix');
  }
  await h.openTimes(d);
  const group = d.getByTestId('more-days');
  for (const m of more) await group.getByRole('button', { name: m }).click();
  return d;
}

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const p = h.watch(await (await h.context(browser, opts)).newPage(), label);
  // Place suggestions come from an outside service; faked empty here, as in where-flow.
  await p.route('**/photon.komoot.io/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ type: 'FeatureCollection', features: [] }) }),
  );
  const url = await h.startSkiTrip(p, `repeat-${label}`);
  const tripId = url.match(/trips\/([0-9a-f-]{36})/)[1];

  // 1. A ski day on seven days: Sat 2/6, then six more ticked.
  const d = await addOnDays(p, '2027-02-06', 'Add to morning', 'Ski day', null, ['Sun, Feb 7', 'Mon, Feb 8', 'Tue, Feb 9', 'Wed, Feb 10', 'Thu, Feb 11', 'Fri, Feb 12']);
  r.summary = (await d.getByRole('button', { name: /Times, or more days/ }).innerText()).replace(/\s+/g, ' ');
  await d.getByTestId('more-days').scrollIntoViewIfNeeded();
  await h.shot(p, `repeat-more-days-${label}`);
  await d.getByRole('button', { name: 'Add to trip' }).click();
  await p.locator('dialog[open]').waitFor({ state: 'detached' });
  await first(p, '2027-02-12', 'Ski day').first().waitFor();
  r.skiDays = await daysWith(p, 'Ski day', allDays());
  r.fullCards = [];
  for (const day of WEEK) r.fullCards.push((await first(p, day, 'Ski day').first().innerText()).replace(/\s+/g, ' '));

  // Day 3 (Mon 2/8) gets a new place; the others keep Chamonix.
  await first(p, '2027-02-08', 'Ski day').first().click();
  await h.dlg(p).getByLabel('Where (optional)').fill('Les Houches');
  await h.dlg(p).getByRole('button', { name: 'Done' }).click();
  await p.locator('dialog[open]').waitFor({ state: 'detached' });
  await first(p, '2027-02-08', 'Ski day').getByText('Les Houches').waitFor();
  r.places = [];
  for (const day of WEEK) r.places.push(/Les Houches/.test(await first(p, day, 'Ski day').first().innerText()) ? 'Les Houches' : 'Chamonix');

  // Day 5 (Wed 2/10) deleted: six left.
  p.once('dialog', (x) => x.accept());
  await first(p, '2027-02-10', 'Ski day').first().click();
  await h.dlg(p).getByRole('button', { name: 'Remove' }).click();
  await p.locator('dialog[open]').waitFor({ state: 'detached' });
  await first(p, '2027-02-10', 'Ski day').waitFor({ state: 'detached' });
  r.afterDelete = await daysWith(p, 'Ski day', allDays());
  await first(p, '2027-02-06', 'Ski day').scrollIntoViewIfNeeded();
  await h.shot(p, `repeat-cards-${label}`);

  // 2. Three days not in a row: Fri 2/5, Sun 2/7, Wed 2/10.
  const d2 = await addOnDays(p, '2027-02-05', 'Add to evening', 'Fondue night', 'Meal', ['Sun, Feb 7', 'Wed, Feb 10']);
  await d2.getByRole('button', { name: 'Add to trip' }).click();
  await p.locator('dialog[open]').waitFor({ state: 'detached' });
  await first(p, '2027-02-10', 'Fondue night').first().waitFor();
  r.fondueDays = await daysWith(p, 'Fondue night', allDays());

  // 3. Split an old seven-day plan. Julia (added by name) is out of it.
  if (label === 'phone') await p.getByRole('tab', { name: /People/ }).click();
  await p.locator('section[aria-labelledby="people-title"]').getByRole('button', { name: 'Add', exact: true }).click();
  await h.dlg(p).getByLabel('Name').fill('Julia');
  await h.dlg(p).getByRole('button', { name: 'Add to trip' }).click();
  await h.dlg(p).getByText('Added Julia').waitFor();
  await h.dlg(p).getByRole('button', { name: 'Done' }).click();
  if (label === 'phone') await p.getByRole('tab', { name: /Itinerary/ }).click();
  const travelers = await (await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/travelers?trip_id=eq.${tripId}&select=id,name`, {
    headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${await tokenOf(p)}` },
  })).json();
  const juliaId = travelers.find((t) => t.name === 'Julia').id;
  const [old] = await rest(p, 'POST', 'items', {
    trip_id: tripId, kind: 'activity', title: 'Old lift week', day: '2027-02-06', part: 'day', end_day: '2027-02-12', end_part: null,
    location: 'Chamonix', notes: null, status: 'planned', est_cents: null, cost_type: 'total',
  });
  await rest(p, 'POST', 'item_people', { item_id: old.id, traveler_id: juliaId, going: false });
  await p.reload();
  await p.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  await h.showDay(p, '2027-02-06');
  await first(p, '2027-02-06', 'Old lift week').first().click();
  await h.openTimes(h.dlg(p));
  await h.dlg(p).getByRole('button', { name: 'Split into separate days' }).scrollIntoViewIfNeeded();
  await h.shot(p, `repeat-split-${label}`);
  await h.dlg(p).getByRole('button', { name: 'Split into separate days' }).click();
  await p.locator('dialog[open]').waitFor({ state: 'detached' });
  await p.waitForTimeout(800);
  const items = await (await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/items?trip_id=eq.${tripId}&title=eq.Old%20lift%20week&select=id,day,end_day`, {
    headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${await tokenOf(p)}` },
  })).json();
  r.splitDays = items.map((i) => i.day).sort();
  r.splitEndDays = items.filter((i) => i.end_day).length;
  r.originalGone = !items.some((i) => i.id === old.id);
  const outs = await (await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/item_people?traveler_id=eq.${juliaId}&going=eq.false&select=item_id`, {
    headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${await tokenOf(p)}` },
  })).json();
  r.juliaOutOn = items.filter((i) => outs.some((o) => o.item_id === i.id)).length;
  r.splitCards = await daysWith(p, 'Old lift week', allDays());
  r.overflow = await h.overflowX(p);
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const fail = [];
      const want = (name, ok) => ok || fail.push(name);
      want('summary says seven days', /on 7 days, one plan each/.test(r.summary));
      want('seven cards', JSON.stringify(r.skiDays) === JSON.stringify(WEEK));
      want('each card full', r.fullCards.every((t) => /Ski day/.test(t) && /Chamonix/.test(t) && /PLANNED/i.test(t)));
      want('day 3 alone changed', JSON.stringify(r.places) === JSON.stringify(['Chamonix', 'Chamonix', 'Les Houches', 'Chamonix', 'Chamonix', 'Chamonix', 'Chamonix']));
      want('six after delete', JSON.stringify(r.afterDelete) === JSON.stringify(WEEK.filter((x) => x !== '2027-02-10')));
      want('three days not in a row', JSON.stringify(r.fondueDays) === JSON.stringify(['2027-02-05', '2027-02-07', '2027-02-10']));
      want('split into seven', JSON.stringify(r.splitDays) === JSON.stringify(WEEK) && r.splitEndDays === 0 && r.originalGone && JSON.stringify(r.splitCards) === JSON.stringify(WEEK));
      want('opt-out carried over', r.juliaOutOn === 7);
      want('no sideways scroll', r.overflow <= 0);
      if (fail.length) result.failure = `${result.failure ? `${result.failure} | ` : ''}${label}: ${fail.join('; ')}`;
    }
  } catch (e) {
    result.failure = String(e);
  } finally {
    result.errors = h.errors;
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
    if (result.failure || result.errors.length) process.exit(1);
  }
})();
