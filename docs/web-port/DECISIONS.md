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
