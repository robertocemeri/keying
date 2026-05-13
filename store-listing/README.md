# Store listing assets

This directory holds everything you need to submit the Keying browser extension to a store.

## Files

- `chrome.md` — Chrome Web Store listing copy + permission justifications.
- `firefox.md` — Firefox Add-ons listing copy.
- `screenshots/` — store screenshots (placeholders; see below).

## Building the upload zip

From the repo root:

```bash
npm run extension:zip
```

This produces `release/keying-extension.zip` — upload that file to both stores.

## Screenshots you still need to take

Chrome wants at least 1, allows up to 5. **1280×800 or 640×400**, PNG or JPEG.

Recommended shots:

1. The autofill prompt on a real login page (e.g., github.com/login).
2. The extension popup showing "Paired with Keying" + matched credentials.
3. The pairing flow — the 6-digit code visible in the desktop app and the extension popup side-by-side.
4. The desktop app's vault screen.
5. The recovery key print preview (proves it's serious about offline-first).

Save them as `screenshots/01-autofill.png` through `screenshots/05-recovery.png`. Stores accept JPEG too but PNG is fine.

## Promotional images (Chrome Web Store, optional but improves listing)

- Small promo tile: 440×280 PNG
- Marquee: 1400×560 PNG (only if you want to be a featured candidate)
- Screenshot tile: 1280×800

I haven't generated these — the design is dark with acid green (`#84cc16`), see the landing page for the visual language.

## Submission checklist

- [ ] Pay $5 Chrome Web Store registration fee
- [ ] Upload `keying-extension.zip`
- [ ] Paste copy from `chrome.md`
- [ ] Upload screenshots
- [ ] Paste each "permission justification" verbatim into the Web Store form
- [ ] Add privacy policy URL — point to https://your-domain/privacy or the PRIVACY.md on GitHub
- [ ] Submit. First review = 2-7 business days
