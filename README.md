# TripTab

> **One-line pitch:** For friends on a group trip: confirming a plan logs who paid and who joined, so the settle-up is always current.

- **Builder:** Mike Pezza (`@mwp9437`)
- **Pod:** Pod 9
- **Product Page & Living PRD:** https://building-with-ai-f26.github.io/mwp9437-triptab/
- **App:** runs locally through Week 4; add a cloud URL in Build 5.

## Start here: Build 1

**Due Monday, November 9 at noon, New York time.** No class November 3; keep building that week.

1. Join the [class organization](https://github.com/building-with-ai-f26), then use this template to create a **public** repo named `<netid>-<project-slug>`. Ask Christian or Hew if the organization is missing from the owner list.
2. Set up Git and one coding agent during the week of October 27. Follow the [Icerynk setup guide](https://www.icerynk.com/c/fa26-tech-gb-2160-dm2-f2/content/pre-class-setup-github-openrouter-your-coding-agent).
3. Publish [`docs/index.html`](./docs/index.html): **Settings → Pages → Deploy from a branch → main → /docs → Save**. When deployment finishes, open `https://building-with-ai-f26.github.io/<your-repo-name>/`.
4. Fill in PRD v1: a reachable user, their painful before/after workflow, one core workflow, and three non-goals.
5. Build a rough local prototype. Add a screenshot or GIF and an honest Build 1 log to the Product Page, including progress, learning, problems, costs, and hours.
6. Push meaningful commits on **at least two separate days each week outside class**, including the November 3 break.
7. Submit your **Product Page URL and repository URL in Icerynk**. Come ready to demo the prototype in two minutes on November 10.

Create your PostHog account in Week 1. Install it on the Product Page and local app in **Build 2**, then verify events. The Product Page is public from Build 1; the app can stay local through Week 4.

## Repository map

| File / folder | Purpose |
| --- | --- |
| [`docs/index.html`](./docs/index.html) | Required public pitch, living PRD, and weekly build log. Update with actual work and evidence. |
| [`Intent.md`](./Intent.md), [`Plan.md`](./Plan.md), [`journal/`](./journal/) | Optional drafting aids. No duplicate submission is required. |
| [`AGENTS.md`](./AGENTS.md) | Local run commands, project context, and agent rules. Build 2 onward. |
| [`tests/`](./tests/) | Verification guidance. Build 4 offers Track A domain evals **or** Track B user replays. |
| [`SPONSOR_MEMO.md`](./SPONSOR_MEMO.md) | One-page recommendation backed by actual usage, full costs, and risks. Due December 14 at noon. |

[Icerynk](https://www.icerynk.com/c/fa26-tech-gb-2160-dm2-f2/content) holds the assignment instructions and submissions.

## Local setup

You need [Git](https://git-scm.com/downloads) and [Node.js](https://nodejs.org/) 20 or 22 (LTS); check with `node -v`. The same commands work in PowerShell on Windows and in Terminal on a Mac.

```bash
git clone https://github.com/building-with-ai-f26/mwp9437-triptab.git
cd mwp9437-triptab/app
npm install
npm run dev     # open the localhost link it prints (usually http://localhost:5173)
npm test        # 8 tests on the split and settle-up math
```

Already cloned? Run `git pull` in `mwp9437-triptab`, then `npm install` again in `app`. Stop the app with Ctrl+C.

**Try the core loop (about a minute):**

1. Click **Load sample trip** (four friends in Lisbon, three suggested plans).
2. Confirm the seafood dinner: $240 total, Mike paid, all four joined.
3. Confirm the Sintra tickets: $35 per person, paid by Alex, untick Sam.
4. **Settle up** shows three payments: Priya pays Mike $95, Sam pays Mike $50, Sam pays Alex $10.

Data stays in your browser (localStorage); **New trip** clears it. No accounts or API keys are needed yet. When keys arrive, they go in `app/.env.local`, which git ignores; `.env.example` holds placeholders only.
