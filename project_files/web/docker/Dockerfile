# Pinned toolchain images for the Hedgewars web port.
#
# Targets:
#   native  - FPC engine, pas2c (GHC) engine, Rust libs, server, Lua tests,
#             determinism gate. Everything needed for M0 / CI.
#   desktop - native + Qt6, to verify that frontend-qt6 keeps building.
#   web     - desktop + emsdk + Rust wasm32-unknown-emscripten target; runs
#             every gate (FPC, pas2c and web engine).
#
# Build:  docker build -f project_files/web/docker/Dockerfile --target native -t hw-web-native .
#
# Versions are pinned by base image tag (Ubuntu 24.04 package set) plus
# explicit versions for Rust and emsdk. See docs/web-port/DECISIONS.md.

ARG UBUNTU_VERSION=24.04
FROM ubuntu:${UBUNTU_VERSION} AS native

ARG RUST_VERSION=1.91.0
ENV DEBIAN_FRONTEND=noninteractive \
    RUSTUP_HOME=/opt/rustup \
    CARGO_HOME=/opt/cargo \
    PATH=/opt/cargo/bin:$PATH

# Ubuntu 24.04: fpc 3.2.2, ghc 9.4.7, clang 18, cmake 3.28
RUN apt-get update -qq && apt-get install -y --no-install-recommends \
        ca-certificates curl git xz-utils python3 file \
        build-essential cmake ninja-build pkg-config \
        clang lld llvm \
        fp-compiler fp-units-gfx fp-units-misc \
        ghc libghc-mtl-dev libghc-parsec3-dev \
        libphysfs-dev libpng-dev liblua5.1-dev \
        libsdl2-dev libsdl2-image-dev libsdl2-mixer-dev libsdl2-net-dev libsdl2-ttf-dev \
        libgl-dev libglu1-mesa-dev libssl-dev \
        xvfb \
    && rm -rf /var/lib/apt/lists/*

RUN curl -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal \
        --default-toolchain ${RUST_VERSION} --no-modify-path \
    && chmod -R a+rwX /opt/rustup /opt/cargo

WORKDIR /src


FROM native AS desktop
RUN apt-get update -qq && apt-get install -y --no-install-recommends \
        qt6-base-dev qt6-tools-dev qt6-tools-dev-tools qt6-l10n-tools \
        libqt6svg6-dev qt6-multimedia-dev \
    && rm -rf /var/lib/apt/lists/*


FROM desktop AS web
ARG EMSDK_VERSION=4.0.10
ENV EMSDK=/opt/emsdk
RUN git clone --depth 1 --branch ${EMSDK_VERSION} https://github.com/emscripten-core/emsdk.git ${EMSDK} \
    && cd ${EMSDK} \
    && ./emsdk install ${EMSDK_VERSION} \
    && ./emsdk activate ${EMSDK_VERSION} \
    && chmod -R a+rwX ${EMSDK}
ENV PATH=${EMSDK}:${EMSDK}/upstream/emscripten:${EMSDK}/node/22.16.0_64bit/bin:$PATH
RUN rustup target add wasm32-unknown-emscripten
# Fill Emscripten's library cache once: many parallel emcc processes filling
# an empty cache deadlocked in a BuildKit build (cache lock).
RUN embuilder build libc libc++-noexcept libc++abi-noexcept libcompiler_rt libdlmalloc \
        libGL-getprocaddr libhtml5 libnoexit libsockets libstubs \
        sdl2 sdl2_ttf "sdl2_image:formats=png" "sdl2_mixer:formats=ogg" > /dev/null \
    && chmod -R a+rwX ${EMSDK}/upstream/emscripten/cache

# Libraries without an Emscripten port, built once and installed to /opt/wasm.
# PhysFS >= 3.0 is required (misc/libphysfs is 2.1).
ARG PHYSFS_VERSION=3.2.0
ARG PHYSFS_SHA256=1991500eaeb8d5325e3a8361847ff3bf8e03ec89252b7915e1f25b3f8ab5d560
RUN mkdir -p /tmp/physfs && cd /tmp/physfs \
    && curl -sSL -o physfs.tar.gz https://github.com/icculus/physfs/archive/refs/tags/release-${PHYSFS_VERSION}.tar.gz \
    && echo "${PHYSFS_SHA256}  physfs.tar.gz" | sha256sum -c - \
    && tar xzf physfs.tar.gz \
    && emcmake cmake -S physfs-release-${PHYSFS_VERSION} -B build -G Ninja \
        -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=/opt/wasm \
        -DPHYSFS_BUILD_SHARED=OFF -DPHYSFS_BUILD_TEST=OFF -DPHYSFS_BUILD_DOCS=OFF \
    && cmake --build build && cmake --install build \
    && cd / && rm -rf /tmp/physfs \
    && chmod -R a+rwX ${EMSDK}/upstream/emscripten/cache


# ---------------------------------------------------------------------------
# Production images (build context: repository root)
#   docker build -f project_files/web/docker/Dockerfile --target site .
#   docker build -f project_files/web/docker/Dockerfile --target server .
# See project_files/web/deploy/.

FROM web AS site-build
ARG SOURCE_URL=https://github.com/hedgewars/hw
COPY . /src
WORKDIR /src
RUN emcmake cmake -S . -B /build/web -G Ninja -DCMAKE_BUILD_TYPE=Release -DBUILD_ENGINE_JS=1 \
        -DPHYSFS_LIBRARY=/opt/wasm/lib/libphysfs.a -DPHYSFS_INCLUDE_DIR=/opt/wasm/include \
        -DRust_CARGO_TARGET=wasm32-unknown-emscripten -DNOVERSIONINFOUPDATE=1 \
    && ninja -C /build/web hwengine
# the data set the desktop build installs (no source files), for the packs
RUN cmake -S . -B /build/data -G Ninja -DGL2=1 -DNOSERVER=1 -DNOVIDEOREC=1 -DNOVERSIONINFOUPDATE=1 > /dev/null \
    && DESTDIR=/build/stage cmake --install /build/data/share > /dev/null
RUN cd web && npm ci --no-fund --no-audit --silent \
    && VITE_SOURCE_URL=${SOURCE_URL} npx vite build \
    && scripts/stage-assets.sh /build/web /build/stage/usr/local/share/hedgewars/Data dist \
    && cp -r dist /srv-site

FROM caddy:2.8.4-alpine AS site
COPY --from=site-build /srv-site /srv
COPY project_files/web/deploy/site/Caddyfile project_files/web/deploy/site/auth-on.caddy \
     project_files/web/deploy/site/auth-off.caddy /etc/caddy/
COPY project_files/web/deploy/site/start.sh /usr/local/bin/hw-site-start
CMD ["hw-site-start"]


FROM native AS server-build
COPY rust /src/rust
WORKDIR /src/rust
RUN cargo build --release -p hedgewars-server --features ws-connections

FROM ubuntu:${UBUNTU_VERSION} AS server
RUN useradd --system --home /var/lib/hedgewars-server --create-home hedgewars
COPY --from=server-build /src/rust/target/release/hedgewars-server /usr/local/bin/hedgewars-server
USER hedgewars
WORKDIR /var/lib/hedgewars-server
EXPOSE 46631 46632
ENTRYPOINT ["hedgewars-server"]
