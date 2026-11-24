#!/bin/sh
# Record the determinism gate demo corpus with the given engine.
# Usage: record-corpus.sh <hwengine> <outdir> <tag> [extra hwipc.py record args]
# The web engine needs "--prequeue" (it cannot wait for the frontend).
set -e
engine="$1"; out="$2"; tag="$3"; shift 3
extra="$*"
mkdir -p "$out"
here="$(dirname "$0")"
rec() {
    name="$1"; shift
    python3 -I "$here/hwipc.py" record --engine "$engine" --prefix share/hedgewars/Data \
        --out "$out/$tag-$name.hwd" $extra "$@" > "$out/$tag-$name.log" 2>&1 \
        && echo "recorded $tag-$name" || { echo "FAILED $tag-$name"; tail -5 "$out/$tag-$name.log"; }
}
rec template   --seed 11 --theme Nature --mapgen 0 --teams 2 --hogs 3 --health 100 --damage 100 &
rec maze       --seed 12 --theme Castle --mapgen 1 --teams 2 --hogs 2 --health 100 --damage 150 &
rec perlin     --seed 13 --theme Desert --mapgen 2 --teams 3 --hogs 2 --health 80 --damage 150 &
rec wfc        --seed 14 --theme Snow   --mapgen 5 --teams 2 --hogs 2 --health 80 --damage 150 &
rec highlander --seed 15 --theme Hell   --mapgen 0 --teams 2 --hogs 3 --health 80 --damage 150 --script Highlander &
rec brw        --seed 16 --theme Cave   --mapgen 0 --teams 2 --hogs 2 --health 80 --damage 150 --script Balanced_Random_Weapon &
rec randweap   --seed 17 --theme Jungle --mapgen 0 --teams 3 --hogs 2 --health 80 --damage 150 --script Random_Weapon &
rec fourteams  --seed 18 --theme City   --mapgen 0 --teams 4 --hogs 2 --health 60 --damage 150 &
wait
