# Private admin workspace setup

The public website is unchanged. `/admin/` is a private client-side workspace;
no public page links to it, and its HTML has `noindex, nofollow`. This is not an
access-control mechanism: **Supabase RLS is the security boundary**. Static HTML
and the browser's project URL/publishable key are public. No business records
are shipped in the assets. The workspace requires JavaScript and internet
access to your Supabase project.

## 1. Create your Supabase project and schema

Create a Supabase project you control. In its SQL Editor, run the entire
additive migration once:

`supabase/migrations/20261109_admin_dashboard.sql`

It creates four new tables without modifying existing site data. It deliberately
does not drop/replace existing tables; a naming collision fails and rolls back
the transaction. Review collisions before proceeding, rather than deleting data.

All four tables have RLS. `anon` has no table privileges. `authenticated` can
read only its own `admin_users` entry and can select/insert/update orders,
payments and tasks only while allowlisted. Both inserts and updates have
`WITH CHECK` policies. Browser roles cannot add/change/delete allowlist members
or delete records. Use the SQL Editor for membership administration. Do not
weaken the policies or grant additional browser privileges.

## 2. Create and confirm your one admin user

In Supabase Authentication settings:

- Disable **Allow new users to sign up** (public signups).
- Disable **Allow anonymous sign-ins**.
- Keep email/password sign-in enabled. No OAuth, magic links, or public signup
  screen is needed for this dashboard.

Under Authentication > Users, use **Add user > Create new user**, enter your
own email and a strong unique password, and enable **Auto Confirm User**.
Check the user's details to confirm that the email is confirmed. If your
dashboard uses different labels, create the user with the email-confirm option
or complete the confirmation email before testing. Copy its **Auth User UID**,
not the email or project identifier.

In the SQL Editor, replace the example UUID below with your own Auth UUID:

```sql
insert into public.admin_users (user_id)
values ('00000000-0000-0000-0000-000000000000'::uuid)
on conflict (user_id) do nothing;
```

Add only your account. To revoke access through the SQL Editor:

```sql
delete from public.admin_users
where user_id = '00000000-0000-0000-0000-000000000000'::uuid;
```

RLS denies subsequent record requests immediately. A browser already displaying
records cannot have its memory remotely erased; sign it out/close it as well.
Use Supabase's user management for password recovery; this workspace deliberately
provides no signup/password-reset flow.

## 3. Enter public browser configuration

Edit **`public/admin/config.js`**. Replace both placeholders with the project's
URL and **publishable key** from Supabase's API settings. A legacy `anon` key
also works, but prefer the publishable key. These two values are designed to
be public and do not bypass RLS.

**Never put a password, secret key, service_role key, database connection string,
or real client records in the repository or browser assets.** No server
environment variables are needed. Keep placeholders in the review PR until
you configure your project. Missing configuration shows a setup message and
does not load any records.

The official Supabase JavaScript **2.49.8** UMD distribution and its MIT license
are pinned under `public/admin/vendor/supabase-2.49.8/`. They are served locally,
not from a third-party CDN. No package install or build step is added to the
site. To upgrade, obtain the matching official npm distribution, replace both
UMD files and license together, update the import/version documentation, and
repeat the checks below.

## 4. Preview before merging

Use a separate test Supabase project and fake clients. Follow README's command:

```sh
npx wrangler@4 dev --local
```

Open the printed origin followed by `/admin/`. Cloudflare's existing
`public/` asset configuration serves `public/admin/index.html` at that path.
For a Cloudflare preview deployment, configure only a test project's public
URL/key on the preview branch. Keep test users and fake data out of production.
Avoid saving real client data on a shared device; sign out when done.

Sessions exist only in JavaScript memory: no local/session storage or cookies
are used by the app. Refreshing requires sign-in. Automatic token refresh and
URL-based sessions are disabled. Token expiry returns to sign-in and clears the
interface; sign-out also immediately clears records, forms, and message drafts.
Business records load only after `getUser` verifies the token and the user's
own allowlist entry is found. Session revocation/network failures on subsequent
requests show errors rather than pretending a save succeeded.

## Daily use

- **New Inquiry:** just business name and contact email. The default is the
  $500 one-page refresh. Change to the $900 redesign or edit the total later.
  Changing the package applies that preset; the total remains editable.
- Work through New Inquiry, Quote Sent, Awaiting Deposit, Booked, In Progress,
  Waiting on Client, Ready to Launch, and Completed. Cancelled is also available.
  Status changes are manual; recording payments does not imply acceptance.
- Record only payments already received separately: Cash, Check, or Venmo
  Business. **Correct entry** edits mistakes in place. There is no checkout,
  payment collection, card handling, or Venmo integration. Totals always derive
  from payment rows in integer cents. Expected deposit is 50%, rounded to the
  nearest cent; credits/overpayments are shown separately.
- Save a full HTTP/HTTPS live URL before marking Completed. An unpaid balance
  displays a warning and asks for confirmation before completion. Completed has
  its own newest-first view and **Open Live Website** buttons. **Reopen order**
  returns it to In Progress without deleting notes, payments or tasks.
- Add the starter checklist once or again safely; the database's per-order
  starter key prevents duplicates without overwriting existing due dates or
  completed checks. Custom task titles are also compared when adding starters.
  Tasks can be checked off and their title/due date edited.
- Home includes active orders (not Completed/Cancelled), waiting-on-client
  count, overdue tasks, tasks due today through seven days from today, accepted
  project balances, and payments this month through today. Accepted means
  Booked, In Progress, Waiting on Client, Ready to Launch or Completed.
  Inquiries, Quote Sent, Awaiting Deposit and Cancelled are excluded from
  outstanding balances. Tasks on completed/cancelled orders are excluded.
  Dates/month boundaries use **America/New_York**. Task and received-payment
  dates are date-only; created/updated/completed timestamps display in New York.
- Copy message buttons use **saved** details only; review and send yourself.
  If clipboard permission is unavailable, the draft is displayed for manual
  copying. They never send email. Save before switching views; unsaved edits
  are not persisted.

## Verification checklist

Run pure calculation/URL/date tests with Node.js 22 or later:

```sh
node --test tests/admin.test.mjs
```

For the API integration test, export `ADMIN_TEST_URL`, `ADMIN_TEST_KEY`,
`ADMIN_TEST_EMAIL`, `ADMIN_TEST_PASSWORD`, `ADMIN_TEST_OUTSIDER_EMAIL` and
`ADMIN_TEST_OUTSIDER_PASSWORD` in your local shell. Use only a disposable test
project's public URL/key and the two fake confirmed accounts described below.
The first account must be allowlisted and the second must not be. Enter test
passwords with your shell's hidden-input prompt instead of committing them or
putting them in a command history. Then run:

```sh
node --test tests/admin.test.mjs tests/admin-api.test.mjs
```

The API test skips explicitly if those variables are missing. It creates a fake
order, payments, and a task, tests actual HTTP denials and persistence, and
retains the fake order (printing its UUID) for inspection. Remove only those
test records afterward through the SQL Editor. Do not run it on real clients.

On the configured test project/preview:

1. Sign in as your confirmed, allowlisted user. Create a fake $900 Redesign.
   Move through the statuses. Record a $450 deposit and confirm $450 remains.
   Record another $450, save `https://example.com/`, mark Completed, and check
   the Completed view and live-site link. Sign out/in and verify persistence.
   Reopen it and confirm payments, notes and tasks remain.
2. Try completion without a live URL, invalid/JavaScript URLs, a completion with
   an unpaid balance, corrected payment amounts, both package presets, repeated
   starter checklists, due dates, task completion, search and status filters.
   Check home totals, copied draft amounts, loading/error/empty states, and a
   narrow phone viewport. Double-click saves; check for just one row.
3. Confirm sign-out and token expiry clear all business details, and refreshing
   requires sign-in. Check browser storage for no stored Supabase session.
4. Create a second confirmed fake Auth user **without** an allowlist row.
   Sign-in must show access denied. Test the API directly with the project's
   publishable key, both without a user token and with this user's access token:
   GET/POST/PATCH each business table, and POST/PATCH/DELETE `admin_users`.
   Signed-out access must return permission errors; non-admin SELECT returns
   `[]` (RLS-filtered), INSERT fails, and UPDATE returns no changed rows.
   Neither can self-allowlist or see another admin's membership. Verify an
   allowed admin can read only its own allowlist row and cannot change members.
   Confirm the API cannot complete an order without a live URL. Delete fake
   users/records through the SQL Editor when finished.
5. Check `/`, `/demo/`, quote buttons, email links, and `/missing-page` through
   Wrangler (404 status). Confirm no public navigation points to the admin.

The PR describes checks performed against an isolated local PostgreSQL +
Supabase Auth + PostgREST stack. **That is not a test of your hosted Supabase
project or Cloudflare deployment.** Repeat this checklist after configuring
your project, especially signup settings, key selection, RLS, and mobile
behavior on the actual preview origin.
