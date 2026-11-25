#!/bin/sh
# Start Caddy; with BASIC_AUTH_PASSWORD set, protect the site with basic auth
# (the password is hashed here, so the configuration never holds it).
set -eu
if [ -n "${BASIC_AUTH_PASSWORD:-}" ]; then
    export BASIC_AUTH_USER="${BASIC_AUTH_USER:-hedgewars}"
    BASIC_AUTH_HASH="$(caddy hash-password --plaintext "$BASIC_AUTH_PASSWORD")"
    export BASIC_AUTH_HASH
    # session cookie for the game connection (see auth-on.caddy)
    HW_WS_TOKEN="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
    export HW_WS_TOKEN
    export HW_AUTH=on
    unset BASIC_AUTH_PASSWORD
    echo "basic auth enabled for user $BASIC_AUTH_USER"
else
    export HW_AUTH=off
fi
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
