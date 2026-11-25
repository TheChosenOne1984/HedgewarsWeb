#!/usr/bin/env python3
"""The engine's network protocol version must be known to the server and be
the one the web client speaks.

- CMakeLists.txt: HEDGEWARS_PROTO_VER (engine cNetProtoVersion, frontend) and
  the project version
- rust/hedgewars-server/src/utils.rs: protocol_version_string mapping
- web/src/lib/protocol/messages.ts: PROTOCOL_VERSION
"""
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[3]
cmake = (root / "CMakeLists.txt").read_text()
proto = int(re.search(r"set\(HEDGEWARS_PROTO_VER (\d+)\)", cmake).group(1))
version = ".".join(re.search(r"project\(hedgewars\s+VERSION\s+(\d+)\.(\d+)\.(\d+)", cmake, re.I).groups())

server = (root / "rust/hedgewars-server/src/utils.rs").read_text()
mapping = dict((int(n), v) for n, v in re.findall(r'(\d+)\s*=>\s*"([^"]+)"', server))

web = (root / "web/src/lib/protocol/messages.ts").read_text()
web_proto = int(re.search(r"PROTOCOL_VERSION = (\d+)", web).group(1))

errors = []
if proto not in mapping:
    errors.append("server does not know protocol %d" % proto)
elif not mapping[proto].startswith(version):
    errors.append("server maps protocol %d to %s, the project version is %s" % (proto, mapping[proto], version))
if web_proto != proto:
    errors.append("web client speaks protocol %d, the engine %d" % (web_proto, proto))
print("protocol %d, version %s, server: %s, web: %d" % (proto, version, mapping.get(proto), web_proto))
for e in errors:
    print("ERROR:", e)
sys.exit(1 if errors else 0)
