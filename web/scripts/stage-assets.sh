#!/bin/sh
# Copy the web engine and the asset packs next to the frontend build.
# Usage: scripts/stage-assets.sh <engine build dir> <installed Data dir> <frontend dist dir>
# (run from web/; packs are only rebuilt when missing or with REPACK=1)
set -e
build="$1"; data="$2"; dist="$3"
mkdir -p "$dist/engine"
cp "$build/bin/hwengine.mjs" "$build/bin/hwengine.wasm" "$dist/engine/"
if [ ! -f "$dist/packs/manifest.json" ] || [ "${REPACK:-0}" = 1 ]; then
    rm -rf "$dist/packs"
    python3 -I ../project_files/web/assets/make-packs.py "$data" "$dist/packs"
fi
echo "staged engine and packs into $dist"
