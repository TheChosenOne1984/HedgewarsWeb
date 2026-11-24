#!/bin/sh
# Differential test of integer expression semantics: FPC vs pas2c + clang.
# Usage: run.sh <pas2c binary> [extra clang flags]
# Run from the repository root inside the toolchain container.
set -e
pas2c="$1"; shift
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
python3 -I "$here/gen.py" "$work/semtest.pas"
cp "$root/hedgewars/pas2cSystem.pas" "$root/hedgewars/pas2cRedo.pas" "$work/"
mkdir -p "$work/c" "$work/fpc"
# no -O2: FPC 3.2.2 fails to assemble some Int64 shift chains at -O2
fpc -FE"$work/fpc" "$work/semtest.pas" > "$work/fpc.log" 2>&1 || { cat "$work/fpc.log"; exit 1; }
"$pas2c" -n semtest -i "$work" -o "$work/c" -a "$work/c" > "$work/pas2c.log" 2>&1 || { tail -20 "$work/pas2c.log"; exit 1; }
clang -std=gnu11 -O2 -w -fwrapv -DPAS2C "$@" -I "$root/project_files/hwc/rtl" \
    "$work/c/semtest.c" "$root"/project_files/hwc/rtl/*.c -lGL -lm -o "$work/semtest_c"
"$work/fpc/semtest" > "$work/fpc.out"
"$work/semtest_c" | grep -v '^ARGC' > "$work/c.out"
total=$(wc -l < "$work/fpc.out")
if cmp -s "$work/fpc.out" "$work/c.out"; then
    echo "pas2c semantics: PASS ($total checks)"
else
    diffs=$(diff "$work/fpc.out" "$work/c.out" | grep -c '^<' || true)
    echo "pas2c semantics: FAIL ($diffs of $total checks differ)"
    diff "$work/fpc.out" "$work/c.out" > "${SEMTEST_DIFF:-/dev/null}" || true
    exit 1
fi
