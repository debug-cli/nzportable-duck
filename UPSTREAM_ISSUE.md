# Draft issue for nzp-team/fteqw

**Title:** Windows builds can't join WebRTC (browser) co-op rooms: SDL random stub and SChannel DTLS server role

**Summary**
The Windows desktop builds fail to join rooms hosted from the web build in Chrome. Two separate bugs cause this.

**1. `Sys_RandomBytes` is a stub on SDL Windows builds**
`engine/common/sys_sdl.c` reads `/dev/urandom` only under Linux or BSD. On `_WIN32` it returns false, so `sctp->i.verifycode` stays 0. Chrome's dcsctp rejects the INIT: `SCTP Abort: Protocol Violation [INIT malformed]`.
Suggested fix: under `_WIN32`, use `BCryptGenRandom(NULL, buf, len, BCRYPT_USE_SYSTEM_PREFERRED_RNG)` or `CryptGenRandom`, like `sys_win.c`.

**2. SChannel is used as the DTLS server**
`net_ice.c` offers `a=setup:actpass`. Chrome answers `active`, so FTE becomes the DTLS server. `bothdefs.h` already notes `HAVE_WINSSPI does not work as a server`. Result: `AcceptSecurityContext failed: SEC_E_ALGORITHM_MISMATCH`.
Suggested fix: when the DTLS provider is SChannel, offer `a=setup:active` (we verified this joins Chrome-hosted rooms), or add a cvar to pick the role.

**Verified**
Patching only that string in `pc-nzp-win64-nosdl` (bleeding-edge, 2025-09-24) let a Windows client join a Chrome-hosted room (`Connected to /1706 (encrypted)`) on 2026-11-09.

**Related:** the web data on nzp.gay and on Duckmath differ, so hosts and clients must use the same data, or the client gets "Map model file does not match".
