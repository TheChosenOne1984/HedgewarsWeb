#!/bin/sh
# Manual test: web clients and the Qt desktop frontend on one server.
# Everything runs in Docker; nothing is installed on the host.
#
#   manual-test.sh up     start server + web site (https://localhost:8443,
#                         desktop clients on localhost:46731)
#   manual-test.sh qt     start the Qt frontend in a window (X11/XWayland)
#   manual-test.sh down   stop and remove everything
#
# Run from the repository root. "up" needs the images from
# project_files/web/ci/deploy-smoke.sh (or builds them, ~15 min); "qt" needs
# the desktop build from the engine gate (build-gate/c), or builds it.
set -eu
root="$(pwd)"
compose() {
    docker compose -p hwtest -f project_files/web/deploy/docker-compose.yml -f project_files/web/deploy/build.yml \
        -f project_files/web/deploy/test-ports.yml "$@"
}

case "${1:-}" in
up)
    compose up -d
    echo
    echo "Web client:      https://localhost:8443  (accept the certificate warning)"
    echo "Desktop clients: server localhost, port 46731"
    ;;
qt)
    if [ ! -x build-gate/c/bin/hedgewars ]; then
        echo "building the desktop frontend and engine (build-gate/c) ..."
        project_files/web/docker/run.sh desktop "cmake -S . -B build-gate/c -G Ninja \
            -DCMAKE_BUILD_TYPE=Release -DNOSERVER=1 -DNOVIDEOREC=1 -DGL2=1 -DBUILD_ENGINE_C=1 > /dev/null \
            && ninja -C build-gate/c"
    fi
    data=.cache/manual/data
    if [ ! -d "$data/Data" ]; then
        echo "installing the game data into $data ..."
        project_files/web/docker/run.sh desktop "DESTDIR=/src/.cache/manual/stage cmake --install build-gate/c/share > /dev/null \
            && mkdir -p $data && cp -r .cache/manual/stage/usr/local/share/hedgewars/Data $data/"
    fi
    mkdir -p .cache/manual/config
    xauth="${XAUTHORITY:-$HOME/.Xauthority}"
    docker run --rm --network host -u "$(id -u):$(id -g)" -e HOME=/tmp \
        -e DISPLAY="${DISPLAY:-:0}" -e XAUTHORITY=/tmp/xauth -v "$xauth:/tmp/xauth:ro" \
        -v /tmp/.X11-unix:/tmp/.X11-unix -v "$root:/src" -w /src \
        hw-web-desktop build-gate/c/bin/hedgewars \
        --data-dir="/src/$data" --config-dir=/src/.cache/manual/config
    ;;
down)
    compose down -v
    ;;
*)
    sed -n '2,13p' "$0"
    exit 1
    ;;
esac
