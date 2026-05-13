# Firefox Add-ons (AMO) — Keying listing

Copy/paste-ready listing for https://addons.mozilla.org/developers/

---

## Name (max 50 chars)

```
Keying — local password manager autofill
```

---

## Summary (max 250 chars)

```
Autofill from a local, encrypted password manager that runs entirely on your Mac. No cloud, no account, no telemetry. Your vault never leaves your device — this add-on talks to the Keying desktop app over loopback (127.0.0.1) only.
```

---

## Description (Markdown allowed)

```
**Keying is a local-first password manager for macOS.** Your vault lives in an encrypted file on your Mac — no cloud, no account, no telemetry. This Firefox add-on talks to the Keying desktop app over a loopback bridge (127.0.0.1) so you can autofill credentials without your passwords ever leaving your device.

### Why Keying

- **Zero-knowledge by design.** There is no Keying server. We could not see your data if we wanted to — there is no "we."
- **End-to-end local.** AES-256-GCM encryption, PBKDF2-SHA256 with 600,000 iterations. Keys derived from your master password, stored only on disk inside the encrypted vault.
- **Touch ID quick unlock.** After your first password unlock, biometrics open the vault. The key is in the macOS Keychain, not on disk.
- **Open source.** [github.com/robertocemeri/keying](https://github.com/robertocemeri/keying). MIT licensed. Around 4,000 lines of TypeScript.
- **No lock-in.** Export to encrypted backup, Bitwarden JSON, or CSV any time.

### How to install

1. Get the Keying app for macOS: [github.com/robertocemeri/keying/releases](https://github.com/robertocemeri/keying/releases)
2. Open the app and create your vault. Save the recovery key it shows you.
3. Install this add-on, click its toolbar icon, and pair with the desktop app using a 6-digit code.
4. Visit any site — Keying matches the page against your vault and offers autofill.

### Does NOT do

- Connect to any server we run
- Sync, back up, or transmit your data anywhere
- Work without the Keying Mac app running
- Collect any analytics
- Load remote code

### Source

Full source is open at [github.com/robertocemeri/keying](https://github.com/robertocemeri/keying). The crypto layer is one file — audit it yourself.
```

---

## Categories

Primary:
```
Privacy & Security
```

Secondary:
```
Other
```

---

## Tags

```
password-manager, security, privacy, autofill, local-first, open-source, mac, touch-id, totp, zero-knowledge
```

---

## License

```
MIT License
```

---

## Source code disclosure (required for review)

AMO requires the source code if any minification or bundling is used. The Keying extension ships as-is (no bundler), but linking the repo is still useful:

```
https://github.com/robertocemeri/keying/tree/main/extension
```

Add a note to reviewers:

> The extension code is not minified or bundled. The full source lives in the `extension/` folder of the linked repository, matching the submitted package exactly.

---

## Privacy policy URL

```
https://github.com/robertocemeri/keying/blob/main/PRIVACY.md
```

(Replace with your own domain once `website/` is deployed and PRIVACY is hosted there.)

---

## Homepage URL

```
https://github.com/robertocemeri/keying
```

---

## Support URL

```
https://github.com/robertocemeri/keying/issues
```

---

## Assets

Firefox accepts the same artwork as Chrome. From `store-listing/promos/`:

| Asset | Dimensions | File | Note |
|---|---|---|---|
| Icon | 128×128 PNG | `store-icon-128x128.png` | required |
| Screenshots | up to 2560×1600 PNG | (see chrome.md) | 1–10 allowed |

Firefox doesn't use promo tiles. The 440×280 and 1400×560 PNGs are Chrome-specific.

---

## Pre-submission checklist

- [ ] Build the zip: `npm run extension:zip` → `release/keying-extension.zip`
- [ ] Register a developer account at https://addons.mozilla.org (free)
- [ ] Click "Submit a New Add-on" → upload the zip
- [ ] Wait for the automated validator — should pass with no errors
- [ ] Fill the listing fields from this doc
- [ ] Upload icon + screenshots
- [ ] Note the source-code disclosure (text above) in the "Notes to reviewer" field
- [ ] Submit for review — typically 1–10 days for first-time submissions
