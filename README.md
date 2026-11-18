# TripTab

> **One-line pitch:** For friends on a group trip: confirming a plan logs who paid and who joined, so the settle-up is always current.

- **Builder:** Mike Pezza (`@mwp9437`)
- **Pod:** Pod 9
- **Product Page & Living PRD:** https://building-with-ai-f26.github.io/mwp9437-triptab/
- **App:** https://building-with-ai-f26.github.io/mwp9437-triptab/app/ (online since November 16)

## Where it stands

Builds 1 and 2 are submitted; Build 3 is due Monday, November 23 at noon, New York time. The living PRD and the weekly build log, with screenshots, costs and hours, are on the [Product Page](https://building-with-ai-f26.github.io/mwp9437-triptab/).

## Repository map

| File / folder | Purpose |
| --- | --- |
| [`docs/index.html`](./docs/index.html) | Required public pitch, living PRD, and weekly build log. Update with actual work and evidence. |
| [`Intent.md`](./Intent.md), [`Plan.md`](./Plan.md), [`journal/`](./journal/) | Optional drafting aids. No duplicate submission is required. `journal/evals/` holds the AI eval results. |
| [`AGENTS.md`](./AGENTS.md), [`CLAUDE.md`](./CLAUDE.md) | Local run commands, project structure, and agent rules. |
| [`tests/`](./tests/) | Verification guidance. Build 4 offers Track A domain evals **or** Track B user replays; TripTab takes Track A (`app/evals/`). |
| [`SPONSOR_MEMO.md`](./SPONSOR_MEMO.md) | One-page recommendation backed by actual usage, full costs, and risks. Due December 14 at noon. |

[Icerynk](https://www.icerynk.com/c/fa26-tech-gb-2160-dm2-f2/content) holds the assignment instructions and submissions.

## Local setup

You need [Git](https://git-scm.com/downloads) and [Node.js](https://nodejs.org/) 20 or 22 (LTS); check with `node -v`. The same commands work in PowerShell on Windows and in Terminal on a Mac.

```bash
git clone https://github.com/building-with-ai-f26/mwp9437-triptab.git
cd mwp9437-triptab/app
npm install
```

Create `app/.env.local` from `app/.env.example` with the Supabase URL and publishable key (see [AGENTS.md](./AGENTS.md#set-up-and-run-locally); both are public values, and git ignores the file). Then:

```bash
npm run dev     # open http://localhost:5173
npm test        # the offline tests: split and settle-up math, the data model, the timeline, the AI output checks
```

Already cloned? Run `git pull` in `mwp9437-triptab`, then `npm install` again in `app`. Stop the app with Ctrl+C.

**Try it (about two minutes):**

1. Click **Start a trip** and create an account (name, email, password; no email to confirm).
2. Click **Fill in the ski trip example** (Chamonix, Barcelona, Andorra) and **Start the trip**. You land on a blank itinerary.
3. Tap a Morning slot to add a plan; leave it Suggested (dotted outline) or make it Planned (solid, with a colored stripe). Tap **Add where everyone's staying** to add the Airbnb with check-in and check-out.
4. In **People**, add a friend as a Viewer. Copy the **Group link**, open it in a private window, pick their name, make an account, and join: they see the trip but can't change it.
