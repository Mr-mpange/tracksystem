# Live demo on GitHub Pages

**URL:** https://mr-mpange.github.io/tracksystem/

Every push to `main` deploys automatically via `.github/workflows/deploy-pages.yml`.

## One-time setup

### 1. Enable GitHub Pages

1. Open **Settings → Pages** on `Mr-mpange/tracksystem`
2. **Build and deployment → Source:** choose **GitHub Actions**

### 2. Supabase auth redirect

**Supabase → Authentication → URL configuration**

Add to **Redirect URLs**:

```
https://mr-mpange.github.io/tracksystem/**
```

Set **Site URL** (optional) to the same Pages URL for email links.

### 3. Run DB migrations

Apply all files under `supabase/migrations/` in the Supabase SQL editor (if not done already).

## Deploy Edge Functions (required for invite / SMS on Pages)

GitHub Pages has **no** `/api/*` server. Admin actions call Supabase Edge Functions instead.

From the project folder (with [Supabase CLI](https://supabase.com/docs/guides/cli) logged in):

```bash
supabase functions deploy invite-driver --project-ref bogcdyhtwgzlrbsswoxf
supabase functions deploy sms-bulk --project-ref bogcdyhtwgzlrbsswoxf
supabase functions deploy schedule-notify --project-ref bogcdyhtwgzlrbsswoxf
```

**Edge Function secrets** (Supabase Dashboard → Edge Functions → Secrets, or CLI):

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (often auto-injected)
- `AT_API_KEY`, `AT_USERNAME` (use `sandbox` + sandbox API key for testing)
- `sms-test` and `sms-bulk` edge functions (deploy after changing secrets)
- `AT_FROM_SHORTCODE`, `AT_USSD_CODE` (optional)

## What works on Pages

| Feature | Pages |
|---------|--------|
| Login / signup | Yes |
| Dashboard, map, routes (draw on map) | Yes |
| Driver **My Track** + phone GPS | Yes (writes to `driver_location_pings`) |
| Realtime map updates | Yes (Supabase) |
| Driver invite, bulk SMS, schedule SMS | Yes **after** Edge Functions above are deployed |
| USSD webhook | `supabase functions deploy ussd` |

## Local static preview

```bash
cp .env.example .env   # fill VITE_* keys
npm run build:pages
npx serve dist/client -l 4173
```

Open http://localhost:4173/tracksystem/ (base path matches production).

## Manual deploy

Push to `main`, or run **Actions → Deploy to GitHub Pages → Run workflow**.
