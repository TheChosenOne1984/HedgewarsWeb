# Hedgewars Web Port: Implementation Plan

Repository: https://github.com/hedgewars/hw (mirror of hg.hedgewars.org), analysed at commit `e0d2cac` (2026-11-23).

## Goal

Players open a website, join a lobby, and play Hedgewars online against each other. Web clients and desktop clients play together on the same server and in the same games.

## Ground rules for the agent

- **Never change simulation logic.** Every engine change must be behaviour-neutral for desktop builds. The determinism gate from M0 runs in CI on every change.
- **Keep desktop build paths building:** the FPC engine build and `frontend-qt6`.
- **Pin all toolchain versions** in a Dockerfile: emsdk, rustc, GHC and CMake.
- **Prefer the clean solution**, unless the effort clearly outweighs the benefit. Record every decision and deviation in `docs/web-port/DECISIONS.md`.
- **Keep patches upstreamable:** small, focused commits with no unrelated reformatting.
- **Respect GPL-2.0 (code) / GFDL-1.2 (assets):** source of all modifications must be published.

## Repository facts (verified)

| Path | Content | Status |
|---|---|---|
| `hedgewars/` | Engine, FreePascal | Active |
| `rust/lib-hwengine-future` | Rust lib linked into the engine (land, AI, FPNum fixed point), FFI in `hedgewars/uRust.pas` | Active, required |
| `rust/hedgewars-server` | Game server (tokio), TCP + optional TLS | Active, the only server (Haskell `gameServer/` removed 2026-11-18) |
| `rust/hedgewars-network-protocol` | Protocol parser/serializer | Active, reference spec |
| `frontend-qt6/` | Desktop frontend (lobby, config builder, EM relay) | Active, reference for porting |
| `tools/pas2c/` | Haskell Pascal→C converter | Maintained (last change 2024-08) |
| `project_files/hwc/` | C runtime (`rtl/`) + CMake for the C/JS engine build | Maintained, JS part stale |
| `project_files/web/pre.js`, `post.js` | Empty stubs | Stale (2016) |
| `cmake_modules/Platform/Emscripten.cmake` | Toolchain file | Stale (2016) |
| `project_files/frontlib/` | Old C frontend library | Dead (2015), do not use |

Relevant engine internals:

- **IPC:** `hedgewars/uIO.pas` connects via SDL_net TCP to `127.0.0.1:<port>` (frontend). Messages are length-prefixed shortstrings.
- **Main loop:** `hedgewars/hwengine.pas::MainLoop` is a blocking `while` loop with `SDL_Delay(1)`.
- **Blocking waits:**
  - `SendIPCAndWaitReply('C')` in `hwengine.pas` (game config).
  - `IPCWaitPongEvent` in `GenLandPreview`.
  - Lua `V?`/`v?` campaign and mission vars in `uScript.pas`.
- **Threads:** the AI uses `SDL_CreateThread` + `SDL_Delay` in `hedgewars/uAI.pas`.
- **Rendering:** a GL2 shader path exists (`-d GL2`); shaders in `share/hedgewars/Data/Shaders` are already `GL_ES`-compatible.
- **Library mode:** `HWLIBRARY` exports `hwengine_RunEngine(argc, argv)`.
- **Engine test suite:** `tests/lua/*.lua`, run via `hwengine --prefix share/hedgewars/Data --nosound --nomusic --stats-only --lua-test <file>` (see top-level `CMakeLists.txt`).

Frontend logic to port (reference implementation):

- `frontend-qt6/game.cpp`:
  - `commonConfig` builds the engine config.
  - `ParseMessage` handles engine→frontend messages.
  - `FromNet` / `flushNetBuffer` relay engine traffic.
- `frontend-qt6/ui/widget/gamecfgwidget.cpp::getFullConfig` builds the map and scheme commands.
- `frontend-qt6/team.cpp::teamGameConfig` builds the team commands.
- `frontend-qt6/net/newnetclient.cpp` sends engine traffic to the server as `EM` messages (base64).

## Findings from a test conversion (fix first)

A pas2c conversion of the current engine with `-d ENDIAN_LITTLE -d DEBUGFILE -d WEBGL -d HWLIBRARY -d GL2` succeeded after fixes 1–3 below. The generated C was compiled with clang 18 and linked natively against `libhwengine_future.a`; the only missing symbol was `main`, as expected in library mode.

1. **pas2c cannot parse `initialization` sections.** The first one was introduced in `hedgewars/uConsts.pas` by commit `9aca0a37e` (2026-06-07, "Use FPNum implementation in Rust").
   - Fix: add `initialization` (and `finalization`) support to pas2c (`PascalParser.hs`, `Pas2C.hs`). Emit `<unit>_init()` / `<unit>_fini()` and call them from the main module in unit-dependency order, matching FPC semantics.
   - Do not rewrite engine units to work around this.
2. **Missing integer aliases.** `Int8`, `Int16`, `Int32`, `UInt8`, `UInt16` and `UInt32` are absent from `hedgewars/pas2cSystem.pas` and `project_files/hwc/rtl/Types.h`. They are used by `uRust.pas` and `uCollisions.pas`.
3. **Missing declaration.** `fpcrtl_glShaderSource` is defined in `rtl/misc.c` but declared in no header; add it to `rtl/misc.h`.
4. **`rust/lib-hwengine-future/Cargo.toml` only builds a `cdylib`.** Use `crate-type = ["cdylib", "staticlib"]`.
5. **The Rust toolchain must be ≥ 1.85**, because dependencies require edition 2024. The test build used 1.91.
6. **Emscripten flags in `project_files/hwc/CMakeLists.txt` are obsolete.** `--memory-init-file`, `-g4`, `--js-opts`, `TOTAL_MEMORY` and `-s USE_SDL_TTF=2` must be rewritten for current emsdk.
7. **The rtl headers need clang**, because they use `__attribute__((overloadable))`. GCC does not work. This is fine, since emcc is clang.
8. **Unresolved:** the headless Lua test run of the native pas2c build hung (> 60 s, `SDL_VIDEODRIVER=dummy`). The cause is unknown; M0 must resolve it.

## Architecture decisions

| Area | Decision | Rejected alternative (reason) |
|---|---|---|
| Engine → WASM | pas2c → C → Emscripten, reviving `BUILD_ENGINE_JS` | FPC wasm32 target: experimental, no SDL2/GL bindings story |
| Rust lib | `staticlib` for `wasm32-unknown-emscripten`, linked by the same emcc | `wasm32-unknown-unknown`: separate libc/FS; `std::fs` reads of `data_path` break |
| IPC | Transport abstraction: TCP (desktop) / in-memory ring buffers + JS callbacks (web). Wire format unchanged | Emscripten socket emulation + websockify: extra hop, hacky |
| Main loop | Extract `MainLoopIteration`; web drives it via `emscripten_set_main_loop`. Blocking waits removed by design | Asyncify/JSPI: binary size and perf cost, hides the design issue |
| Threads | No pthreads; AI thinks cooperatively in time slices per frame | pthreads: needs COOP/COEP **and** nightly `build-std` Rust with atomics |
| Rendering | GL2 path on WebGL 1 (`-sMAX_WEBGL_VERSION=1`); `WEBGL` define already disables S3D | — |
| Frontend | New TypeScript web app (Vite, Svelte or Lit); logic ported from `frontend-qt6` | Qt6-for-WASM: 20+ MB download, poor web UX; `frontlib`: dead |
| Protocol client | TypeScript implementation with golden tests from `rust/hedgewars-network-protocol` | wasm-bindgen build of the Rust crate: second WASM toolchain for a simple text protocol |
| Server | Native WebSocket listener in `hedgewars-server`, feature `ws-connections`; TLS terminated at the reverse proxy | websockify sidecar: extra component, loses client IP |
| Assets | Content-addressed packs (core + per theme/voice/music/…) with a manifest; fetch only what the room config needs before engine start | Single preload bundle (~200 MB): unacceptable first load |
| Hosting | Caddy (static files, brotli, `/ws` proxy) + `hedgewars-server`, Docker Compose | — |

## Milestones

### M0: Native C engine green (gate for everything else)

Tasks:
1. Apply fixes 1–5 and build the engine with `-DBUILD_ENGINE_C=ON` (native, clang).
2. Debug the Lua test hang (finding 8). Candidates:
   - a GL context required despite `--stats-only`;
   - the dummy video driver;
   - a semantic error from conversion causing an infinite loop.
   Compare against the FPC build of the same revision.
3. Make `ctest` (all `tests/lua/**`) pass on the pas2c build.
4. **Determinism gate.** Build the FPC engine and the pas2c engine from the same revision. Replay identical demos and record per-turn checksums (`lastTurnChecksum` in `uIO.pas`). They must be bit-identical.
5. Audit pas2c for integer semantics: signed `div`/`mod`, `shr` on signed types, overflow wraparound, and `Byte`/`ShortInt`/`Int64` all mapped to `integer` in `pas2cSystem.pas`. Add targeted tests where in doubt.
6. Add a CI job (container with pinned GHC, clang, Rust) that runs the Lua tests and the determinism gate.

Acceptance:
- All Lua tests pass on the pas2c build.
- Demo checksums are identical between the FPC and pas2c builds.
- CI is green.

### M1: Engine in the browser (offline hotseat)

Tasks:
1. **Toolchain.**
   - Pinned emsdk plus Rust with the `wasm32-unknown-emscripten` target.
   - Verify rustc's emscripten target ABI is compatible with the pinned emcc and document the pair.
   - Integrate the Rust build into CMake (`tools/corrosion` is vendored).
2. **Rewrite the Emscripten flags.** Baseline:
   ```
   -sUSE_SDL=2 -sUSE_SDL_IMAGE=2 -sSDL2_IMAGE_FORMATS='["png"]'
   -sUSE_SDL_TTF=2 -sUSE_SDL_MIXER=2 -sSDL2_MIXER_FORMATS='["ogg"]'
   -sMAX_WEBGL_VERSION=1 -sALLOW_MEMORY_GROWTH=1
   -sMODULARIZE=1 -sEXPORT_ES6=1
   -sEXPORTED_FUNCTIONS=[_hwengine_RunEngine,_hw_ipc_push,_malloc,_free]
   -sEXPORTED_RUNTIME_METHODS=[FS,ccall,cwrap]
   ```
   - Build Lua and PhysFS from `misc/`.
   - SDL_net must not be linked in the web build.
3. **IPC transport (`hedgewars/uIO.pas`).**
   - `{$IFDEF WEBGL}` replaces the socket with an inbound ring buffer filled by an exported `hw_ipc_push(ptr, len)` and an outbound `EM_JS` callback.
   - `IPCCheckSock`, `SendIPC` and `SendIPCRaw` route through the transport.
   - Desktop behaviour stays byte-identical.
4. **Main loop (`hedgewars/hwengine.pas`).**
   - Extract the body of `MainLoop` into `MainLoopIteration`.
   - Desktop keeps the `while` loop; web registers the iteration with `emscripten_set_main_loop(…, 0, 0)` and drops `SDL_Delay`.
   - Engine termination must call back into JS (for example `onEngineExit(code)`).
5. **Remove blocking waits.**
   - `'C'` config: the frontend pushes the complete config into the inbound queue before calling `hwengine_RunEngine`, so the existing wait returns immediately. Add a guard that fails loudly instead of spinning when the queue is empty on web.
   - Lua `V?`/`v?`: answer synchronously from a JS-side key-value store via `EM_JS` under `WEBGL`.
   - `GenLandPreview` / `IPCWaitPongEvent`: make it non-blocking on web, or defer it to M3 if the preview uses a different path.
6. **AI (`hedgewars/uAI.pas`).** Under `WEBGL`, replace thread creation with cooperative `Think` slices that use a fixed time budget per frame. Remove `SDL_Delay` calls in the think path. The AI output (commands) must stay identical to the threaded version for the same state.
7. **Assets.**
   - A build step splits `share/hedgewars/Data` into packs: `core`, `themes/<name>`, `voices/<name>`, `music`, `forts`, `hats`, `graves`, `flags`, `maps/<name>`, `missions`.
   - Emit `manifest.json` with path, sha256 and size for each pack.
   - Serve packs content-addressed with `Cache-Control: immutable`.
   - The engine reads from MEMFS via PhysFS, `--prefix /data/Data`.
8. **Canvas integration.** Resize from container size → SDL window events, fullscreen, pointer lock for the mouse camera, and audio unlock on the first user gesture.
9. **Minimal harness page.** Start a local two-team hotseat game from a hard-coded config.

Acceptance:
- A hotseat game runs to completion at 60 FPS in current Chrome and Firefox.
- Sound works after the first click.
- The `core` pack is ≤ 30 MB compressed.
- A game with an AI team works without stutter > 50 ms per frame.

### M2: Server WebSocket support

Tasks:
1. In `rust/hedgewars-server/src/server/network.rs`, add `ClientStream::Ws(…)`. Use `tokio-tungstenite` with an `AsyncRead`/`AsyncWrite` adapter (for example `ws_stream_tungstenite`), behind feature `ws-connections`.
2. Add a separate listener (CLI `--ws-port`), an origin allowlist (CLI/config) and binary frames carrying the existing byte stream. `ProtocolDecoder` stays unchanged.
3. Client IP: use `X-Forwarded-For` only when the TCP peer is in a configured trusted-proxy list. Bans and flood control (`core/bans.rs`, `core/flood.rs`) depend on this.
4. Add an integration test: a WS client performs the login handshake and joins a room.
5. Update `Cargo.toml` features and the server documentation.

Acceptance:
- A WS client can log in, create and join rooms, and chat.
- A desktop client connected via TCP sees the WS client in the lobby.
- Existing server tests pass.

### M3: Web frontend

Tasks:
1. **Project setup.** `web/` directory, TypeScript + Vite, Svelte or Lit (decide and record), ESLint/Prettier, Vitest.
2. **Protocol client.** Implement it from `rust/hedgewars-network-protocol`. Extract the crate's test vectors into golden tests, then build the login flow, lobby, rooms, chat, room config messages and `EM` relay.
3. **Engine config builder.** 1:1 port of `commonConfig`, `getFullConfig` and `teamGameConfig`, including schemes, weapon sets (`eammloadt/eammprob/eammdelay/eammreinf/eammstore`), map types (template, maze, perlin, drawn), script params and team colours. Unit tests compare against outputs captured from the Qt6 frontend for a set of fixed configs.
4. **Engine host.**
   - Load the WASM module, resolve the required asset packs from the room config, fetch them into MEMFS, push the config, start the engine.
   - Relay engine output to the server as `EM` and server `EM` messages to `hw_ipc_push`.
   - Handle engine exit and errors.
5. **UI.**
   - Login with a nickname (registered accounts optional/later), room list, room view (teams, scheme, map, chat), and team editor (hats, graves, forts, flags, voices).
   - Settings: keys, volume, language.
   - Persist teams and settings in IndexedDB.
6. **Map preview.** Use the engine's preview path or a small separate WASM build of `rust/landgen`. Decide after measuring size and latency.
7. **Localisation.** Reuse existing translation sources where licensing and format allow; English and German first.

Acceptance:
- Two browsers and one desktop client play a complete online game together.
- Chat works in the lobby and in-game.
- A dropped connection produces a defined, user-visible outcome.

### M4: Deployment

Tasks:
1. Docker Compose with two services:
   - Caddy: static `web/` build, asset packs, brotli/zstd, correct `application/wasm` MIME, CSP, `/ws` reverse proxy.
   - `hedgewars-server` built with `--features ws-connections`.
2. Verify that the server's protocol/version mapping matches the engine's `cNetProtoVersion` in CI.
3. Structured server logs to stdout; healthcheck endpoint or TCP check.
4. Add a GPL source link in the web UI footer that points to the exact source revision.

Acceptance:
- `docker compose up` on a clean host yields a working site with TLS.
- Desktop clients can connect to the same server via TCP.

### M5: Hardening and polish

Tasks:
1. **Desync handling.** On a checksum mismatch, show a clear error and offer a demo download for debugging.
2. **Performance.**
   - Profile the per-operation Rust FFI calls (`hwf_op_*` in `uRust.pas`) in WASM.
   - Enable LTO across C and Rust, run `wasm-opt -O3`, and measure the total download size.
3. **Browser matrix.** Chrome, Firefox and Safari (current). Document known issues.
4. **Mobile/touch:** out of scope for v1. Show a "desktop browser required" notice on touch-only devices.
5. **Upstreaming.** Prepare patch series:
   - pas2c `initialization` support and the type and header fixes;
   - the IPC transport abstraction;
   - the main loop split;
   - cooperative AI;
   - the server WS listener.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| pas2c semantic drift breaks determinism | Mixed desktop/web games desync | M0 determinism gate in CI; fix pas2c rather than engine code |
| Lua test hang (finding 8) has a deep cause | M0 delay | Bisect FPC vs pas2c build behaviour; enable `DEBUGFILE` logs |
| Rust emscripten target ABI vs emcc mismatch | Link or runtime failures | Pin a known-good rustc/emsdk pair; document it |
| Upstream engine keeps changing (Rust migration ongoing) | Rebase effort | Small upstreamable patches; track upstream weekly |
| Asset size / first-load time | Poor UX | Pack splitting, lazy theme loading, long-lived caching |
| Browser audio/input quirks | UX issues | Audio unlock on gesture, pointer lock, browser matrix in M5 |