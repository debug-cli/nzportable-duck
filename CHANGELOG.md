# Changelog

## Unreleased (2026-11-10)

- Removed the live-rooms snapshot: `.github/workflows/rooms.yml`, `tools/rooms.py`, and `status/`.
- Removed the manual `connect rtc:///42` join instructions and the Live rooms link from the README.

## v1.0.0 (2026-11-09)

- First release. Patched nzp-team `pc-nzp-win64-nosdl` (bleeding-edge, 2025-09-24) to take the DTLS client role.
- `NZP-Duck` and `NZP-Web` folders, with config and a shared RSA identity.
- JS and Python patchers, CI verification, and a CI-built release zip.
- Hourly live-room snapshot from the frag-net master server.
- Verified 2026-11-09: joined a Duckmath-hosted room from a school PC on the same network.
