#!/bin/sh
# M4 acceptance: build and start the production stack (project_files/web/deploy)
# on test ports and check it with a browser: page under CSP, source link,
# lobby through /ws, a local game; two players in a room through the UI. Run from the repository root on the host.
set -eu
root="$(pwd)"
compose() { docker compose -p hwtest -f project_files/web/deploy/docker-compose.yml -f project_files/web/deploy/build.yml -f project_files/web/deploy/test-ports.yml "$@"; }
mkdir -p .cache/deploy .cache/playwright
compose up -d --build
trap 'compose down -v > /dev/null 2>&1 || true' EXIT
for _ in $(seq 30); do
    [ "$(docker inspect -f '{{.State.Health.Status}}' hwtest-server-1)" = healthy ] && break
    sleep 2
done
docker run --rm --network host -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$root:/src" -w /src --ipc=host \
    mcr.microsoft.com/playwright:v1.49.1-noble \
    sh -c "cp web/test/e2e/deploy-smoke.mjs web/test/e2e/room-ui.mjs .cache/playwright/ \
           && node .cache/playwright/deploy-smoke.mjs 'https://localhost:8443/?debug=1' .cache/deploy \
           && node .cache/playwright/room-ui.mjs https://localhost:8443/ .cache/deploy"
