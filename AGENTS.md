# AGENTS.md

Instructions for AI coding agents and human contributors. Read all of this before you change anything.

## Mission

Let Windows players join Nazi Zombies: Portable (NZ:P) **browser** co-op rooms (duckmath.org, nzp.gay) from the **native** nzp-team Windows game.

The target user is a student on a locked-down school PC. No PowerShell, CMD, WSL, MSYS2, VMs, or admin rights. Every user-facing step must work with File Explorer, a browser download, and the in-game console only.

Repo: `debug-cli/nzportable-duck`. No website or GitHub Pages site exists, and none is wanted. Don't add one.

## Quick facts

| Fact | Value |
|---|---|
| Engine | FTEQW, nzp-team fork, GPL-2.0-or-later |
| This repo | GPL-3.0 (allowed by "or later") |
| Upstream source commit | `f68a2b547d2dc4bf6886b922baa1bff487cc5038` (tag `legacy`) |
| Input build | `pc-nzp-win64-nosdl.zip`, nzp-team `bleeding-edge` release, 2025-09-24 |
| Input zip | 3,363,843 B, sha256 `5a6d35ed01be1b3570556efebcd167cd68bedcc90feb46a2396fe195f97dc5ce` |
| Input exe | `nzportable64.exe`, 7,736,233 B, sha256 `798aa4964fed84d8f5f5c91c4e276fc91e2d81b5d9c6a109bbb5f6a3ea8c03e2` |
| Patch | offset `0x4eb388`, `a=setup:actpass\n\0` to `a=setup:active\n\0\0`, 5 bytes differ |
| Output exe | `nzportable64-dtlsclient.exe`, sha256 `588be0325c14d679282aec3c080f5832e29e217a78d6bb78c1e5e4de0088ccfc` |
| Master server | `master.frag-net.com:27950`, games `NZP-REBOOT-WEB` and `NZP-REBOOT` |
| First verified join | 2026-11-09, Duckmath-hosted room, school PC, same LAN |

## Repo map

| Path | Purpose | Edit? |
|---|---|---|
| `README.md` | User guide. Plain language. | Yes |
| `AGENTS.md` | This file | Yes |
| `TECHNICAL.md` | Root causes, source references, evidence | Yes, keep it factual |
| `SOURCE.md` | GPL source pointer and equivalent source diff | Only if the patch changes |
| `UPSTREAM_ISSUE.md` | Draft issue for nzp-team/fteqw. Not filed. | Yes |
| `SECURITY.md` | Notes on the shared certificate | Yes |
| `CHANGELOG.md` | One entry per release | Yes, every release |
| `patcher.js` | Patch logic. Works in Node and in a browser. ES5 only. | Carefully |
| `tools/patch.py` | Same patch in Python. Must produce byte-identical output. | Carefully, in step with `patcher.js` |
| `tests/test-patch.js` | Patch test against real builds | Yes |
| `tools/rooms.py` | Master server snapshot to `status/` | Yes |
| `status/` | Bot output | **No.** Only `rooms.yml` writes here. |
| `config/default.fmf` | Adds `NZP-REBOOT-WEB` to the server browser. CRLF. | Rarely |
| `config/nzp/autoexec.cfg` | `net_enable_dtls 1`, `net_ice_usewebrtc 1`. CRLF. | Rarely |
| `config/identity.pfx` | Shared throwaway RSA cert, empty password | **No** |
| `release/` | Text files copied into the release zip. CRLF. | Yes |
| `.github/workflows/verify.yml` | Downloads official builds, runs both patchers | Yes |
| `.github/workflows/release.yml` | Builds and attaches the release zip on publish | Yes |
| `.github/workflows/rooms.yml` | Hourly room snapshot | Yes |
| `.github/ISSUE_TEMPLATE/` | Join-problem and new-build forms | Yes |

## How a join works

Every fix in this repo maps to one step.

| Step | What happens | What breaks it | Fix here |
|---|---|---|---|
| 1. List | The server browser queries the master server for `NZP-REBOOT-WEB` | The stock fmf asks only for `NZP-REBOOT` | `protocolname "NZP-REBOOT-WEB NZP-REBOOT"` in `default.fmf` |
| 2. Signal | Broker swaps SDP offer and answer | WebRTC is off | `net_ice_usewebrtc 1` in `autoexec.cfg` |
| 3. ICE | UDP path between the peers | The network blocks UDP | None. Network issue. |
| 4. DTLS | TLS over UDP | SChannel fails as the DTLS server (`SEC_E_ALGORITHM_MISMATCH`) | The patch makes the exe the DTLS client |
| 5. SCTP | Data channel `quake` | SDL exe sends verify tag 0 (`INIT malformed`) | Use the nosdl exe only |
| 6. Game | NZ:P connect, map and csprogs check | Client data differs from host data | Use the host's `game.pk3` and `progs.pk3` |

Details and source lines are in `TECHNICAL.md`.

## Hard rules

1. **No binaries or game data in git.** No `.exe`, `.pk3`, `.bsp`, `.dll`, or `.zip`. `.gitignore` blocks them. Check `git status` before every commit.
2. **Official engine input only.** The patch input is nzp-team's `pc-nzp-win64-nosdl.zip`. Don't use repacks, mirrors, or third-party exes.
3. **Never patch the SDL exe** (`nzportable-sdl64.exe`). `patch()` rejects any build without `CryptGenRandom`. Keep that check.
4. **Patch by pattern, verify by hash.** Find exactly one match, replace it in place, and change only those bytes. Refuse on 0 or 2+ matches. A known input must produce its known output hash, or nothing gets saved.
5. **Keep `patcher.js` and `tools/patch.py` in step.** Change one, change the other in the same commit, and run both tests.
6. **No command-line steps in user docs.** The release zip, Explorer, and the in-game console are fine. PowerShell, CMD, WSL, and Python are not, except in contributor sections.
7. **Don't recommend the Vril or nightly builds.** They ship with co-op disabled.
8. **Don't invent servers or data sources.** No TURN relay is known for these rooms. Link only to nzp-team, nzp.gay, and the Duckmath URLs already in the README.
9. **Date every fact that changes.** Write `2026-11-09`, never "today" or "recently".
10. **Never ask for, guess, or brute-force room passwords.**
11. **Never commit a real private key.** `identity.pfx` is public on purpose. Don't replace it with a secret one.
12. **Don't relicense.** Keep GPL-3.0. Don't switch to GPL-2.0-only or a permissive license.
13. **Mark unverified claims.** If a step hasn't been tested on Windows, say so in the README Status table.

## Commands

You can't run the Windows exe in CI or on Linux. Verify by bytes and hashes.

```bash
# get the official builds
curl -fsSLO https://github.com/nzp-team/fteqw/releases/download/bleeding-edge/pc-nzp-win64-nosdl.zip
curl -fsSLO https://github.com/nzp-team/fteqw/releases/download/bleeding-edge/pc-nzp-win64.zip
unzip -o -q pc-nzp-win64-nosdl.zip && unzip -o -q pc-nzp-win64.zip

# both patchers must pass
node tests/test-patch.js nzportable64.exe nzportable-sdl64.exe
python3 tools/patch.py nzportable64.exe out.exe

# room snapshot (writes status/, don't commit it by hand)
python3 tools/rooms.py
```

Clean up the downloaded `.exe` and `.zip` files before you commit. `.gitignore` covers them, but check anyway.

## Task playbooks

### nzp-team ships a new Windows build

1. Download the new nosdl zip. Record its size and sha256.
2. Run `node tests/test-patch.js` on the new exe.
3. Exactly one match: add `{input sha256: {name, offset, patched}}` to `KNOWN` in `patcher.js`, and add the same pair to `KNOWN` in `tools/patch.py`. Update `NOSDL_SHA` in `release.yml`.
4. No match: read upstream `engine/common/net_ice.c` (the `sdpoffer` branch) and `engine/common/sspi.c`. If upstream fixed the DTLS role, retire the patch and point the README at the official build. Don't guess a new pattern.
5. Update `TECHNICAL.md`, the quick facts here, the README Status table, and `CHANGELOG.md`.

### Duckmath or nzp.gay updates its game data

1. Download the new `game.pk3` and `progs.pk3`. Record sizes and sha256.
2. Update the Game data table in the README and the sizes in `release/*/nzp/GET-GAME-FILES.txt`.
3. Don't mirror the files. Link to the host.

### A user reports a join failure

Ask for `nzp\joinlog.txt` (`~`, `net_ice_debug 2`, join, `condump joinlog`). Match the log:

| Log line | Cause | Answer |
|---|---|---|
| `SEC_E_ALGORITHM_MISMATCH` | Unpatched exe | Run `nzportable64-dtlsclient.exe` |
| `SCTP Abort: Protocol Violation [INIT malformed]` | SDL exe | Use the release zip |
| `Map model file does not match (maps/X.bsp)` | Wrong data for this host | Switch between `NZP-Duck` and `NZP-Web` |
| `server requires a password` | Locked room | Pick another room |
| `ice state failed`, no `We can reach` | UDP blocked | Another room or network |
| Only mDNS and srflx candidates, never answered | Host or school NAT | Another room or network |
| `pfx certificate failed to load` | Bad pfx | Restore `identity.pfx` from the release zip |
| Empty server browser | Old `default.fmf` | Restore it from the release zip |

New failure mode? Add a row here and to the README troubleshooting table.

### Cut a release

1. Update `CHANGELOG.md` and the README Status table.
2. Tag `vX.Y.Z` and publish a release. `release.yml` builds `nzportable-duck-vX.Y.Z.zip` and `SHA256SUMS.txt` from the official input and attaches them.
3. Put the patched exe sha256 in the release notes.
4. Never attach a hand-built exe unless CI can't run. If you must, build it with `tools/patch.py` and confirm the output hash matches the known value.
5. Never put `.pk3` files in a release.

## Writing style for docs

- Short sentences. Active voice. Address the reader as "you".
- Plain words above the fold. Jargon goes in `TECHNICAL.md`.
- No em dashes or semicolons. Use commas or periods.
- No filler or hype words: "just", "simply", "very", "really", "basically", "unlock", "game-changer", "seamless".
- Numbers with units and dates: `71,785,249 B`, `2026-11-09`.
- Every user step names the exact file, folder, or menu.

## Code style

- `patcher.js`: ES5, no dependencies, UMD-style export. It must run in old school-Chromebook browsers and in Node 18+.
- `tools/*.py`: Python 3 standard library only.
- Workflows: pin major versions (`actions/checkout@v4`). Keep jobs readable, with no clever one-liners.
- Text files that ship to Windows (`config/`, `release/`) stay CRLF. `.gitattributes` enforces it.

## Pull request checklist

- [ ] No binaries, game data, or keys in the diff
- [ ] Both patcher tests pass on the official builds
- [ ] `patcher.js` and `tools/patch.py` agree
- [ ] Hashes, sizes, and dates updated everywhere they appear
- [ ] README stays free of command-line steps
- [ ] New or changed claims are verified or marked unverified
- [ ] `CHANGELOG.md` updated for user-facing changes

## Out of scope

- Hosting rooms, relays, or game data
- Builds for other platforms (Linux and macOS use GnuTLS and don't need this patch)
- Rebuilding FTEQW from source in this repo
- Anything that bypasses room passwords or server rules

## Glossary

| Term | Meaning |
|---|---|
| nosdl | Native Win32 build of the exe. It has a working RNG. |
| SDL build | SDL2 build of the exe. Broken RNG on Windows. |
| DTLS | TLS over UDP. WebRTC encrypts with it. |
| SChannel | Windows' built-in TLS library, used by FTE on Windows |
| SCTP | Protocol that carries WebRTC data channels |
| `rtc:///N` | Address of a web room on the broker. Use three slashes. |
| NZP-Duck / NZP-Web | Release folders for Duckmath-hosted and nzp.gay-hosted rooms |
