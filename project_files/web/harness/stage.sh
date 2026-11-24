#!/bin/sh
# Assemble the harness site: engine, asset packs and harness page.
# Usage: stage.sh <web build dir> <installed Data dir> <out dir>
set -e
build="$1"; data="$2"; out="$3"
here="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$out/engine"
cp "$build/bin/hwengine.mjs" "$build/bin/hwengine.wasm" "$out/engine/"
cp "$here/../engine/engine-host.js" "$here/../engine/game-config.js" "$out/engine/"
cp "$here/index.html" "$here/main.js" "$out/"
if [ ! -f "$out/packs/manifest.json" ] || [ "${REPACK:-0}" = 1 ]; then
    rm -rf "$out/packs"
    python3 -I "$here/../assets/make-packs.py" "$data" "$out/packs"
fi
echo "staged $out"
