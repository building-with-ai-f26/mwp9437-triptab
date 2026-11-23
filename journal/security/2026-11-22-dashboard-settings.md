# Dashboard settings, read 11/22 (laptop session)

What the audit couldn't see from the cloud, read on Mike's laptop in his own signed-in browser with
Claude in Chrome on 11/22, and pasted back to the cloud session as one line a step. Values only,
never a secret. SECURITY.md sections 6 and 8 are written from this.

| # | Step | Result |
|---|------|--------|
| 1 | Backup of production | **Not done.** `npx supabase@3.2.0 db dump` stopped with `DockerRunError: docker: command not found (podman also not found)`: the Supabase CLI runs `pg_dump` inside Docker, and the laptop has none. No files were written. |
| 2 | Rollback | **Works.** In Cloudflare, the `triptab` Worker, Deployments: rolled back from `7f1c247b` to `90829df9`, and https://triptab.org switched from `index-CDauWe8Q.js` to `index-DS3-vIhv.js` within seconds. Promoted `7f1c247b` again, and the site was back on `index-CDauWe8Q.js`. The database was untouched. |
| 3 | Supabase Auth, URL configuration (production) | Site URL `https://triptab.org`. Redirect URLs: only `https://triptab.org/**`. `http://localhost:5173/**` was removed with Mike's OK and checked gone after a reload. No `building-with-ai-f26.github.io` entry existed. |
| 4 | Supabase Auth, rate limits and sessions (production) | Emails sent 30 an hour; SMS 30 an hour; token refresh 150 per 5 minutes per IP; OTP and magic-link checks 30 per 5 minutes per IP; anonymous sign-ins 30 an hour per IP; sign-up and sign-in 30 per 5 minutes per IP; Web3 30 per 5 minutes; at least 60 seconds between emails to one person; IP forwarding off. Sessions: time-box 0 and inactivity timeout 0 (never), both settable only on the Pro plan; one session per person off; access tokens last 3,600 seconds; refresh-token reuse detection on, 10-second window. |
| 5 | Supabase access tokens | "TripTab deploy (Cloudflare production builds)" is limited to the TripTab project; "TripTab dev deploy (Cloudflare previews)" to TripTab dev. Both: Settings read, Database, Migrations and Edge Functions read-write; both expire 17 Feb 2027. **Also on the account: a legacy token from a Supabase CLI sign-in that opens the whole account, never used, never expires.** Left as it was. |
| 6 | Cloudflare, `triptab`, Settings, Build | The production build and Previews Base each hold their own `SUPABASE_ACCESS_TOKEN` secret. Both are encrypted, so the dashboard can't show whether the values differ. Production branch `main`; preview builds on for every other branch, with no branch filter. |
| 7 | GitHub, the repository's settings | **Partly read.** The repository is public and owned by the `building-with-ai-f26` organization; Mike's account has write, not admin, so Collaborators, Branches, Rules and Actions settings answer 404 even after a fresh sign-in. From the public API: `main` has no branch protection and no ruleset applies. One contributor (155 commits); one open pull request, from a branch in this repository. |
| 8 | PostHog, TripTab project (721211) | Session replay on (all sessions, default masking); heatmaps on; autocapture on, with web vitals; console logs on; network timing on; request bodies and headers not captured. These are the project's settings; `posthog.init` in the code can override them. |

## Checked from the cloud afterwards (11/22)

- **Step 6, whether the two keys differ.** They must: each key opens one project only (step 5), and
  both kinds of build use theirs with `set -e` (`app/scripts/supabase-deploy.sh`, `supabase/DEPLOY`
  is `on`). Pull request 69's Preview build applied its migrations and functions to TripTab dev and
  passed (Workers Builds check, 11/22 16:39 UTC), and merge builds apply them to production
  (production holds migration `20261122170000`, which only a merge build could have applied). A
  production-only key in Previews would have failed the first; a dev-only key in production, the
  second.
- **Step 7, who can push.** The collaborator list (GitHub API, 11/22): 61 accounts; 2 admins, 1 with
  write (Mike), 58 with read. Read access can't push a branch, so only those three can start a
  Preview build. GitHub Actions holds no secrets (`.github/workflows/ci.yml` runs on
  `pull_request`, with read-only permissions and only public values), so a first-time
  contributor's workflow, approved or not, has nothing to take.
- **Step 8, what the code sets.** `app/src/lib/analytics.ts` sets no console or network option, so
  the project's settings apply. The app's own code writes nothing to the console. Network timing
  records request addresses, not bodies; the app's GET requests carry only ids (`id`, `trip_id`,
  `item_id`, `user_id`, `status`), and group link tokens, codes and passwords go in POST bodies
  (`join_preview`, `join_trip`, `verifyOtp`).
- **Step 1, the server.** Production runs PostgreSQL 17.11, so a backup needs `pg_dump` 17.

## Follow-up on Mike's laptop (11/23, his calls C41 to C43)

| # | Step | Result |
|---|------|--------|
| 1 | Backup of production (C41) | **Done.** PostgreSQL 17.12's command line tools only, from the official EDB installer (SHA256 matched, EDB-signed). `pg_dump` 17.12 through the session pooler, custom format, from production's PostgreSQL 17.11: `triptab-production-2026-11-23.dump`, 606,157 bytes. `pg_restore --list` reads it back: 1,021 lines, 1,013 entries, 66 of them table data. Saved in Mike's OneDrive with no git folder above it. Mike set a new database password to run it and keeps it in his password manager; nothing in TripTab uses that password (checked from the cloud: no code, script or config in the repository reads it, and triptab.org answered normally afterwards). |
| 2 | Legacy full-account token (C42) | **Revoked.** After a reload, only "TripTab deploy (Cloudflare production builds)" and "TripTab dev deploy (Cloudflare previews)" remain, both expiring 17 Feb 2027. |
| 3 | Supabase's email limit, production (C43) | **3 an hour**, saved, and reads 3 after a reload. Every other limit as on 11/22. |
