# VOD storage

For the new private Cloudflare R2 option, see [R2 VOD setup](R2.md). The
50 MiB limits below apply to Supabase Storage, not direct R2 uploads.

Configured October 27, 2026 in FARRIS development (`cuwdyedmmnpklufduaho`).
Production and existing catalog/media URLs were not changed. SQL bootstrap:
[`vod-sources.sql`](vod-sources.sql), applied using `execute_sql` (not a migration
history entry). Apply only once; policy names are intentionally not replaced.

## Add VOD — upload first

**Content → Add VOD**:

1. Choose a finished MP4. Upload starts immediately into a private inbox.
2. Choose **Movie** or **Episode** and add its details. Episodes can use an
   existing series or create one here. Movies and new series require a poster.
3. **Save movie/episode** creates the catalog record and attaches the video
   automatically. Episodes saved by an admin are approved. The separate manual
   Episodes editor still follows its existing approval behavior.

Details can be filled in while the file is still transferring; Save unlocks once the
upload lands. The upload card shows size, resolution, runtime (read from the file and
prefilled), progress with time left, Pause and Cancel, and a local preview whose
paused frame can be used as the thumbnail. Choosing an existing series lists what
that season already has, suggests the next number and blocks duplicates before Save.
Movies also take rating, tags and a trailer URL; a series created here takes
description, category, year, rating and tags (`vod-upload-details.sql`, applied to
FARRIS dev on 2026-10-31 with `execute_sql`). The saved screen offers Preview
playback and jumps to the series workspace or the Movies list.

**Add next episode** keeps the series and increments the episode number. Add
movies/series to rows separately under Curation when ready to feature them.
New movies/series default to the existing all-eligible-users visibility; test-only
and subscription settings are available under **Thumbnail & access**. Existing
series retain their own access settings.

A real episode snapshot is captured from the local video where supported. Five
positions (8–40% through the video) are sampled; black, white and flat frames are
rejected, and the most detailed usable frame is exported as JPEG (up to 1280 px
wide). No generated artwork is used. If all samples fail, manual upload remains
available. The Episodes editor also provides **Regenerate from episode**, using
a fresh authorized video URL. That action updates the draft; Save keeps it.
External hosts must permit cross-origin frame capture. Existing thumbnails are
not replaced automatically. Sources, trailers and separate Home hero promotion remain optional.
There is no transcoding: the MP4 must already be playback-compatible.

The upload uses `vod-playback/inbox/<UUID>/playback/<version>-<filename>.mp4`.
Catalog records are created only on Save. Existing catalog-reference RLS permits
viewer signing only after an eligible title references the file. Saving uses an
admin-only, security-invoker transaction (`save_uploaded_vod`) to create a series
and episode together, reject duplicate episode numbers, and make retrying the
same uploaded file idempotent. No service-role key is used in the browser.

Completed uploads and form details are retained in this browser tab's session
storage until Save, including across reloads when browser storage is available.
**New upload** parks the current draft under **Unfinished uploads**, so another
file can be added without deleting the previous video or losing its details.
Choose **Resume** to return to a parked draft. Save remains in a sticky footer.
An interrupted upload can resume while the page is open; unfinished uploads do
not resume across reloads. Unused uploaded files are retained privately, without
an automatic deletion job. Keep the tab open while uploading. The 50 MiB limit
still applies. `vod-upload-first.sql` was applied to FARRIS dev only using
`execute_sql`, not migration history; its canonical URL is environment-specific.

## Buckets and layout

Both VOD buckets are **private**. `promo-images` remains the separate public
artwork bucket with its existing policies. No originals are stored there.

```
vod-sources/
  inbox/<upload-group-uuid>/<asset-type>/<version>-<filename>
  movies/<videos.id>/<asset-type>/<version>-<filename>
  series/<shows.id>/<asset-type>/<version>-<filename>
  series/<shows.id>/episodes/<episodes.id>/<asset-type>/<version>-<filename>

vod-playback/
  inbox/<upload-uuid>/playback/<version>-<filename>.mp4
  movies/<videos.id>/playback/<version>-<filename>.mp4
  series/<shows.id>/episodes/<episodes.id>/playback/<version>-<filename>.mp4
```

Source asset types: `masters`, `trailers`, `artwork`, `captions`. A series master
requires an episode selection; series-level trailers/artwork/captions are allowed.
Folders are object-key prefixes and appear in Studio after the first upload.
There are no fake folder rows in `storage.objects`.

## Advanced workflow for existing catalog records

**Content → Add VOD → Advanced media library & original files**:

1. Choose **Originals & supporting files** for private originals, or **Finished
   playback** for an encoded movie/episode MP4.
2. Choose a movie or a series/episode and asset type. Unlinked source assets can
   go into Inbox. Catalog records remain in `videos`, `shows` and `episodes`.
3. Select a file and upload. New versioned names preserve previous files.
4. Use **Get private preview** for a temporary five-minute admin URL.
5. For a finished MP4, **Use for playback** explicitly replaces the selected
   title's `url` with a durable authenticated Storage reference. Uploading alone
   never changes playback or creates/publishes a catalog record.

Existing files in a legacy `content` bucket can still use the legacy importer
below the private library. That bucket does not currently exist in FARRIS dev.
The old `peep-media` creator uploader is not redirected into this admin library.
Creator access needs its own review/ownership workflow.

## Protection and playback

- Only authenticated admins (`peep_private.is_admin()`) can upload sources.
  Viewers can read only the MP4 trailer referenced by an enabled Home hero; all
  other source files remain admin-only.
- Only admins can upload finished MP4s. Viewers can sign only files referenced by
  a movie or episode that its existing catalog RLS permits them to read.
- Catalog RLS retains tier, premium and approved-episode/parent-show rules.
- No anonymous access and no client UPDATE/DELETE policies. Replacement uploads
  use fresh names; old files/links are retained.
- Browser `AvailablePlayerView` and Apple TV `PlaybackView` request a fresh
  six-hour signed URL before creating their media player. Signing failure blocks
  playback; existing external HLS/MP4 URLs continue unchanged.
- Expiring signed URLs are never saved to catalog records. Signing is performed
  with the current viewer's JWT; no service-role credential is used by clients.
- A signed URL is a bearer link until expiry. This is signed URL protection, not
  DRM; changing entitlements does not revoke already issued links immediately.
- Private trailers can now be chosen as the Home hero background through the
  editor. Other source captions/artwork remain archival/supporting assets, not
  automatically published. Public promo artwork uses its existing uploader.

## Formats and limits

- Finished playback: H.264 video + AAC audio in MP4. No automatic transcoding or
  adaptive HLS generation is supplied by Supabase Storage.
- Sources: MP4/MOV/WebM/MKV, JPG/PNG/WebP, VTT/SRT, subject to MIME restrictions.
- Both buckets have a **50 MiB ceiling**, matching the observed Free plan. The
  project global limit can be lower and always wins. Larger VOD files need a
  higher plan/global limit and matching bucket/client limits. This work
  does not upgrade the plan or change billing/global Storage settings. Verify
  Storage → Settings before uploading full-length files.
- Admin uses the existing TUS dependency with 6 MiB chunks, refreshed credentials,
  network retries, progress and pause/resume while the page remains open. Leaving
  the screen pauses/abandons that UI upload; cross-reload resume is not implemented.
- Admin file browsing is paginated and scans all title/episode folder levels.

Sources: [private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals),
[resumable uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads),
[file limits](https://supabase.com/docs/guides/storage/uploads/file-limits).


## Verification

- Hosted bucket metadata verified private, 50 MiB limit, expected MIME types.
- `storage.objects` RLS verified enabled; admin helper validated under an
  authenticated admin role in a rolled-back transaction.
- Anonymous HTTP upload rejected by Storage with status `403` (HTTP 400 wrapper).
- Security advisors show no new storage finding; existing unrelated findings
  remain unchanged.
- Browser tests cover folder safety, pagination, original-upload behavior,
  signing denial and external URL compatibility. Apple TV tests cover guest
  rejection, signing requests, URL parsing and denied playback.
- No VOD media/catalog rows were created by these verification checks. A real
  encoded file still needs upload/link/playback testing on the target devices;
  unit tests and simulator builds do not prove that end-to-end media delivery.


## Home hero background video

In **Curation → Screens & rows → Home → Home Hero**, use **Background video**
to choose an existing private MP4 trailer or upload one directly. A new upload
uses `vod-sources/inbox/<UUID>/trailers/<version>-<filename>.mp4`. Masters and
non-MP4 source files are not offered in this picker. Uploading/selection changes
only the draft; **Save hero changes** publishes it. **Remove video from hero**
clears the draft reference without deleting the underlying file.

The preview uses a five-minute admin-signed URL. Viewer clients use one-hour
signed links, renewed every 30 minutes while mounted. Storage RLS grants
`authenticated` access only to the exact `video_url` of an enabled `home_hero`,
with a trailer-folder/MP4 restriction. Guests see the artwork fallback. Source
bucket/public settings are unchanged. Previously issued links remain valid
until expiry even if the hero is disabled or changed.

Browser and Apple TV loop the selected video muted, with artwork underneath
until video plays and on authorization/playback failure. Reduced-motion and
inactive/background states suppress the decorative loop. The hero background
is distinct from a title's Watch Trailer action; that field/workflow is unchanged.

Schema source: `hero-video.sql`, applied to FARRIS dev using `execute_sql`.
Admin UI verified the existing uploaded trailer can be selected and played via
its signed preview; the draft was restored without publishing. Policy predicate
checks cover enabled/disabled heroes, invalid JSON and master-file rejection.
Physical Apple TV rendering of a published private hero remains unverified.

## IMDb link metadata import

Movie, series and episode editors include an optional **IMDb link** field. Paste
an IMDb title URL or `tt…` ID and choose **Find details**. Review the result, then
**Fill empty fields** or **Replace matching fields**. Nothing is saved until the
normal form Save action. Playback URLs, artwork, premium/access settings and
category are never changed by this importer. Runtime is imported for movies and
episodes; the series schema has no duration field. An episode IMDb link must
identify that episode, not its parent series.

The admin-only `title-metadata` Edge Function resolves IMDb IDs through TMDB's
`/find` API and fetches that record's details. It requires the server secret
`TMDB_READ_ACCESS_TOKEN`; never put the token in a Vite environment variable or
`app_settings`. Without it the editor displays a setup message. It does not
scrape IMDb or download artwork. Confirm commercial data-use terms and required
TMDB attribution before enabling it for Peep. An API credential alone is not a
commercial-use agreement. Provider activation/live lookup remains pending.

References: [TMDB external IDs](https://developer.themoviedb.org/docs/finding-data),
[TMDB commercial use](https://developer.themoviedb.org/docs/faq),
[Supabase server secrets](https://supabase.com/docs/guides/functions/secrets).

New R2 uploads are grouped by content provider and delivery ID. Choose the
provider in Add VOD before selecting a file. See [R2 structure](R2.md#provider-organization-for-new-uploads). Existing files stay in place.

## Provider Deliveries (FARRIS dev)

1. Admin adds a partner in **Partners → Content partners**.
2. Provider creates a normal Peep account. In **Partners → Provider deliveries →
   Provider access**, admin finds the existing account by its full email address and grants it
   access to the provider. Share the site's `/deliveries` link after access is
   granted. This does not grant admin or bucket access. Access can be revoked.
3. Provider creates a delivery, saves title/episode details and rights notes, and
   uploads the finished MP4 and poster. Optional hero, trailer and WebVTT files
   can accompany the submission. Files go directly into private R2.
4. **Submit for review** locks edits. Admin previews files, checks rights and
   either requests changes with a note or approves. Approval alone creates no
   viewer catalog entry.
5. Admin explicitly **Publishes to catalog**. The video remains private and uses
   authorized playback. The poster is copied to public promo artwork on publish.
   Publication is idempotent by delivery. Episodes use the provider-owned series
   selected in their delivery; publish a new series before its episodes. Duplicate
   episode numbers stop publication. Curation can
   then place the movie or series in a row.

Provider files use `providers/{provider-id}/deliveries/{delivery-id}/{asset-role}/`.
Admin-managed uploads and existing files continue to work.

This first version takes finished MP4s; it does **not** transcode, inspect codecs,
package HLS, or automatically enforce geographic or contractual date restrictions.
Rights, territories, availability and payment terms must be reviewed against the
agreement before publication. Publish currently creates free-access catalog
content; premium access can be set in the normal content editor. Optional hero,
trailer and caption files are private delivery attachments for review; they are
not automatically installed into viewer hero/trailer/subtitle settings.

Private sources remain private. Uploads cannot write catalog rows, forge upload
verification, assign themselves provider access, or approve themselves. Provider
membership and delivery status are checked server-side on each operation.
Existing signed part URLs can remain usable for up to 15 minutes after access
revocation; preview URLs expire after 15 minutes. Revocation blocks new URLs and
completion. Incomplete multipart uploads expire through the R2 lifecycle rule.

Deployment: `provider-deliveries.sql` follows `r2-vod.sql`. It adds membership,
delivery records, private asset associations and an approval gate on catalog save.
No production database changes or provider account grants were made during setup.

### Delivery types

Providers choose **Movie / single VOD**, **New series**, **Series episode**, or
**Trailer** before creating a draft.

- Movies require a finished MP4, poster and rights notes.
- A new series requires its series poster and rights notes. **Add episode**
  creates separate episode drafts grouped under that series delivery. Episodes
  are reviewed separately; publish the series before its episodes.
- Episodes select an existing provider-owned series or a series delivery from
  the picker, plus season and episode number. Text-title matching is no longer
  used for new episode submissions.
- A standalone trailer requires its trailer MP4 and rights notes. It can be sent
  before choosing a movie/series; admin attaches it to provider-owned published
  content when publishing. It does not create a separate movie in browse rows.

Admin publication records provider ownership in `content_creators`, so future
series/target pickers show the provider's catalog. Existing admin-managed content
can be linked to a partner using the existing content-partner assignment tools.
Publication is transactional and idempotent by delivery, and providers cannot
publish or attach files to another provider's catalog. Apply
`provider-delivery-types.sql` after `provider-deliveries.sql`.

Episodes do not require a separate portrait poster. The selected series supplies
its poster. Providers may upload an optional **Episode thumbnail** (16:9,
1280 × 720 preferred) under Extra files; publication applies it to the episode's
thumbnail, without replacing the series poster. Existing episode artwork files
are retained. Movies and new series still require their own posters.
