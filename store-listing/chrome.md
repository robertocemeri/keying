# Chrome Web Store — Keying listing

Copy/paste-ready listing for the Chrome Web Store Developer Dashboard.

---

## Title (max 75 chars)

```
Keying — local password manager autofill
```

Alternates if the above is taken:
- `Keying Autofill — local, no cloud`
- `Keying — the local-first password manager`

---

## Short description / Summary (max 132 chars)

```
Autofill from your local Keying vault. Zero-knowledge, no account, no cloud — credentials live in the Mac app, never on a server.
```

(131 chars)

---

## Detailed description (max ~16,000 chars)

```
Keying is a local-first password manager for macOS. Your vault lives in an encrypted file on your Mac — no cloud, no account, no telemetry. This browser extension talks to the Keying desktop app over a loopback bridge (127.0.0.1) so you can autofill credentials without your passwords ever leaving your device.


══════ Why Keying ══════

▸ Zero-knowledge by design. There is no Keying server. We could not see your data if we wanted to — there is no "we."

▸ End-to-end local. AES-256-GCM encryption. Keys derived from your master password with PBKDF2 (600,000 iterations). The encryption key never leaves your Mac.

▸ Touch ID quick unlock. After your first password unlock, biometrics open the vault. The key is stored in the macOS Keychain, not on disk.

▸ Open source. The full source is at https://github.com/robertocemeri/keying. The crypto layer is a single auditable file. Around 4,000 lines of TypeScript.

▸ No vendor lock-in. Export to encrypted backup, Bitwarden JSON, or plain CSV at any time. Your data is yours.


══════ How it works ══════

1. Install the Keying app for macOS — free at https://github.com/robertocemeri/keying/releases.

2. Open the Keying app and create your vault. Write down the recovery key it shows you (paper, not a screenshot).

3. Install this extension. Click the Keying icon in your browser toolbar — it'll display a 6-digit pairing code.

4. Type the code into the Keying app. Pairing is one-time per browser.

5. Visit any site. Keying matches the page against your vault and offers autofill, including TOTP codes for 2FA.


══════ What this extension does NOT do ══════

• Does not connect to any server we run. There is no "we" — Keying has no backend.

• Does not sync, back up, or transmit your data anywhere.

• Does not work without the Keying Mac app running locally on the same machine.

• Does not collect analytics, telemetry, or usage data.

• Does not include third-party trackers or remote code.


══════ Permissions explained ══════

▸ host_permissions: <all_urls>
   A password manager must run on every site you visit to detect login forms. Keying never sends page content anywhere — matching happens entirely in the local Keying app on 127.0.0.1.

▸ host_permissions: http://127.0.0.1:17321/*
   The local loopback bridge the Keying desktop app exposes. Loopback traffic never leaves your computer.

▸ storage
   Persists the pairing token (a random 32-byte value) generated when you first connect this extension to the Keying desktop app. Nothing else is stored.

▸ activeTab + scripting
   Used to read form fields on the current tab so we can autofill the matching credential when you trigger it.


══════ Security model ══════

Keying's threat model is documented in the source: https://github.com/robertocemeri/keying/blob/main/electron/crypto.ts

In short:
• An attacker with read access to your vault file but not your master password gets nothing usable. AES-256-GCM + PBKDF2 with 600k iterations.
• An attacker who can run code as your user can read your vault when unlocked. This is true of every password manager, including the ones that charge you monthly.
• Keying cannot protect against malware running with your privileges. Keep your Mac patched and don't install random software.


══════ Roadmap & support ══════

• Source code, issues, releases: https://github.com/robertocemeri/keying
• File a bug: https://github.com/robertocemeri/keying/issues
• Privacy policy: https://github.com/robertocemeri/keying/blob/main/PRIVACY.md


Made for people who want a password manager that doesn't make them the product. MIT licensed. Audit it yourself.
```

---

## Category

```
Productivity
```

(Secondary: "Workflow & Planning Tools" if a second slot is offered)

---

## Language

Primary:
```
English (United States)
```

Add additional supported locales as you translate. The current extension UI is English-only.

---

## Single-purpose summary

```
Autofill credentials from a locally-running, user-controlled password manager.
```

---

## Permission justifications (paste verbatim into each field)

**activeTab:**
```
Needed to read form fields on the current tab so we can autofill the matching credential when the user invokes Keying.
```

**storage:**
```
Persists the pairing token (a 32-byte random value) generated when the user first connects this extension to the Keying desktop app. Nothing else is stored.
```

**scripting:**
```
Used to inject the autofill UI into the active page when the user requests autofill.
```

**host_permissions:**
```
A password manager must run on every site the user visits in order to detect login forms. Page content is never transmitted off the device — matching happens in the local Keying app on 127.0.0.1.
```

**Remote code use:**
```
None. The extension does not load or execute any code from a remote server. All logic ships in the extension package.
```

---

## Visibility / Distribution

- Visibility: **Public**
- Regions: **All regions**
- Pricing: **Free**
- Trader status: **Non-trader** (unless you've registered a business — see store-listing/README.md for trade-offs)

---

## Asset checklist

All assets live in `store-listing/promos/` (run `npm run promos:build` to regenerate the rendered PNGs from SVG sources).

| Asset | Dimensions | File | Required? |
|---|---|---|---|
| Store icon | 128×128 PNG | `store-icon-128x128.png` | ✅ required |
| Small promo tile | 440×280 PNG | `promo-small-440x280.png` | ✅ required for in-store promotion |
| Marquee promo tile | 1400×560 PNG | `promo-marquee-1400x560.png` | optional (shown only if featured) |
| Screenshots | 1280×800 or 640×400 PNG | *(see below)* | ✅ at least 1, up to 5 |

---

## Screenshots — what to capture

Take these from a real Keying app session on a Retina Mac, then crop/scale to **1280×800 PNG**. Submit 3–5.

1. **Vault list view** — open Keying with 5–8 entries visible, search bar empty, one entry highlighted. Use realistic domain names (github.com, figma.com, aws.amazon.com, 1password.com — yes, that's funny). Make sure no real passwords or personal emails are visible — use placeholders like `you@example.com`.

2. **Autofill in action** — visit a real login page (github.com/login is good), trigger the Keying autofill UI, capture the dropdown with the matching entry. Crop the browser chrome to keep the focus on the prompt.

3. **Settings → Security** — show the auto-lock, Touch ID, and recovery key cards. This conveys the security story.

4. **Setup screen with recovery key** — show the recovery key display (use a fake key like `KEYI-NGRE-CV4Y-DEMO-XXXX-YYYY-ZZZZ-AAAA`). Conveys "you own your data."

5. **Pairing dialog** — show the 6-digit pairing code in the desktop app + this extension's prompt side-by-side. Conveys "no account needed."

Save them to `store-listing/screenshots/` so they're versioned.

---

## Pre-submission checklist

- [ ] Build the zip: `npm run extension:zip` → `release/keying-extension.zip`
- [ ] Generate promos: `npm run promos:build` → `store-listing/promos/*.png`
- [ ] Take 3–5 screenshots, place in `store-listing/screenshots/`
- [ ] Sign in at https://chrome.google.com/webstore/devconsole (one-time $5 dev fee)
- [ ] Pay $5 developer fee if you haven't already
- [ ] Click "New item" → upload the zip
- [ ] Fill in the four fields from this doc (title, short, detailed, category)
- [ ] Upload all four image assets
- [ ] Set privacy policy URL: `https://github.com/robertocemeri/keying/blob/main/PRIVACY.md` (replace with your domain once deployed)
- [ ] Set support email
- [ ] Submit for review — first reviews typically take 1–3 business days
