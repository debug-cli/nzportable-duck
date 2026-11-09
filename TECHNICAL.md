# Technical notes

Findings from 2026-11-06 to 2026-11-09. Upstream source: `nzp-team/fteqw` tag `legacy`, commit `f68a2b547d2dc4bf6886b922baa1bff487cc5038`. The `bleeding-edge` release binaries come from the same build (2025-09-24).

## The pieces of a web room join

1. The browser list comes from `master.frag-net.com:27950`, protocol `NZP-REBOOT-WEB`.
2. Signaling goes through the broker. Then ICE (UDP), then DTLS, then SCTP data channel `quake`.
3. Then the normal NZ:P connect, which checks map and csprogs.

## Problem 1: the browser lists no web rooms

The stock fmf has `protocolname "NZP-REBOOT"`. An fmf `protocolname` overrides the built-in name (`fs.c`). The server browser uses the first token, and the dpmaster query uses every token. Fix: `protocolname "NZP-REBOOT-WEB NZP-REBOOT"`. Setting `com_protocolname` after startup does not work.

## Problem 2: no WebRTC offer

Web rooms need DTLS plus SCTP. Plain ICE is not enough. Fix in `autoexec.cfg`:

```
net_enable_dtls 1
net_ice_usewebrtc 1
```

`net_ice_usewebrtc ""` hangs.

## Problem 3: SCTP INIT malformed (SDL build only)

- `sys_sdl.c` `Sys_RandomBytes` reads `/dev/urandom` only under Linux or BSD. The `_WIN32` path returns false.
- The SCTP INIT initiate tag comes from `sctp->i.verifycode` (`net_ice.c`), so it stays 0.
- Chrome's dcsctp (`dcsctp_socket.cc` `HandleInit`) aborts with "INIT malformed" when `initiate_tag == 0`.
- `nzportable-sdl64.exe` imports no CryptGenRandom. The nosdl `nzportable64.exe` uses `sys_win.c`, which does.
- Fix: use the nosdl build.

## Problem 4: SEC_E_ALGORITHM_MISMATCH (the patch)

- `net_ice.c` offers `a=setup:actpass`. Chrome answers `a=setup:active`, so FTE becomes the DTLS **server** (`dtlspassive = true`).
- On Windows, DTLS goes through SChannel (`sspi.c`). `bothdefs.h` says: `FIXME: HAVE_WINSSPI does not work as a server.`
- Against current Chrome hosts, `AcceptSecurityContext` fails with `SEC_E_ALGORITHM_MISMATCH`. Some older hosts passed, which suggests a difference in the hosts' Chrome versions (inferred).
- On non-Cygwin Windows, the GnuTLS path loads only `libgnutls*.so` names, so you can't drop in a DLL.
- No cvar changes the DTLS role.
- **Patch:** offer `a=setup:active`. Chrome answers `a=setup:passive`, `net_ice.c` sets `dtlspassive = false`, and SChannel runs as the client (`InitializeSecurityContext`), presenting `identity.pfx` as the client certificate.

| | Value |
|---|---|
| Input | `nzportable64.exe`, 7,736,233 B, sha256 `798aa4964fed84d8f5f5c91c4e276fc91e2d81b5d9c6a109bbb5f6a3ea8c03e2` |
| Offset | `0x4eb388` |
| Old bytes | `a=setup:actpass\n\0` |
| New bytes | `a=setup:active\n\0\0` |
| Changed | 5 bytes (`0x4eb393` to `0x4eb397`) |
| Output | sha256 `588be0325c14d679282aec3c080f5832e29e217a78d6bb78c1e5e4de0088ccfc` |

The string is used with `Q_strncatz`, which stops at the first NUL, so the extra NUL is harmless.

## Problem 5: map mismatch kick

`Map model file does not match (maps/X.bsp)` means your data differs from the host's. Example from 2026-11-09: a Duckmath host expected `0xC1BDD9E5` for `maps/4all.bsp`. The BSP lump checksum of Duckmath's `game.pk3` gives exactly `0xC1BDD9E5`, while nzp.gay's copy differs. The loose maps in the legacy zip also mismatch. Fix: use the host's own data.

## Certificate

`identity.pfx` is an RSA 2048 cert with an empty password, tagged for "Microsoft Enhanced RSA and AES Cryptographic Provider". FTE's own auto cert uses `PROV_RSA_SCHANNEL`. ECDSA or CNG keys are rejected because FTE calls `CryptAcquireCertificatePrivateKey` with flags 0. If a pfx fails to load, FTE overwrites `identity.pfx` with a new auto cert. The shared pfx is a throwaway and not a secret. Don't reuse it for anything else.

## Logs that proved it

- joinlog4 (home): ICE OK. SChannel mismatch on some hosts, INIT malformed on others (SDL exe).
- joinlog5 (home, nosdl exe): ICE OK, mismatch on every host.
- joinlog6 (school, patched exe): `Connected to /1706 (encrypted)`, then the map-mismatch kick.
- 2026-11-09: joined successfully with the Duckmath data folder.
