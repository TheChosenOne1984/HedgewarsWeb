#!/bin/sh
# Engine gate for the web port: the pas2c (C) engine and the web engine
# (WebAssembly, run in node) must behave exactly like the FPC engine.
#
#   1. build the FPC engine, the pas2c engine and the web engine
#   2. Lua engine tests on all engines; output must be identical
#   3. differential test of pas2c integer semantics (FPC vs pas2c + clang)
#   4. determinism gate: record AI games with every engine, replay every
#      demo with every engine (per-turn checksums, "Desync detected")
#
# Run inside the toolchain container from the repository root:
#   project_files/web/docker/run.sh web project_files/web/ci/engine-gate.sh
# Without emcc (desktop image) the web engine is skipped.
set -eu

jobs="$(nproc)"
out="${GATE_OUT:-build-gate}"
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
engines="fpc c"

if command -v emcc > /dev/null; then
    echo "== build web engine"
    emcmake cmake -S . -B "$out/web" -G Ninja -DCMAKE_BUILD_TYPE=Release -DBUILD_ENGINE_JS=1 \
        -DPHYSFS_LIBRARY=/opt/wasm/lib/libphysfs.a -DPHYSFS_INCLUDE_DIR=/opt/wasm/include \
        -DRust_CARGO_TARGET=wasm32-unknown-emscripten > "$out/web-cmake.log"
    ninja -C "$out/web" -j "$jobs" hwengine > "$out/web-build.log"
    export HWENGINE_MJS="$out/web/bin/hwengine.mjs"
    web_engine=project_files/web/engine/hwengine-node
    engines="fpc c web"
fi
export SDL_VIDEODRIVER=dummy SDL_AUDIODRIVER=dummy

echo "== Lua engine tests"
fail=0
for t in $(cd tests/lua && find . -name '*.lua' | sort); do
    for e in $engines; do
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
    same=1
    for e in $engines; do
        if ! cmp -s "$out/lua-fpc.out" "$out/lua-$e.out" || ! cmp -s "$out/lua-fpc.err" "$out/lua-$e.err"; then
            same=0
            echo "  DIFF  $t ($e)"; fail=1
            diff "$out/lua-fpc.err" "$out/lua-$e.err" | head -20 || true
        fi
    done
    [ $same = 1 ] && echo "  same  $t ($result)"
done

echo "== pas2c integer semantics"
project_files/web/tests/pas2c-semantics/run.sh "$out/c/bin/pas2c" || fail=1

echo "== determinism gate"
rm -rf "$out/corpus"
project_files/web/tools/record-corpus.sh "$fpc_engine" "$out/corpus" fpc &
project_files/web/tools/record-corpus.sh "$c_engine" "$out/corpus" c &
if [ -n "${web_engine:-}" ]; then
    project_files/web/tools/record-corpus.sh "$web_engine" "$out/corpus" web --prequeue --timeout 900 &
fi
wait
nengines=$(echo $engines | wc -w)
ndemos=$(ls "$out"/corpus/*.hwd 2>/dev/null | wc -l)
echo "  recorded $ndemos demos"
[ "$ndemos" -ge $((7 * nengines)) ] || { echo "  too few demos recorded"; fail=1; }
if ! project_files/web/tools/replay-corpus.sh "$out/corpus" "$fpc_engine" "$c_engine" ${web_engine:-} > "$out/replay.log"; then
    fail=1
fi
grep -v '^OK' "$out/replay.log" || true

[ $fail = 0 ] && echo "engine gate: PASS" || echo "engine gate: FAIL"
exit $fail
