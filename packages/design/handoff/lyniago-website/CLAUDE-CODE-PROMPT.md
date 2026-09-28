# Prompt for Claude Code: deploy lyniago.com

Paste everything below into Claude Code, run from the folder that contains `lyniago-website/`.

---

You are deploying the approved LyniaGo marketing website to **https://lyniago.com**.

**Read `lyniago-website/README.md` fully before doing anything.** It is the spec.

**Ground rules**
- `lyniago-website/site/` is final, production-ready static HTML/CSS/JS. **Deploy it as-is.**
- Do not redesign, reformat CSS values, rename classes, change copy, swap fonts or compress the PNG screenshots in a way that changes how they look.
- The deployed page must look identical to `lyniago-website/reference/LandingPage-reference-offline.html` at 360, 390, 768, 1280 and 1440px widths.
- There is no build step and nothing to install. All asset paths are relative (`assets/...`).

**Tasks**
1. Ask me which host I'm using:
   - Cloudflare Pages
   - Netlify
   - Vercel
   - GitHub Pages
   - cPanel/FTP
   Then deploy `site/` as the web root for lyniago.com and walk me through the DNS records for the domain.
2. Set up HTTPS, a single canonical host (`lyniago.com`, with `www` redirecting to it), and these caching headers:
   - `assets/*`: long-cache immutable
   - `index.html`: no-cache
   Also serve `.woff2` as `font/woff2`.
3. Work through the README's "Items to finish before launch" table:
   - **Play Store link:** ask me for the package ID / URL. Replace `href="#app"` on the three "Download the app" buttons, the hero "Send a parcel" button and "Become a rider" with the Play Store URL, adding `target="_blank" rel="noopener"`. Leave "How it works" as `#riders`.
   - **OG image:** create `site/assets/og-image.png` at 1200×630 as described in the README, or remove the `og:image` meta tag if I say so.
   - **About us:** create `site/about/index.html` that reuses the exact header and footer markup and styles from `index.html`, and ask me for the About copy. Do not invent company facts.
   - **Terms / Privacy:** leave them as `#` unless I give you URLs or content.
4. Page weight is already optimised (WebP, lazy-loading, preloaded fonts). Don't re-encode images. Make sure the host serves `.webp` as `image/webp` and gzip/brotli compresses the HTML and SVG.
5. Run the README's launch QA checklist and report back:
   - any 404s
   - a Lighthouse mobile score
   - screenshots at 390px and 1440px next to the reference file
