#!/bin/sh
# M0 gate for the web port: the pas2c (C) engine must behave exactly like
# the FPC engine.
#
#   1. build the FPC engine and the pas2c engine from this revision
#   2. Lua engine tests on both; output must be identical
#   3. differential test of pas2c integer semantics (FPC vs pas2c + clang)
#   4. determinism gate: record AI games with both engines, replay every
#      demo with both engines (per-turn checksums, "Desync detected")
#
# Run inside the toolchain container from the repository root:
#   project_files/web/docker/run.sh desktop project_files/web/ci/m0-gate.sh
set -eu

jobs="$(nproc)"
out="${M0_OUT:-build-m0}"
mkdir -p "$out"
common="-G Ninja -DCMAKE_BUILD_TYPE=Release -DNOSERVER=1 -DNOVIDEOREC=1 -DGL2=1"

echo "== build FPC engine"
cmake -S . -B "$out/fpc" $common > "$out/fpc-cmake.log"
ninja -C "$out/fpc" -j "$jobs" hwengine > "$out/fpc-build.log"

echo "== build pas2c engine (and frontend, to keep it building)"
cmake -S . -B "$out/c" $common -DBUILD_ENGINE_C=1 > "$out/c-cmake.log"
ninja -C "$out/c" -j "$jobs" > "$out/c-build.log"

fpc_engine="$out/fpc/bin/hwengine"
c_engine="$out/c/bin/hwengine"
export SDL_VIDEODRIVER=dummy SDL_AUDIODRIVER=dummy

echo "== Lua engine tests"
fail=0
for t in $(cd tests/lua && find . -name '*.lua' | sort); do
    for e in fpc c; do
        eval engine=\$${e}_engine
        set +e
        timeout 300 "$engine" --prefix share/hedgewars/Data --nosound --nomusic --stats-only \
            --lua-test "tests/lua/$t" > "$out/lua-$e.out" 2> "$out/lua-$e.err"
        echo "rc=$?" >> "$out/lua-$e.out"
        set -e
        # drop lines that legitimately differ (argv echo of the C runtime)
        sed -i '/^ARGC = /d; /^ARGV\[/d' "$out/lua-$e.out"
    done
    result=$(grep -h "^rc=" "$out/lua-fpc.out")
    if cmp -s "$out/lua-fpc.out" "$out/lua-c.out" && cmp -s "$out/lua-fpc.err" "$out/lua-c.err"; then
        echo "  same  $t ($result)"
    else
        echo "  DIFF  $t"; fail=1
        diff "$out/lua-fpc.err" "$out/lua-c.err" | head -20 || true
    fi
done

echo "== pas2c integer semantics"
project_files/web/tests/pas2c-semantics/run.sh "$out/c/bin/pas2c" || fail=1

echo "== determinism gate"
rm -rf "$out/corpus"
project_files/web/tools/record-corpus.sh "$fpc_engine" "$out/corpus" fpc &
project_files/web/tools/record-corpus.sh "$c_engine" "$out/corpus" c &
wait
ndemos=$(ls "$out"/corpus/*.hwd 2>/dev/null | wc -l)
echo "  recorded $ndemos demos"
[ "$ndemos" -ge 14 ] || { echo "  too few demos recorded"; fail=1; }
if ! project_files/web/tools/replay-corpus.sh "$out/corpus" "$fpc_engine" "$c_engine" > "$out/replay.log"; then
    fail=1
fi
grep -v '^OK' "$out/replay.log" || true

[ $fail = 0 ] && echo "M0 gate: PASS" || echo "M0 gate: FAIL"
exit $fail
