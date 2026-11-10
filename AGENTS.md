# nzportable-duck, engineering handbook

> **Rule zero. The game and its assets must not change.**
>
> Do not edit, rebuild, recompress, re-export, or replace anything in `game.pk3`, `progs.pk3`, maps, models, sounds, textures, QuakeC (`progs.dat`, `csprogs.dat`), or the engine's game logic. Players in this repo must stay byte-compatible with browser players on duckmath.org. Any change to game data or game code breaks joining with `Map model file does not match` and splits the player base. The only engine change allowed is the 5-byte DTLS role patch described in §5. Config files (`default.fmf`, `nzp/autoexec.cfg`) and `identity.pfx` are allowed because they change networking, not the game.

This is the deep reference for **anyone changing this repository**: contributors, maintainers, and AI coding agents. It assumes you can read C, JavaScript, Python, and Git. If you are looking for "what is this project and why should I use it", that lives in [`README.md`](README.md).

Nothing here is aspirational. Every claim was checked against the files at the commit that added this line, the upstream source at commit `f68a2b547d2dc4bf6886b922baa1bff487cc5038`, the official binaries, or a user log. Dates are `YYYY-MM-DD`. Facts that changed over time are dated. Facts that could not be verified are marked UNVERIFIED or INFERRED. The commands that reproduce the counts and hashes are in §19.

Repo: `debug-cli/nzportable-duck`. No website or GitHub Pages site exists, and none is wanted. Do not add one.

## 0. How to use this document

| If you are… | Read |
| --- | --- |
| Opening the repo for the first time | Rule zero, §1 mental model, §2 map |
| Touching the patch | §5 the patch, §10 tooling, §16 playbook for a new nzp-team build |
| Touching config files | §6 config reference |
| Chasing a join failure | §13 debugging cookbook, §14 traps |
| Working with game data | §7 data compatibility |
| Touching the certificate | §8 certificate |
| Cutting a release or editing CI | §11 CI and release, §16 playbook for a release |
| Contributing | §15 contribution rules, §17 review checklist |
| Auditing this document | §19 verifying this document |

Hard rules that no section overrides. If you remember five things:

1. Rule zero. No engine change beyond the 5-byte DTLS role patch.
2. No `.exe`, `.pk3`, `.bsp`, `.dll`, or `.zip` in git. No real private key, ever. `identity.pfx` is a public throwaway.
3. `patcher.js` and `tools/patch.py` stay in step, byte-identical output. Change both in one commit. Patch by pattern, verify by hash, refuse on 0 or 2+ matches, never save a failing output. Never target the SDL exe.
4. README.md stays a plain user guide: no command-line steps. Users are on locked school PCs.
5. Any change that could affect compatibility with browser players needs a real join test against a duckmath.org room, with the joinlog line quoted in the PR.

---

## 1. Mental model

A NZ:P browser room is a game hosted by a **browser tab** (duckmath.org or nzp.gay) through the FTEQW web build. A NZ:P native client is the normal Windows game. This repository makes the native client join the browser rooms. There is no server component in this repository.

```
┌──────────────────── browser player (duckmath.org / nzp.gay, Chrome WebRTC) ───────────────────┐
│  FTE web build (ftewebgl.js + ftewebgl.wasm) hosts the room                                   │
│   │  registers on the master server under the protocol NZP-REBOOT-WEB                          │
└───┼────────────────────────────────────────────────────────────────────────────────────────────┘
    │ heartbeat and query
    ▼
master.frag-net.com:27950
   /raw/NZP-REBOOT-WEB     (web rooms)
   /raw/NZP-REBOOT         (desktop servers)
    ▲
    │ 1. list (protocolname in default.fmf)
┌───┴──────────── native Windows client (this repo's setup) ───────────────────────────────────┐
│  nzportable64-dtlsclient.exe   (official nzp-team exe + the 5-byte patch, §5)                 │
│                                                                                               │
│   2. signal   broker swaps SDP offer and answer (offer says a=setup:active after the patch)   │
│   3. ICE      UDP path between the peers (host candidate on a LAN, srflx across NAT)          │
│   4. DTLS     SChannel InitializeSecurityContext, the client role (§5)                        │
│   5. SCTP     data channel "quake", verify tag from CryptGenRandom (nosdl exe only, §5)       │
│   6. game     NZ:P connect, then map and csprogs checksum check (§7)                          │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

Each stage had its own bug. The fixes in this repo map one to one onto the stages.

| Stage | What happens | What breaks it | Fix in this repo |
| --- | --- | --- | --- |
| 1. List | The server browser queries the master server for `NZP-REBOOT-WEB` | The stock fmf asks only for `NZP-REBOOT` | `protocolname "NZP-REBOOT-WEB NZP-REBOOT"` in `default.fmf` (§6) |
| 2. Signal | The broker swaps SDP offer and answer | WebRTC is off | `net_ice_usewebrtc 1` in `autoexec.cfg` (§6) |
| 3. ICE | A UDP path is found between the peers | The network blocks UDP | None. Network issue. No TURN relay is known for these rooms |
| 4. DTLS | TLS over UDP encrypts the link | SChannel fails as the DTLS server (`SEC_E_ALGORITHM_MISMATCH`) | The 5-byte patch (§5) |
| 5. SCTP | The data channel `quake` carries the game | The SDL exe sends verify tag 0 (`INIT malformed`) | Use the nosdl exe only (§5) |
| 6. Game | NZ:P connect, then the asset and checksum check | The client's data differs from the host's | Use the host's `game.pk3` and `progs.pk3` (§7) |

Consequences you must internalise:

- **The native client only joins.** Hosting a room that browser players can reach is out of scope for this repo. The desktop server registers as `NZP-REBOOT`, and whether browser players can reach a desktop-hosted room is UNVERIFIED.
- **Networking is all this repo changes.** Config, one patched exe, one certificate. The game itself is untouched (rule zero).
- **The Windows constraint shapes every design decision.** Users are students on locked school PCs. No PowerShell, no CMD, no WSL, no MSYS2, no VMs, no Linux, no admin rights. Every user-facing step must work with File Explorer, a browser download, and the in-game console.
- **Verification is by bytes and hashes, not by running things.** You cannot run the Windows exe on Linux, and the school PC is not a development machine. CI re-derives the patched exe from the official download and checks hashes. You should do the same (§10, §19).
- **Rooms are ephemeral.** Listings are stale within minutes and this repo ships no room snapshot. Use the in-game server browser.

---

## 2. Repository map

Tracked tree (2026-11-10): **26 files, 133,818 B, 2,138 lines.** `.gitignore` blocks `*.exe`, `*.pk3`, `*.zip`, and `joinlog*.txt`. The `.git` directory is excluded from these counts.

```
.
├── README.md                       10,117 B   user guide (plain language)        editable
├── AGENTS.md                       this file  engineering handbook (this document) editable
├── TECHNICAL.md                     4,062 B   root causes with source references  editable, keep factual
├── SOURCE.md                        1,154 B   GPL source pointer + patch diff    only if the patch changes
├── UPSTREAM_ISSUE.md                1,466 B   draft issue for nzp-team/fteqw     editable
├── SECURITY.md                        595 B   certificate policy                 editable
├── CHANGELOG.md                       676 B   one entry per release              editable, every release
├── LICENSE                          35,149 B  GPL-3.0                            frozen (§12)
├── .gitignore                          45 B                                     editable
├── .gitattributes                     125 B   CRLF enforcement                   rarely, keep the CRLF rules
├── patcher.js                       3,183 B   patch logic, Node + browser, ES5   carefully (§10)
├── tools/
│   └── patch.py                     1,111 B   same patch in Python, byte-identical output required
├── tests/
│   └── test-patch.js                1,475 B   patch test against the real builds  editable
├── config/
│   ├── default.fmf                    143 B   server browser protocol tokens    rarely, CRLF
│   ├── identity.pfx                 2,666 B   public throwaway RSA cert          FROZEN (§8)
│   └── nzp/
│       └── autoexec.cfg                  40 B   DTLS + WebRTC cvars              rarely, CRLF
├── release/                                          text files shipped in the release zip, CRLF
│   ├── README.txt                     539 B                                        yes
│   ├── NZP-Duck/nzp/GET-GAME-FILES.txt   364 B                                    yes
│   └── NZP-Web/nzp/GET-GAME-FILES.txt    191 B                                    yes
├── assets/
│   └── title.svg                    2,206 B   SMIL title, hand-written           yes
└── .github/
    ├── workflows/
    │   ├── verify.yml                 933 B   downloads official builds, runs both patchers
    │   └── release.yml              1,640 B   builds and attaches the release zip on publish
    ├── ISSUE_TEMPLATE/
    │   ├── join-problem.yml         1,070 B
    │   ├── new-build.yml              359 B
    │   └── config.yml                206 B
    └── dependabot.yml                113 B
```

Editability legend:

| Label | Meaning |
| --- | --- |
| editable | Change it as needed. Keep the style rules in this file |
| carefully | Change it only with its counterpart in the same commit, and run the tests (§10) |
| rarely | Networking lines only. Keep CRLF. See §6 |
| FROZEN | Never edit. `identity.pfx` is a shared public cert |
| frozen (§12) | `LICENSE` stays GPL-3.0 |

Not in git, by design: `.exe`, `.pk3`, `.bsp`, `.dll`, `.zip` files, `joinlog*.txt`, and any real private key. `.gitignore` blocks them. Check `git status` before every commit anyway (§15).

---

## 3. What Duckmath runs

This section documents the browser client that hosts Duckmath co-op rooms, as read directly on 2026-11-09. The page was read through a text-only fetcher. Binary files cannot be read that way, so sizes and hashes for binaries come from the downloads recorded in the project logs, and they are dated.

### 3.1 The page

The known mirror of the Duckmath game page is:

```
https://classroomlesson.github.io/basic-ruffle-player/html/cod_zombies_portable/index.html
```

As served on 2026-11-09, the page is titled `NZ: Portable` and shows almost nothing: the text `nzp/game.pk3`, a `Drop Zone` element, a `Click To Begin!` call to action, and a hit counter image (`hits.svg`). No engine file names appear in the visible text. The click-to-begin overlay is INFERRED to be the browser requirement to start audio and pointer capture. The HTML source was not readable through the text fetcher, so the overlay markup is UNVERIFIED.

Duckmath's own host, duckmath.org, was not read from this sandbox (outbound network is restricted, see §19). It is UNVERIFIED whether duckmath.org serves byte-identical files to this mirror. The mirror is treated as the reference copy because it is the only Duckmath page read so far. Do not copy any of this into the repo. Link to it instead.

### 3.2 The engine

The mirror serves the FTEQW web build. Two files were confirmed present on 2026-11-09:

| File | URL | What it is |
| --- | --- | --- |
| `ftewebgl.js` | `https://classroomlesson.github.io/basic-ruffle-player/html/cod_zombies_portable/ftewebgl.js` | Emscripten glue for the FTE web build. Contains the `Module["loadcachedfiles"]` preRun hook, a CacheStorage lookup of a cache named `user` for files whose URL contains `/_/`, and the `Module["manifest"]` default: the page URL with `.fmf` appended, or `index.fmf` for a trailing-slash URL, overridable with a `#` fragment |
| `ftewebgl.wasm` | `https://classroomlesson.github.io/basic-ruffle-player/html/cod_zombies_portable/ftewebgl.wasm` | The compiled engine. Binary. The text fetcher rejects it with HTTP 500, which is consistent with a binary file and does not prove its contents |

The same `ftewebgl.js` / `ftewebgl.wasm` pair ships in the upstream `nzp-team/nzp-team.github.io` repository that serves nzp.gay (per public listings fetched 2026-11-09, third-party source, INFERRED that the Duckmath mirror copies it). No Duckmath-specific engine patch was found or should be assumed.

### 3.3 The manifest

The mirror's `default.fmf`, fetched verbatim on 2026-11-09:

```
game nzp
name "Nazi Zombies Portable"
basegame nzp
mainconfig "nzportable.cfg"
disablehomedir 1
```

That is the stock manifest. **No `protocolname` line. No master server override. Nothing Duckmath-specific.** The browser still lists web rooms as `NZP-REBOOT-WEB`, so the protocol name must come from somewhere else. The mechanism is UNVERIFIED. INFERRED: it is compiled into the web build or supplied by the page at launch. The web hosts' server browser shows `NZP-REBOOT-WEB` rooms (§9), and the native client needs the `protocolname` line in its own fmf because its built-in default is `NZP-REBOOT` only (TECHNICAL.md, Problem 1).

### 3.4 The data

| File | URL | Size | SHA-256 | Notes |
| --- | --- | --- | --- | --- |
| `game.pk3` | `https://pub-2d868f15a1824cc8a2ec51069ed41c6f.r2.dev/nzp_game.pk3` | 71,785,249 B | `251f7215db782bdda0fc0b92c9d39c20653b7c88f370e070f08268078ce4de47` | Duckmath's copy, not an nzp-team file. Last-Modified 2025-09-15. Renamed to `game.pk3` on save. Hash verified 2026-11-07 |
| `progs.pk3` | (Duckmath game page, exact URL UNVERIFIED) | 458,237 B | `42057fc13022deade48e3a6e54d1b0582c8941c868d08d3029081a1bd0edfb3b` | Told apart from the nzp.gay copy by this hash. See below |

Where the page fetches `progs.pk3` is UNVERIFIED. The direct URL `https://classroomlesson.github.io/basic-ruffle-player/html/cod_zombies_portable/nzp/progs.pk3` returned the site's 404 page on 2026-11-09 (re-checked during this rewrite). The README says "from Duckmath's game page", which stays accurate as a direction but not as a URL. The R2 `game.pk3` URL is a binary file. The text fetcher cannot confirm it either (HTTP 500, like every binary probe on 2026-11-09). Treat "Duckmath still serves these exact bytes" as UNVERIFIED and re-check after any Duckmath update.

The page text references `nzp/game.pk3` relative to the page. How `progs.pk3` is wired up inside the page is UNVERIFIED. Both pk3s must be treated as Duckmath's files, not nzp-team's (rule zero still applies: no mirroring, no re-hosting, no copies in this repo or in the release zip).

### 3.5 The broker and the master settings

Not visible in any file read on 2026-11-09. The facts on record:

- Web rooms register on `master.frag-net.com:27950` under `NZP-REBOOT-WEB` (§9, verified 2026-11-06).
- The broker that swaps the WebRTC offer and answer was not read. Which host runs it for Duckmath is UNVERIFIED. Do not name one in docs without reading it first.
- No TURN relay is known for these rooms (§9).

### 3.6 Rules for working with Duckmath

- Link to Duckmath. Do not vendor, mirror, or re-host its code, data, or pages.
- Never put Duckmath's `game.pk3` or `progs.pk3` in this repo, in a release, or in any build artifact.
- Date every Duckmath-derived fact (`2026-11-09`), because Duckmath can update its files at any time (§7).
- If you re-read the mirror, update §3 and date it. If the mirror is gone, say so in §18.

---

## 4. How the Windows client got Duckmath co-op access

The full investigation, in order, with dates. All times are PST (UTC-08:00) unless marked UTC. `joinlogN.txt` is a console capture made with `net_ice_debug 2` then `condump joinlog` (§13). Every step here was performed on a locked school PC or a home PC, or inside the sandbox used for the research. The outcome is §5 (the patch) and §7 (the two data folders).

### 2026-11-06 (Friday), first attempt

1. **Research.** No special Duckmath desktop build exists. The official legacy release (`nzp-team/fteqw` tag `legacy`, pre-release, `nzportable-win64.zip` about 108 MB) supports co-op. The GitHub "Latest" release is the Vril nightly, and co-op is disabled in it. Do not use it.
2. **Fix, stage 1 (listing).** The stock fmf has `protocolname "NZP-REBOOT"` only. Setting `com_protocolname` after startup does not work. Fix: `protocolname "NZP-REBOOT-WEB NZP-REBOOT"` in `default.fmf`. The server browser uses the first token, the master query uses every token.
3. **Fix, stages 2 to 5 (WebRTC).** `nzp/autoexec.cfg` with `net_enable_dtls 1` and `net_ice_usewebrtc 1`. Setting `net_ice_usewebrtc ""` hangs, because there is no SCTP.
4. **joinlog (home network).** Rooms listed. Joins failed with `AcceptSecurityContext failed: SEC_E_ALGORITHM_MISMATCH`. The Windows exe uses SChannel for DTLS only, because no GnuTLS or OpenSSL plugin is built.
5. **First theory (INFERRED, later shown not to be the full cause).** FTE's auto RSA cert uses a legacy CAPI key (`PROV_RSA_SCHANNEL`) that cannot sign ECDHE.
6. **ECDSA certificate failed (joinlog2).** FTE calls `CryptAcquireCertificatePrivateKey` with flags 0, which rejects CNG keys. FTE then silently overwrote `identity.pfx` with a new auto cert.
7. **An RSA 2048 pfx tagged for "Microsoft Enhanced RSA and AES Cryptographic Provider" (empty password, 3DES) loaded fine** ("Loaded Certificate"). This is the `identity.pfx` the repo ships (§8). It did not fix the mismatch by itself.
8. **School network test (joinlog3).** Every room (295, 306, 318, 307, 261) stalled at ICE. Remote peers offered only mDNS host and srflx candidates. The broker sent no TURN relays. A password prompt in one room was a locked room, not a bug. INFERRED: the school network blocks direct peer paths to off-LAN hosts.

### 2026-11-07 (Saturday), root cause found in the sandbox

9. **Home test, kicked to the menu.** The user tested from home and the join bounced back to the menu with no in-game message.
10. **The SDL random bug.** The legacy Windows exe is the SDL build (`nzportable-sdl64.exe`). In `engine/client/sys_sdl.c`, `Sys_RandomBytes` reads `/dev/urandom` only under Linux or BSD. The `_WIN32` path returns `false` (source verified, lines 61 to 78). The exe imports no `CryptGenRandom`. The SCTP verify tag stays 0, and Chrome's dcsctp (`dcsctp_socket.cc`, `HandleInit`) aborts with `INIT malformed`.
11. **The data bug.** The legacy zip's loose `nzp/maps/*.bsp` files do not match web hosts. That gives `Map model file does not match`. The official web data (game.pk3 plus progs.pk3 from nzp.gay) matched the nzp.gay-hosted room.
12. **Proof from Linux (sandbox).** A Linux arm64 legacy build, with the fmf and autoexec changes and only the two nzp.gay pk3s, joined `rtc:///42` ("Unknown Soldier has joined the game") through GnuTLS DTLS from behind NAT. This proved the config and the data path.
13. **Dead end: Linux at school.** A WSL setup script was delivered. The user then reported that WSL, PowerShell, CMD, MSYS2, and VMs are all blocked on the school network. There is no Linux route for the user.
14. **The nosdl build.** The `bleeding-edge` release has `pc-nzp-win64-nosdl.zip`, built from the same source and date (2025-09-24). It is non-SDL (`sys_win.c`, which does use `CryptGenRandom`, verified at line 352), so the SCTP tag bug is gone. The SDL exe is byte-identical in the legacy and bleeding-edge releases.
15. **"Do I extract the pk3s?" No.** `.pk3` files go into `nzp\` as they are. A browser that saves one as `.zip` needs a rename back (§14).
16. **joinlog5 (home, nosdl exe).** Six rooms passed ICE, and every one failed with `SEC_E_ALGORITHM_MISMATCH`. All hosts sent Chrome SDP.
17. **The real DTLS cause (SChannel).** FTE's offer says `a=setup:actpass`. Chrome answers `a=setup:active`, so FTE becomes the DTLS server (`dtlspassive = true`). On Windows, DTLS goes through SChannel (`engine/common/net_ssl_winsspi.c`), and FTE's own `engine/common/bothdefs.h` says `FIXME: HAVE_WINSSPI does not work as a server.` (line 408, verified). No cvar picks the DTLS role. The Windows GnuTLS loader only looks for `.so` names, so dropping in a DLL does not work.
18. **Proposed fix.** Fork `nzp-team/fteqw` at tag `legacy` (`f68a2b54`), change the offer to `a=setup:active`, and build `win64-nosdl` with the repo's Actions.

### 2026-11-09 (Monday), the fix works

19. **The fork was not possible.** The Hark GitHub App was not installed on `debug-cli`, and the connector has no fork endpoint.
20. **The binary patch.** The official nosdl exe was patched in place. `a=setup:actpass\n\0` at `0x4eb388` became `a=setup:active\n\0\0`. Five bytes differ. FTE now offers `active`, Chrome answers `passive`, and FTE runs SChannel `InitializeSecurityContext` as the DTLS client, which works.
21. **joinlog6 (school PC, Intel UHD 630).** A friend hosted a room from the Duckmath browser client on the same school LAN (host candidate `10.3.40.107`). Result: `Connected to /1706 (encrypted)`. Then the server kicked the client: `Map model file does not match (maps/4all.bsp)`.
22. **The data cause.** The host expected an FTE BSP lump checksum of `0xC1BDD9E5` for `maps/4all.bsp`. Duckmath's `game.pk3` gives `0xC1BDD9E5`. nzp.gay's `game.pk3` gives `0xE51410F0`. Duckmath ships different data than nzp.gay.
23. **The two-folder fix.** `NZP-Duck` holds Duckmath's two pk3s for Duckmath-hosted rooms. `NZP-Web` holds nzp.gay's two pk3s for nzp.gay-hosted rooms. Each folder has the patched exe, `default.fmf`, `identity.pfx`, and `nzp/autoexec.cfg`. Delete `dlcache` when swapping data.
24. **10:03 PST: "IT WORKED!"** The user joined and played in the friend's Duckmath room from native Windows.
25. **The repo was published** as `debug-cli/nzportable-duck`. Main history: `367df17` (owner's initial commit), `6bd1889` (patcher, config, docs, CI, rooms snapshot), `ff82d59` (removed the patcher web page and `pages.yml`, the owner wants no site), `9608e9f` (owner's 16 badges, first AGENTS.md rewrite), `d28a3fa` (two-color animated SMIL title).

### Dead ends (do not retry)

| Tried | Why it failed |
| --- | --- |
| Vril nightly / GitHub "Latest" | Co-op disabled |
| Stock legacy server browser | Queries `NZP-REBOOT` only |
| `com_protocolname` typed after startup | Too late. Must be in `default.fmf` |
| Plain ICE, `net_ice_usewebrtc ""` | Hangs. No SCTP |
| ECDSA `identity.pfx` | CNG key rejected, FTE overwrites the file |
| RSA CAPI pfx alone | Loads, but the DTLS server role still fails |
| Loose legacy `nzp/maps/*.bsp` | Map checksum mismatch |
| Windows SDL exe | No RNG, SCTP tag 0, Chrome `INIT malformed` |
| nzp.gay data in Duckmath rooms | `4all.bsp` checksum mismatch |
| WSL, PowerShell, CMD, MSYS2, VMs, Linux | Blocked on the school network |
| GnuTLS DLL drop-in on Windows | The loader only looks for `.so` names |
| Fork and rebuild through the Hark connector | No App install at the time, no fork endpoint |
| Local FTE build | No Windows toolchain in the sandbox |
| `readme-typing-svg` title | One color only. Replaced by `assets/title.svg` |

---

## 5. The patch

One string in the official nosdl exe. Five bytes differ. Nothing else changes.

| Field | Value |
| --- | --- |
| Input | `nzportable64.exe` from `pc-nzp-win64-nosdl.zip` (bleeding-edge, 2025-09-24) |
| Input size | 7,736,233 B |
| Input SHA-256 | `798aa4964fed84d8f5f5c91c4e276fc91e2d81b5d9c6a109bbb5f6a3ea8c03e2` |
| Offset | `0x4eb388` |
| Old bytes | `a=setup:actpass\n\0` |
| New bytes | `a=setup:active\n\0\0` |
| Bytes in place | 17 (same length) |
| Bytes that differ | 5, from `0x4eb393` to `0x4eb397` |
| Output | `nzportable64-dtlsclient.exe`, same size |
| Output SHA-256 | `588be0325c14d679282aec3c080f5832e29e217a78d6bb78c1e5e4de0088ccfc` |

### The bytes

```
                 0    1    2    3    4    5    6    7    8    9   10   11   12   13   14   15   16
input :  61 3D 73 65 74 75 70 3A 61 63 74 70 61 73 73 0A 00
output:  61 3D 73 65 74 75 70 3A 61 63 74 69 76 65 0A 00 00
         a  =  s  e  t  u  p  :  a  c  t  p  a  s  s  \n \0
         a  =  s  e  t  u  p  :  a  c  t  i  v  e  \n \0 \0
```

Differ at index 11 to 15 (`0x4eb393` to `0x4eb397`): `70 61 73 73 0A` became `69 76 65 0A 00`. Index 16 stays `00`. The string is appended with `Q_strncatz`, which stops at the first NUL, so the extra trailing NUL is harmless.

### Why it works

Upstream `engine/common/net_ice.c` (tag `legacy`, commit `f68a2b54`) offers the DTLS role in the SDP offer:

```c
		else if (!strcmp(prop, "sdpoffer"))
			Q_strncatz(value, va("a=setup:actpass\n"), valuelen);	//don't care if we're active or passive
```

Chrome answers `active`. The answer parser in the same file is inverted on purpose:

```c
	else if (!strncmp(value, "a=setup:", 8))
	{	//this is their state, so we want the opposite.
		if (!strncmp(value+8, "passive", 7))
			con->dtlspassive = false;
		else if (!strncmp(value+8, "active", 6))
			con->dtlspassive = true;
	}
```

`dtlspassive` is `true` for the DTLS server and `false` for the DTLS client (`net_ice.c` line 213). So the unpatched offer makes Chrome answer `active`, which sets `dtlspassive = true`, which makes FTE the DTLS server. On Windows the DTLS provider is SChannel (`engine/common/net_ssl_winsspi.c`), and `engine/common/bothdefs.h` (line 408) says:

```
	//FIXME: HAVE_WINSSPI does not work as a server.
```

Against current Chrome hosts, `AcceptSecurityContext` fails with `SEC_E_ALGORITHM_MISMATCH`. Some older hosts passed, which suggests a difference in the hosts' Chrome versions. That part is INFERRED, not proven.

The patch makes FTE offer `active`. Chrome answers `passive`, which sets `dtlspassive = false`, which makes FTE the DTLS **client**. SChannel runs `InitializeSecurityContext`, presents `identity.pfx` as the client certificate, and the handshake completes. Verified 2026-11-09 with joinlog6 and a real room (§4).

There is no cvar to pick the DTLS role, and the Windows GnuTLS loader only looks for `.so` names, so a DLL drop-in does not work. The 5-byte patch is the smallest change that works.

### The equivalent source diff

```diff
--- a/engine/common/net_ice.c
+++ b/engine/common/net_ice.c
@@
 			else if (!strcmp(prop, "sdpoffer"))
-				Q_strncatz(value, va("a=setup:actpass\n"), valuelen);	//don't care if we're active or passive
+				Q_strncatz(value, va("a=setup:active\n"), valuelen);	//be the DTLS client: SChannel can't serve DTLS
```

Building that commit with this diff produces the same behavior. The binary in releases is the byte patch described above, and `patcher.js` and `tools/patch.py` reproduce it (§10). `SOURCE.md` carries this diff and the source pointer. Keep it in sync if the patch ever changes (§12).

### What the patch does not do

- It does not touch the SDL exe. The SDL exe also contains the same `actpass` string, so pattern search alone would patch it. The patcher rejects any build without a `CryptGenRandom` import (§10).
- It does not change any other byte. Input and output are the same size.
- It does not fix the SDL random bug, the data mismatch, or the listing problem. Those are §4 steps 10, 22, and 2.

---

## 6. Config reference

The release ships exactly two config files, to the same relative paths in both folders. Both files are CRLF and must stay CRLF. `.gitattributes` enforces `*.fmf`, `*.cfg` text eol=crlf. `.gitignore` does not cover them.

### `config/default.fmf` (143 B, 6 lines, CRLF)

```
game nzp
name "Nazi Zombies Portable"
basegame nzp
mainconfig "nzportable.cfg"
disablehomedir 1
protocolname "NZP-REBOOT-WEB NZP-REBOOT"
```

| Line | What it does |
| --- | --- |
| `game nzp` | The game directory name passed to the engine |
| `name "Nazi Zombies Portable"` | The display name of the game |
| `basegame nzp` | The base game directory the engine mounts |
| `mainconfig "nzportable.cfg"` | The cfg file executed at startup |
| `disablehomedir 1` | Do not use the user's home directory for data. Portable mode. This is what keeps the install self-contained next to the exe |
| `protocolname "NZP-REBOOT-WEB NZP-REBOOT"` | Space-separated protocol tokens. The fmf value overrides the built-in name (`fs.c`). The server browser uses the **first** token, the dpmaster query uses **every** token. `NZP-REBOOT-WEB` first so web rooms show up. `NZP-REBOOT` kept so desktop servers still list. Setting `com_protocolname` after startup does nothing |

The web build's own fmf (both the Duckmath mirror and nzp.gay, read 2026-11-09, §3.3) has only the first five lines. The `protocolname` line is this repo's delta.

### `config/nzp/autoexec.cfg` (40 B, 2 lines, CRLF)

```
net_enable_dtls 1
net_ice_usewebrtc 1
```

| Line | What it does |
| --- | --- |
| `net_enable_dtls 1` | Enables the DTLS path. WebRTC links are encrypted with DTLS. Without it, no web room handshake happens at all |
| `net_ice_usewebrtc 1` | Uses the WebRTC ABI: ICE with ufrag/pwd, SDP offer and answer, and the SCTP data channel `quake`. Setting it to `""` hangs, because there is no SCTP |

### What is deliberately absent

- No master server address. The built-in master is used (`master.frag-net.com:27950`, §9).
- No TURN or STUN server. None is known for these rooms. Do not add one you cannot verify (§18).
- No protocol set after startup. It does not work (§4, step 2).
- Nothing about maps, models, or data. The game files come from the host, not from config (§7).

### Editing rules

- Only the networking lines may change (`protocolname`, the two cvars). Anything else in these files is out of scope.
- Keep CRLF. If your editor strips it, the Windows client may not parse the file the same way. `.gitattributes` will warn on commit.
- After a config change, run the verification commands in §10 and §19. There is no unit test for config content, so review matters.

---

## 7. Data compatibility

NZ:P web hosts ship different data. The client's `maps/*.bsp` and `progs.dat` must match the host's, or the server kicks with `Map model file does not match (maps/X.bsp)`. The release therefore ships two folders with identical engine setup and different documented data sources.

| Host | `game.pk3` | `progs.pk3` | `maps/4all.bsp` checksum |
| --- | --- | --- | --- |
| Duckmath | 71,785,249 B, sha256 `251f7215db782bdda0fc0b92c9d39c20653b7c88f370e070f08268078ce4de47`, Last-Modified 2025-09-15 | 458,237 B, sha256 `42057fc13022deade48e3a6e54d1b0582c8941c868d08d3029081a1bd0edfb3b` | `0xC1BDD9E5` |
| nzp.gay | 94,276,834 B, sha256 `847a6fb7c95b26eab0fdbfa31223a225608a5f9f7af4f88af1e04a1c0a14637d` (verified 2026-11-07) | 491,379 B, sha256 `47bc82fa1335f5748ac08372c2daf24c57f29e56f046ad0fa125eec90c9bf832` | `0xE51410F0` |

Sources: `https://nzp.gay/nzp/game.pk3`, `https://nzp.gay/nzp/progs.pk3`, and the Duckmath URLs in §3.4. Sizes as of 2026-11-09. They change when the hosts update. Date any refresh.

### The `4all.bsp` checksum

`0xC1BDD9E5` and `0xE51410F0` are **FTE's BSP lump checksums**, not hashes of the `.bsp` files. FTE computes them at load time from the BSP lump table. You cannot reproduce them with `sha256sum` on a pk3. The values above are the ones observed in the 2026-11-09 join logs and confirmed by kicking/joining with each data set (§4, steps 21 to 24).

### Why two folders exist

| | `NZP-Duck` | `NZP-Web` |
| --- | --- | --- |
| For | Rooms hosted from the Duckmath browser client | Rooms hosted from nzp.gay |
| Data | Duckmath's `game.pk3` and `progs.pk3` | nzp.gay's `game.pk3` and `progs.pk3` |
| Engine setup | Patched exe, `default.fmf`, `identity.pfx`, `nzp/autoexec.cfg` | Identical |

Rule zero applies to both: the pk3s are the hosts' files, downloaded by the user, never committed, never re-hosted, never re-packed.

### Practical notes

- **Wrong folder = kick.** `Map model file does not match (maps/4all.bsp)` means switch folders (§13).
- **Delete `dlcache` when swapping data.** FTE caches downloaded maps there. Swapping data without clearing it reproduces the kick with the right files in place.
- **Loose maps from the legacy zip mismatch everything.** Do not point the client at loose `nzp/maps/*.bsp` from any build (§4, step 11).
- **Data updates are host events.** When Duckmath or nzp.gay updates, hashes in §3.4, §7, the README game data table, and `release/*/nzp/GET-GAME-FILES.txt` must change in the same commit. Follow §16.
- **The two `progs.pk3` files are the usual culprit.** `game.pk3` alone is not enough.

---

## 8. The certificate (`identity.pfx`)

What the repo ships, verified with `openssl pkcs12` on 2026-11-09:

| Field | Value |
| --- | --- |
| Subject / issuer | `C = QW, O = FTE QuakeWorld, OU = Fallback, CN = 127.0.0.1` (self-signed) |
| Serial | `7c:32:2c:f2:84:2e:da:84:b5:83:15:4c:9d:70:31:31:1f:03:1f:81` |
| Signature | `sha256WithRSAEncryption` |
| Public key | RSA 2048 |
| Not before | 2026-11-06 19:44:43 GMT |
| Not after | 2031-11-05 19:44:43 GMT |
| Friendly name | `nzp` |
| MAC | SHA1, 2048 iterations |
| Shrouded key bag | `pbeWithSHA1And3-KeyTripleDES-CBC`, 2048 iterations (3DES) |
| Password | empty (loads with `-passin pass:`) |
| File size | 2,666 B |

### Why RSA and CAPI

FTE's SChannel path imports the pfx, then binds the private key with flags **0**:

```c
crypt.pCryptAcquireCertificatePrivateKey(ret, 0, NULL, &hprov, &keyspec, &willbefalse)
```

(`engine/common/net_ssl_winsspi.c`, lines 694 and 783, tag `legacy`). Flags 0 means a legacy CAPI key is required. A CNG (NCrypt) key is rejected, which is why the ECDSA pfx failed on 2026-11-06 (joinlog2) and why RSA CAPI keys are used instead. The same file shows FTE's own fallback cert is `PROV_RSA_SCHANNEL` / `MS_DEF_RSA_SCHANNEL_PROV_W`, `AT_KEYEXCHANGE`, with the issuer template `CN=127.0.0.1, O="FTE QuakeWorld", OU=Fallback, C=QW` (lines 643 to 646), which matches the shipped cert's subject exactly.

### Why ECDSA and CNG fail

`CryptAcquireCertificatePrivateKey` with `dwFlags = 0` refuses CNG keys. FTE does not retry with `CRYPT_ACQUIRE_PREFER_NCRYPT_KEY_FLAG`. The ECDSA pfx therefore loaded as a certificate but had no usable private key. FTE then **silently overwrote** `identity.pfx` with a new auto-generated cert (the write path is `FS_WriteFile("identity.pfx", ...)` in the same file, line 810). If your `identity.pfx` "changed by itself", that is why (§14).

### Provenance, honestly

The project notes describe the shipped pfx as "an RSA 2048 pfx tagged for Microsoft Enhanced RSA and AES Cryptographic Provider, empty password, 3DES". The file's cert matches FTE's built-in fallback template subject exactly, and its validity starts 2026-11-06 19:44:43 GMT, during the first debugging session. The provider tag is a Microsoft bag attribute that `openssl` does not print, so both readings are consistent with the file. Whether it is FTE's auto-generated fallback re-exported by the owner, or a hand-built cert deliberately following the template, is INFERRED, not proven. It does not change any behavior: SChannel loads it, and the DTLS role does not depend on the certificate.

### The rules

- It is a **public, throwaway** certificate. It exists so SChannel has a key to sign with. Everyone ships the same one. It is not a secret and not an identity.
- The pfx import tries the Windows username as password first, then an empty password, then `NULL` (lines 679 to 685). Ours uses the empty password path.
- Do not replace it with a secret pfx. Do not reuse it for anything else. Do not commit any other pfx.
- If you want your own, delete `identity.pfx` and FTE generates a new fallback on next start (RSA, CAPI, works as the DTLS client after the §5 patch). What you lose is nothing, because the cert is not an identity.
- See `SECURITY.md`. That file is the policy. This section is the mechanism.

---

## 9. The master server

### Protocol names

| Protocol | Who uses it | List endpoint |
| --- | --- | --- |
| `NZP-REBOOT-WEB` | Browser-hosted rooms (duckmath.org, nzp.gay) | `http://master.frag-net.com:27950/raw/NZP-REBOOT-WEB` |
| `NZP-REBOOT` | Desktop servers | `http://master.frag-net.com:27950/raw/NZP-REBOOT` |

The in-game server browser queries these endpoints. The web hosts' rooms register under `NZP-REBOOT-WEB`, which is why `default.fmf` carries both tokens (§6). This repository ships no room snapshot and no tooling for the endpoints. Use the in-game server browser. Rooms change constantly, and there is nothing here to cache or track.

### No TURN relay

No public TURN relay is known for these rooms. On a restrictive network, ICE stalls with only mDNS host and srflx candidates visible (joinlog3, §4 step 8). There is nothing to configure. Either the network allows the path or it does not (§18).

---

## 10. Tooling

How you change the patch, and how you check your work without Windows.

### `patcher.js`

- ES5, no dependencies, UMD export (`module.exports` in Node, `root.NZPPatcher` in a browser). Must run in old school Chromebook browsers and in Node 18+.
- Patches by pattern: `a=setup:actpass\n\0` → `a=setup:active\n\0\0`.
- Keeps a `KNOWN` map of input sha256 to `{name, offset, patched}`. Used for verification, not for finding the pattern.
- Refuses to guess: 0 matches → `notfound`, 2+ matches → `multiple`. Output of a known input must hash to the known output or nothing is saved (Python side) / is returned with `ok: true` but the test fails the hash check (JS side, see the test).
- Rejects the SDL exe via a `CryptGenRandom` import search, even though the SDL exe contains the same `actpass` string. This is why the check must stay.
- Detects an already patched exe (`NEW` present, `OLD` absent) and reports `already`.

### `tools/patch.py`

Standard library only. Same logic, same `KNOWN` pairs. Usage:

```bash
python3 tools/patch.py nzportable64.exe [output.exe]
```

Exits non-zero on `not a Windows exe`, `SDL build`, `already patched`, `pattern not found`, or `output hash mismatch, not saving`. **Patcher.js and tools/patch.py must produce byte-identical output.** Change both in one commit. The Python side enforces the known-hash check on save. The JS side reports through the test harness.

### `tests/test-patch.js`

Runs against the official builds. No files are written.

```bash
node tests/test-patch.js nzportable64.exe nzportable-sdl64.exe
```

Checks, in order: the input is a known build. `patch()` returns `patched`. The offset is `0x4eb388`. The output hash matches the known patched hash. Exactly 5 bytes differ. The size is unchanged. A second patch reports `already`. A non-exe is rejected. The SDL build is rejected. Exit code 1 on any failure. Last run against both official builds on 2026-11-09 per the project log. Re-run before every release.

### How to verify without Windows

You cannot run the exe. You verify bytes:

```bash
# 1. Get the official builds (bleeding-edge release, 2025-09-24)
curl -fsSLO https://github.com/nzp-team/fteqw/releases/download/bleeding-edge/pc-nzp-win64-nosdl.zip
curl -fsSLO https://github.com/nzp-team/fteqw/releases/download/bleeding-edge/pc-nzp-win64.zip
unzip -o -q pc-nzp-win64-nosdl.zip && unzip -o -q pc-nzp-win64.zip
sha256sum pc-nzp-win64-nosdl.zip nzportable64.exe nzportable-sdl64.exe

# 2. Both patchers must agree
node tests/test-patch.js nzportable64.exe nzportable-sdl64.exe
python3 tools/patch.py nzportable64.exe out.exe && sha256sum out.exe
# expected: 588be0325c14d679282aec3c080f5832e29e217a78d6bb78c1e5e4de0088ccfc

# 3. Clean up before you commit
rm -f nzportable64.exe nzportable-sdl64.exe out.exe pc-nzp-win64-*.zip
```

Notes from the doc-authoring environment: GitHub release asset downloads were blocked from the sandbox used to write this document (`release-assets.githubusercontent.com`), so the exe hashes above are carried from the project logs, not re-derived on 2026-11-09. `verify.yml` re-derives them on every push, when Actions run (§11). Everything else in this section was re-checked (§19).

---

## 11. CI and release

### The workflows

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `verify.yml` | push, PR, weekly cron (Mondays 12:00 UTC), manual | Downloads both official zips, prints their hashes, runs `node tests/test-patch.js nzportable64.exe nzportable-sdl64.exe` and `python3 tools/patch.py` |
| `release.yml` | `release: published`, or manual with a tag | Downloads `pc-nzp-win64-nosdl.zip`, checks it against `NOSDL_SHA` (`5a6d35ed01be1b3570556efebcd167cd68bedcc90feb46a2396fe195f97dc5ce`), patches with `tools/patch.py`, assembles `NZP-Duck/` and `NZP-Web/` with config and `release/*/GET-GAME-FILES.txt`, zips it, writes `SHA256SUMS.txt`, uploads both to the release with `gh release upload --clobber` |

### Current state, as of 2026-11-09

- **GitHub Actions are blocked by an account billing lock.** Every job fails before starting. The failing runs are 3 to 4 seconds long (`gh run list` shows `Verify patch` failing on `main` and on the dependabot branches, checked 2026-11-09). The owner reports the failure message is `account is locked due to a billing issue` (2026-11-09). Log download was blocked from the sandbox used for this document, so the message text is owner-reported, and the instant-failure timing is verified.
- **After billing is fixed:** re-run `verify.yml` on `main`, then re-run `release.yml` against `v1.0.0` (the workflow supports `workflow_dispatch` with an existing tag).
- **Dependabot PRs #1 and #5 are open** (`actions/setup-node` 4 → 7, `actions/checkout` 4 → 7), checked 2026-11-09. PRs #2 to #4 (Pages actions for the removed workflow) are no longer open.
- **`ubuntu-latest` migrates to Ubuntu 26 starting 2026-10-19** (§14).

### Release v1.0.0

Published 2026-11-09T19:47:52Z, id `439565092`, **with no assets attached**. The zip (`nzportable-duck-v1.0.0.zip`, 6,748,400 B) was built by hand because Actions were locked. The release body still says the zip is "attached by CI a minute after this release goes up", which never happened. The owner uploads the zip by hand. If you are tempted to attach a hand-built exe: don't, unless CI cannot run. If CI cannot run, build it with `tools/patch.py` and confirm the output hash equals the known patched hash before attaching it, and say so in the release notes.

### Release rules

- `release.yml` builds from the official download, never from a local exe.
- The patched exe hash goes in the release notes, every time.
- Never put `.pk3` files in a release.
- `CHANGELOG.md` gets one entry per release (§16, release playbook).

---

## 12. Licensing

- **FTEQW is GPL-2.0-or-later.** File headers say version 2 of the License, or (at your option) any later version (for example `engine/client/cl_main.c`). This repo's patched exe is offered under **GPL-3.0**, which that "or later" clause allows.
- **This repository is GPL-3.0.** Do not switch to GPL-2.0-only or to a permissive license. Do not relicense a derived work. `LICENSE` is frozen (§2).
- **`SOURCE.md` is a license obligation, not a courtesy.** It points at the corresponding source for the patched binary: upstream at `nzp-team/fteqw`, commit `f68a2b547d2dc4bf6886b922baa1bff487cc5038` (tag `legacy`), the `bleeding-edge` release's `pc-nzp-win64-nosdl.zip`, and the exact source diff. Keep it accurate. If the patch changes, `SOURCE.md` changes in the same commit.
- **The official binary is built from** `tools/build-nzp-win64-nosdl.sh` at tag `legacy` (verified to exist 2026-11-09).
- **No game data and no nzp code is distributed here or in the release.** `game.pk3` and `progs.pk3` belong to nzp-team (nzp.gay's copies) and to Duckmath, and are downloaded by the user at install time. The release zip contains only the patched exe, config, `release/` texts, `LICENSE`, and `SOURCE.md`.
- **`identity.pfx` is not a secret** (§8). Sharing it is the point.
- **Upstream issue:** `UPSTREAM_ISSUE.md` drafts a report for nzp-team (the SDL `Sys_RandomBytes` stub and the SChannel server FIXME). It is **not filed** (§18). Filing needs the owner's sign-off.

---

## 13. Debugging cookbook

Log line or symptom → cause → fix. Capture a log first: press `~`, type `net_ice_debug 2`, attempt the join, then type `condump joinlog`. The file is `nzp\joinlog.txt`.

| Log line or symptom | Cause | Fix |
| --- | --- | --- |
| `AcceptSecurityContext failed: SEC_E_ALGORITHM_MISMATCH` | Unpatched exe (or the patch was undone) | Run `nzportable64-dtlsclient.exe` (§5) |
| `SCTP Abort: Protocol Violation [INIT malformed]` | SDL exe sends verify tag 0 | Use the nosdl exe (§5) |
| `Map model file does not match (maps/X.bsp)` | Your data differs from the host's | Switch between `NZP-Duck` and `NZP-Web` (§7). Delete `dlcache` |
| `server requires a password` | Locked room | Pick another room. Never ask for the password |
| `ice state failed`, no `We can reach` line | UDP blocked between you and the host | Another room, or another network (§9) |
| Only mDNS and srflx candidates, never answered | The host is behind an incompatible NAT, or the school network blocks the path | Another room, or another network. There is no relay to fall back to (§9) |
| `pfx certificate failed to load` / `Private key is defective.` | `identity.pfx` is missing, corrupt, or an ECDSA/CNG pfx | Restore `identity.pfx` from the release zip (§8) |
| Empty server browser | `default.fmf` lost its `protocolname` line | Restore `default.fmf` from the release zip (§6) |
| `Loaded Certificate` then later `SEC_E_ALGORITHM_MISMATCH` | Correct cert, wrong DTLS role | §5. The cert was never the whole problem |
| `Connected to /N (encrypted)` then an instant kick | You are in, but your data differs from the host's | §7. Switch folders |
| Kicked with `INIT malformed` from a Chrome host | You are on the SDL exe | §5. Use the nosdl build |
| Room lists, then hangs forever at connecting | `net_ice_usewebrtc ""` in `autoexec.cfg` | Remove the override. The default is correct (§6) |
| `.pk3` won't open / game has no maps | Browser saved the pk3 as `.zip`, or it was extracted | Rename back to `.pk3`. Never extract (§14) |
| Room was there, now connection refused | Rooms are ephemeral | Refresh the server browser, pick another room |
| `Map model file does not match (maps/4all.bsp)` on a Duckmath room | You used the NZP-Web folder | Use NZP-Duck (§7) |
| `Map model file does not match (maps/4all.bsp)` on an nzp.gay room | You used the NZP-Duck folder | Use NZP-Web (§7) |
| Join works at home, fails at school | The school network blocks UDP to off-LAN hosts | Try a school-LAN room, or report it with a joinlog (§18) |

Reading a joinlog, in order of the stages in §1:

1. List: did the browser query `NZP-REBOOT-WEB`? Did the room appear?
2. Signal: SDP offer with `a=setup:active`? Answer `passive`?
3. ICE: candidate pairs, then a nominated pair? `We can reach`?
4. DTLS: handshake lines, no SChannel error?
5. SCTP: verification tag non-zero? Data channel open?
6. Game: map checksum accepted?

Any failure before stage 6 is a networking problem. A failure at stage 6 is a data problem. A failure at stage 1 is a config problem.

**New failure mode?** Add a row here and to the README troubleshooting table in the same commit (§15).

---

## 14. Traps

- **A browser saves `.pk3` files as `.zip`.** Rename them back. Never extract them. Never let a user extract them either.
- **FTE overwrites a bad `identity.pfx` silently** (`net_ssl_winsspi.c`, `FS_WriteFile` path). If the file changed by itself, FTE did it (§8).
- **The same room number means a different room minutes later.** Never hardcode a room.
- **nzp.gay and Duckmath data look alike and are not the same.** The wrong one gives the map mismatch kick (§7).
- **The SDL exe contains the same `actpass` string.** The patcher must keep the `CryptGenRandom` rejection or it will "successfully" patch a build that cannot pass the SCTP stage (§10).
- **The legacy zip's loose `nzp/maps/*.bsp` match nothing on the web.** Don't use them (§4, step 11).
- **`com_protocolname` set after startup does nothing.** It must be in `default.fmf` (§6).
- **`net_ice_usewebrtc ""` hangs.** There is no SCTP without WebRTC mode (§6).
- **Deleting `dlcache` is part of switching data folders.** People forget this and report the wrong fix (§7).
- **`ubuntu-latest` migrates to Ubuntu 26 starting 2026-10-19.** Check the runner changelog before assuming a workflow behavior (§11).
- **The release zip must not contain pk3s, ever** (§11).
- **`default.fmf` and `autoexec.cfg` are CRLF.** An editor that strips CRLF can break the parse on the user's machine (§6).
- **A green fork workflow is not a thing.** The fork was blocked at the connector level (§4, step 19). If you want a maintained fork, that is an owner decision, not an agent decision.
- **Duckmath's `progs.pk3` direct URL 404s today** (§3.4). Do not "fix" the README link to the 404 URL.

---

## 15. Contribution rules for people and agents

### What you may edit

| Area | What is allowed |
| --- | --- |
| Docs | `README.md`, this file, `TECHNICAL.md`, `UPSTREAM_ISSUE.md`, `SECURITY.md`, `CHANGELOG.md`, `release/` texts |
| Patch | `patcher.js`, `tools/patch.py`, `tests/test-patch.js` (both patchers in one commit, §10) |
| CI | `.github/workflows/*.yml`, issue templates, `dependabot.yml` |
| Config | `config/default.fmf` and `config/nzp/autoexec.cfg`, **networking lines only** (§6) |
| Assets | `assets/title.svg` |

### What you may never edit

- Everything covered by rule zero: `game.pk3`, `progs.pk3`, maps, models, sounds, textures, QuakeC (`progs.dat`, `csprogs.dat`), engine game logic. None of these are in this repo and none may be added.
- `config/identity.pfx` (§8).
- `LICENSE` (GPL-3.0, §12).
- The patch bytes, offsets, or hashes outside the new-build playbook (§16).

### Never

- Commit `.exe`, `.pk3`, `.bsp`, `.dll`, or `.zip` files. `.gitignore` blocks them. Check `git status` anyway.
- Commit a real private key or any pfx other than the shipped throwaway.
- Target the SDL exe, in code, docs, or CI.
- Add command-line steps to user docs. Users are on locked school PCs. File Explorer, browser downloads, and the in-game console only. Contributor sections (like this one) may use commands.
- Recommend Vril or nightly builds for co-op.
- Ask for, guess, or brute-force room passwords.
- Re-host or mirror Duckmath or nzp.gay data.
- Bump a version, tag, or release name unless the owner explicitly asks. Never guess a version string.
- Change `.gitattributes` CRLF rules without a reason in the commit message.

### Always

- Date every changing fact `YYYY-MM-DD`. No "today", no "recently".
- Keep `patcher.js` and `tools/patch.py` byte-identical in behavior. Change both in one commit, then run `node tests/test-patch.js` on the official exes.
- Patch by pattern, verify by hash. Refuse on 0 or 2+ matches. Never save output that fails a known hash.
- Mark unverified claims UNVERIFIED or INFERRED, with the date.
- Add a row to §13 and to the README troubleshooting table for every new failure mode.
- Keep `SOURCE.md` accurate when the patch changes (§12).
- Keep GPL-3.0 (§12).

### Commit and PR rules

- Branch off the default branch. One logical change per PR. Small diffs.
- Commit messages: short, imperative, scoped (`patch: ...`, `docs: ...`, `tools: ...`, `ci: ...`).
- PR titles: short and imperative. No hype.
- PR bodies: **what changed, how it was verified, and which hashes changed** (usually none, config and docs changes carry no hashes).
- A change that could affect compatibility with browser players needs a real join test against a duckmath.org room, with the joinlog line quoted in the PR. "It compiles" is not verification.
- `CHANGELOG.md` gets an entry for user-facing changes, dated, before release.
- The reviewer reads §17. The author fills in the checklist in the PR body.
- If you find an error in `README.md`, `TECHNICAL.md`, `SOURCE.md`, or `UPSTREAM_ISSUE.md`, list it in the PR body instead of silently changing those files.

---

## 16. Playbooks

### 16.1 nzp-team ships a new Windows build

1. Download the new nosdl zip. Record its size and sha256.
2. Run `node tests/test-patch.js` on the new exe.
3. **Exactly one match:** add `{input sha256: {name, offset, patched}}` to `KNOWN` in `patcher.js`, and the same pair to `KNOWN` in `tools/patch.py`. Update `NOSDL_SHA` in `release.yml`. Keep the old entry. Old builds still exist in the wild.
4. **No match:** read upstream `engine/common/net_ice.c` (the `sdpoffer` branch) and `engine/common/net_ssl_winsspi.c` at the new commit. If upstream fixed the DTLS role (for example, made SChannel offer `active`, or shipped a working SChannel DTLS server), **retire the patch** and point the README at the official build. Do not guess a new pattern.
5. Update `TECHNICAL.md`, the §5 table here, the README Status table, and `CHANGELOG.md`. Re-date everything.
6. Open a PR quoting the test output. If the patch changed, a real join test is required (§15).

### 16.2 Duckmath updates its data

1. Download the new `game.pk3` (from the R2 URL in §3.4) and `progs.pk3` (from the Duckmath game page, re-check the URL, §18).
2. Record sizes and sha256. Date them.
3. Update §3.4 and §7 here, the README Game data table, and `release/NZP-Duck/nzp/GET-GAME-FILES.txt`.
4. Keep the `maps/4all.bsp` row honest: compute or re-read it only from a join test, and date it.
5. Do not mirror the new files. Link to the host.
6. If the checksum changed, say so in the PR body. If only sizes changed, say that too.

### 16.3 nzp.gay updates its data

Same shape as 16.2, for the `NZP-Web` folder: files from §7, `GET-GAME-FILES.txt` under `release/NZP-Web/nzp/`, sizes and hashes re-dated, README table updated.

### 16.4 A new failure report arrives

1. Ask for `nzp\joinlog.txt` (`~`, `net_ice_debug 2`, join, `condump joinlog`). Ask which folder and which network (School / Home / Other), per the `join-problem.yml` template.
2. Match the log against §13. If it matches, answer with the fix.
3. If it does not match, debug it (you may use commands, the user may not). Reproduce if you can.
4. New failure mode: add a row to §13 **and** to the README troubleshooting table, with the date and the exact log line, in the same commit as the fix or the doc.
5. If the fix touches networking or data compatibility, a real join test is required before merge (§15).
6. Never ask the reporter for their room password. Never try the room yourself with guessed passwords.

### 16.5 Cut a release

1. Update `CHANGELOG.md` and the README Status table. Date them.
2. Tag `vX.Y.Z` and publish the release. `release.yml` builds `nzportable-duck-vX.Y.Z.zip` and `SHA256SUMS.txt` from the official input and attaches them (§11).
3. Put the patched exe sha256 in the release notes, next to the input hash and the input zip hash.
4. Never attach a hand-built exe unless CI cannot run. If it cannot run: build with `tools/patch.py`, confirm the output hash against `KNOWN`, and say in the notes that CI was bypassed and how it was verified (§11, v1.0.0 is the example of getting this half right).
5. Never put `.pk3` files in a release.
6. After publishing, check that the assets are actually attached (v1.0.0 shipped with zero assets, §11).
7. Do not bump versions unprompted. The owner supplies the version string.

---

## 17. Review checklist

- [ ] No binaries, game data, zips, or keys in the diff (`git status` clean of them)
- [ ] `patcher.js` and `tools/patch.py` agree. Both changed in this commit if either changed
- [ ] `node tests/test-patch.js` passes on the official builds (or the PR says why it was not run)
- [ ] Hashes, sizes, and dates updated everywhere they appear (grep for the old value)
- [ ] README stays free of command-line steps
- [ ] New or changed claims are verified, or labeled UNVERIFIED / INFERRED with a date
- [ ] §13 has a row for every new failure mode, and the README troubleshooting table matches
- [ ] `SOURCE.md` still describes the patch accurately
- [ ] `CHANGELOG.md` updated for user-facing changes
- [ ] CRLF still intact in `default.fmf`, `autoexec.cfg`, `.gitattributes`, `release/`
- [ ] No new dependency, bundler, or build step introduced
- [ ] AGENTS.md updated in the same commit (this file counts as docs)
- [ ] Compatibility-affecting change: a joinlog line from a real duckmath.org room is quoted in the PR
- [ ] PR body states what changed, how it was verified, and which hashes changed

---

## 18. Open questions and unverified items

Each item is dated. Resolve them or re-date them when you touch this file.

1. **Rooms hosted off the school LAN, reached from the school network** are unverified. All school ICE attempts to off-LAN hosts stalled on 2026-11-06, before the patch (§4, step 8). Retest with `net_ice_debug 2` and `condump joinlog7`.
2. **The patch on networks other than the school LAN** is unverified. Verified once, 2026-11-09, from a school PC to a school-LAN room.
3. **Duckmath data hashes change whenever Duckmath updates.** The values in §3.4 and §7 are dated 2026-11-07 and 2026-11-09 and will go stale silently.
4. **How the Duckmath page serves `progs.pk3`** is unverified. The direct mirror URL returns 404 as of 2026-11-09 (§3.4). The README's "from Duckmath's game page" is a direction, not a URL.
5. **Whether duckmath.org serves byte-identical files to the classroomlesson.github.io mirror** is unverified. Duckmath.org was not read from this environment.
6. **Where the web build gets `NZP-REBOOT-WEB`** is unverified (§3.3). INFERRED: compiled in, or supplied by the page.
7. **The upstream issue draft in `UPSTREAM_ISSUE.md` is not filed.** Filing needs the owner's sign-off (§12).
8. **Why some older hosts passed SChannel as the DTLS server** is INFERRED (Chrome version differences), not proven (§5).
9. **The exact provenance of `identity.pfx`** (FTE auto fallback vs hand-built, §8) is INFERRED, not proven. Behavior does not depend on it.
10. **No public TURN relay is known.** Whether none exists is unverified (§9).
11. **`assets/title.svg` has not been visually rendered and checked** by the author of this document.
12. **The `maps/4all.bsp` checksums** (`0xC1BDD9E5` / `0xE51410F0`) come from one joinlog each. A Duckmath or nzp.gay update invalidates them.
13. **GitHub Actions billing lock.** The failure message is owner-reported (2026-11-09). Log download was blocked from the authoring sandbox, so the exact billing error text is INFERRED from the owner's report plus the 3 to 4 second failure signature (§11).

---

## 19. Verifying this document

### 19.1 From a clone, no network

```bash
git ls-files | wc -l                 # 26 (2026-11-10)
git ls-files | xargs wc -c | tail -1 # 133,818 total
git ls-files | xargs wc -l | tail -1 # 2,138 total

# line endings
python3 -c "print(open('config/default.fmf','rb').read().count(b'\r\n'), 'CRLF lines in default.fmf')"   # 6
python3 -c "print(open('config/nzp/autoexec.cfg','rb').read().count(b'\r\n'), 'CRLF lines in autoexec.cfg')" # 2

# certificate fields
openssl pkcs12 -in config/identity.pfx -nokeys -passin pass: -info
openssl pkcs12 -in config/identity.pfx -nokeys -passin pass: 2>/dev/null | openssl x509 -noout -subject -issuer -dates -text | head -20

# patch offset sanity: the bytes at 0x4eb388 in the official exe
python3 - <<'EOF'
# run only when you have nzportable64.exe (see 19.3)
import hashlib
d = open('nzportable64.exe','rb').read()
print(hex(d.find(b'a=setup:actpass\n\0')))   # 0x4eb388
print(hashlib.sha256(d).hexdigest())          # 798aa496...
EOF
```

### 19.2 With the GitHub API (github.com)

```bash
# upstream commit for tag legacy
gh api repos/nzp-team/fteqw/git/ref/tags/legacy --jq .object.sha
# f68a2b547d2dc4bf6886b922baa1bff487cc5038

# bleeding-edge release metadata
gh api repos/nzp-team/fteqw/releases/tags/bleeding-edge --jq '{tag_name,published_at}'
# bleeding-edge, 2025-09-24T01:54:56Z

# the sdpoffer line and the answer parser (§5)
gh api "repos/nzp-team/fteqw/contents/engine/common/net_ice.c?ref=f68a2b547d2dc4bf6886b922baa1bff487cc5038" \
  --jq .content | base64 -d | grep -n -E "a=setup|dtlspassive" 

# bothdefs.h FIXME (§5)
gh api "repos/nzp-team/fteqw/contents/engine/common/bothdefs.h?ref=f68a2b547d2dc4bf6886b922baa1bff487cc5038" \
  --jq .content | base64 -d | grep -n "HAVE_WINSSPI does not work"

# the SDL random stub and the sys_win RNG (§4 steps 10 and 14)
gh api "repos/nzp-team/fteqw/contents/engine/client/sys_sdl.c?ref=f68a2b547d2dc4bf6886b922baa1bff487cc5038" \
  --jq .content | base64 -d | sed -n '61,78p'
gh api "repos/nzp-team/fteqw/contents/engine/client/sys_win.c?ref=f68a2b547d2dc4bf6886b922baa1bff487cc5038" \
  --jq .content | base64 -d | sed -n '346,369p'

# the build script SOURCE.md names (§12)
gh api "repos/nzp-team/fteqw/contents/tools/build-nzp-win64-nosdl.sh?ref=legacy" --jq .name
```

### 19.3 With the official downloads (CI does this, but it may be blocked locally)

```bash
curl -fsSLO https://github.com/nzp-team/fteqw/releases/download/bleeding-edge/pc-nzp-win64-nosdl.zip
sha256sum pc-nzp-win64-nosdl.zip   # 5a6d35ed01be1b3570556efebcd167cd68bedcc90feb46a2396fe195f97dc5ce
unzip -o -q pc-nzp-win64-nosdl.zip
sha256sum nzportable64.exe         # 798aa4964fed84d8f5f5c91c4e276fc91e2d81b5d9c6a109bbb5f6a3ea8c03e2
node tests/test-patch.js nzportable64.exe nzportable-sdl64.exe
python3 tools/patch.py nzportable64.exe out.exe && sha256sum out.exe
# 588be0325c14d679282aec3c080f5832e29e217a78d6bb78c1e5e4de0088ccfc
```

### 19.4 With the game data (a normal network)

```bash
curl -fsSLO https://nzp.gay/nzp/game.pk3     # 94,276,834 B, sha256 847a6fb7...
curl -fsSLO https://nzp.gay/nzp/progs.pk3    # 491,379 B,   sha256 47bc82fa...
curl -fsSL -o nzp_game.pk3 https://pub-2d868f15a1824cc8a2ec51069ed41c6f.r2.dev/nzp_game.pk3
# 71,785,249 B, sha256 251f7215..., Last-Modified 2025-09-15
```

### 19.5 What was re-verified on 2026-11-09, and what was not

| Fact | Status on 2026-11-09 | How |
| --- | --- | --- |
| File sizes, line counts, tracked file list (§2) | Re-verified | `git ls-files`, `wc` |
| CRLF in config and release files (§6) | Re-verified | Byte scan |
| `identity.pfx` fields (§8) | Re-verified | `openssl pkcs12`, `openssl x509` |
| `net_ice.c` lines, `bothdefs.h` FIXME, `sys_sdl.c` stub, `sys_win.c` RNG (§5) | Re-verified | `gh api` at commit `f68a2b54` |
| `legacy` tag commit, `bleeding-edge` publish date, `build-nzp-win64-nosdl.sh` exists (§12) | Re-verified | `gh api` |
| Duckmath mirror pages, `ftewebgl.js`, `default.fmf`, 404 for `progs.pk3` URL (§3) | Re-verified | Text fetch 2026-11-09 |
| CI billing lock, v1.0.0 has no assets, dependabot PRs #1 and #5 open (§11) | Re-verified | `gh run list`, `gh release view v1.0.0`, `gh pr list` |
| Exe hashes, output hash (§5, §10) | Carried from project logs | Release-asset download blocked from the authoring sandbox |
| Game data hashes (§7) | Carried from the 2026-11-07 nzp.gay verification and the 2026-11-09 Duckmath join | Hosts not reachable from the authoring sandbox |
| The successful join, 10:03 PST 2026-11-09 (§4 step 24) | Carried from user log | Cannot join rooms from a sandbox |

If a number in this document disagrees with the tree, the tree is right. Fix the document in the same commit that changed the fact.

---

*Last updated 2026-11-10. Branch `arena/86ebb2a4-nzportable-duck`.*
