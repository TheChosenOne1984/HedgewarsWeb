#!/bin/sh
# Determinism gate: replay every demo of a corpus with every given engine.
# A replay fails on "Desync detected" (per-turn checksum mismatch) or engine
# error. The stats output of all engines must be identical per demo.
# Usage: replay-corpus.sh <corpusdir> <hwengine>...
corpus="$1"; shift
here="$(dirname "$0")"
fail=0
for demo in "$corpus"/*.hwd; do
    first=""
    for engine in "$@"; do
        stats="$demo.$(echo "$engine" | tr '/' '_').stats"
        python3 -I "$here/hwipc.py" replay --engine "$engine" --prefix share/hedgewars/Data \
            --stats-out "$stats" "$demo" || fail=1
        if [ -z "$first" ]; then first="$stats"
        elif ! cmp -s "$first" "$stats"; then echo "STATS DIFFER $demo: $first vs $stats"; fail=1; fi
    done
done
[ $fail = 0 ] && echo "determinism gate: PASS" || echo "determinism gate: FAIL"
exit $fail
