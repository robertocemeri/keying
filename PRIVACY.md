# Privacy Policy

**Last updated: May 13, 2026**

## The short version

Keyring sends nothing to anyone. Ever.

## The long version

Keyring is a local-first password manager. Every byte of your vault — passwords, usernames, URLs, notes, TOTP secrets — lives on your Mac in an encrypted file at `~/Library/Application Support/Keyring/vault.enc`.

The author of Keyring (and any party other than you) cannot read your data because:

- The vault is encrypted with AES-256-GCM under a key derived from your master password using PBKDF2 (600,000 iterations, SHA-256).
- The encryption happens entirely on your device, in the Keyring app.
- Keyring has no server. There is no "Keyring account."

## What Keyring does NOT do

- Keyring does **not** transmit your vault, your master password, your recovery key, or any derived key to any server.
- Keyring does **not** collect analytics, telemetry, or crash reports.
- Keyring does **not** report which sites you visit, log in to, or save passwords for.
- Keyring does **not** include any third-party SDKs, trackers, or advertising networks.

## What network access Keyring needs

Keyring makes network requests in only two situations:

1. **Auto-update check.** On startup the app contacts `api.github.com` and `objects.githubusercontent.com` to check whether a newer release is available on the public GitHub repository `robertocemeri/keying`. No identifying information is sent beyond what GitHub records for any public HTTP request (IP address, User-Agent). You can disable updates by blocking outbound traffic to those hosts.
2. **Browser extension bridge.** Keyring runs a local HTTP server on `127.0.0.1:17321` (your computer's own loopback interface) so the Keyring browser extension can request credentials. This server is bound to `127.0.0.1` only — nothing outside your machine can reach it, and every request requires a per-browser token paired interactively.

## Keychain access

If you enable Touch ID quick-unlock, Keyring stores the vault encryption key in the macOS Keychain under the service name `Keyring`. The key never leaves the Keychain except into Keyring's own process memory while the vault is unlocked.

## Browser extension

The Keyring browser extension stores a single 32-byte random pairing token in `chrome.storage.local` (or the Firefox equivalent). It contacts only `http://127.0.0.1:17321` — your own machine. It does not contact any remote server.

## What if I forget my master password?

You use your recovery key, which Keyring generates during setup and asks you to print. If you've lost both, the data is unrecoverable — by design.

## Changes to this policy

If this policy ever changes substantively, the change will be committed to the public repository and called out in the release notes. There is no email list to be on.

## Contact

Open an issue at https://github.com/robertocemeri/keying/issues.
