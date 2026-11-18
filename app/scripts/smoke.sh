#!/usr/bin/env bash
# After a production deploy (Cloudflare's "Deploy command" runs it after `wrangler deploy`):
# check that triptab.org serves the build just made, and that an app link like /join/... still
# opens the app rather than a 404. Fails loudly if not, so a bad deploy shows as a failed build.
# It waits up to six minutes: the first deploy to triptab.org (11/18) failed at two, while the new
# custom domain's DNS was still reaching Cloudflare's build machine ("Could not resolve host").
set -euo pipefail
cd "$(dirname "$0")/.."
URL="${1:-https://triptab.org}"
asset="$(grep -o 'assets/index-[^"]*\.js' dist/index.html | head -1)"
for i in $(seq 1 72); do
  if curl -fsS --max-time 10 "$URL/" 2>/dev/null | grep -qF "$asset" && [ "$(curl -s --max-time 10 -o /dev/null -w '%{http_code}' "$URL/join/deploy-check")" = "200" ]; then
    echo "$URL serves $asset, and app links fall back to the app."
    exit 0
  fi
  sleep 5
done
echo "$URL doesn't serve $asset six minutes after the deploy." >&2
exit 1
