// Your profile, You (C50, Mike's call 11/23), at 1280 and 390 wide. Vic makes an account and fills
// in You once: name, Venmo, Zelle and phone, with the email shown as the one he signs in with. He
// joins Mike's trip in one tap and his profile is on it, in place of the Venmo Mike had guessed,
// and locked: Mike can't change it. Vic unlocks it in You; Mike can then fix it on his trip. Needs
// the profiles migration (TripTab dev has it once its pull request has built). Run with
// `npm run dev` going.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

const people = (page) => page.locator('section[aria-labelledby="people-title"]');
const TRIP = /\/trips\/[0-9a-f-]{36}$/;

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const phone = label === 'phone';
  const tab = async (page, name) => phone && (await page.getByRole('tab', { name: new RegExp(name) }).click());

  // ---------- Vic: an account, then You ----------
  const v = h.watch(await (await h.context(browser, opts)).newPage(), `vic-${label}`);
  await v.goto(`${h.BASE}/sign-in?next=/trips`);
  await h.signUp(v, 'Vic', `profile-vic-${label}`);
  await v.waitForURL(/\/trips$/);
  await v.getByRole('button', { name: 'You: your profile' }).click();
  const form = v.getByRole('form', { name: 'Your profile' });
  await form.waitFor();
  r.name = await form.getByLabel(/^Name/).inputValue();
  r.email = (await v.getByTestId('you-email').innerText()).trim() === `demo-${h.run}-profile-vic-${label}@example.com`;
  r.startsLocked = (await form.getByRole('radio', { name: /^Locked/ }).getAttribute('aria-checked')) === 'true';
  await form.getByLabel('Venmo username').fill('@vic-tt');
  await form.getByLabel('Zelle phone or email').fill('555-12');
  await form.getByRole('button', { name: 'Save' }).click();
  r.shortZelle = (await form.getByRole('alert').innerText()).trim();
  await form.getByLabel('Zelle phone or email').fill('(555) 123-4567');
  await form.getByLabel(/^Phone/).fill('917-555-0142');
  r.overflow = await h.overflowX(v);
  r.minTap = await form.locator('input, button').evaluateAll((els) => Math.min(...els.map((e) => Math.round(e.getBoundingClientRect().height))));
  await form.getByRole('button', { name: 'Save' }).click();
  await v.getByText('Saved, on all your trips.').waitFor();
  await h.shot(v, `profile-you-${label}`);
  // It's there on a reload.
  await v.reload();
  await form.waitFor();
  r.kept = [await form.getByLabel('Venmo username').inputValue(), await form.getByLabel('Zelle phone or email').inputValue(), await form.getByLabel(/^Phone/).inputValue()].join(' | ');

  // ---------- Mike starts a trip and adds Vic with a guess at his Venmo ----------
  const o = h.watch(await (await h.context(browser, opts)).newPage(), `owner-${label}`);
  await h.startSkiTrip(o, `profile-owner-${label}`);
  await tab(o, 'People');
  await people(o).getByRole('button', { name: 'Add', exact: true }).click();
  await h.dlg(o).getByLabel('Name').fill('Vic');
  await h.dlg(o).getByLabel('Venmo (optional)').fill('@vic-guess');
  await h.dlg(o).getByRole('button', { name: 'Add to trip' }).click();
  await h.dlg(o).getByText('Added Vic').waitFor();
  await h.dlg(o).getByRole('button', { name: 'Done' }).click();
  const link = (await o.locator('section[aria-labelledby="link-title"] code').textContent()).trim();

  // ---------- Vic joins in one tap; his profile is on the trip, locked ----------
  await v.goto(link);
  await v.getByText(/Join as/).waitFor();
  await v.getByRole('button', { name: 'Join the trip' }).click();
  await v.waitForURL(TRIP);
  await v.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  await o.reload();
  await o.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  await tab(o, 'People');
  const vicRow = people(o).locator('li').filter({ hasText: 'Vic' });
  r.onTheTrip = (await vicRow.getByTestId('pay-line').innerText()).replace(/\s+/g, ' ').trim();
  r.phoneForOwner = (await vicRow.innerText()).includes('917-555-0142');
  r.locked = (await vicRow.getByRole('button', { name: /^Locked: only Vic can change this/ }).count()) === 1;
  r.noChangeWhileLocked = (await vicRow.getByRole('button', { name: /Venmo/ }).count()) === 0;
  await vicRow.scrollIntoViewIfNeeded();
  await h.shot(o, `profile-locked-${label}`);

  // ---------- Vic unlocks it in You; Mike can fix it on his trip ----------
  await tab(v, 'People');
  await people(v).getByRole('link', { name: 'Your profile' }).click();
  await form.waitFor();
  await form.getByRole('radio', { name: /^Unlocked/ }).click();
  await form.getByRole('button', { name: 'Save' }).click();
  await v.getByText('Saved, on all your trips.').waitFor();
  await h.shot(v, `profile-unlocked-${label}`);
  await o.reload();
  await o.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  await tab(o, 'People');
  r.unlockedForOwner = (await vicRow.getByRole('button', { name: /^Locked/ }).count()) === 0;
  await vicRow.getByRole('button', { name: /Venmo/ }).click();
  await h.dlg(o).getByLabel('Venmo username').fill('@vic-fixed');
  await h.dlg(o).getByRole('button', { name: 'Save' }).click();
  await vicRow.getByText('@vic-fixed').waitFor();
  r.ownerFixed = true;
  // Vic's own profile keeps what he saved.
  await v.reload();
  await form.waitFor();
  r.profileKeepsHis = await form.getByLabel('Venmo username').inputValue();

  // ---------- A new name is what the next trip offers ----------
  await form.getByLabel(/^Name/).fill('Victor');
  await form.getByRole('button', { name: 'Save' }).click();
  await v.getByText('Saved, on all your trips.').waitFor();
  await v.reload();
  await form.waitFor();
  r.newName = await form.getByLabel(/^Name/).inputValue();
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const ok = r.name === 'Vic' && r.email && r.startsLocked && /10 digits/.test(r.shortZelle) && r.overflow <= 0 && (label !== 'phone' || r.minTap >= 44) &&
        r.kept === '@vic-tt | (555) 123-4567 | 917-555-0142' && /Venmo @vic-tt · Zelle \(555\) 123-4567/.test(r.onTheTrip) && r.phoneForOwner && r.locked &&
        r.noChangeWhileLocked && r.unlockedForOwner && r.ownerFixed && r.profileKeepsHis === '@vic-tt' && r.newName === 'Victor';
      if (!ok) result.failure = `${label}: a check failed`;
    }
  } catch (e) {
    result.failure = String(e);
  } finally {
    result.errors = h.errors.filter((e) => !e.includes('status of 400'));
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
    if (result.failure || result.errors.length) process.exit(1);
  }
})();
