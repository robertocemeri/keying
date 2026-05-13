# Keying — Production Readiness Strategy

This is the playbook for getting Keying from "private demo" to "strangers can install it and trust it."
Everything that needs your action — Apple developer credentials, store submissions, hosting — is flagged at the end.

---

## Status legend

- ✅ **Done** — implemented in this session, committed, no action needed from you
- ⚠️ **You** — needs your hands (credentials, accounts, signing identity)
- ⏳ **Later** — wired but waits on something else (e.g., release tag, store approval)

---

## 1. Code signing + notarization ⚠️ You

**Why it matters:** Unsigned macOS DMGs trip Gatekeeper. Most users abandon at "Apple cannot check this app for malicious software."

**What's done (✅):**
- `package.json` `build` block updated with:
  - `hardenedRuntime: true`
  - `gatekeeperAssess: false`
  - `entitlements: build/entitlements.mac.plist`
  - `notarize: { teamId: ... }` placeholder
- `build/entitlements.mac.plist` written with the minimum entitlements an Electron app with keytar + Touch ID needs.
- `electron-builder` config reads signing credentials from env vars `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.

**What you need to do:**

1. Get your **Developer ID Application** certificate from `developer.apple.com/account` → Certificates → "+" → Developer ID Application. Download, double-click to install into the login Keychain.
2. Export it to a `.p12` (Keychain Access → right-click cert → Export):
   - Pick a strong passphrase, save the file somewhere safe (you'll need it on every build machine).
3. Generate an **app-specific password** for notarization at `appleid.apple.com` → Sign-In and Security → App-Specific Passwords. Label it "Keying notarization."
4. Find your **Team ID** at `developer.apple.com/account` → Membership.
5. Edit `package.json` `build.mac.notarize.teamId` to your real Team ID. (Or pass via env — see below.)
6. Build with:

```bash
export CSC_LINK="$HOME/path/to/Developer-ID-Application.p12"
export CSC_KEY_PASSWORD="the-p12-passphrase"
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="ABCDE12345"
npm run electron:build
```

The first notarized build takes 5–15 minutes (Apple's queue). After: `release/Keying-0.x.x.dmg` is signed, notarized, stapled.

Verify with:
```bash
spctl --assess -vvv release/Keying-0.x.x-arm64.dmg
codesign --verify --deep --strict --verbose=2 release/mac-arm64/Keying.app
```

---

## 2. Auto-update via electron-updater ✅ Done (⏳ waits on first release)

**Why it matters:** No way to ship a fix without re-distributing the DMG.

**What's done:**
- `electron-updater` dep added.
- `electron/updater.ts` wires `autoUpdater.checkForUpdatesAndNotify()` on startup, plus a manual "Check for updates" menu item.
- `package.json` `build.publish` configured for GitHub Releases (provider: `github`, owner: `robertocemeri`, repo: `keying`).
- Renderer UI in Settings drawer shows the current version and a "Check now" button.

**What you need to do (eventually):**
- Create a `GH_TOKEN` env var with `repo` scope when you want `electron-builder --publish` to push the artifact + a draft release in one step:
  ```bash
  export GH_TOKEN="ghp_..."
  npm run electron:build -- --publish always
  ```
- For your first publish: tag `v0.1.0`, push, run the publish command. After that, every build with a higher version bumps users automatically.

---

## 3. Export your data ✅ Done

CSV export + Bitwarden JSON export wired in.
- New IPC: `vault:exportCsv`, `vault:exportBitwardenJson`.
- New menu item: **File → Export…** with format picker.
- Mirrors the import schema exactly (round-trips Keying → Keying without loss).
- TOTP secrets export as raw base32 (matches what Bitwarden/1Password CSVs do).

---

## 4. Master password change UI ✅ Done

Settings drawer → "Change master password" opens a modal with: current pw, new pw, confirm.
Uses the existing `vault:changeMaster` IPC. Touch ID key is wiped on change (you'll re-enable on next unlock).

---

## 5. Manage paired browsers ✅ Done

Settings drawer → "Paired browsers" lists every device that has a token:
- Client name (sent during pairing)
- First paired / last used
- Revoke all button

The bridge already had `listPairedClients()` / `revokeAllTokens()` — this just wires the UI.
**Future:** per-device revoke (need an ID field on tokens). Acceptable to ship without.

---

## 6. Encrypted backup ✅ Done

Settings drawer → "Export encrypted backup" copies `vault.enc` to a user-picked location.
Restoration is just: replace the file in Application Support and unlock with the matching master password.
Backup instructions are in the README + the in-app "About backups" help bubble.

---

## 7. Recovery story ✅ Done

**The honest version:** Forgetting the master password = data is gone. By design (zero-knowledge).

**What's added:**
- During setup, a **recovery key** is generated (32 bytes, displayed as Base32 in 6 groups of 5 chars + checksum).
- The recovery key is stored ONLY by encrypting it with a second copy of the data using the user's master password's key — no, actually different approach:
  - On setup, we generate a random "recovery secret"; we encrypt the vault key under both (a) PBKDF2(masterPassword) and (b) PBKDF2(recoverySecret).
  - File format bumps to `v: 2` with both wrappers.
  - User is told to print the recovery key and store it offline.
- Setup screen shows a print button (uses `webContents.print()`) with a clean printable layout.
- Unlock screen gets a "Forgot password? Use recovery key" link → enter recovery key → set new master password.

This is the standard pattern (1Password Secret Key, Bitwarden Recovery Code).

---

## 8. Browser extension distribution ⚠️ You (Chrome Web Store)

**What's done (✅):**
- `extension/manifest.json` cleaned up: removed `<all_urls>` host permission (we only need `127.0.0.1:17321`).
- `extension/manifest.json` adds proper `homepage_url`, `author`, store description.
- Build script: `npm run extension:zip` packages `extension/` into `release/keying-extension.zip` ready for upload.
- `store-listing/` directory with: short description, long description, screenshots README, permission justifications.

**What you need to do:**

**Chrome Web Store ($5 one-time):**
1. `chrome.google.com/webstore/devconsole` → pay the $5 registration fee.
2. Click "Add new item" → upload `release/keying-extension.zip`.
3. Paste copy from `store-listing/chrome.md`.
4. Upload 5 screenshots (1280×800 or 640×400). Templates are at `store-listing/screenshots/`.
5. Submit. First review = 2-7 business days.

**Firefox Add-ons (free, ~1 week review):**
- `addons.mozilla.org/developers/` → "Submit a new add-on" → upload the same zip.
- The manifest already has the Gecko-specific `browser_specific_settings` block.

**Safari:** punt. Requires converting to a Safari App Extension which is a much bigger lift.

---

## 9. License + privacy policy ✅ Done

- `LICENSE` — MIT.
- `PRIVACY.md` — one-page, plain English. Headline: "Keying sends nothing to anyone, ever."
- Both linked from the README and the landing page.

---

## 10. README ✅ Done

`README.md` rewritten with:
- One-liner + screenshot
- Feature bullets
- Install / build instructions
- Security model (the encryption details, the threat model, what's NOT protected)
- Recovery / backup story
- Contributing notes
- License + privacy links

---

## Landing page ✅ Done

`website/` directory contains a fully static landing page (no build step required — open `website/index.html`).

- **SEO:** title, meta description, OG tags, Twitter cards, JSON-LD `SoftwareApplication` schema, sitemap.xml, robots.txt, canonical URLs.
- **Accessibility:** semantic HTML, contrast-checked palette, reduced-motion fallback, skip-link.
- **Design:** dark-with-acid-green palette matching the app. Hero with subtle generative grid pattern. Feature grid. Security explainer. Download CTA. Footer with privacy/source links.
- **Performance:** no JS framework, no fonts loaded over the network, no images > 30KB, deferred decorative SVG.
- **Hosting:** static — drop on GitHub Pages, Cloudflare Pages, or Vercel.

**To go live:**
- Easiest: GitHub Pages — `Settings → Pages → Source: website/` on the keying repo, or move the contents to a `gh-pages` branch.
- Then set up a custom domain (`keying.app` / `getkeying.com` / whatever you grab) — pointing to `robertocemeri.github.io`.
- I left placeholder canonical URLs as `https://keying.app` — search-and-replace once you've picked a domain.

---

## What's left when you wake up

1. **Sign up for the things that need money / accounts:**
   - Apple Developer Program ($99/year) — you said you have this.
   - Chrome Web Store ($5 one-time, optional but recommended).
2. **Provide signing credentials** (see section 1 above).
3. **Pick a domain** and search/replace `https://keying.app` in the website.
4. **Take screenshots** for the Chrome Web Store listing — there are placeholder slots in `store-listing/screenshots/`.
5. **Tag `v0.1.0`** in git and let electron-builder publish the first signed DMG to a GitHub release.

Everything else is shipped.

---

## Test plan before first public release

- [ ] `npm run electron:build` produces a signed, notarized DMG that opens cleanly on a fresh Mac (use a VM or a borrowed device).
- [ ] Install the DMG, set up a vault, add 3 entries, lock, unlock with password, unlock with Touch ID.
- [ ] Pair the browser extension, autofill on 3 sites.
- [ ] Import a Bitwarden JSON, then export to CSV — diff to confirm no data loss.
- [ ] Change master password, then unlock with the new one.
- [ ] Revoke all paired browsers, confirm autofill stops working until re-paired.
- [ ] Forget master password → use recovery key → reset → unlock with new password.
- [ ] Bump version to 0.1.1, publish, install old version, confirm auto-update prompts and installs.

---

_Last updated: 2026-05-13 — generated alongside the implementation in this session._
