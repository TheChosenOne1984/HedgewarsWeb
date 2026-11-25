#!/bin/sh
# Browser matrix (M5): the web client runs a local game in Chromium, Firefox
# and WebKit (Playwright). Needs a built and staged web/dist. Run from the
# repository root on the host. Usage: browser-matrix.sh [browser...]
set -eu
PLAYWRIGHT_VERSION=1.49.1
mkdir -p .cache/playwright .cache/matrix
docker run --rm --ipc=host -u "$(id -u):$(id -g)" -e HOME=/tmp \
    -e npm_config_cache=/src/.cache/playwright/npm -v "$(pwd):/src" -w /src \
    "mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble" \
    sh -c "cd /src/.cache/playwright && ( [ -d node_modules/playwright ] || npm install --silent --no-save playwright@${PLAYWRIGHT_VERSION} ) \
           && cp /src/web/test/e2e/browser-matrix.mjs . && cd /src \
           && xvfb-run -a -s '-screen 0 1280x1024x24' node .cache/playwright/browser-matrix.mjs web/dist .cache/matrix $*"
