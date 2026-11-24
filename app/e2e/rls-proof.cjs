// The Build 3 security test (C14, Mike's 11/19 call): on the live site, a second account is refused
// someone else's trip, in the app and straight at the database's API. Run it on purpose only:
//   RLS_PROOF=yes E2E_BASE=https://triptab.org node e2e/rls-proof.cjs
//
// It makes two labeled test accounts on production, which the rest of the flows never do. So:
// their emails are Resend's test inboxes (delivered+label@resend.dev), which take the confirmation
// email without hurting triptab.org's sending reputation; PostHog is blocked, so no test events
// reach the real dashboards; and Account A deletes the trip through the app at the end. The two
// accounts are then deleted by hand (it prints them), right after, as C14 says.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

if (process.env.RLS_PROOF !== 'yes' || !/^https:\/\//.test(h.BASE)) {
  console.error('Run on purpose only: RLS_PROOF=yes E2E_BASE=https://triptab.org node e2e/rls-proof.cjs');
  process.exit(1);
}
const SUPABASE = process.env.RLS_SUPABASE_URL || 'https://pptzbogslzicfyjooqra.supabase.co';
const KEY = process.env.RLS_SUPABASE_KEY || 'sb_publishable_-_AJFvHpurCuAHnKjIEuvQ__xAzXCJ_';
const email = (who) => `delivered+triptab-rls-${h.run}-${who}@resend.dev`;
const TRIP_NAME = `RLS test trip ${h.run}`;

async function open(browser, opts) {
  const ctx = await h.context(browser, opts);
  await ctx.route(/posthog\.com/, (r) => r.abort());
  return ctx;
}

async function signUp(page, name, who, next) {
  await page.goto(`${h.BASE}/sign-in?next=${next}`);
  await h.withEmail(page);
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email').fill(email(who));
  await page.getByLabel('Password').fill(h.PW);
  await page.getByRole('button', { name: 'Create account' }).click();
}

/** The signed-in person's session, as the app keeps it (it lands a moment after sign-in). */
async function session(page) {
  const handle = await page.waitForFunction(() => {
    const k = Object.keys(localStorage).find((x) => /^sb-.*-auth-token$/.test(x));
    const s = k && JSON.parse(localStorage.getItem(k));
    return s?.access_token && s?.user?.id ? { token: s.access_token, user: s.user.id } : null;
  }, null, { timeout: 15000 });
  return handle.jsonValue();
}

/** One request at the database's API from the page, as whoever is signed in there (or nobody). */
/** A reply, short: an empty list, the rows, or why it was refused. */
const said = (r) => (Array.isArray(r.body) ? `${r.status} ${JSON.stringify(r.body).slice(0, 80)}` : `${r.status} refused: ${r.body?.message ?? JSON.stringify(r.body).slice(0, 80)}`);

function probe(page, req) {
  return page.evaluate(
    async ({ req, SUPABASE, KEY }) => {
      const headers = { apikey: KEY, 'content-type': 'application/json', prefer: 'return=representation' };
      if (req.token) headers.authorization = `Bearer ${req.token}`;
      const res = await fetch(`${SUPABASE}${req.path}`, { method: req.method || 'GET', headers, body: req.body ? JSON.stringify(req.body) : undefined });
      const text = await res.text();
      let body;
      try { body = JSON.parse(text); } catch { body = text; }
      return { status: res.status, body };
    },
    { req, SUPABASE, KEY },
  );
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const out = { base: h.BASE, run: h.run, accounts: {}, checks: [] };

  // Account A starts a trip.
  const a = h.watch(await (await open(browser, h.DESKTOP)).newPage(), 'A');
  await signUp(a, 'RLS test A', 'a', '/trips/new');
  await a.waitForURL(/\/trips\/new/);
  await a.getByRole('button', { name: 'Fill in the ski trip example' }).click();
  await a.getByLabel('Trip name').fill(TRIP_NAME);
  await a.getByRole('button', { name: 'Start the trip' }).click();
  await a.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  const tripUrl = a.url();
  const trip = tripUrl.match(/\/trips\/([0-9a-f-]{36})/)[1];
  const A = await session(a);
  out.accounts.a = { email: email('a'), user: A.user };
  out.trip = trip;

  // Account B, a stranger to the trip, signs up on its own.
  const bCtx = await open(browser, h.DESKTOP);
  const b = h.watch(await bCtx.newPage(), 'B');
  await signUp(b, 'RLS test B', 'b', '/trips');
  await b.waitForURL(/\/trips$/);
  const B = await session(b);
  out.accounts.b = { email: email('b'), user: B.user };

  const check = (name, ok, got) => out.checks.push({ name, ok, got });

  // 1. In the app: B opens A's trip link and is turned away, at 1280 and 390 wide.
  await b.goto(tripUrl);
  await b.getByRole('heading', { name: "This trip isn't here" }).waitFor();
  check('B opens the trip in the app', true, (await b.locator('main h1, main p').allInnerTexts()).join(' ').replace(/\s+/g, ' ').trim());
  await h.shot(b, 'rls-refused-app-desktop');
  const bPhone = h.watch(await (await open(browser, h.PHONE)).newPage(), 'B phone');
  await bPhone.goto(h.BASE);
  await bPhone.evaluate((s) => Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, v)), await b.evaluate(() => ({ ...localStorage })));
  await bPhone.goto(tripUrl);
  await bPhone.getByRole('heading', { name: "This trip isn't here" }).waitFor();
  out.phoneOverflow = await h.overflowX(bPhone);
  await h.shot(bPhone, 'rls-refused-app-phone');

  // 2. Straight at the API, as B: every read of the trip comes back empty, every write is refused.
  const t = B.token;
  const reads = [
    ['trips', `/rest/v1/trips?id=eq.${trip}`],
    ['stops', `/rest/v1/stops?trip_id=eq.${trip}`],
    // The columns the app asks for: email and phone are Owners-only even on a trip you're on.
    ['travelers', `/rest/v1/travelers?select=id,trip_id,name,role,user_id&trip_id=eq.${trip}`],
    ['items', `/rest/v1/items?trip_id=eq.${trip}`],
    ['trip_links (the group link)', `/rest/v1/trip_links?trip_id=eq.${trip}`],
    ['expenses', `/rest/v1/expenses?trip_id=eq.${trip}`],
    ['payments', `/rest/v1/payments?trip_id=eq.${trip}`],
    ['action_items', `/rest/v1/action_items?trip_id=eq.${trip}`],
    ['item_people', `/rest/v1/item_people?select=item_id,items!inner(trip_id)&items.trip_id=eq.${trip}`],
    ['plan_payments', `/rest/v1/plan_payments?trip_id=eq.${trip}`],
    // T10 (C60): A's Ask AI turn, seeded just below, is A's alone.
    ['ask_turns', `/rest/v1/ask_turns?trip_id=eq.${trip}`],
  ];
  // A keeps one Ask AI turn on the trip, so B's empty read above means something.
  const seeded = await probe(a, { method: 'POST', path: '/rest/v1/ask_turns', token: A.token, body: { trip_id: trip, thread_id: '0b1c2d3e-4f50-4617-8293-a4b5c6d7e8f9', request: 'RLS test: a fondue dinner', options: [] } });
  check('A keeps an Ask AI turn', seeded.status === 201, said(seeded));
  for (const [name, path] of reads) {
    const r = await probe(b, { path, token: t });
    check(`B reads ${name}`, r.status === 200 && Array.isArray(r.body) && r.body.length === 0, said(r));
  }
  // Every table, unfiltered: B, on no trip, sees none of anyone else's rows.
  const tables = ['trips', 'stops', 'travelers', 'items', 'item_people', 'trip_links', 'expenses', 'expense_shares', 'payments', 'action_items', 'ai_calls', 'invite_emails', 'account_events', 'email_checks', 'inbox_items', 'forward_addresses', 'trip_inboxes', 'inbox_held', 'plan_payments', 'ask_turns'];
  for (const table of tables) {
    const r = await probe(b, { path: `/rest/v1/${table}?select=*&limit=50`, token: t });
    const rows = Array.isArray(r.body) ? r.body : [];
    const others = rows.filter((x) => (x.user_id ?? x.created_by ?? B.user) !== B.user);
    const got = Array.isArray(r.body) ? `${r.status}, ${rows.length} rows, ${others.length} not B's` : `${r.status} refused: ${r.body?.message ?? ''}`;
    check(`B lists all of ${table}`, Array.isArray(r.body) ? others.length === 0 : r.status >= 400, got);
  }
  const rpc = async (fn, args) => probe(b, { method: 'POST', path: `/rest/v1/rpc/${fn}`, token: t, body: args });
  for (const fn of ['trip_contacts', 'own_marks']) {
    const r = await rpc(fn, { p_trip: trip });
    check(`B calls ${fn} for the trip`, (r.status === 200 && Array.isArray(r.body) && r.body.length === 0) || r.status >= 400, said(r));
  }
  const writes = [
    ['B renames the trip', { method: 'PATCH', path: `/rest/v1/trips?id=eq.${trip}`, body: { name: 'Changed by B' } }],
    ['B joins the trip as an Owner', { method: 'POST', path: '/rest/v1/travelers', body: { trip_id: trip, name: 'RLS test B', user_id: B.user, role: 'owner' } }],
    ['B adds a plan to the trip', { method: 'POST', path: '/rest/v1/items', body: { trip_id: trip, kind: 'activity', title: 'B was here', day: '2027-02-06', part: 'day' } }],
    ['B deletes the trip', { method: 'DELETE', path: `/rest/v1/trips?id=eq.${trip}` }],
  ];
  for (const [name, req] of writes) {
    const r = await probe(b, { ...req, token: t });
    const refused = r.status >= 400 || (Array.isArray(r.body) && r.body.length === 0);
    check(name, refused, said(r));
  }
  // The functions that run with raised rights (Supabase's advisor lists 16): each must check who's
  // asking itself. A sets up something for each to aim at: a planned plan, a to-do, A's own spot.
  const asA = (req) => probe(a, { ...req, token: A.token });
  const plan = (await asA({ method: 'POST', path: '/rest/v1/items', body: { trip_id: trip, title: 'Ski school', day: '2027-02-06', part: 'morning', status: 'planned', est_cents: 8000 } })).body?.[0];
  const todo = (await asA({ method: 'POST', path: '/rest/v1/action_items', body: { trip_id: trip, title: 'Book the ski passes' } })).body?.[0];
  const spot = (await asA({ path: `/rest/v1/travelers?select=id,user_id&trip_id=eq.${trip}&user_id=eq.${A.user}` })).body?.[0];
  // A general expense of A's (11/22): B tries to rewrite its split from a trip of B's own, below.
  const bill = spot?.id && (await asA({ method: 'POST', path: '/rest/v1/rpc/save_expense', body: { p_trip: trip, p_expense: null, p_description: 'Groceries', p_day: '2027-02-06', p_total_cents: 9000, p_paid_by: spot.id, p_split_mode: 'even', p_shares: [{ traveler_id: spot.id, amount_cents: 9000 }] } })).body;
  const state = async () => ({
    trip: (await asA({ path: `/rest/v1/trips?id=eq.${trip}&select=name,start_date,end_date` })).body?.[0],
    link: (await asA({ path: `/rest/v1/trip_links?trip_id=eq.${trip}&select=token,enabled` })).body?.[0],
    people: (await asA({ path: `/rest/v1/travelers?select=id,user_id&trip_id=eq.${trip}` })).body,
    expenses: (await asA({ path: `/rest/v1/expenses?trip_id=eq.${trip}&select=id` })).body?.length,
    split: (await asA({ path: `/rest/v1/expense_shares?expense_id=eq.${bill}&select=traveler_id,amount_cents` })).body,
    money: (await asA({ path: `/rest/v1/expenses?id=eq.${bill}&select=total_cents,currency,fx_pending` })).body?.[0],
    plan: (await asA({ path: `/rest/v1/items?id=eq.${plan?.id}&select=status` })).body?.[0]?.status,
    todo: (await asA({ path: `/rest/v1/action_items?id=eq.${todo?.id}&select=done` })).body?.[0]?.done,
  });
  if (!plan?.id || !todo?.id || !spot?.id || typeof bill !== 'string') throw new Error(`A's setup failed: ${JSON.stringify({ plan, todo, spot, bill })}`);
  // B's own trip, where B is the Owner (deleted again below).
  const bTrip = (await probe(b, { method: 'POST', path: '/rest/v1/rpc/create_trip', token: t, body: { p_name: `${TRIP_NAME} (B's own)`, p_stops: [{ name: 'Lisbon', start_date: '2027-03-01', end_date: '2027-03-02' }], p_my_name: 'RLS test B' } })).body;
  const bSpot = (await probe(b, { path: `/rest/v1/travelers?select=id&trip_id=eq.${bTrip}`, token: t })).body?.[0];
  if (typeof bTrip !== 'string' || !bSpot?.id) throw new Error(`B's own trip failed: ${JSON.stringify({ bTrip, bSpot })}`);
  const before = await state();
  const attacks = [
    ['update_trip', 'renames the trip and its stops', { p_trip: trip, p_name: 'Renamed by B', p_stops: [{ name: 'Nowhere', start_date: '2027-02-05', end_date: '2027-02-06' }] }],
    ['extend_trip', 'stretches the trip', { p_trip: trip, p_day: '2027-02-28' }],
    ['reset_group_link', 'resets the group link (to learn the new one)', { p_trip: trip }],
    ['save_expense', 'adds an expense', { p_trip: trip, p_expense: null, p_description: 'B was here', p_day: '2027-02-06', p_total_cents: 1000, p_paid_by: spot.id, p_split_mode: 'even', p_shares: [] }],
    ['confirm_item', 'confirms the plan as paid', { p_item: plan.id, p_total_cents: 8000, p_paid_by: spot.id, p_split_mode: 'even', p_shares: [] }],
    ['unconfirm_item', 'undoes a confirmation', { p_item: plan.id }],
    ['log_own_line', "logs a cost on A's line", { p_item: plan.id, p_traveler: spot.id, p_cents: 100, p_with_points: false }],
    ['clear_own_line', "clears A's line", { p_item: plan.id, p_traveler: spot.id }],
    ['set_action_done', "ticks off A's to-do", { p_id: todo.id, p_done: true }],
    ['join_preview', 'previews a made-up group link', { p_token: 'not-the-link' }],
    ['join_trip', 'joins with a made-up group link', { p_token: 'not-the-link', p_traveler_id: null, p_new_name: 'RLS test B' }],
    ['join_trip', "takes A's spot, with the real link", { p_token: before.link?.token, p_traveler_id: spot.id, p_new_name: null }],
    // Added 11/22: the functions that came with email-in and foreign costs, and the audit's two holes.
    ['inbox_address', "reads the trip's own email address", { p_trip: trip }],
    ['reset_inbox', "replaces the trip's own email address", { p_trip: trip }],
    ['set_expense_fx', "marks A's expense as euros", { p_expense: bill, p_currency: 'EUR', p_foreign_cents: 100 }],
    ['settle_fx', "changes what A's expense cost", { p_expense: bill, p_total_cents: 1 }],
    ['save_expense', "rewrites the split of A's expense from a trip of B's own", { p_trip: bTrip, p_expense: bill, p_description: 'x', p_day: '2027-03-01', p_total_cents: 9000, p_paid_by: bSpot.id, p_split_mode: 'even', p_shares: [{ traveler_id: bSpot.id, amount_cents: 9000 }] }],
    ['ai_spend_today', "reads the app's AI spending", { p_since: '2026-01-01T00:00:00Z', p_user: A.user }],
  ];
  for (const [fn, what, args] of attacks) {
    const r = await probe(b, { method: 'POST', path: `/rest/v1/rpc/${fn}`, token: t, body: args });
    const empty = r.body == null || r.body === '' || (Array.isArray(r.body) && r.body.length === 0) || (typeof r.body === 'object' && !Array.isArray(r.body) && Object.values(r.body).every((v) => v == null));
    check(`B ${what} (${fn})`, r.status >= 400 || (r.status < 300 && empty), said(r));
  }
  const after = await state();
  const moved = Object.keys(before).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  check('...and none of it stuck', moved.length === 0, moved.length ? moved.map((k) => `${k}: ${JSON.stringify(before[k])} -> ${JSON.stringify(after[k])}`).join('; ') : 'name, dates, link, people, expenses and their split, plan status, to-do: all as before');
  const bGone = await probe(b, { method: 'DELETE', path: `/rest/v1/trips?id=eq.${bTrip}`, token: t });
  out.bTripDeleted = bGone.status < 300;
  // Controls: the same calls work for A, an Owner, so B's were turned away for who B is.
  const reset = await asA({ method: 'POST', path: '/rest/v1/rpc/reset_group_link', body: { p_trip: trip } });
  const done = await asA({ method: 'POST', path: '/rest/v1/rpc/set_action_done', body: { p_id: todo.id, p_done: true } });
  const changed = await state();
  check('Control: A, an Owner, resets the link and ticks the to-do', reset.status < 300 && done.status < 300 && changed.link?.token !== before.link?.token && changed.todo === true, `${reset.status}, ${done.status}: new link ${changed.link?.token !== before.link?.token}, to-do done ${changed.todo}`);

  // Signed out, with only the public key the site ships.
  for (const [name, path] of [['trips', `/rest/v1/trips?id=eq.${trip}`], ['trip_links', `/rest/v1/trip_links?trip_id=eq.${trip}`]]) {
    const r = await probe(b, { path });
    check(`Signed out, reads ${name}`, (r.status === 200 && Array.isArray(r.body) && r.body.length === 0) || r.status >= 400, said(r));
  }

  // 3. A's trip is untouched: same name, no plan from B, still there.
  await a.reload();
  await a.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  const aTrip = await probe(a, { path: `/rest/v1/trips?id=eq.${trip}&select=name`, token: A.token });
  const aItems = await probe(a, { path: `/rest/v1/items?trip_id=eq.${trip}&title=eq.B%20was%20here&select=id`, token: A.token });
  check("A's trip is untouched", aTrip.body?.[0]?.name === TRIP_NAME && aItems.body?.length === 0, `${JSON.stringify(aTrip.body)} ${JSON.stringify(aItems.body)}`);

  // The page the screenshot shows: what B tried and what came back.
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const report = await bCtx.newPage();
  await report.setViewportSize({ width: 1280, height: 800 });
  await report.setContent(`<!doctype html><meta charset="utf-8"><body style="font:14px/1.45 system-ui;margin:28px;color:#1c1917">
    <h1 style="font-size:20px;margin:0 0 4px">TripTab security test: a second account is refused (${new Date().toISOString().slice(0, 10)})</h1>
    <p style="margin:0 0 14px;color:#57534e">Site ${esc(h.BASE)}, ${SUPABASE.includes('pptzbogslzicfyjooqra') ? 'the production database' : 'the TripTab dev database'}. Signed in as <b>RLS test B</b> (${esc(B.user.slice(0, 8))}...), trying <b>RLS test A</b>'s trip ${esc(trip.slice(0, 8))}... from B's browser, with B's own sign-in.</p>
    <table style="border-collapse:collapse;width:100%">${out.checks
      .map((c) => `<tr style="border-top:1px solid #e7e5e4"><td style="padding:4px 8px;width:30px">${c.ok ? '&#10003;' : '&#10007;'}</td><td style="padding:4px 8px;width:330px">${esc(c.name)}</td><td style="padding:4px 8px;font:12px ui-monospace,monospace;color:#44403c">${esc(c.got.slice(0, 120))}</td></tr>`)
      .join('')}</table>
    <p style="margin:14px 0 0;color:#57534e">${out.checks.filter((c) => c.ok).length} of ${out.checks.length} as they should be: refused or empty for B, and the control working for A.</p></body>`);
  await report.screenshot({ path: `${h.OUT}/rls-refused-api.png`, fullPage: true });

  // 4. Clean up: A deletes the trip in the app (Stops and dates in Travel and lodging, Delete trip).
  a.on('dialog', (d) => d.accept());
  await a.getByRole('button', { name: 'Stops and dates' }).click();
  await h.dlg(a).getByRole('button', { name: 'Delete trip' }).click();
  await a.waitForURL(/\/trips$/);
  const gone = await probe(a, { path: `/rest/v1/trips?id=eq.${trip}&select=id`, token: A.token });
  out.tripDeleted = Array.isArray(gone.body) && gone.body.length === 0;

  out.errors = h.errors.filter((e) => !/status of (40[0-9]|500)/.test(e)); // the probes' own refusals
  out.pass = out.checks.every((c) => c.ok) && out.tripDeleted && out.phoneOverflow <= 0;
  console.log(JSON.stringify(out, null, 2));
  console.log(`\nNow delete the two test accounts: ${out.accounts.a.email} and ${out.accounts.b.email}`);
  await browser.close();
  if (!out.pass) process.exit(1);
})().catch((e) => {
  console.error('PROOF FAILED:', e.message.split('\n').slice(0, 4).join(' | '));
  console.error('errors so far:', h.errors);
  process.exit(1);
});
