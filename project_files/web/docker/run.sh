#!/bin/sh
# Run a command inside a pinned toolchain container with the repo mounted at /src.
# Usage: project_files/web/docker/run.sh [native|desktop|web] <command...>
set -e
target="${1:-native}"; shift
root="$(cd "$(dirname "$0")/../../.." && pwd)"
mkdir -p "$root/.cache/cargo"
exec docker run --rm -i \
    -u "$(id -u):$(id -g)" \
    -e HOME=/tmp -e CARGO_HOME=/src/.cache/cargo \
    -v "$root:/src" -w /src \
    "hw-web-$target" sh -c "$*"
