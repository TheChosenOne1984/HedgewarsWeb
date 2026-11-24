#!/bin/sh
# Web frontend checks: golden protocol vectors are current, lint, types, tests.
# Run inside the toolchain container (web image) from the repository root.
set -eu
echo "== protocol golden vectors (from rust/hedgewars-network-protocol)"
(cd rust && HW_GOLDEN_OUT=/tmp/protocol-golden.json \
    cargo test -q -p hedgewars-network-protocol export_golden -- --ignored > /dev/null)
cmp /tmp/protocol-golden.json web/test/protocol-golden.json \
    || { echo "web/test/protocol-golden.json is outdated, regenerate it"; exit 1; }
cd web
npm ci --no-fund --no-audit --silent
echo "== lint"; npm run -s lint
echo "== types"; npm run -s check
echo "== tests"; npm test --silent
