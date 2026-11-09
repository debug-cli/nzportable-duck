/*
 * nzportable-duck patcher core.
 * Turns the official nzp-team nzportable64.exe (nosdl) into a WebRTC DTLS *client*,
 * so Windows SChannel can finish the handshake with Chrome-hosted NZ:P web rooms.
 *
 * Change: "a=setup:actpass\n\0" -> "a=setup:active\n\0\0" (17 bytes in place, 5 differ).
 * Runs in the browser (index.html) and in Node (tests/test-patch.js).
 * License: GPL-3.0. FTEQW is GPL-2.0-or-later.
 */
(function (root) {
  "use strict";

  var OLD = "a=setup:actpass\n\0";
  var NEW = "a=setup:active\n\0\0";

  // Builds we have checked by hash. Patching by pattern still works on others.
  var KNOWN = {
    "798aa4964fed84d8f5f5c91c4e276fc91e2d81b5d9c6a109bbb5f6a3ea8c03e2": {
      name: "nzp-team/fteqw bleeding-edge pc-nzp-win64-nosdl (2025-09-24)",
      offset: 0x4eb388,
      patched: "588be0325c14d679282aec3c080f5832e29e217a78d6bb78c1e5e4de0088ccfc"
    }
  };
  var PATCHED = {};
  Object.keys(KNOWN).forEach(function (k) { PATCHED[KNOWN[k].patched] = k; });

  function bytes(s) {
    var a = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }

  function findAll(hay, needle) {
    var out = [], n = needle.length, first = needle[0];
    for (var i = 0; i <= hay.length - n; i++) {
      if (hay[i] !== first) continue;
      var j = 1;
      while (j < n && hay[i + j] === needle[j]) j++;
      if (j === n) out.push(i);
    }
    return out;
  }

  function looksLikeExe(buf) {
    return buf.length > 0x40 && buf[0] === 0x4d && buf[1] === 0x5a; // "MZ"
  }

  /**
   * patch(Uint8Array) -> { ok, status, offset, output, message }
   * status: "patched" | "already" | "notexe" | "sdl" | "notfound" | "multiple"
   */
  function patch(input) {
    var buf = new Uint8Array(input);
    if (!looksLikeExe(buf)) {
      return { ok: false, status: "notexe", message: "This is not a Windows .exe file." };
    }
    if (findAll(buf, bytes(NEW)).length === 1 && findAll(buf, bytes(OLD)).length === 0) {
      return { ok: false, status: "already", message: "This exe is already patched." };
    }
    // The SDL build has no Windows random source (SCTP tag stays 0), so the
    // DTLS fix alone is not enough there. The nosdl build imports CryptGenRandom.
    if (findAll(buf, bytes("CryptGenRandom")).length === 0) {
      return {
        ok: false,
        status: "sdl",
        message: "This looks like the SDL build (nzportable-sdl64.exe). Use nzportable64.exe from pc-nzp-win64-nosdl.zip."
      };
    }
    var hits = findAll(buf, bytes(OLD));
    if (hits.length === 0) {
      return { ok: false, status: "notfound", message: "Patch pattern not found. This build is not supported." };
    }
    if (hits.length > 1) {
      return { ok: false, status: "multiple", message: "Pattern found more than once. Refusing to guess." };
    }
    var out = new Uint8Array(buf);
    out.set(bytes(NEW), hits[0]);
    return { ok: true, status: "patched", offset: hits[0], output: out, message: "Patched." };
  }

  var api = { patch: patch, KNOWN: KNOWN, PATCHED: PATCHED, OLD: OLD, NEW: NEW };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.NZPPatcher = api;
})(this);
