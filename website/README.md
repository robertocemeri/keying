# Keyring landing page

Static site. No build step. Open `index.html` directly or serve the directory.

## Local preview

```bash
cd website
python3 -m http.server 4000
# or
npx serve .
```

Then open http://localhost:4000.

## Deploy

### GitHub Pages (easiest)

1. In the `keyring` repo: `Settings → Pages`.
2. Source: "Deploy from a branch."
3. Branch: `main` · Folder: `/website`.
4. Save. Your site is live at `https://<user>.github.io/keyring/`.
5. Custom domain: enter your domain in `Settings → Pages → Custom domain`, then add a `CNAME` record at your DNS provider pointing to `<user>.github.io`.

### Cloudflare Pages / Vercel / Netlify

Point the build to `website/` as the publish directory; no build command needed.

## TODO before go-live

- [ ] Search/replace `https://keyring.app` with your real domain in `index.html`, `privacy.html`, `sitemap.xml`, and any meta tags.
- [ ] If you don't have a domain yet: leaving canonicals pointed at `keyring.app` is fine for staging — but search engines will get confused, so don't index until you've picked one.
- [ ] Convert `og.svg` to `og.png` if you want guaranteed compatibility with every social platform. Modern Twitter/LinkedIn accept SVG; legacy parsers may not. Use any tool — e.g. `npx svgexport og.svg og.png 1200:630` — to produce the PNG, then point `<meta property="og:image">` at it.
- [ ] Replace the placeholder GitHub URLs if you fork to a different account.

## What's included for SEO

- `<title>` and `<meta description>` with the actual product positioning.
- Canonical URL.
- Open Graph + Twitter card meta tags.
- JSON-LD `SoftwareApplication` structured data.
- `sitemap.xml` and `robots.txt`.
- Skip-link, semantic landmarks, proper heading hierarchy.
- Honors `prefers-reduced-motion`.
- All fonts use `display: swap` for fast first paint.
- No tracking, no analytics scripts.
