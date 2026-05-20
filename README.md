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

Create a `.env` file in the `peep/` directory:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

**3. Start the dev server**
```bash
npm run dev
```

## Deployment

Deployed automatically to Cloudflare Pages on every push to `main`.
