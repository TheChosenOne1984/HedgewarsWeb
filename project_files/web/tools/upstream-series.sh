#!/bin/sh
# Build the upstream patch series: the web port's changes to existing
# Hedgewars code (not the new web client and tooling), one commit per topic,
# on a branch starting at the upstream base. The web-port branch mixes them
# with the web files; this extracts them by path.
#
# Usage: project_files/web/tools/upstream-series.sh [source ref] [branch]
#   defaults: web-port, upstream-series
# Afterwards: git format-patch <base>..upstream-series
set -eu
src="${1:-web-port}"
branch="${2:-upstream-series}"
base="$(git merge-base "$src" origin/master)"
work="$(mktemp -d)"
trap 'git worktree remove --force "$work" 2>/dev/null || true' EXIT
git worktree add -q --detach "$work" "$base"

topic() {
    title="$1"; body="$2"; shift 2
    (cd "$work" && git checkout -q "$src" -- "$@" && git add -A -- "$@" \
        && git -c core.hooksPath=/dev/null commit -q -m "$title" -m "$body")
    echo "  $(cd "$work" && git log --oneline -1)"
}

echo "series on $base:"

topic "pas2c: unit initialization, FPC integer semantics, clang++" \
"pas2c had no support for initialization/finalization sections and translated
integer arithmetic to plain C operators, whose type promotion differs from
FPC's (64-bit int, mixed signedness, shifts, div/mod). The generated engine
then diverged from the FPC build in network games and demos.

- PascalParser/Pas2C: initialization and finalization sections, run in unit
  order by pas2c_initialize_units() at start-up.
- Operators are emitted as fpcrtl_* macros (rtl/fpcops.h) that reproduce
  FPC's x86_64 typing rules with C11 _Generic; literal operands use the _cl/
  _cr variants. Negative and hex char literals are emitted directly.
- Char is unsigned like in FPC; IntN aliases in pas2cSystem/pas2cRedo.
- C flags -fwrapv -fno-strict-aliasing; the generated sources depend on the
  pas2c binary; clang++ is used as the C++ compiler when available.

Verified by recording AI-vs-AI demos with the FPC and the pas2c engine and
replaying each with the other (per-turn checksums), and by a differential
test of the operators against FPC." \
    tools/pas2c project_files/hwc/rtl/fpcops.h project_files/hwc/rtl/pas2c.h \
    project_files/hwc/rtl/misc.h project_files/hwc/rtl/GL.h \
    hedgewars/pas2cSystem.pas hedgewars/pas2cRedo.pas \
    cmake_modules/FindClang.cmake CMakeLists.txt project_files/hwc/CMakeLists.txt

topic "landgen: maze generation independent of the pointer width" \
"gen_range(0..4) on usize draws differently on 32-bit targets (wasm32, 32-bit
ARM) than on 64-bit ones, so the same seed produced different mazes and the
clients desynced. Draw a u64 and convert." \
    rust/landgen/src/maze.rs

topic "engine: fix SDL binding signatures" \
"Several SDLh declarations did not match the C functions (argument and
return types); harmless with FPC on x86_64, wrong with strict calling
conventions such as WebAssembly's. Mix_LoadMUS_RW takes ownership of the
RWops (freesrc = 1), as the engine expects." \
    hedgewars/SDLh.pas hedgewars/uSound.pas

topic "engine: Emscripten/WebGL build" \
"Builds the pas2c engine with Emscripten for browsers (BUILD_ENGINE_JS),
without changing the desktop engine's behaviour:

- the main loop is split into init and iteration; the browser runs one
  iteration per animation frame (WebMainLoop); desktop keeps MainLoop.
- the AI thinks in a fiber with time slices instead of a thread (uAI, web.c).
- IPC goes through an in-memory queue to the page instead of a TCP socket
  (uIO, web.c); campaign/mission variables are read synchronously.
- WebGL lacks some fixed-function state (GL_TEXTURE_2D capability,
  GL_LINE_SMOOTH, GL_TEXTURE_PRIORITY); the matrix self-test is skipped;
  the CJK font falls back to the base font when not downloaded.
- CMake: Emscripten SDL ports, liblua/physlayer and the Rust library for
  wasm32-unknown-emscripten." \
    hedgewars/hwengine.pas hedgewars/uAI.pas hedgewars/uIO.pas hedgewars/uWeb.pas \
    hedgewars/uLandTexture.pas hedgewars/uMatrix.pas hedgewars/uRender.pas \
    hedgewars/uScript.pas hedgewars/uStore.pas hedgewars/ArgParsers.pas \
    cmake_modules/EmscriptenPorts.cmake project_files/hwc/rtl/system.h \
    project_files/hwc/rtl/web.c misc/liblua/CMakeLists.txt \
    misc/libphyslayer/CMakeLists.txt rust/lib-hwengine-future

topic "server: WebSocket connections" \
"Optional feature ws-connections (and BUILD_SERVER_WEBSOCKETS): the server also
accepts the protocol over WebSocket (one protocol message per text frame), so
browser clients meet desktop clients in the same lobby.

--ws-port, --ws-origin (Origin allowlist), --trusted-proxy (X-Forwarded-For
from a reverse proxy, for bans and throttling). Writes are flushed (the
WebSocket stream buffers). Integration tests: a WebSocket and a TCP client
meet in one room; the Origin allowlist." \
    rust/hedgewars-server

topic "protocol: golden message vectors" \
"Exports the client and server messages with their wire form as JSON
(HW_GOLDEN_OUT) and checks that server messages parse back, so other client
implementations can test against the reference protocol code." \
    rust/hedgewars-network-protocol

(cd "$work" && git branch -f "$branch" HEAD)
echo "branch $branch: $(git log --oneline "$base..$branch" | wc -l) commits"
