# Chrome Web Store listing — Keying

## Short description (132 char max)

Autofill from your local Keying vault. Zero-knowledge, no account, no cloud — credentials live in the Mac app, never on a server.

## Detailed description

Keying is a local-first password manager. Your vault lives on your Mac in an encrypted file — no cloud, no account, no telemetry. This extension talks to the Keying app over a loopback bridge (127.0.0.1) so you can autofill credentials in the browser without your passwords ever leaving the device.

**How it works**

1. Install the Keying app for macOS (free at https://github.com/robertocemeri/keying/releases).
2. Pair this extension with the app via a 6-digit code shown in the app.
3. Visit any site — Keying matches it against your vault and offers autofill, including TOTP codes.

**What it does NOT do**

- It does not connect to any server we run.
- It does not sync, back up, or transmit your data anywhere.
- It does not work without the Mac app running locally.
- It does not collect analytics or usage data.

**Permissions explained**

- `host_permissions: <all_urls>` — required to inject the autofill UI into the page where you want to log in. Password managers cannot work without this.
- `host_permissions: http://127.0.0.1:17321/*` — the local bridge the Keying app exposes on loopback.
- `storage` — caches the per-browser pairing token in `chrome.storage.local`.
- `activeTab`, `scripting` — read the form on the page you're on so we can fill it.

The full source code is open at https://github.com/robertocemeri/keying — audit it yourself.

## Category

Productivity

## Single-purpose summary

Autofill credentials from a locally-running, user-controlled password manager.

## Permission justifications (copy/paste verbatim into the Web Store form)

**activeTab justification:**
Needed to read form fields on the current tab so we can autofill the matching credential when the user clicks the Keying icon.

**storage justification:**
Used to persist the pairing token (a random 32-byte value) generated when the user first connects this extension to the Keying desktop app.

**scripting justification:**
Used to inject the autofill UI into the page when the user requests it.

**host_permissions justification:**
A password manager must run on every site the user visits in order to detect login forms. We never transmit page content anywhere — the matching happens in the local Keying app on 127.0.0.1.

**Remote code use:**
None. The extension does not load or execute any code from a remote server. All logic ships in the extension package.
