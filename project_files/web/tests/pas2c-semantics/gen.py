#!/usr/bin/env python3
"""Generate a Pascal program that exercises integer expression semantics.

The program is compiled twice: with FPC (the reference, x86_64) and through
pas2c + clang. Both must print identical output. See run.sh.

Every binary operator is evaluated for every pair of integer types and a set
of boundary values, in the contexts where FPC's native-int (Int64) evaluation
on 64-bit targets becomes observable: assignment to Int64, assignment to
LongInt, comparison, and shifting the intermediate result.
"""

import os
import random
import sys

TYPES = {
    "ShortInt": ["-128", "-1", "0", "1", "127"],
    "Byte": ["0", "1", "200", "255"],
    "SmallInt": ["-32768", "-100", "-1", "0", "3", "32767"],
    "Word": ["0", "1", "60000", "65535"],
    "LongInt": ["-2147483648", "-100000", "-1", "0", "1", "3", "1073741824", "2147483647"],
    "LongWord": ["0", "1", "3", "2147483648", "4294967295"],
    "Int64": ["-9223372036854775807", "-4294967296", "-1", "0", "5", "4294967296"],
}

BINOPS = ["+", "-", "*", "div", "mod", "and", "or", "xor"]
CMPOPS = ["<", "<=", "=", "<>", ">", ">="]
SHIFTS = ["0", "1", "4", "16", "31"]
RANDOM_EXPRS = int(os.environ.get("SEMTEST_EXPRS", "300"))


def short(t):
    return {"ShortInt": "SI", "Byte": "BY", "SmallInt": "SM", "Word": "WO",
            "LongInt": "LI", "LongWord": "LW", "Int64": "I6"}[t]


def main(out):
    p = []
    w = p.append
    w("program semtest;")
    w("{$IFDEF FPC}{$MODE OBJFPC}{$ENDIF}")
    w("const")
    for t, vals in TYPES.items():
        w(f"    c{short(t)}: array[0..{len(vals) - 1}] of {t} = ({', '.join(vals)});")
    w(f"    cSH: array[0..{len(SHIFTS) - 1}] of LongInt = ({', '.join(SHIFTS)});")
    w("var")
    for t in TYPES:
        w(f"    x{short(t)}, y{short(t)}, z{short(t)}: {t};")
    w("    i, j, k: LongInt;")
    w("    q: Int64;")
    w("    r: LongInt;")
    w("    bo: boolean;")
    w("    s, sk: shortstring;")
    w("")
    w("procedure outQ(tag: shortstring; v: Int64);")
    w("var t: shortstring;")
    w("begin")
    w("    str(v, t);")
    w("    writeLn(stdout, tag + ' ' + t)")
    w("end;")
    w("")
    w("procedure outB(tag: shortstring; v: boolean);")
    w("begin")
    w("    if v then writeLn(stdout, tag + ' T') else writeLn(stdout, tag + ' F')")
    w("end;")
    w("")

    # one procedure per (type a, type b) pair to keep functions small
    procs = []
    for ta, va in TYPES.items():
        for tb, vb in TYPES.items():
            name = f"t_{short(ta)}_{short(tb)}"
            procs.append(name)
            A, B = f"x{short(ta)}", f"y{short(tb)}"
            w(f"procedure {name};")
            w("begin")
            w(f"    for i:= 0 to {len(va) - 1} do")
            w(f"    for j:= 0 to {len(vb) - 1} do")
            w("    begin")
            w(f"        {A}:= c{short(ta)}[i];")
            w(f"        {B}:= c{short(tb)}[j];")
            w(f"        str(i * 100 + j, s);")
            w(f"        s:= '{short(ta)} {short(tb)} ' + s;")
            for op in BINOPS:
                guard = ""
                if op in ("div", "mod"):
                    guard = f"if {B} <> 0 then "
                w(f"        {guard}begin")
                w(f"            q:= {A} {op} {B}; outQ(s + ' {op} q', q);")
                w(f"            r:= {A} {op} {B}; outQ(s + ' {op} r', r);")
                w(f"            outB(s + ' {op} neg', ({A} {op} {B}) < 0);")
                w(f"            q:= ({A} {op} {B}) shr 1; outQ(s + ' {op} shr', q);")
                w(f"            q:= not ({A} {op} {B}); outQ(s + ' {op} not', q);")
                w(f"            q:= (not ({A} {op} {B})) shr 1; outQ(s + ' {op} notshr', q);")
                w("        end;")
            for op in CMPOPS:
                w(f"        outB(s + ' {op}', {A} {op} {B});")
            w("    end")
            w("end;")
            w("")

    # unary operators and shifts per type
    for t, vals in TYPES.items():
        A = f"x{short(t)}"
        name = f"u_{short(t)}"
        procs.append(name)
        w(f"procedure {name};")
        w("begin")
        w(f"    for i:= 0 to {len(vals) - 1} do")
        w("    begin")
        w(f"        {A}:= c{short(t)}[i];")
        w(f"        str(i, s);")
        w(f"        s:= '{short(t)} ' + s;")
        w(f"        q:= -{A}; outQ(s + ' neg q', q);")
        w(f"        outB(s + ' neg<0', -{A} < 0);")
        w(f"        q:= not {A}; outQ(s + ' not q', q);")
        w(f"        for k:= 0 to {len(SHIFTS) - 1} do")
        w("        begin")
        w("            str(cSH[k], sk);")
        w(f"            q:= {A} shr cSH[k]; outQ(s + ' shr q ' + sk, q);")
        w(f"            r:= {A} shr cSH[k]; outQ(s + ' shr r ' + sk, r);")
        w(f"            q:= {A} shl cSH[k]; outQ(s + ' shl q ' + sk, q);")
        w(f"            r:= {A} shl cSH[k]; outQ(s + ' shl r ' + sk, r);")
        w(f"            q:= ({A} + 1) shr cSH[k]; outQ(s + ' (+1)shr q ' + sk, q);")
        w(f"            q:= ({A} * 3) shl cSH[k]; outQ(s + ' (*3)shl q ' + sk, q);")
        w("        end;")
        w("    end")
        w("end;")
        w("")

    # random nested expressions (fixed seed): typing of intermediate results
    rnd = random.Random(int(os.environ.get("SEMTEST_SEED", "20261124")))
    names = list(TYPES)
    for n in range(RANDOM_EXPRS):
        vt = [rnd.choice(names) for _ in range(3)]
        vs = [f"x{short(vt[0])}", f"y{short(vt[1])}", f"z{short(vt[2])}"]

        def expr(depth):
            if depth == 0 or rnd.random() < 0.25:
                return rnd.choice(vs[:2])
            op = rnd.choice(["+", "-", "*", "and", "or", "xor", "shr", "shl", "div", "mod", "neg"])
            if op == "neg":
                return f"(-{expr(depth - 1)})"
            if op in ("shr", "shl"):
                return f"({expr(depth - 1)} {op} {rnd.choice(['1', '7', '31'])})"
            if op in ("div", "mod"):
                return f"({expr(depth - 1)} {op} {vs[2]})"
            return f"({expr(depth - 1)} {op} {expr(depth - 1)})"

        e = expr(3)
        name = f"r_{n}"
        procs.append(name)
        w(f"procedure {name};")
        w("begin")
        loops = [(i, vt[i]) for i in range(3)]
        for idx, (i, t) in enumerate(loops):
            w(f"    for {'ijk'[i]}:= 0 to {len(TYPES[t]) - 1} do")
        w("    begin")
        for i, t in loops:
            w(f"        {vs[i]}:= c{short(t)}[{'ijk'[i]}];")
        w(f"        if ({vs[2]} <> 0) and ({vs[2]} <> -1) then  // MinInt div -1 traps on x86")
        w("        begin")
        w(f"            str(i * 10000 + j * 100 + k, s);")
        w(f"            s:= 'R{n} ' + s;")
        w(f"            q:= {e}; outQ(s + ' q', q);")
        w(f"            outB(s + ' neg', {e} < 0);")
        w("        end")
        w("    end")
        w("end;")
        w("")

    w("begin")
    for name in procs:
        w(f"    {name};")
    w("end.")
    out.write("\n".join(p) + "\n")


if __name__ == "__main__":
    main(open(sys.argv[1], "w") if len(sys.argv) > 1 else sys.stdout)
