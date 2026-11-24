#!/bin/sh
# Server tests for the web port: all feature combinations of hedgewars-server.
# Run inside the toolchain container from the repository root.
set -eu
cd rust
for features in "" "ws-connections" "tls-connections" "ws-connections,tls-connections"; do
    echo "== hedgewars-server features: ${features:-none}"
    cargo test -p hedgewars-server ${features:+--features $features} 2>&1 | grep -E "^test result|FAILED|panicked"
done
cargo test -p hedgewars-network-protocol 2>&1 | grep -E "^test result|FAILED|panicked"
