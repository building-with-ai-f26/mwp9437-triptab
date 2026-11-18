# CLAUDE.md

TripTab, Mike Pezza's project for Building with AI (TECH-GB.2160 F2, NYU Stern, Fall 2026), and a product he plans to keep running after the course. When two instructions disagree, Mike's latest dated call wins; when that's unclear, ask him.

Read first:

- [AGENTS.md](./AGENTS.md): stack, commands, project structure and engineering rules.
- [docs/PRODUCT_VISION.md](./docs/PRODUCT_VISION.md): the product vision, and the scope we build to. It is an export; the Product Vision tab of the runbook is the one place it is edited. Re-export after every edit so the two match.
- [docs/DESIGN.md](./docs/DESIGN.md): the look, value by value.
- [docs/index.html](./docs/index.html): the Product Page, living PRD and weekly build log.

Read when the task needs it: [Plan.md](./Plan.md) (the Build 2 plan; section 5 has the AI prices, caps and measured costs) and [journal/evals/README.md](./journal/evals/README.md) (eval results). `Intent.md`, `SPONSOR_MEMO.md`, `tests/README.md` and the `journal/build-0N` files are the course's templates.

## Where the work happens (from 11/11)

- **When Mike steps away, a cloud session:** the TripTab cloud environment (full network access). There is no Browser pane: start the dev server and check the app with the pre-installed headless Chromium (Playwright). If `app/.env.local` is missing, write it from the runbook's Run the app on your laptop block (public values only).
- **When Mike is watching, his laptop:** the Claude desktop app's Code tab, opened on `code\mwp9437-triptab` in his user folder (outside OneDrive), with the app in the Browser pane so Mike and Claude look at the same screen.
- **Product calls** happen in Mike's TripTab project in Claude; the decisions land on the runbook's Product Vision tab, then get exported here.
- **Course admin** (due dates, pod check-ins, grades, redos) runs in Mike's NYU Stern MBA project. Leave it there. Read a build's brief on Icerynk when you need it (course key `fa26-tech-gb-2160-dm2-f2`; the connector is read-only, and Mike does all submitting).

## Scope: build the vision; each brief is a floor

Mike's call (11/11): each weekly build brief is the minimum, not a cap. Build the full product in the vision, in the order the runbook sets, and keep going past each week's minimum. Two guardrails: each Monday's submission still shows working evidence for that week's required items, and breadth without proof scores a 3, so finish and verify one piece before starting the next.

## Current build: Build 3, due Mon 11/23 at noon

Advanced lane (Mike's call, 11/17): the app moves to triptab.org on Cloudflare, every merge to main deploys once the tests pass, each pull request gets a preview on a separate dev database, and a security audit goes in SECURITY.md. The required items and the work order are in the runbook's Steps table and Build 3 session block. Builds are due Mondays at noon, New York time; each can be redone once within 7 days of feedback. Replace this section when the build is submitted.

## Design

- The spring app is the reference; `docs/DESIGN.md` has its palette, type, glass and timeline. Port the look, not the data model.
- Text is always dark and easy to read (Mike's call, 11/16). Suggested: the same dark text, marked by a dotted outline. Planned: a solid card with the kind's colored stripe. Confirmed (paid): the green "$ ✓" on top.
- The people on a trip and the group link are one People panel; the link is a section inside it (Mike's call, 11/16).
- Pod feedback counts from the 11/17 pod test of this build; its notes are on the runbook's Product Vision tab under Raised 11/17. The 11/10 pod saw the broken spring app.

## Runbook

The runbook is a Claude Docs doc: https://claude.ai/artifact/UKfiqc1zX1vRdFo1shMVNV (Run book, Product Vision and Build history tabs). Everything Mike needs to know or do lives there, nowhere else.

- Anything Mike has to do goes in its Steps table. Keep the Target column at width 130 on any row you add. Keep the Steps table in the order things come up: put each new row where it falls, move done rows to Build history, then renumber the open rows top to bottom starting after the highest number in Build history, and refer to other rows by name, never by number.
- Mike's decisions are in its Your calls table and on the Product Vision tab. Don't re-ask them.
- If this session can't reach the Claude Docs connector, list what Mike has to do under "For Mike" at the top of the current `journal/build-0N` file and say so in chat.

## Rules

- Nothing is done until a test or a click-through shows it. Check every screen at desktop and phone width (1280 and 390).
- Merging (Mike's call, 11/16): merge and publish your own pull requests once the tests and a click-through pass, unless the session's prompt asks for a pull request to review. Anything that deletes or rewrites existing data waits for Mike's OK.
- The live app (online since Mike's 11/16 call) is on GitHub Pages at https://building-with-ai-f26.github.io/mwp9437-triptab/app/, built into `docs/app` with `npm run build:pages`. Until the Cloudflare move lands, rebuild and commit `docs/app` whenever a change should go live; then update this line and AGENTS.md.
- Commits on two separate days each week, outside class (class is Tuesday, 9 to 11:50 AM).
- Commits are authored as Mike Pezza (mwp9437@stern.nyu.edu) with no Co-Authored-By or other AI trailer (Mike's call; the course doesn't require one). The build log names the agent under costs.
- Never fabricate user tests, analytics, evals or cost logs; the course treats that as an integrity violation. Costs in the build log are real: Claude Max at $100 a month, the triptab.org domain, and API spend at list price from the `ai_calls` log.
- Before anything goes to Icerynk, read the Product Page and PRD against the build brief and list every placeholder, TODO or unfinished line in the runbook as a blocker for Mike.
- Secrets stay out of the repo, the chat and tool calls. `app/.env.local` (gitignored) holds only public values. Server secrets live in Supabase: check them by name only (`ai-status`), never read, print or log a value, and have Mike enter a new one himself. Never open other students' repos.
- AI calls (Mike's calls, 11/16): the Claude API on his Max plan's $100 monthly credit, Claude Haiku 5.5 at low effort, from Edge Functions only, behind the Owner check, the caps (`AI_DAILY_CAP_USD`, 20 calls a person a day) and the `ai_calls` cost log. A new AI feature gets a 10-case eval before Mike sees it; a prompt change ships only once its eval shows no drop. Eval cases are made up; never commit Mike's real emails or receipts.
- Money (Mike's call, 11/17): up to $50 for TripTab in all beyond Claude Max, the domain included. Ask before anything that costs money, and give any other paid service a hard spend cap before its first use.
- The spring version is for ideas and code, not its data model: github.com/mwp9437/triptab-RETIRED, and `triptab-spring-archive` in `C:\Users\mpezza\OneDrive\1. Keystone\1. NYU Stern MBA\2026 Fall Semester\8. Software Eng with AI\output\`.
- No em dashes anywhere: commas, periods, colons, semicolons or parentheses instead.
