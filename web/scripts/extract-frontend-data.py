#!/usr/bin/env python3
"""Extract data tables of the Qt frontend for the web frontend.

Reads frontend-qt6 sources and writes src/lib/engine/frontend-data.generated.ts:
scheme field names, the predefined game schemes, the predefined weapon sets
and the team colour palette. Run from web/: python3 scripts/extract-frontend-data.py
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
QT = ROOT / "frontend-qt6"
OUT = Path(__file__).resolve().parents[1] / "src/lib/engine/frontend-data.generated.ts"


def strip_line_comments(text):
    return re.sub(r"//[^\n]*", "", text)


def qvariant_value(arg):
    arg = arg.strip()
    if arg == "":
        return None
    if arg in ("true", "false"):
        return arg == "true"
    if re.fullmatch(r"-?\d+", arg):
        return int(arg)
    # one string literal, or adjacent literals ("a" "b"), as C concatenates them
    if re.fullmatch(r'(?:"(?:[^"\\]|\\.)*"\s*)+', arg):
        return "".join(re.findall(r'"((?:[^"\\]|\\.)*)"', arg))
    raise ValueError("unexpected QVariant argument: " + arg)


def schemes():
    src = (QT / "model/gameSchemeModel.cpp").read_text()
    names = re.findall(r'QStringLiteral\("([^"]+)"\)', src[src.index("predefSchemesNames ="):src.index("numberOfDefaultSchemes")])
    fields = re.findall(r'QStringLiteral\(\s*"([^"]+)"\)', src[src.index("spNames ="):])
    fields = fields[:fields.index("scriptparam") + 1]
    code = strip_line_comments(src)
    result = []
    # the default scheme: QList<QVariant> defaultScheme = QList<QVariant>() << ... ;
    blocks = [re.search(r"defaultScheme\s*=\s*QList<QVariant>\(\)(.*?);", code, re.S).group(1)]
    for i in range(1, len(names)):
        blocks.append(re.search(r"<<\s*predefSchemesNames\[%d\](.*?);" % i, code, re.S).group(1))
    for i, block in enumerate(blocks):
        values = [qvariant_value(a) for a in re.findall(r"QVariant\(([^)]*)\)", block)]
        if i > 0:
            values = [names[i]] + values
        if len(values) != len(fields):
            raise ValueError("scheme %s has %d values, expected %d" % (names[i], len(values), len(fields)))
        result.append(values)
    return fields, result


def ammo_sets():
    weapons = (QT / "weapons.h").read_text()
    macros = {}
    for m in re.finditer(r'#define\s+(AMMOLINE_\w+)\s*\\\s*\n\s*"(\d+)"', weapons):
        macros[m.group(1)] = m.group(2)
    consts = strip_line_comments((QT / "hwconsts.cpp").read_text())
    default = "".join(macros["AMMOLINE_DEFAULT_" + p] for p in ("QT", "PROB", "DELAY", "CRATE"))
    block = consts[consts.index("cDefaultAmmos"):]
    block = block[:block.index(";")]
    sets = []
    for m in re.finditer(r'qMakePair\(QStringLiteral\("([^"]+)"\),\s*(.*?)\)\s*(?=<<|$)', block, re.S):
        name, expr = m.group(1), m.group(2)
        if "cDefaultAmmoStore" in expr:
            ammo = default
        else:
            ammo = "".join(macros[x] for x in re.findall(r"AMMOLINE_\w+", expr))
        if len(ammo) != len(default):
            raise ValueError("weapon set %s has length %d" % (name, len(ammo)))
        sets.append({"name": name, "ammo": ammo})
    return sets


def team_colors():
    src = (QT / "hwconsts.h").read_text()
    # the active definition is the last one; earlier ones are commented out
    m = list(re.finditer(r"#define\s+HW_TEAMCOLOR_ARRAY(.*?)\b0\s*\}", src, re.S))[-1]
    return [int(x, 16) & 0xFFFFFF for x in re.findall(r"0x([0-9a-fA-F]{8})", m.group(1))]


def ammo_menu():
    """Ammo types (1-based) in the order of the in-game ammo menu (HW_AMMOMENU_ARRAY)."""
    src = (QT / "hwconsts.h").read_text()
    m = re.search(r"#define\s+HW_AMMOMENU_ARRAY\s*\\?\s*\{([^}]*)\}", src, re.S)
    return [int(x) for x in re.findall(r"\d+", m.group(1).replace("\\", " "))]


def ammo_name_ids():
    """For each ammo type (TAmmoType order, 1-based), its string id number in the
    locale files: Ammoz[type].NameId (hedgewars/uVariables.pas), numbered by the
    TAmmoStrId enumeration (hedgewars/uTypes.pas)."""
    eng = ROOT / "hedgewars"
    types = (eng / "uTypes.pas").read_text()
    sids = re.search(r"TAmmoStrId\s*=\s*\((.*?)\);", types, re.S).group(1)
    sid_index = {name.strip(): i for i, name in enumerate(re.sub(r"//[^\n]*", "", sids).split(","))}
    variables = (eng / "uVariables.pas").read_text()
    ammoz = variables[variables.index("Ammoz:"):]
    name_ids = re.findall(r"NameId:\s*(sid\w+)", ammoz)
    # entry 0 is amNothing (sidNothing); the ammo types follow in TAmmoType order
    return [sid_index[n] for n in name_ids[1:]]


def weapon_names(lang):
    """Weapon names by ammo type - 1, from the engine's locale file (00:NN=name)."""
    strings = {}
    for line in (ROOT / "share/hedgewars/Data/Locale" / (lang + ".txt")).read_text().splitlines():
        m = re.match(r"00:(\d+)=(.*)", line)
        if m:
            strings[int(m.group(1))] = m.group(2).strip()
    return [strings.get(i, "") for i in ammo_name_ids()]


def main():
    fields, scheme_list = schemes()
    out = [
        "// Generated by scripts/extract-frontend-data.py from frontend-qt6; do not edit.",
        "",
        "/** names of the game scheme fields, in protocol order (0 is the name) */",
        "export const SCHEME_FIELDS = %s as const;" % json.dumps(fields),
        "",
        "export type SchemeValue = string | number | boolean | null;",
        "",
        "/** predefined game schemes (frontend-qt6/model/gameSchemeModel.cpp) */",
        "export const DEFAULT_SCHEMES: SchemeValue[][] = %s;" % json.dumps(scheme_list, indent=2),
        "",
        "/** predefined weapon sets (frontend-qt6/hwconsts.cpp, weapons.h) */",
        "export const DEFAULT_AMMO_SETS: { name: string; ammo: string }[] = %s;"
        % json.dumps(ammo_sets(), indent=2),
        "",
        "/** ammo types (1-based) as the in-game ammo menu orders them, in columns of"
        " AMMO_MENU_ROWS (frontend-qt6/hwconsts.h HW_AMMOMENU_ARRAY) */",
        "export const AMMO_MENU: number[] = %s;" % json.dumps(ammo_menu()),
        "export const AMMO_MENU_ROWS = 6;",
        "",
        "/** weapon names by ammo type - 1 (Data/Locale/<lang>.txt, 00:NN) */",
        "export const WEAPON_NAMES: Record<'en' | 'de', string[]> = %s;"
        % json.dumps({"en": weapon_names("en"), "de": weapon_names("de")}),
        "",
        "/** team colours by colour index (frontend-qt6/hwconsts.h HW_TEAMCOLOR_ARRAY) */",
        "export const TEAM_COLORS: number[] = %s;" % json.dumps(team_colors()),
        "",
    ]
    OUT.write_text("\n".join(out))
    print("wrote", OUT)


if __name__ == "__main__":
    sys.exit(main())
