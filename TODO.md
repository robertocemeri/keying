# Keying — Production Readiness Checklist

Status snapshot from 2026-05-13. Work through this when you're back.

---

## 1. What's left to ship

### Things only you can do

- [ ] **Apple Developer setup**
  - Install your "Developer ID Application" certificate into the login Keychain
  - Generate an app-specific password at appleid.apple.com
  - Export these as env vars before running the release build:
    ```sh
    export APPLE_ID="you@example.com"
    export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
    export APPLE_TEAM_ID="ABCDE12345"
    ```
  - Put your Team ID into `package.json` → `build.mac.notarize.teamId` (replace placeholder)

- [ ] **Pick a domain**
  - Buy it, then global search/replace `https://keying.app` in:
    - `website/index.html`, `website/privacy.html`, `website/sitemap.xml`, `website/robots.txt`
    - `README.md`, `PRIVACY.md`
    - `store-listing/*.md`

- [ ] **GitHub release plumbing**
  - Create a personal access token with `repo` scope
  - `export GH_TOKEN="ghp_..."` before running the release
  - Confirm the `build.publish` block in `package.json` points to the right `owner/repo`

- [ ] **App icons**
  - Confirm `build/icon.icns` exists (used by electron-builder)
  - Confirm `build/icon-512.png` exists (used by main.ts for the Dock)
  - If missing, generate from a single 1024×1024 PNG via `iconutil` or an online icns generator

- [ ] **Cut v0.1.0**
  ```sh
  git tag v0.1.0
  git push --tags
  npm run release
  ```
  This produces a signed + notarized `.dmg` in `release/` and uploads it as a draft GitHub Release. Edit the release notes, then publish.

- [ ] **Submit the browser extension**
  - `npm run extension:zip` → produces `release/keying-extension.zip`
  - Chrome Web Store: $5 one-time dev fee, upload zip, fill copy from `store-listing/chrome.md`
  - Firefox AMO: free, upload zip, fill copy from `store-listing/firefox.md`
  - Take 3–5 screenshots (1280×800 PNG) showing: vault, autofill prompt, settings

- [ ] **Deploy the landing page**
  - Drag & drop `website/` folder into Vercel / Netlify / Cloudflare Pages
  - Point your domain at it
  - Verify Open Graph + Twitter cards render (use opengraph.xyz)

- [ ] **Support email**
  - Set up `support@yourdomain` (or use your personal address)
  - Add it to `PRIVACY.md`, `README.md`, both store listings

---

## 2. Tests to run before shipping

Run in order. Stop if any step fails and send me the error.

### A. Fresh install (dev mode: `npm run dev`)

- [ ] Wipe data: `rm -rf ~/Library/Application\ Support/keying`
- [ ] Open app → create vault → **write the recovery key on paper**
- [ ] Add 3 entries, edit one, delete one
- [ ] Quit the app, reopen → all entries persist
- [ ] Lock (⌘L) → unlock with password
- [ ] Settings → enable Touch ID → lock → unlock with Touch ID
- [ ] Settings → change master password → lock → unlock with new password works, old fails
- [ ] Settings → rotate recovery key → confirm old recovery key no longer works

### B. Forgot-password recovery

- [ ] Lock → click "Use recovery key"
- [ ] Enter recovery key + new password → vault unlocks, entries intact

### C. v1 → v2 migration (MOST IMPORTANT — this is the path your real data takes)

- [ ] Back up your real vault first: `cp ~/Library/Application\ Support/keying/vault.json ~/Desktop/vault-backup-v1.json`
- [ ] Open the app, unlock with password
- [ ] UI should surface a new recovery key after unlock — write it down
- [ ] Verify all your entries are still there
- [ ] Open `~/Library/Application Support/keying/vault.json` in a text editor → confirm `"v":2` at the top
- [ ] Lock → unlock with Touch ID → should still work (this was the bug fixed in commit e462922)

### D. Export / import roundtrip

- [ ] ⌘E → encrypted backup → save to Desktop
- [ ] Quit, wipe data: `rm -rf ~/Library/Application\ Support/keying`
- [ ] Restart app → on the setup screen click "Import" → load the backup → entries restored
- [ ] Export Bitwarden JSON → import into the Bitwarden web vault as a sanity check

### E. Browser extension end-to-end

- [ ] `npm run extension:zip`
- [ ] In Chrome: chrome://extensions → Developer mode on → "Load unpacked" → select `release/keying-extension/`
- [ ] Click the extension icon → pair with the desktop app
- [ ] Visit a real login page (e.g. github.com/login) → trigger autofill → password fills correctly
- [ ] Repeat in Firefox: about:debugging → Load Temporary Add-on → pick `manifest.json`

### F. Production build

- [ ] `npm run build && npm run dist:mac` → DMG appears in `release/`
- [ ] Mount the DMG, drag app to Applications, open it → **no Gatekeeper warning**
- [ ] Verify signing + notarization:
  ```sh
  spctl -a -t exec -v /Applications/Keying.app
  # should report: accepted, source=Notarized Developer ID
  codesign -dv --verbose=4 /Applications/Keying.app
  ```

### G. Auto-update sanity

- [x] Install v0.1.0 from the DMG
- [x] Bump `package.json` version to `0.1.1`, change a tiny visible thing, `npm run release`
- [x] Open the installed v0.1.0 → within ~30s it should detect the update and prompt

---

## 3. After-launch nice-to-haves (not blockers)

- [ ] Crash reporting (Sentry main + renderer)
- [ ] Telemetry opt-in (anonymous counts of vault unlock failures) — only if you decide you want this; the privacy promise currently says "nothing leaves your machine"
- [ ] Windows + Linux builds (electron-builder configs already partially present)
- [ ] iOS / Android companion apps (huge scope — separate project)
- [ ] Sync (optional, end-to-end encrypted, via Cloudflare R2 or similar)
- [ ] Password-strength meter on the entry form
- [ ] Breach check (HIBP k-anonymity API) — optional, network call

---

## 4. Quick reference: where things live

- Vault file (your data): `~/Library/Application Support/keying/vault.json`
- Keychain entry (Touch ID): search "keying" in Keychain Access.app
- Build output: `release/`
- Strategy doc (long-form): `STRATEGY.md`
- This file: `TODO.md`
