# Source for the patched binary

FTEQW is licensed "GPL version 2, or (at your option) any later version" (see the file headers, for example `engine/client/cl_main.c`). This repo and the patched exe are distributed under **GPL-3.0**, which that "or later" clause allows.

`nzportable64-dtlsclient.exe` is the official nzp-team build with a 5-byte data change.

- Engine source: https://github.com/nzp-team/fteqw at commit `f68a2b547d2dc4bf6886b922baa1bff487cc5038` (tag `legacy`).
- Official binary: https://github.com/nzp-team/fteqw/releases/tag/bleeding-edge, `pc-nzp-win64-nosdl.zip`, built from `tools/build-nzp-win64-nosdl.sh`.
- Change, as a source diff:

```diff
--- a/engine/common/net_ice.c
+++ b/engine/common/net_ice.c
@@
 			else if (!strcmp(prop, "sdpoffer"))
-				Q_strncatz(value, va("a=setup:actpass\n"), valuelen);	//don't care if we're active or passive
+				Q_strncatz(value, va("a=setup:active\n"), valuelen);	//be the DTLS client: SChannel can't serve DTLS
```

Building that commit with the diff applied gives the same behavior. The binary in the release is the byte patch described in TECHNICAL.md, and `patcher.js` reproduces it.
