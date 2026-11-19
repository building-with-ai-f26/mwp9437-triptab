#!/usr/bin/env bash
# Production's Edge Functions and migrations change only through merges (C12, Mike's 11/18 call),
# never by hand. cloudflare-build.sh runs this on main only, after the tests pass and before the
# app is built, so a failed deploy means the app doesn't ship ahead of what it needs.
#
# SUPABASE_ACCESS_TOKEN is a secret on Cloudflare's production builds only (Previews never get
# it). Mike typed it; it is scoped to the TripTab project. Nobody reads its value; this script only
# hands it to the Supabase CLI, which reads it from the environment.
#
# supabase/DEPLOY says how far this goes:
#   dry-run  report the migrations production doesn't have yet and check the functions can be
#            reached, changing nothing; a failure here is reported but doesn't stop the build.
#   on       deploy every Edge Function and apply new migrations; a failure stops the build.
# A pull request with a new migration still waits for Mike's go before it merges (AGENTS.md).
set -euo pipefail
cd "$(dirname "$0")/../.."

PROD_REF=pptzbogslzicfyjooqra
MODE=$(tr -d '[:space:]' < supabase/DEPLOY 2>/dev/null || echo off)
SB=(npx --yes supabase@3.2.0)

if [ "$MODE" != "dry-run" ] && [ "$MODE" != "on" ]; then
  echo "== Supabase deploy is off (supabase/DEPLOY: ${MODE:-missing}) =="
  exit 0
fi
if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "== Supabase deploy skipped: this build has no SUPABASE_ACCESS_TOKEN =="
  [ "$MODE" = "on" ] && { echo "supabase/DEPLOY is on, so a missing key is an error."; exit 1; }
  exit 0
fi

functions=()
for dir in supabase/functions/*/; do
  name=$(basename "$dir")
  case "$name" in _*) continue ;; esac
  functions+=("$name")
done

if [ "$MODE" = "dry-run" ]; then
  echo "== Supabase (dry run): migrations production doesn't have yet =="
  "${SB[@]}" db push --workdir . --remote="$PROD_REF" --dry-run || echo "!! dry run: db push failed (see above); nothing was changed"
  echo "== Supabase (dry run): the functions production has now =="
  "${SB[@]}" functions list --workdir . --project-ref "$PROD_REF" || echo "!! dry run: functions list failed (see above); nothing was changed"
  echo "== Supabase (dry run): would deploy ${functions[*]} =="
  exit 0
fi

echo "== Supabase: apply new migrations to production =="
"${SB[@]}" db push --workdir . --remote="$PROD_REF" --yes
echo "== Supabase: deploy Edge Functions to production: ${functions[*]} =="
"${SB[@]}" functions deploy "${functions[@]}" --workdir . --project-ref "$PROD_REF" --use-api --yes
