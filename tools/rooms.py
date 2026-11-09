#!/usr/bin/env python3
"""Snapshot the NZ:P web room list from the frag-net master server.
Writes status/rooms.json and status/ROOMS.md. Used by .github/workflows/rooms.yml."""
import json, os, subprocess, sys, urllib.request
from datetime import datetime, timezone
MASTER = "http://master.frag-net.com:27950/raw/"
GAMES = ["NZP-REBOOT-WEB", "NZP-REBOOT"]

def fetch(game):
    try:
        req = urllib.request.Request(MASTER + game, headers={"User-Agent": "nzportable-duck"})
        with urllib.request.urlopen(req, timeout=20) as r:
            text = r.read().decode("utf-8", "replace")
    except Exception:  # some proxies mangle urllib; curl is a fine fallback
        text = subprocess.run(["curl", "-fsS", "-m", "20", MASTER + game],
                              check=True, capture_output=True, text=True).stdout
    rooms = []
    for line in text.splitlines():
        if not line or line.startswith("#") or " " not in line:
            continue
        addr, info = line.split(" ", 1)
        parts = info.strip("\\").split("\\")
        kv = dict(zip(parts[0::2], parts[1::2]))
        rooms.append({
            "address": addr,
            "host": kv.get("hostname", ""),
            "map": kv.get("mapname", ""),
            "players": int(kv.get("clients", 0) or 0),
            "max": int(kv.get("maxclients", 0) or 0),
            "locked": kv.get("needpass", "0") not in ("0", ""),
        })
    return rooms

def main():
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    out = {"updated": now, "source": MASTER, "games": {}}
    for g in GAMES:
        try:
            out["games"][g] = fetch(g)
        except Exception as e:  # keep going; record the failure
            out["games"][g] = {"error": str(e)}
    os.makedirs("status", exist_ok=True)
    with open("status/rooms.json", "w") as f:
        json.dump(out, f, indent=1)
    web = out["games"].get("NZP-REBOOT-WEB")
    lines = ["# Live rooms", "", f"Snapshot: {now}. Room numbers change fast, so refresh in game.", ""]
    if isinstance(web, list):
        open_rooms = [r for r in web if not r["locked"]]
        players = sum(r["players"] for r in web)
        lines += [f"**Web rooms:** {len(web)} ({len(open_rooms)} unlocked), **players:** {players}", "",
                  "| Room | Host | Map | Players | Locked |", "|---|---|---|---|---|"]
        for r in sorted(web, key=lambda r: (-r["players"], r["address"])):
            host = r["host"].replace("|", "/") or "-"
            lines.append(f"| `{r['address']}` | {host} | {r['map']} | {r['players']}/{r['max']} | {'yes' if r['locked'] else 'no'} |")
    else:
        lines.append(f"Master server unreachable: {web}")
    with open("status/ROOMS.md", "w") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines[:5]))

if __name__ == "__main__":
    sys.exit(main())
