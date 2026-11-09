# CLAUDE.md

TripTab, Mike Pezza's project for Building with AI (TECH-GB.2160 F2, NYU Stern, Fall 2026). Read these first:

- [AGENTS.md](./AGENTS.md): stack, commands and engineering rules.
- [docs/PRODUCT_VISION.md](./docs/PRODUCT_VISION.md): the product vision. It is an export; the Product Vision tab of the runbook is the one place it is edited. Re-export after every edit so the two match.
- [docs/index.html](./docs/index.html): the Product Page, living PRD and weekly build log.

## Runbook

The runbook is a Claude Docs doc: https://claude.ai/artifact/UKfiqc1zX1vRdFo1shMVNV (Steps tab, Product Vision tab). Every instruction for Mike goes in its Steps table, never only in chat. Keep the Target column at width 130 on any row you add.

## Rules

- Icerynk course key `fa26-tech-gb-2160-dm2-f2`. The Icerynk connector is read-only; Mike does all submitting. Builds are due Mondays at noon, New York time; each can be redone once within 7 days of feedback.
- The app stays on localhost through Build 4 and goes online for Build 5.
- Commits on two separate days each week, outside class (class is Tuesday, 9 to 11:50 AM).
- Commits are authored as Mike Pezza (mwp9437@stern.nyu.edu) with no Co-Authored-By or other AI trailer (Mike's call; the course doesn't require one). The build log names the agent under costs.
- Never fabricate user tests, analytics, evals or cost logs; the course treats that as an integrity violation. Costs in the build log are real: Claude Max at $100 a month plus any API spend.
- Nothing is done until a test or a click-through shows it. Check every screen at phone width.
- Before anything goes to Icerynk, read the Product Page and PRD against the build brief and list every placeholder, TODO or unfinished line in the runbook as a blocker for Mike.
- Secrets stay out of the repo and the chat: use `app/.env.local` (gitignored by `.env.*`). Never open other students' repos.
- The spring version is for ideas and code, not its data model: github.com/mwp9437/triptab-RETIRED, and triptab-spring-archive in the course output folder.
- No em dashes anywhere: commas, periods, colons, semicolons or parentheses instead.
