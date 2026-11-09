# Cape Cod web design

A plain HTML/CSS services page with a fictional landscaping demo. No build step,
framework, external fonts, analytics, or form backend is required.

## Local preview

Install Node.js 22 or later, then run from the repository root:

```sh
npx wrangler@4 dev --local
```

Open the local URL Wrangler prints (normally `http://localhost:8787`). This uses
`wrangler.jsonc` and serves `public/` with Cloudflare Workers Static Assets.
It does not deploy anything. Stop with Ctrl+C.

Check `/`, `/demo/`, and a nonexistent URL such as `/missing-page` (the custom
404 should return HTTP 404). No `npm install` or build is needed.
Cloudflare deployment and domain connection are intentionally left for review.

## Replace before publishing

- Replace `[Your Full Legal Name]` in `public/index.html` with the business owner's
  full legal name.
- Replace **every** `[Quote Form URL]` in `public/index.html` with the real
  HTTPS quote form URL. Buttons currently show an on-page setup notice instead
  of navigating to the placeholder. This guard stops applying after replacement.
- Replace `[Business Email]` in `public/index.html` with the business email;
  optionally wrap it in a `mailto:` link.
- Confirm pricing, scope, payment terms, and availability before publishing.
  Payment instructions belong on invoices, not this website.
- Verify the selected hosting provider's current free-plan eligibility and limits.
  The $0/month hosting statement is conditional, not a pricing guarantee.

The landscaping business, artwork, service descriptions, and calculator prices
are fictional examples, not a real business or an offer. The calculator stays
on the page and collects no contact information or payments.

## Review checklist

- Follow header, service, demo, contact, and return-home links.
- Check phone and desktop widths, keyboard focus, and reduced-motion preference.
- Try every demo service and property size, optional cleanup, and reset.
- Confirm quote placeholders show the setup notice without leaving the page.
- Check the custom 404 through Wrangler, including a nested nonexistent path.

All artwork is original SVG in `public/images/`. The demo shares the stylesheet
at `public/styles.css`; its small calculator is in `public/demo/estimate.js`.