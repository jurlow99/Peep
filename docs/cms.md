# CMS — Content Management

The CMS is accessible at `/admin`. It requires an admin account (`profiles.role = 'admin'` in the `profiles` table).

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

## Admin navigation

| Section | Tools |
|---|---|
| Content | Add VOD, movies, series, episodes, podcasts |
| Curation | Screens, hero banner and rows, including Continue Watching |
| Live TV | Channels and schedules, feeds, multiview packages, predictions |
| Partners | Content partners, submission review, creator streams, streaming applications |
| Audience | Users, support, content reports |
| Monetization | Ads and performance, subscriptions, partner payouts |
| Reports | Live TV viewing, platform analytics |
| Platform | Settings and admin access, security, feature flags, audit log, planned tools |

Tools remain visible below the selected section. The location label follows
internal shortcuts too. Regional packages, resources and device management are
listed under **Platform → Planned tools** as unimplemented areas.

Create multiview packages in **Live TV → Multiview packages**, then choose them
for a row in **Curation → Screens & rows**. This navigation change does not alter
viewer content, permissions or backend configuration.

## Carousels
Home page and other pages are built from configurable carousels. Each carousel has:
- **Type** — category filter, featured, new releases, etc.
- **Content type** — movies, shows, all, etc.
- **Pages** — comma-separated list of pages the carousel appears on (e.g. `home,movies`)
- **Position** — display order

---

### Continue Watching

In **Curation → Screens & rows → Home → Add row**, choose **Continue Watching**
under **Type**. Set the title, movie/series filter, tier and visibility, then save.
Drag the row or use its arrows to set its position. This type currently supports
Home on browser and Apple TV; other screen placements are rejected on save.

The row uses each signed-in viewer's unfinished movies and episodes, newest
first. It hides when there is nothing to resume. Items must have over 10 seconds
watched, a known duration and less than 90% completion. Admin controls the row,
not the viewer's history. Apple TV no longer adds a separate automatic row;
add an enabled Continue Watching row to show it. Existing `type = 'continue'`
rows remain compatible. No schema change is needed.

## Ads
Manage VAST pre-roll ad tags. See [ads.md](ads.md) for full details.

---

## Admin Access
To grant admin access to an account: The Boss → Grant Access by Email.

## VOD library

Use **Content → Add VOD**: upload MP4, choose movie or episode, add details, then Save. The video attaches automatically. Create a series on the same screen or choose an existing one. Add next episode keeps the series selected. Original files and manual linking remain under the collapsed advanced library. See the [storage workflow](../db/storage/VOD.md).

## Hero background video

In **Curation → Screens & rows → Home → Home Hero → Background video**, choose an uploaded MP4 trailer or use **Upload video**. Preview it, then **Save hero changes**. It loops muted on browser and Apple TV for signed-in viewers; artwork remains the fallback. **Remove video from hero** clears the selection without deleting the file. This is separate from the movie/series Watch Trailer action.


## Series workspace

Open **Content → Series → Manage series**. The series stays selected while you:

- Filter episodes by season, inspect video/approval status, and preview protected
  playback using a temporary signed URL.
- Upload an episode inside the workspace. The series is locked in, season and next
  episode number are suggested, and Save attaches the uploaded MP4 automatically.
  Each series has its own upload draft; general Add VOD drafts remain separate.
- Edit episode details, regenerate actual snapshots, and set approval status.
- Update series metadata, poster, hero artwork, and access under **Details & artwork**.
  Metadata drafts persist in this tab's session storage where available; Save
  writes the changes. Uploaded artwork is not published to the series until Save.

The existing Movies/Series editors and Episodes section remain available. This
workspace does not delete media or change storage policies. Readiness means a
video URL is present and the episode is approved; it does not probe stream health
or prove playback on a viewer's device.
