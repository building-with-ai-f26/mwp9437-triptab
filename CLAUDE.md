# CLAUDE.md

TripTab, Mike Pezza's project for Building with AI (TECH-GB.2160 F2, NYU Stern, Fall 2026), and a product he plans to keep running after the course. Read these first:

- [AGENTS.md](./AGENTS.md): stack, commands and engineering rules.
- [docs/PRODUCT_VISION.md](./docs/PRODUCT_VISION.md): the product vision, and the scope we build to. It is an export; the Product Vision tab of the runbook is the one place it is edited. Re-export after every edit so the two match.
- [docs/index.html](./docs/index.html): the Product Page, living PRD and weekly build log.
- [Plan.md](./Plan.md) and [journal/](./journal/): the course's planning and build-note templates.

## Where the work happens (from 11/11)

- **Build here, on Mike's laptop:** a Claude Code session in the Claude desktop app's Code tab, opened on `C:\Users\mpezza\code\mwp9437-triptab`. Run the app in the Code tab's Browser pane so Mike and Claude look at the same screen. Before calling a change done, click through it there and check it at desktop and phone width.
- **Product calls** happen in Mike's TripTab project in Claude; the decisions land in the Product Vision tab of the runbook, then get exported here.
- **Course admin** (Icerynk, due dates, pod check-ins, grades, redos) runs in Mike's NYU Stern MBA project. Leave it there.

## Scope: build the vision; each brief is a floor

Mike's call (11/11): each weekly build brief is the minimum, not a cap. Build the full product in the vision, in the order of its course plan, and keep going past each week's minimum. Two guardrails: each Monday's submission still shows working evidence for that week's required items, and breadth without proof scores a 3, so finish and verify one piece before starting the next.

## Build 2 minimum (due Mon 11/16, noon; from the Week 2 page on Icerynk)

- One complete user action working locally, with a real AI or API call. Keys in `app/.env.local`, never on GitHub. A screenshot or recording on the Product Page.
- PostHog on the Product Page and the local app; pageviews, clicks and session replay checked in PostHog.
- PRD v2: the biggest risk, how this build tests it, how the app works, estimated cost per user run.
- AGENTS.md: project structure and how to set up and run it locally.
- Mike submits the Product Page URL, the repo URL and a PostHog dashboard screenshot, and brings the local app to class on 11/17 for pod testing.

## Design

- The spring app is the reference: liquid glass cards over full-bleed travel photography, Playfair Display headlines with DM Sans body text, the sand, gold and brown palette, brown pill buttons, and the itinerary timeline with day chips. Its code is at github.com/mwp9437/triptab-RETIRED (`src/index.css`, `tailwind.config.ts`, `src/components/`). Port the look, not the data model.
- Suggested plans are faint on purpose and turn solid when confirmed. Keep that.
- The pod feedback from 11/10 (less glass, darker text, the popup's position) was about the broken spring app, not this build. Don't act on it until the pod has tried the new build.

## Runbook

The runbook is a Claude Docs doc: https://claude.ai/artifact/UKfiqc1zX1vRdFo1shMVNV (Run book, Product Vision and Build history tabs). Anything Mike has to do goes in its Steps table when this session can reach the Claude Docs connector. If it can't, list it under "For Mike" at the top of the current `journal/build-0N` file and say so in chat. Keep the Target column at width 130 on any row you add.

## Rules

- Icerynk course key `fa26-tech-gb-2160-dm2-f2`. The Icerynk connector is read-only; Mike does all submitting. Builds are due Mondays at noon, New York time; each can be redone once within 7 days of feedback.
- The app stays on localhost through Build 4 and goes online for Build 5, unless Mike decides to put it online sooner for the ski group (runbook step 67).
- Commits on two separate days each week, outside class (class is Tuesday, 9 to 11:50 AM).
- Commits are authored as Mike Pezza (mwp9437@stern.nyu.edu) with no Co-Authored-By or other AI trailer (Mike's call; the course doesn't require one). The build log names the agent under costs.
- Never fabricate user tests, analytics, evals or cost logs; the course treats that as an integrity violation. Costs in the build log are real: Claude Max at $100 a month plus any API spend.
- Nothing is done until a test or a click-through shows it. Check every screen at phone width.
- Before anything goes to Icerynk, read the Product Page and PRD against the build brief and list every placeholder, TODO or unfinished line in the runbook as a blocker for Mike.
- Secrets stay out of the repo and the chat: use `app/.env.local` (gitignored by `.env.*`). Never open other students' repos.
- Any paid API (OpenRouter or an AI provider) gets a prepaid balance with a hard spend cap before its first call, and every AI call logs its tokens and cost from the first one.
- The spring version is for ideas and code, not its data model: github.com/mwp9437/triptab-RETIRED, and `triptab-spring-archive` in `C:\Users\mpezza\OneDrive\1. Keystone\1. NYU Stern MBA\2026 Fall Semester\8. Software Eng with AI\output\`.
- No em dashes anywhere: commas, periods, colons, semicolons or parentheses instead.
