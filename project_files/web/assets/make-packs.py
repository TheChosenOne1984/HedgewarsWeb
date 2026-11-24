#!/usr/bin/env python3
"""Split the installed Hedgewars data directory into content-addressed packs.

The web frontend downloads only the packs a game needs (the core pack plus
the room's theme, map, voices, hats, ...) and unpacks them into the engine's
in-memory file system before starting the engine. Files must end up as real
files there, because the Rust map generators read them with std::fs.

Pack format (".hwpack"):
    magic   4 bytes  b"HWP1"
    hlen    u32 LE   length of the header
    header  JSON     {"files": [{"path": "Graphics/Foo.png", "size": 123}, ...]}
    data             the file contents, concatenated in header order

Packs are stored uncompressed: most assets are PNG/OGG already, and the web
server compresses the rest (Lua, text, YAML) on the fly.

Hats (about 1 MB in total) stay in the core pack: hundreds of tiny packs would
cost more in requests than they save.

manifest.json:
    {"version": 1,
     "packs": {"core": {"file": "core.<hash>.hwpack", "sha256": ..., "size": ...,
                        "files": <count>}, ...}}

Usage: make-packs.py <installed Data dir> <output dir>
"""

import hashlib
import json
import os
import struct
import sys

MAGIC = b"HWP1"

# locales whose UI text needs the CJK font
CJK_LOCALES = {"ja", "ko", "zh_CN", "zh_TW"}


def locale_of(name):
    """Language code of a file in Locale/, or None for shared files."""
    base = name.rsplit(".", 1)[0]
    for prefix in ("campaigns_", "missions_"):
        if base.startswith(prefix):
            return base[len(prefix):]
    return base


def pack_name(path):
    """Name of the pack that a data file (relative path) belongs to."""
    parts = path.split("/")
    top = parts[0]
    if top == "Themes" and len(parts) > 2:
        return "themes/" + parts[1]
    if top == "Maps" and len(parts) > 2:
        return "maps/" + parts[1]
    if top == "Music":
        return "music/" + parts[-1].rsplit(".", 1)[0]
    if top == "Forts":
        return "forts"
    if top == "Missions" or (top == "Graphics" and len(parts) > 2 and parts[1] == "Missions"):
        return "missions"
    if top == "Sounds" and len(parts) > 3 and parts[1] == "voices":
        return "core" if parts[2] == "Default" else "voices/" + parts[2]
    if top == "Fonts" and parts[-1].startswith("wqy-"):
        return "fonts-cjk"
    if top == "Locale" and len(parts) == 2:
        lang = locale_of(parts[1])
        if lang and lang not in ("en", "CMakeLists"):
            return "locale/" + lang
    return "core"


def collect(data_dir):
    packs = {}
    for root, dirs, files in os.walk(data_dir):
        dirs.sort()
        for f in sorted(files):
            full = os.path.join(root, f)
            rel = os.path.relpath(full, data_dir).replace(os.sep, "/")
            packs.setdefault(pack_name(rel), []).append(rel)
    return packs


def write_pack(data_dir, files, out_dir, name):
    header = {"files": []}
    blobs = []
    for rel in files:
        with open(os.path.join(data_dir, rel), "rb") as f:
            data = f.read()
        header["files"].append({"path": rel, "size": len(data)})
        blobs.append(data)
    hjson = json.dumps(header, separators=(",", ":"), sort_keys=True).encode()
    content = MAGIC + struct.pack("<I", len(hjson)) + hjson + b"".join(blobs)
    digest = hashlib.sha256(content).hexdigest()
    fname = "%s.%s.hwpack" % (name.replace("/", "_"), digest[:16])
    with open(os.path.join(out_dir, fname), "wb") as f:
        f.write(content)
    return {"file": fname, "sha256": digest, "size": len(content), "files": len(files)}


def main():
    data_dir, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    packs = collect(data_dir)
    manifest = {"version": 1, "cjkLocales": sorted(CJK_LOCALES), "packs": {}}
    for name in sorted(packs):
        manifest["packs"][name] = write_pack(data_dir, packs[name], out_dir, name)
    with open(os.path.join(out_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1, sort_keys=True)
    core = manifest["packs"]["core"]
    total = sum(p["size"] for p in manifest["packs"].values())
    print("%d packs, %.1f MB total, core %.1f MB (%d files)"
          % (len(packs), total / 1e6, core["size"] / 1e6, core["files"]))


if __name__ == "__main__":
    main()
