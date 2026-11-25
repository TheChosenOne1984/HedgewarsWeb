# Deploying Hedgewars online

Two containers: **site** (Caddy: the web client, the web engine, the asset
packs, TLS, and the `/ws` proxy to the game server) and **server**
(`hedgewars-server` with WebSocket support). Desktop clients connect to the
game server directly; web clients connect through Caddy. Both meet in the same
lobby.

## Run

    cd project_files/web/deploy
    DOMAIN=hw.example.org docker compose up -d --build

- `DOMAIN` must resolve to the host; Caddy obtains a certificate for it.
  Without `DOMAIN` the site runs on `https://localhost` with a local CA.
- Ports: 80/443 (site), 46631 (desktop clients, plain TCP).
- Desktop clients: add the host as a server in the network dialog (port 46631).

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

Responses are compressed (zstd, gzip); `.wasm` is served as
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
source in its footer; set the build argument `SOURCE_URL` (Dockerfile stage
`site-build`) to the exact revision you deploy.
