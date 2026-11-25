#!/usr/bin/env python3
"""A desktop client for automated network games: joins a room over TCP,
adds an AI team, gets ready and plays the game with the native engine,
relaying engine messages like frontend-qt6 (HWNewNet + HWGame).

Used by the web port's mixed game test (web browsers + this client).

Usage: desktop-bot.py --server HOST:PORT --nick NAME --room ROOM \
           --engine PATH --prefix DATA [--team NAME] [--level N]
Exit code 0 when a game was played to its end.
"""

import argparse
import base64
import hashlib
import os
import socket
import subprocess
import sys
import tempfile
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hwipc import NOT_RECORDED, engine_env, frame  # noqa: E402

# frontend-qt6/hwconsts.h HW_TEAMCOLOR_ARRAY
TEAM_COLORS = [0xff0204, 0x4980c1, 0x1de6ba, 0xb541ef, 0xe55bb0, 0x20bf00, 0xfe8b0e, 0x8f5902, 0xffff01]
GENERATED_MAPS = {"+rnd+", "+maze+", "+perlin+", "+drawn+", "+forts+", "+wfc+"}
FLAG_BITS = [(1, 0x1000), (2, 0x10), (3, 0x4), (4, 0x8), (5, 0x20), (6, 0x40), (7, 0x80), (8, 0x100),
             (9, 0x200), (10, 0x400), (11, 0x800), (12, 0x2000), (13, 0x4000), (14, 0x8000),
             (15, 0x10000), (16, 0x20000), (17, 0x40000), (18, 0x80000), (19, 0x100000),
             (20, 0x200000), (21, 0x400000), (22, 0x800000), (23, 0x1000000), (24, 0x2000000),
             (25, 0x4000000)]


def md5(s):
    return hashlib.md5(s.encode()).hexdigest()


def to_bool(v):
    return v.lower() not in ("", "0", "false")


def to_int(v):
    try:
        return int(v)
    except ValueError:
        return 0


def net_config(cfg, teams, nick):
    """HWGame::commonConfig for a network game (gameType gtNet)."""
    scheme = list(cfg.get("SCHEME", ["Default"]))
    if len(scheme) != 45:
        raise SystemExit("room has no complete scheme")
    scheme[44] = scheme[44][1:] if scheme[44].startswith("!") else scheme[44]
    ammo = cfg["AMMO"][1]
    mapname = cfg.get("MAP", ["+rnd+"])[0]
    script = cfg.get("SCRIPT", ["Normal"])[0]
    mapgen = to_int(cfg.get("MAPGEN", ["0"])[0])
    flags = 0
    for i, bit in FLAG_BITS:
        if to_bool(scheme[i]):
            flags |= bit
    lines = ["TN"]
    if script != "Normal":
        lines.append("escript Scripts/Multiplayer/%s.lua" % script.replace(" ", "_"))
    if mapname not in GENERATED_MAPS:
        lines.append("emap " + mapname)
    s = lambda i: to_int(scheme[i])
    lines += [
        "etheme " + cfg["THEME"][0], "eseed " + cfg["SEED"][0], "e$gmflags %d" % flags,
        "e$damagepct %d" % s(26), "e$turntime %d" % (s(27) * 1000), "e$inithealth %d" % s(28),
        "e$sd_turns %d" % s(29), "e$casefreq %d" % s(30), "e$minestime %d" % (s(31) * 1000),
        "e$minesnum %d" % s(32), "e$minedudpct %d" % s(33), "e$explosives %d" % s(34),
        "e$airmines %d" % s(35), "e$sentries %d" % s(36), "e$healthprob %d" % s(37),
        "e$hcaseamount %d" % s(38), "e$waterrise %d" % s(39), "e$healthdec %d" % s(40),
        "e$ropepct %d" % s(41), "e$getawaytime %d" % s(42), "e$worldedge %d" % s(43),
        "e$template_filter %d" % to_int(cfg.get("TEMPLATE", ["0"])[0]),
        "e$feature_size %d" % to_int(cfg.get("FEATURE_SIZE", ["12"])[0]),
        "e$mapgen %d" % mapgen, "e$scriptparam " + scheme[44],
    ]
    if mapgen in (1, 2):
        lines.append("e$maze_size %d" % to_int(cfg.get("MAZE_SIZE", ["0"])[0]))
    n = len(ammo) // 4
    for t in teams:
        lines += ["eammloadt " + ammo[:n], "eammprob " + ammo[n:2 * n], "eammdelay " + ammo[2 * n:3 * n],
                  "eammreinf " + ammo[3 * n:]]
        if to_bool(scheme[15]) or not to_bool(scheme[21]):
            lines.append("eammstore")
        color = TEAM_COLORS[t["color"]]
        if t["owner"] != nick:
            lines += ["eaddteam %s %d %s" % (md5(t["owner"]), color, t["name"]), "erdriven"]
        else:
            lines.append("eaddteam %s %d %s" % (md5(nick), color, t["name"]))
        lines += ["egrave " + t["grave"], "efort " + t["fort"], "evoicepack " + t["voice"],
                  "eflag " + t["flag"], "eowner " + t["owner"]]
        for name, hat in t["hogs"][:t["hhnum"]]:
            lines += ["eaddhh %d %d %s" % (t["level"], s(28), name), "ehat " + hat]
    return b"".join(frame(l.encode()) for l in lines)


class Bot:
    def __init__(self, args):
        self.args = args
        host, port = args.server.rsplit(":", 1)
        self.sock = socket.create_connection((host, int(port)))
        self.buf = b""
        self.cfg = {}
        self.teams = []
        self.lock = threading.Lock()
        self.engine_conn = None
        self.game_over = threading.Event()
        self.result = None

    def send(self, *lines):
        self.sock.sendall(("\n".join(lines) + "\n\n").encode())

    def messages(self):
        while True:
            while b"\n\n" in self.buf:
                raw, self.buf = self.buf.split(b"\n\n", 1)
                raw = raw.lstrip(b"\n")
                if raw:
                    yield raw.decode("utf-8", "replace").split("\n")
            data = self.sock.recv(65536)
            if not data:
                return
            self.buf += data

    def team(self, fields):
        hogs = [(fields[7 + 2 * i], fields[8 + 2 * i] or "NoHat") for i in range(8)]
        return {"name": fields[0], "grave": fields[1], "fort": fields[2], "voice": fields[3],
                "flag": fields[4], "owner": fields[5], "level": int(fields[6]), "hogs": hogs,
                "hhnum": 4, "color": 0}

    def run(self):
        a = self.args
        joined = False
        for m in self.messages():
            cmd = m[0]
            if cmd == "CONNECTED":
                self.send("NICK", a.nick)
                self.send("PROTO", "60")
            elif cmd == "PING":
                self.send("PONG")
            elif cmd == "LOBBY:JOINED" and a.nick in m[1:] and not joined:
                joined = True
                self.join_when_room_exists()
            elif cmd == "JOINED" and a.nick in m[1:]:
                hogs = []
                for i in range(8):
                    hogs += ["%s %d" % (a.team, i + 1), "NoHat"]
                self.send("ADD_TEAM", a.team, "0", "Statue", "Plane", "Default", "hedgewars", str(a.level), *hogs)
            elif cmd == "TEAM_ACCEPTED":
                own = self.team([a.team, "Statue", "Plane", "Default", "hedgewars", a.nick, str(a.level)]
                                + sum([["%s %d" % (a.team, i + 1), "NoHat"] for i in range(8)], []))
                self.teams.append(own)
                self.send("TOGGLE_READY")
            elif cmd == "ADD_TEAM":
                self.teams.append(self.team(m[1:]))
            elif cmd == "REMOVE_TEAM":
                self.teams = [t for t in self.teams if t["name"] != m[1]]
            elif cmd == "TEAM_COLOR":
                for t in self.teams:
                    if t["name"] == m[1]:
                        t["color"] = int(m[2])
            elif cmd == "HH_NUM":
                for t in self.teams:
                    if t["name"] == m[1]:
                        t["hhnum"] = int(m[2])
            elif cmd == "CFG":
                if m[1] == "FULLMAPCONFIG":
                    for k, v in zip(["FEATURE_SIZE", "MAP", "MAPGEN", "MAZE_SIZE", "SEED", "TEMPLATE"], m[2:]):
                        self.cfg[k] = [v]
                else:
                    self.cfg[m[1]] = m[2:]
            elif cmd == "RUN_GAME":
                threading.Thread(target=self.play, daemon=True).start()
            elif cmd == "EM":
                data = b"".join(base64.b64decode(x) for x in m[1:])
                with self.lock:
                    if self.engine_conn:
                        self.engine_conn.sendall(data)
            elif cmd == "ROUND_FINISHED":
                with self.lock:
                    if self.engine_conn:
                        self.engine_conn.sendall(frame(b"o"))
            elif cmd == "BYE":
                print("server: BYE", m[1:], file=sys.stderr)
                return
            if self.game_over.is_set():
                return

    def join_when_room_exists(self):
        def joiner():
            for _ in range(600):
                self.send("JOIN_ROOM", self.args.room)
                time.sleep(0.5)
                if self.cfg:
                    return
        threading.Thread(target=joiner, daemon=True).start()

    def play(self):
        a = self.args
        config = net_config(self.cfg, self.teams, a.nick)
        srv = socket.socket()
        srv.bind(("127.0.0.1", 0))
        srv.listen(1)
        port = srv.getsockname()[1]
        user = tempfile.mkdtemp(prefix="hwbot")
        proc = subprocess.Popen([a.engine, "--internal", "--port", str(port), "--prefix", a.prefix,
                                 "--user-prefix", user, "--nosound", "--nomusic", "--stats-only"],
                                stdout=subprocess.DEVNULL, stderr=open(os.path.join(user, "engine.log"), "w"),
                                env=engine_env())
        conn, _ = srv.accept()
        with self.lock:
            self.engine_conn = conn
        buf = b""
        finished = False
        while True:
            data = conn.recv(65536)
            if not data:
                break
            buf += data
            out = b""
            while len(buf) > buf[0]:
                msg = buf[1:1 + buf[0]]
                buf = buf[1 + buf[0]:]
                if not msg:
                    continue
                c = msg[0]
                if c == ord("?"):
                    conn.sendall(frame(b"!"))
                elif c == ord("C"):
                    conn.sendall(config)
                elif c == ord("q"):
                    finished = True
                elif c == ord("E"):
                    print("engine error:", msg[1:-2].decode("utf-8", "replace"), file=sys.stderr)
                elif c not in NOT_RECORDED:
                    out += frame(msg)
            if out:
                self.send("EM", base64.b64encode(out).decode())
        rc = proc.wait()
        with self.lock:
            self.engine_conn = None
        self.send("ROUNDFINISHED", "1" if finished else "0")
        log = open(os.path.join(user, "engine.log")).read()
        self.result = (rc, finished, "Desync" in log)
        print("desktop bot: engine rc=%d finished=%s desync=%s" % self.result, file=sys.stderr)
        self.game_over.set()
        self.sock.shutdown(socket.SHUT_RDWR)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--server", required=True)
    ap.add_argument("--nick", default="desktop")
    ap.add_argument("--room", required=True)
    ap.add_argument("--engine", required=True)
    ap.add_argument("--prefix", required=True)
    ap.add_argument("--team", default="Desktop Bots")
    ap.add_argument("--level", type=int, default=3)
    args = ap.parse_args()
    bot = Bot(args)
    bot.run()
    if bot.result is None:
        print("desktop bot: no game played", file=sys.stderr)
        sys.exit(1)
    rc, finished, desync = bot.result
    sys.exit(0 if rc == 0 and finished and not desync else 1)


if __name__ == "__main__":
    main()
