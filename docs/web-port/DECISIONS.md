# Web Port: Decisions and Deviations

Every decision and every deviation from [PLAN.md](PLAN.md), newest milestone last.
Format: what was decided, why, and what was rejected.

## General

### D1: Toolchain in Docker, Ubuntu 24.04 package set
- `project_files/web/docker/Dockerfile`, targets `native`, `desktop` (+ Qt6), `web` (+ emsdk).
- Pinned by base image tag `ubuntu:24.04` (FPC 3.2.2, GHC 9.4.7, clang 18, CMake 3.28, Qt 6.4.2,
  SDL2 2.30) plus explicit versions: Rust 1.91.0 (rustup), emsdk 4.0.10.
- `project_files/web/docker/run.sh <target> <cmd>` runs a command with the repository mounted at `/src`.
- Nothing is installed on the host.
- Rejected: digest-pinning every apt package (high maintenance, little gain over the release tag;
  revisit for release builds).

### D2: Git setup
- Work happens on branch `web-port`, local only for now (no fork configured yet).

## M0: Native C engine

### D3: pas2c `initialization` / `finalization`
- Each section becomes a parameterless procedure `<unit>_initialization` / `<unit>_finalization`.
  **Deviation from the plan** (`<unit>_init`/`_fini`): the keyword-based names cannot collide
  with Pascal identifiers, `init` could.
- The main module calls them in FPC order (depth-first along the uses clauses, interface before
  implementation, a unit after all units it uses). Finalization runs in reverse order via `atexit`.
- Program: `pas2c_initialize_units()` is the first statement of `main()`.
  Library (main module is a unit, `HWLIBRARY`): it runs as `__attribute__((constructor))`, which
  matches FPC's "initialization runs when the library is loaded".

### D4: Plan finding 8 (Lua test hang) resolved
- With the initialization support from D3 all Lua tests run in about 1 s on the pas2c build and
  produce byte-identical stdout and stderr to the FPC build. The hang did not reproduce, even
  before the semantics fixes of D10.
- The original test conversion is not available, so the cause cannot be confirmed. Plausible
  candidates: the `uConsts` initialization section (it sets `hwPi`, `_1div3`, ..., the `hwFloat`
  constants physics depends on) not running in the right place, or the missing GL prototype (D7)
  producing a wrong implicit declaration.

### D5: Lua test baseline
- `luaAPI/gravity_get_set.lua` fails on the unmodified FPC build as well ("Unexpected Y position
  -1374, expected -1379"), so it is an upstream issue and not caused by the port.
- The M0 gate therefore requires *identical* output of FPC and pas2c builds for every Lua test,
  not "all pass".

### D6: Plan fix 2 location
- The C integer typedefs live in `project_files/hwc/rtl/pas2c.h`, not `Types.h` as the plan says.
  `Int8/16/32` and `UInt8/16/32` were added there and to `pas2cSystem.pas`.

### D7: `glShaderSource` declaration
- Besides declaring `fpcrtl_glShaderSource` in `misc.h` (plan fix 3), `rtl/GL.h` now defines
  `GL_GLEXT_PROTOTYPES` before including `GL/gl.h`; otherwise `glShaderSource` itself is
  undeclared with current Mesa headers.

### D8: Rust crate types chosen by CMake
- `Cargo.toml` declares `["cdylib", "staticlib"]` (plan fix 4), and
  `rust/lib-hwengine-future/CMakeLists.txt` imports only `cdylib` for desktop and only
  `staticlib` for `BUILD_ENGINE_JS` (corrosion `CRATE_TYPES`). Desktop builds are unchanged.

### D9: `BUILD_ENGINE_C` used clang as C++ compiler
- Upstream bug: `CMAKE_CXX_COMPILER` was set to the plain `clang` driver, so `frontend-qt6`
  failed to link. `FindClang.cmake` now also finds the matching `clang++`.

### D10: pas2c integer semantics follow FPC x86_64 (largest change of M0)
- Reference platform: FPC on x86_64, what desktop players run.
- Measured FPC behaviour (see `project_files/web/tests/pas2c-semantics/`), all different from
  what pas2c used to emit as plain C operators:
  - `+ - * div mod` and unary `-` evaluate in the native integer type (Int64); `+` and `*` of two
    unsigned operands give QWord; QWord meeting Int64 gives Int64; `div`/`mod` of QWord with any
    signed operand are signed.
  - `or`/`xor` and comparisons of a signed with an unsigned operand (both at most 32 bits) are done
    in Int64; `and` follows C's rules (the unsigned type wins); `and/or/xor` of two unsigned
    operands keep the larger operand type (`Byte and Byte` is a Byte).
  - `shr` is a logical shift in the width of the (at least 32-bit) operand type; Byte and Word are
    shifted as unsigned 32-bit.
  - `not` keeps the operand type.
  - A non-negative constant takes the type of the other operand if it fits (`QWordVar < 0` is
    an unsigned comparison).
  - Signed overflow wraps.
  - `Char` is unsigned.
- Implementation: pas2c emits `fpcrtl_add(a, b)`, `fpcrtl_cmp(a, <, b)`, ... macros from
  `project_files/hwc/rtl/fpcops.h`. They select the FPC behaviour with C11 `_Generic` on the
  actual C operand types (pas2c's own type tracking is too coarse), so there is no run-time cost.
  Each operand is evaluated once into a temporary (GNU statement expression + `__auto_type`),
  which keeps nested expressions linear in size. Literal operands use `_cl`/`_cr` variants.
  The engine is compiled with `-fwrapv -fno-strict-aliasing`.
- Rejected: patching engine code (forbidden by the ground rules, and the issue is systematic);
  extending pas2c's type system with integer widths (large refactor, still less exact than the
  C compiler's view of the types).
- Verified by a differential test: a generated Pascal program (every operator x every integer type
  pair x boundary values, plus random nested expressions) is built with FPC and via pas2c + clang;
  outputs must be identical. CI runs about 150,000 checks; 9 seeds with 1,500 random expressions
  each (3.7 million checks) were run once.
- Edge case excluded: `Low(Int64) div -1` traps on x86 in both FPC and C.

### D11: Evaluation order of operands
- With the statement expressions in D10, binary operands are evaluated left to right. FPC does not
  guarantee an order either. A grep found no expression with two calls of the synchronised RNG
  (`GetRandom`); expressions with two calls of `random` only affect visual gears, which are not
  part of the simulation.

### D12: Determinism gate design
- `project_files/web/tools/hwipc.py` is a headless stand-in for the frontend's engine IPC
  (port of `HWGame::commonConfig`, `getFullConfig`, `teamGameConfig` for bot games). It records
  demos the way `frontend-qt6` does.
- `record-corpus.sh` records 8 AI-vs-AI games (template, maze, perlin and WFC maps, 2 to 4 teams,
  the Highlander, Balanced Random Weapon and Random Weapon scripts) with a given engine.
- `replay-corpus.sh` replays every demo with every engine in `--stats-only` mode. The engine
  compares its per-turn checksum with the recorded `N` message and fails with "Desync detected" on
  any difference; the stats output of both engines must also match.
- The gate records with **both** engines and cross-replays, so drift in either direction is
  caught. Demos are recorded fresh on every run instead of being committed, because demos are
  only valid for the engine revision that recorded them.
- Verified that the gate catches drift: flipping one bit of one checksum in a demo makes both
  engines report a desync.
- The Mutant script was dropped from the corpus: AI-only Mutant games never end.
- `project_files/web/ci/m0-gate.sh` runs everything (builds, Lua tests, semantics test, gate);
  `.github/workflows/web-port.yml` runs it in the pinned image.

## M1: Engine in the browser

### D13: Emscripten ports instead of find_package for the web build
- `cmake_modules/EmscriptenPorts.cmake` defines INTERFACE targets for the SDL2, SDL2_image (PNG),
  SDL2_ttf and SDL2_mixer (OGG) ports; the `find_package(SDL2...)` calls are skipped for
  `BUILD_ENGINE_JS`. SDL2_net is not linked.
- PhysFS has no port and the bundled `misc/libphysfs` is 2.1 (3.0 required): the `web` image builds
  PhysFS 3.2.0 from its release tarball (pinned by SHA-256) into `/opt/wasm`.
- The bundled Lua 5.1 builds with `LUA_USE_POSIX`.
- Rust: `wasm32-unknown-emscripten` with rustc 1.91.0 and emsdk 4.0.10 links and runs; no ABI
  issues were found (all FFI structs pass through by pointer or as plain integers).

### D14: Output and environment
- The engine links to an ES6 module (`hwengine.mjs` + `.wasm`) with `ENVIRONMENT=web,node`.
  Node runs it headless for the tests (`project_files/web/engine/run-node.mjs`, `hwengine-node`).
- `STACK_SIZE` is 8 MiB like native. With 1 MiB the stack silently overflowed into static data
  (Pascal code keeps many 256-byte shortstrings on the stack), which showed up as heap corruption,
  `free()` crashes and broken function pointers; found with `-sASSERTIONS=2`.
- `--profiling-funcs` keeps function names in the module for readable stack traces.
- Argument parsing in the web engine starts at index 1 like a program (the upstream library mode
  starts at 0 but checks `--internal` at index 1).

### D15: IPC transport
- `uIO` routes all socket use through `ipcIsOpen`/`ipcSend`. Under `WEBGL` they use an in-memory
  inbound queue (`hw_ipc_push`, exported) and a JavaScript callback (`Module.onIpcMessage`),
  implemented in `project_files/hwc/rtl/web.c` and declared in `hedgewars/uWeb.pas`.
- The wire format is unchanged, so engine messages can be relayed to the server as-is.
- The web engine cannot wait for the frontend: the frontend queues the complete config and the
  pong `!` before calling `hwengine_RunEngine` (as the plan proposed); `IPCWaitPongEvent` fails
  loudly when the reply is missing.

### D16: Main loop
- `MainLoop`'s body is `MainLoopIteration`; desktop keeps the loop. The web engine registers
  `WebMainLoopStep` with `emscripten_set_main_loop(…, 0, 0)` and reports the end with
  `Module.onEngineExit(code)`; `halt` ends up in `Module.onExit(code)`.
- Deviation: headless runs (`--stats-only`, `--lua-test`) keep the blocking loop on web. They draw
  nothing and are used by tests in node, where a blocking run is simpler and faster.

### D17: Campaign and mission variables
- `GetCampaignVar`/`GetMissionVar` read synchronously from the frontend
  (`Module.getEngineVar(kind, name)`); saving still goes over IPC ("V!"/"v!"), and the engine host
  keeps a store that it updates from those messages.
- `GenLandPreview` needed no change: its `IPCWaitPongEvent` is satisfied by the queued pong.

### D18: AI in a fiber (deviation from "cooperative Think slices")
- The plan asked for cooperative time slices. Rewriting `Think`/`Walk`/`TestAmmos` into a resumable
  state machine would be a large, risky change to the AI search and hard to upstream.
- Instead the unchanged AI code runs in an Emscripten fiber: the main loop gives it a 6 ms slice per
  frame (`hw_ai_run_slice`), the AI yields at check points in `Walk` and `TestAmmos` once the slice
  is used up (`hw_ai_yield`, which replaces the existing `SDL_delay(0)` hint), and its deliberate
  waits (`SDL_Delay(700)`/`(100)`) give frames back (`hw_ai_sleep`).
- Fibers need Asyncify. The plan rejected Asyncify for the main loop and blocking waits; here it is
  limited to the functions that can be on the stack when fibers switch (`ASYNCIFY_ONLY`: the AI
  functions, the main loop path and the `dynCall_v`/`dynCall_vi` trampolines), with
  `ASYNCIFY_IGNORE_INDIRECT`. The module grew by about 7 %; there is no measurable frame cost.
- SDL yields to the browser in `SDL_GL_SwapWindow` when Asyncify is present; that is disabled via
  `SDL_EMSCRIPTEN_ASYNCIFY=0`.
- `FreeActionsList` cannot wait for a thread: it abandons an unfinished think job and clears the
  thinking flag while the gear is still valid.
- The AI is not part of the synchronised simulation (its decisions travel as commands), so it does
  not need to decide identically to the threaded version; it only must not stall the game.

### D19: Fixes found by the WebAssembly build (also wrong on desktop)
- `SDLh.pas`: five SDL2/SDL2_mixer functions were declared with wrong signatures
  (`SDL_DestroyWindow`, `SDL_SetWindowFullscreen`, `Mix_LoadMUS_RW` (missing `freesrc`),
  `Mix_PauseMusic`, `Mix_ResumeMusic`). x86 calling conventions tolerate this, WebAssembly traps.
- `landgen` maze generator: `gen_range` over a `usize` range draws a `u32` on 32-bit targets and a
  `u64` on 64-bit targets, so 32-bit builds generated different mazes (desync). It now samples a
  `u64`; 64-bit results are unchanged.

### D20: WebGL-specific engine changes (all under `WEBGL`)
- `uMatrix`: skip the fixed-function self-test of `MatrixMultiply`.
- Skip `GL_TEXTURE_PRIORITY`, `GL_LINE_SMOOTH` and `glEnable(GL_TEXTURE_2D)`.
- `uStore`: if the CJK font is missing, the CJK font slots use the base font, so the 17 MB font is
  only downloaded for CJK locales or names.
- Headless node runs get a no-op GL context in the runner (desktop ignores GL calls without a
  context the same way), instead of guarding the few GL calls the engine makes in stats-only mode.

### D21: Asset packs
- Source: the data set `cmake --install` produces (no `.svg`/`.xcf` sources).
- Format: a small custom container (JSON index + concatenated files), unpacked into MEMFS by the
  engine host. Rejected: mounting zip packs through PhysFS, because the Rust map generators read
  templates and theme files with `std::fs`, which only sees real files.
- Split: `core` (7.7 MB, 5.7 MB gzip: base graphics, hats, graves, flags, base font, English
  locale, scripts, shaders, sounds, default voice, templates), plus `themes/*`, `maps/*`,
  `voices/*`, `music/*`, `locale/*`, `fonts-cjk`, `forts`, `missions`. Names are content-addressed
  (`<name>.<sha256[:16]>.hwpack`) for immutable caching; `manifest.json` lists them.
- Hats stay in core: about 1 MB in 300 files would otherwise cost more in requests than they save.

### D22: Verification of M1
- The engine gate (`project_files/web/ci/engine-gate.sh`) builds the FPC, pas2c and web engines,
  compares the Lua test output of all three, records 8 AI games with each engine (live games in the
  web engine via the node IPC bridge) and replays all 24 demos with all three engines. All pass:
  the WebAssembly engine is bit-identical to FPC on x86_64.
- Browser smoke test (`project_files/web/harness/browser-test.sh`, pinned Playwright image):
  an AI-vs-AI game runs to completion in Chromium (SwiftShader) at a constant 16.7 ms per frame
  (longest frame below 50 ms), with sound initialised and a mid-game window resize handled.
  Firefox works headed under xvfb (headless Firefox has no GL in the container).
- Keyboard input in a hotseat game works (`KEYTEST=1`: the active hedgehog walks and jumps).
- Not yet verified automatically: mouse aiming with pointer lock, fullscreen and audible sound
  (they need a real browser session).

## M2: Server WebSocket support

### D23: WebSocket as one more ClientStream
- Feature `ws-connections` (tokio-tungstenite 0.24). `ClientStream::Ws` wraps the WebSocket in a
  small adapter (`server/websocket.rs`) that turns binary or text messages back into a byte stream,
  so the protocol decoder is unchanged. Rejected: `ws_stream_tungstenite` (the adapter is 60 lines
  and avoids another dependency).
- Separate listener (`--ws-port`). The listener and every handshake run in their own tasks with a
  10 s timeout and hand finished connections to the network layer through a channel, so a slow
  client cannot block the accept loop (the TLS branch upstream still accepts inline). This also
  avoids doubling the feature-dependent `select!` blocks.
- `--ws-origin` (repeatable) is an Origin allowlist; empty allows any origin (logged as a warning).
- `--trusted-proxy` (repeatable): only for these peers the client address is taken from
  `X-Forwarded-For` (rightmost entry that is not a trusted proxy), because bans, flood control and
  the reconnect throttle work per address.
- `NetworkClient::write` now flushes after `write_all`: TLS and WebSocket streams buffer until
  flushed (no-op for TCP).
- Note for tests: the server allows at most 2 connections per address in 30 s and 3 in 2 min,
  loopback included; tests with several local clients have to space their connections.

## M3: Web frontend

### D24: Svelte 5 + TypeScript + Vite
- Decided in M3 as the plan asked: Svelte compiles to small, dependency-free code (the client is
  83 KB of JavaScript, 29 KB gzipped) and fits a state-heavy app UI. Lit would have meant more
  hand-written state plumbing. All versions are pinned (`package.json` exact versions + lock file).

### D25: Protocol client from golden vectors
- `src/lib/protocol/messages.ts` mirrors the Rust enums and their serialisation/parsing.
- The Rust crate exports golden vectors (every client and server message variant with its raw
  text, `src/tests/golden.rs`); the web tests check the port against them in both directions, and
  CI fails when the committed vectors are outdated. The crate's own explicit test vectors are few,
  so generated vectors from the reference implementation are the stronger source.

### D26: Engine config builder and frontend data
- `src/lib/engine/config.ts` is a 1:1 port of `commonConfig`, `getFullConfig` and
  `teamGameConfig`. Schemes, weapon sets and team colours are extracted from the Qt sources by
  `web/scripts/extract-frontend-data.py`, not copied by hand.
- Deviation: the plan asked for unit tests against outputs captured from the Qt6 frontend. Driving
  the Qt GUI headlessly to capture configs was not feasible without UI automation. Instead:
  explicit expectations derived from the Qt code in `test/config.test.ts`, a game played to the end
  by the FPC engine with a config from the builder (`scripts/dump-config.ts` +
  `hwipc.py --config-b64`), and the mixed online game test below, where native and web engines
  check each other's per-turn checksums.
- Network details that matter for sync and were checked against the server: teams keep the
  server's order; the server assigns colour and hedgehog number (`TEAM_COLOR`, `HH_NUM`) also for
  the owner; map parameters arrive as `FULLMAPCONFIG`; the room master has to publish the complete
  config (`GameCFGWidget::fullNetConfig`), the server only has placeholders; static maps are sent as
  `MAP`, generated maps only through `MAPGEN`; there is no `JOINING` for the own client.
- Team owner hashes need MD5 (`QCryptographicHash::Md5` of the nick); WebCrypto has none, so the
  client has a small tested implementation.

### D27: Game session and engine relay
- `src/lib/game/session.ts` filters engine output like `HWGame::ParseMessage` (chat, end, errors
  and stats handled locally, everything else relayed as `EM`), batches it per engine frame, and
  forwards server `EM`, `ROUND_FINISHED` and room chat into the engine.
- Every game uses a fresh engine module instance; the engine's globals are not meant to be reused.

### D28: Mixed online game test
- `project_files/web/tools/desktop-bot.py` is a TCP client that plays network games with the
  native FPC engine, relaying engine messages like `frontend-qt6`. `project_files/web/ci/
  mixed-game.sh` runs the server, the desktop client and two Chromium pages (Playwright) that play
  one online game with three AI teams. Engines in network games compare the per-turn checksums of
  remote turns and abort on a desync, so a finished game proves that native and web engines stayed
  in sync.
- The real Qt frontend is not part of the automated test (no GUI automation); a manual test with
  it is listed under open items.
