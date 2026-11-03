# Fixam

Verified artisans in Yola, booked and paid through Fixam. Built with **Next.js** (App Router, TypeScript)
and **Supabase** (database, sign-in, file storage, server functions). Payments use **Paystack**;
approval emails use **Resend**.

Live site: **https://fixam-blond.vercel.app** (Vercel, deployed from this GitHub repository).
The site is exported as static files, so it also runs on Netlify or GitHub Pages.
Security does not depend on the website: every rule is enforced in the Supabase database.

## Pages

| Address | Who | What |
|---|---|---|
| `/` | everyone | Home: choose "I need an artisan" or "I am an artisan" |
| `/artisan-signup/` | artisans | 5-step sign-up with KYC (NIN, ID photo, face photo, guarantor, bank) and account |
| `/customer-signup/` | customers | Create a customer account |
| `/signin/` | everyone | Sign in, forgot password, new password from email link. After signing in (or out) you land on the home page, which has a button to your own area |
| `/password/` | signed in | Change password |
| `/account/` | artisans | Application progress, job requests (send price, start, finish), work posts |
| `/post/` | approved artisans | Post photos of finished work (reviewed by an admin) |
| `/customer/` | customers | Find artisans by area and service, book, pay with Paystack, confirm the job |
| `/admin/` | admins | Approve or reject KYC (emails the artisan), review posts, payouts and disputes |


## Replace everything on GitHub with this version

1. **Empty the repository.** Easiest: GitHub > your repository > **Settings** > scroll to the bottom >
   **Delete this repository**. Then **New repository** with the same name, left empty (no README).
   (Deleting and recreating keeps nothing old behind. Vercel must then be pointed at the new repository:
   see step 4.)
2. **Unzip `fixam-nextjs.zip`.** You get a folder named `fixam`. Open it: inside are `app`,
   `components`, `lib`, `public`, `supabase`, `.github`, `package.json` and the other files.
3. **Upload:** on the empty repository page click **"uploading an existing file"**, select **everything
   inside** the `fixam` folder (not the folder itself) and drag it in, then **Commit changes**.
   Check that `package.json` is at the top level of the repository, not inside a sub-folder.
   Hidden items (names starting with a dot, such as `.github` and `.gitignore`) are not needed for Vercel;
   if your computer hides them, the site still works.
4. **Vercel:** vercel.com > your project **fixam** > **Settings > Git**. If the repository was deleted and
   recreated, **Disconnect** and **Connect** it again to the new repository. Vercel then builds and
   publishes automatically every time you commit (about 1 minute). Check **Deployments**: the newest
   one should say **Ready**. If Vercel asks for settings: Framework **Next.js**, everything else default.

With Git instead of the browser:
```bash
git init
git add .
git commit -m "Fixam Next.js app"
git branch -M main
git remote add origin https://github.com/<your-username>/<repository>.git
git push -u origin main --force
```

## Connect the live site to Supabase, Paystack and Resend

**Supabase dashboard (project "fixam")**
1. **Authentication > URL Configuration**: Site URL = `https://fixam-blond.vercel.app`;
   Redirect URLs: add `https://fixam-blond.vercel.app/**`. Without this, confirmation and
   password-reset emails link to the wrong place.
2. **Edge Functions > Secrets**:
   | Name | Value |
   |---|---|
   | `SITE_URL` | `https://fixam-blond.vercel.app` (no slash at the end) |
   | `RESEND_API_KEY` | from resend.com > API Keys |
   | `EMAIL_FROM` | e.g. `Fixam <no-reply@yourdomain.com>` (domain verified in Resend) |
   | `PAYSTACK_SECRET_KEY` | Paystack > Settings > API Keys & Webhooks. Use `sk_test_...` while testing |
3. **Authentication > Emails > SMTP Settings**: connect your own email service (Resend's SMTP works).
   The built-in sender only sends a few emails per hour.

**Paystack dashboard**: Settings > API Keys & Webhooks > Webhook URL:
`https://lebhilkianueucxhjinm.supabase.co/functions/v1/paystack-webhook`

If the site address changes (new Vercel name or your own domain), update all three Supabase values above.

## Admins

`get2daniel01@gmail.com` is an admin. To add more, run in Supabase > SQL Editor:
```sql
select public.make_admin('staff@example.com');
```
It works before or after that person has an account. They sign in at `/signin/`; the home page then
shows a "Go to the admin page" button.

To set or reset a password without email, in Supabase > SQL Editor:
```sql
update auth.users
set encrypted_password = extensions.crypt('NewPassword123', extensions.gen_salt('bf')), updated_at = now()
where lower(email) = 'person@example.com';
```

## Run it on your computer

Needs Node.js 20 or newer.
```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # makes the "out" folder with the finished site
```
The Supabase address and public key are already in `lib/supabase.ts`. To use another Supabase
project, copy `.env.example` to `.env.local` and fill it in. Never put the `service_role` key in the app.

## Other hosts

- **Netlify:** New site > Import from GitHub. Build command `npm run build`, publish directory `out`.
- **GitHub Pages:** Settings > Pages > Source: **GitHub Actions**, then Actions tab >
  "Deploy to GitHub Pages" > **Run workflow**. The site appears at `https://<user>.github.io/<repository>/`.
  For a custom domain on Pages, add a repository variable (Settings > Secrets and variables > Actions >
  Variables) named `BASE_PATH` with the value `/`.

Whichever host you use, update the Supabase Site URL, Redirect URLs and `SITE_URL` secret to its address.

## Project layout

```
app/                    one folder per page (page.tsx + its component)
components/ui.tsx       header, sign-out, notices, "must be signed in" check
lib/supabase.ts         Supabase connection
lib/common.ts           areas, trades, routes, formatting, error messages
supabase/schema.sql     full database: tables, rules, functions, storage (already applied to project "fixam")
supabase/functions/     server functions (already deployed): send-kyc-email, paystack-init,
                        paystack-verify, paystack-webhook
.github/workflows/      optional GitHub Pages deploy (runs only when started by hand)
```

To set up a **new** Supabase project from scratch: run `supabase/schema.sql` in its SQL Editor, then deploy
the functions with the Supabase CLI (`supabase functions deploy <name>`; add `--no-verify-jwt` for
`paystack-webhook`), and add the secrets above.

## Money flow

- Customers pay the full price into Fixam's Paystack account. Fixam's fee is **10%** (placeholder):
  change it in `supabase/schema.sql` (`fixam_commission_percent`) and run that function again.
- **Payouts to artisans are manual**: the admin Bookings tab lists payouts due with bank details.
- **Refunds are manual**: refund in the Paystack dashboard, then record it on the dispute.

## Not built yet

SMS or phone verification, automatic NIN lookup, ratings and reviews, in-app chat, GPS location
(areas are by name), automatic payouts, and bot protection (add a CAPTCHA before a public launch).
