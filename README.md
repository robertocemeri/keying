# Keying

A local, encrypted password manager for macOS. No cloud. No account. No telemetry. Your vault lives on your Mac in a single encrypted file and never leaves.

<p>
  <a href="https://github.com/robertocemeri/keying/releases/latest">Download for macOS</a> ·
  <a href="./PRIVACY.md">Privacy</a> ·
  <a href="./LICENSE">License</a>
</p>

---

## Why another password manager

Because the existing ones either (a) keep your vault on their servers, (b) charge a subscription for what is fundamentally a local-first problem, or (c) are unmaintained.

Keying is a 100% local password manager with a small, auditable codebase and a companion browser extension that talks to it over loopback. The trust model fits on one page: encrypt the file with a key derived from your master password, and don't talk to anyone but yourself.

---

## Features

**Security**

- AES-256-GCM vault encryption. Key derived via PBKDF2-SHA256 with 600,000 iterations.
- Key-wrapping vault format: a random Data Encryption Key encrypts the data, and the DEK is wrapped separately by both the password-derived key and the recovery-key-derived key. Lets you change your master password without re-encrypting everything.
- Touch ID quick-unlock. Encryption key sits in macOS Keychain, gated by your fingerprint.
- Configurable auto-lock: Never / 1 / 5 / 15 / 30 / 60 / 240 minutes (default 15).
- Lock-on-close, ⌘L to lock manually anytime.
- Signed + notarized macOS app with hardened runtime.

**Vault**

- Folders with per-folder + per-entry autofill controls (your work vault doesn't autofill on personal sites).
- TOTP / 2FA codes generated locally — no third-party authenticator app needed.
- Master password change without losing data.
- Recovery key rotation.
- Factory reset with type-to-confirm.

**Browser extension** (Chrome, Edge, Brave, Arc, Firefox)

- Autofill credentials with one click.
- TOTP one-time codes copied to clipboard with the same click.
- Save-credential banner detects new logins (including after 2FA flows) and prompts to add them.
- Generate-strong-password chip on signup forms — 24-char mixed password filled into both primary and confirm fields.
- Update-existing-entry detection when you change a password on a known site.
- Pairing via 6-digit code shown in the app. Bridge listens only on `127.0.0.1:17321`. Per-browser tokens, revocable individually.

**Import / export**

- Import from Bitwarden (JSON or CSV), 1Password CSV, iCloud Keychain CSV, generic CSV.
- Export as encrypted backup (your master password unlocks it on any Mac), Bitwarden JSON, or generic CSV.
- Restore from encrypted backup directly in-app (Settings → Backup & export → Restore from backup).

**Updates**

- Auto-update via GitHub Releases. Checks on startup, downloads in background, installs on quit.
- Manual check available in Settings → About.

---

## Install

1. Download the latest signed DMG from the [Releases page](https://github.com/robertocemeri/keying/releases/latest). Pick `arm64` for Apple Silicon, the plain one for Intel.
2. Open the DMG, drag Keying to Applications, launch.
3. Create your vault — write down the recovery key it shows you on paper.

Install the browser extension from the Chrome Web Store or Firefox Add-ons (links added once approved). For development, load `extension/` unpacked.

---

## Pairing the extension

1. Click the Keying extension icon in your browser toolbar → **Pair with app**.
2. A 6-digit code appears as a modal in the Keying app — type it in the extension. Done.

**Fallback if the modal doesn't appear:**

In the Keying app, open **Settings → Paired browsers → Generate pairing code**. The code displays in the drawer. Type it in the extension's pair screen.

---

## Security model

**What Keying guarantees:**

- An attacker who steals the encrypted vault file cannot read it without your master password or recovery key. PBKDF2 with 600k iterations makes brute force impractical on consumer hardware.
- The Keying app and extension never make network requests to any server we run. The only outbound requests are auto-update checks to `api.github.com` and `objects.githubusercontent.com`.
- The bridge between the app and browser extension is on `127.0.0.1` only, requires a per-browser token, and the pairing flow needs you to confirm a 6-digit code in the app before any token is issued.

**What Keying does NOT protect against:**

- A compromise of macOS itself (the encryption key sits in process memory while the vault is unlocked).
- A keylogger that captures your master password as you type it.
- Anyone who gets your recovery key. It's bearer-only — treat it like cash.
- Physical access to your unlocked Mac with the vault open. Use ⌘L to lock manually.

If you find a vulnerability, please open a private issue or email the author directly. Don't drop zero-days in public issues.

---

## Backup and recovery

- **Encrypted backup**: Settings → Backup & export → **Export encrypted backup**. Same master password unlocks it on any Mac. Keep it on a different device.
- **Restore**: Settings → Backup & export → **Restore from backup**, OR on the setup screen → **Already have a backup? Restore from .enc file**.
- **Recovery key**: generated once at setup, can be rotated from Settings → Security. Without it, losing your master password means losing your data.
- **Plain-text exports**: Bitwarden JSON or CSV — useful when migrating to a different password manager. Delete after import; these are unencrypted.

---

## Vault file location

```
~/Library/Application Support/Keying/vault.enc
```

A single file. Copy it to another Mac with Keying installed to migrate. The same master password unlocks it.

---

## Develop

Requires Node 20+ and the Xcode command-line tools (for `keytar`'s native build).

```bash
npm install            # also runs electron-builder install-app-deps via postinstall
npm run electron:dev   # vite + electron with hot reload
```

The dev script also swaps the Electron.app bundle icon with Keying's so the macOS Dock shows the correct icon during development.

### Building

| Command | Output |
|---|---|
| `npm run electron:dev` | dev server + Electron with hot reload |
| `npm run electron:build` | local unsigned DMG → `release/` |
| `npm run release` | signed + notarized DMG, published to GitHub Releases |
| `npm run extension:zip` | packaged extension → `release/keying-extension.zip` |
| `npm run promos:build` | Chrome Web Store promo tile PNGs → `store-listing/promos/` |
| `npm run setup:dev-icon` | swap Electron.app bundle icon (auto-run by `electron:dev`) |

### Signed releases — first-time setup

1. Enroll in the Apple Developer Program ($99/year).
2. Generate a CSR via Keychain Access → Certificate Assistant → Request a Certificate from a Certificate Authority → Saved to disk.
3. At https://developer.apple.com/account/resources/certificates/list → create a new **Developer ID Application** certificate using that CSR. Download and double-click the `.cer` to install into your login keychain.
4. Verify: `security find-identity -v -p codesigning` should show your Developer ID.
5. Generate an app-specific password at https://account.apple.com/account/manage → Sign-In and Security → App-Specific Passwords.
6. Create a GitHub personal access token with `repo` scope at https://github.com/settings/tokens.
7. Copy `.env.example` to `.env` and fill in:
   ```
   APPLE_ID=your.apple.id@example.com
   APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
   APPLE_TEAM_ID=ABCDE12345
   GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
8. Run `npm run release`. First build takes ~10–15 min (most of it Apple's notarization queue).

---

## Architecture

- `electron/` — main process. Crypto, vault file I/O, IPC, loopback bridge for the browser extension, auto-updater.
  - `crypto.ts` — primitives (PBKDF2, AES-GCM, random salts, password generator)
  - `vault.ts` — vault file format (v1 → v2 migration), key wrapping, entry CRUD
  - `bridge.ts` — HTTP bridge on `127.0.0.1:17321` for the browser extension
  - `keychain.ts` — macOS Keychain access for Touch ID quick-unlock
  - `updater.ts` — electron-updater wrapper
- `src/` — Vite + React renderer. Vault UI, setup, unlock, settings, import/export, recovery key flow.
- `extension/` — Manifest V3 browser extension. Service worker + popup + content script.
- `build/` — app icons + macOS entitlements plist.
- `website/` — static landing page (deployed to Vercel).
- `store-listing/` — Chrome Web Store + Firefox AMO listing copy and assets.
- `scripts/` — build helpers (dev icon swap, extension zip, promo tile rendering).

Vault file format details are in `electron/vault.ts` header comment. Bridge protocol is in `electron/bridge.ts`. Crypto primitives in `electron/crypto.ts` — that's the file to read first if you want to audit the security model.

---

## Privacy

See [PRIVACY.md](./PRIVACY.md). Short version: Keying sends nothing to anyone, ever.

The only outbound network traffic from a normal session:
1. **Auto-update check** to `api.github.com` and `objects.githubusercontent.com` on startup and every 30 min. Disable by blocking those hosts in your firewall — the app keeps working.

The browser extension only talks to `127.0.0.1:17321` (loopback). Loopback traffic never leaves your machine.

---

## License

[MIT](./LICENSE). Use it, fork it, audit it. PRs welcome.

---

## Acknowledgements

Built with Electron, React, Vite, Tailwind, and `keytar`. Recovery-key key-wrapping pattern inspired by 1Password's Secret Key and Bitwarden's Recovery Code.
