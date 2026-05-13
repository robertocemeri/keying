# Keyring

A local, encrypted password manager for macOS. No cloud. No account. No telemetry. Your vault lives on your Mac in a single encrypted file and never leaves.

<p>
  <a href="https://github.com/robertocemeri/keyring/releases">Download</a> ·
  <a href="./PRIVACY.md">Privacy</a> ·
  <a href="./LICENSE">License</a>
</p>

---

## Why another password manager

Because the existing ones either (a) keep your vault on their servers, (b) charge a subscription for what is fundamentally a local-first problem, or (c) are unmaintained.

Keyring is a 100% local password manager with a small, auditable codebase and a companion browser extension that talks to it over loopback. The trust model fits on one page: encrypt the file with a key derived from your master password, and don't talk to anyone but yourself.

## Features

- **AES-256-GCM** vault encryption, key derived via **PBKDF2-SHA256** (600,000 iterations).
- **Master password + recovery key.** The recovery key is generated once at setup and is the only fallback if you forget your password. There is no other way back.
- **Touch ID quick-unlock** — encryption key kept in macOS Keychain, gated by your fingerprint.
- **TOTP / 2FA codes** generated locally, no third-party authenticator app needed.
- **Browser autofill** for Chrome, Edge, Brave, Arc, Firefox via the bundled extension, paired interactively with a 6-digit code. The bridge listens only on `127.0.0.1`.
- **Import** from Bitwarden (JSON or CSV), 1Password CSV, iCloud Keychain CSV, generic CSV.
- **Export** as encrypted backup, Bitwarden JSON, or generic CSV — get your data back out whenever you want.
- **Folders** with per-folder + per-entry autofill controls (so e.g. your work vault doesn't autofill on personal sites).
- **Auto-lock** after 5 minutes of inactivity; lock-on-close.
- **Signed and notarized** macOS app, with auto-updates via GitHub Releases.

## Install

Download the latest signed DMG from the [Releases page](https://github.com/robertocemeri/keyring/releases). Open it, drag Keyring to Applications, launch.

Install the browser extension from the Chrome Web Store (link will be added once approved) or Firefox Add-ons (ditto), or load `extension/` unpacked while developing.

## Security model

What Keyring guarantees:

- An attacker who steals the encrypted vault file cannot read it without your master password or recovery key. PBKDF2 with 600k iterations makes brute-force impractical on consumer hardware.
- The Keyring app and extension never make network requests to any server we run. The only outbound requests are auto-update checks to `api.github.com`.
- The bridge between the app and browser extension is on `127.0.0.1` only, requires a per-browser token, and the pairing flow requires you to confirm a 6-digit code in the app before any token is issued.

What Keyring does NOT protect against:

- A compromise of macOS itself (the encryption key sits in process memory while the vault is unlocked).
- A keylogger that captures your master password as you type it.
- Anyone who gets your recovery key. It's bearer-only — treat it like cash.
- Physical access to your unlocked Mac with the vault open. Use ⌘L to lock manually.

If you find a vulnerability, please open an issue or email the author.

## Architecture

- `electron/` — main process. Crypto, vault file I/O, IPC, the loopback bridge for the browser extension, the auto-updater.
- `src/` — Vite + React renderer. The vault UI, setup, unlock, settings, import, export.
- `extension/` — Manifest V3 browser extension. Service worker + popup + content script.
- `build/` — app icons + macOS entitlements plist.

Vault file format is documented in `electron/vault.ts`. Crypto primitives are documented in `electron/crypto.ts`.

## Develop

Requires Node 20+ and the Xcode command-line tools (for `keytar`'s native build).

```bash
npm install
npm run electron:dev
```

This boots Vite on `:5173` and Electron with hot reload.

To produce a local (unsigned) build:

```bash
npm run electron:build
```

To produce a signed + notarized release build (requires Apple Developer credentials — see `STRATEGY.md` section 1):

```bash
export CSC_LINK="$HOME/path/to/Developer-ID-Application.p12"
export CSC_KEY_PASSWORD="..."
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="ABCDE12345"
npm run release
```

To package the browser extension:

```bash
npm run extension:zip
```

## Backup and recovery

- **Recommended:** export an encrypted backup periodically (Settings → Backup & export → Export encrypted backup). The same master password unlocks it on any Mac. Drop it into `~/Library/Application Support/Keyring/vault.enc` to restore.
- **Recovery key:** generated once at setup, prompted to print. Without it (and your master password), losing the master password means losing the data.

## Privacy

See [PRIVACY.md](./PRIVACY.md). Short version: Keyring sends nothing to anyone, ever.

## License

[MIT](./LICENSE). Use it, fork it, audit it.

## Acknowledgements

Built with Electron, React, Vite, Tailwind, and `keytar`. Recovery-key key-wrapping pattern inspired by 1Password's Secret Key and Bitwarden's Recovery Code.
