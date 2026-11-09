# Security

- `config/identity.pfx` is a **public, throwaway** RSA certificate with an empty password. It only exists so Windows SChannel has a key it can sign with. Everyone who uses this repo shares it. Don't use it for anything else.
- If you want your own: delete `identity.pfx` and the game makes a new one on the next start.
- The patched exe is built by the `Build release zip` workflow from the official nzp-team zip, after a sha256 check. Compare the hash in the release's `SHA256SUMS.txt` with the one in the README.
- Report problems through a private security advisory on this repo.
