# CLAUDE.md

TripTab, Mike Pezza's project for Building with AI (TECH-GB.2160 F2, NYU Stern, Fall 2026), and a product he plans to keep running after the course. When two instructions disagree, Mike's latest dated call wins; when that's unclear, ask him.

Read first:

- [AGENTS.md](./AGENTS.md): stack, commands, project structure and engineering rules.
- [docs/PRODUCT_VISION.md](./docs/PRODUCT_VISION.md): the product vision, and the scope we build to. It is an export; the Product Vision tab of the runbook is the one place it is edited. Re-export after every edit so the two match.
- [docs/DESIGN.md](./docs/DESIGN.md): the look, value by value.
- [docs/index.html](./docs/index.html): the Product Page, living PRD and weekly build log.

Read when the task needs it: [Plan.md](./Plan.md) (the Build 2 plan; section 5 has the AI prices, caps and measured costs) and [journal/evals/README.md](./journal/evals/README.md) (eval results). `Intent.md`, `SPONSOR_MEMO.md`, `tests/README.md` and the `journal/build-0N` files are the course's templates.

## Where the work happens

- **Cloud sessions** on the TripTab cloud environment (full network access). Mike no longer runs the app on his laptop (11/18). There is no Browser pane: start the dev server and check the app with the pre-installed headless Chromium (Playwright). If `app/.env.local` is missing, write it from the App settings block on the runbook's For Claude tab (public values only).
- **Product calls happen here, in chat (Mike's call, 11/18).** End a session with at most five numbered calls, each with your recommendation; Mike answers in a line. Write his answer, dated, into Decided calls or the Product Vision tab, then re-export the vision. A call he hasn't answered waits in Open calls, numbered (C1, C2) and with your recommendation, and nowhere else: no suggestion cards. His TripTab project in Claude is archived (11/18); the Sponsor Memo, pricing and research happen here too.
- **A session starts from one line.** This file and the runbook's Steps table carry the rest, so don't ask Mike for a long prompt or write him one.
- **Course admin is yours too (Mike's call, 11/18).** At the start of a session, sync Icerynk (course key `fa26-tech-gb-2160-dm2-f2`, read-only) into Steps: due dates, pod check-ins, announcements, feedback and redos. The steps are under Course admin on the runbook's For Claude tab. Grades and feedback are private to Mike: runbook only, never the repo or the Product Page. Mike does all submitting.

## Scope: build the vision; each brief is a floor

Mike's call (11/11): each weekly build brief is the minimum, not a cap. Build the full product in the vision, in the order the runbook sets, and keep going past each week's minimum. Two guardrails: each Monday's submission still shows working evidence for that week's required items, and breadth without proof scores a 3, so finish and verify one piece before starting the next. Build mode (Mike's call, 11/18): nothing waits on a pod test; take the vision as far as it goes.

## Current build: Build 3, due Mon 11/23 at noon

Advanced lane (Mike's call, 11/17): the app moves to triptab.org on Cloudflare, every merge to main deploys once the tests pass, each pull request gets a preview on a separate dev database, and a security audit goes in SECURITY.md. The required items and the work order are in the runbook's Steps table and Build 3 session block. Builds are due Mondays at noon, New York time; each can be redone once within 7 days of feedback. Replace this section when the build is submitted.

## Design

- The spring app is the reference; `docs/DESIGN.md` has its palette, type, glass and timeline. Port the look, not the data model.
- Text is always dark and easy to read (Mike's call, 11/16). Suggested: the same dark text, marked by a dotted outline. Planned: a solid card with the kind's colored stripe. Confirmed (paid): the green "$ ✓" on top.
- The people on a trip and the group link are one People panel; the link is a section inside it (Mike's call, 11/16).
- Pod feedback counts from the 11/17 pod test of this build; its notes are on the runbook's Product Vision tab under Raised 11/17. The 11/10 pod saw the broken spring app.

## Runbook

The runbook is a Claude Docs doc: https://claude.ai/artifact/UKfiqc1zX1vRdFo1shMVNV. What Mike has to do lives there, nowhere else. Its tabs (Mike's layout call, 11/18):

- **Run book**, the one screen Mike reads: a short status, Steps, and Open calls. One line a row.
- **Product Vision**, the one place the vision is edited.
- **Build history**: done steps.
- **For Claude**, which Mike doesn't read: the table rules, the session block, the prompts, the app's public settings, and Decided calls (the archive).

- Anything Mike has to do goes in the Steps table, with the detail on the For Claude tab. Leave the column widths as Mike sets them, and edit rows in place rather than replacing the table. Give each row you run a suggested model and effort. Keep the Steps table in the order things come up: put each new row where it falls, move done rows to Build history, then renumber the open rows top to bottom starting after the highest number in Build history, and refer to other rows by name, never by number.
- Mike's decisions are in Decided calls and on the Product Vision tab. Don't re-ask them.
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
