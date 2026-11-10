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
- Confirm pricing, scope, payment terms, and availability before publishing.
  Payment instructions belong on invoices, not this website.
- Verify the selected hosting provider's current free-plan eligibility and limits.
  The $0/month hosting statement is conditional, not a pricing guarantee.

The landscaping business, artwork, service descriptions, and calculator prices
are fictional examples, not a real business or an offer. The calculator stays
on the page and collects no contact information or payments.

## Quote and contact links

All six main-site quote links open the public form at
https://tally.so/r/2jB6xp using ordinary links, including without JavaScript.
The contact email is stjohngibson@gmail.com with a matching `mailto:` link.
Existing button and text-link styles are retained. The fictional landscaping
demo's estimate calculator stays on its own page and never submits to Tally.

## Review checklist

- Follow header, service, demo, contact, and return-home links.
- Check phone and desktop widths, keyboard focus, and reduced-motion preference.
- Try every demo service and property size, optional cleanup, and reset.
- Confirm every main-site quote link opens the Tally form and the contact email
  uses the matching `mailto:` link, including on mobile and without JavaScript.
- Confirm the demo estimate calculator still calculates and resets locally
  without opening or submitting to Tally.
- Check the custom 404 through Wrangler, including a nested nonexistent path.

All artwork is original SVG in `public/images/`. The demo shares the stylesheet
at `public/styles.css`; its small calculator is in `public/demo/estimate.js`.

## Private admin workspace

`/admin/` provides Supabase email/password sign-in, an allowlisted order tracker,
payment bookkeeping and project checklists. It is not linked in public navigation.
It uses the same static deployment with no build step. Configuration is initially
placeholder-only; follow [docs/admin-setup.md](docs/admin-setup.md) for the additive
SQL migration, Auth setup, public browser configuration and preview checks.
Do not enter real client data until the policies and your access are verified.