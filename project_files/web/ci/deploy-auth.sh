#!/bin/sh
# Basic auth option of the production stack: start it on the test ports with
# a password, check that the site and the game connection refuse requests
# without credentials and work with them in Chromium, Firefox and WebKit, and
# that the desktop port stays closed without desktop-clients.yml.
# Run from the repository root on the host (images from deploy-smoke.sh).
set -eu
root="$(pwd)"
user=tester
pass='s3cret $pass'
compose() { docker compose -p hwtest -f project_files/web/deploy/docker-compose.yml -f project_files/web/deploy/build.yml -f project_files/web/deploy/test-ports.yml "$@"; }
trap 'compose down -v > /dev/null 2>&1 || true' EXIT
BASIC_AUTH_USER=$user BASIC_AUTH_PASSWORD=$pass compose up -d --force-recreate site server > /dev/null 2>&1
sleep 3
fail=0
code() { curl -sk -o /dev/null -w '%{http_code}' "$@"; }
expect() { if [ "$2" = "$3" ]; then echo "ok   $1 ($3)"; else echo "FAIL $1 (expected $2, got $3)"; fail=1; fi; }
expect "site without credentials" 401 "$(code https://localhost:8443/)"
expect "site with wrong password" 401 "$(code -u "$user:wrong" https://localhost:8443/)"
expect "site with credentials" 200 "$(code -u "$user:$pass" https://localhost:8443/)"
if curl -sk -D - -o /dev/null https://localhost:8443/ | grep -qi '^set-cookie'; then
    echo "FAIL the session cookie is handed out without credentials"; fail=1
else
    echo "ok   no session cookie without credentials"
fi
cookie="$(curl -sk -D - -o /dev/null -u "$user:$pass" https://localhost:8443/ | sed -n 's/^[Ss]et-[Cc]ookie: \(hw_ws=[0-9a-f]*\).*/\1/p')"
ws() { curl -sk --http1.1 -o /dev/null -w '%{http_code}' --max-time 3 -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
    -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' -H 'Origin: https://localhost:8443' "$@" https://localhost:8443/ws; }
expect "game connection with the session cookie" 101 "$(ws -H "Cookie: $cookie")"
expect "game connection with a forged cookie" 401 "$(ws -H 'Cookie: hw_ws=0123')"
expect "game connection without credentials" 401 "$(ws)"
if docker compose -f project_files/web/deploy/docker-compose.yml config | grep -q 'target: 46631'; then
    echo "FAIL desktop port published without desktop-clients.yml"; fail=1
else
    echo "ok   desktop port closed without desktop-clients.yml"
fi
if docker compose -f project_files/web/deploy/docker-compose.yml -f project_files/web/deploy/desktop-clients.yml config | grep -q 'target: 46631'; then
    echo "ok   desktop port published with desktop-clients.yml"
else
    echo "FAIL desktop port missing with desktop-clients.yml"; fail=1
fi
docker run --rm --network host -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$root:/src" -w /src --ipc=host \
    mcr.microsoft.com/playwright:v1.49.1-noble \
    sh -c "cp web/test/e2e/deploy-auth.mjs .cache/playwright/ && node .cache/playwright/deploy-auth.mjs https://localhost:8443/ '$user' '$pass'" || fail=1
[ "$fail" = 0 ] && echo "basic auth: PASS" || { echo "basic auth: FAIL"; exit 1; }
