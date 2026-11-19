// Run with the dev server up (npm run dev): node e2e/describe-flow.cjs
// Describe your trip click-through (Build 3, the 11/17 pod notes): on Start a trip, a person
// describes what's planned, checks the name and stops it filled in, starts the trip, reviews the
// plans it found on import's screen, and finds its follow-up questions on their To do list. At
// 1280 and at 390 wide.
//
// The describe-trip function's reply is CANNED here, so the run costs nothing and tests only the
// screens. What the model returns is the eval's job (npm run eval:describe). The first answer is
// "no trip found", to check that its message shows and the description is kept.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

const TEXT = 'Euro ski trip! Chamonix Feb 5 to 12, then Andorra till the 16th. Skiing every day in Chamonix, dinner reservation Thursday, the Airbnb is booked.';
const plan = (over) => ({
  kind: 'activity', title: '', day: null, part: null, end_day: null, depart_time: null, arrive_time: null, times_from: null,
  source_url: null, location: null, confirmation_code: null, cost_cents: null, currency: null, cost_is_per_person: false,
  who_pays: 'split', paid: false, unsure: [], ...over,
});
const QUESTIONS = ["What's the Chamonix Airbnb's address or link?", 'What time is the Thursday dinner reservation?'];
const CANNED = {
  trip: {
    name: 'Euro ski trip',
    stops: [
      { name: 'Chamonix', start_date: '2027-02-05', end_date: '2027-02-12' },
      { name: 'Andorra', start_date: '2027-02-12', end_date: '2027-02-16' },
    ],
  },
  plans: [
    plan({ kind: 'stay', title: 'Chamonix Airbnb', day: '2027-02-05', end_day: '2027-02-12', part: 'night' }),
    plan({ kind: 'activity', title: 'Skiing', day: '2027-02-06', end_day: '2027-02-11', part: 'day' }),
    plan({ kind: 'meal', title: 'Dinner reservation', day: '2027-02-11', part: 'evening', unsure: ['part'] }),
  ],
  questions: QUESTIONS,
  note: null,
  call_id: null,
  usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, searches: 0, cost_usd: 0, latency_ms: 0, model: 'canned', effort: 'none' },
};
const NO_TRIP = { code: 'no_trip', error: "That doesn't read like a trip. Say where you're going and when." };
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };

async function run(browser, label, opts, result) {
  const p = h.watch(await (await h.context(browser, opts)).newPage(), label);
  const r = (result[label] = {});
  await p.goto(`${h.BASE}/sign-in?next=/trips/new`);
  await h.signUp(p, 'Mike', `describe-${label}`);
  await p.getByRole('heading', { name: "Where's the group going?" }).waitFor();

  let calls = 0;
  await p.route('**/functions/v1/describe-trip', (route) => {
    if (route.request().method() !== 'POST') return route.fulfill({ status: 200, headers: cors, body: 'ok' });
    calls += 1;
    const [status, body] = calls === 1 ? [422, NO_TRIP] : [200, CANNED];
    return route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
  });

  await p.getByRole('radio', { name: 'Describe it' }).click();
  const box = p.getByLabel("What's planned so far?");
  await box.fill(TEXT);
  r.overflowDescribe = await h.overflowX(p);
  await h.shot(p, `describe-text-${label}`);

  // 1. No trip found: the message shows, and the description stays to fix.
  await p.getByRole('button', { name: 'Set it up' }).click();
  r.noTripMessage = (await p.getByText("That doesn't read like a trip").innerText()).trim();
  r.textKeptAfterError = (await box.inputValue()) === TEXT;

  // 2. Set up: the form is filled in from the description, with a note saying what comes next.
  await p.getByRole('button', { name: 'Set it up' }).click();
  const note = p.getByTestId('described-note');
  await note.waitFor();
  r.note = (await note.innerText()).replace(/\s+/g, ' ').trim();
  r.tripName = await p.getByLabel('Trip name').inputValue();
  r.stops = [await p.getByRole('combobox', { name: 'Stop 1 place' }).inputValue(), await p.getByRole('combobox', { name: 'Stop 2 place' }).inputValue()];
  r.dates = await p.locator('input[type="date"]').evaluateAll((els) => els.map((e) => e.value));
  r.overflowForm = await h.overflowX(p);
  await h.shot(p, `describe-filled-${label}`);

  // "Change the description" goes back with the words kept; setting it up again lands on the form.
  await note.getByRole('button', { name: 'Change the description' }).click();
  r.textKeptOnChange = (await box.inputValue()) === TEXT;
  await p.getByRole('button', { name: 'Set it up' }).click();
  await note.waitFor();
  r.calls = calls;

  // 3. Start the trip: the plans it found open on import's review, under their own heading.
  await p.getByRole('button', { name: 'Start the trip' }).click();
  await p.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  await h.dlg(p).getByRole('heading', { name: 'Plans from your description' }).waitFor();
  const cards = h.dlg(p).getByTestId('proposal');
  r.proposed = await cards.count();
  r.dinnerMarkedCheckThis = (await cards.nth(2).innerText()).includes('check this');
  await h.shot(p, `describe-review-${label}`);
  await h.dlg(p).getByRole('button', { name: /Add 3 to the trip/ }).click();
  await p.locator('dialog[open]').waitFor({ state: 'detached', timeout: 30000 });

  if (label === 'phone') await p.getByRole('tab', { name: /Itinerary/ }).click().catch(() => {});
  await p.locator('#day-2027-02-05 .item-card').filter({ hasText: 'Chamonix Airbnb' }).first().waitFor();
  r.stay = (await p.locator('#day-2027-02-05 .item-card').filter({ hasText: 'Chamonix Airbnb' }).first().innerText()).replace(/\s+/g, ' ');
  r.dinner = (await p.locator('#day-2027-02-11 .item-card').filter({ hasText: 'Dinner reservation' }).innerText()).replace(/\s+/g, ' ');

  // 4. The questions are on the To do list, assigned to the person who described the trip.
  if (label === 'phone') await p.getByRole('tab', { name: 'To do' }).click();
  const todo = p.locator('section[aria-labelledby="actions-title"]');
  await todo.getByText(QUESTIONS[0]).waitFor();
  r.todos = (await todo.locator('li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  // Each one's picker shows who has it: the person who described the trip.
  r.todoAssignees = [];
  for (const q of QUESTIONS) {
    const pick = todo.getByLabel(`Who has "${q}"`);
    r.todoAssignees.push(await pick.evaluate((el) => el.options[el.selectedIndex].text));
  }
  await todo.scrollIntoViewIfNeeded();
  await h.shot(p, `describe-todos-${label}`);

  // The hand-off is read once: a reload neither reopens the review nor adds the to-dos again.
  await p.reload();
  await p.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  if (label === 'phone') await p.getByRole('tab', { name: 'To do' }).click();
  await todo.getByText(QUESTIONS[0]).waitFor();
  await p.waitForTimeout(1000);
  r.reviewAfterReload = await p.locator('dialog[open]').count();
  r.todoCountAfterReload = await todo.getByText(QUESTIONS[0]).count();
  r.overflowTrip = await h.overflowX(p);

  const ok =
    r.noTripMessage.length > 0 && r.textKeptAfterError && r.textKeptOnChange && r.calls === 3 &&
    r.tripName === 'Euro ski trip' && r.stops.join() === 'Chamonix,Andorra' &&
    r.dates.join() === '2027-02-05,2027-02-12,2027-02-12,2027-02-16' &&
    /review 3 plans/.test(r.note) && /2 questions/.test(r.note) &&
    r.proposed === 3 && r.dinnerMarkedCheckThis && r.dinner.includes('Dinner reservation') &&
    QUESTIONS.every((q) => r.todos.some((t) => t.includes(q))) && r.todoAssignees.every((a) => /Mike/.test(a)) &&
    r.reviewAfterReload === 0 && r.todoCountAfterReload === 1 &&
    r.overflowDescribe <= 0 && r.overflowForm <= 0 && r.overflowTrip <= 0;
  r.pass = ok;
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  await run(browser, 'desktop', h.DESKTOP, result);
  await run(browser, 'phone', h.PHONE, result);
  // The first answer is a 422 on purpose ("no trip found"); any other console error fails the run.
  result.errors = h.errors.filter((e) => !/status of 422/.test(e));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  if (!result.desktop.pass || !result.phone.pass || result.errors.length) process.exit(1);
})().catch((e) => {
  console.error('FLOW FAILED:', e.message.split('\n').slice(0, 4).join(' | '));
  console.error('errors so far:', h.errors);
  process.exit(1);
});
