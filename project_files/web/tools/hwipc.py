#!/usr/bin/env python3
"""Headless stand-in for the frontend's engine IPC (frontend-qt6/game.cpp).

Used by the determinism gate:

  record  - start a local AI-vs-AI game and save the demo the way
            frontend-qt6 does (HWForm::GetRecord).
  replay  - play a demo headless (--stats-only) and report the result.

The engine wire format: every message is <len:u8><payload>. Messages from the
engine carry the GameTicks (u16, big endian) as the last two payload bytes.
"""

import argparse
import os
import random
import socket
import subprocess
import sys
import tempfile
import time

# frontend-qt6/weapons.h, AMMOLINE_DEFAULT_*
AMMO_QT = "939192942219912103223511100120000000021110010101111100010001"
AMMO_PROB = "040504054160065554655446477657666666615551010111541111111073"
AMMO_DELAY = "000000000000020550000004000700400000000022000000060002000000"
AMMO_CRATE = "131111031211111112311411111111111111121111111111111111111111"

# Messages the frontend handles itself and does not put into the demo
# (HWGame::ParseMessage). Everything else from the engine is recorded.
NOT_RECORDED = set(b"?CEiQqmHsbVvW~")


def frame(payload: bytes) -> bytes:
    payload = payload[:250]
    return bytes([len(payload)]) + payload


def game_config(seed: str, theme: str, mapgen: int, teams: list, scheme: dict, script: str = "") -> bytes:
    """Port of HWGame::commonConfig + GameCFGWidget::getFullConfig +
    HWTeam::teamGameConfig for a local game with bot teams."""
    cfg = [b"TL"]
    lines = [f"escript Scripts/Multiplayer/{script}.lua"] if script else []
    lines += [
        f"etheme {theme}",
        f"eseed {seed}",
        f"e$gmflags {scheme['gmflags']}",
        f"e$damagepct {scheme['damagepct']}",
        f"e$turntime {scheme['turntime'] * 1000}",
        f"e$inithealth {scheme['inithealth']}",
        f"e$sd_turns {scheme['sd_turns']}",
        f"e$casefreq {scheme['casefreq']}",
        f"e$minestime {scheme['minestime'] * 1000}",
        f"e$minesnum {scheme['minesnum']}",
        f"e$minedudpct {scheme['minedudpct']}",
        f"e$explosives {scheme['explosives']}",
        "e$airmines 0",
        "e$sentries 0",
        "e$healthprob 35",
        "e$hcaseamount 25",
        "e$waterrise 47",
        "e$healthdec 5",
        "e$ropepct 100",
        "e$getawaytime 100",
        "e$worldedge 0",
        "e$template_filter 0",
        "e$feature_size 12",
        f"e$mapgen {mapgen}",
        "e$scriptparam ",
    ]
    if mapgen in (1, 2):  # mgMaze, mgPerlin
        lines.append("e$maze_size 0")
    cfg += [l.encode() for l in lines]
    for name, color, level, hogs in teams:
        cfg += [
            f"eammloadt {AMMO_QT}".encode(),
            f"eammprob {AMMO_PROB}".encode(),
            f"eammdelay {AMMO_DELAY}".encode(),
            f"eammreinf {AMMO_CRATE}".encode(),
            b"eammstore",  # shared ammo off, per-hog ammo off
            f"eaddteam {'0' * 32} {color} {name}".encode(),
            b"egrave Statue",
            b"efort Plane",
            b"evoicepack Default",
            b"eflag hedgewars",
        ]
        for i in range(hogs):
            cfg += [f"eaddhh {level} {scheme['inithealth']} {name}{i}".encode(), b"ehat NoHat"]
    return b"".join(frame(c) for c in cfg)


def engine_env():
    env = dict(os.environ)
    env.setdefault("SDL_VIDEODRIVER", "dummy")
    env.setdefault("SDL_AUDIODRIVER", "dummy")
    return env


def record(args) -> int:
    rnd = random.Random(args.seed)
    seed = "{%08x-%04x-%04x-%04x-%012x}" % (
        rnd.getrandbits(32), rnd.getrandbits(16), rnd.getrandbits(16),
        rnd.getrandbits(16), rnd.getrandbits(48))
    colors = [0xFF0000, 0x4980C1, 0x1FE601, 0xB541EF]
    names = ["Red", "Blue", "Green", "Purple"]
    teams = [(names[i], colors[i], rnd.randint(1, 5), args.hogs) for i in range(args.teams)]
    scheme = dict(gmflags=0x2000, damagepct=args.damage, turntime=args.turntime,
                  inithealth=args.health, sd_turns=args.sd_turns, casefreq=5,
                  minestime=3, minesnum=4, minedudpct=0, explosives=2)
    config = game_config(seed, args.theme, args.mapgen, teams, scheme, args.script)

    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.bind(("127.0.0.1", 0))
    srv.listen(1)
    port = srv.getsockname()[1]

    userdir = tempfile.mkdtemp(prefix="hwuser")
    cmd = [args.engine, "--internal", "--port", str(port), "--prefix", args.prefix,
           "--user-prefix", userdir, "--nosound", "--nomusic", "--stats-only"]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL if not args.verbose else None,
                            stderr=subprocess.DEVNULL if not args.verbose else None,
                            env=engine_env())
    srv.settimeout(30)
    conn, _ = srv.accept()
    conn.settimeout(args.timeout)

    demo = bytearray()
    buf = bytearray()
    finished = False
    deadline = time.monotonic() + args.max_time
    try:
        while True:
            if time.monotonic() > deadline:
                print(f"game exceeded {args.max_time}s", file=sys.stderr)
                proc.kill()
                break
            data = conn.recv(65536)
            if not data:
                break
            buf += data
            while len(buf) > 0 and len(buf) > buf[0]:
                msg = bytes(buf[1:1 + buf[0]])
                del buf[:1 + buf[0]]
                if not msg:
                    continue
                c = msg[0]
                if c == ord("?"):
                    conn.sendall(frame(b"!"))
                elif c == ord("C"):
                    conn.sendall(config)
                    demo += config
                elif c == ord("E"):
                    print("engine error:", msg[1:-2].decode(errors="replace"), file=sys.stderr)
                elif c == ord("q"):
                    finished = True
                elif c not in NOT_RECORDED:
                    demo += frame(msg)
    except socket.timeout:
        print("timeout waiting for engine", file=sys.stderr)
        proc.kill()
    rc = proc.wait()
    if not finished:
        print(f"game did not finish (engine rc={rc})", file=sys.stderr)
        return 1
    demo = demo.replace(b"\x02TL", b"\x02TD")
    with open(args.out, "wb") as f:
        f.write(demo)
    print(f"recorded {args.out}: {len(demo)} bytes, {demo.count(b'N')} N, seed {seed}")
    return 0


def replay(args) -> int:
    userdir = tempfile.mkdtemp(prefix="hwuser")
    cmd = [args.engine, "--prefix", args.prefix, "--user-prefix", userdir,
           "--nosound", "--nomusic", "--stats-only", args.demo]
    p = subprocess.run(cmd, capture_output=True, env=engine_env(), timeout=args.timeout)
    out = p.stdout.decode(errors="replace") + p.stderr.decode(errors="replace")
    desync = "Desync detected" in out
    # stats lines are the deterministic summary of the replayed game
    stats = [l for l in out.splitlines() if l.startswith(("DRAW", "WINNER", "GHOST_POINTS", "TEAM_STATS",
                                                          "TEAM_RANK", "PLAYER_KILLS", "TURN_TIME", "TURN"))]
    if args.stats_out:
        with open(args.stats_out, "w") as f:
            f.write("\n".join(stats) + "\n")
    if desync:
        print(f"DESYNC {args.demo}")
        return 2
    if p.returncode != 0:
        print(f"FAIL {args.demo}: rc={p.returncode}\n{out[-2000:]}")
        return 1
    print(f"OK {args.demo} ({len(stats)} stat lines)")
    return 0


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("record")
    r.add_argument("--engine", required=True)
    r.add_argument("--prefix", required=True)
    r.add_argument("--out", required=True)
    r.add_argument("--seed", type=int, default=0)
    r.add_argument("--theme", default="Nature")
    r.add_argument("--mapgen", type=int, default=0)
    r.add_argument("--hogs", type=int, default=2)
    r.add_argument("--teams", type=int, default=2)
    r.add_argument("--script", default="")
    r.add_argument("--health", type=int, default=50)
    r.add_argument("--damage", type=int, default=200)
    r.add_argument("--turntime", type=int, default=20)
    r.add_argument("--sd-turns", type=int, default=5)
    r.add_argument("--timeout", type=int, default=120, help="max seconds without engine traffic")
    r.add_argument("--max-time", type=int, default=600, help="max seconds per game")
    r.add_argument("--verbose", action="store_true")
    r.set_defaults(func=record)
    p = sub.add_parser("replay")
    p.add_argument("--engine", required=True)
    p.add_argument("--prefix", required=True)
    p.add_argument("--stats-out")
    p.add_argument("--timeout", type=int, default=600)
    p.add_argument("demo")
    p.set_defaults(func=replay)
    args = ap.parse_args()
    sys.exit(args.func(args))


if __name__ == "__main__":
    main()
