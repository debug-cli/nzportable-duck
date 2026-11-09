# AGENTS.md

Repo: `debug-cli/nzportable-duck`. Patcher page: https://debug-cli.github.io/nzportable-duck/

Guide for AI coding agents and contributors working on this repo.

## What this repo is

It lets Windows players join Nazi Zombies: Portable (NZ:P) **browser** co-op rooms (nzp.gay, Duckmath) from the **native** nzp-team Windows exe. The target user is a student on a locked-down school PC: no PowerShell, CMD, WSL, MSYS2, VMs, or admin rights. Everything the user does must work with a browser and File Explorer only.

## Layout

| Path | Purpose |
|---|---|
| `index.html` | GitHub Pages patcher UI. Static, offline, no dependencies. |
| `patcher.js` | Patch logic, shared by the browser and Node. Pure JS, no build step. |
| `tools/patch.py` | Same patch for people with Python. Must stay byte-identical in output to `patcher.js`. |
| `tests/test-patch.js` | `node tests/test-patch.js <nzportable64.exe> [nzportable-sdl64.exe]` |
| `config/` | `default.fmf` (CRLF), `nzp/autoexec.cfg` (CRLF), `identity.pfx` (shared throwaway RSA cert) |
| `release/` | Text files copied into the release zip |
| `.github/workflows/release.yml` | On release publish: download the official exe, verify it, patch it, assemble the zip, and upload it with SHA256SUMS |
| `.github/workflows/rooms.yml`, `tools/rooms.py`, `status/` | Hourly snapshot of the web rooms from `master.frag-net.com:27950/raw/NZP-REBOOT-WEB`. Bot commits only touch `status/`. |
| `.github/workflows/pages.yml` | Deploys `index.html`, `patcher.js`, `config/`, and `status/rooms.json` to GitHub Pages |
| `.github/ISSUE_TEMPLATE/` | Join-problem and new-build forms |
| `SECURITY.md`, `CHANGELOG.md` | Cert notes. Add a CHANGELOG entry for each release. |
| `.github/workflows/verify.yml` | Downloads the official builds and runs both patchers. Also runs weekly. |
| `TECHNICAL.md` | Root causes, offsets, hashes, and evidence. Update it whenever a fact changes. |
| `SOURCE.md` | GPL source pointer and the equivalent source diff |
| `LICENSE` | GPL-3.0 (FTEQW is GPL-2.0-or-later, so v3 is allowed). Do not change it to GPL-2.0-only. |
| `UPSTREAM_ISSUE.md` | Draft issue for nzp-team/fteqw |

## Hard rules

1. **Never commit binaries or game data.** No `.exe`, `.pk3`, `.bsp`, or `.zip` in git. `.gitignore` enforces this. The patched exe ships **only** as a release asset, with `SOURCE.md` included.
2. **Official engine only.** The input is nzp-team `pc-nzp-win64-nosdl.zip` from the `bleeding-edge` release. Do not use repacks, school mirrors, or third-party exes.
3. **Never target the SDL exe** (`nzportable-sdl64.exe`). Its `Sys_RandomBytes` is a stub on Windows, so SCTP fails ("INIT malformed"). `patch()` must keep rejecting builds without `CryptGenRandom`.
4. **Don't recommend the Vril/nightly build.** It has co-op disabled.
5. **No command-line steps in user docs.** The patcher page, Explorer, and the in-game console are fine. PowerShell, CMD, and WSL are not.
6. **Patch by pattern, verify by hash.** Find exactly one `a=setup:actpass\n\0`, replace it in place with `a=setup:active\n\0\0`, and change no other bytes. Refuse on 0 or more than 1 hits. A known input hash must produce its known output hash, or don't save.
7. **Keep the facts dated.** Hashes and sizes of hosted data change. Write absolute dates (`2026-11-09`), never "today".
8. **Don't invent servers.** There is no known public TURN relay for these rooms. Don't add one.
9. **Never ask for or try room passwords.**
10. **identity.pfx is a public throwaway.** Never reuse it elsewhere, and never commit a real private key.

## Known-good values (2026-11-09)

- `pc-nzp-win64-nosdl.zip`: 3,363,843 B, sha256 `5a6d35ed01be1b3570556efebcd167cd68bedcc90feb46a2396fe195f97dc5ce`
- `nzportable64.exe`: 7,736,233 B, sha256 `798aa4964fed84d8f5f5c91c4e276fc91e2d81b5d9c6a109bbb5f6a3ea8c03e2`
- Patched output: sha256 `588be0325c14d679282aec3c080f5832e29e217a78d6bb78c1e5e4de0088ccfc`, offset `0x4eb388`
- nzp.gay `game.pk3` 94,276,834 B (sha256 `847a6fb7…`), `progs.pk3` 491,379 B (sha256 `47bc82fa…`)
- Duckmath `nzp_game.pk3` 71,785,249 B (sha256 `251f7215…`), `progs.pk3` 458,237 B (sha256 `42057fc1…`)
- Upstream source commit: `f68a2b547d2dc4bf6886b922baa1bff487cc5038` (tag `legacy`)

## When nzp-team ships a new build

1. Let `verify.yml` run, or download the new nosdl zip.
2. If the pattern is still found exactly once, add the new `{input sha256: {name, offset, patched}}` entry to `KNOWN` in `patcher.js` and to `KNOWN` in `tools/patch.py`.
3. If the pattern is gone, read `engine/common/net_ice.c` (the `sdpoffer` branch) and `engine/common/sspi.c` upstream before changing anything. Upstream may have fixed it. If so, update the docs to point at the official build and retire the patch.
4. Update the hashes in `TECHNICAL.md`, this file, and the README status line.

## Debugging user reports

Ask for a console log: `~`, `net_ice_debug 2`, join, `condump joinlog`, then attach `nzp\joinlog.txt`.

| Log line | Meaning |
|---|---|
| `SEC_E_ALGORITHM_MISMATCH` | Unpatched exe (SChannel as the DTLS server) |
| `SCTP Abort: Protocol Violation [INIT malformed]` | SDL exe (zero verify tag) |
| `Map model file does not match (maps/X.bsp)` | Data doesn't match the host. Switch nzp.gay vs Duckmath data. |
| `server requires a password` | Locked room |
| `ice state failed`, no `We can reach` | The network blocks UDP. No client fix. |
| Only mDNS and srflx candidates, never answered | Host or school NAT. Try another room or network. |
| `pfx certificate failed to load` | Bad pfx. FTE then overwrites `identity.pfx` with an auto cert. |

## Releases

- The `Build release zip` workflow builds the asset from the official exe when a release is published. Never upload a hand-built exe.
- The asset name is `nzportable-duck-vX.Y.Z.zip` (the workflow uses the tag). It contains `NZP-Duck/` and `NZP-Web/`, each with `nzportable64-dtlsclient.exe`, `default.fmf`, `identity.pfx`, `nzp/autoexec.cfg`, and `nzp/GET-GAME-FILES.txt`. Add `LICENSE`, `SOURCE.md`, and `README.txt` at the top level.
- Put the patched exe's sha256 in the release notes.
- Never put `.pk3` files in a release.

## Style

- User docs: short, active sentences. Address the reader as "you". No jargon above the fold.
- Code: plain ES5-compatible JS in `patcher.js` and `index.html` (old school Chromebooks). No frameworks, no bundler, no CDN.
- Badges: shieldcn.dev, purple theme, JetBrains Mono, with a dark and light `<picture>` pair, matching the owner's other repos.
