# Live feeds: how a channel's video reaches viewers

There are three ways a live channel can arrive. Pick by what the provider gives you.

| Provider gives you | What to do in admin | Relay (Pi) needed? | Cloudflare cost |
|---|---|---|---|
| An **HLS link** (`.m3u8`) | Live TV → Channels & schedules → paste it into the channel's **Source** | No | None |
| **SRT, and they push** (they are the *caller*) | Live TV → Feeds → **Add Feed** → *Provider pushes to Cloudflare* → **Create Cloudflare Input** → **Push details** → send those to the provider | No | Per minute watched (≈ $1 / 1,000) |
| **SRT, and we must pull** (they are the *listener*) | Live TV → Feeds → **Add Feed** → *We pull it with the relay* → fill in their host, port, mode and passphrase → **Create Cloudflare Input** → **Start** | Yes | Per minute watched (≈ $1 / 1,000) |

Ask every SRT provider to push first. It removes the relay, a public address and
router setup from the picture entirely.

## Push flow, step by step

1. **Feeds → Add Feed.** Name it, choose *Provider pushes to Cloudflare*, save.
2. **Create Cloudflare Input.** This creates a live input on Cloudflare Stream with
   recording **off** (recording a 24/7 channel would cost ≈ $215/month per channel
   for nothing).
3. **Push details.** Admin fetches the SRT address, stream ID and passphrase (and
   an RTMPS alternative) from Cloudflare on demand and shows them with a
   *Copy for provider* button. Nothing secret is stored in Peep's database; the
   Cloudflare live input is the source of truth.
4. **Send them to the provider.** When they connect, **Refresh Status** shows
   LIVE and the feed's playback link starts working.
5. **Channels & schedules → the channel → Source → choose the feed.** Add
   artwork, category and guide data, set it active. Viewers can now watch.

## What it costs

Cloudflare bills ≈ $1 per 1,000 minutes **watched**, so a channel nobody is
watching costs nothing to leave running. One 24/7 channel with an average of
10 viewers at any moment is ≈ 430,000 minutes a month, ≈ $430. The provider's
licence fee is separate and comes from your agreement with them.

## Prerequisites on a Supabase project

Edge function secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` (a token
with *Stream: Edit* on the account), and the deployed `cf-live-input` and
`save-feed` functions. The pull road additionally needs `RELAY_URL` and
`RELAY_TOKEN` plus the `relay-control` function and a reachable relay.
