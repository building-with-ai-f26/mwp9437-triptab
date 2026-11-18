#!/usr/bin/env bash
# After a production deploy (Cloudflare's "Deploy command" runs it after `wrangler deploy`):
# check that triptab.org serves the build just made, and that an app link like /join/... still
# opens the app rather than a 404. Fails loudly if not, so a bad deploy shows as a failed build.
set -euo pipefail
cd "$(dirname "$0")/.."
URL="${1:-https://triptab.org}"
asset="$(grep -o 'assets/index-[^"]*\.js' dist/index.html | head -1)"
for i in $(seq 1 24); do
  if curl -fsS "$URL/" | grep -qF "$asset" && [ "$(curl -s -o /dev/null -w '%{http_code}' "$URL/join/deploy-check")" = "200" ]; then
    echo "$URL serves $asset, and app links fall back to the app."
    exit 0
  fi
  sleep 5
done
echo "$URL doesn't serve $asset two minutes after the deploy." >&2
exit 1
