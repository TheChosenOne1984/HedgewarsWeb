#!/bin/sh
# M3 acceptance: two browsers (web client) and one desktop client (native
# engine) play an online game together on one server.
#
# Needs: hw-web-web image, a staged web/dist (scripts/stage-assets.sh), the
# FPC engine in build-gate/fpc. Run from the repository root on the host.
set -eu
root="$(pwd)"
uid="$(id -u):$(id -g)"
P=46700
W=46701
PLAYWRIGHT_VERSION=1.49.1
out=.cache/mixed
rm -rf "$out"; mkdir -p "$out" .cache/playwright

run() { docker run --rm --network host -u "$uid" -e HOME=/tmp -e CARGO_HOME=/src/.cache/cargo -v "$root:/src" -w /src "$@"; }

echo "== build server (ws-connections) and FPC engine"
run hw-web-web sh -c "cd rust && cargo build -q -p hedgewars-server --features ws-connections && ninja -C ../build-gate/fpc hwengine > /dev/null"

cleanup() { docker rm -f hw-mixed-server hw-mixed-bot > /dev/null 2>&1 || true; }
cleanup
trap cleanup EXIT
run -d --name hw-mixed-server hw-web-web rust/target/debug/hedgewars-server --port $P --ws-port $W > /dev/null
sleep 1
docker run -d --network host -u "$uid" -e HOME=/tmp -v "$root:/src" -w /src --name hw-mixed-bot hw-web-web python3 -I project_files/web/tools/desktop-bot.py \
    --server 127.0.0.1:$P --room mixed --engine build-gate/fpc/bin/hwengine --prefix share/hedgewars/Data \
    --log "$out/desktop-engine.log" > /dev/null

echo "== browsers"
browser_rc=0
run --ipc=host -e npm_config_cache=/src/.cache/playwright/npm "mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble" \
    sh -c "cd /src/.cache/playwright && ( [ -d node_modules/playwright ] || npm install --silent --no-save playwright@${PLAYWRIGHT_VERSION} ) \
           && cp /src/web/test/e2e/mixed-game.mjs . && cd /src && node .cache/playwright/mixed-game.mjs web/dist ws://127.0.0.1:$W $out 15" \
    || browser_rc=$?

bot_rc=$(docker wait hw-mixed-bot 2>/dev/null || echo 1)
docker logs hw-mixed-bot > "$out/desktop-bot.log" 2>&1 || true
docker logs hw-mixed-server > "$out/server.log" 2>&1 || true
tail -2 "$out/desktop-bot.log"
if [ "$browser_rc" = 0 ] && [ "$bot_rc" = 0 ]; then echo "mixed game: PASS"; else echo "mixed game: FAIL (browsers $browser_rc, desktop $bot_rc)"; exit 1; fi
