# Hedgewars game server

The lobby and game server the frontends connect to.

## Build

    cargo build --release -p hedgewars-server [--features <features>]

Features:

| Feature | |
|---|---|
| `tls-connections` | TLS listener (`native-tls`) |
| `official-server` | database, registered accounts, replay storage (implies TLS) |
| `ws-connections` | WebSocket listener for the web client |

With CMake: `-DBUILD_OFFICIAL_SERVER=ON`, `-DBUILD_SERVER_WEBSOCKETS=ON`.

## Run

    hedgewars-server [--port 46631]

| Option | |
|---|---|
| `-p`, `--port PORT` | TCP port for desktop clients (default 46631) |
| `--ws-port PORT` | accept WebSocket connections on this port (`ws-connections`) |
| `--ws-origin ORIGIN` | allowed `Origin` of WebSocket clients, repeatable; default: any origin |
| `--trusted-proxy IP` | take the client address from `X-Forwarded-For` when the connection comes from this address, repeatable |

`RUST_LOG` sets the log level (default `info`).

## WebSocket connections

A WebSocket connection carries the same protocol as a TCP connection; client
messages may be sent as binary or text frames, the server sends binary frames.
Desktop and web clients share the lobby and rooms.

The server speaks plain `ws://`. Run it behind a reverse proxy that terminates
TLS and forwards the WebSocket upgrade, e.g. Caddy:

    hw.example.org {
        reverse_proxy /ws hedgewars-server:46632
    }

and start the server with

    hedgewars-server --ws-port 46632 --ws-origin https://hw.example.org --trusted-proxy <proxy address>

Bans and flood control work per client address. Without `--trusted-proxy` every
web client would appear with the proxy's address, so always configure it when a
proxy is used. `X-Forwarded-For` is only honoured for the listed proxies; the
rightmost address that is not a trusted proxy is used.

## Reconnect limit

The server refuses a client whose address connected more than twice in 30 s,
three times in 2 min or five times in 10 min ("Reconnected too fast"; refused
attempts do not count). `--reconnect-limit-exempt=IP` (repeatable) lifts the
limit for an address, e.g. a LAN or a test setup where all players share one.
