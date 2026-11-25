# Deploying Hedgewars online

Two containers: **site** (Caddy: the web client, the web engine, the asset
packs, TLS, and the `/ws` proxy to the game server) and **server**
(`hedgewars-server` with WebSocket support). Desktop clients connect to the
game server directly; web clients connect through Caddy. Both meet in the same
lobby.

## Run

    cd project_files/web/deploy
    cp .env.example .env      # then edit .env
    docker compose pull       # ready-made images from GHCR
    docker compose up -d

`.github/workflows/images.yml` builds the images and publishes them to the
GitHub Container Registry (`ghcr.io/thechosenone1984/hedgewars-site` and
`…/hedgewars-server`): every push to `web-port` as tag `web-port`, every
release tag `<hedgewars version>-web.<n>` (e.g. `1.1.0-web.1`) under its name
and as `latest`. `HW_VERSION` in `.env` picks one.

The server only needs `docker-compose.yml` and `.env` (plus
`desktop-clients.yml` for desktop clients), not the repository. To build the
images yourself instead (15–30 min, ~15 GB for the toolchain), use the
repository and add `build.yml`:
`docker compose -f docker-compose.yml -f build.yml up -d --build`
(`SOURCE_URL` there sets the footer's source link).

To publish a release:

    git tag -a 1.1.0-web.2 -m "Hedgewars web 1.1.0-web.2" && git push origin 1.1.0-web.2

Settings in `.env`:

- `DOMAIN` must resolve to the host; Caddy obtains a certificate for it.
  Without `DOMAIN` the site runs on `https://localhost` with a local CA.
- `BASIC_AUTH_PASSWORD` (and `BASIC_AUTH_USER`, default `hedgewars`): protect
  the whole site with basic auth, for a private group. Empty: open site.
  The game connection (`/ws`) is covered too; since Safari/WebKit does not
  send basic auth with WebSocket handshakes, a logged-in page gets a random
  session cookie for `/ws` (new on every container start).
- Desktop clients: off by default. `COMPOSE_FILE=docker-compose.yml:desktop-clients.yml`
  publishes the game server's port 46631; add the host as a server in the Qt
  network dialog. Basic auth does not protect this port; restrict it with a
  firewall if the site is private.

Ports: 80/443 (site), 46631 (desktop clients, only with `desktop-clients.yml`).

The first build compiles the engine to WebAssembly and builds the asset packs;
it takes several minutes.

## What runs where

| Path | Content | Caching |
|---|---|---|
| `/`, `/index.html` | web client | revalidate |
| `/assets/*` | client code (hashed names) | immutable |
| `/engine/hwengine.mjs`, `.wasm` | web engine | revalidate |
| `/packs/manifest.json`, `catalog.json` | asset pack index | revalidate |
| `/packs/*.hwpack` | asset packs (content-addressed) | immutable |
| `/ws` | WebSocket to the game server | — |

Files are compressed once when the image is built (zstd -19, gzip -9;
`web/scripts/precompress.sh`) and served as they are, so the server spends no
CPU on compression; PNG/OGG-heavy packs stay plain. `.wasm` is served as
`application/wasm`. The Content-Security-Policy allows WebAssembly
(`wasm-unsafe-eval`) but no `eval`.

## Client addresses

The game server bans and throttles per client address. It trusts
`X-Forwarded-For` only from Caddy's fixed address on the compose network
(`--trusted-proxy=172.30.0.10`). If you change the network, change both.

## Logs and health

- `docker compose logs -f server` (level via `RUST_LOG`, default `info`).
- The server container has a TCP health check on port 46631.

## Source code

Hedgewars is GPL-2.0 (code) and GFDL-1.2 (data). The web client links to the
source in its footer; set `SOURCE_URL` in `.env` (build argument of the Dockerfile stage
`site-build`) to the exact revision you deploy.

## Testing the stack

    project_files/web/ci/deploy-smoke.sh   # build, start on test ports, browser checks
    project_files/web/ci/deploy-auth.sh    # basic auth and desktop port options

The tests start the stack on ports 8080/8443/46731 (`test-ports.yml`).
