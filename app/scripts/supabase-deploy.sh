#!/usr/bin/env bash
# Edge Functions and migrations change only through the repo (C12, Mike's 11/18 call), never by
# hand. cloudflare-build.sh runs this:
#   bash scripts/supabase-deploy.sh             on main, after the tests pass: production
#   bash scripts/supabase-deploy.sh dev         on a pull request's build, before the live database
#                                               tests: TripTab dev (C15, Mike's 11/19 call), so dev
#                                               gets every change before production does
#
# SUPABASE_ACCESS_TOKEN is a build secret Mike typed, and nobody reads its value; this script only
# hands it to the Supabase CLI, which reads it from the environment. There are two keys, one per
# place: production's build settings hold a key scoped to TripTab, Previews Base one scoped to
# TripTab dev. So a pull request's build can't reach production even by mistake: its key only
# opens dev.
#
# supabase/DEPLOY says how far this goes:
#   dry-run  report the migrations the project doesn't have yet and check the functions can be
#            reached, changing nothing; a failure here is reported but doesn't stop the build.
#   on       deploy every Edge Function and apply new migrations; a failure stops the build.
#            Then it downloads each function back and compares it with the repo, reporting only.
# A pull request with a new migration still waits for Mike's go before it merges (AGENTS.md).
set -euo pipefail
cd "$(dirname "$0")/../.."

case "${1:-production}" in
  production) REF=pptzbogslzicfyjooqra; WHERE=production ;;
  dev) REF=iivseqkvixmvcpldarqy; WHERE="TripTab dev" ;;
  *) echo "Usage: supabase-deploy.sh [production|dev]"; exit 2 ;;
esac
MODE=$(tr -d '[:space:]' < supabase/DEPLOY 2>/dev/null || echo off)
SB=(npx --yes supabase@3.2.0)

if [ "$MODE" != "dry-run" ] && [ "$MODE" != "on" ]; then
  echo "== Supabase deploy is off (supabase/DEPLOY: ${MODE:-missing}) =="
  exit 0
fi
if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "== Supabase deploy to $WHERE skipped: this build has no SUPABASE_ACCESS_TOKEN =="
  # Production must deploy once it's on. Dev can wait: until Previews Base has its key, dev keeps
  # getting changes through the connector, and GitHub Actions never has one.
  [ "$MODE" = "on" ] && [ "$REF" = pptzbogslzicfyjooqra ] && { echo "supabase/DEPLOY is on, so a missing key is an error."; exit 1; }
  exit 0
fi

functions=()
for dir in supabase/functions/*/; do
  name=$(basename "$dir")
  case "$name" in _*) continue ;; esac
  functions+=("$name")
done

if [ "$MODE" = "dry-run" ]; then
  echo "== Supabase (dry run): migrations $WHERE doesn't have yet =="
  "${SB[@]}" db push --workdir . --remote="$REF" --dry-run || echo "!! dry run: db push failed (see above); nothing was changed"
  echo "== Supabase (dry run): the functions $WHERE has now =="
  "${SB[@]}" functions list --workdir . --remote="$REF" || echo "!! dry run: functions list failed (see above); nothing was changed"
  echo "== Supabase (dry run): would deploy ${functions[*]} =="
  exit 0
fi

echo "== Supabase: apply new migrations to $WHERE =="
"${SB[@]}" db push --workdir . --remote="$REF" --yes
echo "== Supabase: deploy Edge Functions to $WHERE: ${functions[*]} =="
"${SB[@]}" functions deploy "${functions[@]}" --workdir . --remote="$REF" --use-api --yes

# Check what landed (AGENTS.md rule 7): download each function as it now stands there and
# compare every file with the repo. It reports and never stops the build: the deploy is done by
# now, and a difference here means look at the log, not that the app shouldn't ship.
echo "== Supabase: check what landed against the repo =="
tmp=$(mktemp -d)
problems=0
for fn in "${functions[@]}"; do
  dir="$tmp/$fn"
  mkdir -p "$dir/supabase"
  cp supabase/config.toml "$dir/supabase/"
  if ! "${SB[@]}" functions download "$fn" --workdir "$dir" --remote="$REF" --use-api > "$dir.log" 2>&1; then
    echo "!! $fn: couldn't download it to check:"; tail -n 5 "$dir.log"; problems=$((problems + 1)); continue
  fi
  files=0; diffs=0
  while IFS= read -r f; do
    rel="supabase/functions/${f#"$dir/supabase/functions/"}"
    files=$((files + 1))
    if [ ! -f "$rel" ]; then echo "!! $fn: $rel is deployed but isn't in the repo"; diffs=$((diffs + 1))
    elif ! cmp -s "$f" "$rel"; then echo "!! $fn: $rel differs from the repo"; diffs=$((diffs + 1)); fi
  done < <(find "$dir/supabase/functions" -type f 2>/dev/null | sort)
  if [ "$files" -eq 0 ] || [ ! -f "$dir/supabase/functions/$fn/index.ts" ]; then
    echo "!! $fn: the download held no supabase/functions/$fn/index.ts; it wrote:"; (cd "$dir" && find . -type f | head -n 10)
    problems=$((problems + 1))
  elif [ "$diffs" -gt 0 ]; then
    problems=$((problems + 1))
  else
    echo "   $fn: $files files, each the same as the repo"
  fi
done
rm -rf "$tmp"
if [ "$problems" -eq 0 ]; then echo "== Every function on $WHERE matches the repo =="; else echo "!! $problems of ${#functions[@]} functions need a look (above)"; fi
