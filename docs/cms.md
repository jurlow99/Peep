# CMS — Content Management

The CMS is accessible at `/admin`. It requires an admin account (`is_admin = true` in the `profiles` table).

## Content Types

### Movies
Add individual films. Fields: title, category, rating, year, duration, thumbnail, poster, video URL, trailer URL, description, tags.

### Shows + Episodes
Shows are the parent (e.g. "Breaking Bad"). Episodes belong to a show via `show_id`. Each episode has a season, episode number, title, video URL, and thumbnail.

### Music Videos
Individual music video entries. Fields: title, artist, URL, thumbnail, poster, year, duration, description, tags.

### Podcasts + Episodes
Podcasts are the parent (e.g. "The Joe Rogan Experience"). Episodes belong to a podcast via `podcast_id`. Audio URL stored in `audio_url`.

### Live TV
Live stream channels. Each channel has a stream URL, thumbnail, hero image, channel number, now airing / up next text, and an optional EPG (Electronic Program Guide) schedule.

### Music (Songs + Albums)
Individual songs and albums. Songs can belong to an album via `album_id`.

---

## Carousels
Home page and other pages are built from configurable carousels. Each carousel has:
- **Type** — category filter, featured, new releases, etc.
- **Content type** — movies, shows, all, etc.
- **Pages** — comma-separated list of pages the carousel appears on (e.g. `home,movies`)
- **Position** — display order

---

## Ads
Manage VAST pre-roll ad tags. See [ads.md](ads.md) for full details.

---

## Admin Access
To grant admin access to an account: The Boss → Grant Access by Email.
