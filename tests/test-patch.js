// Usage: node tests/test-patch.js <path-to-nzportable64.exe> [path-to-nzportable-sdl64.exe]
// Checks the patcher against the official builds. No files are written.
const fs = require("fs");
const crypto = require("crypto");
const P = require("../patcher.js");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
let fail = 0;
const check = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fail++; };

const exe = process.argv[2];
if (!exe) { console.error("give the path to nzportable64.exe"); process.exit(2); }
const inp = fs.readFileSync(exe);
const ih = sha(inp);
check(P.KNOWN[ih], "input is a known build (" + ih.slice(0, 12) + ")");
const r = P.patch(inp);
check(r.ok && r.status === "patched", "patch status " + r.status);
if (r.ok) {
  check(r.offset === P.KNOWN[ih].offset, "offset 0x" + r.offset.toString(16));
  check(sha(r.output) === P.KNOWN[ih].patched, "output hash matches");
  let diff = 0; for (let i = 0; i < inp.length; i++) if (inp[i] !== r.output[i]) diff++;
  check(diff === 5, diff + " bytes changed");
  check(r.output.length === inp.length, "size unchanged");
  check(P.patch(r.output).status === "already", "second run says already patched");
}
check(P.patch(Buffer.from("hello")).status === "notexe", "rejects non-exe");
if (process.argv[3]) check(P.patch(fs.readFileSync(process.argv[3])).status === "sdl", "rejects SDL build");
console.log(fail ? fail + " failed" : "all passed");
process.exit(fail ? 1 : 0);
