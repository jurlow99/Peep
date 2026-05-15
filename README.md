# peep.

A full-stack streaming platform inspired by Hulu — built with React and Supabase. Supports movies, series with episodes, podcasts, live streams, per-profile watch history, and a built-in content management system.

**Live:** [peep-mocha.vercel.app](https://peep-mocha.vercel.app)

---

## Features

### Viewer Experience

- **Hero Banner** — Full-width featured content with autoplay trailer loop, title, description, rating badge, and match percentage. Fades to black at the bottom.
- **Card Hover Trailers** — Hovering a catalog card plays a muted trailer preview inline after a short delay, with a mute/unmute toggle.
- **Carousels** — Horizontally scrollable rows of content cards. Fully configurable from the CMS: title, content type (movies, series, episodes, podcasts, live, or custom), page placement, and sort order. Arrow navigation on desktop, touch-scroll on mobile.
- **Continue Watching** — Automatically surfaces in-progress content for the active profile. Clears when an item is marked complete.
- **My List** — Per-profile save/unsave toggle on any content card. Persisted in Supabase.
- **% Match** — Manually configured per-content affinity score shown on cards and detail pages.

### Content Types

| Type | Description |
|---|---|
| Movie | Standalone video with full player |
| Series | Show with seasons and episodes, each independently playable |
| Podcast | Audio series with individual episodes, position restore, and progress tracking |
| Live Stream | Embed URL-based live stream page |

### Show / Series Detail

- Season pill selector with watched/total episode counts
- Episode cards with thumbnail (192 × 108), title, duration, description, and inline progress bar
- Green checkmark on completed episodes; completed rows dim to 60% opacity
- "More Like This" tab using a content-based similarity algorithm (see below)
- Sticky tab bar (Episodes | More Like This) that stays visible while scrolling

### Podcast Detail & Player

- Episode list with thumbnail, title, duration, and listen progress
- Audio player with play/pause, seekable progress bar, time display, and volume control
- Restores playback position on re-open
- Marks complete when >92% listened or <30 seconds remain
- Progress stored per profile in `watch_progress`

### More Like This — Similarity Algorithm

Ranked by a weighted point system across all content in the catalog:

| Signal | Points |
|---|---|
| Same category | 40 |
| Each shared tag | 15 |
| Year within 5 | 10 |
| Year within 15 | 6 |
| Year within 30 | 2 |
| Same content rating | 8 |
| Score within 5 | 5 |
| Score within 15 | 3 |

Items with 0 points are excluded. Results capped at 12.

### Profiles

- Up to 5 viewer profiles per account
- 12 preset gradient + emoji avatars
- Per-profile watch history, My List, and Continue Watching
- Profile switcher accessible from the nav
- Active profile persisted in `localStorage`

### Admin CMS

Route: `/admin` (PIN-gated, default PIN: `1234`)

Manage all content without touching the database directly:

- **Movies** — upload or paste video URL, thumbnail, trailer URL, tags, category, year, rating, score, % match, description, enable/disable
- **Shows** — same fields as movies; episodes managed inline per show
- **Episodes** — number, title, duration (seconds), video URL, thumbnail URL, description; nested under their show
- **Podcasts** — title, description, thumbnail, link URL, category, tags, enabled
- **Podcast Episodes** — audio file upload to Supabase Storage (`podcast-audio` bucket), thumbnail upload (`podcast-thumbs` bucket), or paste URLs directly; episode number, title, duration, description
- **Carousels** — title, type, page(s), sort order, enable/disable; reorder via drag handles
- **Live Streams** — title, embed URL, description, enable/disable

---

## Tech Stack

| Layer | Tool |
|---|---|
| Frontend | React 19 + Vite |
| Backend / DB | Supabase (Postgres + Auth + Storage) |
| Routing | Manual `page` state (no router library) |
| Styling | 100% inline styles (no CSS files or modules) |
| Fonts | Space Grotesk, DM Serif Display (Google Fonts) |
| Deployment | Vercel (auto-deploy on push to `main`) |

---

## Project Structure

```
Peep/
├── peep/                   # Vite app root
│   ├── src/
│   │   ├── App.jsx         # Main app — all routing, all page components
│   │   ├── supabase.js     # Supabase client init
│   │   ├── components/
│   │   │   ├── CMS.jsx         # Full admin CMS UI
│   │   │   ├── AuthModal.jsx   # Sign in / sign up modal
│   │   │   ├── ProfileSelect.jsx  # "Who's watching?" screen
│   │   │   ├── ProfileScreen.jsx  # Profile settings side panel
│   │   │   └── ImageUploader.jsx  # Reusable upload-or-paste component
│   │   ├── pages/
│   │   │   ├── LandingPage.jsx    # Marketing landing page (logged-out)
│   │   │   ├── AdminPage.jsx      # PIN gate → CMS
│   │   │   └── AuthPages.jsx      # Standalone auth pages
│   │   └── lib/
│   │       ├── carouselUtils.js   # Carousel data fetching helpers
│   │       └── storageUtils.js    # Supabase Storage upload helpers
│   ├── index.html
│   └── package.json
└── README.md
```

---

## Database Schema

### `videos`
Stores movies and standalone video content.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| title | text | |
| description | text | |
| thumbnail_url | text | |
| video_url | text | |
| trailer_url | text | Card hover preview |
| category | text | e.g. "Drama", "Comedy" |
| tags | text[] | Used in similarity scoring |
| year | int | Release year |
| rating | text | e.g. "PG-13", "TV-MA" |
| score | numeric | 0–100 editorial score |
| match_pct | int | % Match shown on card |
| duration | int | Seconds |
| enabled | bool | Hidden when false |
| featured | bool | Eligible for hero banner |

### `shows`
Series containers (no video of their own).

Same columns as `videos` minus `video_url`/`duration`. Episodes are separate rows in `episodes`.

### `episodes`
Individual episodes belonging to a show.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| show_id | uuid | FK → shows |
| season | int | |
| episode_number | int | |
| title | text | |
| description | text | |
| thumbnail_url | text | |
| video_url | text | |
| duration | int | Seconds |

### `podcasts`
Podcast series.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| title | text | |
| description | text | |
| thumbnail_url | text | |
| link_url | text | External RSS/website fallback |
| category | text | |
| tags | text[] | |
| enabled | bool | |

### `podcast_episodes`
Individual podcast episodes with audio.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| podcast_id | uuid | FK → podcasts |
| episode_number | int | |
| title | text | |
| description | text | |
| audio_url | text | Supabase Storage or external |
| thumbnail_url | text | |
| duration | int | Seconds |

### `carousels`
Defines homepage/browse rows.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| title | text | Row heading |
| type | text | `movie`, `show`, `episode`, `podcast`, `live`, `my_list`, `continue_watching`, `custom` |
| pages | text[] | e.g. `["home", "movies"]` |
| sort_order | int | Display order |
| enabled | bool | |
| video_ids | uuid[] | For `custom` type |

### `watch_progress`
Tracks playback position per profile per content item.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK → auth.users |
| profile_id | uuid | FK → viewer_profiles |
| content_id | uuid | FK → videos / episodes / podcast_episodes |
| content_type | text | `movie`, `episode`, `podcast_episode` |
| progress_seconds | int | |
| duration_seconds | int | |
| completed | bool | |
| last_watched_at | timestamptz | |

Unique constraint: `(user_id, profile_id, content_id, content_type)`

### `user_list`
My List entries.

| Column | Type | Notes |
|---|---|---|
| user_id | uuid | |
| profile_id | uuid | |
| content_id | uuid | |
| content_type | text | |

### `viewer_profiles`
Sub-profiles per account.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK → auth.users |
| name | text | |
| avatar_id | text | e.g. `"a1"` – `"a12"` |
| created_at | timestamptz | |

### `live_streams`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| title | text | |
| description | text | |
| embed_url | text | iframe src |
| enabled | bool | |

### `ratings`
User star ratings (1–5) per content item.
| Column | Type |
|---|---|
| user_id | uuid |
| content_id | uuid |
| rating | int |

---

## Local Development

### Prerequisites

- Node.js 18+
- A Supabase project (free tier works)

### Setup

```bash
git clone https://github.com/your-username/peep.git
cd peep/peep
npm install
```

Create `peep/src/supabase.js` with your project credentials:

```js
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://YOUR_PROJECT.supabase.co",
  "YOUR_ANON_KEY"
);
```

```bash
npm run dev
# → http://localhost:5173
```

### Supabase Storage Buckets

Create two public buckets in your Supabase project:

| Bucket | Used for |
|---|---|
| `podcast-audio` | Podcast episode audio files |
| `podcast-thumbs` | Podcast episode thumbnails |

Any bucket used for video/image uploads in the CMS should also be set to **public**.

### Database

Run the table definitions above in the Supabase SQL editor. Enable Row Level Security on all tables and add policies appropriate for your auth setup. At minimum:

- `watch_progress` — users can read/write their own rows (`user_id = auth.uid()`)
- `user_list` — same
- `viewer_profiles` — same
- All content tables (`videos`, `shows`, etc.) — public read, no public write

---

## Deployment

The app deploys automatically to [Vercel](https://vercel.com) on push to `main`.

**Build settings:**
- Framework preset: Vite
- Root directory: `peep`
- Build command: `npm run build`
- Output directory: `dist`

Set your Supabase URL and anon key as environment variables in Vercel if you move them out of source (recommended for production).

---

## Admin CMS

Navigate to `/admin` and enter the PIN (default: `1234`).

Change the PIN by editing `ADMIN_PIN` in [peep/src/pages/AdminPage.jsx](peep/src/pages/AdminPage.jsx).

From the CMS you can:

1. Add, edit, and delete all content
2. Upload media directly to Supabase Storage or paste external URLs
3. Configure carousels — which rows appear on which pages, in what order
4. Enable/disable any item without deleting it
5. Manage podcast episodes with audio uploads

---

## Brand

- **Primary color:** `#facc15` (yellow)
- **Background:** `#0a0a0a`
- **Fonts:** DM Serif Display (logo/headings) + Space Grotesk (UI)
- **Logo:** `peep.` in DM Serif Display

---

## License

Private project — not open for redistribution.
