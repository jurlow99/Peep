# Ad System

## Overview

Peep serves video ads using the **VAST standard** via the **Google IMA SDK**. Ads are pre-rolls — they play before the video starts.

---

## How It Works

1. User opens a video → `runAd()` fires
2. **Frequency check** — if an ad played in the last 30 minutes (stored in `sessionStorage`), skip
3. **SDK check** — waits up to 3 seconds for `window.google.ima` to load. If blocked (ad blocker), exits silently and video plays normally
4. **Tag selection** — picks the best matching VAST tag from the database in priority order:
   - Exact content ID match
   - Content type match (movie or episode)
   - Global (applies to all content)
5. **Ad plays** — IMA renders the ad overlay, content video pauses
6. **Content resumes** — ad ends, is skipped, or errors → overlay hides, video plays
7. **Event logged** — impression, complete, skip, or error written to `ad_impressions`

---

## Managing Ads

**CMS → Ads tab** — add, edit, activate/deactivate, delete VAST tags.

Each tag has:
- **Name** — internal label
- **Tag URL** — VAST XML endpoint from your ad server
- **Ad Type** — pre-roll, mid-roll, post-roll
- **Scope** — global, movie, episode, show, podcast episode
- **Content ID** — optional, for targeting a specific piece of content
- **Active** — toggle on/off without deleting

---

## Ad Performance Dashboard

**CMS → Reports → Ads** — last 30 days:

| Metric | What it means |
|---|---|
| Impressions | How many times an ad started playing |
| Unique Viewers | Distinct users who saw at least one ad |
| Skips | How many viewers skipped |
| Completion Rate | % who watched the full ad. 70%+ is good. |
| Fill Rate | How often the ad server had an ad ready. If this drops, the tag may be broken or inventory exhausted. |

---

## Ad Types

| Type | Status |
|---|---|
| Pre-roll | Live |
| Mid-roll | In DB schema, not yet wired into player |
| Post-roll | In DB schema, not yet wired into player |

---

## Ad Blocker Note

The IMA SDK loads from `imasdk.googleapis.com` — most ad blockers block this. Viewers with ad blockers will never see ads. The video plays normally. This is expected behavior.

---

## Scaling Ad Load (when ready)

Industry standard (Hulu/Peacock model):
- Pre-roll on every video
- Mid-rolls every 12–15 minutes for long-form content, 1–2 ads per break
- Total ad load: 4–5 minutes per hour max
- Videos under 20 minutes: pre-roll only, no mid-roll
