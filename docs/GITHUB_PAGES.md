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

## What works on Pages

| Feature | Pages |
|---------|--------|
| Login / signup | Yes |
| Dashboard, map, routes (draw on map) | Yes |
| Driver **My Track** + phone GPS | Yes (writes to `driver_location_pings`) |
| Realtime map updates | Yes (Supabase) |
| Bulk SMS, driver invite, schedule notify API | No (needs a server — use local `npm run dev` or deploy to Vercel/Cloudflare) |
| USSD / IoT webhooks | Use Supabase Edge Functions (already deployed separately) |

## Local static preview

```bash
cp .env.example .env   # fill VITE_* keys
npm run build:pages
npx serve dist/client -l 4173
```

Open http://localhost:4173/tracksystem/ (base path matches production).

## Manual deploy

Push to `main`, or run **Actions → Deploy to GitHub Pages → Run workflow**.
