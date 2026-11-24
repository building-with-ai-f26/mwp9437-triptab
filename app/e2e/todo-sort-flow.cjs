// T4 (Mike's 11/23 ski trip test, journal/pm-review/spec-11-23.md): sort and filter the to-do list
// by owner and due date. At 1280 and 390 wide, against TripTab dev. Five made-up to-dos across
// three people (and one nobody has): every filter and sort gives the expected order, the choice
// is remembered after a reload, done items follow the filter, and at 390 nothing scrolls sideways.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

const TODOS = [
  ['Book fondue', 'Julia', '2026-12-20'],
  ['Buy lift passes', 'Mike (you)', '2026-12-10'],
  ['Rent skis', 'Sam', ''],
  ['Pick a restaurant', '', '2026-12-20'],
  ['Travel insurance', 'Mike (you)', ''],
];
const EXPECT = {
  'everyone|due': ['Buy lift passes', 'Book fondue', 'Pick a restaurant', 'Travel insurance', 'Rent skis'],
  'everyone|owner': ['Book fondue', 'Buy lift passes', 'Travel insurance', 'Rent skis', 'Pick a restaurant'],
  'everyone|newest': ['Travel insurance', 'Pick a restaurant', 'Rent skis', 'Buy lift passes', 'Book fondue'],
  'mine|due': ['Buy lift passes', 'Travel insurance'],
  'nobody|due': ['Pick a restaurant'],
  'Julia|due': ['Book fondue'],
  'Sam|due': ['Rent skis'],
};

const card = (p) => p.locator('section[aria-labelledby="actions-title"]');
const openTitles = async (p) => (await card(p).getByTestId('todo-open').locator('li p.text-sm').allInnerTexts().catch(() => [])).map((t) => t.trim());

const p_empty = async (input) => {
  for (let i = 0; i < 40 && (await input.inputValue()) !== ''; i++) await new Promise((r) => setTimeout(r, 100));
};

async function show(p, filterLabel, sortLabel) {
  await card(p).getByLabel('Show to-dos for').selectOption({ label: filterLabel });
  await card(p).getByLabel('Sort to-dos by').selectOption({ label: sortLabel });
  await p.waitForTimeout(150);
}

async function run(browser, label, opts, result) {
  const r = (result[label] = { orders: {} });
  const phone = label === 'phone';
  const o = h.watch(await (await h.context(browser, opts)).newPage(), `owner-${label}`);
  await h.startSkiTrip(o, `todo-${label}`);
  if (phone) await o.getByRole('tab', { name: /People/ }).click();
  for (const name of ['Julia', 'Sam']) {
    await o.locator('section[aria-labelledby="people-title"]').getByRole('button', { name: 'Add', exact: true }).click();
    await h.dlg(o).getByLabel('Name').fill(name);
    await h.dlg(o).getByRole('button', { name: 'Add to trip' }).click();
    await h.dlg(o).getByText(`Added ${name}`).waitFor();
    await h.dlg(o).getByRole('button', { name: 'Done' }).click();
  }
  await o.getByRole('tab', { name: /To do/ }).click();
  for (const [title, who, due] of TODOS) {
    await card(o).getByLabel('New action item').fill(title);
    if (who) await card(o).getByLabel("Who's on it").selectOption({ label: who });
    else await card(o).getByLabel("Who's on it").selectOption({ value: '' });
    await card(o).getByLabel('Due by (optional)').fill(due);
    await card(o).getByRole('button', { name: 'Add', exact: true }).click();
    await card(o).getByText(title, { exact: true }).waitFor();
    // The box clears once the save is done; typing before that would be wiped.
    await p_empty(card(o).getByLabel('New action item'));
  }
  r.defaults = await openTitles(o);
  for (const key of Object.keys(EXPECT)) {
    const [f, s] = key.split('|');
    const filterLabel = { everyone: 'Everyone', mine: 'Mine', nobody: 'Nobody yet' }[f] ?? f;
    const sortLabel = { due: 'Due date', owner: 'Owner', newest: 'Newest' }[s];
    await show(o, filterLabel, sortLabel);
    r.orders[key] = await openTitles(o);
    if (key === 'everyone|owner') {
      await card(o).scrollIntoViewIfNeeded();
      await h.shot(o, `todo-sort-owner-${label}`);
    }
  }

  // Remembered on the device: Owner, then a reload.
  await show(o, 'Everyone', 'Owner');
  await o.reload();
  await o.getByRole('tab', { name: /To do/ }).click();
  await card(o).getByTestId('todo-open').waitFor();
  r.rememberedSort = await card(o).getByLabel('Sort to-dos by').inputValue();
  r.afterReload = await openTitles(o);

  // Done items follow the filter: tick Sam's, then show Sam, then Mine.
  await card(o).getByLabel('Mark done: Rent skis').click();
  await card(o).locator('details summary', { hasText: '1 done' }).waitFor();
  await show(o, 'Sam', 'Due date');
  await card(o).locator('details summary').click();
  r.samDone = await card(o).getByTestId('todo-done').locator('li p.text-sm').allInnerTexts();
  r.samOpenNote = await card(o).getByText('None open for this filter.').isVisible();
  await h.shot(o, `todo-sort-done-${label}`);
  await show(o, 'Mine', 'Due date');
  r.mineDoneCount = await card(o).locator('details').count();
  r.controlsOverflow = await h.overflowX(o);
  const box = await card(o).getByTestId('todo-view').boundingBox();
  const cardBox = await card(o).boundingBox();
  r.controlsFit = box.x >= cardBox.x && box.x + box.width <= cardBox.x + cardBox.width + 0.5;
  await show(o, 'Everyone', 'Due date');
  await card(o).scrollIntoViewIfNeeded();
  await h.shot(o, `todo-sort-due-${label}`);
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const fail = [];
      if (JSON.stringify(r.defaults) !== JSON.stringify(EXPECT['everyone|due'])) fail.push(`default ${r.defaults}`);
      for (const [key, want] of Object.entries(EXPECT)) if (JSON.stringify(r.orders[key]) !== JSON.stringify(want)) fail.push(`${key}: ${r.orders[key]}`);
      if (r.rememberedSort !== 'owner' || JSON.stringify(r.afterReload) !== JSON.stringify(EXPECT['everyone|owner'])) fail.push('not remembered');
      if (JSON.stringify(r.samDone) !== JSON.stringify(['Rent skis']) || !r.samOpenNote || r.mineDoneCount !== 0) fail.push('done items');
      if (r.controlsOverflow > 0 || !r.controlsFit) fail.push('controls overflow');
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
