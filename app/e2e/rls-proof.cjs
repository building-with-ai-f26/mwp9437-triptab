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
  ];
  for (const [name, path] of reads) {
    const r = await probe(b, { path, token: t });
    check(`B reads ${name}`, r.status === 200 && Array.isArray(r.body) && r.body.length === 0, said(r));
  }
  // Every table, unfiltered: B, on no trip, sees none of anyone else's rows.
  const tables = ['trips', 'stops', 'travelers', 'items', 'item_people', 'trip_links', 'expenses', 'expense_shares', 'payments', 'action_items', 'ai_calls', 'invite_emails', 'account_events', 'email_checks'];
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
    <p style="margin:14px 0 0;color:#57534e">${out.checks.filter((c) => c.ok).length} of ${out.checks.length} refused or empty, as they should be.</p></body>`);
  await report.screenshot({ path: `${h.OUT}/rls-refused-api.png`, fullPage: true });

  // 4. Clean up: A deletes the trip in the app (Trip settings, Delete trip).
  a.on('dialog', (d) => d.accept());
  await a.getByRole('button', { name: 'Trip settings' }).click();
  await h.dlg(a).getByRole('button', { name: 'Delete trip' }).click();
  await a.waitForURL(/\/trips$/);
  const gone = await probe(a, { path: `/rest/v1/trips?id=eq.${trip}&select=id`, token: A.token });
  out.tripDeleted = Array.isArray(gone.body) && gone.body.length === 0;

  out.errors = h.errors.filter((e) => !/status of (40[0-9])/.test(e));
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
