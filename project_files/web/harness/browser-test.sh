#!/bin/sh
# Run the headless browser smoke test in the pinned Playwright image.
# Usage: browser-test.sh <site dir> <out dir> [seconds]   (paths relative to the repo root)
set -e
PLAYWRIGHT_VERSION=1.49.1
root="$(cd "$(dirname "$0")/../../.." && pwd)"
mkdir -p "$root/.cache/playwright"
exec docker run --rm -i --ipc=host \
    -u "$(id -u):$(id -g)" -e HOME=/tmp -e HARNESS_QUERY -e BROWSER \
    -e npm_config_cache=/src/.cache/playwright/npm \
    -v "$root:/src" -w /src \
    "mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble" \
    sh -c "cd /src/.cache/playwright \
           && ( [ -d node_modules/playwright ] || npm install --silent --no-save playwright@${PLAYWRIGHT_VERSION} ) \
           && cp /src/project_files/web/harness/browser-test.mjs . \
           && cd /src && if [ \"\$BROWSER\" = firefox ]; then xvfb-run -a -s '-screen 0 1280x1024x24' node .cache/playwright/browser-test.mjs $*; else node .cache/playwright/browser-test.mjs $*; fi"
