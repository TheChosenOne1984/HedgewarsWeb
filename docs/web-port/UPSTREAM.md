# Upstream patch series

The web port changes existing Hedgewars code in a few places; everything else
(web client, tooling, CI, deployment) is new and lives in `web/`,
`project_files/web/` and `docs/web-port/`. The changes to existing code are
meant to go upstream as a short series, one topic per patch:

| # | Patch | Files | Depends on |
|---|-------|-------|------------|
| 1 | pas2c: unit initialization, FPC integer semantics, clang++ | `tools/pas2c`, `project_files/hwc/rtl` (fpcops.h, pas2c.h, misc.h, GL.h), `pas2cSystem.pas`, `pas2cRedo.pas`, `CMakeLists.txt`, `FindClang.cmake`, `project_files/hwc/CMakeLists.txt` | — |
| 2 | landgen: maze generation independent of the pointer width | `rust/landgen/src/maze.rs` | — |
| 3 | engine: fix SDL binding signatures | `SDLh.pas`, `uSound.pas` | — |
| 4 | engine: Emscripten/WebGL build | engine units (`{$IFDEF WEBGL}` only), `uWeb.pas`, `rtl/web.c`, `rtl/system.h`, `EmscriptenPorts.cmake`, liblua/physlayer/Rust CMake | 1, 2, 3 |
| 5 | server: WebSocket connections | `rust/hedgewars-server` | — |
| 6 | protocol: golden message vectors | `rust/hedgewars-network-protocol` | — |

Patches 2, 3 and 5 are useful on their own: 2 fixes desyncs between 32-bit and
64-bit clients on maze maps, 3 fixes wrong declarations, 5 lets any browser
client use the official server. Patch 1 makes the pas2c engine behave exactly
like the FPC engine, which is what any non-FPC target needs.

## Making the series

    project_files/web/tools/upstream-series.sh            # branch upstream-series
    git format-patch $(git merge-base web-port origin/master)..upstream-series

The script takes the files of each topic from `web-port`, so the series always
matches the tested code; its end differs from `web-port` only in new web files.
The commit messages carry the rationale (see the script).

## Verification

- Desktop behaviour: the engine gate (`project_files/web/ci/engine-gate.sh`)
  replays AI demos recorded with each of the FPC, pas2c and web engines with
  every other engine; Lua engine tests produce identical output.
- After patch 3 (before the Emscripten patch) the FPC engine, the pas2c engine
  and the Qt frontend build (checked when the series was made).
- Server: `project_files/web/ci/server-tests.sh` (all feature combinations).

Upstream review is still needed for: code style (the series follows the
surrounding code), whether `ws-connections` should be on by default, and
whether the pas2c operator macros should replace plain operators everywhere
(they do now) or only where FPC and C differ.
