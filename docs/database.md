# Database Schema

Hosted on Supabase (PostgreSQL). All tables are in the `public` schema.

---

## Content

| Table | ID Type | Description |
|---|---|---|
| `videos` | uuid | Movies / standalone films |
| `shows` | bigint | TV show parent records |
| `episodes` | bigint | TV episodes, FK → shows |
| `music_videos` | bigint | Music video entries |
| `songs` | uuid | Individual songs |
| `albums` | uuid | Music albums |
| `podcasts` | bigint | Podcast parent records |
| `podcast_episodes` | bigint | Podcast episodes, FK → podcasts |
| `live_streams` | bigint | Live TV channels |

---

## Platform

| Table | Description |
|---|---|
| `carousels` | Home/browse page carousel configuration |
| `epg_entries` | Electronic program guide entries for live TV |
| `epg_channel_sources` | Imported EPG XML sources per channel |

---

## Users

| Table | Description |
|---|---|
| `profiles` | Auth user profiles (username, email, role, is_admin legacy) |
| `viewer_profiles` | Multiple viewer profiles per account |
| `subscriptions` | Stripe subscription records |
| `watch_progress` | Per-user watch position and duration for all content |
| `user_list` | User's saved/watchlist items |
| `ratings` | User content ratings (1–5) |

---

## Creators + Payouts

| Table | Description |
|---|---|
| `creators` | Creator records (name, email, payment info) |
| `content_creators` | Junction table — links creators to their content |
| `creator_payouts` | Monthly payout records per creator |

---

## Live TV

| Table | Description |
|---|---|
| `live_viewers` | Active viewer sessions per channel (for viewer count) |
| `live_chat` | Live chat messages per channel |
| `user_presence` | Active user page tracking |

---

## Ads

| Table | Description |
|---|---|
| `vast_tags` | VAST ad tag configuration |
| `ad_impressions` | Ad event log (impression, complete, skip, error) |

---

## Admin

| Table | Description |
|---|---|
| `app_settings` | Key/value store for platform settings |
| `promo_codes` | Promotional codes |
| `blocked_users` | Blocked account emails |
| `admin_login_attempts` | CMS login attempt log |

---

## Key Column Notes

- `watch_progress.content_id` is stored as **text** even though most content IDs are integers
- `podcasts.artwork_url` — not `thumbnail_url`
- `podcast_episodes.audio_url` — not `url`
- `carousels.pages` — comma-separated text (e.g. `home,movies`)
- `creator_payouts` has a unique constraint on `(creator_id, month)`
