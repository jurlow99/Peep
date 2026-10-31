# Peep Admin Guide

This guide covers everything you need to manage the Peep platform as an admin. It assumes you have been given an account with admin access.

---

## Getting In

1. Go to **watchpeep.tv/admin**
2. Sign in with your email and password
3. You'll land directly in the CMS dashboard

To sign out, click **Log Out** in the top-right corner of the CMS. This signs out the current browser session only; Apple TV and other devices stay signed in. Apple TV automatically renews rejected playback credentials once. If renewal is revoked, it opens sign-in directly; temporary network failures keep the saved session.

---

## Dashboard Overview

The CMS has 8 tabs across the top:

| Tab | What you do here |
|-----|-----------------|
| **Content** | Manage all movies, shows, episodes, podcasts, music, and carousels |
| **Live** | Manage live TV channels |
| **Creators** | Invite creators, review uploaded episodes, manage payouts |
| **Members** | View users, subscriptions, and handle support requests |
| **Analytics** | Monitor watch stats, revenue, and ad performance |
| **Storage** | Review uploaded video files |
| **Settings** | Control app-wide settings, promo codes, maintenance mode |
| **Security** | Monitor login attempts and manage blocked accounts |

---

## Content Tab

This is where all video content lives. Use the sub-tabs to navigate:

- **Movies** — standalone films
- **Series** — TV shows (just the show itself, no episodes here)
- **Episodes** — individual episodes linked to a series
- **Podcasts** — podcast shows and their episodes
- **Music** — music videos, songs, and albums
- **Carousels** — the rows that appear on the home screen (e.g. "Horror", "Trending")

### Adding a Movie
1. Go to **Content → Movies**
2. Click **+ Add Movie**
3. Fill in title, description, category, rating, year, and paste the video URL
4. Upload a thumbnail and poster image
5. Click **Save**

### Adding a Series + Episodes
1. Go to **Content → Series**, click **+ Add Series**, fill in details, save
2. Go to **Content → Episodes**, select the series from the dropdown
3. Click **+ Add Episode**, fill in season/episode number, title, URL, save

### Editing or Deleting Content
- Click any row in the list to open the edit panel
- To delete, click the trash icon — you'll be asked to confirm

### Carousels
Carousels control what rows appear on the home screen and in what order.
- **Type: Category** — automatically shows content matching a genre (e.g. "Horror")
- **Type: Trending** — shows most-watched content
- **Type: Custom** — you hand-pick exactly which titles appear
- The **Position** number controls the order (lower = higher on the page)
- Toggle **Enabled** to show or hide a row without deleting it

---

## Live Tab

Manage live TV channels. Each channel has:
- A stream URL (HLS `.m3u8` link)
- A channel number, thumbnail, and badge text (e.g. "LIVE")
- An **EPG** (programme guide) — schedule what's airing and up next

### Adding a Channel
1. Click **+ Add Stream**
2. Fill in title, stream URL, channel number, thumbnail
3. Toggle **Is Live** on
4. Save

### Testing Channels
Use the **Test All Channels** button to check which streams are currently online. A green dot means live, red means down.

---

## Creators Tab

This is where you manage creator partners — people who upload content and earn a share of revenue.

### Inviting a Creator
1. Go to **Creators → Creators**
2. Click **+ Add Creator**
3. Enter their name and email
4. Fill in their payment method (PayPal email or bank details)
5. Click **Add Creator** — they'll receive an invite email with a link to set their password

Once they click the link and set a password, they'll log in at **watchpeep.tv** and land directly on their Creator Dashboard.

### Linking Content to a Creator
After adding a creator, open them by clicking their row.
- Scroll to **Linked Content**
- Use the dropdown to link their shows, movies, or podcasts
- This is how watch time gets attributed to them for payouts

### Resending an Invite
If a creator didn't receive their email or lost the link:
1. Open the creator record
2. Click **↺ Resend Invite** at the bottom of the modal

### Review Queue
When a creator uploads an episode, it sits in **Pending Review** before going live.

1. Go to **Creators → Review Queue**
2. You'll see all pending episodes with a video preview
3. Click **Approve** to make it live — the creator gets an email confirmation
4. Click **Reject** to decline — you'll be prompted to write a note explaining why, and the creator gets notified

A red badge on the Creators tab shows how many episodes are waiting for review.

### Payouts
1. Go to **Creators → Payouts**
2. Select the month you want to process
3. Click **↓ From Stripe** to pull the actual revenue for that month from Stripe
4. The system calculates each creator's share based on their watch time percentage
5. Click **Mark Paid** once you've sent payment — this records the date and notifies the creator
6. Note: creators need at least **$10** to be eligible for payout

---

## Members Tab

### Users
A list of all registered accounts. You can:
- Search by email
- View when they signed up
- Delete an account if needed (requires confirmation)

### Subscriptions
A list of all active and cancelled subscriptions pulled from Stripe.
- Filter by status (active, cancelled, past due)
- Sort by date, email, or amount
- Revoke a subscription manually if needed

### Support
Use this to look up a specific user and take action on their account:
1. Search by email
2. Click the user to see their subscription status, profiles, and watch history
3. Available actions:
   - **Grant Access** — manually give them a subscription (e.g. for a promo or error)
   - **Revoke Access** — remove their subscription
   - **Reset Password** — send them a password reset email
   - **Delete Account** — permanently remove the account

---

## Analytics Tab

### Reports
Shows platform-wide stats:
- Active users right now (live, updates every minute)
- Watch time by content
- Sign-ups over time
- Revenue summary

### Ads
Monetization → Ads is one page in three parts (full detail in `ads.md`):
- **Ad rules** — on/off for everything, minimum minutes between entry ads, Live TV entry ads, mid-roll timing (browser), post-roll (browser). Apply to the website and Apple TV.
- **Tags** — one full page per VAST tag: name, URL, test flag, position (pre/mid/post), what it applies to (all, movies, episodes, live channels, multiview, or one exact title picked by name), which players, and a **Play this tag** check that runs the ad right in admin.
- **Delivery, last 30 days** — ads shown, viewers, completion, fill, by player and by position. Test delivery is hidden unless you tick "Include test delivery".

---

## Settings Tab

### App Settings
- **Maintenance Mode** — toggle this to take the site offline for all users (they see a "We'll be right back" screen). Turn it off to bring the site back up.
- **Banner** — show a site-wide announcement banner. Set the text and an expiry date.

### Promo Codes
Create discount codes for new subscribers:
1. Click **+ Add Promo**
2. Enter a name and code (e.g. `LAUNCH50`)
3. The code can be shared and entered during signup

### Todos & Goals
An internal notepad for tracking tasks and revenue goals. Only visible to admins.

---

## Security Tab

### Login Attempts
A log of all failed login attempts at `/admin`. If you see a burst of attempts from the same IP, someone is trying to brute-force access.

### Blocked Users
- Add an email to block a user from signing in entirely
- Blocked users are stopped at the auth check even if their account exists

### Lockout Settings
Configure how many failed login attempts trigger a lockout and for how long.

---

## Common Tasks — Quick Reference

| Task | Where |
|------|-------|
| Add a new movie | Content → Movies → + Add Movie |
| Add a new show + episodes | Content → Series, then Content → Episodes |
| Invite a creator | Creators → Creators → + Add Creator |
| Review a creator's upload | Creators → Review Queue |
| Process monthly payouts | Creators → Payouts |
| Look up a user | Members → Support |
| Grant someone free access | Members → Support → search user → Grant Access |
| Put the site in maintenance | Settings → Maintenance Mode |
| Block an account | Security → Blocked Users |
| Check who's watching right now | Analytics → Reports |

---

## Tips

- **Always link content to creators before processing payouts** — unlinked content won't count toward their share
- **Approve or reject episodes promptly** — creators can see the pending status on their dashboard and are waiting
- **Test channels regularly** — stream URLs go dead without warning
- **Back up promo codes somewhere** — they're not exported anywhere automatically

### Provider deliveries

Open **Partners → Provider deliveries** to find an existing Peep account by email and grant it access
to its provider, review submissions, request corrections, approve, and explicitly
publish. Providers use `/deliveries` on the same web host after signing in.
Create the provider under Content partners first. Uploading and approving do not
publish. See [the delivery workflow](../db/storage/VOD.md#provider-deliveries-farris-dev)
for limits, rights review and publication behavior.

### Dev-only email confirmation testing

With explicit owner approval, **Confirm email** is disabled in FARRIS dev
(`cuwdyedmmnpklufduaho`) for test account signup. Saved and verified in Supabase
Authentication → Sign In / Providers. Production was not changed. Re-enable
Confirm email here when testing ends. Accounts created before the change may
still need confirmation separately; the app verification gate remains intact.
Use reserved test addresses such as `provider@example.com`, rather than an
invented address that could belong to a real person.

To assign an existing series, open **Partners → Provider deliveries → Provider
series**, choose the provider and series, then **Assign series**. The provider can
select it in episode deliveries after reloading their portal. Assignments reuse
content-partner links and therefore also affect partner content reporting and
revenue allocation; they do not transfer bucket access or change viewer access.

Delivery drafts and drafts with requested changes have **Delete draft** in the
editor footer. This moves them into **Trash**, where **Restore draft** brings
them back. Uploads remain in private R2. Submitted, approved and published
content cannot be removed with this draft action. Delete child episode drafts
before their series; restore the series before restoring its episodes.

### Series playback

In **Content → Series → Edit**, **Allow next-episode autoplay** controls whether that series can advance automatically on Apple TV and web. The viewer can always disable autoplay in playback settings. A next-episode prompt appears after the episode finishes, with a 10-second countdown when autoplay is allowed. Cancel stops automatic advancement; Play next remains available. Episode ordering follows season and episode number, skips unavailable video URLs, and does not wrap back to the beginning.

Apple TV episode cards show Resume, watched badges, and progress for the signed-in account. The main play button resumes unfinished episodes in the selected season. Progress currently belongs to the account, rather than individual viewer profiles.

FARRIS dev has the `shows.autoplay_next` setting; apply `db/storage/series-playback.sql` before deploying this admin feature to another database.

### Readiness, placements, and previews

**Content → Movies / Series** now shows asset readiness and the audience setting beside each title. **Assets ready** means the required poster and video reference (or at least one approved episode with a video reference) are present. It does not certify encoding, stream health, distribution rights, or availability to every viewer. **Check episodes** means the inventory has not loaded; open Manage series to inspect it.

Expand the row-placement count to see matching screens and enabled configured rows, including category/tag matches and hand-picked selections. These are eligible placements: row audience restrictions and content access still apply. Personalized rows, automatic browsing, and the Home hero are not included in this count.

**Preview playback** opens the movie inside admin with temporary authorized playback. For a series, **Preview first ready episode** uses season/episode order. This is an admin preview; verify separately with an ordinary viewer account when checking subscription or visibility restrictions. No readiness or preview action publishes content.

### Reviewing provider deliveries

Open **Partners → Submission review** and select a submitted delivery. The review workspace brings together video, artwork, supplied metadata, rights information, and the publication destination. **Open review previews** loads private links for 15 minutes; use Reload previews if they expire. Field checks confirm completed uploads and required information, not playback quality or legal authorization.

**Request changes** requires a note. The provider sees that note on the delivery, can revise it, and must send it for review again. **Approve delivery** leaves the content unpublished. For an approved delivery, inspect the publication plan and explicitly confirm **Publish to catalog**. Episodes require their parent series to be published first; trailers require a provider-owned movie or series destination.

Publishing may make the title appear in existing matching rows immediately. Review curation and viewer access before publishing. Publication currently uses free access; territory/date restrictions and automatic transcoding are not implemented. Optional files remain delivery attachments unless they are the standalone trailer being attached.

### Simple channel program guide

Open **Live TV → Channels → Edit → Program guide**. Save a new channel before connecting its schedule.

1. Paste the provider’s XMLTV link and select **Load guide**, or upload an `.xml` file.
2. Select the matching channel in the dropdown. Peep suggests an exact name/ID match or remembers the saved choice; confirm it.
3. Select **Save guide**. Only this Peep channel is updated.

FARRIS dev refreshes saved URL feeds every six hours. Uploaded files need a fresh upload when coverage runs out. The editor shows schedule coverage and warns when it has expired or a refresh failed. XMLTV times include the source timezone; times without an offset are interpreted as UTC. Invalid or missing program times are skipped.

Imports replace overlapping schedule entries and save their source atomically. Empty or failed updates retain the last good schedule. Files are limited to 25 MB and fetched/decompressed feeds to 32 MB; ask a provider for a smaller channel feed if needed. This does not create schedule data for channels whose provider has none.

Deployment scripts: `db/epg_channel_setup.sql` and `db/epg_scheduler.sql`. The scheduler script is explicitly configured for FARRIS dev. The refresh endpoint validates either an admin session or its dedicated Vault-backed scheduler token; the fetch endpoint requires an admin session. Production was not changed.

### Search metadata

Search uses each title’s **title, category, tags and description**, managed in Content → Movies / Series. Exact titles rank first, followed by title prefixes/partial matches, category/tag matches, then description matches. Multiple search words must all occur somewhere in those fields. Case, accents and punctuation are normalized; this does not provide typo correction.

Apple TV search includes All / Movies / Series filters, result counts, and genre/tag shortcuts from the available catalog. Existing content access rules still apply. Add relevant comma-separated tags to make a title discoverable under multiple genres without changing its primary category. Web uses the same relevance rules and retains its existing content-type filters.

### Continue Watching on Apple TV

Configure a row with the Continue Watching type in Screens & rows to set its title, position, and visibility. The row only appears when the account has resumable movies or episodes. Titles past 90% completion are excluded. Hold Select on a title to resume or remove it. Removal asks for confirmation and clears that title’s saved resume position across the account; watching it again adds it back. Viewer profiles currently share this account history.

### Channel checker

The admin channel checker calls the admin-only `check-channels` Edge Function. It checks the linked live feed first, then the direct HLS URL or Cloudflare Stream ID. Results describe playlist reachability from the server; they do not guarantee segment playback, audio, or availability in every region. Unavailable results do not delete or disable a channel. Failed checker requests leave channels untested.

### Two-screen Multiview layout

Two-screen packages on Apple TV use a fixed edge-to-edge side-by-side layout. Swipe up for app controls; Play/Pause opens the focused tile’s channel controls. Both complete widescreen pictures are centered side by side on a full-screen black canvas, with space above and below instead of cropping. Four-screen packages retain their 2 × 2 layout.

### Delivery queue

Provider deliveries now supports status filters with counts and search by title, provider, or content type (admins can also search submitter email). Each entry states the next step for the current role. Changes-needed entries show the review note. Open an entry to continue its existing workflow; approval and publication remain separate actions. Trash and restoring deleted drafts remain available outside the review-only queue.

### Apple TV account management

Settings → Manage account opens a QR linking directly to the web `/account/delete` route. Admin Resources preview links to the same route; it operates on the signed-in viewer and requires password plus typed confirmation. This is separate from the administrator’s user-deletion tool. Paid subscriptions must be cancelled before viewer self-deletion. Production availability requires deploying the site and `delete-account` endpoint and configuring the TV’s HTTPS destination.

### Inspect a channel stream

Open **Live TV → Channels → Edit → Stream inspector**, then choose **Inspect now**. **Monitor while open** repeats the check every 15 seconds; closing the editor stops monitoring.

- **General:** sample status and observed start signals.
- **Input:** the saved HLS playback source being inspected.
- **Output:** advertised bandwidth, frame rate, resolution and codecs.
- **PMT & tracks:** actual PIDs, codecs and declared audio language decoded from a small MPEG-TS sample, when available.
- **Ad signals:** HLS cue/date-range messages and sampled SCTE-35 splice-insert starts, durations, ends and cancellations.

This is read-only playback inspection, not an original SRT/RTMP ingest probe. Encrypted, fragmented MP4 and byte-range segments are not decoded for PMT. A missing result means **not observed in the sample**, not necessarily absent. Bitrate values are advertised, not measured. SCTE-35 time-signal segmentation descriptors are not decoded yet.

Signal history lasts only while the editor is open, up to 500 entries. Polling can miss events, and playlist/in-band messages may describe the same break, so the counter is not a guaranteed unique-break total. Inspection does not enable ad insertion or publish changes.

The **Ad signals → Break timeline** view pairs related start/end messages. It shows local start time, signalled duration, calculated expected finish, confirmed finish and status. Missing clock times stay “Not supplied”; in-band splice timestamps are shown separately as stream PTS seconds and are not mapped to wall-clock time. Updated signals refresh durations without changing when they were first observed. An expected finish passing does not confirm that programming resumed. This remains a sampled, session-only history, not a full-day schedule or always-on recorder.

The inspector now samples the highest-bandwidth rendition. For complete clear MPEG-TS segments up to 16 MiB, it calculates total and per-PID bitrate using TS packet bytes divided by the playlist’s segment duration (including TS overhead). The table labels these as measured segment averages. Incomplete, oversized, encrypted or unsupported samples do not receive a measured rate; an advertised total may be shown as an explicitly labelled fallback. This measures playback media, not origin ingest or network download speed.
