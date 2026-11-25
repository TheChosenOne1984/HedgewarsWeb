#!/bin/sh
# Precompress the static site once at build time (zstd -19, gzip -9), so that
# the web server serves .zst/.gz files as they are instead of compressing on
# every request. Files that do not get at least 5 % smaller stay plain
# (themes and sounds are PNG/OGG and do not compress).
# Usage: scripts/precompress.sh <site dir>
set -eu
find "$1" -type f \( -name '*.html' -o -name '*.js' -o -name '*.mjs' -o -name '*.css' \
    -o -name '*.json' -o -name '*.wasm' -o -name '*.svg' -o -name '*.hwpack' \) | while read -r f; do
    size=$(stat -c %s "$f")
    zstd -19 -T0 -q -k -f "$f" -o "$f.zst"
    if [ $(( $(stat -c %s "$f.zst") * 100 )) -ge $(( size * 95 )) ]; then
        rm -f "$f.zst"
        continue
    fi
    gzip -9 -k -f "$f"
done
echo "precompressed: $(find "$1" -name '*.zst' | wc -l) files"
