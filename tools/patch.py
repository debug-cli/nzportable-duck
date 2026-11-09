#!/usr/bin/env python3
"""Patch nzportable64.exe (nosdl) to take the DTLS client role. Same logic as patcher.js.
Usage: python3 tools/patch.py nzportable64.exe [output.exe]"""
import hashlib, sys
OLD, NEW = b"a=setup:actpass\n\0", b"a=setup:active\n\0\0"
KNOWN = {"798aa4964fed84d8f5f5c91c4e276fc91e2d81b5d9c6a109bbb5f6a3ea8c03e2":
         "588be0325c14d679282aec3c080f5832e29e217a78d6bb78c1e5e4de0088ccfc"}
src = sys.argv[1]; dst = sys.argv[2] if len(sys.argv) > 2 else "nzportable64-dtlsclient.exe"
d = open(src, "rb").read()
h = hashlib.sha256(d).hexdigest()
if d[:2] != b"MZ": sys.exit("not a Windows exe")
if b"CryptGenRandom" not in d: sys.exit("SDL build: use nzportable64.exe from pc-nzp-win64-nosdl.zip")
if d.count(OLD) != 1: sys.exit("already patched" if d.count(NEW) == 1 else "pattern not found")
i = d.find(OLD); o = d[:i] + NEW + d[i + len(NEW):]
oh = hashlib.sha256(o).hexdigest()
if h in KNOWN and KNOWN[h] != oh: sys.exit("output hash mismatch, not saving")
open(dst, "wb").write(o)
print(f"patched at 0x{i:x} -> {dst}\n{'verified' if h in KNOWN else 'unknown build, patched by pattern'}: {oh}")
