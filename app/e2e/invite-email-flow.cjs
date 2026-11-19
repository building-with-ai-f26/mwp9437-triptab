// Invite emails from the People panel (Build 3). The send-invite function's answers are faked here,
// so no email goes out: a sent invite turns the button to "Emailed", and a refused one (a rate
// limit) shows why under that person. The function itself is tested live in src/invite.live.test.ts.
// Screens at 1280 and 390. Run with `npm run dev` going.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

// Adding someone with an email sends their invite unless the box is unticked (Mike's 11/19 review).
async function addPerson(page, name, email, invite = false) {
  await page.locator('section[aria-labelledby="people-title"]').getByRole('button', { name: 'Add', exact: true }).click();
  const d = h.dlg(page);
  await d.getByLabel('Name').fill(name);
  await d.getByLabel('Email (optional)').fill(email);
  const box = d.getByLabel('Email them an invite now');
  const ticked = await box.isChecked();
  if (!invite) await box.uncheck();
  await d.getByRole('radio', { name: 'Viewer' }).click();
  await d.getByRole('button', { name: 'Add to trip' }).click();
  await d.getByText(`Added ${name}`).waitFor();
  const note = (await d.getByTestId('added-note').innerText()).trim();
  await d.getByRole('button', { name: 'Done' }).click();
  return { tickedByDefault: ticked, note };
}

// A person's row, by the name line itself (a plain text match would also find "Jo" in "joined").
const row = (page, name) =>
  page.locator('section[aria-labelledby="people-title"] li').filter({ has: page.locator('p.truncate', { hasText: new RegExp(`^${name}( |$)`) }) });

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    const ctx = await h.context(browser, h.DESKTOP);
    const sent = [];
    await ctx.route('**/functions/v1/send-invite', async (route) => {
      const body = route.request().postDataJSON();
      sent.push(body);
      const capped = sent.length === 2; // the second email (Kim's) hits the limit
      await route.fulfill({
        status: capped ? 429 : 200,
        contentType: 'application/json',
        body: JSON.stringify(capped
          ? { code: 'capped_person', error: "They've had 3 invite emails today. Try again tomorrow, or text them the link." }
          : { ok: true, to: 'Jo' }),
      });
    });
    const o = h.watch(await ctx.newPage(), 'owner');
    const tripUrl = await h.startSkiTrip(o);
    await addPerson(o, 'Jo', `jo-${h.run}@example.com`);
    await addPerson(o, 'Kim', `kim-${h.run}@example.com`);

    await row(o, 'Jo').getByRole('button', { name: 'Email' }).click();
    await row(o, 'Jo').getByRole('button', { name: 'Emailed' }).waitFor();
    result.joEmailed = await row(o, 'Jo').getByRole('button', { name: 'Emailed' }).isDisabled();
    result.sentFor = sent[0] && { tripMatches: tripUrl.endsWith(sent[0].trip_id), hasTraveler: Boolean(sent[0].traveler_id) };

    await row(o, 'Kim').getByRole('button', { name: 'Email' }).click();
    await row(o, 'Kim').getByRole('alert').waitFor();
    result.kimNote = (await row(o, 'Kim').getByRole('alert').textContent()).trim();
    result.kimCanRetry = await row(o, 'Kim').getByRole('button', { name: 'Email' }).isEnabled();

    // Added with an email and the box left ticked: the invite goes out at once.
    const lee = await addPerson(o, 'Lee', `lee-${h.run}@example.com`, true);
    result.leeTickedByDefault = lee.tickedByDefault;
    result.leeNote = lee.note;
    result.leeSent = sent.length === 3 && Boolean(sent[2].traveler_id);
    await row(o, 'Kim').scrollIntoViewIfNeeded();
    await h.shot(o, 'people-email-desktop');

    // Phone: the row with its note still fits.
    const pCtx = await browser.newContext({ ...h.PHONE, storageState: await ctx.storageState() });
    const p = h.watch(await pCtx.newPage(), 'owner-phone');
    await p.goto(tripUrl);
    await p.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
    await p.getByRole('tab', { name: /People/ }).click();
    await row(p, 'Kim').waitFor();
    result.phoneOverflow = await h.overflowX(p);
    await h.shot(p, 'people-email-phone');
  } catch (e) {
    result.failure = String(e);
  } finally {
    // The faked 429 shows in the console as a failed resource; it's the refusal this test asks for.
    result.errors = h.errors.filter((e) => !e.includes('status of 429'));
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
    const ok = result.joEmailed && result.kimCanRetry && result.leeTickedByDefault && /emailed them their invite/.test(result.leeNote) && result.leeSent && result.phoneOverflow <= 0;
    if (result.failure || result.errors.length || !ok) process.exit(1);
  }
})();
