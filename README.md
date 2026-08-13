# Peep

A streaming platform for movies, TV shows, music videos, podcasts, and live TV. Built for independent content creators with a built-in revenue share system.

## Tech Stack

- **Frontend** — React + Vite
- **Backend/Database** — Supabase (PostgreSQL)
- **Hosting** — Cloudflare Pages
- **Payments** — Stripe
- **Ads** — VAST/IMA pre-roll ad serving

## Running Locally

**1. Install dependencies**
```bash
cd peep
npm install
```

**2. Set up environment variables**

```bash
cp .env.example .env.local
```

Then fill in the values. `.env.local` is gitignored, so it does **not** sync
between machines — each machine needs it set up by hand, and pointing one
machine at dev while another sits on prod is the usual cause of "it works on
my other computer."

Point it at the **dev** Supabase project for local work. A purple `DEV` badge
appears bottom-left whenever you're on a non-prod database. **No badge means
you're on the real production database.**

**3. Start the dev server**
```bash
npm run dev
```

- App — http://localhost:5173
- Admin — http://localhost:5173/admin

In production the admin is served from `admin.watchpeep.tv` instead; the
`/admin` path only works on localhost.

## Deployment

Deployed automatically to Cloudflare Pages on every push to `main`.

## Project structure

| Path | Purpose |
|------|---------|
| `peep/` | **Canonical frontend** — run all npm commands here |
| `supabase/` | Edge functions + SQL migrations |
| `docs/` | Product and ops documentation |

> **Note:** A legacy `src/` at the repo root was removed. All frontend code lives in `peep/src/`.

## Documentation

Full docs are in the [`/docs`](docs/) folder — CMS, creator system, revenue share, ads, database schema, [security](docs/SECURITY.md).
