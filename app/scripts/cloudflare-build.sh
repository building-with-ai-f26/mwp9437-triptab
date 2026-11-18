#!/usr/bin/env bash
# TripTab's build, the same everywhere: Cloudflare's Workers Builds runs it on every push (its
# "Build command"), and GitHub Actions runs it on every pull request (.github/workflows/ci.yml).
#
# 1. The tests, always against TripTab dev: lint, unit tests, type check, and the live database
#    security tests. If any fails, the script stops, so nothing is built and nothing deploys.
# 2. The build: production's values on main (Cloudflare then deploys it to triptab.org), and
#    TripTab dev's on every other branch (a Preview, never real users).
#
# Every value below is public by design: it ships in the browser, and row-level security in the
# database decides what anyone can do. No secret belongs in this file.
set -euo pipefail
cd "$(dirname "$0")/.."

DEV_SUPABASE_URL=https://iivseqkvixmvcpldarqy.supabase.co
DEV_SUPABASE_KEY=sb_publishable_wXWIUwViR_2h7G1VsubAkA_eTKSWSgJ
PROD_SUPABASE_URL=https://pptzbogslzicfyjooqra.supabase.co
PROD_SUPABASE_KEY=sb_publishable_-_AJFvHpurCuAHnKjIEuvQ__xAzXCJ_
PROD_POSTHOG_KEY=phc_pN7znkKDFxYdyXzvBva5VMxpxBRu5tVPhMo5V5DcwfbT
POSTHOG_HOST=https://us.i.posthog.com

# Workers Builds names the branch; GitHub Actions and local runs don't, so they build a Preview.
BRANCH="${WORKERS_CI_BRANCH:-}"

[ -d node_modules ] || npm ci

echo "== Tests, against TripTab dev =="
export VITE_SUPABASE_URL="$DEV_SUPABASE_URL" VITE_SUPABASE_PUBLISHABLE_KEY="$DEV_SUPABASE_KEY" VITE_POSTHOG_KEY="" VITE_POSTHOG_HOST="$POSTHOG_HOST"
npm run lint
npm test
npx tsc -b
npm run test:rls

if [ "$BRANCH" = "main" ]; then
  echo "== Build for production (triptab.org) =="
  export VITE_SUPABASE_URL="$PROD_SUPABASE_URL" VITE_SUPABASE_PUBLISHABLE_KEY="$PROD_SUPABASE_KEY" VITE_POSTHOG_KEY="$PROD_POSTHOG_KEY"
  npm run build
else
  echo "== Build a Preview, against TripTab dev (branch: ${BRANCH:-none}) =="
  npm run build -- --mode preview
fi
